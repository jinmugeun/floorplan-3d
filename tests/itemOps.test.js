import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, normalizeItem, createItem, normalizeProject } from '../src/state/schema.js';
import { addWalls, addItem, updateItem, updateItems, deleteItems, duplicateItems, itemsOf, expandGroups, selectionStillValid, pruneSelection } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';

function setup() {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  return store;
}

describe('아이템 스키마와 액션', () => {
  test('normalizeItem은 빠진 값을 채우고 범위를 자른다', () => {
    const it = normalizeItem({ size: [5, 99999, 700], rot: -45, z: 99999, t: 5, side: 0, attach: 'nope', pos: ['x', 3.5] });
    expect(it.size).toEqual([10, 5000, 700]);
    expect(it.rot).toBe(315);
    expect(it.z).toBe(8000);
    expect(it.t).toBe(1);
    expect(it.side).toBe(1);
    expect(it.attach).toBe('floor');
    expect(it.pos).toEqual([0, 3.5]);
    expect(it.kind).toBe('product');
    expect(typeof it.id).toBe('string');
    expect(it.locked).toBe(false);
  });

  test('createItem은 카탈로그 값을 그대로 옮기고 patch가 이긴다', () => {
    const it = createItem(productById('window-slide-1200'), { pos: [1000.5, 0.25], t: 0.5 });
    expect(it.productId).toBe('window-slide-1200');
    expect(it.kind).toBe('window');
    expect(it.attach).toBe('wall');
    expect(it.size).toEqual([1200, 40, 1200]);
    expect(it.z).toBe(900);
    expect(it.pos).toEqual([1000.5, 0.25]);
    expect(it.t).toBe(0.5);
    expect(it.code).toBe('WD-1200');
  });

  test('addItem·updateItem·deleteItems는 한 단계씩 되돌려진다', () => {
    const s = setup();
    const id = addItem(s, createItem(productById('sofa-3'), { pos: [1000.5, 900.25] }));
    expect(activeFloor(s.get()).items).toHaveLength(1);
    expect(activeFloor(s.get()).items[0].size).toEqual([2100, 900, 800]);
    updateItem(s, id, { rot: 90 });
    expect(activeFloor(s.get()).items[0].rot).toBe(90);
    s.undo();
    expect(activeFloor(s.get()).items[0].rot).toBe(0);
    deleteItems(s, [id]);
    expect(activeFloor(s.get()).items).toHaveLength(0);
    s.undo();
    expect(activeFloor(s.get()).items).toHaveLength(1);
  });

  test('updateItems는 여러 아이템을 한 dispatch로 바꾼다', () => {
    const s = setup();
    const a = addItem(s, createItem(productById('chair-dining'), { pos: [500, 500] }));
    const b = addItem(s, createItem(productById('chair-dining'), { pos: [1500, 500] }));
    const before = activeFloor(s.get()).items;
    updateItems(s, [{ id: a, patch: { pos: [600.5, 500] } }, { id: b, patch: { pos: [1600.5, 500] } }]);
    expect(itemsOf(s.get(), [a, b]).map(i => i.pos[0])).toEqual([600.5, 1600.5]);
    s.undo();
    expect(activeFloor(s.get()).items.map(i => i.pos[0])).toEqual([500, 1500]);
    expect(before.map(i => i.pos[0])).toEqual([500, 1500]); // 스냅샷은 변하지 않는다
  });

  test('duplicateItems는 새 id를 돌려주고 delta만큼 옮긴다', () => {
    const s = setup();
    const id = addItem(s, createItem(productById('bed-queen'), { pos: [1000.5, 900.25] }));
    const ids = duplicateItems(s, [id], { delta: [300, 0] });
    const f = activeFloor(s.get());
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBe(id);
    expect(f.items).toHaveLength(2);
    expect(f.items[1].pos).toEqual([1300.5, 900.25]);
    expect(f.items[1].productId).toBe('bed-queen');
  });

  test('expandGroups는 그룹 동료를 함께 돌려준다', () => {
    const s = setup();
    const a = addItem(s, createItem(productById('chair-dining'), { pos: [500, 500] }));
    const b = addItem(s, createItem(productById('chair-dining'), { pos: [900, 500] }));
    s.dispatch(d => { activeFloor(d).groups.push({ id: 'g1', itemIds: [a, b] }); });
    expect(expandGroups(activeFloor(s.get()), [a]).sort()).toEqual([a, b].sort());
    expect(expandGroups(activeFloor(s.get()), ['zzz'])).toEqual([]);
  });

  test('selectionStillValid는 item과 multi를 검사한다', () => {
    const s = setup();
    const a = addItem(s, createItem(productById('chair-dining'), { pos: [500, 500] }));
    const b = addItem(s, createItem(productById('chair-dining'), { pos: [1500, 500] }));
    expect(selectionStillValid(s.get(), { type: 'item', id: a })).toBe(true);
    expect(selectionStillValid(s.get(), { type: 'item', id: 'zzz' })).toBe(false);
    expect(selectionStillValid(s.get(), { type: 'multi', kind: 'item', ids: [a, b] })).toBe(true);
    expect(selectionStillValid(s.get(), { type: 'multi', kind: 'item', ids: [a, 'zzz'] })).toBe(true); // 2A 규칙
    expect(selectionStillValid(s.get(), { type: 'multi', kind: 'item', ids: ['zzz'] })).toBe(false);
    expect(pruneSelection(s.get(), { type: 'multi', kind: 'item', ids: [a, 'zzz'] })).toEqual({ type: 'multi', kind: 'item', ids: [a] });
  });

  test('불러온 프로젝트의 items도 정규화된다', () => {
    const p = normalizeProject({ version: 1, floors: [{ items: [{ id: 'i9', size: [1, 2, 3], rot: 720.5 }] }] });
    const it = p.floors[0].items[0];
    expect(it.id).toBe('i9');
    expect(it.size).toEqual([10, 10, 10]);
    expect(it.rot).toBeCloseTo(0.5);
  });
});

test('normalizeProject drops group members that do not exist and groups smaller than two', async () => {
  const { normalizeProject } = await import('../src/state/schema.js');
  const p = createEmptyProject();
  p.floors[0].items = [{ id: 'a', pos: [0.5, 0.25], size: [500, 400, 700] }, { id: 'b', pos: [1000, 0], size: [500, 400, 700] }];
  p.floors[0].groups = [{ id: 'g1', itemIds: ['a', 'b', 'ghost'] }, { id: 'g2', itemIds: ['a', 'ghost'] }, { id: 'g3', itemIds: [] }];
  const n = normalizeProject(JSON.parse(JSON.stringify(p)));
  expect(n.floors[0].groups).toEqual([{ id: 'g1', itemIds: ['a', 'b'] }]);
});

test('duplicateItems forwards opts so it can sit inside a transaction', () => {
  const s = createStore(createEmptyProject());
  const id = addItem(s, createItem(productById('sofa-3'), { pos: [100.5, 200.25] }));
  s.beginTransaction();
  duplicateItems(s, [id], { delta: [300, 0] }, { record: false });
  s.endTransaction();
  expect(activeFloor(s.get()).items).toHaveLength(2);
  s.undo();
  expect(activeFloor(s.get()).items).toHaveLength(1); // 트랜잭션 하나 = undo 한 단계
});
