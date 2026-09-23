// 레이어 패널의 머리 한 줄과 "무엇을 보여 줄지" 규칙(§17.6 · 감사 §28·§33·§49).
// layersPanel.js가 129줄에서 더 자라기 전에 순수한 조각만 떼어 냈다: 검색·접기·자동 접힘 문턱은
// 스토어도 DOM 이벤트도 모르므로 node 테스트로 직접 돈다(layersTree.js와 같은 자리).
import { productById, fmtSize } from '../products/catalog.js';
import { esc } from '../util/html.js';

export const LAYER_SEARCH_PH = '레이어 검색 (이름·코드)';
export const COLLAPSE_ALL = '방 모두 접기';
export const EXPAND_ALL = '방 모두 펴기';
// 패널이 이보다 좁으면 행에서 코드·크기를 숨기고 이름을 살린다(#panel.narrow — ui/layout.js가 붙인다).
export const LAYER_CODE_HIDE_PX = 280;
// 층 전체 행 수가 이보다 많으면 방 노드는 처음에 **접힌 채** 열린다: <details>가 닫혀 있으면
// 브라우저가 그 안을 탭 순서에서 빼므로 500개 도면(510행)의 탭 스톱이 방 수 수준으로 떨어진다.
// 49행 도면은 지금처럼 펼쳐진 채다.
export const LAYER_AUTO_COLLAPSE_ROWS = 30;

export const rowCount = (buckets = []) => buckets.reduce((n, b) => n + b.items.length + b.ducts.length, 0);
export const autoCollapsed = (count, rows = LAYER_AUTO_COLLAPSE_ROWS) => count > rows;

export const matchLayer = (text, query) => {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  if (text === null || text === undefined) return false;
  return String(text).toLowerCase().includes(q);
};

// 행 하나가 검색에 걸리는 글자: 제품은 이름 + 코드 + 규격, 덕트는 급배기 + 계통.
// (트리 행에 실제로 보이는 것과 같은 글자다 — 보이지 않는 필드로 걸리면 결과가 설명되지 않는다.)
// (규격은 제품이 있을 때만 붙인다 — 트리 행의 `p ? fmtSize(it.size) : ''`와 같은 규칙이다 · 리뷰 M-3.)
const itemText = it => { const p = productById(it.productId); return `${it.name || p?.name || '제품'} ${it.code || p?.code || ''} ${p ? fmtSize(it.size) : ''}`; };
const ductText = d => `덕트 ${d.kind === 'supply' ? '급기' : '배기'} ${d.system ?? ''}`;

// 검색은 **행만** 거른다. 남는 행이 없는 방 노드는 그리지 않는다(빈 헤더가 결과를 가리지 않게).
export function filterBuckets(buckets = [], query = '') {
  if (!String(query ?? '').trim()) return buckets;
  return buckets
    .map(b => ({ ...b, items: b.items.filter(it => matchLayer(itemText(it), query)), ducts: b.ducts.filter(d => matchLayer(ductText(d), query)) }))
    .filter(b => b.items.length || b.ducts.length);
}

// 접기 버튼의 라벨은 곧 다음 동작이다. 트리만 다시 그리는 길(검색 타이핑 · 리뷰 I-2)에서도
// 같은 말을 써야 하므로 한 자리에 둔다.
export const collapseLabel = anyOpen => (anyOpen ? COLLAPSE_ALL : EXPAND_ALL);

// 검색은 ui.set도 store.dispatch도 하지 않는다(패널 지역 상태 — openState와 같은 자리).
export const layersHeaderHtml = ({ query = '', anyOpen = true } = {}) => {
  const label = collapseLabel(anyOpen);
  return `<div class="row layer-head">
      <input type="search" name="q" value="${esc(query)}" placeholder="${LAYER_SEARCH_PH}" aria-label="레이어 검색">
      <button type="button" name="collapseAll" title="${label}">${label}</button></div>`;
};
