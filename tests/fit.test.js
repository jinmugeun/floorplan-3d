import { test, expect } from 'vitest';
import { cameraDistance, viewForMode } from '../src/view3d/fit.js';

test('small or empty floors get the minimum distance', () => {
  expect(cameraDistance(0)).toBe(10);
  expect(cameraDistance(4000)).toBe(10);
  expect(cameraDistance(undefined)).toBe(10);
});
test('large floors scale the distance with the longest side', () => {
  expect(cameraDistance(20000)).toBeCloseTo(26);
  expect(cameraDistance(40000)).toBeCloseTo(52);
});

test('viewForMode routes shared actions (fit, zoom) to the view of the current mode', () => {
  const v2 = { name: '2d' }, v3 = { name: '3d' };
  expect(viewForMode('2d', v2, v3)).toBe(v2);
  for (const m of ['plan', 'iso', 'fp']) expect(viewForMode(m, v2, v3)).toBe(v3);
});
