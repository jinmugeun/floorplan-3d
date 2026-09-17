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

test('the outside click that closes the popover does not reach the canvas underneath', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const canvas = document.createElement('canvas'); document.body.appendChild(canvas);
  const hits = vi.fn(); canvas.addEventListener('pointerdown', hits);
  const pop = createPopover(root);
  pop.open(anchorAt(), '<b>x</b>');
  canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 700.5, clientY: 400.25 }));
  expect(pop.isOpen()).toBe(false);
  expect(hits).not.toHaveBeenCalled();
  // 닫힌 뒤의 클릭은 그대로 캔버스에 닿는다
  canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
  expect(hits).toHaveBeenCalledTimes(1);
  pop.destroy();
});

test('the closing click keeps its default action outside the canvas, so an input still focuses', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const wrap = document.createElement('main'); wrap.id = 'canvasWrap'; document.body.appendChild(wrap);
  const canvas = document.createElement('canvas'); wrap.appendChild(canvas);
  const input = document.createElement('input'); document.body.appendChild(input);
  const pop = createPopover(root);

  pop.open(anchorAt(), '<b>x</b>');
  const onInput = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
  input.dispatchEvent(onInput);
  expect(pop.isOpen()).toBe(false);
  expect(onInput.defaultPrevented).toBe(false); // 기본 동작이 살아 있어야 입력란이 포커스를 받는다
  input.focus();
  expect(document.activeElement).toBe(input);

  pop.open(anchorAt(), '<b>x</b>');
  const onCanvas = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
  canvas.dispatchEvent(onCanvas);
  expect(pop.isOpen()).toBe(false);
  expect(onCanvas.defaultPrevented).toBe(true); // 캔버스 위에서는 클릭이 도면에 닿지 않게 막는다
  pop.destroy();
  wrap.remove(); input.remove();
});
