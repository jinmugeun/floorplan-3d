// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createKeyHandler, KEYMAP } from '../src/ui/keymap.js';
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
