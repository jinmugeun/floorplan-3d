// §14.8: 같은 문구가 두 곳에서 갈라지지 않게 상수로 모은다(계획 4의 CONFIRM_ROOM_DELETE와 같은 자리).
import { test, expect } from 'vitest';
import { COLLISION_BANNER, COLLISION_ITEM, CLAMP_MAX, CLAMP_MIN, LAST_FLOOR, LAST_FLOOR_TITLE, MATERIAL_BOTH_SIDES, TEMPLATE_RESULT, PATH_MIN_POINTS, SAVED_MANUAL, savedAuto, savedManual, SAVED_DIRTY, SAVED_NONE, CONFIRM_LOAD, FP_BANNER, FP_EXIT, FP_NO_LOCK, WALL_DELETE_RESULT, ROOMS_GONE, DAMPER_ADDED, DAMPER_DELETED, PASTE_RESULT, CURVED_WALL_TITLE, CANVAS_LABEL, MINIMAP_LABEL } from '../src/ui/messages.js';

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

test('벽 삭제 결과 문구는 §15.6이 정한 글자 그대로다', () => {
  expect(WALL_DELETE_RESULT(1, 2)).toBe('벽 1개와 붙어 있던 제품 2개를 삭제했습니다');
  expect(WALL_DELETE_RESULT(3, 1, 2)).toBe('벽 3개와 붙어 있던 제품 1개를 삭제했습니다 · 방 2개가 사라졌습니다');
  expect(WALL_DELETE_RESULT(1, 0, 0)).toBe('벽 1개와 붙어 있던 제품 0개를 삭제했습니다');
  expect(ROOMS_GONE(1)).toBe('방 1개가 사라졌습니다');
});

test('저장 표시·불러오기 확인 문구는 §15.7·§15.13이 정한 글자 그대로다', () => {
  expect(savedManual(new Date(2026, 8, 22, 1, 2))).toBe('01:02 파일로 저장');
  expect(savedManual(new Date(2026, 8, 22, 13, 40))).toBe('13:40 파일로 저장');
  expect(SAVED_DIRTY).toBe('저장 안 된 변경');
  expect(SAVED_NONE).toBe('저장 이력 없음');
  expect(CONFIRM_LOAD.message).toBe('현재 도면이 대체됩니다. 자동 저장본은 남습니다');
  expect(CONFIRM_LOAD.title).toBe('불러오기');
  expect(CONFIRM_LOAD.ok).toBe('불러오기');
});

test('피드백·이름 문구는 한 곳에서 온다(§15.14)', () => {
  expect(DAMPER_ADDED(3)).toBe('3구간에 댐퍼를 추가했습니다');
  expect(DAMPER_DELETED).toBe('댐퍼를 삭제했습니다');
  expect(PASTE_RESULT(2)).toBe('2개 붙여넣었습니다');
  expect(CURVED_WALL_TITLE).toBe('곡선벽은 아직 지원하지 않습니다');
  expect(CANVAS_LABEL).toBe('도면 캔버스');
  expect(MINIMAP_LABEL).toBe('미니맵 — 클릭하면 그 자리로 이동합니다');
});
