// §18.1의 메시지 프로토콜과 §18.9의 취소. 진짜 워커는 node 테스트에서 띄우지 않는다 —
// 대신 같은 계약의 가짜를 주입하고, 워커 파일이 DOM·ui를 건드리지 않는지는 정적으로 본다.
import { test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDxfClient, importDxf, traceInWorker } from '../src/io/dxf/client.js';

class FakeWorker {
  constructor() { this.posted = []; this.terminated = 0; this.onmessage = null; this.onerror = null; }
  postMessage(msg, transfer) { this.posted.push({ msg, transfer }); }
  terminate() { this.terminated++; }
  emit(data) { this.onmessage?.({ data }); }
}
const setup = () => { const w = new FakeWorker(); return { w, client: createDxfClient({ workerFactory: () => w }) }; };

test('parse는 ArrayBuffer를 transferable로 넘기고 summary를 돌려준다', async () => {
  const { w, client } = setup();
  const buf = new ArrayBuffer(8);
  const p = client.parse(buf, { fileName: '평면도.dxf' });
  expect(w.posted[0].msg).toEqual({ type: 'parse', buf, fileName: '평면도.dxf' });
  expect(w.posted[0].transfer).toEqual([buf]);
  w.emit({ type: 'parsed', summary: { ver: 'AC1032', checked: ['WAL'] } });
  await expect(p).resolves.toEqual({ ver: 'AC1032', checked: ['WAL'] });
  expect(client.alive()).toBe(true);
});

test('진행률은 호출자에게 그대로 가고 요청을 끝내지 않는다', async () => {
  const { w, client } = setup();
  const onProgress = vi.fn();
  const p = client.parse(new ArrayBuffer(4), { onProgress });
  w.emit({ type: 'progress', phase: 'parse', pct: 0.5 });
  w.emit({ type: 'progress', phase: 'explode', pct: 0.2 });
  expect(onProgress).toHaveBeenCalledTimes(2);
  expect(onProgress.mock.calls[0][0]).toEqual({ type: 'progress', phase: 'parse', pct: 0.5 });
  w.emit({ type: 'parsed', summary: {} });
  await expect(p).resolves.toEqual({});
});

test('오류는 code를 단 Error로 거절된다', async () => {
  const { w, client } = setup();
  const p = client.parse(new ArrayBuffer(4));
  w.emit({ type: 'error', code: 'binary', message: 'binary' });
  await expect(p).rejects.toMatchObject({ code: 'binary' });
  // 워커가 통째로 죽으면(메모리 부족) oom으로 읽는다.
  const b = setup();
  const q = b.client.parse(new ArrayBuffer(4));
  b.w.onerror({ message: 'out of memory' });
  await expect(q).rejects.toMatchObject({ code: 'oom' });
});

test('extract는 재파싱 없이 다시 돌고 결과를 그대로 준다', async () => {
  const { w, client } = setup();
  const p1 = client.parse(new ArrayBuffer(4));
  w.emit({ type: 'parsed', summary: { checked: ['WAL'] } });
  await p1;
  const p2 = client.extract({ layers: ['WAL', 'FIN'], thickness: 200, height: 3500 });
  expect(w.posted[1].msg).toEqual({ type: 'extract', opts: { layers: ['WAL', 'FIN'], thickness: 200, height: 3500 } });
  w.emit({ type: 'extracted', project: { version: 1 }, stats: { walls: 213 }, trace: null });
  await expect(p2).resolves.toMatchObject({ project: { version: 1 }, stats: { walls: 213 } });
  expect(w.posted).toHaveLength(2);          // parse는 한 번뿐이다
});

test('cancel은 terminate 한 줄이고 진행 중인 요청을 거절한다', async () => {
  const { w, client } = setup();
  const p = client.parse(new ArrayBuffer(4));
  client.cancel();
  expect(w.terminated).toBe(1);
  expect(client.alive()).toBe(false);
  await expect(p).rejects.toMatchObject({ code: 'cancelled' });
  client.cancel();                            // 두 번 불러도 안전하다
  expect(w.terminated).toBe(1);
});

test('importDxf는 parse → extract 순서로 부르고 { project, report }를 낸다', async () => {
  const w = new FakeWorker();
  const file = { name: '평면도.dxf', arrayBuffer: async () => new ArrayBuffer(16) };
  const onProgress = vi.fn();
  const done = importDxf(file, { workerFactory: () => w, onProgress, height: 3500 });
  await vi.waitFor(() => expect(w.posted).toHaveLength(1));
  expect(w.posted[0].msg.fileName).toBe('평면도.dxf');
  w.emit({ type: 'parsed', summary: { checked: ['WAL'], ver: 'AC1032' } });
  await vi.waitFor(() => expect(w.posted).toHaveLength(2));
  expect(w.posted[1].msg.opts).toEqual({ layers: ['WAL'], thickness: 200, height: 3500 });
  w.emit({ type: 'extracted', project: { version: 1 }, stats: { walls: 8 }, trace: null });
  const out = await done;
  expect(out.project).toEqual({ version: 1 });
  expect(out.report.summary.ver).toBe('AC1032');
  expect(out.report.stats.walls).toBe(8);
  expect(w.terminated).toBe(1);               // 끝나면 워커를 버린다(§18.9)
});

// 사전 검토 C-5: 앞 요청이 도는 중에 온 요청은 **거절하지 않고 큐에 둔다**(마지막이 이긴다).
// 거절만 하면 대화상자의 마지막 체크 상태 재추출이 조용히 사라진다.
test('앞 요청이 도는 중에 온 요청은 큐에 들어가고 마지막 것만 나간다', async () => {
  const { w, client } = setup();
  const p1 = client.parse(new ArrayBuffer(4));
  w.emit({ type: 'parsed', summary: {} });
  await p1;
  const a = client.extract({ layers: ['WAL'] });
  const b = client.extract({ layers: ['WAL', 'FIN'] });
  const superseded = expect(b).rejects.toMatchObject({ code: 'superseded' });   // c가 b를 밀어낸다
  const c = client.extract({ layers: ['기존'] });
  const sentSoFar = () => w.posted.filter(p => p.msg.type === 'extract');
  expect(sentSoFar()).toHaveLength(1);       // 워커에 가 있는 것은 여전히 하나뿐이다
  await superseded;
  w.emit({ type: 'extracted', project: {}, stats: {}, trace: null });
  await expect(a).resolves.toBeTruthy();
  const sent = sentSoFar();
  expect(sent).toHaveLength(2);              // 응답이 오자마자 큐에 남은 **마지막** 요청이 나간다
  expect(sent[1].msg.opts).toEqual({ layers: ['기존'] });
  w.emit({ type: 'extracted', project: {}, stats: {}, trace: null });
  await expect(c).resolves.toBeTruthy();
});

// Task 10 리뷰 F1: 재파싱이 실패하면 워커는 **앞 도면을 잊어야 한다**. node에는 self가 없으므로
// 가짜 self를 심은 뒤에 워커 파일을 import한다(모듈 최상위에서 self.onmessage에 대입한다).
test('재파싱이 실패하면 워커가 앞 도면을 잊고 뒤따르는 extract가 not-dxf로 떨어진다', async () => {
  const posts = [];
  const had = 'self' in globalThis, prev = globalThis.self;
  globalThis.self = { postMessage: (m, transfer) => posts.push({ m, transfer }), onmessage: null };
  try {
    await import('../src/io/dxf/worker.js');
    const handle = data => { posts.length = 0; globalThis.self.onmessage({ data }); return posts.at(-1).m; };
    const dxf = readFileSync(fileURLToPath(new URL('./fixtures/plan-1f-corner.dxf', import.meta.url)));
    const parsed = handle({ type: 'parse', buf: dxf, fileName: 'A.dxf' });
    expect(parsed.type).toBe('parsed');
    const opts = { layers: parsed.summary.checked, trace: false };
    // 앞 도면으로는 추출이 실제로 된다 — 아래의 not-dxf가 "원래 안 되는 것"이 아님을 못 박는다.
    expect(handle({ type: 'extract', opts }).type).toBe('extracted');
    const dwg = new Uint8Array(32);                       // 'AC1032' + 0x00 = DWG 시그니처
    [...'AC1032'].forEach((c, i) => { dwg[i] = c.charCodeAt(0); });
    expect(handle({ type: 'parse', buf: dwg, fileName: 'B.dwg' })).toMatchObject({ type: 'error', code: 'dwg' });
    // 핵심: 실패한 뒤의 extract는 **앞 도면의 프로젝트가 아니라** 오류로 답한다.
    expect(handle({ type: 'extract', opts })).toMatchObject({ type: 'error', code: 'not-dxf' });
  } finally {
    if (had) globalThis.self = prev; else delete globalThis.self;
  }
});

// Task 10 리뷰 F2: 워커가 죽으면 그 사실을 기억한다 — 안 그러면 다음 재추출이 "벽 찾는 중"에서 영원히 멈춘다.
test('워커가 죽으면 대기 중 요청과 큐가 함께 거절되고 죽은 워커를 버린다', async () => {
  const { w, client } = setup();
  const p = client.parse(new ArrayBuffer(4));
  w.emit({ type: 'parsed', summary: {} });
  await p;
  const running = client.extract({ layers: ['WAL'] });        // 워커에 가 있는 것
  const waiting = client.extract({ layers: ['WAL', 'FIN'] }); // 큐에 남은 것
  w.onerror({ message: 'out of memory' });
  await expect(running).rejects.toMatchObject({ code: 'oom' });
  await expect(waiting).rejects.toMatchObject({ code: 'oom' });   // 영영 settle되지 않으면 안 된다
  expect(client.alive()).toBe(false);
  expect(w.terminated).toBe(1);
});

// Task 10 리뷰 F3: postMessage가 던져도(detach된 ArrayBuffer 등) pending이 남아 교착되면 안 된다.
test('postMessage가 던지면 그 요청만 거절되고 다음 요청은 그대로 나간다', async () => {
  const { w, client } = setup();
  let boom = false;
  const real = w.postMessage.bind(w);
  w.postMessage = (msg, transfer) => {
    if (boom) { boom = false; throw new Error('ArrayBuffer at index 0 is already detached'); }
    real(msg, transfer);
  };
  const buf = new ArrayBuffer(4);
  const p1 = client.parse(buf);
  boom = true;
  const p2 = client.parse(buf);                 // 큐에 들어갔다가 onmessage 안에서 나가며 던진다
  w.emit({ type: 'parsed', summary: {} });
  await expect(p1).resolves.toEqual({});
  await expect(p2).rejects.toMatchObject({ code: 'oom' });   // code 없는 DOMException이면 안 된다
  const p3 = client.extract({ layers: ['WAL'] });            // 교착되지 않는다
  expect(w.posted.at(-1).msg).toEqual({ type: 'extract', opts: { layers: ['WAL'] } });
  w.emit({ type: 'extracted', project: {}, stats: {}, trace: null });
  await expect(p3).resolves.toBeTruthy();
});

// 계획 14 Task C(2026-10-13 · 사전 검토 I-5): [가져오기] 때 메인이 트레이스 선분을 **일회용 래스터 워커**로 보낸다.
// **복사**다(리뷰 I-2): transfer면 워커가 받은 뒤 죽을 때(배포 뒤 옛 탭의 청크 404 · CSP · 충돌) 메인 폴백에 그릴 선분이 없었다.
test('traceInWorker는 선분을 복사로 보내고(transfer 없음), 답 하나를 돌려준 뒤 그 워커를 끝낸다', async () => {
  const w = new FakeWorker();
  const segs = new Float32Array([0, 0, 100, 0]), box = [0, 0, 100, 0];
  const p = traceInWorker(segs, box, { workerFactory: () => w });
  expect(w.posted).toHaveLength(1);
  expect(w.posted[0].msg).toEqual({ type: 'trace', segs, box });
  expect(w.posted[0].transfer ?? []).toEqual([]);
  expect(w.terminated).toBe(0);
  const reply = { type: 'traced', bg: { src: 'data:image/png;base64,AA' }, fallback: false };
  w.emit(reply);
  await expect(p).resolves.toBe(reply);
  expect(w.terminated).toBe(1);                    // 일회용 — 워커가 스스로 닫히지만(close) 메인도 끝낸다
});

test('traceInWorker: 워커가 죽거나 · messageerror · postMessage가 던지면 code를 단 오류로 거절되고 워커를 끝낸다', async () => {
  const w = new FakeWorker();
  const p = traceInWorker(new Float32Array(4), [0, 0, 1, 1], { workerFactory: () => w });
  w.onerror({ type: 'error' });                    // 모듈 로드 실패의 error는 message 없는 평범한 Event다
  await expect(p).rejects.toMatchObject({ code: 'oom', message: 'error' });   // "[object Event]"가 아니다(리뷰 m-4)
  expect(w.terminated).toBe(1);
  const m = new FakeWorker();
  const pm = traceInWorker(new Float32Array(4), [0, 0, 1, 1], { workerFactory: () => m });
  m.onmessageerror({ type: 'messageerror' });
  await expect(pm).rejects.toMatchObject({ code: 'oom', message: 'messageerror' });
  expect(m.terminated).toBe(1);
  const v = new FakeWorker();
  v.postMessage = () => { throw new Error('detached'); };
  await expect(traceInWorker(new Float32Array(4), [0, 0, 1, 1], { workerFactory: () => v })).rejects.toMatchObject({ code: 'oom' });
  expect(v.terminated).toBe(1);
});

// 리뷰 I-1: 답하지 않는 래스터 워커(convertToBlob이 끝나지 않음 · 처리되지 않은 거절 · 청크 요청이 멈춤)가 가져오기를 영원히 잡으면 안 된다.
test('traceInWorker: 제한 시간(10 s) 안에 답이 없으면 워커를 끝내고 code oom으로 거절한다 — 늦은 답은 무시', async () => {
  vi.useFakeTimers();
  try {
    const w = new FakeWorker();
    let settled = null;
    const p = traceInWorker(new Float32Array(4), [0, 0, 1, 1], { workerFactory: () => w });
    p.then(() => { settled = 'ok'; }, e => { settled = e; });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(null);
    expect(w.terminated).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toMatchObject({ code: 'oom', message: 'trace timeout' });
    expect(w.terminated).toBe(1);
    w.emit({ type: 'traced', bg: null, fallback: false });   // 늦은 답 — 이미 거절됐다
    expect(settled).toMatchObject({ code: 'oom' });
    // 답이 오면 타이머는 풀린다(나중에 terminate·거절이 다시 일어나지 않는다).
    const u = new FakeWorker();
    const q = traceInWorker(new Float32Array(4), [0, 0, 1, 1], { workerFactory: () => u, timeoutMs: 50 });
    u.emit({ type: 'traced', bg: null, fallback: true });
    await expect(q).resolves.toMatchObject({ fallback: true });
    await vi.advanceTimersByTimeAsync(100);
    expect(u.terminated).toBe(1);
  } finally { vi.useRealTimers(); }
});

// 워커 import 사슬을 따라가며 읽는다(정적 import만 — 워커에는 동적 import가 없다).
function workerChain(entry) {
  const seen = new Map();
  const walk = url => {
    if (seen.has(url.href)) return;
    const src = readFileSync(fileURLToPath(url), 'utf8');
    seen.set(url.href, src);
    for (const m of src.matchAll(/(?:import|export)\s[^;]*?from\s+['"](\.[^'"]+)['"]/g)) walk(new URL(m[1], url));
  };
  walk(new URL(`../src/io/dxf/${entry}`, import.meta.url));
  return seen;
}

// 전역 제약: 워커와 그 import 사슬은 DOM·ui를 건드리지 않는다.
// 2026-10-13 계획 14 Task C(사전 검토 I-5 · §18.6 개정): 허용 목록을 **일부러** 바꾼다 — 트레이스 래스터가 워커로 간다.
// 래스터는 DXF 워커가 아니라 **일회용 워커 traceWorker.js**가 한다: 오래 사는 DXF 워커가 GPU 2D 컨텍스트를 가지면 대화상자를 닫을 때의
// terminate가 GpuChannel::DestroyCommandBuffer를 기다리며 메인을 287~499 ms 막았다(첫 3D 프레임의 셰이더 링크 뒤에 줄을 선다 · 구현 실측 328·390·499 · 리뷰 재현 287~329).
// 그래서 `OffscreenCanvas`(워커 전역 · DOM이 아니다)는 traceWorker.js에만 허용하고, worker.js 사슬에는 여전히 없어야 한다.
// 대신 검사를 worker.js 한 파일에서 **두 워커의 import 사슬 전체**로 넓혔다: 어느 파일도 `document`·`window.`를 쓰지 않는다
// (trace.js의 DOM 기본 캔버스는 ui/dxfDialog.js로 옮겼다).
test('두 워커(worker.js · traceWorker.js)와 그 import 사슬은 DOM·ui를 모르고 Worker를 최상위에서 만들지 않는다', () => {
  const dxf = workerChain('worker.js'), raster = workerChain('traceWorker.js');
  expect(dxf.size).toBeGreaterThan(30);                                                 // 사슬을 실제로 따라갔다
  expect([...raster.keys()].some(k => k.endsWith('/src/io/dxf/trace.js'))).toBe(true);
  for (const [href, text] of [...dxf, ...raster]) {
    expect(text, href).not.toMatch(/\bdocument\b/);
    expect(text, href).not.toMatch(/\bwindow\s*\./);
    expect(text, href).not.toMatch(/from\s+['"][^'"]*\/(ui|view2d|view3d|app)\//);
  }
  for (const [href, text] of dxf) expect(text, href).not.toMatch(/OffscreenCanvas/);   // DXF 워커는 GPU 컨텍스트를 갖지 않는다
  expect([...raster.values()][0]).toMatch(/OffscreenCanvas/);                           // 허용: 일회용 래스터 워커만
  const client = readFileSync(fileURLToPath(new URL('../src/io/dxf/client.js', import.meta.url)), 'utf8');
  expect(client).toMatch(/new Worker\(new URL\('\.\/worker\.js', import\.meta\.url\), \{ type: 'module' \}\)/);
  expect(client).toMatch(/new Worker\(new URL\('\.\/traceWorker\.js', import\.meta\.url\), \{ type: 'module' \}\)/);
  // 모듈 최상위에서 만들면 node 테스트가 import만으로 죽는다 — 반드시 함수 안이다(두 줄 모두).
  const lines = client.split('\n').filter(l => l.includes('new Worker('));
  expect(lines).toHaveLength(2);
  for (const l of lines) expect(l).toMatch(/=>/);
});


// 최종 리뷰 M-1: 죽은 워커 A의 늦은 onerror 한 방이 **살아 있는 새 워커 B**를 terminate하면 안 된다.
test('버린 워커의 늦은 onerror는 새 워커를 건드리지 않는다', async () => {
  const made = [];
  const client = createDxfClient({ workerFactory: () => { const w = new FakeWorker(); made.push(w); return w; } });
  const p = client.parse(new ArrayBuffer(4));
  made[0].onerror({ message: 'out of memory' });                 // A가 죽는다
  await expect(p).rejects.toMatchObject({ code: 'oom' });
  expect(client.alive()).toBe(false);
  const q = client.parse(new ArrayBuffer(4));                    // 새 워커 B가 선다
  expect(made).toHaveLength(2);
  expect(client.alive()).toBe(true);
  made[0].onerror({ message: 'late' });                          // A의 늦은 한 방
  expect(client.alive()).toBe(true);                             // B는 살아 있다
  expect(made[1].terminated).toBe(0);
  made[1].emit({ type: 'parsed', summary: { ver: 'AC1032' } });
  await expect(q).resolves.toEqual({ ver: 'AC1032' });           // B의 요청이 그대로 끝난다
});