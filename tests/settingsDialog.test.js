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

test('단축키 탭 안내문이 다중 키 재지정 동작을 설명한다', () => {
  const store = createStore(createEmptyProject());
  openSettingsDialog({ store });
  const modal = document.querySelector('.modal');
  modal.querySelector('[data-tab="keys"]').click();
  expect(modal.querySelector('#tabKeys .hint').textContent).toContain('키를 누르면 그 동작의 모든 키가 새 키 하나로 바뀝니다');
});

test('itemCombo·도구가 먼저 가져가는 예약 키로 재지정하면 충돌 토스트를 띄우고 저장하지 않는다', async () => {
  document.body.innerHTML = '';
  localStorage.clear();
  const { loadOverrides } = await import('../src/ui/keyBindings.js');
  const store = createStore(createEmptyProject());
  openSettingsDialog({ store });
  const root = document.querySelector('.modal.settings');
  root.querySelector('[data-tab="keys"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  root.querySelector('[data-bind="tool:wall"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));   // 제품 복사가 쓰는 키
  expect(loadOverrides()).toEqual({});
  expect(document.querySelector('#toasts')?.textContent ?? '').toContain('제품 복사');
  root.querySelector('[data-bind="tool:wall"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));   // 제품 이동이 쓰는 키
  expect(loadOverrides()).toEqual({});
  expect(document.querySelector('#toasts')?.textContent ?? '').toContain('제품 이동');
});

test('여러 키를 가진 삭제를 다시 지정하면 새 키 하나로 바뀌고, 초기화하면 원래 두 키로 되돌아온다', async () => {
  document.body.innerHTML = '';
  localStorage.clear();
  const { loadOverrides } = await import('../src/ui/keyBindings.js');
  const store = createStore(createEmptyProject());
  openSettingsDialog({ store });
  const root = document.querySelector('.modal.settings');
  root.querySelector('[data-tab="keys"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const cell = root.querySelector('[data-bind="delete"]');
  expect(cell.textContent).toContain('Delete');
  expect(cell.textContent).toContain('Backspace');
  cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
  expect(loadOverrides()).toEqual({ delete: ['X'] });
  const rebound = root.querySelector('[data-bind="delete"]').textContent;
  expect(rebound).toContain('X');
  expect(rebound).not.toContain('Delete');
  expect(rebound).not.toContain('Backspace');
  root.querySelector('[name="keyReset"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const reset = root.querySelector('[data-bind="delete"]').textContent;
  expect(reset).toContain('Delete');
  expect(reset).toContain('Backspace');
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

// 재검토 Important 1: 실제 Alt 조합 keydown도 예약 키로 잡혀야 한다(keyLabel이 altKey를 읽는다).
test('실제 Alt+H keydown을 캡처하면 예약 키(좌우 반전) 충돌로 막고 저장하지 않는다', async () => {
  document.body.innerHTML = '';
  localStorage.clear();
  const { loadOverrides, keyLabel } = await import('../src/ui/keyBindings.js');
  expect(keyLabel({ key: 'h', altKey: true })).toBe('Alt+H');
  expect(keyLabel({ key: 'h', altKey: true, ctrlKey: true })).toBe('Ctrl+H'); // Ctrl이 우선(표의 토큰과 같다)
  const store = createStore(createEmptyProject());
  openSettingsDialog({ store });
  const root = document.querySelector('.modal.settings');
  root.querySelector('[data-tab="keys"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  root.querySelector('[data-bind="tool:wall"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', altKey: true, bubbles: true }));
  expect(loadOverrides()).toEqual({});
  expect(document.querySelector('#toasts')?.textContent ?? '').toContain('Alt+H');
});

test('일반 탭의 "시작 안내 다시 보기"가 설정을 닫고 온보딩을 연다', () => {
  document.body.innerHTML = '';
  localStorage.setItem('kvp.onboarded', '1');
  const store = createStore(createEmptyProject());
  openSettingsDialog({ store });
  const b = document.querySelector('.modal.settings [name="replayOnboarding"]');
  expect(b.textContent).toBe('시작 안내 다시 보기');
  b.click();
  expect(document.querySelector('.modal.settings')).toBeNull();
  expect(document.querySelector('.modal.onboarding')).not.toBeNull();
  document.querySelector('.modal.onboarding [name="skip"]').click();
  localStorage.clear();
});

test('tab: "keys"로 열면 단축키 탭이 먼저 보인다', () => {
  document.body.innerHTML = '';
  const store = createStore(createEmptyProject());
  openSettingsDialog({ store, tab: 'keys' });
  const modal = document.querySelector('.modal.settings');
  expect(modal.querySelector('#tabKeys').hidden).toBe(false);
  expect(modal.querySelector('#tabGeneral').hidden).toBe(true);
  expect(modal.querySelector('[data-tab="keys"]').classList.contains('on')).toBe(true);
  openSettingsDialog({ store, tab: 'general' });          // 이미 열려 있으면 탭만 바꾼다
  expect(document.querySelectorAll('.modal.settings')).toHaveLength(1);
  expect(document.querySelector('.modal.settings #tabGeneral').hidden).toBe(false);
});

// §14.7: "그린 뒤 도구 유지"는 프로젝트가 아니라 브라우저에 남는다(kvp.stickyTools).
test('일반 탭의 "그린 뒤 도구 유지"가 kvp.stickyTools를 쓴다', () => {
  localStorage.clear();
  const store = createStore(createEmptyProject());
  const dlg = openSettingsDialog({ store });
  const modal = document.querySelector('.modal.settings');
  const cb = modal.querySelector('[name="stickyTools"]');
  expect(cb.checked).toBe(true);                         // 기본은 켜짐
  cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
  expect(localStorage.getItem('kvp.stickyTools')).toBe('0');
  expect(store.canUndo()).toBe(false);                   // 되돌릴 단계가 아니다
  expect(JSON.stringify(store.get())).not.toContain('stickyTools');  // 저장 형식은 그대로다
  dlg.close();
  localStorage.clear();
});
