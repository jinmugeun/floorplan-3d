// 도면 크기(mm)에서 카메라 거리(m)를 정한다. 50° 시야각에서 가장 긴 변이 화면에 들어오도록 1.3배 여유를 둔다.
export function cameraDistance(extentMm) {
  const extent = Math.max(0, Number(extentMm) || 0) / 1000;
  return Math.max(10, extent * 1.3);
}

// 화면 맞추기의 여백 비율(§15.4). 가로·세로 양쪽에 이 비율만큼 남긴다.
export const FIT_MARGIN = 0.08;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mm = v => Math.max(0, Number(v) || 0) / 1000;

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
// width·depth(mm)를 주면 직사각형 도면을 그대로 쓰고, 없으면 extent를 양변으로 둔다(보수적 = 더 멀리).
export function fitDistance(extentMm, {
  aspect = 1, fov = 60, elevation = 90, azimuth = 0, height = 0, width = 0, depth = 0, margin = FIT_MARGIN,
} = {}) {
  const ext = mm(extentMm);
  const hx = (mm(width) || ext) / 2, hz = (mm(depth) || ext) / 2, hy = mm(height);
  const el = (Math.min(90, Math.max(1, Number(elevation) || 1)) * Math.PI) / 180;
  const { dir, right, up } = camAxes(el, ((Number(azimuth) || 0) * Math.PI) / 180);
  const k = 1 - 2 * Math.min(0.45, Math.max(0, Number(margin) || 0));   // 양쪽 여백을 뺀 실사용 비율
  const tanV = Math.tan((Math.min(170, Math.max(1, Number(fov) || 60)) * Math.PI) / 360);
  const tanH = tanV * Math.max(0.1, Number(aspect) || 1);
  let r = 6;                            // 빈·작은 도면에서도 카메라가 바닥에 처박히지 않는 최소 거리
  for (const x of [-hx, hx]) for (const y of [0, hy]) for (const z of [-hz, hz]) {
    const v = [x, y, z], back = dot(v, dir);
    r = Math.max(r, Math.abs(dot(v, up)) / (tanV * k) + back, Math.abs(dot(v, right)) / (tanH * k) + back);
  }
  return r;
}

// 2D/3D가 같은 이름으로 갖는 동작(화면 맞추기·줌)은 현재 모드의 뷰로 보낸다.
export const viewForMode = (mode, view2d, view3d) => (mode === '2d' ? view2d : view3d);
