// §14.8: 같은 문구가 두 곳에서 갈라지지 않게 상수로 모은다(계획 4의 CONFIRM_ROOM_DELETE와 같은 자리).
import { test, expect } from 'vitest';
import { COLLISION_BANNER, COLLISION_ITEM, CLAMP_MAX, CLAMP_MIN, LAST_FLOOR, LAST_FLOOR_TITLE, MATERIAL_BOTH_SIDES, TEMPLATE_RESULT, PATH_MIN_POINTS, SAVED_MANUAL, savedAuto, savedManual, SAVED_DIRTY, SAVED_NONE, CONFIRM_LOAD, FP_BANNER, FP_EXIT, FP_NO_LOCK, WALL_DELETE_RESULT, ROOMS_GONE, DAMPER_ADDED, DAMPER_DELETED, PASTE_RESULT, CURVED_WALL_TITLE, CANVAS_LABEL, MINIMAP_LABEL } from '../src/ui/messages.js';
import { LOCKED_ITEM_EDIT, LOCKED_DUCT_EDIT, LOCKED_DUCT_DELETE, LOCKED_DUCT_MOVE, COPIED, COPIED_N, ARRAY_TOO_MANY, ARRAY_MULTI_WARN, LOADED, RESTORED, JSON_EXPORTED, TEMPLATE_SAVED, TEMPLATE_SAVE_FAIL, REPLACE_NONE, REPLACE_DONE, MATERIAL_REPLACED, STRUCTURES_SHOWN, PLAN_LOCKED, SPLIT_REGIONS_RESET, OPENING_NEEDS_WALL, KEYS_RESET, KEYS_LOADED, KEY_TAKEN, POPUP_BLOCKED, SHOT_SAVED, GALLERY_LOAD_FAIL, GALLERY_DELETE_FAIL, SPEC_IMAGES_FAIL, SPEC_FAIL } from '../src/ui/messages.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

test('잠금 거부는 한 벌이다(§16.8 · 감사 §35)', () => {
  expect(LOCKED_ITEM_EDIT).toBe('잠긴 제품은 편집할 수 없습니다');
  expect(LOCKED_DUCT_EDIT).toBe('잠긴 덕트는 편집할 수 없습니다');
  expect(LOCKED_DUCT_DELETE).toBe('잠긴 덕트는 삭제할 수 없습니다');
  expect(LOCKED_DUCT_MOVE).toBe('잠긴 덕트는 움직일 수 없습니다');
});

test('§16.8이 모은 나머지 문구도 한 곳에서 온다', () => {
  expect(COPIED).toBe('복사했습니다');
  expect(COPIED_N(4)).toBe('4개 복사했습니다');
  expect(ARRAY_TOO_MANY(300)).toBe('배치 수가 너무 많습니다(최대 300)');
  expect(LOADED).toBe('불러왔습니다');
  expect(TEMPLATE_SAVED('내 방')).toBe('템플릿 "내 방"을 저장했습니다');
  expect(REPLACE_DONE(3)).toBe('제품 3개를 교체했습니다');
  expect(KEY_TAKEN('Ctrl+Z', '실행 취소')).toBe('[Ctrl+Z]은 이미 "실행 취소"이(가) 쓰고 있습니다');
  expect(KEYS_LOADED).toBe('단축키를 불러왔습니다');
  expect(SPEC_IMAGES_FAIL(2)).toBe('도면 이미지 2장을 만들지 못했습니다');
  expect(SPEC_FAIL('메모리 부족')).toBe('시방서를 만들지 못했습니다: 메모리 부족');
  expect(POPUP_BLOCKED).toBe('팝업이 차단되어 인쇄 창을 열 수 없습니다');
});

// §16.8: 사용자에게 보이는 문구는 messages.js 한 곳에서 온다. 사람 눈으로는 30개가 지나갔으므로
// (감사 §37) 정적으로 센다 — toast( 호출의 첫 인자에 한국어 리터럴이 있으면 실패다.
// 그물은 문자열 리터럴 세 종류(홑·쌍따옴표·백틱)를 모두 덮고, 줄 주석·블록 주석은 먼저 지운다.
// 한계: 한 줄 안에서만 본다 — 문구를 줄바꿈해 숨기지 말 것(여러 줄로 쪼갠 호출은 못 잡는다).
const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
const walkJs = dir => readdirSync(dir, { withFileTypes: true })
  .flatMap(e => (e.isDirectory() ? walkJs(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : []));

test('src/의 toast( 인자에 한국어 리터럴이 없다(§16.8)', () => {
  const files = walkJs(SRC_DIR).filter(f => !f.endsWith('messages.js'));
  expect(files.length).toBeGreaterThan(50);            // 목록을 못 읽고 조용히 통과하지 않게
  const bad = [];
  for (const f of files) {
    const rel = f.slice(SRC_DIR.length + 1).replace(/\\/g, '/');
    readFileSync(f, 'utf8').split('\n').forEach((raw, i) => {
      const line = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/, '');   // 주석은 문구가 아니다
      // [^;]* = 첫 인자 구간을 문장 끝까지 본다: toast(fn(x) ? '한국어' : '')·toast(fmt(n) + '한국어')처럼
      // 인자 안에 )가 있는 모양도 잡는다([^)]*는 첫 )에서 끊겨 놓쳤다 — 리뷰 I-2).
      for (const m of line.matchAll(/\btoast\(\s*([^;]*)/g)) {
        if (/[가-힣]/.test(m[1])) bad.push(`${rel}:${i + 1} ${m[1].trim()}`);
      }
    });
  }
  expect(bad).toEqual([]);
});
