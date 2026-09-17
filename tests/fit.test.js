import { test, expect } from 'vitest';
import { cameraDistance } from '../src/view3d/fit.js';

test('small or empty floors get the minimum distance', () => {
  expect(cameraDistance(0)).toBe(10);
  expect(cameraDistance(4000)).toBe(10);
  expect(cameraDistance(undefined)).toBe(10);
});
test('large floors scale the distance with the longest side', () => {
  expect(cameraDistance(20000)).toBeCloseTo(26);
  expect(cameraDistance(40000)).toBeCloseTo(52);
});
