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
    ensure().postMessage(q.msg, q.transfer ?? []);
  };
  const ensure = () => {
    if (worker) return worker;
    worker = workerFactory();
    worker.onmessage = ev => {
      const m = ev.data ?? {};
      if (m.type === 'progress') { onProgress(m); return; }
      if (m.type === 'error') settle(p => p.reject(fail(m.code ?? 'oom', m.message)));
      else settle(p => p.resolve(m));
      pump();
    };
    worker.onerror = e => settle(p => p.reject(fail('oom', e?.message)));
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
