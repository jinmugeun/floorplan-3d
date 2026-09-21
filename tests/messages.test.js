// §14.8: 같은 문구가 두 곳에서 갈라지지 않게 상수로 모은다(계획 4의 CONFIRM_ROOM_DELETE와 같은 자리).
import { test, expect } from 'vitest';
import { COLLISION_BANNER, COLLISION_ITEM, CLAMP_MAX, CLAMP_MIN, LAST_FLOOR, LAST_FLOOR_TITLE, MATERIAL_BOTH_SIDES, TEMPLATE_RESULT, PATH_MIN_POINTS, SAVED_MANUAL, savedAuto, FP_BANNER, FP_EXIT, FP_NO_LOCK } from '../src/ui/messages.js';

test('§14가 글자까지 정한 문구는 그대로다', () => {
  expect(COLLISION_BANNER(3)).toBe('충돌 3건 — 빨간 테두리 제품을 옮겨 주세요');
  expect(COLLISION_ITEM).toBe('다른 제품과 겹칩니다');
  expect(CLAMP_MAX(8000)).toBe('최대 8000 mm까지');
  expect(CLAMP_MIN(2)).toBe('최소 2 mm까지');
  expect(MATERIAL_BOTH_SIDES).toBe('내·외벽 모두 적용');
  expect(TEMPLATE_RESULT(5, 2, 1)).toBe('5개 배치 · 2개 위치 조정 · 1개 건너뜀');
  expect(PATH_MIN_POINTS).toBe('점을 2개 이상 찍어 주세요');
  expect(LAST_FLOOR).toBe('마지막 층은 삭제할 수 없습니다');
  expect(SAVED_MANUAL).toBe('파일로 저장했습니다');
  expect(LAST_FLOOR_TITLE).toBe('층이 하나뿐입니다');
});

test('자동 저장 시각은 시·분을 0으로 채운다', () => {
  expect(savedAuto(new Date(2026, 8, 22, 1, 2))).toBe('01:02 자동 저장됨');
  expect(savedAuto(new Date(2026, 8, 22, 13, 40))).toBe('13:40 자동 저장됨');
  expect(typeof savedAuto()).toBe('string');            // 인자가 없으면 지금 시각
});

test('1인칭 안내 문구는 §15.1이 정한 글자 그대로다', () => {
  expect(FP_BANNER).toBe('1인칭 — WASD 이동 · 드래그로 둘러보기 · [Esc] 나가기');
  expect(FP_EXIT).toBe('나가기');
  expect(FP_NO_LOCK).toBe('마우스 잠금을 쓸 수 없어 드래그로 둘러봅니다');
});
