// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject } from '../src/state/schema.js';
import { openSettingsDialog } from '../src/ui/settingsDialog.js';
import { KEYMAP } from '../src/ui/keymap.js';

test('general tab writes settings and the language select is fixed to Korean', () => {
  const store = createStore(createEmptyProject());
  const dlg = openSettingsDialog({ store });
  const modal = document.querySelector('.modal');
  const lang = modal.querySelector('[name="language"]');
  expect(lang.disabled).toBe(true);
  expect(lang.value).toBe('ko');
  expect(modal.textContent).toContain('5분 간격');
  const py = modal.querySelector('[name="pyeong"]');
  py.checked = true; py.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().settings.pyeong).toBe(true);
  const su = modal.querySelector('[name="showUnit"]');
  su.checked = true; su.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().settings.showUnit).toBe(true);
  const bg = modal.querySelector('[name="background"]');
  bg.value = '#102030'; bg.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().settings.background).toBe('#102030');
  expect(store.canUndo()).toBe(false); // 설정은 되돌릴 단계가 아니다
  dlg.close();
  expect(document.querySelector('.modal')).toBeNull();
});

test('the shortcut tab renders every KEYMAP row grouped and read-only', () => {
  const store = createStore(createEmptyProject());
  openSettingsDialog({ store });
  const modal = document.querySelector('.modal');
  modal.querySelector('[data-tab="keys"]').click();
  const rows = modal.querySelectorAll('#keymapTable tbody tr');
  expect(rows).toHaveLength(KEYMAP.length);
  expect(modal.querySelector('#keymapTable').textContent).toContain('벽 그리기');
  expect(modal.querySelector('#keymapTable input')).toBeNull(); // 읽기 전용
  expect(modal.querySelector('#tabGeneral').hidden).toBe(true);
});

test('Escape closes the dialog without leaking to the page, and a second open reuses the first', () => {
  document.body.innerHTML = '';
  const store = createStore(createEmptyProject());
  const leaked = [];
  window.addEventListener('keydown', ev => leaked.push(ev.key));
  openSettingsDialog({ store });
  openSettingsDialog({ store }); // 두 번 열어도 하나만 있다
  expect(document.querySelectorAll('.modal.settings')).toHaveLength(1);
  const modal = document.querySelector('.modal.settings');
  modal.querySelector('[name="close"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('.modal.settings')).toBeNull();
  expect(leaked).toEqual([]); // stopPropagation으로 window까지 가지 않는다
});

test('단축키 탭에서 키를 다시 지정하고 초기화한다', async () => {
  document.body.innerHTML = '';
  localStorage.clear();
  const { loadOverrides } = await import('../src/ui/keyBindings.js');
  const store = createStore(createEmptyProject());
  openSettingsDialog({ store });
  const root = document.querySelector('.modal.settings');
  root.querySelector('[data-tab="keys"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const cell = root.querySelector('[data-bind="tool:wall"]');
  expect(cell.textContent).toContain('L');
  cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(cell.textContent).toBe('키를 누르세요');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }));
  expect(loadOverrides()).toEqual({ 'tool:wall': ['K'] });
  expect(root.querySelector('[data-bind="tool:wall"]').textContent).toContain('K');
  root.querySelector('[name="keyReset"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(loadOverrides()).toEqual({});
  expect(root.querySelector('[data-bind="tool:wall"]').textContent).toContain('L');
});

test('충돌하는 키와 Esc는 무시한다', async () => {
  document.body.innerHTML = '';
  localStorage.clear();
  const { loadOverrides } = await import('../src/ui/keyBindings.js');
  const store = createStore(createEmptyProject());
  openSettingsDialog({ store });
  const root = document.querySelector('.modal.settings');
  root.querySelector('[data-tab="keys"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  root.querySelector('[data-bind="tool:wall"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));   // 방 그리기가 쓰는 키
  expect(loadOverrides()).toEqual({});
  expect(document.querySelector('#toasts')?.textContent ?? '').toContain('이미');
  root.querySelector('[data-bind="tool:wall"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(loadOverrides()).toEqual({});
  expect(root.querySelector('[data-bind="tool:wall"]').textContent).toContain('L');
});
