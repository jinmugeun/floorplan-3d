// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject } from '../src/state/schema.js';
import { createShell } from '../src/ui/shell.js';

test('shell renders regions and option bar reflects tool opts', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const shell = createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
  for (const id of ['topbar', 'rail', 'panel', 'c2d', 'c3d', 'optionBar', 'props', 'bottombar', 'minimap']) expect(root.querySelector('#' + id)).not.toBeNull();
  const tool = { name: 'wall', opts: { reference: 'center', thickness: 200, snap: true, ortho: true } };
  shell.setOptionBar(tool);
  const th = root.querySelector('#optionBar input[name="thickness"]');
  th.value = '150'; th.dispatchEvent(new Event('change', { bubbles: true }));
  expect(tool.opts.thickness).toBe(150);
  const sel = root.querySelector('#optionBar select[name="reference"]');
  sel.value = 'inner'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  expect(tool.opts.reference).toBe('inner');
});

test('option bar shows a hint when opts is empty but hint is set', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const shell = createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
  shell.setOptionBar({ name: 'delete', opts: {}, hint: '안내' });
  expect(root.querySelector('#optionBar').hidden).toBe(false);
  expect(root.querySelector('#optionBar').textContent).toContain('안내');
});

test('option bar hides when both opts and hint are empty', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const shell = createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
  shell.setOptionBar({ name: 'x', opts: {} });
  expect(root.querySelector('#optionBar').hidden).toBe(true);
});

test('project name is not interpreted as HTML', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject('<img src=x onerror="window.__pwned=1">'));
  createShell(root, { store, ui: createUiState() });
  expect(root.querySelector('#projectName').value).toBe('<img src=x onerror="window.__pwned=1">');
  expect(root.querySelector('#topbar img')).toBeNull();
});

test('the 보기 popover writes v2 flags in 2D and v3 flags in 3D without adding undo steps', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject()); const ui = createUiState();
  createShell(root, { store, ui });
  root.querySelector('#btnView').click();
  const grid = document.querySelector('.popover input[data-v2="grid"]');
  expect(grid.checked).toBe(true);
  grid.checked = false; grid.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().view.v2.grid).toBe(false);
  expect(store.canUndo()).toBe(false);
  ui.set({ mode: 'iso' });
  const outer = document.querySelector('.popover input[data-v3="outerWalls"]'); // 모드 변경이 팝오버를 다시 그린다
  outer.checked = false; outer.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().view.v3.outerWalls).toBe(false);
  const display = document.querySelector('.popover select[data-view="display"]');
  display.value = 'white'; display.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().view.display).toBe('white');
});

test('the bottom bar unit toggle writes project.units and follows the loaded project', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject());
  createShell(root, { store, ui: createUiState() });
  root.querySelector('[data-units="ftin"]').click();
  expect(store.get().units).toBe('ftin');
  expect(root.querySelector('[data-units="ftin"]').classList.contains('on')).toBe(true);
  expect(store.canUndo()).toBe(false); // 단위 전환은 되돌릴 단계가 아니다
  store.replace({ ...store.get(), units: 'mm' }, { record: false });
  expect(root.querySelector('[data-units="mm"]').classList.contains('on')).toBe(true);
});

test('camera and sun buttons appear only in 3D and their sliders and preset buttons write the view', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject()); const ui = createUiState();
  createShell(root, { store, ui });
  expect(root.querySelector('#btnCam').hidden).toBe(true);
  expect(root.querySelector('#btnSun').hidden).toBe(true);
  ui.set({ mode: 'iso' });
  expect(root.querySelector('#btnCam').hidden).toBe(false);
  root.querySelector('#btnCam').click();
  const elev = document.querySelector('.popover input[data-view="cameraPreset.elevation"]');
  elev.value = '12'; elev.dispatchEvent(new Event('input', { bubbles: true }));
  expect(store.get().view.cameraPreset.elevation).toBe(12);
  document.querySelector('.popover [data-preset="cameraPreset.elevation:89"]').click();
  expect(store.get().view.cameraPreset.elevation).toBe(89);
  expect(document.querySelector('.popover input[data-view="cameraPreset.elevation"]').value).toBe('89'); // 다시 그려진다
  root.querySelector('#btnSun').click();
  const hour = document.querySelector('.popover input[data-view="sun.hour"]');
  hour.value = '17'; hour.dispatchEvent(new Event('input', { bubbles: true }));
  expect(store.get().view.sun.hour).toBe(17);
  expect(store.canUndo()).toBe(false);
});

test('the bottom bar has zoom, lock and capture controls and the lock button follows the project', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject());
  createShell(root, { store, ui: createUiState() });
  expect(root.querySelector('#btnZoomIn')).not.toBeNull();
  expect(root.querySelector('#btnZoomOut')).not.toBeNull();
  expect(root.querySelectorAll('[data-action="capture"]')).toHaveLength(2); // 상단 바 + 하단 바
  root.querySelector('#btnLock').click();
  expect(store.get().view.lockPlan).toBe(true);
  expect(root.querySelector('#btnLock').classList.contains('on')).toBe(true);
  expect(store.canUndo()).toBe(false);
});

test('the image strip appears with a background and drives opacity, visibility and the lock', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject());
  createShell(root, { store, ui: createUiState() });
  expect(root.querySelector('#imageStrip').hidden).toBe(true);
  store.dispatch(d => { d.background = { src: 'data:,', width: 10, height: 10, scale: 1, offset: [0, 0], opacity: 0.5, visible: true, locked: true }; }, { record: false });
  const strip = root.querySelector('#imageStrip');
  expect(strip.hidden).toBe(false);
  expect(strip.textContent).toContain('이미지 세팅');
  const op = strip.querySelector('[name="stripOpacity"]');
  op.value = '0.25'; op.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().background.opacity).toBe(0.25);
  const vis = strip.querySelector('[name="stripVisible"]');
  vis.checked = false; vis.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().background.visible).toBe(false);
  root.querySelector('#btnBgLock').click();
  expect(store.get().background.locked).toBe(false); // 잠금 해제가 된다
  expect(root.querySelector('#btnBgLock').classList.contains('on')).toBe(false);
  root.querySelector('#btnBgLock').click();
  expect(store.get().background.locked).toBe(true);
  expect(store.canUndo()).toBe(false); // 표시 설정은 되돌릴 단계가 아니다
});

test('the image strip is only shown in 2D mode', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject()); const ui = createUiState();
  createShell(root, { store, ui });
  store.dispatch(d => { d.background = { src: 'data:,', width: 10, height: 10, scale: 1, offset: [0.5, 0.25], opacity: 0.5, visible: true, locked: true }; }, { record: false });
  const strip = root.querySelector('#imageStrip');
  expect(strip.hidden).toBe(false);
  ui.set({ mode: 'iso' });
  expect(strip.hidden).toBe(true);
  ui.set({ mode: '2d' });
  expect(strip.hidden).toBe(false);
});
