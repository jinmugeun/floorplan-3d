// §17.11(6) · 감사 §39: Chromium이 @page의 여백 상자를 무시해 A4 4쪽에 쪽 번호가 없었다(실측).
// 본문을 쪽 블록으로 나누고 각 블록 바닥에 고정 높이 꼬리를 직접 찍는다.
import { test, expect } from 'vitest';
import { SPEC_PAGES, SPEC_FOOT_MM, pageGroups, pageFootHtml, pageCss } from '../src/io/specPages.js';

test('쪽 묶음은 §17.11이 적은 네 덩어리다', () => {
  expect(SPEC_PAGES).toEqual([['plan'], ['elevations'], ['products', 'rooms'], ['walls', 'airflow', 'notes']]);
  expect(SPEC_FOOT_MM).toBe(10);
});

test('내용이 있는 절만 블록이 된다', () => {
  expect(pageGroups({})).toEqual([]);
  const g = pageGroups({ plan: '<h2>평면도</h2>', products: '<h2>제품</h2>', rooms: '   ', notes: '<h2>비고</h2>' });
  expect(g).toHaveLength(3);
  expect(g[0].keys).toEqual(['plan']);
  expect(g[1].keys).toEqual(['products']);              // 빈 rooms는 블록에서 빠진다
  expect(g[1].html).toBe('<h2>제품</h2>');
  expect(g[2].keys).toEqual(['notes']);
});

test('꼬리는 쪽 번호·프로젝트·작성일이고 CSS는 고정 높이를 쓴다', () => {
  const foot = pageFootHtml(2, 4, { name: '강당중 조리실', date: '2026. 9. 23.' });
  expect(foot).toContain('쪽 2 / 4');
  expect(foot).toContain('강당중 조리실');
  expect(foot).toContain('2026. 9. 23.');
  expect(foot).toContain('class="page-foot"');
  expect(pageFootHtml(1, 1, {})).toContain('쪽 1 / 1');
  const css = pageCss();
  expect(css).toContain('page-break-after: always');
  expect(css).toContain(`padding-bottom: ${SPEC_FOOT_MM}mm`);
  expect(css).toContain(`height: ${SPEC_FOOT_MM}mm`);
  expect(css).toContain('.page:last-child { page-break-after: auto; }');
});
