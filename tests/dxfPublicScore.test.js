// 공개 정답 코퍼스 점수판(tools/dxf-corpus/public.mjs)의 방 열 — IoU 표(정답 방 × 우리 방)에서 roomHit·falseRooms·splitRooms를 낸다.
// 2026-10-12 · 계획 13 Task 7: splitRooms(과분할)는 계획 12 Task 6 리뷰 m-3 — falseRooms는 정답 하나를 반으로 가른 구획선을 보지 못한다
// (두 조각이 저마다 그 정답과 IoU ≥ 0.2라 헛방이 아니고, roomHit도 IoU ≥ 0.5인 조각이 없으면 그냥 놓친 방일 뿐이다).
import { test, expect } from 'vitest';
import { roomScores, HIT_IOU, FALSE_IOU } from '../tools/dxf-corpus/roomScore.mjs';

test('문턱: 적중 IoU 0.5 · 헛방/과분할 IoU 0.2', () => {
  expect([HIT_IOU, FALSE_IOU]).toEqual([0.5, 0.2]);
});

test('splitRooms: 정답 방 하나를 우리 방 둘 이상이 각각 IoU ≥ 0.2로 덮으면 하나 — falseRooms는 그 조각들을 세지 않는다', () => {
  // 정답 3 × 우리 4: 정답 0은 반으로 갈렸다(0.45 · 0.45), 정답 1은 하나로 맞혔다(0.9), 정답 2는 셋으로 갈렸다(0.3 · 0.25 · 0.19 — 셋째는 문턱 밑).
  const M = [
    [0.45, 0.45, 0, 0],
    [0, 0, 0.9, 0],
    [0, 0.3, 0, 0.25],
  ];
  expect(roomScores(M, 4)).toEqual({ roomHit: 1, falseRooms: 0, splitRooms: 2 });
  // 문턱에 걸친 값(0.2)은 덮은 것이다 — falseRooms와 같은 ≥.
  expect(roomScores([[0.2, 0.2]], 2)).toEqual({ roomHit: 0, falseRooms: 0, splitRooms: 1 });
  // 하나만 IoU ≥ 0.2이고 나머지는 스친 정도(0.1)면 과분할이 아니고, 스친 방은 헛방이다.
  expect(roomScores([[0.6, 0.1]], 2)).toEqual({ roomHit: 1, falseRooms: 1, splitRooms: 0 });
});

test('정답이 0개인 도면(6suite (5)): falseRooms는 재지 않고(null) splitRooms는 0', () => {
  expect(roomScores([], 50)).toEqual({ roomHit: 0, falseRooms: null, splitRooms: 0 });
  // 우리 방이 0개여도 정답 행은 남는다 — 놓친 방이지 과분할이 아니다.
  expect(roomScores([[], []], 0)).toEqual({ roomHit: 0, falseRooms: 0, splitRooms: 0 });
});
