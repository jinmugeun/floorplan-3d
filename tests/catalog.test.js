import { describe, test, expect } from 'vitest';
import { CATEGORIES, PRODUCTS, SYMBOL_NAMES, productById, productsIn, searchProducts, sortProducts, fmtSize, CATEGORY_COLORS } from '../src/products/catalog.js';

describe('제품 카탈로그', () => {
  test('카테고리 13개가 정확한 이름과 순서로 있다', () => {
    expect(CATEGORIES.map(c => c.name)).toEqual(['문/창문', '가전', '침대/매트리스', '드레스룸/행거', '수납가구', '소파', '책상/테이블', '의자/스툴', '화장대/거울', '주방싱크/욕실', '조명', '구조물', '환기 설비']);
    expect(CATEGORIES.find(c => c.name === '구조물').subs).toEqual(['기둥', '개구부']);
    expect(CATEGORIES.find(c => c.name === '환기 설비').subs).toEqual(['후드', '조리기구', '디퓨저', '팬', '환기캡']);
  });

  test('제품이 40개 이상이고 id·코드가 겹치지 않는다', () => {
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(PRODUCTS.map(p => p.id)).size).toBe(PRODUCTS.length);
    expect(new Set(PRODUCTS.map(p => p.code)).size).toBe(PRODUCTS.length);
  });

  test('모든 제품의 카테고리·하위·부착·심벌·크기가 규칙 안에 있다', () => {
    for (const p of PRODUCTS) {
      const cat = CATEGORIES.find(c => c.name === p.category);
      expect(cat, p.id).toBeTruthy();
      expect(cat.subs, p.id).toContain(p.sub);
      expect(['floor', 'floorLay', 'wall', 'ceiling'], p.id).toContain(p.attach);
      expect(SYMBOL_NAMES, p.id).toContain(p.symbol);
      expect(p.size, p.id).toHaveLength(3);
      for (const v of p.size) { expect(v, p.id).toBeGreaterThanOrEqual(10); expect(v, p.id).toBeLessThanOrEqual(5000); }
      expect(typeof p.zDefault, p.id).toBe('number');
      expect(p.color, p.id).toMatch(/^#[0-9a-f]{6}$/i);
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

  test('부착 유형 4종과 구조물 3종이 모두 있다', () => {
    for (const a of ['floor', 'floorLay', 'wall', 'ceiling']) expect(PRODUCTS.some(p => p.attach === a), a).toBe(true);
    expect(productsIn('구조물', '기둥').map(p => p.name)).toEqual(['사각 기둥', '원형 기둥']);
    expect(productsIn('구조물', '개구부').map(p => p.name)).toEqual(['개구부']);
  });

  test('검색은 카테고리 밖까지 전체를 찾고 코드로도 찾는다', () => {
    const byName = searchProducts('침대');
    expect(byName.length).toBeGreaterThanOrEqual(5);
    expect(searchProducts('SF-3P').map(p => p.id)).toEqual(['sofa-3']);
    expect(searchProducts('싱크').some(p => p.category === '주방싱크/욕실')).toBe(true);
    expect(searchProducts('   ')).toEqual([]);
  });

  test('정렬은 이름순과 크기순을 지원하고 원본을 바꾸지 않는다', () => {
    const src = productsIn('소파');
    const bySize = sortProducts(src, 'size');
    const vol = p => p.size[0] * p.size[1] * p.size[2];
    for (let i = 1; i < bySize.length; i++) expect(vol(bySize[i])).toBeGreaterThanOrEqual(vol(bySize[i - 1]));
    const byName = sortProducts(src, 'name');
    expect(byName[0].name.localeCompare(byName[1].name, 'ko')).toBeLessThanOrEqual(0);
    expect(productsIn('소파')).toEqual(src);
  });

  test('모든 제품에 정적 단가가 있다', async () => {
    const { PRICES } = await import('../src/products/catalog.js');
    for (const p of PRODUCTS) {
      expect(typeof p.price, p.id).toBe('number');
      expect(p.price, p.id).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(p.price), p.id).toBe(true);
    }
    expect(Object.keys(PRICES)).toHaveLength(PRODUCTS.length);
    expect(productById('fridge-2door').price).toBe(1290000);
    expect(productById('column-square').price).toBe(0);   // 구조물은 도면 요소라 0원
    expect(PRODUCTS.filter(p => p.price > 0).length).toBeGreaterThanOrEqual(55);
  });

  test('productById와 fmtSize', () => {
    expect(productById('door-swing-900').name).toBe('여닫이문 900');
    expect(productById('없음')).toBeNull();
    expect(fmtSize([1200, 600, 750])).toBe('1200×600×750');
  });

  // §13.9: 새 방 템플릿 6종이 쓰는 제품 8종. catalog.js가 186줄이라 catalogExtra.js로 나눠 병합한다.
  test('계획 5가 더한 제품 8종이 병합되어 있다', async () => {
    const { EXTRA_PRODUCTS, EXTRA_PRICES } = await import('../src/products/catalogExtra.js');
    expect(EXTRA_PRODUCTS).toHaveLength(8);
    expect(Object.keys(EXTRA_PRICES)).toHaveLength(8);
    const ids = ['serve-counter', 'warmer-cabinet', 'bar-counter', 'coffee-machine', 'locker-12', 'meeting-table-2400', 'desk-student', 'lectern'];
    for (const id of ids) {
      const p = productById(id);
      expect(p, id).toBeTruthy();
      expect(p.price, id).toBeGreaterThan(0);
      expect(CATEGORIES.find(c => c.name === p.category).subs, id).toContain(p.sub);
      expect(SYMBOL_NAMES, id).toContain(p.symbol);
      expect(p.kind, id).toBe('product');
      expect(p.opening, id).toBeUndefined();
    }
    expect(productById('desk-student').size).toEqual([600, 450, 750]);
    expect(productById('meeting-table-2400').size).toEqual([2400, 1200, 750]);
    expect(PRODUCTS.filter(p => ids.includes(p.id))).toHaveLength(8);   // PRODUCTS에 실제로 들어 있다
  });
});

test('카테고리마다 타일 색이 있다', () => {
  expect(Object.keys(CATEGORY_COLORS).sort()).toEqual(CATEGORIES.map(c => c.name).sort());
  for (const v of Object.values(CATEGORY_COLORS)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
});
