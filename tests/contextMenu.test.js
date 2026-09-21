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
  expect(document.activeElement.textContent).toContain('A');   // 열면 첫 항목에 포커스(§15.3)
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

test('the outside click that closes the menu does not reach the element underneath', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const canvas = document.createElement('canvas'); document.body.appendChild(canvas);
  const hits = vi.fn(); canvas.addEventListener('pointerdown', hits);
  const menu = createContextMenu(root);
  menu.open(100.5, 80.25, [{ label: '삭제', onSelect: () => {} }]);
  expect(menu.isOpen()).toBe(true);
  canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
  expect(menu.isOpen()).toBe(false);
  expect(hits).not.toHaveBeenCalled();
  canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
  expect(hits).toHaveBeenCalledTimes(1); // 닫힌 뒤에는 정상 전달
});

test('item text is not interpreted as HTML', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const menu = createContextMenu(root);
  menu.open(10, 10, [{ label: '<img src=x onerror="window.__pwned=1">', shortcut: '<b>x</b>', title: 'a" onmouseover="y', onSelect: () => {} }]);
  const item = root.querySelector('.ctx-item');
  expect(root.querySelector('.ctx-item img')).toBeNull();
  expect(root.querySelector('.ctx-item b')).toBeNull();
  expect(item.querySelector('span').textContent).toBe('<img src=x onerror="window.__pwned=1">');
  expect(item.title).toBe('a" onmouseover="y');
  expect(item.hasAttribute('onmouseover')).toBe(false);
  expect(window.__pwned).toBeUndefined();
  menu.close();
});

// §15.3: 메뉴는 role="menu"/menuitem이고, 닫히면 열기 전 포커스로 돌아온다.
test('메뉴에 role이 붙고 닫으면 포커스가 되돌아온다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const opener = document.createElement('button'); document.body.appendChild(opener);
  const menu = createContextMenu(root);
  opener.focus();
  menu.open(10, 10, [{ label: 'A', onSelect: () => {} }, 'sep', { label: 'B', onSelect: () => {} }]);
  const el = root.querySelector('.ctx-menu');
  expect(el.getAttribute('role')).toBe('menu');
  expect([...el.querySelectorAll('.ctx-item')].every(b => b.getAttribute('role') === 'menuitem')).toBe(true);
  expect(el.querySelector('.ctx-sep').getAttribute('role')).toBe('separator');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(menu.isOpen()).toBe(false);
  expect(document.activeElement).toBe(opener);
});

test('항목을 골라 닫아도 포커스가 되돌아온다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const opener = document.createElement('button'); document.body.appendChild(opener);
  const menu = createContextMenu(root);
  opener.focus();
  const hit = vi.fn();
  menu.open(10, 10, [{ label: 'A', onSelect: hit }]);
  root.querySelector('.ctx-item').click();
  expect(hit).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(opener);
});

// §15.3: [Tab]/[Shift+Tab]은 메뉴 안에서 순환한다 — 마지막 항목에서 Tab을 누르면 앱으로
// 새어 나가는 대신 첫 항목으로 돌아온다(감사 §1).
test('[Tab]과 [Shift+Tab]은 메뉴 안에서만 돈다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const outside = document.createElement('button'); document.body.appendChild(outside);
  const menu = createContextMenu(root);
  const pick = vi.fn();
  menu.open(10, 10, [{ label: 'A', onSelect: () => {} }, { label: 'B', disabled: true, onSelect: () => {} }, 'sep', { label: 'C', onSelect: pick }]);
  const [a, , c] = root.querySelectorAll('.ctx-item');
  expect(document.activeElement).toBe(a);
  const tab = (shiftKey = false) => {
    const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    return ev;
  };
  const first = tab();
  expect(first.defaultPrevented).toBe(true);        // 브라우저 기본 이동을 대신한다
  expect(document.activeElement).toBe(c);           // 비활성 항목 B는 건너뛴다
  tab();
  expect(document.activeElement).toBe(a);           // 마지막에서 첫 항목으로 감싼다
  tab(true);
  expect(document.activeElement).toBe(c);           // Shift+Tab은 거꾸로 감싼다
  expect(menu.isOpen()).toBe(true);
  // Tab으로 옮긴 자리에서 Enter가 그 항목을 고른다(내부 index가 어긋나지 않는다)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  expect(pick).toHaveBeenCalledTimes(1);
  expect(menu.isOpen()).toBe(false);
  outside.remove();
});

// §15.3: 메뉴가 먹는 키는 전역 키맵(window bubble)까지 가지 않는다 — 가면 ↑/↓ 한 번마다
// 선택한 제품이 10 mm 움직이고 undo 단계가 쌓인다.
test('메뉴가 열린 동안 방향키·Tab·Enter·Esc는 window 키 리스너에 닿지 않는다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const menu = createContextMenu(root);
  const global = vi.fn();
  window.addEventListener('keydown', global);
  try {
    menu.open(10, 10, [{ label: 'A', onSelect: () => {} }, { label: 'B', onSelect: () => {} }]);
    for (const key of ['ArrowDown', 'ArrowUp', 'Tab', 'Escape']) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    }
    expect(global).not.toHaveBeenCalled();
    expect(menu.isOpen()).toBe(false);              // Escape가 닫았다
    // 닫힌 뒤에는 같은 키가 전역으로 정상 전달된다
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(global).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener('keydown', global);
  }
});

test('메뉴 안에서 난 스크롤은 메뉴를 닫지 않고, 페이지 스크롤은 닫는다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const menu = createContextMenu(root);
  menu.open(10, 10, [{ label: 'A', onSelect: () => {} }]);
  root.querySelector('.ctx-menu').dispatchEvent(new Event('scroll', { bubbles: true }));
  expect(menu.isOpen()).toBe(true);
  document.dispatchEvent(new Event('scroll', { bubbles: true }));
  expect(menu.isOpen()).toBe(false);
});
