// @vitest-environment jsdom
// §14.3: 1600 px에서도 하단 바가 넘쳐 가로·세로 스크롤바가 동시에 생겼다.
// 넘치면 3D 전용 묶음을 "더보기 ▾" 팝오버로 접고, 64 px 여유가 생겨야 다시 펼친다(히스테리시스).
import { test, expect } from 'vitest';
import { createBottomBar, compactNext, BOTTOM_HYSTERESIS } from '../src/ui/bottomBar.js';
import { shellHtml } from '../src/ui/shellHtml.js';

function setup(sizes = { scrollWidth: 900, clientWidth: 900 }) {
  document.body.innerHTML = shellHtml({ name: '테스트' });
  const size = { ...sizes };
  const bar = createBottomBar(document.body, { measure: () => ({ ...size }) });
  return { bar, size, bottom: document.querySelector('#bottombar'), more: document.querySelector('#bottomMore') };
}

test('compactNext는 넘칠 때 접고 히스테리시스만큼 여유가 생겨야 펼친다', () => {
  expect(BOTTOM_HYSTERESIS).toBe(64);
  expect(compactNext({ compact: false, scrollWidth: 977, clientWidth: 891 })).toBe(true);
  expect(compactNext({ compact: false, scrollWidth: 800, clientWidth: 891 })).toBe(false);
  // 접힌 뒤에는 "펼쳤을 때 필요했던 폭"과 비교한다: 딱 맞는 폭에서 다시 펴면 곧바로 또 접힌다.
  expect(compactNext({ compact: true, scrollWidth: 700, clientWidth: 980, fullWidth: 977 })).toBe(true);
  expect(compactNext({ compact: true, scrollWidth: 700, clientWidth: 1041, fullWidth: 977 })).toBe(false);
});

test('넘치면 3D 전용 묶음이 더보기로 들어가고 여유가 생기면 제자리로 돌아온다', () => {
  const { bar, size, bottom, more } = setup({ scrollWidth: 900, clientWidth: 900 });
  expect(bar.isCompact()).toBe(false);
  expect(document.querySelector('#btnBottomMore').hidden).toBe(true);
  const overflowIds = [...bottom.querySelectorAll('[data-overflow]')].map(s => s.id);
  expect(overflowIds.length).toBeGreaterThan(0);
  size.scrollWidth = 1100; size.clientWidth = 900;
  bar.sync();
  expect(bar.isCompact()).toBe(true);
  expect(bottom.classList.contains('compact')).toBe(true);
  expect(document.querySelector('#btnBottomMore').hidden).toBe(false);
  expect([...more.querySelectorAll('[data-overflow]')].map(s => s.id)).toEqual(overflowIds);
  // 옮겨진 것은 같은 노드다: 3D 버튼에 걸어 둔 리스너가 살아 있어야 한다.
  expect(document.querySelector('#btnSun').closest('#bottomMore')).toBe(more);
  size.clientWidth = 1100 + BOTTOM_HYSTERESIS;     // 딱 히스테리시스만큼 여유
  bar.sync();
  expect(bar.isCompact()).toBe(false);
  expect([...bottom.querySelectorAll(':scope > [data-overflow]')].map(s => s.id)).toEqual(overflowIds);
  expect(more.children).toHaveLength(0);
  bar.destroy();
});

test('더보기 버튼이 팝오버를 여닫고 [Esc]·바깥 클릭이 닫는다', () => {
  const { bar, size, more } = setup();
  size.scrollWidth = 1100; size.clientWidth = 900;
  bar.sync();
  const btn = document.querySelector('#btnBottomMore');
  expect(more.classList.contains('open')).toBe(false);
  btn.click();
  expect(more.classList.contains('open')).toBe(true);
  expect(btn.getAttribute('aria-expanded')).toBe('true');
  btn.click();
  expect(more.classList.contains('open')).toBe(false);
  btn.click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(more.classList.contains('open')).toBe(false);
  btn.click();
  document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  expect(more.classList.contains('open')).toBe(false);
  bar.destroy();
});

test('접힌 상태에서 다시 펼치면 더보기 팝오버도 닫힌다', () => {
  const { bar, size, more } = setup();
  size.scrollWidth = 1100; size.clientWidth = 900;
  bar.sync();
  document.querySelector('#btnBottomMore').click();
  expect(more.classList.contains('open')).toBe(true);
  size.clientWidth = 5000;
  bar.sync();
  expect(bar.isCompact()).toBe(false);
  expect(more.classList.contains('open')).toBe(false);
  bar.destroy();
});

test('#bottombar가 없어도 던지지 않는다', () => {
  document.body.innerHTML = '<div></div>';
  const bar = createBottomBar(document.body);
  bar.sync(); bar.closeMore(); bar.destroy();
  expect(bar.isCompact()).toBe(false);
});
