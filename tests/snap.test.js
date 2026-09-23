import { test, expect } from 'vitest';
import { snapPoint, tolMm, SNAP_PX, MIN_TOL_MM, DEFAULT_TOL_MM } from '../src/geom/snap.js';

test('snaps to nearby point', () => {
  const r = snapPoint([105, 95], { points: [[100, 100]], tol: 20 });
  expect(r.point).toEqual([100, 100]);
  expect(r.hit).toBe('point');
});
test('aligns to x and y of existing points with guides', () => {
  const r = snapPoint([1005, 3000], { points: [[1000, 0], [0, 2990]], tol: 20 });
  expect(r.point).toEqual([1000, 2990]);
  expect(r.guides).toEqual([{ type: 'v', x: 1000 }, { type: 'h', y: 2990 }]);
});
test('ortho projects onto axis from anchor', () => {
  const r = snapPoint([2000, 120], { anchor: [0, 0], ortho: true, snap: false });
  expect(r.point).toEqual([2000, 0]);
  expect(r.hit).toBe('ortho');
});
test('snap=false returns input', () => {
  expect(snapPoint([7, 7], { points: [[0, 0]], snap: false }).point).toEqual([7, 7]);
});
test('alignment never overrides the axis locked by ortho', () => {
  const r = snapPoint([3000, 10], { anchor: [0, 0], ortho: true, points: [[9999, 50]], tol: 150 });
  expect(r.point).toEqual([3000, 0]); expect(r.hit).toBe('ortho'); expect(r.guides).toEqual([]);
  const r2 = snapPoint([3000, 10], { anchor: [0, 0], ortho: true, points: [[2990, 5000]], tol: 150 });
  expect(r2.point).toEqual([2990, 0]); expect(r2.hit).toBe('align'); expect(r2.guides).toEqual([{ type: 'v', x: 2990 }]);
});
test('snaps onto the nearest wall segment', () => {
  const w = { a: [0, 0], b: [4000, 0] };
  const r = snapPoint([1500, 60], { walls: [w], tol: 150 });
  expect(r.point).toEqual([1500, 0]); expect(r.hit).toBe('wall');
  expect(snapPoint([1500, 400], { walls: [w], tol: 150 }).hit).toBeNull();
});
test('with ortho, wall snap uses the intersection on the locked axis line', () => {
  const w = { a: [3000, -1000], b: [3000, 1000] };
  const r = snapPoint([2950, 30], { walls: [w], tol: 150, anchor: [0, 0], ortho: true });
  expect(r.point).toEqual([3000, 0]); expect(r.hit).toBe('wall');
});
test('endpoint snap wins over wall snap', () => {
  const w = { a: [0, 0], b: [4000, 0] };
  const r = snapPoint([3950, 40], { walls: [w], points: [[4000, 0]], tol: 150 });
  expect(r.point).toEqual([4000, 0]); expect(r.hit).toBe('point');
});
test('ortho locked axis with a parallel wall does not throw and stays finite', () => {
  const w = { a: [0, 0], b: [4000, 0] };
  const r = snapPoint([2000, 40], { walls: [w], anchor: [0, 0], ortho: true });
  expect(Number.isFinite(r.point[0])).toBe(true);
  expect(Number.isFinite(r.point[1])).toBe(true);
  expect(r.point).toEqual([2000, 0]);
});
test('with ortho, a nearer parallel wall does not hide a valid intersection on another wall', () => {
  const A = { a: [3000, -1000], b: [3000, 1000] };
  const C = { a: [2000, 50], b: [4000, 50] };
  const r = snapPoint([2900, 20], { walls: [C, A], tol: 150, anchor: [0, 0], ortho: true });
  expect(r.point).toEqual([3000, 0]); expect(r.hit).toBe('wall');
});

// §16.6: 허용치는 화면 px 한 규칙이다 — 도구마다 다른 상수(150 mm · 50 mm · 8/scale)를 없앤다.
test('tolMm은 화면 8 px을 mm로 바꾸고 최소 20 mm를 지킨다', () => {
  expect(SNAP_PX).toBe(8);
  expect(MIN_TOL_MM).toBe(20);
  expect(DEFAULT_TOL_MM).toBe(150);
  expect(tolMm(0.056)).toBeCloseTo(142.857, 3);     // 빈 프로젝트 기본 배율 → 예전 150과 거의 같다
  expect(tolMm(0.5)).toBe(20);                      // 확대하면 좁아지다가 20 mm에서 멈춘다
  expect(tolMm(0.005)).toBe(1600);                  // 축소하면 넓어진다(늘 화면 8 px이다)
  expect(tolMm(0.1, 16)).toBe(160);                 // px을 주면 그 화면 거리로 잰다
  // 배율을 모르면 예전 기본값으로 떨어진다(뷰 없이 만든 도구·순수 테스트).
  for (const bad of [undefined, null, 0, -1, NaN, Infinity]) expect(tolMm(bad)).toBe(DEFAULT_TOL_MM);
});

// 전역 제약: **모든 기하 테스트에 소수 좌표 케이스**(최종 리뷰 I-5). 위 케이스는 좌표가 전부
// 정수여서, snapPoint의 좌표 동등성 분기(point[0] = g.pos · point[1] === anchor[1])가 mm 단위
// 소수 좌표에서 어떻게 움직이는지 아무도 보지 않았다. snap.js는 이 계획이 다시 쓴 모듈이다.
test('소수 좌표에서도 끝점·정렬·벽면·직교 스냅이 같은 값을 돌려준다', () => {
  const p = snapPoint([105.5, 95.25], { points: [[100.5, 100.25]], tol: 20 });
  expect(p.point).toEqual([100.5, 100.25]);            // 반올림하지 않는다
  expect(p.hit).toBe('point');

  const a = snapPoint([1005.5, 3000.25], { points: [[1000.5, 0.25], [0.5, 2990.75]], tol: 20 });
  expect(a.point).toEqual([1000.5, 2990.75]);
  expect(a.guides).toEqual([{ type: 'v', x: 1000.5 }, { type: 'h', y: 2990.75 }]);

  const w = snapPoint([1500.5, 60.25], { walls: [{ a: [0.5, 0.25], b: [4000.5, 0.25] }], tol: 150 });
  expect(w.point).toEqual([1500.5, 0.25]);             // 수선의 발도 소수로 남는다
  expect(w.hit).toBe('wall');

  const o = snapPoint([2000.5, 120.25], { anchor: [0.5, 0.25], ortho: true, snap: false });
  expect(o.point).toEqual([2000.5, 0.25]);
  expect(o.hit).toBe('ortho');
  // 직교로 잠긴 축은 정렬 스냅이 바꾸지 않는다 — 소수 anchor에서도 그렇다(y === anchor[1] 비교).
  const ol = snapPoint([3000.5, 10.25], { anchor: [0.5, 0.25], ortho: true, points: [[2990.5, 5000.25]], tol: 150 });
  expect(ol.point).toEqual([2990.5, 0.25]);
  expect(ol.guides).toEqual([{ type: 'v', x: 2990.5 }]);
});

// 이월 8(기존 결함 · 이 계획이 만든 것이 아니다): 보조선 스냅은 직교 잠금 **뒤에** 돌면서
// 잠긴 축을 다시 밀어 버린다. 소수 좌표로 재현해 현재 동작을 글자로 못 박아 둔다 —
// 고치는 것은 다음 계획의 감사 항목이고, 여기서는 "조용히 달라지지 않게" 지킨다.
test('보조선 스냅이 직교 잠금을 깬다(이월 8의 기존 동작 고정)', () => {
  const r = snapPoint([10.5, 2000.25], { anchor: [0, 0], ortho: true, guides: [{ type: 'v', pos: 30 }], tol: 80 });
  expect(r.point).toEqual([30, 2000.25]);              // x는 anchor[0] = 0에 잠겨 있어야 하는데 30으로 밀린다
  expect(r.hit).toBe('guide');
});
