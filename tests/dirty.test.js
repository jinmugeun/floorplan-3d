// @vitest-environment jsdom
// §15.7: "마지막 저장 뒤에 바뀐 것이 있나"를 스토어 알림 횟수로 센다(무엇이 바뀌었는지는 보지 않는다).
import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject } from '../src/state/schema.js';
import { createDirtyTracker, createSaveIndicator } from '../src/app/dirty.js';

test('저장 직후는 깨끗하고, 한 번 바뀌면 dirty다', () => {
  const store = createStore(createEmptyProject());
  const seen = [];
  const d = createDirtyTracker(store, { onChange: on => seen.push(on) });
  expect(d.isDirty()).toBe(false);          // 만들자마자는 깨끗하다(알림도 없다)
  expect(seen).toEqual([]);
  store.dispatch(s => { s.name = 'a'; });
  expect(d.isDirty()).toBe(true);
  expect(seen).toEqual([true]);
  d.markSaved();
  expect(d.isDirty()).toBe(false);
  expect(seen).toEqual([true, false]);
  // 보기 옵션({ record: false })도 프로젝트 파일에 들어가므로 dirty다.
  store.dispatch(s => { s.view.v2.grid = false; }, { record: false });
  expect(d.isDirty()).toBe(true);
  // undo도 "바뀐 것"이다(저장한 상태와 다르다).
  d.markSaved();
  store.undo();
  expect(d.isDirty()).toBe(true);
});

test('replace 뒤 markSaved면 깨끗하다(불러오기·복원)', () => {
  const store = createStore(createEmptyProject());
  const d = createDirtyTracker(store);
  store.replace(createEmptyProject());
  expect(d.isDirty()).toBe(true);
  d.markSaved();
  expect(d.isDirty()).toBe(false);
  d.destroy();
  store.dispatch(s => { s.name = 'b'; });
  expect(d.isDirty()).toBe(false);          // 떼어 낸 뒤에는 세지 않는다
});

// 프로젝트 파일에 들어가지 않는 것(선택·도구·패널 같은 화면 상태)은 ui 스토어에 있고, 추적기는
// 프로젝트 스토어만 본다: 클릭해서 고른 것만으로 "저장 안 된 변경"이 되지 않는다(§15.7).
test('화면 상태(ui)만 바뀌면 dirty가 아니다', () => {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  const d = createDirtyTracker(store);
  ui.set({ selection: { type: 'wall', id: 'w1' }, tool: 'wall' });
  expect(d.isDirty()).toBe(false);
});

// 리뷰 M1: 불러오기·새로만들기가 markSaved(false)로 추적기를 비우면서 상단 바에 "HH:MM 자동
// 저장됨"을 적었다 — 그 순간 저장은 일어나지 않았으므로 표시가 다시 거짓말을 한 것이다(감사 §18).
test('저장 표시는 kind가 정한다: manual · auto · none', () => {
  document.body.innerHTML = '<span id="savedAt">x</span>';
  const store = createStore(createEmptyProject());
  const d = createDirtyTracker(store);
  const at = new Date(2026, 8, 22, 1, 2);
  const ind = createSaveIndicator(d, { now: () => at });
  const shown = () => document.getElementById('savedAt').textContent;

  ind.markSaved('manual');
  expect(shown()).toBe('01:02 파일로 저장');
  ind.markSaved('auto');
  expect(shown()).toBe('01:02 자동 저장됨');
  // 자동 저장 콜백은 실제 저장 시각을 넘긴다(표시 시각 = 저장 시각).
  ind.markSaved('auto', new Date(2026, 8, 22, 13, 5));
  expect(shown()).toBe('13:05 자동 저장됨');
  // 새로 만들기·불러오기: clean이지만 저장 이력은 없다 — "자동 저장됨"이라고 적지 않는다.
  ind.markSaved('none');
  expect(shown()).toBe('저장 이력 없음');
  expect(shown()).not.toContain('자동 저장됨');
  expect(d.isDirty()).toBe(false);
  // 그 뒤 한 번 바뀌면 "저장 안 된 변경"이 시각보다 먼저다.
  ind.markSaved('auto');
  store.dispatch(s => { s.name = 'a'; });
  expect(ind.label()).toBe('저장 안 된 변경');
});

test('show는 표시만 다시 그린다(#savedAt이 없어도 던지지 않는다)', () => {
  document.body.innerHTML = '';
  const store = createStore(createEmptyProject());
  const ind = createSaveIndicator(createDirtyTracker(store));
  expect(() => ind.show()).not.toThrow();
  expect(ind.label()).toBe('저장 이력 없음');   // 이력이 없는 첫 화면
});
