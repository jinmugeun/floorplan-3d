// §14.4: 2D 평면에서 문·창이 벽을 뚫지 않았다(개구부 절단이 3D에만 있었다).
// 같은 geom/openings.js를 쓰므로 겹치는 개구부의 합집합 규칙과 접합 벽 연장분이 3D와 같다.
import { describe, test, expect } from 'vitest';
import { wallRange, wallSpans, spanQuad, drawWalls, GLASS_DIV } from '../src/view2d/walls2d.js';
import { makeWall, rectWalls, wallLength } from '../src/geom/walls.js';
import { createItem } from '../src/state/schema.js';
import { productById } from '../src/products/catalog.js';

const wall = (b = [4000, 0]) => makeWall({ a: [0, 0], b, thickness: 200, height: 2300 });
const on = (w, id, patch) => createItem(productById(id), { wallId: w.id, ...patch });
function fakeCtx() {
  const calls = [];
  const rec = name => (...args) => calls.push([name, ...args]);
  return { calls, save: rec('save'), restore: rec('restore'), beginPath: rec('beginPath'), setLineDash: rec('setLineDash'),
    moveTo: rec('moveTo'), lineTo: rec('lineTo'), stroke: rec('stroke'), globalAlpha: 1 };
}
const fakeView = polys => ({
  camera: { scale: 0.05 },
  toScreen: p => [p[0] * 0.05, p[1] * 0.05],
  poly: (pts, fill) => polys.push({ pts, fill }),
  COLORS: { wall: '#3a4351', wallSel: '#14b8c4' },
});

describe('2D 벽 조각', () => {
  test('문 하나가 벽을 두 조각으로 끊는다(높이 조각은 생기지 않는다)', () => {
    const w = wall();
    const spans = wallSpans(w, [w], [on(w, 'door-swing-900', { t: 0.25 })]);
    expect(spans).toEqual([{ u0: 0, u1: 550 }, { u0: 1450, u1: 4000 }]);
  });

  test('겹치는 개구부는 합집합 한 자리로 비운다', () => {
    const w = wall();
    const spans = wallSpans(w, [w], [on(w, 'door-swing-900', { t: 0.25 }), on(w, 'door-swing-900', { t: 0.3 })]);
    expect(spans).toEqual([{ u0: 0, u1: 550 }, { u0: 1650, u1: 4000 }]);
  });

  test('30° 벽과 소수 좌표에서도 개구부 자리가 중심에 온다', () => {
    const w = makeWall({ a: [100.5, 200.25], b: [100.5 + 3464.1016, 200.25 + 2000], thickness: 200, height: 2300 });
    const L = wallLength(w);
    const spans = wallSpans(w, [w], [on(w, 'window-slide-1200', { t: 0.5 })]);
    expect(spans).toHaveLength(2);
    expect(spans[0].u0).toBeCloseTo(0, 6);
    expect(spans[0].u1).toBeCloseTo(L / 2 - 600, 6);
    expect(spans[1].u0).toBeCloseTo(L / 2 + 600, 6);
    expect(spans[1].u1).toBeCloseTo(L, 6);
    // 조각 사각형은 벽 축을 따라 실제로 돈다: |q0-q3| = 두께 같은 회전 불변량은 축이 틀려도
    // 통과하므로, 30° 회전 행렬을 직접 적용한 코너 좌표와 맞춘다(소수 시작점 포함).
    const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6), h = w.thickness / 2;
    // dir = [c, s], n = perp(dir) = [-s, c] → corner(u, side) = a + dir*u + n*(side*h)
    const corner = (u, side) => [w.a[0] + c * u - s * side * h, w.a[1] + s * u + c * side * h];
    const near = (got, want) => { expect(got[0]).toBeCloseTo(want[0], 4); expect(got[1]).toBeCloseTo(want[1], 4); };
    const q = spanQuad(w, spans[0]);
    expect(q).toHaveLength(4);
    near(q[0], corner(0, 1));                        // [50.5, 286.8525…] — 벽 시작점에서 법선 +100
    near(q[1], corner(L / 2 - 600, 1));              // [1262.93…, 986.85…]
    near(q[2], corner(L / 2 - 600, -1));
    near(q[3], corner(0, -1));                       // [150.5, 113.6474…]
    expect(q[0][0]).toBeCloseTo(50.5, 4);            // 축이 0°나 90°면 여기서 깨진다
    expect(q[0][1]).toBeCloseTo(286.852540, 4);
    // q0→q1은 벽 방향과 평행하고(30°), q0·q3의 중점은 벽 중심선 위에 있다.
    expect(Math.atan2(q[1][1] - q[0][1], q[1][0] - q[0][0]) * 180 / Math.PI).toBeCloseTo(30, 6);
    near([(q[0][0] + q[3][0]) / 2, (q[0][1] + q[3][1]) / 2], w.a);
    expect(Math.hypot(q[0][0] - q[3][0], q[0][1] - q[3][1])).toBeCloseTo(200, 6);
    // 오른쪽 조각도 같은 축을 따른다(개구부 끝에서 시작).
    const q2 = spanQuad(w, spans[1]);
    near(q2[0], corner(L / 2 + 600, 1));
    near(q2[1], corner(L, 1));
  });

  test('보기에서 벽면 가구를 끄면 평면도 끊지 않는다', () => {
    const w = wall();
    const door = on(w, 'door-swing-900', { t: 0.25 });
    expect(wallSpans(w, [w], [door], { flags: { wallItems: false } })).toEqual([{ u0: 0, u1: 4000 }]);
    expect(wallSpans(w, [w], [door], { flags: {} })).toHaveLength(2);
  });

  test('접합 벽이 있으면 u 범위가 두께/2만큼 늘어난다(3D와 같은 규칙)', () => {
    const walls = rectWalls([0, 0], [4000, 3000], 200);
    const r = wallRange(walls[0], walls);
    expect(r.start).toBe(-100);
    expect(r.end).toBeCloseTo(4100, 6);
    expect(wallSpans(walls[0], walls, [])).toEqual([{ u0: -100, u1: r.end }]);
  });

  // 2026-10-12 · 계획 12 Task 7 리뷰 M-1: 같은 선 위로 이어지는 벽 쪽 끝을 늘리면 그 t/2 상자가 제 벽의 개구부로만 잘려, 이웃 조각으로
  // 이어 앉힌 창(사동중 win-4800-3 둘째) 가운데에 벽 두께만 한 기둥이 섰다. 같은 선 이어짐(두께 무관) 쪽 끝은 늘리지 않는다.
  const W1 = () => makeWall({ a: [0, 0], b: [4000, 0], thickness: 200 });
  test('같은 선 위로 이어지는 벽 쪽 끝은 늘리지 않는다(이웃이 거꾸로여도 · 두께가 달라도) — 모서리는 예전대로 늘린다', () => {
    const w1 = W1();
    for (const w2 of [makeWall({ a: [4000, 0], b: [8000, 0], thickness: 200 }), makeWall({ a: [8000, 0], b: [4000, 0], thickness: 400 })]) {
      expect(wallRange(w1, [w1, w2])).toEqual({ start: 0, end: 4000 });
      expect(wallRange(w2, [w1, w2])).toEqual({ start: 0, end: 4000 });   // 접점(x 4000)이 a든 b든 늘지 않는다 · 반대 끝은 접합이 없다
    }
    const corner = makeWall({ a: [4000, 0], b: [4000, 3000], thickness: 200 });
    expect(wallRange(w1, [w1, corner])).toEqual({ start: 0, end: 4100 });
    expect(wallRange(corner, [w1, corner])).toEqual({ start: -100, end: 3000 });
    // 2° 안은 같은 선, 그 밖은 꺾임이다.
    const bent = deg => makeWall({ a: [4000, 0], b: [4000 + 4000 * Math.cos(deg * Math.PI / 180), 4000 * Math.sin(deg * Math.PI / 180)], thickness: 200 });
    expect(wallRange(w1, [w1, bent(1.9)]).end).toBe(4000);
    expect(wallRange(w1, [w1, bent(2.1)]).end).toBe(4100);
  });

  test('T자: 같은 선 두 조각은 접점에서 딱 맞닿고(늘리지 않음) 칸막이는 제 끝을 늘려 접점을 덮는다 — 이어 앉힌 창 가운데에 기둥이 없다', () => {
    const w1 = W1(), w2 = makeWall({ a: [4000, 0], b: [8000, 0], thickness: 200 }), part = makeWall({ a: [4000, 0], b: [4000, 3000], thickness: 100 });
    const walls = [w1, part, w2];
    expect(wallRange(w1, walls)).toEqual({ start: 0, end: 4000 });
    expect(wallRange(w2, walls)).toEqual({ start: 0, end: 4000 });
    expect(wallRange(part, walls)).toEqual({ start: -50, end: 3000 });
    // 기하로 확인: 두 조각의 사각형이 x 4000에서 맞닿아(빈틈·겹침 없음) 벽 몸통(y ±100)이 이어지고, 칸막이 사각형이 접점(x 3950~4050)을 y −50부터 덮는다.
    const q1 = spanQuad(w1, wallSpans(w1, walls, []).at(-1)), q2 = spanQuad(w2, wallSpans(w2, walls, [])[0]), qp = spanQuad(part, wallSpans(part, walls, [])[0]);
    expect(Math.max(...q1.map(p => p[0]))).toBe(4000);
    expect(Math.min(...q2.map(p => p[0]))).toBe(4000);
    expect([Math.min(...q1.map(p => p[1])), Math.max(...q1.map(p => p[1]))]).toEqual([-100, 100]);
    expect([Math.min(...q2.map(p => p[1])), Math.max(...q2.map(p => p[1]))]).toEqual([-100, 100]);
    expect([Math.min(...qp.map(p => p[0])), Math.max(...qp.map(p => p[0])), Math.min(...qp.map(p => p[1]))]).toEqual([3950, 4050, -50]);
    // 이어 앉힌 창(x 2000~6000 = W1 2000 + W2 2000): 두 벽 모두 창 구간에 칠한 조각이 없다(예전에는 W1 [4000, 4100] · W2 [−100, 0] 기둥).
    const size = [2000, ...productById('window-slide-1800').size.slice(1)];
    const items = [on(w1, 'window-slide-1800', { t: 0.75, size }), on(w2, 'window-slide-1800', { t: 0.25, size })];
    expect(wallSpans(w1, walls, items)).toEqual([{ u0: 0, u1: 2000 }]);
    expect(wallSpans(w2, walls, items)).toEqual([{ u0: 2000, u1: 4000 }]);
  });

  test('drawWalls는 조각마다 칠하고 창에는 유리선을, 선택된 벽은 통짜로 그린다', () => {
    const w = wall();
    const win = on(w, 'window-slide-1200', { t: 0.5 });
    const polys = [];
    const ctx = fakeCtx();
    drawWalls(ctx, fakeView(polys), { walls: [w], items: [win], rooms: [] }, {});
    expect(polys).toHaveLength(2);                       // 좌·우 조각
    expect(polys[0].fill).toBe('#3a4351');
    expect(GLASS_DIV).toBe(6);
    // 유리 두 줄 + 양끝 짧은 선 = 선 4개
    expect(ctx.calls.filter(c => c[0] === 'moveTo')).toHaveLength(4);
    expect(ctx.calls.filter(c => c[0] === 'lineTo')).toHaveLength(4);
    const sel = [];
    drawWalls(fakeCtx(), fakeView(sel), { walls: [w], items: [win], rooms: [] }, { sel: { type: 'wall', id: w.id } });
    expect(sel).toHaveLength(1);                         // 선택 강조는 조각이 아니라 벽 전체다
    expect(sel[0].fill).toBe('#14b8c4');
    expect(sel[0].pts).toHaveLength(4);
  });
});

// 계획 6 이월 · §15.14: 개구부(opening-pass)는 빈 자리만 남아 선택 전에는 표시가 없었다.
test('개구부 자리에는 점선 테두리를 두른다(창은 유리 두 줄 그대로)', () => {
  const w = wall();
  const pass = on(w, 'opening-pass', { t: 0.5, pos: [2000, 0] });
  const ctx = fakeCtx();
  const polys = [];
  drawWalls(ctx, fakeView(polys), { walls: [w], items: [pass], rooms: [] }, {});
  // 점선 테두리는 v.poly(사각형, null, 선색)이다: 채움 없는 폴리곤이 하나 늘어난다.
  expect(polys.some(p => p.fill === null)).toBe(true);
  expect(ctx.calls.some(c => c[0] === 'setLineDash' && Array.isArray(c[1]) && c[1].length === 2)).toBe(true);
  // 창은 점선이 아니라 실선 두 줄이다(예전 규칙 그대로).
  const win = on(w, 'window-slide-1200', { t: 0.5, pos: [2000, 0] });
  const ctx2 = fakeCtx();
  drawWalls(ctx2, fakeView([]), { walls: [w], items: [win], rooms: [] }, {});
  expect(ctx2.calls.some(c => c[0] === 'setLineDash')).toBe(false);
});
