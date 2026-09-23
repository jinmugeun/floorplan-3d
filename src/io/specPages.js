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

// 인쇄 본문 높이(mm) = 용지의 세로 − @page 여백 × 2. 기본값은 A4 세로(297 − 12 × 2)이고,
// 부르는 쪽(specSheet)이 용지·가로세로를 알므로 A3·가로는 그쪽이 재서 넘긴다.
export const SPEC_BODY_MM = 273;

// 꼬리는 종이 **바닥**에 선다(리뷰 I-3). 흐름의 마지막 블록이면 평면도 한 장짜리 반 쪽에서
// `쪽 1 / 4`가 종이 한가운데 떠 쪽 번호로 읽히지 않았다 → 쪽 상자에 본문 높이를 주고(min-height)
// 꼬리를 그 바닥에 절대 배치한다. padding-bottom이 꼬리 자리를 **예약**하고,
// box-sizing: border-box라야 그 예약이 본문 높이 안에 든다(아니면 쪽마다 10mm씩 넘쳐 빈 쪽이
// 하나씩 생긴다). body 여백도 0으로 둔다 — 브라우저 기본 8px이 같은 방식으로 쪽을 넘긴다.
export const pageCss = (bodyMm = SPEC_BODY_MM) => `
    body { margin: 0; }
    .page { page-break-after: always; position: relative; box-sizing: border-box; min-height: ${bodyMm}mm; padding-bottom: ${SPEC_FOOT_MM}mm; }
    .page:last-child { page-break-after: auto; }
    .page-foot { position: absolute; left: 0; right: 0; bottom: 0; height: ${SPEC_FOOT_MM}mm; line-height: ${SPEC_FOOT_MM}mm; font-size: 10px; color: #5b6775; text-align: right; border-top: 1px solid #c8ccd2; }`;
