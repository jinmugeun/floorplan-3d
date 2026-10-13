// 계획 14 Task C(2026-10-13 · 사전 검토 I-5): [가져오기] 때 메인이 트레이스 선분을 **일회용 래스터 워커**(traceWorker.js)로 보내면(복사 · 리뷰 I-2)
// 워커가 OffscreenCanvas로 그리고 convertToBlob + FileReaderSync로 dataURL을 만들어 답한 뒤 **스스로 닫힌다** — 메인 toDataURL 한 번
// (사동 143~308 ms)이 클릭을 막던 자리다. node에는 OffscreenCanvas·FileReaderSync가 없다 → 가짜를 전역에 꽂고 메시지를 직접 부른다.
import { test, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { traceBackground } from '../src/io/dxf/trace.js';

const posts = [];
let had = false, prev, closes = 0;
beforeAll(async () => {
  had = 'self' in globalThis; prev = globalThis.self;
  globalThis.self = { postMessage: (m, t) => posts.push({ m, t, closedBefore: closes }), close: () => { closes++; }, onmessage: null };
  await import('../src/io/dxf/traceWorker.js');
});
afterAll(() => { if (had) globalThis.self = prev; else delete globalThis.self; });
afterEach(() => { delete globalThis.OffscreenCanvas; delete globalThis.FileReaderSync; posts.length = 0; closes = 0; });

const BOX = [-3000, -2000, 3000, 2000];
const SEGS = () => new Float32Array([-3000, -2000, 3000, -2000, 0.5, -2000, 0.5, 2000, -3000, -2000, -2950, -2000]);
const URL_ = `data:image/png;base64,${'Q'.repeat(900)}`;

// 기록하는 2D 컨텍스트(메서드 호출 + 스타일 대입을 순서대로) — 메인 폴백의 스텁과 같은 기록 형식이다.
function recCtx(log) {
  return new Proxy({}, {
    get: (_t, k) => (...args) => { log.push([k, ...args]); },
    set: (_t, k, v) => { log.push(['set', k, v]); return true; },
  });
}
// 가짜 OffscreenCanvas: 1×1 탐침(2D 지원 확인)은 기록하지 않는다. convertToBlob의 옵션과 FileReaderSync가 받은 blob을 남긴다.
function install({ ctx2d = true, blobThrows = false } = {}) {
  const log = [], blobs = [], read = [];
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; this.probe = w === 1 && h === 1; if (!this.probe) log.push(['canvas', w, h]); }
    getContext(kind) { if (!ctx2d) return null; if (!this.probe) log.push(['getContext', kind]); return recCtx(this.probe ? [] : log); }
    async convertToBlob(opt) { if (blobThrows) throw new Error('encode failed'); blobs.push(opt); return { blob: true, w: this.width }; }
  };
  globalThis.FileReaderSync = class { readAsDataURL(b) { read.push(b); return URL_; } };
  return { log, blobs, read };
}
const send = data => globalThis.self.onmessage({ data });
const traced = async () => {
  for (let i = 0; i < 50; i++) { const p = posts.find(x => x.m.type === 'traced'); if (p) return p; await new Promise(r => setTimeout(r, 0)); }
  throw new Error('traced 응답이 없다');
};

test('OffscreenCanvas가 있으면 워커가 굽는다 — 메인 폴백과 같은 명령열 · 같은 배경 모양, 답은 배경만 · 스스로 닫힌다', async () => {
  const { log, blobs, read } = install();
  const segs = SEGS();
  send({ type: 'trace', segs, box: BOX });
  const { m, t, closedBefore } = await traced();
  expect(m.fallback).toBe(false);
  expect(blobs).toEqual([{ type: 'image/png' }]);
  expect(read).toEqual([{ blob: true, w: 2048 }]);
  // 메인 폴백(지금 경로)과 같은 입력 · 같은 그리기 명령열 · 같은 결과 객체(저장 형식 그대로의 dataURL)
  const main = [];
  const bg = traceBackground(SEGS(), BOX, { makeCanvas: (w, h) => { main.push(['canvas', w, h]); return { getContext: k => (main.push(['getContext', k]), recCtx(main)), toDataURL: () => URL_ }; } });
  expect(log).toEqual(main);
  expect(m.bg).toEqual(bg);
  expect(m.bg).toMatchObject({ src: URL_, width: 2048, height: 1365, offset: [-3000, -2000], opacity: 0.35, visible: true, locked: true });
  // 선분은 돌려주지 않는다(리뷰 I-2): 메인은 복사로 보냈으므로 자기 선분을 그대로 갖고 있다. 답에는 배경만.
  expect(Object.keys(m).sort()).toEqual(['bg', 'fallback', 'type']);
  expect(t ?? []).toEqual([]);
  expect(segs.length).toBe(12);
  // 답한 **뒤** 스스로 닫는다: GPU 컨텍스트 해체(DestroyCommandBuffer)가 GPU가 한가한 지금 끝나야, 가져온 직후 첫 3D 프레임의
  // 셰이더 링크 뒤에 줄을 서서 메인의 워커 종료 처리를 290~500 ms 막지 않는다(실측 · 보고서).
  expect(closedBefore).toBe(0);
  expect(closes).toBe(1);
});

test('OffscreenCanvas가 없으면 굽지 않고 메인 폴백을 요청한다(지금 경로)', async () => {
  send({ type: 'trace', segs: SEGS(), box: BOX });
  const { m, t } = await traced();
  expect(m).toEqual({ type: 'traced', bg: null, fallback: true });
  expect(t ?? []).toEqual([]);
  expect(closes).toBe(1);
});

test('2D 컨텍스트가 없거나 PNG 굽기가 던지면 메인 폴백이다(조용히 배경 없음이 되지 않는다)', async () => {
  install({ ctx2d: false });
  send({ type: 'trace', segs: SEGS(), box: BOX });
  expect((await traced()).m).toMatchObject({ bg: null, fallback: true });
  posts.length = 0;
  install({ blobThrows: true });
  send({ type: 'trace', segs: SEGS(), box: BOX });
  expect((await traced()).m).toMatchObject({ bg: null, fallback: true });
});

test('구웠는데 한도를 넘으면 null이고 폴백이 아니다(메인에서 다시 구워도 같은 크기다 — 배경 없음 안내로 간다)', async () => {
  install();
  globalThis.FileReaderSync = class { readAsDataURL() { return `data:image/png;base64,${'Q'.repeat(1_300_000)}`; } };
  send({ type: 'trace', segs: SEGS(), box: BOX });
  expect((await traced()).m).toMatchObject({ bg: null, fallback: false });
});
