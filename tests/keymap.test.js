// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createKeyHandler } from '../src/ui/keymap.js';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject } from '../src/state/schema.js';

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

test('in first-person mode tool letters and Delete are ignored but Escape and 1-4 still work', () => {
  const a = setup(); a.ui.set({ mode: 'fp' });
  a.key('d'); a.key('e'); a.key('f'); a.key('l'); a.key('m'); a.key('b'); a.key('Delete');
  expect(a.calls.setTool).toEqual([]); expect(a.calls.bg).toBe(0); expect(a.calls.del).toBe(0);
  a.key('2'); expect(a.calls.setMode).toEqual(['plan']);
  a.key('Escape'); expect(a.calls.setTool).toEqual(['select']);
});
