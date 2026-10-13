// §18.6의 트레이스 배경(안 A): 원 도면을 PNG로 구워 기존 project.background에 넣는다.
// 저장 형식 무변경이고, 불투명도·표시·잠금 UI를 그대로 물려받는다.
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { traceBackground, traceBackgroundAsync, TRACE_MAX_BYTES, TRACE_COLOR } from '../src/io/dxf/trace.js';

// jsdom에도 캔버스가 없다(getContext → null · toDataURL → Not implemented). 그래서 주입한다.
function canvasStub({ bytes = 1000, bytesPerPx = 0 } = {}) {
  const calls = [];
  const ctx = new Proxy({}, { get: (_t, k) => (...args) => { calls.push([k, ...args]); } });
  const make = (w, h) => ({
    width: w, height: h, getContext: () => ctx,
    toDataURL: () => `data:image/png;base64,${'A'.repeat(bytes + bytesPerPx * w)}`,
  });
  return { calls, make };
}
const BOX = [-3000, -2000, 3000, 2000];

test('트레이스 위 한 점이 벽 위 같은 점에 떨어진다(같은 변환)', () => {
  const { calls, make } = canvasStub();
  const bg = traceBackground([[-3000, -2000, 3000, -2000], [0.5, -2000, 0.5, 2000]], BOX, { makeCanvas: make });
  expect(bg).toMatchObject({ width: 2048, height: 1365, opacity: 0.35, visible: true, locked: true });
  expect(bg.offset).toEqual([-3000, -2000]);
  expect(bg.src.startsWith('data:image/png;base64,')).toBe(true);
  // 배경 규약: 월드 = offset + 픽셀 × scale(기존 배경 도면과 같다 — view2d의 bounds()가 그 식을 쓴다)
  const toPx = p => [(p[0] - bg.offset[0]) / bg.scale, (p[1] - bg.offset[1]) / bg.scale];
  expect(toPx([0, 0])[0]).toBeCloseTo(bg.width / 2, 6);
  expect(toPx([3000, 2000])[0]).toBeCloseTo(bg.width, 6);
  expect(toPx([3000, 2000])[1]).toBeCloseTo(bg.height, 0);
  // 그린 좌표도 같은 변환이다.
  const moves = calls.filter(c => c[0] === 'moveTo');
  expect(moves).toHaveLength(2);
  expect(moves[0][1]).toBeCloseTo(0, 6);
  expect(moves[1][1]).toBeCloseTo(toPx([0.5, 0])[0], 6);
  expect(calls.some(c => c[0] === 'stroke')).toBe(true);
  expect(TRACE_COLOR).toBe('#334155');
});

test('60 mm 미만 선분은 그리지 않고 Float32Array도 받는다', () => {
  const { calls, make } = canvasStub();
  const segs = new Float32Array([-3000, -2000, -2950, -2000, -3000, -1000, 0, -1000]);   // 50 mm · 3000 mm
  traceBackground(segs, BOX, { makeCanvas: make });
  expect(calls.filter(c => c[0] === 'moveTo')).toHaveLength(1);
  // minSeg를 낮추면 둘 다 그린다(문턱이 한 곳에서 온다는 확인).
  const b = canvasStub();
  traceBackground(segs, BOX, { makeCanvas: b.make, minSeg: 10 });
  expect(b.calls.filter(c => c[0] === 'moveTo')).toHaveLength(2);
});

test('바이트 한도를 넘으면 한 단계 줄이고 그래도 넘으면 null이다', () => {
  expect(TRACE_MAX_BYTES).toBe(1_200_000);
  // 2048 px → 1.43 MB(초과) · 1024 px → 0.72 MB(통과)
  const half = traceBackground([[-3000, -2000, 3000, -2000]], BOX, { makeCanvas: canvasStub({ bytes: 0, bytesPerPx: 700 }).make });
  expect(half.width).toBe(1024);
  expect(half.src.length).toBeLessThanOrEqual(TRACE_MAX_BYTES);
  expect(traceBackground([[-3000, -2000, 3000, -2000]], BOX, { makeCanvas: canvasStub({ bytes: 2_000_000 }).make })).toBe(null);
});

test('그릴 것이 없거나 크기가 0이면 null이다', () => {
  const { make } = canvasStub();
  expect(traceBackground([], BOX, { makeCanvas: make })).toBe(null);
  expect(traceBackground([[0, 0, 100, 0]], [0, 0, 0, 0], { makeCanvas: make })).toBe(null);
  expect(traceBackground(null, BOX, { makeCanvas: make })).toBe(null);
});

// ── 계획 14 Task C(2026-10-13 · 사전 검토 I-5): 워커는 같은 그림을 OffscreenCanvas로 그리고 convertToBlob으로 굽는다 ──
// 바이트 동일은 node·jsdom에서 잴 수 없다(캔버스가 없다). 그래서 두 경로의 **그리기 명령열**(스타일 대입 포함)과
// 변환(폭·높이·scale·offset)이 같음을 못 박는다 — 같은 명령을 같은 브라우저 래스터라이저가 그리면 같은 픽셀이다(실측 픽셀 차 0).
function recStub(dataUrl = `data:image/png;base64,${'A'.repeat(1000)}`) {
  const log = [];
  const make = (w, h) => {
    log.push(['canvas', w, h]);
    const ctx = new Proxy({}, {
      get: (_t, k) => (...args) => { log.push([k, ...args]); },
      set: (_t, k, v) => { log.push(['set', k, v]); return true; },
    });
    return { width: w, height: h, getContext: kind => (log.push(['getContext', kind]), ctx), toDataURL: () => dataUrl };
  };
  return { log, make };
}
const SEGS = () => new Float32Array([-3000, -2000, 3000, -2000, 0.5, -2000, 0.5, 2000, -3000, -2000, -2950, -2000]);

test('비동기 굽기(워커 경로)는 동기 굽기(메인 폴백)와 같은 명령열 · 같은 변환 · 같은 저장 모양이다', async () => {
  const a = recStub(), b = recStub();
  const sync = traceBackground(SEGS(), BOX, { makeCanvas: a.make });
  const late = await traceBackgroundAsync(SEGS(), BOX, { makeCanvas: b.make, encode: async cv => cv.toDataURL() });
  expect(a.log.length).toBeGreaterThan(8);
  expect(b.log).toEqual(a.log);
  expect(a.log.slice(0, 6)).toEqual([['canvas', 2048, 1365], ['getContext', '2d'], ['set', 'fillStyle', '#ffffff'], ['fillRect', 0, 0, 2048, 1365], ['set', 'strokeStyle', TRACE_COLOR], ['set', 'lineWidth', 1]]);
  expect(late).toEqual(sync);
  // 저장 JSON(kvp.autosave · .json 파일)의 키 순서까지 같다 — 저장본이 바뀌지 않는다.
  expect(Object.keys(late)).toEqual(['src', 'width', 'height', 'scale', 'offset', 'opacity', 'visible', 'locked']);
});

test('비동기 굽기도 한도를 넘으면 한 단계 줄이고 그래도 넘으면 null · 굽기가 던지면 그대로 던진다', async () => {
  const enc = async cv => cv.toDataURL();
  const one = [[-3000, -2000, 3000, -2000]];
  const half = await traceBackgroundAsync(one, BOX, { makeCanvas: canvasStub({ bytes: 0, bytesPerPx: 700 }).make, encode: enc });
  expect(half.width).toBe(1024);
  expect(await traceBackgroundAsync(one, BOX, { makeCanvas: canvasStub({ bytes: 2_000_000 }).make, encode: enc })).toBe(null);
  expect(await traceBackgroundAsync([], BOX, { makeCanvas: canvasStub().make, encode: enc })).toBe(null);
  // 던짐은 삼키지 않는다: 워커가 받아 "메인에서 굽기"(지금 경로)로 돌린다 — 조용히 배경 없음이 되면 안 된다.
  await expect(traceBackgroundAsync(one, BOX, { makeCanvas: canvasStub().make, encode: async () => { throw new Error('convertToBlob'); } })).rejects.toThrow('convertToBlob');
});

test('trace.js는 DOM을 모른다 — 워커가 import한다, 캔버스는 부르는 쪽이 준다', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/io/dxf/trace.js', import.meta.url)), 'utf8');
  expect(src).not.toMatch(/\bdocument\b/);
  expect(src).not.toMatch(/\bwindow\b/);
  expect(traceBackground([[-3000, -2000, 3000, -2000]], BOX)).toBe(null);   // 기본 캔버스가 없다(메인의 DOM 캔버스는 dxfDialog가 준다)
});
