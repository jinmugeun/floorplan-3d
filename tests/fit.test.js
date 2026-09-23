import { test, expect } from 'vitest';
import { cameraDistance, viewForMode, fitDistance, FIT_MARGIN, occupancyOf, orbitOf, reframePosition, shotPosition, canReframeShot } from '../src/view3d/fit.js';

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

// 리뷰 B-1: 예전 직교 근사식은 ISO에서 거리를 절반 이하로 잡아 8꼭짓점 중 5~6개가 프레임 밖으로
// 잘렸는데도, "자기 식으로 자기를 검산하는" 테스트라 통과했다. 이제는 **결과 카메라의 절두체에
// bbox 8꼭짓점을 직접 투영**해 단정한다(occupancyOf: 점유 1.0이 프레임 경계 · 여백 비율 m이면 1 − 2m).
// 이 파일이 갖고 있던 occupancy()가 그 함수인데, 수정 파동 2에서 fit.js로 올렸다 — shotPosition이
// 잘림을 판단할 때 **테스트와 한 글자도 같은 식**을 써야 하기 때문이다(리뷰 N-1). 여기서는 import해 쓴다.

test('fit()의 거리는 bbox 8꼭짓점을 절두체 안에 8% 여백으로 넣는다 (평면·ISO · fix wave 1)', () => {
  const k = 1 - 2 * FIT_MARGIN;                               // 0.84 = 프레임 경계까지 8%씩 남는다
  const cases = [
    // 강당중 샘플(33.8 m × 29.6 m, 층고 3500): 예전 식은 ISO에서 점유 1.75·6.82로 잘렸다.
    { name: 'iso 1366', width: 33800, depth: 29600, height: 3500, fov: 60, aspect: 672 / 600, elevation: 35, azimuth: 47 },
    { name: 'iso 2560', width: 33800, depth: 29600, height: 3500, fov: 60, aspect: 1900 / 1200, elevation: 35, azimuth: 47 },
    { name: 'iso 좁은 뷰', width: 33800, depth: 29600, height: 3500, fov: 60, aspect: 0.7, elevation: 35, azimuth: 47 },
    { name: 'iso 작은 도면', width: 5000, depth: 4200, height: 2900, fov: 60, aspect: 1.39, elevation: 35, azimuth: 47 },
    { name: 'iso 방위 0', width: 12000, depth: 12000, height: 2400, fov: 45, aspect: 1.2, elevation: 20, azimuth: 0 },
    { name: '평면 1366', width: 33800, depth: 29600, height: 3500, fov: 60, aspect: 672 / 600, elevation: 90, azimuth: 0, plan: true },
    { name: '평면 2560', width: 33800, depth: 29600, height: 3500, fov: 60, aspect: 1900 / 1200, elevation: 90, azimuth: 0, plan: true },
    { name: '평면 작은 도면', width: 5000, depth: 4200, height: 2900, fov: 60, aspect: 1.39, elevation: 90, azimuth: 0, plan: true },
  ];
  for (const c of cases) {
    const r = fitDistance(Math.max(c.width, c.depth), c);
    const { fill, front } = occupancyOf({ ...c, radius: r });
    // 평면 카메라는 lookAt이 퇴화하지 않게 목표에서 z로 0.01 m 비켜 선다(view3d.js) → 점유가
    // 0.3% 안쪽으로 커질 수 있다. 34 m 도면에서 mm 단위이고 8% 여백 안에서 흡수된다.
    const slack = c.plan ? 3e-3 : 1e-9;
    expect(front, `${c.name}: 카메라 앞쪽`).toBeGreaterThan(0);
    expect(fill, `${c.name}: 8꼭짓점이 프레임 안(여백 8% 이상)`).toBeLessThanOrEqual(k + slack);
    expect(fill, `${c.name}: 빈 여백이 8%를 넘지 않는다(꽉 채운다)`).toBeGreaterThan(k - 1e-6);
  }
});

test('width·depth를 주지 않으면 extent를 양변으로 써 보수적(더 먼) 거리가 나온다', () => {
  const opt = { fov: 60, aspect: 1.12, elevation: 35, azimuth: 47, height: 3500 };
  const exact = fitDistance(33800, { ...opt, width: 33800, depth: 29600 });
  const square = fitDistance(33800, opt);
  expect(square).toBeGreaterThan(exact);                      // 잘리는 쪽이 아니라 남는 쪽으로 틀린다
  expect(occupancyOf({ ...opt, width: 33800, depth: 29600, radius: square }).fill).toBeLessThan(1 - 2 * FIT_MARGIN);
});

// §16.9(감사 §10): 화면 종횡비로 맞춰 둔 거리를 16:9 출력에 그대로 쓰면 모델이 프레임의 절반만 쓴다.
// 방향(고도·방위)은 그대로 두고 거리만 출력 종횡비에 맞춘다.
test('orbitOf·reframePosition은 방향을 지키고 거리만 바꾼다', () => {
  // frameScene의 배치식: pos = target + r(−cosEl·sinAz, sinEl, cosEl·cosAz). 고도 35°·방위 47°·r 26 m.
  const el = (35 * Math.PI) / 180, az = (47 * Math.PI) / 180, r = 26;
  const target = { x: 1.5, y: 0, z: -2.25 };
  const position = {
    x: target.x - r * Math.cos(el) * Math.sin(az),
    y: target.y + r * Math.sin(el),
    z: target.z + r * Math.cos(el) * Math.cos(az),
  };
  const o = orbitOf(position, target);
  expect(o.radius).toBeCloseTo(26, 6);
  expect(o.elevation).toBeCloseTo(35, 6);
  expect(o.azimuth).toBeCloseTo(47, 6);
  const p = reframePosition(position, target, 13);
  expect(orbitOf(p, target).radius).toBeCloseTo(13, 6);
  expect(orbitOf(p, target).elevation).toBeCloseTo(35, 6);
  expect(orbitOf(p, target).azimuth).toBeCloseTo(47, 6);
  // 목표와 같은 자리면(반지름 0) 위치를 건드리지 않는다(0으로 나누지 않는다).
  expect(reframePosition(target, target, 10)).toEqual({ x: target.x, y: target.y, z: target.z });
});

// 리뷰 I-2: fitDistance는 bbox가 **목표를 중심으로** 놓여 있다고 가정했는데, 오른쪽 드래그 팬은
// 목표를 얼마든지 옮긴다(view3d의 MOUSE.PAN). 벗어난 만큼이 식에 없어 그쪽이 프레임 밖으로 잘렸다.
test('fitDistance는 팬으로 벗어난 목표(소수 좌표)를 반영해 잘리지 않는다', () => {
  const k = 1 - 2 * FIT_MARGIN;
  const c = { width: 33800, depth: 29600, height: 3500, fov: 60, aspect: 1, elevation: 35, azimuth: 47 };
  const offset = [2.5, 4.75, -2.35];                          // 화면 위 축으로 약 5.8 m 팬한 상태(m)
  const offsetMm = offset.map(v => v * 1000);
  const naive = fitDistance(33800, c);                        // 목표가 중앙이라고 가정한 거리
  const fixed = fitDistance(33800, { ...c, offsetMm });
  expect(occupancyOf({ ...c, offsetMm, radius: naive }).fill).toBeGreaterThan(1);   // 예전 거리는 실제로 잘린다(1.03)
  expect(fixed).toBeGreaterThan(naive);                       // 벗어난 만큼 더 물러난다
  const { fill, front } = occupancyOf({ ...c, offsetMm, radius: fixed });
  expect(front, '카메라 앞쪽').toBeGreaterThan(0);
  expect(fill, '8꼭짓점이 프레임 안').toBeLessThanOrEqual(k + 1e-9);
  expect(fill, '그러면서 꽉 채운다').toBeGreaterThan(k - 1e-6);
  // 목표가 중앙이면(offsetMm 없음/0) 예전 결과와 한 치도 다르지 않다.
  expect(fitDistance(33800, { ...c, offsetMm: [0, 0, 0] })).toBe(naive);
});

// 리뷰 I-1: 1인칭(controls.enabled === false)은 같은 원근 카메라를 쓰면서 controls.target을 마지막
// 궤도 목표에 남겨 둔다 → 궤도를 잘못 읽고 화면과 무관한 그림이 저장됐다. 프리셋·2D 투영도 제외한다.
test('canReframeShot은 프리셋·1인칭·2D 투영에서 재프레이밍을 막는다', () => {
  const ok = { preset: null, isScreenCamera: true, isPerspective: true, controlsEnabled: true };
  expect(canReframeShot(ok)).toBe(true);
  expect(canReframeShot({ ...ok, preset: 'front' })).toBe(false);       // orthoViewParams가 이미 aspect를 받는다
  expect(canReframeShot({ ...ok, isScreenCamera: false })).toBe(false); // 2D 투영의 ortho2 카메라
  expect(canReframeShot({ ...ok, isPerspective: false })).toBe(false);  // projection: 'ortho'
  expect(canReframeShot({ ...ok, controlsEnabled: false })).toBe(false); // 1인칭
  expect(canReframeShot()).toBe(false);
});

// 리뷰 I-4: "현재 카메라"가 도면 전체 맞춤 거리로 덮어쓰면 후드 한 대를 확대해 둔 화면에서 주방
// 전체가 나온다. 사용자의 줌을 지키고 **화면↔출력 종횡비 차이만** 보정한다.
test('shotPosition은 줌을 지키고 화면↔출력 종횡비 차이만 보정한다', () => {
  const target = { x: 1.5, y: 0.75, z: -2.25 }, center = { x: 1.5, y: 0, z: -2.25 };  // 0.75 m 팬한 목표
  const el = (35 * Math.PI) / 180, az = (47 * Math.PI) / 180, r0 = 12;
  const position = {
    x: target.x - r0 * Math.cos(el) * Math.sin(az),
    y: target.y + r0 * Math.sin(el),
    z: target.z + r0 * Math.cos(el) * Math.cos(az),
  };
  const dims = { extentMm: 33800, fov: 60, height: 3500, width: 33800, depth: 29600 };
  const screenAspect = 16 / 9;
  // 화면과 같은 비율로 내보내면 거리가 한 치도 바뀌지 않는다(12 m 줌이 그대로 남는다).
  expect(orbitOf(shotPosition({ position, target, center, ...dims, aspect: 16 / 9, screenAspect }), target).radius).toBeCloseTo(12, 9);
  // 1:1로 내보내면 가로가 좁아져 **딱 fit 비율만큼**(1.0815배) 물러난다.
  const opts = { fov: 60, elevation: 35, azimuth: 47, height: 3500, width: 33800, depth: 29600, offsetMm: [0, 750, 0] };
  const ratio = fitDistance(33800, { ...opts, aspect: 1 }) / fitDistance(33800, { ...opts, aspect: 16 / 9 });
  expect(ratio).toBeGreaterThan(1);
  const sq = orbitOf(shotPosition({ position, target, center, ...dims, aspect: 1, screenAspect }), target);
  // 12 m는 33.8 m 도면의 bbox **안**이다(꼭짓점이 카메라 뒤에 있다 = front < 0) → 8꼭짓점 점유로는
  // 판단할 수 없는 영역이고, 이 영역에서는 순수 비율이 계약이다(리뷰 N-1의 잘림 증상은 "화면에 전부
  // 들어와 있었는데"가 전제여서 여기서는 성립하지 않는다). 점유로 판단할 수 있는 영역의 가드는 아래 테스트다.
  expect(occupancyOf({ ...opts, aspect: screenAspect, radius: 12 }).front).toBeLessThan(0);
  expect(sq.radius).toBeCloseTo(12 * ratio, 9);
  expect(sq.elevation).toBeCloseTo(35, 6);                    // 방향은 그대로다
  expect(sq.azimuth).toBeCloseTo(47, 6);
  // 도면 전체 맞춤 거리(45.8 m)로 덮어쓰지 않는다 — 이것이 I-4가 되돌린 결정이다.
  expect(fitDistance(33800, { ...opts, aspect: 16 / 9 })).toBeGreaterThan(40);
  expect(sq.radius).toBeLessThan(20);
  // screenAspect를 주지 않으면 출력 비율과 같다고 보아 거리를 건드리지 않는다(줌 보존이 기본값).
  expect(orbitOf(shotPosition({ position, target, center, ...dims, aspect: 1 }), target).radius).toBeCloseTo(12, 9);
});

// 리뷰 N-1·N-4: 수정 파동 1의 순수 비율 보정(r_cur × F(출력)/F(화면))은 "점유가 1/r로 간다"고 가정했다.
// 원근에서는 1/(r − dot(v,dir))이므로 상사변환이 아니다 → 사용자가 화면 맞추기보다 조금만 더 확대해 두면
// (화면에는 도면이 **전부 들어와 있다**) 더 넓은 출력에서 잘렸다. 여기서는 식을 식으로 검산하지 않고
// **결과 프레임의 점유를 직접 잰다**. 팬·종횡비·줌을 모두 소수로 준다.
const shotCase = ({ elevation, azimuth, screenAspect, aspect, zoom = 1, off = [0, 0, 0] }) => {
  const base = { extentMm: 33800, width: 33800, depth: 29600, height: 3500, fov: 60, elevation, azimuth, offsetMm: off.map(v => v * 1000) };
  const dims = { extentMm: 33800, width: 33800, depth: 29600, height: 3500, fov: 60 };
  const center = { x: 1.5, y: 0, z: -2.25 };                  // bbox 기준점(가로·세로 중앙 · 바닥)
  const target = { x: center.x + off[0], y: center.y + off[1], z: center.z + off[2] };
  const fitScreen = fitDistance(dims.extentMm, { ...base, aspect: screenAspect });
  const r = fitScreen * zoom;                                 // zoom < 1 = 화면 맞추기보다 더 확대해 둔 상태
  const el = (elevation * Math.PI) / 180, az = (azimuth * Math.PI) / 180;
  const position = {
    x: target.x - r * Math.cos(el) * Math.sin(az),
    y: target.y + r * Math.sin(el),
    z: target.z + r * Math.cos(el) * Math.cos(az),
  };
  const cur = orbitOf(position, target).radius;
  const radius = orbitOf(shotPosition({ position, target, center, ...dims, aspect, screenAspect }), target).radius;
  const fit = fitDistance(dims.extentMm, { ...base, aspect });
  return {
    cur, radius, fit,
    screen: occupancyOf({ ...base, aspect: screenAspect, radius: cur }),
    out: occupancyOf({ ...base, aspect, radius }),
    wave1: occupancyOf({ ...base, aspect, radius: (cur * fit) / fitScreen }).fill,   // 순수 비율만 썼을 때의 점유
  };
};

test('shotPosition의 출력 프레임은 화면보다 나빠지지 않는다(리뷰 N-1 · 회귀 가드 N-4)', () => {
  const k = 1 - 2 * FIT_MARGIN;
  // (a) 감사 §10의 원래 경우: 정사각 화면에서 화면 맞추기 → 16:9 출력. 고침 전 0.707(프레임 절반 남짓) →
  //     0.84. **이 가드가 없어 §16.9의 원래 고침이 조용히 사라질 수 있었다**(리뷰 N-4).
  const a = shotCase({ elevation: 35, azimuth: 47, screenAspect: 1, aspect: 16 / 9 });
  expect(a.screen.fill).toBeCloseTo(k, 9);                    // 화면 맞추기 직후 = 0.84
  expect(a.out.fill).toBeCloseTo(0.84, 2);                    // 0.84 ± 0.005
  expect(a.out.front).toBeGreaterThan(0);
  expect(a.radius).toBeCloseTo(a.fit, 9);                     // 이 한 점에서는 비율 보정 = 출력 맞추기 거리
  // (b) 화면 맞추기보다 10% 더 확대한 상태(화면 점유 0.942 — 아직 전부 프레임 안): 순수 비율은 1.011로
  //     잘랐다. 이제 출력 점유가 화면 점유를 넘지 않는다(= 0.942에 붙여 가로 여백만 회수한다).
  const b = shotCase({ elevation: 35, azimuth: 47, screenAspect: 1, aspect: 16 / 9, zoom: 0.9 });
  expect(b.screen.fill).toBeCloseTo(0.942, 3);
  expect(b.screen.fill).toBeLessThan(1);                      // 화면에는 전부 들어와 있다
  expect(b.wave1).toBeGreaterThan(1);                          // 수정 파동 1은 여기서 잘랐다(1.011)
  expect(b.out.fill).toBeLessThanOrEqual(b.screen.fill + 1e-9);
  expect(b.out.fill).toBeLessThanOrEqual(1);
  expect(b.radius).toBeLessThanOrEqual(b.fit + 1e-9);         // 화면 맞추기보다 멀어지지도 않는다
  expect(b.radius).toBeGreaterThan(b.cur * 0.9);              // 사용자의 줌에서 필요한 만큼만 물러난다
  // (b2) 같은 상황 + 소수 좌표 팬(목표가 bbox 기준점에서 1.6 m 벗어나 있다).
  const b2 = shotCase({ elevation: 35, azimuth: 47, screenAspect: 1, aspect: 16 / 9, zoom: 0.9, off: [0.85, 0.75, -1.15] });
  expect(b2.wave1).toBeGreaterThan(1);
  expect(b2.out.fill).toBeLessThanOrEqual(b2.screen.fill + 1e-9);
  expect(b2.out.fill).toBeLessThanOrEqual(1);
  // (c) 저고도·좁은 뷰포트 극단(고도 2° · 화면비 0.46): 순수 비율은 점유 1.3~3.6까지 갔다.
  const c = shotCase({ elevation: 2, azimuth: 47, screenAspect: 0.46, aspect: 16 / 9, zoom: 0.9, off: [0.85, 0.75, -1.15] });
  expect(c.wave1).toBeGreaterThan(1.3);
  expect(c.out.fill).toBeLessThanOrEqual(c.screen.fill + 1e-9);
  expect(c.out.fill).toBeLessThanOrEqual(1);
  expect(c.out.front).toBeGreaterThan(0.05);                  // 근평면(0.05 m) 앞에 있다
  // (d) 출력 비율이 화면과 같으면 반지름을 **비트 그대로** 지킨다(줌 보존의 기본 보장 · 화면이 이미
  //     프레임을 넘치는 상태여도 도면 전체 맞춤으로 물러나지 않는다 — 리뷰 I-4).
  const d = shotCase({ elevation: 35, azimuth: 47, screenAspect: 16 / 9, aspect: 16 / 9, zoom: 0.9, off: [0.85, 0.75, -1.15] });
  expect(d.radius).toBe(d.cur);
  expect(d.screen.fill).toBeGreaterThan(1);                   // 넘침을 1로 깎지 않는다
  expect(d.out.fill).toBe(d.screen.fill);
  // (e) 줌아웃 영역(r_cur > F(화면))은 원래 안전했다 — 순수 비율 그대로여야 한다(동작 불변).
  const e = shotCase({ elevation: 35, azimuth: 47, screenAspect: 1, aspect: 16 / 9, zoom: 3 });
  expect(e.out.fill).toBeCloseTo(e.wave1, 12);
  expect(e.radius).toBeGreaterThan(e.fit);                    // 사용자의 줌아웃을 끌어당기지 않는다
});
