import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { createSelectTool } from '../src/view2d/tools/selectTool.js';

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
