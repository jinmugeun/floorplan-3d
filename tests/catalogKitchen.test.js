// 엑셀 급식기구 카탈로그(계획 17 Task 3): 원자료 → 제품 펼치기 · 칩 · 기존 id → 엑셀 제품 대응.
import { describe, test, expect } from 'vitest';
import data from '../src/products/kitchenData.js';
import { KITCHEN_PRODUCTS, KITCHEN_PRICES, KITCHEN_CATEGORIES, LEGACY_SUBS, LEGACY_TO_KITCHEN, kitchenFor, kitchenFit } from '../src/products/catalogKitchen.js';
import { KITCHEN_CHIPS } from '../src/products/kitchenRules.js';
import { SHAPE_FAMILIES } from '../src/products/shapeNames.js';
import { productById, SYMBOL_NAMES } from '../src/products/catalog.js';
import { EQUIP_TYPES, APPLIANCE_KINDS } from '../src/vent/equipment.js';

describe('엑셀 제품 펼치기', () => {
  test('원자료 한 행이 제품 하나다 — id는 k-<식별번호>, 단가는 엑셀 단가', () => {
    expect(KITCHEN_PRODUCTS).toHaveLength(data.rows.length);
    expect(KITCHEN_PRODUCTS.length).toBeGreaterThanOrEqual(480);
    expect(KITCHEN_PRODUCTS.every(p => /^k-\d+$/.test(p.id))).toBe(true);
    expect(Object.keys(KITCHEN_PRICES)).toHaveLength(KITCHEN_PRODUCTS.length);
    const rice = productById('k-25279008');
    expect(rice).toMatchObject({ name: '전기 인덕션 취반기', code: 'SKK-CB2100', category: '조리', sub: '취반기', size: [570, 600, 1095], shape: 'ricecooker', price: 5500000, kind: 'equipment' });
    expect(rice.equip).toEqual({ type: 'appliance', kind: 'ricecooker', heat: 'electric' });
    expect(rice.extra).toMatchObject({ kid: '25279008', vendor: '선경인케이', model: 'SKK-CB2100' });
  });

  test('모든 엑셀 제품의 형상·심벌·칩·설비 씨앗이 규칙 안에 있다', () => {
    const kinds = APPLIANCE_KINDS.map(([k]) => k);
    for (const p of KITCHEN_PRODUCTS) {
      expect(SHAPE_FAMILIES, p.id).toContain(p.shape);
      expect(SYMBOL_NAMES, p.id).toContain(p.symbol);
      expect(KITCHEN_CHIPS, p.id).toContain(p.category);
      if (p.kind === 'equipment') {
        expect(EQUIP_TYPES, p.id).toContain(p.equip.type);
        if (p.equip.type === 'appliance') expect(kinds, p.id).toContain(p.equip.kind);
      } else expect(p.equip, p.id).toBeUndefined();
      if (p.shape === 'hood') expect(p.attach, p.id).toBe('ceiling');
    }
    expect(KITCHEN_PRODUCTS.filter(p => p.equip?.type === 'hood').length).toBe(KITCHEN_PRODUCTS.filter(p => p.sub === '상업용주방후드').length);
  });

  test('칩은 KITCHEN_CHIPS 순서이고 하위는 원자료에 처음 나온 순서다 — 비어 있는 칩이 없다', () => {
    expect(KITCHEN_CATEGORIES.map(c => c.name)).toEqual(KITCHEN_CHIPS);
    for (const c of KITCHEN_CATEGORIES) {
      expect(c.subs.length, c.name).toBeGreaterThan(0);
      const seen = [...new Set(KITCHEN_PRODUCTS.filter(p => p.category === c.name).map(p => p.sub))];
      expect(c.subs, c.name).toEqual(seen);
    }
  });
});

describe('기존 id → 엑셀 제품 대응', () => {
  test('대응 표의 모든 기존 id가 풀리고, 기존 id는 모두 카탈로그에 있다', () => {
    expect(Object.keys(LEGACY_TO_KITCHEN).sort()).toEqual(Object.keys(LEGACY_SUBS).sort());
    for (const [legacy, k] of Object.entries(LEGACY_TO_KITCHEN)) {
      expect(productById(legacy), legacy).toBeTruthy();
      const p = productById(k);
      expect(p, `${legacy} → ${k}`).toBeTruthy();
      expect(LEGACY_SUBS[legacy][0], legacy).toContain(p.sub);
    }
  });

  test('이름 정규식이 있으면 그 이름 안에서 고른다(2조 세정대 · 2도어 냉장고 · 이중 후드)', () => {
    expect(productById(LEGACY_TO_KITCHEN['sink-double']).name).toMatch(/2조/);
    expect(productById(LEGACY_TO_KITCHEN['sink-single']).name).toMatch(/1조/);
    expect(productById(LEGACY_TO_KITCHEN['fridge-2door']).name).toMatch(/2도어/);
    expect(productById(LEGACY_TO_KITCHEN['hood-box-filter']).name).toMatch(/이중/);
    expect(productById(LEGACY_TO_KITCHEN['hood-box']).name).toMatch(/^배기후드/);
    expect(productById(LEGACY_TO_KITCHEN['dining-6']).name).toMatch(/6인/);
  });

  test('kitchenFor는 크기가 가장 가까운 것을 고르고, 표에 없는 id는 null이다', () => {
    const wide = productById(kitchenFor('fridge-2door', [1260, 800, 1910]));
    expect(wide.name).toMatch(/2도어/);                                   // 이름 정규식이 먼저다(2도어 안에서 최근접)
    const any = productById(kitchenFor('locker-12', [400, 580, 1885]));
    expect(['사물함', '캐비닛']).toContain(any.sub);
    expect(kitchenFor('sofa-3', [2100, 900, 800])).toBeNull();
    expect(kitchenFor('없음', [100, 100, 100])).toBeNull();
  });

  test('kitchenFit: 엑셀 제품이면 같은 세부품명·형상 안에서 아이템 크기 최근접(폭 1260 냉장고는 4도어), 아니면 그대로', () => {
    const two = LEGACY_TO_KITCHEN['fridge-2door'];
    expect(productById(kitchenFit(two, [1260, 800, 1910])).name).toMatch(/4도어/);
    expect(kitchenFit(two, productById(two).size)).toBe(two);
    expect(kitchenFit('equip-generic', [1000, 600, 850])).toBe('equip-generic');
    expect(kitchenFit('sink-double', [1500, 750, 850])).toBe('sink-double');
    expect(kitchenFit(two, null)).toBe(two);
  });
});
