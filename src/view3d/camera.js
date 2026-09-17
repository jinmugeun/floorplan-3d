// three 좌표계(x 동, y 위, z 남)와 도면 좌표계(mm, x 동, y 남) 사이의 순수 변환.
// view3d.getCameraInfo가 이 두 함수를 쓴다. Vector3 대신 { x, y, z }만 읽으므로 three 없이 테스트된다.

// 카메라가 target을 보는 방위. 0 = 북(-z), 90 = 동(+x), 시계방향, 0 ≤ deg < 360. 높이(y)는 무시한다.
export function headingDeg(pos, target) {
  const dx = target.x - pos.x, dz = target.z - pos.z;
  if (dx === 0 && dz === 0) return 0; // 같은 점이면 북쪽으로 본다
  return ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
}

// three 미터 좌표 → 도면 mm 좌표 [x 동, y 남]. three의 z가 도면의 y다.
export function toWorldXY(v) { return [v.x * 1000, v.z * 1000]; }
