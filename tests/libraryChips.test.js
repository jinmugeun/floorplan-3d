// §15.8: 카테고리는 전폭 1열 목록이 아니라 가로로 접히는 칩이고, 첫 칩은 "전체"다(누르면 필터가 풀린다).
import { test, expect } from 'vitest';
import { chipsHtml, ALL_LABEL } from '../src/ui/libraryChips.js';

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
