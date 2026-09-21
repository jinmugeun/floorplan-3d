import { test, expect } from 'vitest';
import { cameraDistance, viewForMode, fitDistance, FIT_MARGIN } from '../src/view3d/fit.js';

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

// §15.4·§15.12(감사 §12): 2560×1440에서 모델이 뷰포트의 절반 남짓만 썼다 — cameraDistance가
// 종횡비도 카메라 고도도 보지 않고 "가장 긴 변 × 1.3"만 쓰기 때문이다.
test('fitDistance는 여백 비율 8%를 고정하고 종횡비·고도를 반영한다', () => {
  expect(FIT_MARGIN).toBe(0.08);
  // 평면(고도 90°)에서는 가로·세로 중 빡빡한 쪽이 거리를 정한다.
  const wide = fitDistance(20000, { aspect: 1.39, fov: 60, elevation: 90 });
  const narrow = fitDistance(20000, { aspect: 0.7, fov: 60, elevation: 90 });
  expect(narrow).toBeGreaterThan(wide);                       // 좁은 뷰포트는 더 멀리 물러나야 한다
  // ISO(고도 35°)에서는 도면의 세로 투영이 줄어 더 가까이 붙는다 = 화면을 더 채운다.
  const iso = fitDistance(20000, { aspect: 1.39, fov: 60, elevation: 35, height: 2900 });
  expect(iso).toBeLessThan(cameraDistance(20000));            // 26 m보다 가깝다(감사 §12의 여백이 사라진다)
  expect(iso).toBeGreaterThan(10);
  // 8% 여백을 손으로 검산한다: 고도 90°·정사각 뷰포트·시야각 60°에서
  // 필요한 반높이 = (20 m / 2) / (1 − 0.16) = 11.905 m, 거리 = 11.905 / tan(30°) = 20.62 m.
  // (fitDistance가 고도를 89°로 자르므로 실제값은 20.617 m다 — 차이 0.003 m는 소수 2자리 안이다.)
  expect(fitDistance(20000, { aspect: 1, fov: 60, elevation: 90 })).toBeCloseTo(20.62, 2);
  // 작은 도면·빈 도면에도 최소 거리를 준다(카메라가 바닥에 처박히지 않게).
  expect(fitDistance(0)).toBe(6);
  expect(fitDistance(undefined, { aspect: 1.5 })).toBe(6);
  // margin 0이면 딱 맞게 잡는다(여백 비율이 거리에 선형으로 들어간다).
  expect(fitDistance(20000, { aspect: 1, fov: 60, elevation: 90, margin: 0 })).toBeCloseTo(17.32, 2);
});
