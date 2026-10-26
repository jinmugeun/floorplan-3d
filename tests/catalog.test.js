import { describe, test, expect } from 'vitest';
import { CATEGORIES, PRODUCTS, SYMBOL_NAMES, productById, productsIn, searchProducts, sortProducts, fmtSize, CATEGORY_COLORS, isListed, KEPT_IDS } from '../src/products/catalog.js';
import { ITEM_RANGE } from '../src/state/schema.js';

// 2026-10-20 · 계획 17 Task 3: 카탈로그 = 남는 기존 21종 + 식별번호 엑셀 급식기구 + 숨김 단종. 라이브러리는 숨김을 보지 않는다.
const LISTED = PRODUCTS.filter(isListed);

describe('제품 카탈로그', () => {
  test('카테고리(칩) 10개가 정확한 이름과 순서로 있다 — 엑셀 9개 + 건축 요소', () => {
    expect(CATEGORIES.map(c => c.name)).toEqual(['조리', '세척·소독', '냉장·냉동', '싱크·조리대', '배식', '후드·환기', '운반·보관', '가구·사무', '위생·기타', '건축 요소']);
    expect(CATEGORIES.find(c => c.name === '건축 요소').subs).toEqual(['문', '창문', '기둥', '개구부']);
    expect(CATEGORIES.find(c => c.name === '후드·환기').subs.slice(-4)).toEqual(['디퓨저', '팬', '환기캡', '공기질']);
    expect(CATEGORIES.find(c => c.name === '후드·환기').subs).toContain('상업용주방후드');
  });

  test('남는 기존 제품은 22종(문 6 · 창 3 · 기둥 2 · 개구부 · 디퓨저 3 · 팬 3 · 환기캡 2 · 공기질 함체 · 도면 기구)이고 도면 기구만 숨김이다', () => {
    expect(KEPT_IDS).toEqual(['door-swing-900', 'door-swing-1000', 'door-double-1800', 'door-slide-1500', 'door-slide-900', 'door-pocket-900',
      'window-slide-1200', 'window-slide-1800', 'window-fix-600', 'column-square', 'column-round', 'opening-pass',
      'diffuser-650', 'diffuser-650-350', 'diffuser-500-350', 'fan-exhaust-700', 'fan-supply-filter', 'fan-wall-500', 'ventcap-100', 'ventcap-150', 'aq-enclosure', 'equip-generic']);
    expect(KEPT_IDS.filter(id => productById(id).hidden)).toEqual(['equip-generic']);
    expect(productById('door-swing-900')).toMatchObject({ category: '건축 요소', sub: '문' });
    expect(productById('fan-wall-500')).toMatchObject({ category: '후드·환기', sub: '팬' });
  });

  // 2026-10-26: 사용자 CAD 그림 1~10의 공기질 함체(바깥 510×217×310) — 벽에 거는 형상 제품(enclosure · 스테인리스).
  test('공기질 함체(aq-enclosure): 후드·환기 › 공기질 · 벽 부착 · 아랫면 1,200 · 형상 enclosure · 검색된다', () => {
    expect(productById('aq-enclosure')).toMatchObject({ name: '공기질 함체', code: 'AQ-EN510', category: '후드·환기', sub: '공기질', size: [510, 217, 310],
      attach: 'wall', symbol: 'box', zDefault: 1200, shape: 'enclosure', kind: 'product', price: 0 });
    expect(isListed(productById('aq-enclosure'))).toBe(true);
    expect(searchProducts('공기질함체').map(p => p.id)).toContain('aq-enclosure');
    expect(searchProducts('AQ-EN510').map(p => p.id)).toEqual(['aq-enclosure']);
  });

  // 2026-10-12 · 계획 13 Task 2: DXF 가져오기가 카탈로그로 맞추지 못한 기구가 서는 일반 상자(크기·이름은 아이템이 도면 값으로 덮는다).
  // 계획 17: 라이브러리에서는 숨긴다(가져온 기구가 서는 자리) — 조회와 견적 카테고리('도면 기구')는 그대로.
  test('도면 기구(equip-generic) 제품이 있고 0원이며 숨김이다', () => {
    expect(productById('equip-generic')).toMatchObject({ name: '도면 기구', code: 'DR-EQ', category: '도면 기구', sub: '기구', size: [900, 600, 850], attach: 'floor', symbol: 'box', kind: 'product', price: 0, tags: '도면 기구 블록', hidden: true });
    expect(productsIn('도면 기구')).toEqual([]);
    expect(searchProducts('DR-EQ')).toEqual([]);
  });

  test('숨김 단종 제품은 조회되지만 칩·검색에는 없다', () => {
    for (const id of ['sofa-3', 'bed-queen', 'sink-double', 'hood-box', 'serve-counter', 'desk-student']) {
      const p = productById(id);
      expect(p, id).toBeTruthy();
      expect(p.hidden, id).toBe(true);
    }
    expect(searchProducts('SF-3P')).toEqual([]);
    expect(searchProducts('3인 소파')).toEqual([]);
    expect(productsIn('소파')).toEqual([]);
    expect(productById('sofa-3').price).toBe(890000);       // 견적은 그대로(옛 프로젝트)
  });

  test('제품이 500개 이상이고 id·코드가 겹치지 않는다', () => {
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(500);
    expect(new Set(PRODUCTS.map(p => p.id)).size).toBe(PRODUCTS.length);
    expect(new Set(PRODUCTS.map(p => p.code)).size).toBe(PRODUCTS.length);
  });

  // 크기 상한은 엑셀 값 그대로 8,000 mm 안이다. 아이템 크기 상한(ITEM_RANGE 5,000)을 넘는 엑셀 제품은 한 종(식기세척기 전기 2탱크 일반형 5,150)뿐 —
  // 놓으면 5,000으로 잘린다(계획 17 이월: 상한을 올리면 DXF 세척 라인 *U266 5,200도 자르지 않게 돼 dxf:score를 다시 재야 한다).
  test('라이브러리 제품의 카테고리·하위·부착·심벌·크기가 규칙 안에 있다', () => {
    for (const p of LISTED) {
      const cat = CATEGORIES.find(c => c.name === p.category);
      expect(cat, p.id).toBeTruthy();
      expect(cat.subs, p.id).toContain(p.sub);
      expect(['floor', 'floorLay', 'wall', 'ceiling'], p.id).toContain(p.attach);
      expect(SYMBOL_NAMES, p.id).toContain(p.symbol);
      expect(p.size, p.id).toHaveLength(3);
      for (const v of p.size) { expect(v, p.id).toBeGreaterThanOrEqual(10); expect(v, p.id).toBeLessThanOrEqual(8000); }
      expect(typeof p.zDefault, p.id).toBe('number');
      expect(p.color, p.id).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(LISTED.filter(p => p.size.some(v => v > ITEM_RANGE.size[1])).map(p => p.id)).toEqual(['k-25195068']);
  });

  test('숨김 단종 제품도 부착·심벌·크기는 규칙 안이다(옛 프로젝트가 그린다)', () => {
    for (const p of PRODUCTS.filter(x => !isListed(x))) {
      expect(['floor', 'floorLay', 'wall', 'ceiling'], p.id).toContain(p.attach);
      expect(SYMBOL_NAMES, p.id).toContain(p.symbol);
      for (const v of p.size) { expect(v, p.id).toBeGreaterThanOrEqual(10); expect(v, p.id).toBeLessThanOrEqual(5000); }
    }
  });

  test('문·창·개구부만 opening을 가지고 sill이 zDefault와 같다', () => {
    const holes = PRODUCTS.filter(p => ['door', 'window', 'opening'].includes(p.kind));
    expect(holes.length).toBeGreaterThanOrEqual(7);
    for (const p of holes) {
      expect(p.attach, p.id).toBe('wall');
      expect(p.opening, p.id).toBeTruthy();
      expect(p.opening.sill, p.id).toBe(p.zDefault);
      expect(p.opening.w, p.id).toBe(p.size[0]);
      expect(p.opening.h, p.id).toBe(p.size[2]);
    }
    for (const p of PRODUCTS.filter(x => !['door', 'window', 'opening'].includes(x.kind))) expect(p.opening, p.id).toBeUndefined();
  });

  test('라이브러리에 부착 유형 3종(바닥·벽·천장)과 건축 요소가 있다', () => {
    for (const a of ['floor', 'wall', 'ceiling']) expect(LISTED.some(p => p.attach === a), a).toBe(true);
    expect(productsIn('건축 요소', '기둥').map(p => p.name)).toEqual(['사각 기둥', '원형 기둥']);
    expect(productsIn('건축 요소', '개구부').map(p => p.name)).toEqual(['개구부']);
  });

  test('검색은 카테고리 밖까지 전체를 찾고 이름·모델명·업체·세부품명으로도 찾는다', () => {
    expect(searchProducts('세정대').length).toBeGreaterThanOrEqual(10);
    expect(searchProducts('세정대').every(isListed)).toBe(true);
    expect(searchProducts('상업용주방후드').length).toBe(productsIn('후드·환기', '상업용주방후드').length);
    expect(searchProducts('SKK-CB2100').map(p => p.id)).toEqual(['k-25279008']);   // 모델명
    expect(searchProducts('선경인케이').length).toBeGreaterThan(0);                 // 업체
    expect(searchProducts('   ')).toEqual([]);
  });

  test('정렬은 이름순과 크기순을 지원하고 원본을 바꾸지 않는다', () => {
    const src = productsIn('싱크·조리대', '상업용싱크대');
    const bySize = sortProducts(src, 'size');
    const vol = p => p.size[0] * p.size[1] * p.size[2];
    for (let i = 1; i < bySize.length; i++) expect(vol(bySize[i])).toBeGreaterThanOrEqual(vol(bySize[i - 1]));
    const byName = sortProducts(src, 'name');
    expect(byName[0].name.localeCompare(byName[1].name, 'ko')).toBeLessThanOrEqual(0);
    expect(productsIn('싱크·조리대', '상업용싱크대')).toEqual(src);
  });

  test('모든 제품에 정적 단가가 있다', async () => {
    const { PRICES } = await import('../src/products/catalog.js');
    for (const p of PRODUCTS) {
      expect(typeof p.price, p.id).toBe('number');
      expect(p.price, p.id).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(p.price), p.id).toBe(true);
    }
    expect(Object.keys(PRICES)).toHaveLength(PRODUCTS.length);
    expect(productById('fridge-2door').price).toBe(1290000);   // 숨김 단종도 단가 그대로
    expect(productById('column-square').price).toBe(0);        // 구조물은 도면 요소라 0원
    expect(productById('k-25279008').price).toBe(5500000);     // 엑셀 단가
    expect(LISTED.filter(p => p.price > 0).length).toBeGreaterThanOrEqual(450);
  });

  test('productById와 fmtSize', () => {
    expect(productById('door-swing-900').name).toBe('여닫이문 900');
    expect(productById('없음')).toBeNull();
    expect(fmtSize([1200, 600, 750])).toBe('1200×600×750');
  });

  // §13.9 → 계획 17: 계획 5의 제품 8종은 숨김 단종으로 남는다(catalogLegacy.js가 catalogExtra.js를 숨겨 병합).
  test('계획 5가 더한 제품 8종은 숨김으로 남아 있다', async () => {
    const { EXTRA_PRODUCTS, EXTRA_PRICES } = await import('../src/products/catalogExtra.js');
    expect(EXTRA_PRODUCTS).toHaveLength(8);
    expect(Object.keys(EXTRA_PRICES)).toHaveLength(8);
    for (const x of EXTRA_PRODUCTS) {
      const p = productById(x.id);
      expect(p, x.id).toBeTruthy();
      expect(p.hidden, x.id).toBe(true);
      expect(p.price, x.id).toBeGreaterThan(0);
      expect(SYMBOL_NAMES, x.id).toContain(p.symbol);
    }
    expect(productById('desk-student').size).toEqual([600, 450, 750]);
  });

  test('포켓 미닫이문 제품이 있다', () => {
    const p = productById('door-pocket-900');
    expect(p).toMatchObject({ name: '포켓 미닫이문 900', code: 'DR-P090', category: '건축 요소', sub: '문', size: [900, 40, 2100], attach: 'wall', symbol: 'door', kind: 'door' });
    expect(p.opening).toEqual({ w: 900, h: 2100, sill: 0 });
    expect(p.price).toBe(390000);
  });

  test('미닫이문 900 제품이 있다', () => {
    const p = productById('door-slide-900');
    expect(p).toMatchObject({ name: '미닫이문 900', code: 'DR-S090', category: '건축 요소', sub: '문', size: [900, 40, 2100], attach: 'wall', symbol: 'door', kind: 'door' });
    expect(p.opening).toEqual({ w: 900, h: 2100, sill: 0 });
    expect(p.price).toBe(300000);
    expect(searchProducts('외미닫이').map(x => x.id)).toEqual(['door-slide-900']);
  });
});

test('칩마다 타일 색이 있고, 숨김 단종의 옛 카테고리 색도 남아 있다', () => {
  for (const c of CATEGORIES) expect(CATEGORY_COLORS[c.name], c.name).toMatch(/^#[0-9a-f]{6}$/);
  for (const p of PRODUCTS) expect(CATEGORY_COLORS[p.category], p.id).toBeTruthy();
  for (const v of Object.values(CATEGORY_COLORS)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
});
