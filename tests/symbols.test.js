import { describe, test, expect } from 'vitest';
import { symbolParts, symbolSvg } from '../src/products/symbols.js';
import { SYMBOL_NAMES, PRODUCTS } from '../src/products/catalog.js';

const nums = parts => parts.flatMap(p => Object.values(p).filter(v => typeof v === 'number'));

describe('2D 심벌 부품', () => {
  test('box는 아이템 로컬 좌표의 사각형 하나다(소수 크기)', () => {
    const parts = symbolParts('box', 1200.5, 600.25);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ t: 'rect', x: -600.25, y: -300.125, w: 1200.5, h: 600.25, fill: 'body' });
  });

  test('모든 심벌이 부품을 돌려주고 소수 크기에서도 NaN이 없다', () => {
    for (const s of SYMBOL_NAMES) {
      const parts = symbolParts(s, 900.5, 450.25);
      expect(parts.length, s).toBeGreaterThan(0);
      for (const v of nums(parts)) expect(Number.isFinite(v), s).toBe(true);
    }
  });

  test('문 심벌은 문틀 두 줄, 문짝 한 줄, 호 하나다', () => {
    const parts = symbolParts('door', 900, 40);
    expect(parts.filter(p => p.t === 'line')).toHaveLength(3);
    const arc = parts.find(p => p.t === 'arc');
    expect(arc.r).toBe(900);
    expect(arc.x).toBe(-450);
  });

  test('창 심벌은 이중선이고 기둥 심벌은 채워진다', () => {
    expect(symbolParts('window', 1200, 40).filter(p => p.t === 'line')).toHaveLength(2);
    expect(symbolParts('column', 400, 400)[0].fill).toBe('solid');
    expect(symbolParts('circle', 400, 400)[0].t).toBe('circle');
    expect(symbolParts('range', 1200, 750).filter(p => p.t === 'circle')).toHaveLength(4);
    expect(symbolParts('lamp', 500, 500).filter(p => p.t === 'circle')).toHaveLength(1);
  });

  test('symbolSvg는 문 열림 궤적까지 상자 안에 넣는다', () => {
    const k = s => Number(/scale\(([-\d.]+)\)/.exec(s)[1]);
    expect(k(symbolSvg('door', 900, 40))).toBeLessThan(k(symbolSvg('box', 900, 40))); // 궤적만큼 더 줄인다
    expect(symbolSvg('door', 900, 40)).not.toContain('NaN');
  });

  test('symbolSvg는 NaN 없는 인라인 SVG를 만든다', () => {
    const svg = symbolSvg('sofa', 2100, 900);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 56 56"');
    expect(svg).not.toContain('NaN');
    for (const p of PRODUCTS) expect(symbolSvg(p.symbol, p.size[0], p.size[1]), p.id).not.toContain('NaN');
  });
});

test('원형 기둥 심벌은 채운 원과 대각선이다', async () => {
  const { symbolParts } = await import('../src/products/symbols.js');
  const { SYMBOL_NAMES, productById } = await import('../src/products/catalog.js');
  expect(SYMBOL_NAMES).toContain('columnRound');
  expect(productById('column-round').symbol).toBe('columnRound');
  const parts = symbolParts('columnRound', 400.5, 400.5);
  expect(parts[0]).toMatchObject({ t: 'circle', fill: 'solid' });
  expect(parts[0].r).toBeCloseTo(200.25);
  expect(parts.filter(p => p.t === 'line')).toHaveLength(2);
  expect(symbolParts('circle', 400, 400)[0].fill).toBe('body');  // 스툴 등 일반 원은 그대로 연한 채움
});
