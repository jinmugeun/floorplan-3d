// 메인 스레드에서 워커를 부리는 얇은 층(§18.1·§18.9). 워커에 가 있는 요청은 한 번에 하나이고,
// 그 사이에 온 요청은 **"마지막이 이긴다"로 큐에 하나만** 남으며(사전 검토 C-5), 진행률은
// 그대로 흘려보내고, **취소는 terminate() 한 줄**이다(워커 안에 취소 플래그를 두지 않는다).
import { DXF_PARAMS } from './params.js';

// 모듈 최상위에서 워커를 만들면 node 테스트가 import만으로 죽는다 — 반드시 함수 안이다.
// base가 './'라 이 상대 URL은 GitHub Pages 배포본에서도 그대로 맞는다.
export const defaultWorkerFactory = () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

export function createDxfClient({ workerFactory = defaultWorkerFactory } = {}) {
  let worker = null, pending = null, queued = null, onProgress = () => {};
  const fail = (code, message) => Object.assign(new Error(message ?? code), { code });
  const settle = fn => { const p = pending; pending = null; if (p) fn(p); };
  // **마지막 요청이 이긴다**(사전 검토 C-5). 워커는 한 번에 하나를 처리하므로 진행 중인 요청이
  // 있으면 새 요청을 큐에 두고, 응답이 오면 **가장 최근 것 하나만** 보낸다. 앞의 것은 'busy'로
  // 거절하지 않는다 — 대화상자는 체크가 바뀔 때마다 재추출을 걸고 진행 중인 것을 취소하지 않아서,
  // 거절만 하면 마지막 체크 상태의 재추출이 **조용히 사라진다**.
  const pump = () => {
    if (pending || !queued) return;
    const q = queued; queued = null;
    onProgress = q.opts?.onProgress ?? (() => {});
    pending = { resolve: q.resolve, reject: q.reject };
    // postMessage는 던질 수 있다(이미 transfer돼 detach된 ArrayBuffer 등 — 호출자 버그다).
    // 감싸지 않으면 pending이 세워진 채 영원히 남아 **이후 모든 요청이 큐에서 나가지 못하고**,
    // onmessage 안에서 던진 경우에는 그 프로미스가 settle조차 되지 않는다(Task 10 리뷰 F3).
    // 코드는 'oom': §18.6이 동결한 DXF_ERRORS에 일반 코드 칸이 없고, 대화상자의 폴백
    // (DXF_ERRORS[code] ?? DXF_ERRORS.oom)이 어떤 새 코드도 결국 같은 문장으로 옮긴다.
    try { ensure().postMessage(q.msg, q.transfer ?? []); }
    catch (e) { settle(p => p.reject(fail('oom', String(e?.message ?? e)))); pump(); }
  };
  const ensure = () => {
    if (worker) return worker;
    worker = workerFactory();
    const w = worker;   // 이 핸들러 짝의 워커(아래 onerror가 늦게 와도 남의 워커를 죽이지 않게).
    worker.onmessage = ev => {
      const m = ev.data ?? {};
      if (m.type === 'progress') { onProgress(m); return; }
      if (m.type === 'error') settle(p => p.reject(fail(m.code ?? 'oom', m.message)));
      else settle(p => p.resolve(m));
      pump();
    };
    // 워커가 통째로 죽으면(대개 OOM) 클라이언트가 **그 사실을 기억한다**(Task 10 리뷰 F2).
    // 죽은 참조를 들고 있으면 다음 요청의 postMessage가 조용히 버려져 진행 막대가 "벽 찾는 중"에서
    // 영원히 멈춘다 — 참조를 버려 alive()를 false로 만들고, 큐에 남은 요청도 같은 오류로 거절한다.
    // (그 뒤 새 요청은 상태 없는 새 워커를 만들고, extract라면 not-dxf로 정직하게 실패한다.)
    worker.onerror = e => {
      // 버린 워커의 늦은 onerror 한 방이 **살아 있는 새 워커**를 terminate하면 안 된다(최종 리뷰 M-1).
      if (worker !== w) return;
      const err = fail('oom', e?.message);
      const dead = worker; worker = null;
      try { dead?.terminate(); } catch { /* 이미 죽었으면 그만이다 */ }
      const q = queued; queued = null;
      settle(p => p.reject(err));
      q?.reject(err);
    };
    return worker;
  };
  const send = (msg, transfer, opts) => new Promise((resolve, reject) => {
    if (queued) queued.reject(fail('superseded', 'superseded'));   // 밀려난 요청은 조용히 사라지지 않는다
    queued = { msg, transfer, opts, resolve, reject };
    pump();
  });
  return {
    parse: (buf, opts = {}) => send({ type: 'parse', buf, fileName: opts.fileName ?? '' }, [buf], opts).then(m => m.summary),
    extract: (extractOpts = {}, opts = {}) => send({ type: 'extract', opts: extractOpts }, [], opts),
    cancel() {
      if (!worker) return;
      worker.terminate();
      worker = null;
      if (queued) { queued.reject(fail('cancelled', 'cancelled')); queued = null; }
      settle(p => p.reject(fail('cancelled', 'cancelled')));
    },
    alive: () => !!worker,
  };
}

// 한 번에 끝내는 편의 경로(브라우저 프로브·통합 테스트). 대화상자는 재추출을 해야 하므로
// createDxfClient를 직접 들고 워커를 살려 둔다.
export async function importDxf(file, { workerFactory, onProgress, fileName, ...extractOpts } = {}) {
  const client = createDxfClient({ workerFactory });
  try {
    const summary = await client.parse(await file.arrayBuffer(), { fileName: fileName ?? file.name ?? '', onProgress });
    const out = await client.extract({ layers: summary.checked, thickness: DXF_PARAMS.thickness, ...extractOpts }, { onProgress });
    return { project: out.project, report: { summary, stats: out.stats, trace: out.trace } };
  } finally {
    client.cancel();
  }
}
