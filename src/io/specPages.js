// 시방서의 쪽 블록과 바닥 꼬리(§17.11(6) · 감사 §39). Chromium이 @page의 여백 상자(@bottom-right)를
// 무시해 A4 4쪽 어디에도 쪽 번호가 없었다(page.pdf() 실측) → 본문을 쪽 블록으로 나누고 각 블록
// 바닥에 고정 높이 꼬리를 직접 찍는다.
// **한계**: 표가 길어 한 블록이 두 쪽으로 넘어가면 꼬리는 그 블록의 *마지막 쪽에만* 찍히고
// `쪽 i / m`은 블록 번호다(500개 도면의 제품 목록이 그렇다). §16.11의 "37 m 넘는 도면은 A3 권장"
// 주석과 같은 성격의 한계이고, 테스트가 이 규칙을 못 박는다.
import { esc } from '../util/html.js';

export const SPEC_PAGES = [['plan'], ['elevations'], ['products', 'rooms'], ['walls', 'airflow', 'notes']];
export const SPEC_FOOT_MM = 10;   // 각 쪽 바닥 꼬리의 고정 높이

// parts = { <절 키>: html }. 켜져 있고 **내용이 있는** 절만 블록이 된다(빈 절은 부르는 쪽이 이미 뺐다).
export function pageGroups(parts = {}) {
  const out = [];
  for (const keys of SPEC_PAGES) {
    const live = keys.filter(k => String(parts[k] ?? '').trim());
    if (live.length) out.push({ keys: live, html: live.map(k => parts[k]).join('') });
  }
  return out;
}

export const pageFootHtml = (i, m, { name = '', date = '' } = {}) =>
  `<div class="page-foot">${esc(`쪽 ${i} / ${m}`)}${name ? ` · ${esc(name)}` : ''}${date ? ` · ${esc(date)}` : ''}</div>`;

export const pageCss = () => `
    .page { page-break-after: always; position: relative; padding-bottom: ${SPEC_FOOT_MM}mm; }
    .page:last-child { page-break-after: auto; }
    .page-foot { height: ${SPEC_FOOT_MM}mm; line-height: ${SPEC_FOOT_MM}mm; font-size: 10px; color: #5b6775; text-align: right; border-top: 1px solid #c8ccd2; }`;
