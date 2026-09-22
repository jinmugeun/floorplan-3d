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

// render()가 칩 행 innerHTML을 통째로 새로 만들기 때문에, 방금 누른 칩 노드는 다시 그린 뒤
// DOM에서 떨어져 나가고 document.activeElement가 <body>로 떨어진다(리뷰 §Task8 I-1).
// 클릭이 **그 칩 자신에 포커스가 있는 상태에서** 일어났을 때만(키보드 Enter/Space, 또는 포커스를
// 준 뒤의 클릭) 다시 그린 chipsEl에서 같은 카테고리(또는 꺼졌으면 "전체") 칩을 찾아 되돌린다 —
// propsPanel.js:43 · layersPanel.js:74 · bottomBar.js:41과 같은 "다시 그린 뒤 같은 곳으로" 규칙.
// 포커스가 없던 마우스 클릭은 손대지 않는다(activeElement가 그대로 body 등으로 남는다).
export function wasChipFocused(chipBtn) {
  return !!chipBtn && document.activeElement === chipBtn;
}
// 카테고리 이름은 데이터라 선택자에 그대로 끼워 넣을 수 없다: 이름에 "나 \가 들어가면
// querySelector가 던진다(최종 리뷰 Minor 13). 따옴표 안에서 위험한 두 글자만 escape한다
// (CSS.escape는 jsdom에 없어 테스트로 지킬 수 없다).
export const attrSelectorValue = v => String(v).replace(/["\\]/g, '\\$&');
export function refocusChip(chipsEl, cat, hadFocus) {
  if (!hadFocus || !chipsEl) return;
  chipsEl.querySelector(cat ? `[data-cat="${attrSelectorValue(cat)}"]` : '[data-cat-all]')?.focus();
}
