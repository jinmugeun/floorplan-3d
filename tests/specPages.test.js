// §17.11(6) · 감사 §39: Chromium이 @page의 여백 상자를 무시해 A4 4쪽에 쪽 번호가 없었다(실측).
// 본문을 쪽 블록으로 나누고 각 블록 바닥에 고정 높이 꼬리를 직접 찍는다.
import { test, expect } from 'vitest';
import { SPEC_PAGES, SPEC_FOOT_MM, SPEC_BODY_MM, pageGroups, pageFootHtml, pageCss } from '../src/io/specPages.js';
import { SPEC_SECTIONS } from '../src/io/specSheet.js';

test('쪽 묶음은 §17.11이 적은 네 덩어리다', () => {
  expect(SPEC_PAGES).toEqual([['plan'], ['elevations'], ['products', 'rooms'], ['walls', 'airflow', 'notes']]);
  expect(SPEC_FOOT_MM).toBe(10);
  expect(SPEC_PAGES.flat()).toEqual(SPEC_SECTIONS.map(([k]) => k));   // 절이 하나도 빠지지 않는다(리뷰 M-3)
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

// 리뷰 I-3: 꼬리가 흐름의 마지막 블록이면 평면도 한 장짜리(반 쪽) 블록에서 `쪽 1 / 4`가 종이
// 한가운데 뜬다 — 쪽 번호로 읽히려면 바닥에 서야 한다. 실제 쪽의 모습은 page.pdf()가 재고,
// 여기서는 그 규칙이 CSS에 있는지를 본다.
test('쪽 꼬리는 종이 바닥에 선다(리뷰 I-3)', () => {
  expect(SPEC_BODY_MM).toBe(273);                        // A4 세로: 297 − 12 × 2
  const a4 = pageCss();                                  // 기본값이 A4 세로다
  expect(a4).toContain(`min-height: ${SPEC_BODY_MM}mm`);
  expect(a4).toContain('position: relative');
  expect(a4).toContain('box-sizing: border-box');        // 예약한 padding이 본문 높이 **안**에 든다
  expect(a4).toContain('body { margin: 0; }');           // 브라우저 기본 8px이 쪽을 넘기지 않게
  const foot = a4.split('.page-foot')[1];
  expect(foot).toContain('position: absolute');
  expect(foot).toContain('bottom: 0');
  expect(foot).toContain('left: 0');
  expect(foot).toContain('right: 0');
  // 본문 높이는 부르는 쪽(specSheet)이 용지·방향에서 재서 넘긴다: A4 가로는 210 − 24.
  expect(pageCss(186)).toContain('min-height: 186mm');
  expect(pageCss(186)).not.toContain('min-height: 273mm');
});
