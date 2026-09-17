import { test, expect } from 'vitest';
import { snapPoint } from '../src/geom/snap.js';

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
