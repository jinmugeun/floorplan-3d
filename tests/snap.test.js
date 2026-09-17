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
