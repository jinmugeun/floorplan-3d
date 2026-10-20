// 도면 기구(2026-10-12 · 계획 13 Task 2): DXF 가져오기가 카탈로그 제품으로 맞추지 못한 기구 블록이 서는 **일반 상자** 하나.
// 왜: 급식기구 배치도의 기구 중 카탈로그에 비슷한 것이 없는 것(운반차·워터릴·에어커튼·온수기 · 사동중+신상중 ≈ 108개)과 이름 없는
// 익명 블록(≈ 97개)도 자리·크기·이름 그대로 세워야 한다(사전 검토 p13-preflight.md §3) — 크기·이름은 아이템이 도면 값으로 덮어쓰고,
// 이 제품은 종류(코드 DR-EQ · 카테고리 '도면 기구')와 기본 상자만 준다. 계획 17 Task 3부터 라이브러리 패널·검색에서는 숨긴다(hidden — catalog.js) — DXF 가져오기가 세운 아이템은 그대로 풀린다.
// 사는 물건이 아니라 도면 요소라 0원이다(구조물과 같은 규칙 — 견적 합계에 영향 없음). 규약은 catalog.js와 같다.
export const DRAWING_PRICES = { 'equip-generic': 0 };

export const DRAWING_PRODUCTS = [
  { id: 'equip-generic', name: '도면 기구', code: 'DR-EQ', category: '도면 기구', sub: '기구', size: [900, 600, 850], attach: 'floor', symbol: 'box',
    zDefault: 0, color: '#cfd4da', kind: 'product', tags: '도면 기구 블록', price: DRAWING_PRICES['equip-generic'] },
];
