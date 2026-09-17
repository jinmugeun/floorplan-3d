// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createPopover } from '../src/ui/popover.js';

function anchorAt(left = 100, top = 400) {
  const b = document.createElement('button'); document.body.appendChild(b);
  b.getBoundingClientRect = () => ({ left, top, right: left + 80, bottom: top + 24, width: 80, height: 24 });
  return b;
}

test('open shows content, close empties it, Escape and outside clicks close it', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const pop = createPopover(root);
  expect(pop.isOpen()).toBe(false);
  pop.open(anchorAt(), '<label><input type="checkbox" data-v2="grid"> 격자</label>');
  expect(pop.isOpen()).toBe(true);
  expect(pop.el.textContent).toContain('격자');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(pop.isOpen()).toBe(false);
  expect(pop.el.innerHTML).toBe('');
  pop.open(anchorAt(), '<b>x</b>');
  document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  expect(pop.isOpen()).toBe(false);
  pop.destroy();
});

test('changes inside the popover reach the handler, and it is clamped to the viewport', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const pop = createPopover(root);
  const onChange = vi.fn();
  pop.open(anchorAt(window.innerWidth + 500, 10), '<input type="checkbox" data-v2="grid">', { onChange });
  const cb = pop.el.querySelector('input');
  cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(parseFloat(pop.el.style.left)).toBeLessThanOrEqual(window.innerWidth);
  expect(parseFloat(pop.el.style.top)).toBeGreaterThanOrEqual(8);
  pop.destroy();
});
