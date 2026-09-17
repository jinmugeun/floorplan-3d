import { test, expect } from 'vitest';
import { solveHomography, applyHomography } from '../src/geom/homography.js';

test('identity when src == dst', () => {
  const q = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const H = solveHomography(q, q);
  const p = applyHomography(H, [3, 7]);
  expect(p[0]).toBeCloseTo(3); expect(p[1]).toBeCloseTo(7);
});
test('maps a skewed quad to a rectangle', () => {
  const src = [[10, 20], [400, 40], [380, 300], [30, 280]];
  const dst = [[0, 0], [1000, 0], [1000, 700], [0, 700]];
  const H = solveHomography(src, dst);
  src.forEach((s, i) => { const p = applyHomography(H, s); expect(p[0]).toBeCloseTo(dst[i][0], 3); expect(p[1]).toBeCloseTo(dst[i][1], 3); });
  const mid = applyHomography(H, [(10 + 400) / 2, (20 + 40) / 2]);
  expect(mid[1]).toBeCloseTo(0, 3);
});
