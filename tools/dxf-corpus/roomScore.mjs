// 공개 정답 코퍼스(public.mjs)의 방 열 — IoU 표에서 세 열을 낸다(2026-10-12 · 계획 13 Task 7: 테스트할 수 있게 public.mjs에서 떼어 냈다 —
// public.mjs는 불러오는 순간 코퍼스를 도는 스크립트라 테스트가 import하지 못한다).
// M[i][j] = 정답 방 i와 우리 방 j의 IoU(public.mjs의 iou — 200 mm 격자 표본), ours = 우리 방 수(정답이 0개면 M이 빈 배열이라 따로 받는다).
export const HIT_IOU = 0.5;     // roomHit: 정답 방이 우리 방 하나와 이만큼 겹치면 맞힌 것
export const FALSE_IOU = 0.2;   // falseRooms·splitRooms: 이 IoU에 못 미치면 그 정답 방과 겹친다고 보지 않는다(2026-10-12 · 계획 12 Task 5 리뷰 M5-1)

export function roomScores(M, ours) {
  const roomHit = M.filter(row => row.some(v => v >= HIT_IOU)).length;
  // falseRooms(계획 12 Task 5 리뷰 M5-1): 우리 방 중 어느 정답 방과도 IoU < FALSE_IOU인 것 — 정답에 없는 방(헛방). roomHit만 보면 구획선이 방을
  // 잘게 쪼개 정답 하나를 맞히고 헛방 여럿을 남겨도 좋아진 것으로 보인다. 정답이 0개인 도면(6suite (5))은 모든 방이 헛방이 되므로 재지 않는다
  // (null · 합계에는 0으로 더한다).
  const falseRooms = M.length ? Array.from({ length: ours }, (_, j) => j).filter(j => !M.some(row => row[j] >= FALSE_IOU)).length : null;
  // splitRooms(계획 12 Task 6 리뷰 m-3): 정답 방 중 우리 방 **둘 이상**이 각각 IoU ≥ FALSE_IOU로 덮는 것 — 과분할. falseRooms는 쪼갠 조각이
  // 저마다 정답과 IoU ≥ 0.2이면 헛방으로 세지 않아, 정답 하나를 반으로 가른 구획선이 두 열 어디에도 잡히지 않았다. 정답이 0개면 0이다.
  const splitRooms = M.filter(row => row.filter(v => v >= FALSE_IOU).length >= 2).length;
  return { roomHit, falseRooms, splitRooms };
}
