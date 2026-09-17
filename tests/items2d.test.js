import { describe, test, expect } from 'vitest';
import { drawItem, drawItems, drawItemSelection, itemVisible, itemHandles, symbolOf, ROT_OFFSET_PX } from '../src/view2d/items2d.js';
import { createItem } from '../src/state/schema.js';
import { productById } from '../src/products/catalog.js';
import { RAD } from '../src/geom/items.js';

function fakeCtx() {
  const calls = [];
  const rec = name => (...args) => calls.push([name, ...args]);
  return { calls, save: rec('save'), restore: rec('restore'), translate: rec('translate'), rotate: rec('rotate'), scale: rec('scale'),
    beginPath: rec('beginPath'), rect: rec('rect'), moveTo: rec('moveTo'), lineTo: rec('lineTo'), arc: rec('arc'), closePath: rec('closePath'),
    stroke: rec('stroke'), fill: rec('fill'), strokeRect: rec('strokeRect'), setLineDash: rec('setLineDash'), fillText: rec('fillText'),
    measureText: () => ({ width: 10 }), canvas: { clientWidth: 800, clientHeight: 600 } };
}
const view = { camera: { scale: 0.1 }, toScreen: p => [p[0] * 0.1, p[1] * 0.1], COLORS: { guide: '#e8b100', dim: '#1b2430' }, label() {} };
const mk = (id, patch) => createItem(productById(id), patch);

describe('2D 아이템 렌더링', () => {
  test('보기 옵션 규칙', () => {
    expect(itemVisible(mk('sofa-3', {}), {})).toBe(true);
    expect(itemVisible(mk('sofa-3', { hidden: true }), {})).toBe(false);
    expect(itemVisible(mk('sofa-3', {}), { floorItems: false })).toBe(false);
    expect(itemVisible(mk('hood-wall', {}), { wallItems: false })).toBe(false);
    expect(itemVisible(mk('light-pendant', {}), { ceilingItems: false })).toBe(false);
    expect(itemVisible(mk('column-square', {}), { structures: false })).toBe(false);
    expect(itemVisible(mk('column-square', {}), { floorItems: false })).toBe(true); // 기둥은 구조물 토글만 본다
    expect(itemVisible(mk('opening-pass', {}), { structures: false })).toBe(false);
  });

  test('symbolOf는 카탈로그에서 심벌을 찾고 모르는 제품은 box다', () => {
    expect(symbolOf(mk('bed-queen', {}))).toBe('bed');
    expect(symbolOf({ productId: '없음' })).toBe('box');
  });

  test('drawItem은 회전·반전·축척을 아이템 로컬 좌표계로 세운다', () => {
    const ctx = fakeCtx();
    drawItem(ctx, view, mk('sofa-3', { pos: [1000.5, 500.25], rot: 90, flipH: true }));
    // 부동소수 곱(1000.5 * 0.1)을 정확히 비교하지 않는다 — 값만 확인한다.
    const call = name => ctx.calls.find(c => c[0] === name);
    expect(call('translate')[1]).toBeCloseTo(100.05, 6);
    expect(call('translate')[2]).toBeCloseTo(50.025, 6);
    expect(call('rotate')[1]).toBeCloseTo(RAD(90), 9);
    expect(call('scale')[1]).toBeCloseTo(-0.1, 9);
    expect(call('scale')[2]).toBeCloseTo(0.1, 9);
    expect(ctx.calls.some(c => c[0] === 'rect')).toBe(true);
  });

  test('drawItems는 숨김·보기 옵션을 건너뛴다', () => {
    const floor = { items: [mk('sofa-3', { pos: [0, 0] }), mk('bed-queen', { pos: [3000, 0], hidden: true }), mk('light-pendant', { pos: [1000, 1000] })], walls: [], rooms: [] };
    const all = fakeCtx(); drawItems(all, view, floor, { flags: {} });
    expect(all.calls.filter(c => c[0] === 'rotate')).toHaveLength(2);
    const noCeiling = fakeCtx(); drawItems(noCeiling, view, floor, { flags: { ceilingItems: false } });
    expect(noCeiling.calls.filter(c => c[0] === 'rotate')).toHaveLength(1);
  });

  test('itemHandles는 코너 4개·변 중앙 4개와 아래쪽 회전 핸들을 준다(소수 좌표)', () => {
    const it = mk('dining-4', { pos: [1000.5, 1000.25] }); // 1200×800
    const h = itemHandles(it, view.camera.scale);
    expect(h.handles).toHaveLength(8);
    expect(h.handles[0]).toEqual([400.5, 600.25]);           // 좌상 코너
    expect(h.handles[1]).toEqual([1000.5, 600.25]);          // 위 변 중앙
    expect(h.handles[4]).toEqual([1600.5, 1400.25]);         // 우하 코너
    expect(h.rotHandle[0]).toBeCloseTo(1000.5);
    expect(h.rotHandle[1]).toBeCloseTo(1400.25 + ROT_OFFSET_PX / view.camera.scale);
    expect(h.center).toEqual([1000.5, 1000.25]);
  });

  test('회전한 아이템의 회전 핸들은 로컬 아래 방향으로 나간다', () => {
    const h = itemHandles(mk('dining-4', { pos: [0, 0], rot: 90 }), 0.1);
    expect(h.rotHandle[0]).toBeCloseTo(-(400 + ROT_OFFSET_PX / 0.1));
    expect(h.rotHandle[1]).toBeCloseTo(0);
  });

  test('선택 오버레이는 핸들 8개를 그리고 잠긴 아이템은 회전 핸들이 없다', () => {
    const a = fakeCtx(); drawItemSelection(a, view, mk('sofa-3', { pos: [0, 0] }), { locked: false });
    const b = fakeCtx(); drawItemSelection(b, view, mk('sofa-3', { pos: [0, 0], locked: true }), { locked: true });
    expect(a.calls.filter(c => c[0] === 'rect')).toHaveLength(8);      // 크기 핸들 8개
    expect(a.calls.filter(c => c[0] === 'arc')).toHaveLength(1);       // 회전 핸들
    expect(b.calls.filter(c => c[0] === 'rect')).toHaveLength(8);
    expect(b.calls.filter(c => c[0] === 'arc')).toHaveLength(0);       // 잠긴 아이템은 회전 불가
  });
});
