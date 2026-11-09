// 구입목록 제품 합치기(계획 20 Task 4 · 명세 D6·D7·D8): purchaseData.js의 새 제품 · 덮어쓴 제품을 엑셀 제품과 같은 규칙(expandRow)으로 펼쳐 카탈로그에 넣는다.
// 도면 기구 짝(kitchenFor · LEGACY_TO_KITCHEN)은 구입목록 제품을 고르지 않는다 — 다른 도면의 가져오기 결과가 그대로다.
import { test, expect } from 'vitest';
import purchase from '../src/products/purchaseData.js';
import data from '../src/products/kitchenData.js';
import { KITCHEN_PRODUCTS, PURCHASE_PRODUCTS, LEGACY_TO_KITCHEN, LEGACY_SUBS, kitchenFor } from '../src/products/catalogKitchen.js';
import { KITCHEN_CHIPS } from '../src/products/kitchenRules.js';
import { SHAPE_FAMILIES } from '../src/products/shapeNames.js';
import { productById, isListed, searchProducts, PRICES, SYMBOL_NAMES } from '../src/products/catalog.js';

test('구입목록 제품 93종이 모두 카탈로그에서 풀린다 · 식별번호 제품(k-)만 라이브러리에 보이고 식별번호 없는 제품(ss-)은 숨김 · 새 제품의 형상·심벌·칩이 규칙 안', () => {
  // 2026-11-09 사용자 결정(계획 20 최종 리뷰): ss-(수의·재사용 · 0원 · 실 이름이 든 이름)는 모든 사용자의 라이브러리에 나오지 않는다 — 템플릿은 productById로 그대로 푼다
  for (const p of purchase.products) { const q = productById(p.id); expect(q, p.id).toBeTruthy(); expect(isListed(q), p.id).toBe(!!p.kid); }
  expect(purchase.products.filter(p => p.kid).every(p => p.id.startsWith('k-'))).toBe(true);
  expect(purchase.products.filter(p => !p.kid).map(p => p.id).every(id => id.startsWith('ss-'))).toBe(true);
  expect(PURCHASE_PRODUCTS.filter(p => p.hidden).map(p => p.id).every(id => id.startsWith('ss-'))).toBe(true);
  expect(PURCHASE_PRODUCTS.filter(p => !p.hidden)).toHaveLength(13);           // 식별번호 12 + 덮어쓰기 1
  expect(searchProducts('세미기').some(p => p.id.startsWith('ss-'))).toBe(false);   // 검색에도 나오지 않는다
  expect(PURCHASE_PRODUCTS).toHaveLength(31);    // 새 30(식별번호 12 · 없음 18) + 덮어쓰기 1 — 2026-11-06 사용자 결정: 종류 칸 빈 재사용·수의 8행 포함
  for (const p of PURCHASE_PRODUCTS) {
    expect(SHAPE_FAMILIES, p.id).toContain(p.shape);
    expect(SYMBOL_NAMES, p.id).toContain(p.symbol);
    expect(KITCHEN_CHIPS, p.id).toContain(p.category);
    expect(p.extra, p.id).toMatchObject({ school: '경산 신상중' });
  }
});

test('덮어쓰기 25255110 = 구입목록 값(고정식 작업대) · 엑셀 제품 목록에서는 빠진다', () => {
  expect(productById('k-25255110')).toMatchObject({ name: '고정식 작업대', code: 'K-25255110', size: [1500, 750, 850], sub: '상업용조리대', shape: 'worktable', category: '싱크·조리대', price: 480000 });
  expect(productById('k-25255110').extra).toMatchObject({ kid: '25255110', school: '경산 신상중', purchaseNo: 53, vendor: '에이치케이', contract: 'G2B' });
  expect(KITCHEN_PRODUCTS.some(p => p.id === 'k-25255110')).toBe(false);
  expect(KITCHEN_PRODUCTS).toHaveLength(data.rows.length - purchase.overrides.length);
});

test('새 제품: 취반기(S2B)는 엑셀 제품과 같은 규칙 — 형상·설비 씨앗 · 단가 = 구입목록 · 자동워터릴은 벽(아랫면 1000)', () => {
  expect(productById('k-202606158754353')).toMatchObject({ name: '전기 인덕션 취반기', code: 'K-202606158754353', sub: '취반기', shape: 'ricecooker', size: [572, 800, 1500],
    price: 7000000, kind: 'equipment', equip: { type: 'appliance', kind: 'ricecooker', heat: 'electric' } });
  expect(productById('k-202303206019265')).toMatchObject({ attach: 'wall', zDefault: 1000, shape: 'wallunit', size: [460, 220, 480], price: 440000 });
  expect(PRICES['k-202606158754353']).toBe(7000000);
});

test('식별번호 없는 수의·재사용 제품은 ss-<번호> · 코드 SS-<번호> · 0원', () => {
  const ss = PURCHASE_PRODUCTS.filter(p => p.id.startsWith('ss-'));
  expect(ss).toHaveLength(18);
  for (const p of ss) { expect(p.code, p.id).toBe(`SS-${p.id.slice(3)}`); expect([p.price, PRICES[p.id]], p.id).toEqual([0, 0]); expect(p.extra.kid, p.id).toBeNull(); }
  expect(productById('ss-11')).toMatchObject({ name: '보조배식대', shape: 'counter', size: [300, 650, 820] });
  expect(productById('ss-63')).toMatchObject({ name: '청소용 낮은 1조 세정대 (STS 배수구)', shape: 'sink' });
});

test('도면 기구 짝(kitchenFor)은 구입목록 제품을 고르지 않는다', () => {
  const school = new Set(PURCHASE_PRODUCTS.map(p => p.id));
  for (const id of Object.keys(LEGACY_SUBS)) {
    expect(school.has(LEGACY_TO_KITCHEN[id]), id).toBe(false);
    for (const [s, n] of [[[572, 800, 1500], '취반기(전기) 150인용'], [[1500, 750, 850], '고정식작업대 1500-750'], [[480, 500, 1600], '손세정대']])
      expect(school.has(kitchenFor(id, s, n)), `${id} ${n}`).toBe(false);
  }
});
