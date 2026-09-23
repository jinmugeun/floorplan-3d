// 층 기본 이름의 정본(§17.12 이월 M-22). normalizeFloor(state/schema.js)와 addFloor(state/floorMgmt.js)가
// 둘 다 써야 하는데 floorMgmt.js는 schema.js를 import한다(반대 방향은 순환이다) — 그래서 정본은
// schema.js 쪽이어야 한다. 다만 schema.js는 299줄 예산에 두 줄만 남아(계획 9 "파일 크기 계획" I-7)
// 함수를 이 잎 모듈로 내리고 schema.js·floorMgmt.js가 다시 내보낸다. 이 파일은 아무것도 import하지
// 않으므로 어느 쪽에서도 순환이 생기지 않는다.

// 기본 층 이름은 아직 쓰이지 않는 가장 작은 Floor N이다("Floor 2"가 이미 있으면 Floor 3).
export function defaultFloorName(floors = []) {
  const used = new Set((floors ?? []).map(f => f?.name));
  let n = 1;
  while (used.has(`Floor ${n}`)) n += 1;
  return `Floor ${n}`;
}
