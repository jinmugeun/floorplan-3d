// §18.6의 트레이스 배경(안 A): 원 도면을 PNG로 구워 기존 project.background에 넣는다.
// 저장 형식 무변경이고, 불투명도·표시·잠금 UI를 그대로 물려받는다.
import { test, expect } from 'vitest';
import { traceBackground, TRACE_MAX_BYTES, TRACE_COLOR } from '../src/io/dxf/trace.js';

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
