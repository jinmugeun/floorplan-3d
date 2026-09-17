// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { openStartScreen } from '../src/ui/startScreen.js';

test('three cards route to their callbacks and the overlay closes', () => {
  const store = createStore(createEmptyProject());
  const calls = [];
  const s = openStartScreen({ store, onEmpty: () => calls.push('empty'), onUpload: () => calls.push('upload'), onSample: () => calls.push('sample') });
  const overlay = document.querySelector('#startScreen');
  expect(overlay).not.toBeNull();
  expect(overlay.querySelectorAll('.start-card')).toHaveLength(3);
  expect(overlay.textContent).toContain('강당중 조리실');
  overlay.querySelector('[data-start="sample"]').click();
  expect(calls).toEqual(['sample']);
  expect(document.querySelector('#startScreen')).toBeNull();
  const again = openStartScreen({ store, onEmpty: () => calls.push('empty') });
  document.querySelector('[data-start="empty"]').click();
  expect(calls).toEqual(['sample', 'empty']);
  again.close(); // 이미 닫혔어도 안전하다
});

test('the sample card actually fills the store when wired to loadSample', async () => {
  const { loadSample } = await import('../src/samples/gangdang.js');
  const store = createStore(createEmptyProject());
  openStartScreen({ store, onSample: () => loadSample(store) });
  document.querySelector('[data-start="sample"]').click();
  expect(activeFloor(store.get()).rooms).toHaveLength(11);
});

test('Escape starts an empty project and the first card has focus', () => {
  document.body.innerHTML = '';
  const store = createStore(createEmptyProject());
  const calls = [];
  openStartScreen({ store, onEmpty: () => calls.push('empty') });
  const overlay = document.querySelector('#startScreen');
  expect(document.activeElement).toBe(overlay.querySelector('[data-start="empty"]'));
  expect(overlay.getAttribute('role')).toBe('dialog');
  overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('#startScreen')).toBeNull();
  expect(calls).toEqual(['empty']);
});
