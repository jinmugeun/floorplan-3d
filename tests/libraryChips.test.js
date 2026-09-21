// @vitest-environment jsdom
// §15.8: 카테고리는 전폭 1열 목록이 아니라 가로로 접히는 칩이고, 첫 칩은 "전체"다(누르면 필터가 풀린다).
import { test, expect } from 'vitest';
import { chipsHtml, ALL_LABEL, wasChipFocused, refocusChip } from '../src/ui/libraryChips.js';

test('첫 칩은 전체이고 고른 칩에 on이 붙는다', () => {
  expect(ALL_LABEL).toBe('전체');
  const html = chipsHtml(['소파', '침대/매트리스'], { active: null });
  expect(html.startsWith('<div class="chips">')).toBe(true);
  expect(html).toContain('data-cat-all="1"');
  expect(html).toContain('>전체<');
  expect(html.indexOf('전체')).toBeLessThan(html.indexOf('소파'));   // 전체가 맨 앞이다
  expect(/data-cat-all="1" class="on"/.test(html)).toBe(true);
  const on = chipsHtml(['소파', '침대/매트리스'], { active: '소파' });
  expect(/data-cat-all="1" class=""/.test(on)).toBe(true);
  expect(/data-cat="소파" class="on"/.test(on)).toBe(true);
  expect(/data-cat="침대\/매트리스" class=""/.test(on)).toBe(true);
});

test('이름은 HTML로 해석되지 않고 빈 목록도 전체 칩을 남긴다', () => {
  const html = chipsHtml(['<img src=x onerror="y">'], {});
  expect(html).not.toContain('<img');
  expect(html).toContain('&lt;img');
  expect(chipsHtml([], {})).toContain('data-cat-all="1"');
  expect(chipsHtml(undefined, {})).toContain('data-cat-all="1"');
});

// 불변식(스크린 리더): 칩은 누른 상태를 aria-pressed로도 알린다(레일·도구 버튼과 같은 규칙).
test('칩은 aria-pressed로 누른 상태를 알린다', () => {
  expect(chipsHtml(['소파'], { active: null })).toContain('data-cat-all="1" class="on" aria-pressed="true"');
  const on = chipsHtml(['소파'], { active: '소파' });
  expect(on).toContain('data-cat-all="1" class="" aria-pressed="false"');
  expect(on).toContain('data-cat="소파" class="on" aria-pressed="true"');
});

// 리뷰 §Task8 I-1: 칩 행을 다시 그리면(render()가 innerHTML을 통째로 새로 만든다) 방금 누른 칩
// 노드가 DOM에서 떨어져 나간다. wasChipFocused/refocusChip은 포커스가 그 칩 자신에 있었을 때만
// (키보드 활성화) 다시 그린 행에서 같은 카테고리(또는 꺼졌으면 "전체")를 찾아 되돌린다.
test('wasChipFocused·refocusChip: 포커스가 있던 칩만 다시 그린 뒤 되돌아간다', () => {
  const wrap = document.createElement('div');
  document.body.appendChild(wrap);
  wrap.innerHTML = chipsHtml(['소파'], { active: null });
  const allBtn = wrap.querySelector('[data-cat-all]');
  allBtn.focus();
  expect(wasChipFocused(allBtn)).toBe(true);
  wrap.innerHTML = chipsHtml(['소파'], { active: '소파' }); // render()가 다시 그리는 것을 흉내 낸다
  expect(document.activeElement).toBe(document.body);      // 옛 노드가 떨어져 나가 포커스가 빠진다
  refocusChip(wrap, '소파', true);
  const chip = wrap.querySelector('[data-cat="소파"]');
  expect(document.activeElement).toBe(chip);
  expect(chip.getAttribute('aria-pressed')).toBe('true');
  wrap.remove();
});

test('refocusChip: 포커스가 없던(마우스) 활성화는 손대지 않는다', () => {
  const wrap = document.createElement('div');
  document.body.appendChild(wrap);
  wrap.innerHTML = chipsHtml(['소파'], { active: '소파' });
  refocusChip(wrap, null, false);
  expect(document.activeElement).toBe(document.body);
  wrap.remove();
});
