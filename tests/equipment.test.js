import { describe, test, expect } from 'vitest';
import { EQUIP_TYPES, EQUIP_DEFAULTS, EQUIP_RANGE, APPLIANCE_KINDS, DIFFUSER_SYMBOLS, VENTCAP_DIAS, HOOD_CIRCLED, EQUIP_TYPE_LABELS, FLOW_COLORS, isEquip, equipType, hoodCmh, equipLabel, normalizeEquipProps } from '../src/vent/equipment.js';
import { CATEGORIES, PRODUCTS, SYMBOL_NAMES, productById, productsIn, EQUIP_PRODUCT_IDS } from '../src/products/catalog.js';
import { symbolParts, symbolSvg, SYMBOL_GLYPH } from '../src/products/symbols.js';
import { createItem, normalizeItem } from '../src/state/schema.js';

describe('설비 기본값', () => {
  test('다섯 종류의 기본값이 아키텍처 §11.1 그대로다', () => {
    expect(EQUIP_TYPES).toEqual(['hood', 'appliance', 'diffuser', 'fan', 'ventcap']);
    expect(Object.keys(EQUIP_DEFAULTS)).toEqual(EQUIP_TYPES);
    expect(EQUIP_DEFAULTS.hood).toEqual({ type: 'hood', no: 1, filter: false, faceVelocity: 0.5, cmh: 0, system: '' });
    expect(EQUIP_DEFAULTS.diffuser).toEqual({ type: 'diffuser', symbol: '가', flow: 'supply', a: 650, b: 650, cmh: 3200 });
    expect(EQUIP_DEFAULTS.fan).toEqual({ type: 'fan', fanId: 'F-2', flow: 'exhaust', chamber: [700, 700, 700], cmh: 0 });
    expect(EQUIP_DEFAULTS.ventcap).toEqual({ type: 'ventcap', dia: 100 });
    expect(DIFFUSER_SYMBOLS).toEqual(['가', '나', '다', '라', '마', '바']);
    expect(VENTCAP_DIAS).toEqual([100, 150]);
    expect(HOOD_CIRCLED).toHaveLength(10);
    expect(APPLIANCE_KINDS.map(k => k[0])).toEqual(['range', 'ricecooker', 'soupkettle', 'wok', 'griddle', 'steamer', 'dishwasher']);
    expect(Object.keys(EQUIP_TYPE_LABELS)).toEqual(EQUIP_TYPES);
    expect(FLOW_COLORS).toEqual({ supply: '#2563eb', exhaust: '#dc2626' });   // 급기 파랑 · 배기 빨강(명세 DT-03)
  });

  test('후드 풍량 = 면적 × 면풍속 × 3600 (M-106 후드 규격표 전부)', () => {
    const rows = [[1800, 1100, 0.7, 4990], [1600, 1200, 0.5, 3456], [2000, 1000, 0.5, 3600], [1700, 1500, 0.5, 4590], [1700, 1500, 0.7, 6426], [1200, 1100, 0.7, 3326], [1000, 1100, 0.1, 396]];
    for (const [w, d, fv, cmh] of rows) expect(hoodCmh({ size: [w, d, 600], props: { faceVelocity: fv } }), `${w}x${d}@${fv}`).toBe(cmh);
    // 소수 좌표(치수)도 반올림 한 번으로 끝난다: 1234.5 × 987.6 mm² × 0.55 × 3600 = 2413.87… → 2414
    expect(hoodCmh({ size: [1234.5, 987.6, 600], props: { faceVelocity: 0.55 } })).toBe(2414);
    expect(hoodCmh({ size: [1000, 1000, 600], props: {} })).toBe(1800);       // 기본 면풍속 0.5
  });

  test('normalizeEquipProps가 종류별 기본값을 채우고 범위를 자른다', () => {
    expect(normalizeEquipProps({ type: 'hood', faceVelocity: 99, no: 0, cmh: -5 }))
      .toEqual({ type: 'hood', no: 1, filter: false, faceVelocity: EQUIP_RANGE.faceVelocity[1], cmh: 0, system: '' });
    expect(normalizeEquipProps({ type: 'diffuser', symbol: 'ㄱ', flow: 'both', a: 10, b: 9999 }))
      .toEqual({ type: 'diffuser', symbol: '가', flow: 'supply', a: 50, b: 3000, cmh: 3200 });
    expect(normalizeEquipProps({ type: 'ventcap', dia: 120 }).dia).toBe(100);  // 100/150만 허용
    expect(normalizeEquipProps({ type: 'fan', chamber: [1, 2] })).toEqual({ type: 'fan', fanId: 'F-2', flow: 'exhaust', chamber: [100, 100, 700], cmh: 0 });
    expect(normalizeEquipProps(null).type).toBe('hood');                        // 모르는 값은 후드로 떨어뜨린다
    expect(normalizeEquipProps({ type: 'appliance', kind: '없음', hoodId: 7 }))
      .toEqual({ type: 'appliance', kind: 'range', heat: 'gas', hoodId: null });
  });

  test('equipLabel은 후드 번호·디퓨저 심벌·팬 번호·환기캡 지름을 돌려주고 조리기구는 없다', () => {
    expect(equipLabel({ kind: 'equipment', props: { type: 'hood', no: 3 } })).toBe('③');
    expect(equipLabel({ kind: 'equipment', props: { type: 'hood', no: 12 } })).toBe('12');
    expect(equipLabel({ kind: 'equipment', props: { type: 'diffuser', symbol: '나' } })).toBe('나');
    expect(equipLabel({ kind: 'equipment', props: { type: 'fan', fanId: 'F-3' } })).toBe('F-3');
    expect(equipLabel({ kind: 'equipment', props: { type: 'ventcap', dia: 150 } })).toBe('Ø150');
    expect(equipLabel({ kind: 'equipment', props: { type: 'appliance', kind: 'range' } })).toBeNull();
    expect(equipLabel({ kind: 'product' })).toBeNull();
    expect(isEquip({ kind: 'equipment' })).toBe(true);
    expect(equipType({ kind: 'equipment', props: { type: 'fan' } })).toBe('fan');
    expect(equipType({ kind: 'product', props: { type: 'fan' } })).toBeNull();
  });
});

describe('환기 설비 카탈로그', () => {
  test('카테고리 환기 설비가 하위 5개와 함께 있고 제품은 17개다', () => {
    const cat = CATEGORIES.find(c => c.name === '환기 설비');
    expect(cat.subs).toEqual(['후드', '조리기구', '디퓨저', '팬', '환기캡']);
    const list = PRODUCTS.filter(p => p.category === '환기 설비');
    expect(list).toHaveLength(17);
    expect(EQUIP_PRODUCT_IDS).toHaveLength(17);
    expect(new Set(list.map(p => p.id))).toEqual(new Set(EQUIP_PRODUCT_IDS));
    expect(productsIn('환기 설비', '후드')).toHaveLength(2);
    expect(productsIn('환기 설비', '조리기구')).toHaveLength(7);
    expect(productsIn('환기 설비', '디퓨저')).toHaveLength(3);
    expect(productsIn('환기 설비', '팬')).toHaveLength(3);
    expect(productsIn('환기 설비', '환기캡')).toHaveLength(2);
  });

  test('설비 제품은 kind가 equipment이고 equip 씨앗·심벌·단가를 갖는다', () => {
    for (const id of EQUIP_PRODUCT_IDS) {
      const p = productById(id);
      expect(p.kind, id).toBe('equipment');
      expect(EQUIP_TYPES, id).toContain(p.equip.type);
      expect(SYMBOL_NAMES, id).toContain(p.symbol);
      expect(p.price, id).toBeGreaterThan(0);
    }
    expect(productById('hood-box-filter').equip).toMatchObject({ type: 'hood', filter: true, faceVelocity: 0.7 });
    expect(productById('ventcap-150').attach).toBe('wall');
    expect(productById('diffuser-650').attach).toBe('ceiling');
  });
});

describe('설비 심벌과 아이템', () => {
  test('심벌에 글자 부품이 들어가고 기본 글자는 SYMBOL_GLYPH다', () => {
    const hood = symbolParts('hood', 1600, 1200);
    const t = hood.find(p => p.t === 'text');
    expect(t.text).toBe(SYMBOL_GLYPH.hood);
    expect(t.size).toBeGreaterThan(0);
    expect(symbolParts('diffuser', 650, 650, { text: '나' }).find(p => p.t === 'text').text).toBe('나');
    expect(symbolParts('fan', 700, 700, { text: 'F-3' }).find(p => p.t === 'text').text).toBe('F-3');
    expect(symbolParts('ventcap', 100, 100).some(p => p.t === 'circle')).toBe(true);
    expect(symbolParts('appliance', 1200, 750).filter(p => p.t === 'circle')).toHaveLength(2);
    expect(symbolParts('box', 600, 600).some(p => p.t === 'text')).toBe(false);  // 기존 심벌은 글자가 없다
  });

  test('symbolSvg가 글자를 <text>로 그리고 글자도 축척 범위에 든다', () => {
    const svg = symbolSvg('diffuser', 650, 650, { text: '다' });
    expect(svg).toContain('<text');
    expect(svg).toContain('>다<');
    expect(symbolSvg('hood', 1600, 1200)).toContain(`>${SYMBOL_GLYPH.hood}<`);
  });

  test('설비 아이템은 props를 갖고 후드 cmh는 크기·면풍속에서 다시 계산된다', () => {
    const it = createItem(productById('hood-box'), { pos: [14350.5, 12700.25] });
    expect(it.kind).toBe('equipment');
    expect(it.props).toMatchObject({ type: 'hood', filter: false, faceVelocity: 0.5 });
    expect(it.props.cmh).toBe(3456);                                   // 1600 × 1200 × 0.5 × 3600
    const bigger = normalizeItem({ ...it, size: [1700, 1500, 600], props: { ...it.props, cmh: 1 } });
    expect(bigger.props.cmh).toBe(4590);                               // 사용자가 넣은 값은 무시된다
    const fast = normalizeItem({ ...it, props: { ...it.props, faceVelocity: 0.7 } });
    expect(fast.props.cmh).toBe(4838);                                 // 1.92 m² × 0.7 × 3600 = 4838.4
    expect(normalizeItem({ kind: 'product', productId: 'sofa-3' }).props).toBeUndefined();
  });
});
