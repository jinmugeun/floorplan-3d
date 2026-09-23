// §18.1의 메시지 프로토콜과 §18.9의 취소. 진짜 워커는 node 테스트에서 띄우지 않는다 —
// 대신 같은 계약의 가짜를 주입하고, 워커 파일이 DOM·ui를 건드리지 않는지는 정적으로 본다.
import { test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDxfClient, importDxf } from '../src/io/dxf/client.js';

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

// 전역 제약: 워커와 그 import 사슬은 DOM·ui를 건드리지 않는다.
test('worker.js는 DOM·ui를 import하지 않고 Worker를 최상위에서 만들지 않는다', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/io/dxf/worker.js', import.meta.url)), 'utf8');
  expect(src).not.toMatch(/from\s+['"][^'"]*\/ui\//);
  expect(src).not.toMatch(/\bdocument\b/);
  expect(src).not.toMatch(/\.\/trace\.js/);   // 트레이스 래스터는 메인 스레드가 한다
  const client = readFileSync(fileURLToPath(new URL('../src/io/dxf/client.js', import.meta.url)), 'utf8');
  expect(client).toMatch(/new Worker\(new URL\('\.\/worker\.js', import\.meta\.url\), \{ type: 'module' \}\)/);
  // 모듈 최상위에서 만들면 node 테스트가 import만으로 죽는다 — 반드시 함수 안이다.
  expect(client.split('\n').find(l => l.includes('new Worker('))).toMatch(/=>/);
});
