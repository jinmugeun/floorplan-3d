// 카테고리 칩 행(§15.8). 제품 패널과 마감재 패널이 같은 마크업을 쓴다: 예전에는 전폭 1열
// 목록(`ul.cat-list`)이라 첫 화면이 "제품 없음"으로 보였다(감사 §26 · 라운드 4 §15).
// 첫 칩은 "전체"이고 지금 필터가 없을 때 켜진 상태다 — 누르면 필터를 푼다.
// "전체" 칩만 data-cat-all을 쓴다: 카테고리 칩의 개수를 세는 코드·테스트가 흐려지지 않게
// (그리고 카테고리 이름이 빈 문자열인 경우와 섞이지 않게) 속성을 따로 둔다.
// 눌린 칩은 class="on"(보기)과 aria-pressed(읽기) 둘 다로 알린다 — 레일·도구 버튼과 같은 규칙.
import { esc } from '../util/html.js';

export const ALL_LABEL = '전체';

export function chipsHtml(names, { active = null, all = ALL_LABEL } = {}) {
  const chip = (attrs, label, on) => `<button type="button" ${attrs} class="${on ? 'on' : ''}" aria-pressed="${on ? 'true' : 'false'}">${esc(label)}</button>`;
  const rest = (names ?? []).map(n => chip(`data-cat="${esc(n)}"`, n, n === active)).join('');
  return `<div class="chips">${chip('data-cat-all="1"', all, !active)}${rest}</div>`;
}
