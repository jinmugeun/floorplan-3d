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
import { DXF_EXPORTED, DXF_FEEDBACK_NONE, DXF_FEEDBACK_EXPORTED } from '../src/ui/messages.js';
import * as M from '../src/ui/messages.js';
import { buildImportMeta } from '../src/io/dxfFeedback.js';
import { saveTemplate, templateProject } from '../src/templates/projectTemplates.js';

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

// 2026-10-12 · 계획 12 Task 3: 정규화 DXF는 .dxf(application/dxf)로 내려받고 알린다(내보내기 코드는 누를 때 불러온다).
test('정규화 DXF 내보내기는 .dxf 파일을 내려받고 알린다', async () => {
  const a = setup();
  addWalls(a.store, rectWalls([0, 0], [4000, 3000], 200));
  const blobs = [], names = [];
  global.URL.createObjectURL = b => { blobs.push(b); return 'blob:x'; };
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { names.push(this.download); });
  await a.actions.exportDxf();
  click.mockRestore();
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/\.dxf$/);
  expect(blobs[0].type).toBe('application/dxf');
  expect(a.toasts).toEqual([DXF_EXPORTED]);
  // 2026-10-12 · 최종 리뷰 X-6(N3-3): 통로 "n곳 읽히지 않음" 알림은 죽은 코드였다(skippedPasses가 늘 0) — 문구째 지웠다.
  expect(M.DXF_EXPORTED_SKIPPED).toBeUndefined();
});

// 2026-10-12 · 최종 리뷰 X-6(M3-3): 내보내기 코드는 누를 때 불러오는 청크라, 탭을 연 채 재배포를 지나면 "Failed to fetch dynamically imported
// module"로 실패한다 — 그 거절이 토스트 없이 사라졌다. 청크 로드 실패든 내보내기 예외든 알리고, 파일은 쓰지 않으며, 동작은 던지지 않는다.
test('정규화 DXF 내보내기가 실패하면(청크 로드 실패 · 내보내기 예외) 알리고 파일을 쓰지 않는다', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  for (const factory of [
    () => { throw new TypeError('Failed to fetch dynamically imported module'); },
    () => ({ buildDxf: () => { throw new Error('boom'); } }),
  ]) {
    vi.resetModules();
    vi.doMock('../src/io/dxfExport.js', factory);
    const a = setup();
    addWalls(a.store, rectWalls([0, 0], [4000, 3000], 200));
    await expect(a.actions.exportDxf()).resolves.toBeUndefined();
    expect(a.toasts).toEqual([M.DXF_EXPORT_FAILED]);
    vi.doUnmock('../src/io/dxfExport.js');
  }
  expect(click).not.toHaveBeenCalled();
  click.mockRestore(); warn.mockRestore();
  expect(typeof M.DXF_EXPORT_FAILED).toBe('string');
});

// 2026-10-13 · 계획 16 Task B: 아키스케치용 DXF — 같은 내보내기에 프로필만 'archisketch'(레이어 wall_층고·door·window·column). 이름은 <이름>-archisketch.dxf.
const readBlob = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsText(b); });   // tests/dxfFeedback.test.js와 같은 꼴
test('exportDxfArchisketch는 아키스케치 프로필로 -archisketch.dxf를 내려주고 끊지 못한 통로 수와 함께 알린다', async () => {
  const a = setup();
  addWalls(a.store, rectWalls([0, 0], [4000, 3000], 200));
  const blobs = [], names = [];
  global.URL.createObjectURL = b => { blobs.push(b); return 'blob:x'; };
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { names.push(this.download); });
  await a.actions.exportDxfArchisketch();
  click.mockRestore();
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/-archisketch\.dxf$/);
  expect(blobs[0].type).toBe('application/dxf');
  const text = await readBlob(blobs[0]);
  expect(text).toContain('\nwall_');
  expect(text).not.toContain('\nWALL\n');
  expect(a.toasts.at(-1)).toBe(M.DXF_EXPORTED_AS(0));
  // 문구: 0이면 통로 말이 없고, n이면 수를 덧붙인다(buildDxf.uncutPasses — 아키스케치 파일에는 블록도 틈도 없다).
  expect(M.DXF_EXPORTED_AS(0)).not.toContain('통로');
  expect(M.DXF_EXPORTED_AS(3)).toContain('통로 3개는 빠졌습니다');
});

// 2026-10-12 · 계획 12 Task 10: 교정 기록은 DXF로 가져온 프로젝트(meta.dxfImport)에서만 — 아니면 알리기만 하고 아무것도 쓰지 않는다.
test('교정 기록 내보내기: DXF로 가져온 프로젝트가 아니면 알리고 파일을 쓰지 않는다', () => {
  const a = setup();
  addWalls(a.store, rectWalls([0, 0], [4000, 3000], 200));
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  a.actions.exportDxfFeedback();
  expect(click).not.toHaveBeenCalled();
  click.mockRestore();
  expect(a.toasts).toEqual([DXF_FEEDBACK_NONE]);
});

test('교정 기록 내보내기는 <이름>-dxf-feedback.json(application/json)을 내려받고 수를 알린다', () => {
  const a = setup();
  addWalls(a.store, rectWalls([0, 0], [4000, 3000], 200));
  a.store.swap({ ...a.store.get(), meta: { dxfImport: buildImportMeta({ project: a.store.get(), fileName: 'a.dxf', opts: { layers: ['WAL'] } }) } });
  const blobs = [], names = [];
  global.URL.createObjectURL = b => { blobs.push(b); return 'blob:x'; };
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { names.push(this.download); });
  a.actions.exportDxfFeedback();
  click.mockRestore();
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/^새 프로젝트_\d{8}-\d{4}-dxf-feedback\.json$/);
  expect(blobs[0].type).toBe('application/json');
  expect(a.toasts).toEqual([DXF_FEEDBACK_EXPORTED({ changes: 0 })]);
});

// 2026-10-12 · 최종 리뷰 X-8(M10-3): 템플릿이 meta.dxfImport(가져온 직후 스냅숏 · 파일 이름)를 복사해, 그 템플릿으로 시작한 모든 프로젝트가
// 남의 가져오기를 기준으로 "교정 기록"을 냈다. 템플릿에는 가져오기 기록을 싣지 않는다(다른 meta 필드는 그대로 · 원 프로젝트도 그대로).
test('템플릿으로 저장한 프로젝트에서 시작하면 교정 기록이 없다 — "DXF로 가져온 프로젝트가 아닙니다"', () => {
  const a = setup();
  addWalls(a.store, rectWalls([0, 0], [4000, 3000], 200));
  a.store.swap({ ...a.store.get(), meta: { dxfImport: buildImportMeta({ project: a.store.get(), fileName: 'a.dxf', opts: { layers: ['WAL'] } }), other: { keep: 1 } } });
  const saved = saveTemplate('가져온 평면', a.store.get());
  expect(a.store.get().meta.dxfImport.fileName).toBe('a.dxf');                  // 원 프로젝트의 기록은 그대로다
  const p = templateProject(saved.id);
  expect(p.meta).toEqual({ other: { keep: 1 } });
  a.store.swap(p);
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  a.actions.exportDxfFeedback();
  expect(click).not.toHaveBeenCalled();
  click.mockRestore();
  expect(a.toasts).toEqual([DXF_FEEDBACK_NONE]);
  // meta가 가져오기 기록뿐이면 meta째 뺀다(옛 파일처럼 meta 없는 템플릿).
  a.store.swap({ ...a.store.get(), meta: { dxfImport: buildImportMeta({ project: a.store.get(), fileName: 'b.dxf' }) } });
  expect('meta' in templateProject(saveTemplate('둘째', a.store.get()).id)).toBe(false);
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
  // 되돌릴 단계와 다시 할 단계를 **둘 다** 쌓아 둔 채로 교체를 지나간다(리뷰 M-2): 단계를 하나만
  // 쌓으면 future가 원래 비어 있어 canRedo() 단정이 공허하다.
  const dirtyUp = s => {
    addWalls(s, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200));
    addWalls(s, rectWalls([9000.5, 0.25], [12000.5, 3000.25], 200));
    s.undo();                                                  // 되돌린 단계가 redo 스택에 남는다
    expect([s.canUndo(), s.canRedo()]).toEqual([true, true]);
  };
  for (const [name, sel] of cases) {
    // 교체 전에 되돌릴 단계를 실제로 쌓아 둔다(이것이 남아 있으면 Ctrl+Z가 옛 도면으로 간다).
    dirtyUp(a.store);
    a.showStart({ restore: restored });
    document.querySelector(sel).click();
    await flush();
    expect([name, a.store.canUndo(), a.store.canRedo()]).toEqual([name, false, false]);
    document.body.innerHTML = '';
  }
  // 새로 만들기는 작업 중이면 확인창을 지난다. dirty:false이므로 곧바로 비운다.
  dirtyUp(a.store);
  await a.actions.newProject();
  expect(a.store.canUndo()).toBe(false);
  expect(a.store.canRedo()).toBe(false);
});
