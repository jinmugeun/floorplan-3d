// 도면 크기(mm)에서 카메라 거리(m)를 정한다. 50° 시야각에서 가장 긴 변이 화면에 들어오도록 1.3배 여유를 둔다.
export function cameraDistance(extentMm) {
  const extent = Math.max(0, Number(extentMm) || 0) / 1000;
  return Math.max(10, extent * 1.3);
}

// 2D/3D가 같은 이름으로 갖는 동작(화면 맞추기·줌)은 현재 모드의 뷰로 보낸다.
export const viewForMode = (mode, view2d, view3d) => (mode === '2d' ? view2d : view3d);
