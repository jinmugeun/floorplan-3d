import { describe, test, expect } from 'vitest';
import { drawItem, drawItems, drawItemSelection, itemVisible, itemHandles, symbolOf, ROT_OFFSET_PX, drawOrder, ATTACH_ORDER, ITEM_DRAG_KINDS, drawnByWall, WALL_GAP_KINDS } from '../src/view2d/items2d.js';
import { symbolParts, symbolSvg } from '../src/products/symbols.js';
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

  test('글자 부품은 반전·회전에도 똑바로 선다(로컬 좌표계 밖에서 그린다)', () => {
    const ctx = fakeCtx();
    const v = { ...view, label: (text, at, opt) => ctx.calls.push(['label', text, at, opt]) };
    // 팬 심벌의 글자 부품은 로컬 (0, r*0.55) = (0, 192.5)에 있다(700×700 → r = 350).
    drawItem(ctx, v, mk('fan-exhaust-700', { pos: [1000, 2000], rot: 90, flipH: true, flipV: true }));
    const label = ctx.calls.find(c => c[0] === 'label');
    expect(label[1]).toBe('F-2');                    // 팬 번호(기본값)
    expect(label[2][0]).toBeCloseTo(1192.5, 6);      // 반전(y → −y) 뒤 90° 회전해 월드로 옮긴 위치
    expect(label[2][1]).toBeCloseTo(2000, 6);
    expect(label[3].size).toBeCloseTo(21, 6);        // 화면 px(9~28로 자른다)
    // 글자는 아이템 로컬 좌표계(rotate·scale) 안에서 그리지 않는다: 캔버스에 fillText가 없고,
    // 라벨은 restore 뒤 화면 좌표계에서 나간다 — 그래서 반전·회전에도 뒤집히거나 거울이 되지 않는다.
    expect(ctx.calls.some(c => c[0] === 'fillText')).toBe(false);
    const names = ctx.calls.map(c => c[0]);
    expect(names.indexOf('label')).toBeGreaterThan(names.lastIndexOf('restore'));
    // 회전·반전이 무엇이든 라벨은 같은 글자·같은 크기로 한 번만 나간다.
    for (const patch of [{}, { rot: 37 }, { flipH: true }, { flipV: true }, { rot: 180, flipH: true, flipV: true }]) {
      const c2 = fakeCtx();
      const v2 = { ...view, label: (text, at, opt) => c2.calls.push(['label', text, at, opt]) };
      drawItem(c2, v2, mk('fan-exhaust-700', { pos: [1000, 2000], ...patch }));
      const ls = c2.calls.filter(c => c[0] === 'label');
      expect(ls, JSON.stringify(patch)).toHaveLength(1);
      expect(ls[0][1]).toBe('F-2');
      expect(ls[0][3].size).toBeCloseTo(21, 6);
    }
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

test('drawItems dims items outside the solo room through the dim callback', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => (...a) => { calls.push([k, ...a]); return 0; }, set: (t, k, v) => { calls.push(['set', k, v]); return true; } });
  const view = { toScreen: p => [p[0] * 0.1, p[1] * 0.1], camera: { scale: 0.1 } };
  const floor = { items: [
    { id: 'in', kind: 'product', productId: 'sofa-3', pos: [1000.5, 1000.25], z: 0, rot: 0, size: [1800, 900, 800], attach: 'floor', flipH: false, flipV: false, hidden: false, locked: false },
    { id: 'out', kind: 'product', productId: 'sofa-3', pos: [9000, 9000], z: 0, rot: 0, size: [1800, 900, 800], attach: 'floor', flipH: false, flipV: false, hidden: false, locked: false },
  ] };
  drawItems(ctx, view, floor, { dim: it => (it.id === 'in' ? 1 : 0.25) });
  const alphas = calls.filter(c => c[0] === 'set' && c[1] === 'globalAlpha').map(c => c[2]);
  expect(alphas).toContain(0.25);
  expect(alphas).toContain(1);
});

describe('겹친 아이템의 그리기 순서(drawOrder)', () => {
  const at = (attach, id) => ({ id, attach, kind: 'product', productId: 'sofa-3', pos: [0, 0], z: 0, rot: 0, size: [600, 600, 600], flipH: false, flipV: false, hidden: false, locked: false });

  test('바닥 → 벽 → 천장 순위로 정렬하고 같은 순위는 배열 순서를 지킨다', () => {
    const src = [at('ceiling', 'c1'), at('floor', 'f1'), at('wall', 'w1'), at('floorLay', 'l1'), at('ceiling', 'c2'), at('floor', 'f2')];
    expect(drawOrder(src).map(i => i.id)).toEqual(['f1', 'l1', 'f2', 'w1', 'c1', 'c2']);
    expect(src.map(i => i.id)).toEqual(['c1', 'f1', 'w1', 'l1', 'c2', 'f2']);  // 원본은 그대로다
    expect(ATTACH_ORDER).toEqual({ floor: 0, floorLay: 0, wall: 1, ceiling: 2 });
  });

  test('모르는 attach는 바닥으로 보고, 빈 배열·null도 안전하다', () => {
    expect(drawOrder([])).toEqual([]);
    expect(drawOrder(null)).toEqual([]);
    const odd = [at('ceiling', 'c'), { ...at('floor', 'x'), attach: '없음' }];
    expect(drawOrder(odd).map(i => i.id)).toEqual(['x', 'c']);
  });

  test('drawItems는 순서를 drawOrder에 맡기고 아이템마다 한 번씩 그린다', () => {
    const range = { ...at('floor', 'range'), productId: 'range-gas-high', pos: [1000.5, 1000.25], size: [1200, 750, 850] };
    const hood = { ...at('ceiling', 'hood'), productId: 'hood-box', pos: [1000.5, 1000.25], size: [1600, 1200, 600] };
    const ctx = fakeCtx();
    drawItems(ctx, view, { items: [hood, range], walls: [], rooms: [] }, { flags: {}, labels: false });
    expect(ctx.calls.filter(c => c[0] === 'translate')).toHaveLength(2);
    expect(drawOrder([hood, range]).map(i => i.id)).toEqual(['range', 'hood']);  // 천장이 마지막 = 위에 그려진다
    expect(ITEM_DRAG_KINDS.has('items')).toBe(true);
    expect(ITEM_DRAG_KINDS.has('box')).toBe(false);
  });
});

// §14.4: 2D 벽이 문·창 자리를 비우고 창 유리선까지 그린 뒤로, 같은 자리에 심벌을 또 그리면
// 유리선이 네 줄이 되고 개구부(심벌이 window다)는 창처럼 보인다.
describe('벽이 그리는 자리는 심벌이 비켜 준다(창·개구부)', () => {
  const w1 = { id: 'w1', a: [100.5, 200.25], b: [4100.5, 200.25], thickness: 200, height: 2300 };
  const onWall = (id, patch = {}) => mk(id, { wallId: 'w1', t: 0.5, side: 1, pos: [2100.5, 200.25], ...patch });
  const draw = (items, opt = {}) => { const ctx = fakeCtx(); drawItems(ctx, view, { walls: [w1], items, rooms: [] }, { flags: {}, ...opt }); return ctx; };
  const shapes = ctx => ctx.calls.filter(c => ['rect', 'moveTo', 'lineTo', 'arc', 'circle', 'fill'].includes(c[0]));

  test('벽에 앉은 창은 items2d가 유리선·채움을 그리지 않는다', () => {
    const win = onWall('window-slide-1200');
    expect(win.kind).toBe('window');
    expect(drawnByWall(win, [w1])).toBe(true);
    const ctx = draw([win]);
    expect(shapes(ctx)).toHaveLength(0);
    expect(ctx.calls.filter(c => c[0] === 'translate')).toHaveLength(0);   // 로컬 좌표계조차 세우지 않는다
  });

  test('개구부(opening-pass)는 벽 위에서 아무것도 그리지 않는다 — 빈 자리만이다', () => {
    const op = onWall('opening-pass');
    expect(op.kind).toBe('opening');
    expect(symbolOf(op)).toBe('window');                                   // 카탈로그 심벌은 그대로(썸네일용)
    expect(drawnByWall(op, [w1])).toBe(true);
    expect(shapes(draw([op]))).toHaveLength(0);
  });

  test('문은 여닫이 호를 그대로 그린다(벽은 자리만 비운다)', () => {
    const door = onWall('door-swing-900');
    expect(door.kind).toBe('door');
    expect(drawnByWall(door, [w1])).toBe(false);
    const ctx = draw([door]);
    expect(ctx.calls.filter(c => c[0] === 'arc')).toHaveLength(1);          // 열림 궤적
    expect(ctx.calls.filter(c => c[0] === 'moveTo')).toHaveLength(3);       // 문틀 두 줄 + 문짝
  });

  test('벽에 앉지 않은 창(배치 미리보기·벽이 지워진 창)은 심벌이 남는다', () => {
    const loose = mk('window-slide-1200', { pos: [1000.5, 1000.25] });      // wallId 없음
    expect(drawnByWall(loose, [w1])).toBe(false);
    expect(shapes(draw([loose])).length).toBeGreaterThan(0);
    const orphan = onWall('window-slide-1200', { wallId: '없는벽' });        // 벽이 지워졌다 → 구멍이 없다
    expect(drawnByWall(orphan, [w1])).toBe(false);
    expect(shapes(draw([orphan])).length).toBeGreaterThan(0);
    expect(WALL_GAP_KINDS.has('window') && WALL_GAP_KINDS.has('opening')).toBe(true);
  });

  test('선택한 창은 심벌이 없어도 외곽선이 남는다(고를 수 있다)', () => {
    const win = onWall('window-slide-1200');
    const ctx = draw([win], { sel: { type: 'item', id: win.id } });
    // 남는 것은 strokePoly(itemCorners) 하나뿐: moveTo 1 + lineTo 3 + closePath, 심벌 도형은 없다.
    expect(ctx.calls.filter(c => ['rect', 'arc', 'fill', 'translate'].includes(c[0]))).toHaveLength(0);
    expect(ctx.calls.filter(c => c[0] === 'moveTo')).toHaveLength(1);
    expect(ctx.calls.filter(c => c[0] === 'lineTo')).toHaveLength(3);
    expect(ctx.calls.filter(c => c[0] === 'closePath')).toHaveLength(1);
  });

  test('라이브러리 썸네일은 창·개구부 모두 그대로 그린다(빈 타일이 되지 않는다)', () => {
    for (const id of ['window-slide-1200', 'opening-pass']) {
      const p = productById(id);
      const parts = symbolParts(p.symbol, p.size[0], p.size[1]);
      expect(parts.filter(x => x.t === 'line'), id).toHaveLength(2);        // 유리 두 줄은 썸네일에 남는다
      const svg = symbolSvg(p.symbol, p.size[0], p.size[1], { box: 96, solid: p.color });
      expect(svg, id).toContain('<line');
      expect(svg, id).toContain('<rect');
      expect(svg, id).not.toContain('NaN');
    }
  });
});
