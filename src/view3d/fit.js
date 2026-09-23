// 도면 크기(mm)에서 카메라 거리(m)를 정한다. 50° 시야각에서 가장 긴 변이 화면에 들어오도록 1.3배 여유를 둔다.
export function cameraDistance(extentMm) {
  const extent = Math.max(0, Number(extentMm) || 0) / 1000;
  return Math.max(10, extent * 1.3);
}

// 화면 맞추기의 여백 비율(§15.4). 가로·세로 양쪽에 이 비율만큼 남긴다.
export const FIT_MARGIN = 0.08;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mm = v => Math.max(0, Number(v) || 0) / 1000;
const sm = v => (Number(v) || 0) / 1000;   // 부호를 살린 mm→m(목표 어긋남은 음수가 된다)

// 카메라의 화면 축(단위벡터). 고도·방위의 정의는 view3d의 배치식과 같다:
//   pos = target + r · dir,  dir = (−cosEl·sinAz, sinEl, cosEl·cosAz)
// three의 lookAt이 up=(0,1,0)에서 만드는 축(z = dir, x = normalize(up × z), y = z × x)을
// 닫힌 식으로 푼 것이다 — 고도 90°에서도 성립한다(평면 모드: dir=(0,1,0), up=(0,0,−1)).
// 단 고도 90°는 **방위 0° 전제**다: 축퇴(dir ∥ up)에서 three는 lookAt의 보정(_z.z += 0.0001)으로
// 방위와 무관하게 up=(0,0,−1)을 쓰지만 이 식은 up=(sin az, 0, −cos az)를 돌려준다. 평면 모드가
// azimuth를 0으로 고정하므로(view3d.js의 frameScene) 지금은 닿지 않는다 — 그 전제를 바꾸려면
// 여기도 같이 고쳐야 한다(최종 리뷰 Minor 7).
function camAxes(el, az) {
  const ce = Math.cos(el), se = Math.sin(el), ca = Math.cos(az), sa = Math.sin(az);
  return { dir: [-ce * sa, se, ce * ca], right: [ca, 0, sa], up: [se * sa, ce, -se * ca] };
}

// 도면 bbox의 8꼭짓점이 모두 절두체 안에 여백 비율 margin으로 들어오는 최소 카메라 거리(m).
// 직교 근사("세로로 보이는 높이 = 깊이·sinEl + 층고·cosEl")는 시선에 수직인 평면(평면 모드)에서만
// 맞고, 고도 35°의 경사 **원근** 카메라에서는 도면 앞쪽 변이 카메라에 훨씬 가까워 화면에서 몇 배로
// 커진다 → 거리가 필요량의 절반 이하가 되어 8꼭짓점 중 5~6개가 프레임 밖으로 잘렸다(리뷰 B-1).
// 대신 꼭짓점 v(목표 기준 상대좌표)마다 닫힌 하한을 쓴다. 화면 오프셋은 r에 무관하고(up·right ⟂ dir)
// 깊이만 r에 선형이므로 한 번에 풀린다:
//   깊이 = r − dot(v, dir),  |오프셋| ≤ 깊이 · tan(화각/2) · k      (k = 1 − 2·margin)
//   → r ≥ |dot(v, up)|    / (tanV · k) + dot(v, dir)
//     r ≥ |dot(v, right)| / (tanH · k) + dot(v, dir)                (tanH = tanV · aspect)
// 8꼭짓점 × 2축의 최댓값이 답이다 — 종횡비 반영(§15.4)과 여백 8% 고정이 한 식에서 함께 성립한다
// (평면·ISO·좁은 뷰포트·작은 도면 모두 화면 점유가 정확히 k다).
// margin 대신 fill(목표 점유율 · 1 = 프레임 가득)을 줄 수도 있다: occupancyOf(fitDistance(…, { fill })) === fill이
// 성립하는 역함수 쌍이다(리뷰 N-1의 "화면보다 나빠지지 않는다" 규칙이 fill > 1도 써야 한다 — 확대해 둔
// 화면은 도면이 프레임을 넘치는 것이 정상이고, 그 넘침을 **그대로** 지켜야 사용자의 줌이 보존된다).
// width·depth(mm)를 주면 직사각형 도면을 그대로 쓰고, 없으면 extent를 양변으로 둔다(보수적 = 더 멀리).
// offsetMm은 **목표가 bbox 기준점(가로·세로 중앙 · 바닥 y=0)에서 벗어난 양**(three 축 순서 x,y,z · mm)이다:
// 절두체는 목표를 향해 중심이 잡히므로 꼭짓점도 목표 기준으로 넣어야 한다. 오른쪽 드래그 팬은 목표를
// 얼마든지 옮기고(view3d의 MOUSE.PAN), 그 어긋남을 빼놓으면 벗어난 쪽이 잘렸다(리뷰 I-2).
export function fitDistance(extentMm, {
  aspect = 1, fov = 60, elevation = 90, azimuth = 0, height = 0, width = 0, depth = 0, margin = FIT_MARGIN, offsetMm = null, fill = 0,
} = {}) {
  const ext = mm(extentMm);
  const hx = (mm(width) || ext) / 2, hz = (mm(depth) || ext) / 2, hy = mm(height);
  const ox = sm(offsetMm?.[0]), oy = sm(offsetMm?.[1]), oz = sm(offsetMm?.[2]);
  const el = (Math.min(90, Math.max(1, Number(elevation) || 1)) * Math.PI) / 180;
  const { dir, right, up } = camAxes(el, ((Number(azimuth) || 0) * Math.PI) / 180);
  const k = Number(fill) > 0 ? Number(fill) : 1 - 2 * Math.min(0.45, Math.max(0, Number(margin) || 0));   // 양쪽 여백을 뺀 실사용 비율
  const tanV = Math.tan((Math.min(170, Math.max(1, Number(fov) || 60)) * Math.PI) / 360);
  const tanH = tanV * Math.max(0.1, Number(aspect) || 1);
  let r = 6;                            // 빈·작은 도면에서도 카메라가 바닥에 처박히지 않는 최소 거리
  for (const x of [-hx - ox, hx - ox]) for (const y of [-oy, hy - oy]) for (const z of [-hz - oz, hz - oz]) {
    const v = [x, y, z], back = dot(v, dir);
    r = Math.max(r, Math.abs(dot(v, up)) / (tanV * k) + back, Math.abs(dot(v, right)) / (tanH * k) + back);
  }
  return r;
}

// 거리 radius에서 bbox 8꼭짓점이 프레임을 실제로 얼마나 채우는가(1.0이 프레임 경계 = 잘리기 직전).
// fitDistance의 역함수 격이다: 여백 비율 m으로 잡은 거리를 넣으면 정확히 1 − 2m이 나온다.
// 좌표·부호·클램프 규약이 fitDistance와 한 글자도 다르지 않아야 그 성질이 성립한다(같은 camAxes·tan·꼭짓점).
// plan=true는 평면 모드 카메라가 lookAt 퇴화를 피해 목표에서 z로 0.01 m 비켜 서는 실제 코드를 따른다
// (그 자리에서 three의 lookAt이 만드는 축은 방위 0 · 고도 atan2(r, 0.01)의 camAxes와 같다 — 이상적인
//  수직 축이 아니라 그만큼 기울어진 축이고, 점유가 그 몫만큼 커지는 것까지 재야 한다).
// tests/fit.test.js의 occupancy()를 그대로 올린 것이다 — 이제 shotPosition도 같은 식으로 잘림을 판단한다(리뷰 N-1).
export function occupancyOf({
  radius = 0, extentMm = 0, aspect = 1, fov = 60, elevation = 90, azimuth = 0, height = 0, width = 0, depth = 0,
  offsetMm = null, plan = false,
} = {}) {
  const ext = mm(extentMm);
  const hx = (mm(width) || ext) / 2, hz = (mm(depth) || ext) / 2, hy = mm(height);
  const ox = sm(offsetMm?.[0]), oy = sm(offsetMm?.[1]), oz = sm(offsetMm?.[2]);
  const el = (Math.min(90, Math.max(1, Number(elevation) || 1)) * Math.PI) / 180;
  const r = Math.max(0, Number(radius) || 0);
  const { dir, right, up } = plan ? camAxes(Math.atan2(r, 0.01), 0) : camAxes(el, ((Number(azimuth) || 0) * Math.PI) / 180);
  const pr = plan ? Math.hypot(r, 0.01) : r;                             // 비켜선 자리까지의 실제 거리
  const pos = [dir[0] * pr, dir[1] * pr, dir[2] * pr];
  const tanV = Math.tan((Math.min(170, Math.max(1, Number(fov) || 60)) * Math.PI) / 360);
  const tanH = tanV * Math.max(0.1, Number(aspect) || 1);
  let fillV = 0, fillH = 0, front = Infinity;
  for (const x of [-hx - ox, hx - ox]) for (const y of [-oy, hy - oy]) for (const z of [-hz - oz, hz - oz]) {
    const v = [x - pos[0], y - pos[1], z - pos[2]], zd = -dot(v, dir);   // zd = 카메라 앞쪽 깊이
    front = Math.min(front, zd);
    fillV = Math.max(fillV, Math.abs(dot(v, up)) / (zd * tanV));
    fillH = Math.max(fillH, Math.abs(dot(v, right)) / (zd * tanH));
  }
  return { fill: Math.max(fillV, fillH), fillV, fillH, front };
}

// 2D/3D가 같은 이름으로 갖는 동작(화면 맞추기·줌)은 현재 모드의 뷰로 보낸다.
export const viewForMode = (mode, view2d, view3d) => (mode === '2d' ? view2d : view3d);

// three 좌표(미터, y 위)의 카메라 자리를 고도·방위·거리로 읽는다(§16.9). 정의는 frameScene의
// 배치식과 같다: pos = target + r(−cosEl·sinAz, sinEl, cosEl·cosAz).
// 순수 함수라 three 없이 { x, y, z }만 읽는다(camera.js와 같은 규칙).
export function orbitOf(position, target) {
  const dx = position.x - target.x, dy = position.y - target.y, dz = position.z - target.z;
  const radius = Math.hypot(dx, dy, dz);
  if (!(radius > 0)) return { elevation: 90, azimuth: 0, radius: 0 };
  const elevation = (Math.asin(Math.min(1, Math.max(-1, dy / radius))) * 180) / Math.PI;
  const azimuth = (Math.atan2(-dx, dz) * 180) / Math.PI;
  return { elevation, azimuth, radius };
}

// 방향은 그대로 두고 거리만 바꾼 카메라 자리. 반지름이 0이면(목표와 같은 자리) 그대로 돌려준다.
export function reframePosition(position, target, radius) {
  const dx = position.x - target.x, dy = position.y - target.y, dz = position.z - target.z;
  const r = Math.hypot(dx, dy, dz);
  if (!(r > 0) || radius === r) return { x: position.x, y: position.y, z: position.z };
  const k = radius / r;
  return { x: target.x + dx * k, y: target.y + dy * k, z: target.z + dz * k };
}

// "현재 카메라" 렌더샷의 재프레이밍을 해도 되는 상황인가(§16.9 · 리뷰 I-1).
// - preset(정면·평면…)은 orthoViewParams가 이미 출력 종횡비를 받는다.
// - 화면 카메라가 아니거나 원근이 아니면(2D 투영의 ortho2) 거리·궤도 개념이 없다.
// - controls가 꺼진 상태(1인칭)에서는 controls.target이 마지막 궤도 목표에 남아 있어 궤도를 잘못
//   읽고, 회전은 1인칭 시선 그대로여서 화면과 무관한 그림이 저장됐다.
// - projection:'ortho'는 controls.enabled를 건드리지 않는다 — 그 경우는 isPerspective가 막는다(리뷰 N-3).
export function canReframeShot({ preset = null, isScreenCamera = false, isPerspective = false, controlsEnabled = false } = {}) {
  return !preset && !!isScreenCamera && !!isPerspective && !!controlsEnabled;
}

// 렌더샷 한 장을 위한 카메라 자리: 방향과 **사용자의 줌**을 지키고 화면↔출력 종횡비 차이만 보정한다.
// 도면 전체로 다시 맞추지 않는다(리뷰 I-4): 그러면 후드 한 대를 확대해 둔 화면에서 주방 전체가
// 나와 "현재 카메라"라는 이름과 어긋난다 — 고치려던 WYSIWYG 결함을 방향만 바꿔 남기는 셈이다.
//
// 규칙: **화면보다 나빠지지 않는다**(리뷰 N-1). 출발은 fit 거리들의 비율이다
//   r_ratio = r_cur × F(출력) / F(화면)
// 이지만 원근에서 점유는 1/r이 아니라 1/(r − dot(v,dir))로 가므로 상사변환이 아니다 — 사용자가
// 화면 맞추기보다 안쪽으로(10%만 더) 확대해 두면 이 비율이 필요 이상으로 당겨 화면에 **전부 들어와
// 있던** 도면이 더 넓은 출력에서 잘렸다(실측: 화면 점유 0.942 → 출력 1.011 · 저고도에서는 3.55까지).
// 그래서 현재 화면의 점유 S를 같은 식(occupancyOf)으로 재고, 출력 점유가 cap = max(S, 1 − 2·FIT_MARGIN)을
// 넘지 않는 최소 거리를 닫힌 식으로 구해(= fitDistance(fill: cap) · occupancyOf의 역함수) 비율값과 큰 쪽을 쓴다:
//   - 보정은 **멀어지는 쪽으로만** 한다(더 당기는 일은 없다) → 출력이 화면보다 더 잘리는 일은 없다.
//   - cap ≥ 1 − 2·FIT_MARGIN이므로 그 거리는 절대 F(출력)을 넘지 않는다 = "화면 맞추기"보다 멀어지지 않는다.
//   - S = 0.84(화면 맞추기 직후 · 감사 §10의 원래 경우)면 비율값과 같아 수정 파동 1의 동작 그대로다.
//   - 줌아웃 상태(r_cur > F(화면))는 비율값이 이미 F(출력)보다 멀어 그대로 통과한다.
//   - S > 1(확대해 둔 화면 — 도면이 프레임을 넘치는 정상 상태)도 **1로 깎지 않는다**: 깎으면 도면 전체
//     맞춤으로 물러나 I-4가 되돌린 결함이 되살아난다. 넘침의 정도를 그대로 지킨다.
//   - 카메라가 bbox **안**이면(꼭짓점이 뒤에 있다 = front ≤ 0 · 후드 한 대를 확대해 둔 상태) 8꼭짓점
//     점유는 뜻이 없다(깊이가 음수인 꼭짓점이 섞인다) → 판단을 포기하고 비율값을 그대로 쓴다. 이 영역은
//     N-1의 증상("화면에 전부 들어와 있었는데 출력에서 잘린다")이 애초에 성립하지 않는다(전부 들어와 있지 않다).
// 출력 비율이 화면과 같으면 보정할 것이 없다 → 반지름을 비트 그대로 지킨다(줌 보존의 기본 보장).
// center는 bbox 기준점(가로·세로 중앙 · 바닥)의 three 좌표(m)다 — 목표가 팬으로 벗어난 만큼을 반영한다(I-2).
export function shotPosition({
  position, target, center = null, extentMm, aspect = 1, screenAspect = 0, fov = 60, height = 0, width = 0, depth = 0,
}) {
  const o = orbitOf(position, target);
  const offsetMm = center ? [(target.x - center.x) * 1000, (target.y - center.y) * 1000, (target.z - center.z) * 1000] : null;
  const base = { extentMm, fov, elevation: o.elevation, azimuth: o.azimuth, height, width, depth, offsetMm };
  const sa = Number(screenAspect) > 0 ? screenAspect : aspect;
  const out = fitDistance(extentMm, { ...base, aspect });
  const screen = fitDistance(extentMm, { ...base, aspect: sa });
  // 보정할 것이 없는지는 **종횡비**로 판단한다(리뷰 N-5): 두 fit 거리는 둘 다 세로 구속이거나 둘 다 6 m 바닥에
  // 걸려 우연히 같아질 수 있고, 그때 확대해 둔 카메라는 가로 구속이라 더 좁은 출력에서 잘렸다(실측 0.99 → 1.11).
  if (!(screen > 0) || sa === aspect) return reframePosition(position, target, o.radius);
  const ratio = (o.radius * out) / screen;
  const seen = occupancyOf({ ...base, aspect: sa, radius: o.radius });
  if (!(seen.front > 0)) return reframePosition(position, target, ratio);           // 카메라가 bbox 안 = 점유로 못 잰다
  const safe = fitDistance(extentMm, { ...base, aspect, fill: Math.max(seen.fill, 1 - 2 * FIT_MARGIN) });
  return reframePosition(position, target, Math.max(ratio, safe));                  // safe ≤ F(출력)이 늘 성립한다
}
