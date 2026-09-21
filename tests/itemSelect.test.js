import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { createSelectTool } from '../src/view2d/tools/selectTool.js';
import { createItemDragger } from '../src/view2d/tools/itemDrag.js';

const fakeView = { camera: { scale: 0.1 }, fit: () => {} };
function setup(items = [], opts = {}) {
  const store = createStore(createEmptyProject()), ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const ids = items.map(([id, patch]) => addItem(store, createItem(productById(id), patch)));
  return { store, ui, ids, t: createSelectTool({ store, ui, view: fakeView, ...opts }), floor: () => activeFloor(store.get()) };
}
const item = (store, id) => activeFloor(store.get()).items.find(i => i.id === id);

describe('아이템 선택과 이동', () => {
  test('아이템이 벽·방보다 먼저 잡힌다', () => {
    const { ui, t, ids } = setup([['sofa-3', { pos: [2000, 1500] }]]);
    t.onPointerDown([2000, 1500], {}); t.onPointerUp([2000, 1500], {});
    expect(ui.get().selection).toEqual({ type: 'item', id: ids[0] });
    t.onPointerDown([500, 2800], {}); t.onPointerUp([500, 2800], {});
    expect(ui.get().selection.type).toBe('room');
  });

  test('잠긴 아이템과 숨긴 아이템은 클릭으로 잡히지 않는다', () => {
    const { ui, t } = setup([['sofa-3', { pos: [2000, 1500], locked: true }], ['bed-queen', { pos: [1000, 500], hidden: true }]]);
    t.onPointerDown([2000, 1500], {}); t.onPointerUp([2000, 1500], {});
    expect(ui.get().selection.type).toBe('room');
    t.onPointerDown([1000, 500], {}); t.onPointerUp([1000, 500], {});
    expect(ui.get().selection.type).toBe('room');
  });

  test('드래그로 옮기면 스냅이 걸리고 undo 한 단계다', () => {
    const { store, t, ids } = setup([['sofa-3', { pos: [2000, 1500] }]]);
    t.onPointerDown([2000, 1500], {});
    t.onPointerMove([2000, 600], {});
    t.onPointerMove([2000, 560], {});
    t.onPointerUp([2000, 560], {});
    expect(item(store, ids[0]).pos).toEqual([2000, 550]); // 뒷면이 위쪽 벽 안쪽 면(100)에 붙는다
    store.undo();
    expect(item(store, ids[0]).pos).toEqual([2000, 1500]);
  });

  test('Ctrl 드래그는 스냅을 끈다', () => {
    const { store, t, ids } = setup([['sofa-3', { pos: [2000, 1500] }]]);
    t.onPointerDown([2000, 1500], {});
    t.onPointerMove([2000, 560], { ctrlKey: true });
    expect(item(store, ids[0]).pos).toEqual([2000, 560]);
    expect(t.getDrag().guides).toEqual([]);
    t.onPointerUp([2000, 560], {});
  });

  test('드래그 중 노란 가이드와 벽까지 거리가 준비된다', () => {
    const { t } = setup([['sofa-3', { pos: [2000, 1500] }]]);
    t.onPointerDown([2000, 1500], {});
    t.onPointerMove([2000, 560], {});
    const d = t.getDrag();
    expect(d.guides).toEqual([{ type: 'h', y: 100 }]);
    expect(d.gaps.up).toBeCloseTo(0);
    expect(d.gaps.down).toBeCloseTo(1900);
    t.onPointerUp([2000, 560], {});
  });

  test('Shift+클릭은 다중 선택을 토글하고 함께 움직인다', () => {
    const { store, ui, t, ids } = setup([['chair-dining', { pos: [1000, 1000] }], ['chair-dining', { pos: [2000, 1000] }]]);
    t.onPointerDown([1000, 1000], {}); t.onPointerUp([1000, 1000], {});
    t.onPointerDown([2000, 1000], { shiftKey: true }); t.onPointerUp([2000, 1000], { shiftKey: true });
    expect(ui.get().selection).toEqual({ type: 'multi', kind: 'item', ids: [ids[0], ids[1]] });
    t.onPointerDown([2000, 1000], {});
    t.onPointerMove([2000, 1300], { ctrlKey: true });
    t.onPointerUp([2000, 1300], {});
    expect(item(store, ids[0]).pos).toEqual([1000, 1300]);
    expect(item(store, ids[1]).pos).toEqual([2000, 1300]);
    t.onPointerDown([2000, 1300], { shiftKey: true }); t.onPointerUp([2000, 1300], { shiftKey: true });
    expect(ui.get().selection).toEqual({ type: 'item', id: ids[0] });
  });

  test('Shift+드래그 영역 선택은 중심이 들어온 아이템을 고른다', () => {
    const { ui, t, ids } = setup([['chair-dining', { pos: [1000, 1000] }], ['chair-dining', { pos: [3500, 2500] }]]);
    t.onPointerDown([700, 700], { shiftKey: true });
    t.onPointerMove([1500, 1500], { shiftKey: true });
    t.onPointerUp([1500, 1500], { shiftKey: true });
    expect(ui.get().selection).toEqual({ type: 'item', id: ids[0] });
  });

  test('그룹 아이템을 하나 고르면 그룹 전체가 선택된다', () => {
    const { store, ui, t, ids } = setup([['chair-dining', { pos: [1000, 1000] }], ['chair-dining', { pos: [2000, 1000] }]]);
    store.dispatch(d => { activeFloor(d).groups.push({ id: 'g1', itemIds: ids }); });
    t.onPointerDown([1000, 1000], {}); t.onPointerUp([1000, 1000], {});
    expect(ui.get().selection.type).toBe('multi');
    expect([...ui.get().selection.ids].sort()).toEqual([...ids].sort());
  });

  // I-5: 잠긴 아이템은 클릭으로 잡히지 않지만 그룹을 통해 선택에 들어온다. 그때도 끌려가면 안 된다.
  test('그룹 드래그는 잠긴 멤버를 두고 움직인다', () => {
    const { store, ui, t, ids } = setup([['chair-dining', { pos: [1000, 1000] }], ['chair-dining', { pos: [2000.5, 1000.25], locked: true }]]);
    store.dispatch(d => { activeFloor(d).groups.push({ id: 'g1', itemIds: ids }); });
    t.onPointerDown([1000, 1000], {});
    expect(ui.get().selection.type).toBe('multi'); // 그룹 전체가 선택된다
    t.onPointerMove([1000, 1400], { ctrlKey: true }); // 스냅 없이 400mm 아래로
    t.onPointerUp([1000, 1400], { ctrlKey: true });
    expect(item(store, ids[0]).pos).toEqual([1000, 1400]);
    expect(item(store, ids[1]).pos).toEqual([2000.5, 1000.25]); // 잠긴 멤버는 그대로
    store.undo();
    expect(item(store, ids[0]).pos).toEqual([1000, 1000]);
  });

  test('움직일 수 있는 것이 없으면 드래그도 트랜잭션도 열리지 않는다', () => {
    const { store, ui, ids } = setup([['chair-dining', { pos: [1000, 1000], locked: true }]]);
    const dragger = createItemDragger({ store, ui, view: fakeView });
    expect(dragger.start('items', ids, [1000, 1000])).toBeNull();
    expect(dragger.getDrag()).toBeNull();
    store.dispatch(d => { d.name = 'x'; }); // 열린 트랜잭션이 없으므로 이 dispatch가 바로 한 단계가 된다
    expect(store.canUndo()).toBe(true);
    store.undo();
    expect(store.get().name).not.toBe('x');
  });

  test('벽 부착 아이템은 벽을 따라서만 미끄러진다', () => {
    const { store, t, ids, floor } = setup([['door-swing-900', {}]]);
    const top = floor().walls.find(w => w.a[1] === 0 && w.b[1] === 0);
    // 먼저 위쪽 벽에 붙인다
    t.onPointerDown([2000, 1500], {}); t.onPointerUp([2000, 1500], {});
    store.dispatch(d => { const it = activeFloor(d).items[0]; it.wallId = top.id; it.t = 0.5; it.pos = [2000, 0]; it.rot = 0; });
    t.onPointerDown([2000, 0], {});
    t.onPointerMove([2600, 300], {});
    t.onPointerUp([2600, 300], {});
    const moved = item(store, ids[0]);
    expect(moved.pos[1]).toBe(0);          // 벽에서 떨어지지 않는다
    expect(moved.pos[0]).toBe(2600);
    expect(moved.wallId).toBe(top.id);
    expect(moved.t).toBeCloseTo(0.65);
  });

  test('잠긴 아이템은 방향키로도 움직이지 않는다', () => {
    const { store, ui, t, ids } = setup([['sofa-3', { pos: [2000, 1500], locked: true }]]);
    ui.set({ selection: { type: 'item', id: ids[0] } });   // 레이어 패널에서 고른 상태
    t.onKey({ key: 'ArrowRight' });
    expect(item(store, ids[0]).pos).toEqual([2000, 1500]);
  });

  test('방향키는 10mm, Shift+방향키는 100mm 움직인다', () => {
    const { store, ui, t, ids } = setup([['sofa-3', { pos: [2000, 1500] }]]);
    ui.set({ selection: { type: 'item', id: ids[0] } });
    expect(t.onKey({ key: 'ArrowRight' })).toBe(true);
    expect(item(store, ids[0]).pos).toEqual([2010, 1500]);
    t.onKey({ key: 'ArrowUp', shiftKey: true });
    expect(item(store, ids[0]).pos).toEqual([2010, 1400]);
    ui.set({ selection: null });
    expect(t.onKey({ key: 'ArrowRight' })).toBe(false); // 선택이 없으면 소비하지 않는다
  });

  test('도면 잠금은 벽·방 드래그만 막고 아이템은 그대로 쓴다', () => {
    const { store, ui, t, ids, floor } = setup([['sofa-3', { pos: [2000, 1500] }]]);
    store.dispatch(d => { d.view.lockPlan = true; }, { record: false });
    const top = floor().walls.find(w => w.a[1] === 0 && w.b[1] === 0);
    t.onPointerDown([2000, 0], {}); t.onPointerMove([2000, -600], {}); t.onPointerUp([2000, -600], {});
    expect(ui.get().selection).toEqual({ type: 'wall', id: top.id });
    expect(floor().walls.find(w => w.id === top.id).a[1]).toBe(0);
    t.onPointerDown([2000, 1500], {}); t.onPointerMove([2000, 1800], { ctrlKey: true }); t.onPointerUp([2000, 1800], {});
    expect(ui.get().selection).toEqual({ type: 'item', id: ids[0] });
    expect(item(store, ids[0]).pos).toEqual([2000, 1800]);
  });
});

describe('아이템 회전·크기 드래그', () => {
  test('코너 핸들을 잡으면 크기가 바뀌고 Shift는 비율을 유지한다', () => {
    const { store, ui, t, ids } = setup([['dining-4', { pos: [1000, 1000] }]]); // 1200×800
    ui.set({ selection: { type: 'item', id: ids[0] } });
    t.onPointerDown([1600, 1400], {});            // 우하 코너
    expect(t.getDrag().kind).toBe('scale');
    t.onPointerMove([1900, 1700], {});
    t.onPointerUp([1900, 1700], {});
    const it = item(store, ids[0]);
    expect(it.size[0]).toBe(1500);   // 코너를 +300, +300 끌었다
    expect(it.size[1]).toBe(1100);
    store.undo();
    expect(item(store, ids[0]).size).toEqual([1200, 800, 750]);
  });

  test('회전 핸들을 잡으면 15°씩 돌고 Ctrl로 자유 회전한다', () => {
    const { store, ui, t, ids } = setup([['dining-4', { pos: [1000, 1000] }]]);
    ui.set({ selection: { type: 'item', id: ids[0] } });
    t.onPointerDown([1000, 1400 + 260], {});      // 회전 핸들(ROT_OFFSET_PX 26 / scale 0.1)
    expect(t.getDrag().kind).toBe('rotate');
    t.onPointerMove([1100, 1400], {});
    t.onPointerUp([1100, 1400], {});
    expect(item(store, ids[0]).rot % 15).toBe(0);
    expect(item(store, ids[0]).rot).not.toBe(0);
  });

  test('Q는 90°씩 돌리고 벽 부착 아이템은 돌지 않는다', () => {
    const { store, ui, t, ids, floor } = setup([['sofa-3', { pos: [2000, 1500] }], ['door-swing-900', { pos: [2000, 0] }]]);
    ui.set({ selection: { type: 'item', id: ids[0] } });
    expect(t.onKey({ key: 'q' })).toBe(true);
    expect(item(store, ids[0]).rot).toBe(90);
    t.onKey({ key: 'q' });
    expect(item(store, ids[0]).rot).toBe(180);
    const top = floor().walls.find(w => w.a[1] === 0 && w.b[1] === 0);
    store.dispatch(d => { const it = activeFloor(d).items[1]; it.wallId = top.id; it.t = 0.5; });
    ui.set({ selection: { type: 'item', id: ids[1] } });
    t.onKey({ key: 'q' });
    expect(item(store, ids[1]).rot).toBe(0);
  });
});

test('벽 범위 밖으로 끌어낸 문은 부착이 풀린다', () => {
  const { store, ids, t } = setup([['door-swing-900', { wallId: null, pos: [2000.5, 0] }]]);
  const top = activeFloor(store.get()).walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  store.dispatch(d => { const it = activeFloor(d).items[0]; it.wallId = top.id; it.t = 0.5; it.pos = [2000, 0]; });
  t.onPointerDown([2000, 0], {}); t.onPointerMove([2000, 1500.25], { ctrlKey: true }); t.onPointerUp([2000, 1500.25], {});
  const it = item(store, ids[0]);
  expect(it.wallId).toBeNull();
  expect(it.pos[1]).toBeGreaterThan(1000);
});

test('드래그로 겹치면 경고를 한 번만 낸다', () => {
  const seen = [];
  // 토스트는 생성 시점에 주입한다(전역 toast를 갈아 끼우지 않는다).
  const { t } = setup([['dining-4', { pos: [1000, 1000] }], ['dining-4', { pos: [2600, 1000] }]], { toast: m => seen.push(m) });
  t.onPointerDown([2600, 1000], {});
  t.onPointerMove([1200, 1000], { ctrlKey: true });
  t.onPointerMove([1100, 1000], { ctrlKey: true });
  t.onPointerUp([1100, 1000], {});
  expect(seen).toEqual(['충돌이 발생중입니다']);
});

test('벽 부착 제품은 회전 핸들이 없고 크기 핸들로 늘려도 벽에 붙어 있다', () => {
  const { store, ids, t } = setup([['hood-wall', { pos: [2000, 450.5] }]]);
  const top = activeFloor(store.get()).walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  store.dispatch(d => { const it = activeFloor(d).items[0]; it.wallId = top.id; it.t = 0.5; it.side = 1; it.pos = [2000, 450]; it.rot = 0; });
  t.onPointerDown([2000, 450], {}); t.onPointerUp([2000, 450], {});
  const before = item(store, ids[0]);
  // 회전 핸들 자리를 눌러 끌어도 회전하지 않는다
  t.onPointerDown([2000, 450 + 200 + 260], {}); t.onPointerMove([2600, 900], {});
  t.onKey({ key: 'Escape' }); t.onPointerUp([2600, 900], {}); // 핸들이 없으니 방 드래그가 시작됐을 뿐이다 → 취소
  expect(item(store, ids[0]).rot).toBe(before.rot);
  expect(item(store, ids[0]).pos).toEqual(before.pos);
  t.onPointerDown([2000, 450], {}); t.onPointerUp([2000, 450], {}); // 다시 아이템을 고른다
  // 오른쪽 가운데 핸들로 너비를 늘리면 벽에 그대로 붙어 있다
  t.onPointerDown([2450, 450], {}); t.onPointerMove([2650.5, 450], {}); t.onPointerUp([2650.5, 450], {});
  const after = item(store, ids[0]);
  expect(after.size[0]).toBeGreaterThan(before.size[0]);
  expect(after.wallId).toBe(top.id);
  expect(Math.abs(after.pos[1] - (100 + after.size[1] / 2))).toBeLessThanOrEqual(1);
});

test('핸들 드래그는 2px 데드존을 지나야 크기가 바뀐다', () => {
  const { store, ui, ids, t } = setup([['sofa-3', { pos: [2000, 1500] }]]);
  ui.set({ selection: { type: 'item', id: ids[0] } });
  const before = item(store, ids[0]).size[0];
  const corner = [2000 - 1050, 1500 - 450];            // 좌상 코너 핸들
  t.onPointerDown(corner, {});
  t.onPointerMove([corner[0] + 10.5, corner[1] + 10.5], {}); // 화면 1px = 10mm → 약 1.5px 이동
  expect(item(store, ids[0]).size[0]).toBe(before);
  t.onPointerMove([corner[0] + 200.5, corner[1] + 0.5], {});
  expect(item(store, ids[0]).size[0]).not.toBe(before);
  t.onPointerUp([corner[0] + 200.5, corner[1] + 0.5], {});
});

// §13.7: 후드(천장)와 조리기구(바닥)가 겹쳐 있으면 위에서 보이는 후드가 먼저 잡혀야 한다.
// 배열 순서만 보던 예전 규칙에서는 나중에 놓은 조리기구가 후드를 가져갔다.
test('겹친 천장 제품이 바닥 제품보다 먼저 잡힌다(놓은 순서와 무관)', () => {
  const { store, ui, ids, t } = setup([
    ['hood-box', { pos: [2000.5, 1500.25] }],
    ['range-gas-high', { pos: [2000.5, 1500.25] }],
  ]);
  store.dispatch(d => { activeFloor(d).items[0].z = 1700; });      // 후드는 천장에 매달려 있다
  t.onPointerDown([2000.5, 1500.25], {}); t.onPointerUp([2000.5, 1500.25], {});
  expect(ui.get().selection).toEqual({ type: 'item', id: ids[0] }); // 후드
  // 천장 제품을 보기에서 끄면 그 아래 조리기구가 잡힌다.
  store.dispatch(d => { d.view.v2.ceilingItems = false; }, { record: false });
  t.onPointerDown([2000.5, 1500.25], {}); t.onPointerUp([2000.5, 1500.25], {});
  expect(ui.get().selection).toEqual({ type: 'item', id: ids[1] }); // 조리기구
});
