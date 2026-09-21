import { describe, test, expect } from 'vitest';
import { drawDucts, drawDuctSelection, ductVisible, sizeLabel, DUCT_COLORS, DUCT_HANDLE_PX } from '../src/view2d/ducts2d.js';
import { normalizeDuct } from '../src/state/ductSchema.js';
import { FLOW_COLORS } from '../src/vent/equipment.js';

function fakeCtx() {
  const calls = [];
  const rec = name => (...args) => calls.push([name, ...args]);
  return { calls, save: rec('save'), restore: rec('restore'), beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
    closePath: rec('closePath'), rect: rec('rect'), arc: rec('arc'), fill: rec('fill'), stroke: rec('stroke'), setLineDash: rec('setLineDash'),
    canvas: { clientWidth: 800, clientHeight: 600 } };
}
const labels = [];
const view = { camera: { scale: 0.05 }, toScreen: p => [p[0] * 0.05, p[1] * 0.05], COLORS: { dim: '#1b2430' }, label: (t, p) => labels.push([t, p]) };
const duct = normalizeDuct({
  id: 'd1', kind: 'exhaust', points: [[0, 0], [3000.5, 0], [3000.5, 4000]],
  segments: [{ w: 750, h: 400, z: 2650 }, { w: 500, h: 300, z: 2700 }],
  connections: [{ point: 0, itemId: 'i1' }], dampers: [{ segment: 0, t: 0.5, type: 'VD', w: 550, h: 450 }],
});

describe('2D 덕트', () => {
  test('색은 급기 파랑·배기 빨강이고 숨김·플래그를 따른다', () => {
    expect(DUCT_COLORS.supply).toBe(FLOW_COLORS.supply);
    expect(DUCT_COLORS.exhaust).toBe(FLOW_COLORS.exhaust);
    expect(ductVisible(duct, {})).toBe(true);
    expect(ductVisible(duct, { ducts: false })).toBe(false);
    expect(ductVisible({ ...duct, hidden: true }, {})).toBe(false);
    expect(sizeLabel({ w: 750.4, h: 400 })).toBe('750×400');
  });

  test('구간마다 띠를 채우고 단면 라벨과 댐퍼 라벨을 찍는다', () => {
    labels.length = 0;
    const ctx = fakeCtx();
    drawDucts(ctx, view, { ducts: [duct] }, { flags: {} });
    expect(ctx.calls.filter(c => c[0] === 'fill').length).toBeGreaterThanOrEqual(2);
    expect(labels.map(l => l[0])).toContain('750×400');
    expect(labels.map(l => l[0])).toContain('500×300');
    expect(labels.map(l => l[0])).toContain('VD 550×450');
    // 첫 구간 띠의 첫 점: 폭 750의 반만큼 법선(+y 방향 perp = (0,1)·375)으로 옮긴 [0, 375] → 화면 [0, 18.75]
    const first = ctx.calls.find(c => c[0] === 'moveTo');
    expect(first[1]).toBeCloseTo(0, 9);
    expect(first[2]).toBeCloseTo(18.75, 9);
  });

  test('라벨 플래그를 끄면 단면·댐퍼 라벨이 사라진다(띠는 남는다)', () => {
    labels.length = 0;
    const ctx = fakeCtx();
    drawDucts(ctx, view, { ducts: [duct] }, { flags: { ductLabels: false } });
    expect(labels).toHaveLength(0);
    expect(ctx.calls.some(c => c[0] === 'fill')).toBe(true);
  });

  test('선택 표시는 꼭짓점마다 네모 핸들을 그린다', () => {
    const ctx = fakeCtx();
    drawDuctSelection(ctx, view, duct, { type: 'duct', id: 'd1', segment: 1, vertex: 2 });
    const rects = ctx.calls.filter(c => c[0] === 'rect');
    expect(rects).toHaveLength(3);                                    // 점 3개
    expect(rects[2][3]).toBe(DUCT_HANDLE_PX);
    expect(rects[2][1]).toBeCloseTo(3000.5 * 0.05 - DUCT_HANDLE_PX / 2, 9);
  });

  test('숨긴 덕트는 아무것도 그리지 않는다', () => {
    const ctx = fakeCtx();
    drawDucts(ctx, view, { ducts: [{ ...duct, hidden: true }] }, { flags: {} });
    expect(ctx.calls.filter(c => c[0] === 'fill')).toHaveLength(0);
  });
});
