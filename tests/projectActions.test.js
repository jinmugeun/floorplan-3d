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
import { createDirtyTracker, createSaveIndicator } from '../src/app/dirty.js';

function setup({ dirty = true, restored = null } = {}) {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  const toasts = [], saves = [], marks = [];
  const view = { fit: vi.fn() };
  const p = createProjectActions({ store, ui, view, toast: m => toasts.push(m), restored, isDirty: () => dirty, markSaved: (kind = 'auto') => marks.push(kind), saveNow: () => saves.push(1) });
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
  expect(a.marks).toEqual(['none']);                         // 빈 프로젝트는 저장된 것도 아니다(리뷰 M1)
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
  expect(a.marks).toEqual(['auto']);                          // 복원한 상태는 자동 저장본과 같다
  expect(a.toasts).toEqual(['이어서 작업합니다']);
  expect(a.store.canUndo()).toBe(false);                     // 복원은 되돌릴 단계가 아니다
});

test('JSON 내보내기는 토스트를 띄운다', () => {
  const a = setup();
  a.actions.exportJson();
  expect(a.toasts).toEqual(['JSON을 내보냈습니다']);
});

// 리뷰 M1: 새로 만든 직후 상단 바가 "HH:MM 자동 저장됨"이라고 적혀 있었다(저장은 일어나지 않았다).
// 배선(추적기 + 표시)까지 함께 걸어 라벨 자체를 본다 — main.js의 세 줄이 회귀하지 않게.
test('새로 만들기 뒤 표시는 "저장 이력 없음"이다("자동 저장됨"이 아니다)', async () => {
  document.body.innerHTML = '<span id="savedAt">x</span>';
  const store = createStore(createEmptyProject());
  const d = createDirtyTracker(store);
  const ind = createSaveIndicator(d);
  const p = createProjectActions({ store, ui: createUiState(), view: { fit: vi.fn() }, isDirty: () => d.isDirty(), markSaved: ind.markSaved });
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  ind.markSaved('auto');                                     // 5분 자동 저장이 한 번 지나간 뒤라고 하자
  expect(document.getElementById('savedAt').textContent).toContain('자동 저장됨');
  await p.actions.newProject();                              // clean이므로 묻지 않는다
  expect(ind.label()).toBe('저장 이력 없음');
  expect(document.getElementById('savedAt').textContent).not.toContain('자동 저장됨');
  expect(d.isDirty()).toBe(false);
});

// §17.3(감사 §21): 샘플·복원·템플릿·새로 만들기 — 어느 경로로 프로젝트를 갈아 끼워도
// 되돌리기 스택은 비어 있어야 한다. 네 경로를 한 표로 못 박는다.
test('프로젝트를 갈아 끼우는 네 경로는 되돌릴 단계를 남기지 않는다', async () => {
  const restored = createEmptyProject('복원본');
  const a = setup({ dirty: false, restored });
  const cases = [
    ['sample', '[data-start="sample"]'],
    ['restore', '[data-start="restore"]'],
    ['template', '[data-template="builtin-studio"]'],
  ];
  for (const [name, sel] of cases) {
    // 교체 전에 되돌릴 단계를 실제로 쌓아 둔다(이것이 남아 있으면 Ctrl+Z가 옛 도면으로 간다).
    addWalls(a.store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200));
    expect(a.store.canUndo()).toBe(true);
    a.showStart({ restore: restored });
    document.querySelector(sel).click();
    await flush();
    expect([name, a.store.canUndo(), a.store.canRedo()]).toEqual([name, false, false]);
    document.body.innerHTML = '';
  }
  // 새로 만들기는 작업 중이면 확인창을 지난다. dirty:false이므로 곧바로 비운다.
  addWalls(a.store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200));
  await a.actions.newProject();
  expect(a.store.canUndo()).toBe(false);
  expect(a.store.canRedo()).toBe(false);
});
