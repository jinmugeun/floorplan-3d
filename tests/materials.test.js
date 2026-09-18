import { describe, test, expect } from 'vitest';
import { MATERIAL_CATEGORIES, MATERIAL_PATTERNS, MATERIALS, materialById, materialsIn, searchMaterials } from '../src/materials/catalog.js';
import { patternParts, drawPattern } from '../src/materials/pattern.js';

describe('마감재 카탈로그', () => {
  test('카테고리 11개가 정확한 이름과 순서로 있다', () => {
    expect(MATERIAL_CATEGORIES).toEqual(['페인트', '벽지', '대리석', '마루/잔디', '타일', '벽돌', '콘크리트', '시멘트', '테라조', '카페트', '스테인리스']);
  });

  test('재질이 40개 이상이고 카테고리마다 3개 이상이며 id·코드가 겹치지 않는다', () => {
    expect(MATERIALS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(MATERIALS.map(m => m.id)).size).toBe(MATERIALS.length);
    expect(new Set(MATERIALS.map(m => m.code)).size).toBe(MATERIALS.length);
    for (const c of MATERIAL_CATEGORIES) expect(materialsIn(c).length, c).toBeGreaterThanOrEqual(3);
  });

  test('모든 재질의 색·무늬·크기·단가가 규칙 안에 있다', () => {
    for (const m of MATERIALS) {
      expect(MATERIAL_CATEGORIES, m.id).toContain(m.category);
      expect(MATERIAL_PATTERNS, m.id).toContain(m.pattern);
      expect(m.base, m.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(m.accent, m.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(m.scale, m.id).toHaveLength(2);
      expect(m.scale[0], m.id).toBeGreaterThan(0);
      expect(m.scale[1], m.id).toBeGreaterThan(0);
      expect(m.pricePerM2, m.id).toBeGreaterThan(0);
      expect(m.maker, m.id).toBe('오늘의집');
    }
  });

  test('materialById와 검색', () => {
    expect(materialById('paint-white').name).toBe('무광 화이트 페인트');
    expect(materialById('없음')).toBeNull();
    expect(searchMaterials('오크').map(m => m.id)).toContain('wood-oak');
    expect(searchMaterials('MB-01').map(m => m.id)).toEqual(['marble-carrara']);
    expect(searchMaterials('타일').length).toBeGreaterThanOrEqual(4);
    expect(searchMaterials('   ')).toEqual([]);
  });
});

describe('무늬 부품', () => {
  test('단색은 바탕 사각형 하나, 무늬는 그 위에 부품이 더 붙는다', () => {
    const solid = patternParts(materialById('paint-white'), 64);
    expect(solid).toHaveLength(1);
    expect(solid[0]).toEqual({ t: 'rect', x: 0, y: 0, w: 64, h: 64, fill: materialById('paint-white').base });
    for (const p of MATERIAL_PATTERNS.filter(x => x !== 'solid')) {
      const m = MATERIALS.find(x => x.pattern === p);
      expect(m, p).toBeTruthy();
      expect(patternParts(m, 64).length, p).toBeGreaterThan(1);
    }
  });

  test('부품은 타일 안에 머문다(소수 px 포함)', () => {
    const px = 48.5;
    for (const m of MATERIALS) {
      for (const part of patternParts(m, px)) {
        const xs = part.t === 'rect' ? [part.x, part.x + part.w] : part.t === 'line' ? [part.x1, part.x2] : [part.x - part.r, part.x + part.r];
        const ys = part.t === 'rect' ? [part.y, part.y + part.h] : part.t === 'line' ? [part.y1, part.y2] : [part.y - part.r, part.y + part.r];
        for (const v of [...xs, ...ys]) { expect(v, m.id).toBeGreaterThanOrEqual(-1); expect(v, m.id).toBeLessThanOrEqual(px + 1); }
      }
      expect(patternParts(m, px)[0].w).toBeCloseTo(px, 6);
    }
  });

  test('같은 재질은 언제나 같은 부품을 준다(난수 없음)', () => {
    const a = patternParts(materialById('terrazzo-white'), 64);
    const b = patternParts(materialById('terrazzo-white'), 64);
    expect(a).toEqual(b);
  });

  test('모르는 값도 던지지 않고 바탕만 준다', () => {
    expect(patternParts(null, 10)).toEqual([{ t: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#ffffff' }]);
    expect(patternParts({ pattern: '없음' }, 10)).toHaveLength(1);
  });

  test('drawPattern은 부품마다 캔버스 호출을 남긴다', () => {
    const calls = [];
    const ctx = {
      set fillStyle(v) { calls.push(['fillStyle', v]); }, set strokeStyle(v) { calls.push(['strokeStyle', v]); }, set lineWidth(v) { calls.push(['lineWidth', v]); },
      fillRect: (...a) => calls.push(['fillRect', ...a]), beginPath: () => calls.push(['beginPath']), moveTo: (...a) => calls.push(['moveTo', ...a]),
      lineTo: (...a) => calls.push(['lineTo', ...a]), stroke: () => calls.push(['stroke']), arc: (...a) => calls.push(['arc', ...a]), fill: () => calls.push(['fill']),
    };
    drawPattern(ctx, materialById('brick-red'), 64);
    expect(calls.filter(c => c[0] === 'fillRect')).toHaveLength(1);
    expect(calls.filter(c => c[0] === 'stroke').length).toBeGreaterThan(1);
    calls.length = 0;
    drawPattern(ctx, materialById('terrazzo-white'), 64);
    expect(calls.filter(c => c[0] === 'arc').length).toBeGreaterThan(1);
  });
});
