// 도면 크기(mm)에서 카메라 거리(m)를 정한다. 50° 시야각에서 가장 긴 변이 화면에 들어오도록 1.3배 여유를 둔다.
export function cameraDistance(extentMm) {
  const extent = Math.max(0, Number(extentMm) || 0) / 1000;
  return Math.max(10, extent * 1.3);
}

// 화면 맞추기의 여백 비율(§15.4). 가로·세로 양쪽에 이 비율만큼 남긴다.
export const FIT_MARGIN = 0.08;

// 도면이 뷰포트에 8% 여백으로 들어오는 최소 카메라 거리(m). cameraDistance와 달리 뷰포트
// 종횡비와 카메라 고도를 본다: 2560×1440(비율 1.39)에서 세로 기준만 쓰면 모델이 절반만
// 차고(감사 §12), 좁은 뷰포트에서는 반대로 도면이 잘렸다.
//   · 화면 가로로 보이는 폭  = 도면 폭(extent)
//   · 화면 세로로 보이는 높이 = 도면 깊이 × sin(고도) + 층고 × cos(고도)
// 평면(고도 90°)이면 두 번째 식이 도면 깊이 그대로가 된다.
export function fitDistance(extentMm, { aspect = 1, fov = 50, elevation = 90, height = 0, margin = FIT_MARGIN } = {}) {
  const extent = Math.max(0, Number(extentMm) || 0) / 1000;
  const h = Math.max(0, Number(height) || 0) / 1000;
  const el = (Math.min(89, Math.max(1, Number(elevation) || 1)) * Math.PI) / 180;
  const wantW = extent;
  const wantH = extent * Math.sin(el) + h * Math.cos(el);
  const k = 1 - 2 * Math.min(0.45, Math.max(0, Number(margin) || 0));   // 양쪽 여백을 뺀 실사용 비율
  const vFov = (Math.min(170, Math.max(1, Number(fov) || 50)) * Math.PI) / 180;
  const tanV = Math.tan(vFov / 2);
  const tanH = tanV * Math.max(0.1, Number(aspect) || 1);
  return Math.max(6, Math.max(wantH / 2 / k / tanV, wantW / 2 / k / tanH));
}

// 2D/3D가 같은 이름으로 갖는 동작(화면 맞추기·줌)은 현재 모드의 뷰로 보낸다.
export const viewForMode = (mode, view2d, view3d) => (mode === '2d' ? view2d : view3d);
