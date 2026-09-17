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

test('project name is not interpreted as HTML and view checkboxes follow the loaded project', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject('<img src=x onerror="window.__pwned=1">'));
  createShell(root, { store, ui: createUiState() });
  expect(root.querySelector('#projectName').value).toBe('<img src=x onerror="window.__pwned=1">');
  expect(root.querySelector('#topbar img')).toBeNull();
  const grid = root.querySelector('input[data-view="grid"]'), labels = root.querySelector('input[data-view="labels"]');
  expect(grid.checked).toBe(true);
  store.replace({ ...store.get(), view: { ...store.get().view, grid: false, labels: false } }, { record: false }); // 불러온 프로젝트의 보기 설정
  expect(grid.checked).toBe(false); expect(labels.checked).toBe(false);
});
