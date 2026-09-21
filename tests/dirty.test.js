// §15.7: "마지막 저장 뒤에 바뀐 것이 있나"를 스토어 알림 횟수로 센다(무엇이 바뀌었는지는 보지 않는다).
import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject } from '../src/state/schema.js';
import { createDirtyTracker } from '../src/app/dirty.js';

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
