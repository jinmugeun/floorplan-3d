// @vitest-environment jsdom
// §15.7: main.js가 267줄이라 프로젝트 단위 동작(새로 만들기·템플릿·내보내기·나가기·시작 화면)을
// app/projectActions.js로 뺐다 — dirty 판정이 이 네 동작에 함께 들어가기 때문이다.
import { test, expect, vi, beforeEach } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { createProjectActions } from '../src/app/projectActions.js';

function setup({ dirty = true, restored = null } = {}) {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  const toasts = [], saves = [], marks = [];
  const view = { fit: vi.fn() };
  const p = createProjectActions({ store, ui, view, toast: m => toasts.push(m), restored, isDirty: () => dirty, markSaved: () => marks.push(1), saveNow: () => saves.push(1) });
  return { store, ui, view, toasts, saves, marks, ...p };
}
const ok = () => document.querySelector('.modal.confirm [name="ok"]')?.click();
const flush = () => new Promise(r => setTimeout(r, 0));

// downloadText가 URL.createObjectURL을 쓰는데 jsdom에는 없다(tests/estimateDialog.test.js:44와 같은 방식).
beforeEach(() => {
  document.body.innerHTML = ''; localStorage.clear();
  global.URL.createObjectURL = () => 'blob:x';
  global.URL.revokeObjectURL = () => {};
});

test('새로 만들기는 작업 중일 때만 묻고, 비운 뒤 시작 화면을 띄운다', async () => {
  const a = setup({ dirty: true });
  addWalls(a.store, rectWalls([0, 0], [4000, 3000], 200));
  const run = a.actions.newProject();
  await flush();
  expect(document.querySelector('.modal.confirm')).not.toBeNull();
  ok();
  await run;
  expect(activeFloor(a.store.get()).walls).toHaveLength(0);
  expect(a.marks).toEqual([1]);                              // 빈 프로젝트는 "저장 안 된 변경"이 아니다
  expect(document.getElementById('startScreen')).not.toBeNull();
  expect(a.view.fit).toHaveBeenCalled();
});

test('저장 직후에는 새로 만들기를 묻지 않는다', async () => {
  const a = setup({ dirty: false });
  addWalls(a.store, rectWalls([0, 0], [4000, 3000], 200));
  await a.actions.newProject();
  expect(document.querySelector('.modal.confirm')).toBeNull();
  expect(activeFloor(a.store.get()).walls).toHaveLength(0);
});

test('나가기는 dirty 판정을 그대로 넘긴다', async () => {
  const a = setup({ dirty: false });
  addWalls(a.store, rectWalls([0, 0], [4000, 3000], 200));
  await a.actions.exit();
  expect(document.querySelector('.modal.confirm')).toBeNull();
  expect(document.getElementById('startScreen')).not.toBeNull();
});

test('시작 화면의 "이어서 작업"은 복원 뒤 저장된 상태로 표시한다', () => {
  const src = createStore(createEmptyProject());
  addWalls(src, rectWalls([0, 0], [4000.5, 3000.25], 200));
  const a = setup({ restored: src.get() });
  a.showStart();
  document.querySelector('[data-start="restore"]').click();
  expect(activeFloor(a.store.get()).walls).toHaveLength(4);
  expect(a.marks).toEqual([1]);
  expect(a.toasts).toEqual(['이어서 작업합니다']);
  expect(a.store.canUndo()).toBe(false);                     // 복원은 되돌릴 단계가 아니다
});

test('JSON 내보내기는 토스트를 띄운다', () => {
  const a = setup();
  a.actions.exportJson();
  expect(a.toasts).toEqual(['JSON을 내보냈습니다']);
});
