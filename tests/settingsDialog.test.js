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
