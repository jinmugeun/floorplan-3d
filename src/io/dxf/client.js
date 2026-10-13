// 메인 스레드에서 워커를 부리는 얇은 층(§18.1·§18.9). 워커에 가 있는 요청은 한 번에 하나이고,
// 그 사이에 온 요청은 **"마지막이 이긴다"로 큐에 하나만** 남으며(사전 검토 C-5), 진행률은
// 그대로 흘려보내고, **취소는 terminate() 한 줄**이다(워커 안에 취소 플래그를 두지 않는다).
import { DXF_PARAMS } from './params.js';

// 모듈 최상위에서 워커를 만들면 node 테스트가 import만으로 죽는다 — 반드시 함수 안이다.
// base가 './'라 이 상대 URL은 GitHub Pages 배포본에서도 그대로 맞는다.
export const defaultWorkerFactory = () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
export const defaultTraceWorkerFactory = () => new Worker(new URL('./traceWorker.js', import.meta.url), { type: 'module' });

// 트레이스 래스터(2026-10-13 · 계획 14 Task C · 사전 검토 I-5): extracted로 받은 선분을 **일회용** 래스터 워커로 보낸다.
// 답 하나 { type: 'traced', bg, fallback }를 받으면 곧바로 끝낸다 — 워커도 답하고 스스로 닫는다(traceWorker.js 머리).
// 큐(createDxfClient)를 거치지 않는다: 이 워커는 이 요청 하나만 받는다. 오류 code는 'oom'(§18.6이 동결한 DXF_ERRORS의 폴백 칸).
// 선분은 **복사**로 보낸다(리뷰 I-2 — 사동 1.1 MB · 메인 0.2~1.2 ms): transfer면 워커가 받은 뒤 죽을 때(배포 뒤 옛 탭의 청크 404 · CSP ·
// 충돌 — error는 비동기라 postMessage 뒤에 온다) 메인 폴백에 그릴 선분이 남지 않았다.
// 제한 시간(리뷰 I-1): 답하지 않는 워커(convertToBlob이 끝나지 않음 · 처리되지 않은 거절 · 청크 요청이 멈춤)가 가져오기를 영원히 잡지 않게
// timeoutMs 뒤 그 워커를 끝내고 거절한다 — 부르는 쪽은 메인 폴백으로 간다. 대화상자를 닫아도 끝내지 않는다(다 굽고 스스로 닫혀야 GPU 해체가 싸다).
export function traceInWorker(segs, box, { workerFactory = defaultTraceWorkerFactory, timeoutMs = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    const w = workerFactory();
    let timer = 0;
    const end = (fn, v) => { clearTimeout(timer); try { w.terminate(); } catch { /* 이미 닫혔다 */ } fn(v); };
    // 모듈 로드 실패의 error는 message 없는 평범한 Event다 — type으로 남긴다("[object Event]"가 아니게 · 리뷰 m-4).
    const fail = e => Object.assign(new Error(String(e?.message ?? e?.type ?? e ?? 'trace')), { code: 'oom' });
    w.onmessage = ev => end(resolve, ev.data);
    w.onerror = w.onmessageerror = e => end(reject, fail(e));
    timer = setTimeout(() => end(reject, fail('trace timeout')), timeoutMs);
    try { w.postMessage({ type: 'trace', segs, box }); } catch (e) { end(reject, fail(e)); }
  });
}

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
    // roles(2026-10-12 · 계획 12 Task 9): 역할표(형식은 roles.js) — 있을 때만 메시지에 싣는다. 앱 화면은 아직 넘기지 않는다(도구·다음 계획의 중계 서버가 쓴다).
    parse: (buf, opts = {}) => send({ type: 'parse', buf, fileName: opts.fileName ?? '', ...(opts.roles ? { roles: opts.roles } : {}) }, [buf], opts).then(m => m.summary),
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
export async function importDxf(file, { workerFactory, onProgress, fileName, roles, ...extractOpts } = {}) {
  const client = createDxfClient({ workerFactory });
  try {
    const summary = await client.parse(await file.arrayBuffer(), { fileName: fileName ?? file.name ?? '', onProgress, roles });
    const out = await client.extract({ layers: summary.checked, thickness: DXF_PARAMS.thickness, ...extractOpts }, { onProgress });
    return { project: out.project, report: { summary, stats: out.stats, trace: out.trace } };
  } finally {
    client.cancel();
  }
}
