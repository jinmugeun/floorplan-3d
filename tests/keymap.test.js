// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createKeyHandler, KEYMAP, TABLE, FP_ALLOWED, PREVENT, tokenOf } from '../src/ui/keymap.js';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { createSelectTool } from '../src/view2d/tools/selectTool.js';

function setup(toolConsumes = false) {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const calls = { setTool: [], setMode: [], bg: 0, del: 0, save: 0 };
  const view = { tool: { onKey: vi.fn(() => toolConsumes) }, requestRender: vi.fn() };
  const h = createKeyHandler({ store, ui, view, setTool: n => calls.setTool.push(n), setMode: m => calls.setMode.push(m), openBackground: () => calls.bg++, deleteSelection: () => calls.del++, save: () => calls.save++ });
  const key = (key, extra = {}) => h({ key, target: document.body, preventDefault() {}, ...extra });
  return { store, ui, view, calls, key };
}

test('a consuming tool blocks app keys; otherwise app keys route', () => {
  const a = setup(true); a.key('f'); a.key('z', { ctrlKey: true });
  expect(a.calls.setTool).toEqual([]); expect(a.view.requestRender).toHaveBeenCalledTimes(2);
  const b = setup(false); b.key('f'); b.key('l'); b.key('d'); b.key('e'); b.key('m'); b.key('b'); b.key('2'); b.key('4'); b.key('Delete'); b.key('s', { ctrlKey: true });
  expect(b.calls.setTool).toEqual(['room', 'wall', 'delete', 'guide', 'measure']); expect(b.calls.bg).toBe(1);
  expect(b.calls.setMode).toEqual(['plan', 'fp']); expect(b.calls.del).toBe(1); expect(b.calls.save).toBe(1);
});

test('escape clears fpPick and returns to select', () => {
  const a = setup(); a.ui.set({ fpPick: true }); a.key('Escape');
  expect(a.ui.get().fpPick).toBe(false); expect(a.calls.setTool).toEqual(['select']);
});

test('ctrl+z undoes and ctrl+shift+z redoes', () => {
  const a = setup(); a.store.dispatch(d => { d.name = 'x'; });
  a.key('z', { ctrlKey: true }); expect(a.store.get().name).toBe('새 프로젝트');
  a.key('z', { ctrlKey: true, shiftKey: true }); expect(a.store.get().name).toBe('x');
});

test('keys are ignored while typing in an input', () => {
  const a = setup(); a.key('f', { target: document.createElement('input') });
  expect(a.calls.setTool).toEqual([]); expect(a.view.tool.onKey).not.toHaveBeenCalled();
});

test('modified letters (ctrl/meta/alt) are left to the browser', () => {
  const a = setup();
  a.key('f', { ctrlKey: true }); a.key('l', { metaKey: true }); a.key('d', { altKey: true });
  expect(a.calls.setTool).toEqual([]); expect(a.calls.del).toBe(0);
});

test('Ctrl+digit is not forwarded to the active tool, but Ctrl+Z is', () => {
  const a = setup(false);
  a.key('1', { ctrlKey: true });
  expect(a.view.tool.onKey).not.toHaveBeenCalled();
  a.key('z', { ctrlKey: true });
  expect(a.view.tool.onKey).toHaveBeenCalledTimes(1);
});

test('in first-person mode tool letters and Delete are ignored but Escape and 1-4 still work', () => {
  const a = setup(); a.ui.set({ mode: 'fp' });
  a.key('d'); a.key('e'); a.key('f'); a.key('l'); a.key('m'); a.key('b'); a.key('Delete');
  expect(a.calls.setTool).toEqual([]); expect(a.calls.bg).toBe(0); expect(a.calls.del).toBe(0);
  a.key('2'); expect(a.calls.setMode).toEqual(['plan']);
  a.key('Escape'); expect(a.calls.setTool).toEqual(['select']);
});

test('d calls deleteOrTool instead of setTool', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const view = { tool: { onKey: vi.fn(() => false) }, requestRender: vi.fn() };
  const setTool = vi.fn(); const deleteSelection = vi.fn(); const deleteOrTool = vi.fn();
  const h = createKeyHandler({ store, ui, view, setTool, setMode: vi.fn(), openBackground: vi.fn(), deleteSelection, deleteOrTool });
  const key = (key, extra = {}) => h({ key, target: document.body, preventDefault() {}, ...extra });
  key('d');
  expect(deleteOrTool).toHaveBeenCalledTimes(1);
  expect(setTool).not.toHaveBeenCalled();
});

test('Delete calls deleteSelection', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const view = { tool: { onKey: vi.fn(() => false) }, requestRender: vi.fn() };
  const deleteSelection = vi.fn();
  const h = createKeyHandler({ store, ui, view, setTool: vi.fn(), setMode: vi.fn(), openBackground: vi.fn(), deleteSelection });
  const key = (key, extra = {}) => h({ key, target: document.body, preventDefault() {}, ...extra });
  key('Delete');
  expect(deleteSelection).toHaveBeenCalledTimes(1);
});

test('KEYMAP is a complete, well-formed table', () => {
  expect(KEYMAP.length).toBeGreaterThanOrEqual(20);
  for (const e of KEYMAP) {
    expect(typeof e.group).toBe('string');
    expect(typeof e.label).toBe('string');
    expect(Array.isArray(e.keys) && e.keys.length > 0).toBe(true);
  }
  const labels = KEYMAP.map(e => e.label);
  expect(labels).toContain('벽 그리기');
  expect(labels).toContain('전체 선택');
  expect(labels).toContain('설정');
  expect(KEYMAP.find(e => e.label === '벽 그리기').keys).toEqual(['L']);
  expect(KEYMAP.some(e => e.keys.includes('Shift+클릭') && e.action === null)).toBe(true);
  expect(new Set(KEYMAP.map(e => e.group)).size).toBeGreaterThanOrEqual(4);
});

test('new actions route: Ctrl+A selects all, Ctrl+comma opens settings, +/- zoom, 0 fits', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const view = { tool: { onKey: vi.fn(() => false) }, requestRender: vi.fn(), fit: vi.fn() };
  const calls = { selectAll: 0, settings: 0, zoomIn: 0, zoomOut: 0, fit: 0 };
  const h = createKeyHandler({ store, ui, view, setTool: vi.fn(), setMode: vi.fn(), openBackground: vi.fn(), deleteSelection: vi.fn(),
    selectAll: () => calls.selectAll++, openSettings: () => calls.settings++, zoomIn: () => calls.zoomIn++, zoomOut: () => calls.zoomOut++, fit: () => calls.fit++ });
  const key = (k, extra = {}) => h({ key: k, target: document.body, preventDefault() {}, ...extra });
  key('a', { ctrlKey: true }); key(',', { ctrlKey: true }); key('+'); key('-'); key('0');
  expect(calls).toEqual({ selectAll: 1, settings: 1, zoomIn: 1, zoomOut: 1, fit: 1 });
});

// 실제 선택 도구를 물려서 확인한다: 스텁이 아니면 Esc가 앱까지 오는지가 도구 구현에 달려 있다.
function setupReal() {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const view = { camera: { scale: 0.1 }, fit: vi.fn(), requestRender: vi.fn(), tool: null };
  view.tool = createSelectTool({ store, ui, view });
  const setTool = vi.fn();
  const h = createKeyHandler({ store, ui, view, setTool, setMode: vi.fn(), openBackground: vi.fn(), deleteSelection: vi.fn() });
  return { store, ui, setTool, esc: () => h({ key: 'Escape', target: document.body, preventDefault() {} }) };
}

test('Escape clears soloRoom through the app even with the real select tool active', () => {
  const a = setupReal();
  const room = activeFloor(a.store.get()).rooms[0];
  a.ui.set({ soloRoom: room.id, selection: { type: 'room', id: room.id } });
  a.esc();
  expect(a.ui.get().soloRoom).toBeNull();
  expect(a.ui.get().selection).toBeNull();
  expect(a.setTool).toHaveBeenCalledWith('select');
});

test('Escape with only a selection is consumed by the select tool', () => {
  const a = setupReal();
  a.ui.set({ selection: { type: 'wall', id: activeFloor(a.store.get()).walls[0].id } });
  a.esc();
  expect(a.ui.get().selection).toBeNull();
  expect(a.setTool).not.toHaveBeenCalled(); // 도구가 소비했으므로 앱은 관여하지 않는다
  a.esc(); // 취소할 것이 없으면 도구는 소비하지 않고 앱이 선택 모드로 돌아간다
  expect(a.setTool).toHaveBeenCalledWith('select');
});

test('Escape clears fpPick even while a wall is selected', () => {
  const a = setupReal();
  a.ui.set({ fpPick: true, selection: { type: 'wall', id: activeFloor(a.store.get()).walls[0].id } });
  a.esc();
  expect(a.ui.get().fpPick).toBe(false);
  expect(a.setTool).toHaveBeenCalledWith('select');
});

test('Ctrl+Shift+Z also reaches the tool first so a drag can be cancelled', () => {
  const a = setup(true); // 도구가 소비한다
  a.key('z', { ctrlKey: true, shiftKey: true });
  expect(a.view.tool.onKey).toHaveBeenCalledTimes(1);
  expect(a.store.canRedo()).toBe(false); // 도구가 소비했으므로 redo는 실행되지 않는다
  const b = setup(false);
  b.store.dispatch(d => { d.name = 'x'; });
  b.key('z', { ctrlKey: true }); b.key('z', { ctrlKey: true, shiftKey: true });
  expect(b.store.get().name).toBe('x'); // 소비하지 않으면 그대로 redo까지 간다
});

test('keys composed by the IME are ignored', () => {
  const a = setup(false);
  a.key('f', { isComposing: true });
  a.key('ㄷ', { keyCode: 229 });
  expect(a.calls.setTool).toEqual([]);
  expect(a.view.tool.onKey).not.toHaveBeenCalled();
});

// 2B가 쓰는 내부 표들이 export되어 있는지(핸들러를 다시 구현하지 않고 재사용하기 위해).
test('the key table, fp allow-list, prevent-list and tokenOf are exported', () => {
  expect(TABLE.get('esc')).toBe('escape');
  expect(TABLE.get('ctrl+shift+z')).toBe('redo');
  expect(TABLE.get('l')).toBe('tool:wall');
  expect(FP_ALLOWED.has('mode:iso')).toBe(true);
  expect(FP_ALLOWED.has('tool:wall')).toBe(false);
  expect(PREVENT.has('save')).toBe(true);
  expect(tokenOf({ key: 'Escape' })).toBe('esc');
  expect(tokenOf({ key: ' ' })).toBe('space');
  expect(tokenOf({ key: 'z', ctrlKey: true, shiftKey: true })).toBe('ctrl+shift+z');
  expect(tokenOf({ key: 'S', metaKey: true })).toBe('ctrl+s');
});

test('a key consumed by the tool also has its browser default prevented', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  let prevented = 0;
  const view = { tool: { onKey: ev => ev.key === 'ArrowRight' }, requestRender: () => {} };
  const h = createKeyHandler({ store, ui, view, setTool: () => {}, setMode: () => {}, openBackground: () => {}, deleteSelection: () => {}, deleteOrTool: () => {} });
  h({ key: 'ArrowRight', preventDefault: () => { prevented++; }, target: { tagName: 'BODY' } });
  h({ key: 'ArrowLeft', preventDefault: () => { prevented++; }, target: { tagName: 'BODY' } }); // 도구가 안 먹는 키는 표에도 없어 그대로 둔다
  expect(prevented).toBe(1);
});
