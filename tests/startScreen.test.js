// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { openStartScreen } from '../src/ui/startScreen.js';

test('three cards route to their callbacks and the overlay closes', () => {
  localStorage.clear();                       // 사용자 템플릿이 카드 수에 끼어들지 않게
  const store = createStore(createEmptyProject());
  const calls = [];
  const s = openStartScreen({ store, onEmpty: () => calls.push('empty'), onUpload: () => calls.push('upload'), onSample: () => calls.push('sample') });
  const overlay = document.querySelector('#startScreen');
  expect(overlay).not.toBeNull();
  expect(overlay.querySelectorAll('.start-card:not(.tpl)')).toHaveLength(3); // 템플릿 카드는 .tpl로 구분한다
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

test('템플릿 카드 목록을 보여주고 고르면 onTemplate이 불린다', () => {
  localStorage.clear();
  const picked = [];
  openStartScreen({ store: createStore(createEmptyProject()), onTemplate: id => picked.push(id) });
  const root = document.getElementById('startScreen');
  const cards = [...root.querySelectorAll('[data-template]')];
  expect(cards.map(c => c.dataset.template)).toEqual(['builtin-studio']); // 빈 프로젝트·샘플은 위 카드가 담당한다
  expect(cards[0].classList.contains('tpl')).toBe(true);         // 위 카드 3개와 구분되는 클래스
  expect(root.querySelectorAll('.start-card:not(.tpl)')).toHaveLength(3);
  expect(root.textContent).toContain('템플릿');
  cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(picked).toEqual(['builtin-studio']);
  expect(document.getElementById('startScreen')).toBeNull();     // 고르면 닫힌다
});
