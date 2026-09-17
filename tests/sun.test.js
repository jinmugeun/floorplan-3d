import { test, expect } from 'vitest';
import { sunAltitudeDeg, sunPosition } from '../src/view3d/sun.js';

test('altitude peaks at noon in June and is lower in December', () => {
  const june = sunAltitudeDeg({ month: 6, hour: 12 });
  const dec = sunAltitudeDeg({ month: 12, hour: 12 });
  expect(june).toBeCloseTo(75.95, 1);
  expect(dec).toBeCloseTo(29.05, 1);
  expect(sunAltitudeDeg({ month: 6, hour: 6 })).toBeLessThan(june);
  expect(sunAltitudeDeg({ month: 6, hour: 18 })).toBeCloseTo(sunAltitudeDeg({ month: 6, hour: 6 }), 6); // 정오 대칭
  expect(sunAltitudeDeg({ month: 3, hour: 0 })).toBeLessThan(0); // 한밤중은 음수
});

test('sunPosition maps azimuth onto three coordinates (0 = north, 90 = east)', () => {
  const [x, y, z] = sunPosition({ month: 6, hour: 12, azimuth: 180 }, 40);
  expect(x).toBeCloseTo(0, 6);
  expect(y).toBeCloseTo(38.81, 1);
  expect(z).toBeGreaterThan(0); // 남쪽(+z)
  const east = sunPosition({ month: 6, hour: 12, azimuth: 90 }, 40);
  expect(east[0]).toBeGreaterThan(0);
  expect(east[2]).toBeCloseTo(0, 6);
  const north = sunPosition({ month: 6, hour: 12, azimuth: 0 }, 40);
  expect(north[2]).toBeLessThan(0);
});

test('night keeps a low sun instead of going below the ground', () => {
  const [, y] = sunPosition({ month: 12, hour: 2, azimuth: 180 }, 40);
  expect(y).toBeCloseTo(40 * Math.sin(5 * Math.PI / 180), 6);
});

test('fractional hours and months are accepted', () => {
  const a = sunAltitudeDeg({ month: 6.5, hour: 13.5 });
  expect(Number.isFinite(a)).toBe(true);
  expect(a).toBeLessThan(sunAltitudeDeg({ month: 6.5, hour: 12 }));
});
