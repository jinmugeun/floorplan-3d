// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createContextMenu } from '../src/ui/contextMenu.js';

test('open renders items, separators and disabled entries; click runs onSelect and closes', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const menu = createContextMenu(root);
  const hit = vi.fn(), never = vi.fn();
  menu.open(40, 60, [
    { label: '벽 나누기', onSelect: hit },
    { label: '곡선벽 전환', disabled: true, title: '미지원', onSelect: never },
    'sep',
    { label: '삭제', shortcut: '⌫', danger: true, onSelect: never },
  ]);
  expect(menu.isOpen()).toBe(true);
  const items = root.querySelectorAll('.ctx-item');
  expect(items).toHaveLength(3);
  expect(root.querySelectorAll('.ctx-sep')).toHaveLength(1);
  expect(items[1].disabled).toBe(true);
  expect(items[1].title).toBe('미지원');
  expect(items[2].classList.contains('danger')).toBe(true);
  expect(items[2].textContent).toContain('⌫');
  items[1].click();
  expect(never).not.toHaveBeenCalled();
  expect(menu.isOpen()).toBe(true);
  items[0].click();
  expect(hit).toHaveBeenCalledTimes(1);
  expect(menu.isOpen()).toBe(false);
});

test('arrow keys skip disabled items, Enter runs the focused one, Escape closes', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const menu = createContextMenu(root);
  const first = vi.fn(), third = vi.fn();
  menu.open(10, 10, [{ label: 'A', onSelect: first }, { label: 'B', disabled: true, onSelect: () => {} }, { label: 'C', onSelect: third }]);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(third).toHaveBeenCalledTimes(1);
  expect(first).not.toHaveBeenCalled();
  expect(menu.isOpen()).toBe(false);
  menu.open(10, 10, [{ label: 'A', onSelect: first }]);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(menu.isOpen()).toBe(false);
  expect(first).not.toHaveBeenCalled();
});

test('a menu opened near the right/bottom edge is pulled back into the viewport', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const menu = createContextMenu(root);
  menu.open(window.innerWidth + 200, window.innerHeight + 200, [{ label: 'A', onSelect: () => {} }]);
  const el = root.querySelector('.ctx-menu');
  expect(parseFloat(el.style.left)).toBeLessThanOrEqual(window.innerWidth);
  expect(parseFloat(el.style.top)).toBeLessThanOrEqual(window.innerHeight);
  menu.close();
  expect(root.querySelector('.ctx-menu')).toBeNull();
});
