import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, normalizeItem, createItem, normalizeProject } from '../src/state/schema.js';
import { addWalls, addItem, updateItem, updateItems, deleteItems, duplicateItems, itemsOf, expandGroups, selectionStillValid, pruneSelection, setWalls, deleteWall, setWallLength, deleteWalls, nudgeItems, mirrorItems, setItemFlag, replaceProduct, pasteItems, sameProductIds, groupItems, ungroupItems, alignSelection, relativeMove, arrayCopy } from '../src/state/floorOps.js';
import { rectWalls, moveWallParallel } from '../src/geom/walls.js';
import { placeOnWall, isEmbed } from '../src/geom/items.js';
import { openingsOnWall } from '../src/geom/openings.js';
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

describe('벽 부착 아이템 재부착', () => {
  test('벽을 옮기면 문이 따라가고 t는 그대로다', () => {
    const s = setup();
    const top = activeFloor(s.get()).walls.find(w => w.a[1] === 0 && w.b[1] === 0);
    const id = addItem(s, createItem(productById('door-swing-900'), { wallId: top.id, t: 0.5, pos: [2000, 0] }));
    setWalls(s, moveWallParallel(activeFloor(s.get()).walls, top.id, [0, -500]));
    const it = activeFloor(s.get()).items.find(x => x.id === id);
    expect(it.t).toBeCloseTo(0.5);
    expect(it.pos[1]).toBe(-500);
    expect(it.wallId).toBe(top.id);
  });

  test('벽을 지우면 wallId만 비우고 아이템은 남는다', () => {
    const s = setup();
    const top = activeFloor(s.get()).walls.find(w => w.a[1] === 0 && w.b[1] === 0);
    const id = addItem(s, createItem(productById('door-swing-900'), { wallId: top.id, t: 0.5, pos: [2000, 0] }));
    deleteWall(s, top.id);
    const it = activeFloor(s.get()).items.find(x => x.id === id);
    expect(it).toBeTruthy();
    expect(it.wallId).toBeNull();
  });
});

describe('재부착은 reroom이 도는 모든 액션 뒤에 돈다', () => {
  test('벽 길이를 줄이면 문이 새 길이 기준 같은 t에 다시 앉는다', () => {
    const s = setup();
    const top = activeFloor(s.get()).walls.find(w => w.a[1] === 0 && w.b[1] === 0);
    const id = addItem(s, createItem(productById('door-swing-900'), { wallId: top.id, t: 0.5, pos: [2000.5, 0] }));
    setWallLength(s, top.id, 2000);
    const it = activeFloor(s.get()).items.find(x => x.id === id);
    expect(it.t).toBeCloseTo(0.5);
    expect(Math.abs(it.pos[0] - 1000)).toBeLessThanOrEqual(1);
  });
  test('여러 벽을 한 번에 지우면 부착이 풀린다', () => {
    const s = setup();
    const top = activeFloor(s.get()).walls.find(w => w.a[1] === 0 && w.b[1] === 0);
    const id = addItem(s, createItem(productById('door-swing-900'), { wallId: top.id, t: 0.5, pos: [2000, 0] }));
    deleteWalls(s, [top.id]);
    expect(activeFloor(s.get()).items.find(x => x.id === id).wallId).toBeNull();
  });
  test('벽에 수직인 방향키는 아무것도 바꾸지 않아 되돌림 단계도 없다', () => {
    const s = setup();
    const top = activeFloor(s.get()).walls.find(w => w.a[1] === 0 && w.b[1] === 0);
    const id = addItem(s, createItem(productById('door-swing-900'), { wallId: top.id, t: 0.5, pos: [2000, 0] }));
    const before = s.get();
    nudgeItems(s, [id], [0, 10]);
    expect(s.get()).toBe(before); // dispatch 자체가 일어나지 않았다
    nudgeItems(s, [id], [10, 0]);
    expect(activeFloor(s.get()).items.find(x => x.id === id).t).toBeGreaterThan(0.5);
  });
});

describe('아이템 편집 동작', () => {
  test('좌우 반전은 flipH를 토글하고 여러 개면 위치도 반사한다', () => {
    const s = setup();
    const a = addItem(s, createItem(productById('chair-dining'), { pos: [1000, 1000] }));
    mirrorItems(s, [a], 'h');
    expect(activeFloor(s.get()).items[0].flipH).toBe(true);
    expect(activeFloor(s.get()).items[0].pos).toEqual([1000, 1000]); // 하나면 제자리
    const b = addItem(s, createItem(productById('chair-dining'), { pos: [2000.5, 1000] }));
    mirrorItems(s, [a, b], 'h');
    const [x, y] = activeFloor(s.get()).items.map(i => i.pos[0]);
    expect(x).toBeCloseTo(2000.5);
    expect(y).toBeCloseTo(1000);
    expect(activeFloor(s.get()).items[0].flipH).toBe(false); // 다시 토글
  });

  test('상하 반전은 flipV와 y를 반사한다', () => {
    const s = setup();
    const a = addItem(s, createItem(productById('chair-dining'), { pos: [1000, 500] }));
    const b = addItem(s, createItem(productById('chair-dining'), { pos: [1000, 1500] }));
    mirrorItems(s, [a, b], 'v');
    expect(activeFloor(s.get()).items.map(i => i.pos[1])).toEqual([1500, 500]);
    expect(activeFloor(s.get()).items.every(i => i.flipV)).toBe(true);
  });

  test('setItemFlag는 토글과 지정 둘 다 된다', () => {
    const s = setup();
    const a = addItem(s, createItem(productById('sofa-3'), { pos: [0, 0] }));
    setItemFlag(s, [a], 'hidden');
    expect(activeFloor(s.get()).items[0].hidden).toBe(true);
    setItemFlag(s, [a], 'hidden', false);
    expect(activeFloor(s.get()).items[0].hidden).toBe(false);
    setItemFlag(s, [a], 'locked', true);
    expect(activeFloor(s.get()).items[0].locked).toBe(true);
  });

  test('제품 교체는 위치를 지키고 벽 부착은 벽에 다시 맞춘다', () => {
    const s = setup();
    const f = activeFloor(s.get());
    const top = f.walls.find(w => w.a[1] === 0 && w.b[1] === 0);
    const a = addItem(s, createItem(productById('sofa-3'), { pos: [2000.5, 1500.25], rot: 90 }));
    replaceProduct(s, [a], productById('bed-queen'));
    const it = activeFloor(s.get()).items[0];
    expect(it.productId).toBe('bed-queen');
    expect(it.size).toEqual([1500, 2000, 600]);
    expect(it.pos).toEqual([2000.5, 1500.25]);
    expect(it.rot).toBe(90);
    const b = addItem(s, createItem(productById('hood-wall'), { wallId: top.id, t: 0.5, side: 1, pos: [2000, 350] }));
    replaceProduct(s, [b], productById('cabinet-upper'));   // 깊이 350 → 벽면에서 175
    const w = activeFloor(s.get()).items[1];
    expect(w.size).toEqual([900, 350, 700]);
    expect(w.pos).toEqual([2000, 275]);
    expect(w.z).toBe(1500);
  });

  test('붙여넣기는 스냅샷을 옮겨 새 id로 넣고 같은 제품 선택은 같은 productId를 모은다', () => {
    const s = setup();
    const a = addItem(s, createItem(productById('chair-dining'), { pos: [1000, 1000] }));
    addItem(s, createItem(productById('chair-dining'), { pos: [2000, 1000] }));
    addItem(s, createItem(productById('sofa-3'), { pos: [3000, 1000] }));
    const snaps = itemsOf(s.get(), [a]).map(i => structuredClone(i));
    const ids = pasteItems(s, snaps, { delta: [200, 200] });
    expect(ids).toHaveLength(1);
    expect(activeFloor(s.get()).items).toHaveLength(4);
    expect(activeFloor(s.get()).items[3].pos).toEqual([1200, 1200]);
    expect(sameProductIds(activeFloor(s.get()), 'chair-dining')).toHaveLength(3);
    expect(pasteItems(s, [], {})).toEqual([]);
  });
});

// I-2: reattach·openingsOnWall은 "pos는 항상 (wallId, t)의 결과"를 전제한다. 사본을 만드는 세 경로가
// wallId·t를 그대로 들고 가면 2D 자리와 3D 개구부가 어긋나고, 다음 벽 편집에서 사본이 원본에 겹쳤다.
describe('사본의 벽 부착 불변식', () => {
  // 벽 부착 아이템은 pos가 (wallId, t, side, size)에서 나온 값이거나, wallId가 비어 있어야 한다.
  const invariant = f => f.items.every(it => {
    if (it.attach !== 'wall' || !it.wallId) return true;
    const w = f.walls.find(x => x.id === it.wallId);
    if (!w) return false;
    const r = placeOnWall(w, it.t, it.side, it.size, { embed: isEmbed(it) });
    return it.pos[0] === Math.round(r.pos[0]) && it.pos[1] === Math.round(r.pos[1]);
  });
  // 소수 t로 벽에 제대로 앉힌 문 하나.
  function withDoor() {
    const s = setup();
    const w = activeFloor(s.get()).walls[0];
    const seat = placeOnWall(w, 0.375, 1, [900, 40, 2100], { embed: true });
    const id = addItem(s, createItem(productById('door-swing-900'), { wallId: w.id, t: 0.375, side: 1, pos: [Math.round(seat.pos[0]), Math.round(seat.pos[1])], rot: seat.rot }));
    return { s, id, wall: w };
  }

  test('벽에 수직으로 복제하거나 회전 복사한 문은 원본 위에 겹치지 않고 옆자리에 앉거나 부착을 놓는다', () => {
    // delta [0, 300]은 같은 벽의 같은 t로 되돌아오므로(nearestWallPlacement) freeT가 옆으로 옮겨야 한다.
    const a = withDoor();
    const [c1] = duplicateItems(a.s, [a.id], { delta: [0, 300.5] });
    const f1 = activeFloor(a.s.get());
    const orig = f1.items.find(i => i.id === a.id), copy = f1.items.find(i => i.id === c1);
    expect(copy.wallId).toBe(a.wall.id);
    expect(Math.abs(copy.t - orig.t) * 4000).toBeGreaterThanOrEqual(899); // 문 너비만큼 떨어진다
    expect(openingsOnWall(f1.items, f1.walls.find(w => w.id === a.wall.id))).toHaveLength(2);
    // 회전 복사 3개: 모두 같은 자리로 돌아오지만 서로 다른 t를 받거나 떨어진다.
    const b = withDoor();
    const made = arrayCopy(b.s, [b.id], 'rotate', { count: 4, angle: 90 });
    const f2 = activeFloor(b.s.get());
    const seated = f2.items.filter(i => i.wallId === b.wall.id);
    const ts = seated.map(i => Math.round(i.t * 4000));
    expect(new Set(ts).size).toBe(ts.length);            // 같은 벽에 앉은 것들은 t가 전부 다르다
    for (const id of made) { const c = f2.items.find(i => i.id === id); if (!c.wallId) expect(c.t).toBe(0); }
  });

  test('복제·붙여넣기·배열 복사 사본이 모두 (wallId, t)와 맞는 pos를 갖는다', () => {
    for (const copy of [
      ({ s, id }) => duplicateItems(s, [id], { delta: [200, 200] }),
      ({ s, id }) => pasteItems(s, itemsOf(s.get(), [id]).map(i => structuredClone(i)), { delta: [200, 200] }),
      ({ s, id }) => arrayCopy(s, [id], 'linear', { dx: 200.5, dy: 0, count: 2 }),
    ]) {
      const a = withDoor();
      const made = copy(a);
      expect(made.length).toBeGreaterThan(0);
      const f = activeFloor(a.s.get());
      expect(invariant(f)).toBe(true);
      // 벽을 한 번 만져도(= reattach) 불변식이 유지되고 사본이 원본 위로 되돌아가지 않는다.
      const before = f.items.map(i => [...i.pos]);
      setWallLength(a.s, a.wall.id, 4000);
      const after = activeFloor(a.s.get());
      expect(invariant(after)).toBe(true);
      expect(after.items.map(i => [...i.pos])).toEqual(before);
      expect(new Set(after.items.filter(i => i.wallId).map(i => i.t)).size)
        .toBe(after.items.filter(i => i.wallId).length); // 사본마다 t가 다르다(구멍이 겹치지 않는다)
    }
  });

  test('복제한 문은 같은 벽의 다른 자리에 앉고 3D 구멍이 2개가 된다', () => {
    const { s, id, wall } = withDoor();
    const [copyId] = duplicateItems(s, [id], { delta: [200, 0] });
    const f = activeFloor(s.get());
    const copy = f.items.find(i => i.id === copyId);
    expect(copy.wallId).toBe(wall.id);
    // 0.375 + 200/4000 = 0.425는 원본 문(900 폭)과 겹치므로 freeT가 문 너비(900/4000 = 0.225)만큼 더 민다.
    expect(copy.t).toBeCloseTo(0.65, 6);
    const holes = openingsOnWall(f.items, f.walls.find(w => w.id === wall.id));
    expect(holes).toHaveLength(2);
    expect(holes[0].u0).not.toBeCloseTo(holes[1].u0);
  });

  test('벽에서 멀리 붙여넣은 문은 부착을 놓는다(유령 개구부를 만들지 않는다)', () => {
    const { s, id, wall } = withDoor();
    const snaps = itemsOf(s.get(), [id]).map(i => structuredClone(i));
    const [copyId] = pasteItems(s, snaps, { delta: [0, 1400] });
    const f = activeFloor(s.get());
    const copy = f.items.find(i => i.id === copyId);
    expect(copy.wallId).toBeNull();
    expect(copy.t).toBe(0);
    expect(copy.pos).toEqual([f.items.find(i => i.id === id).pos[0], f.items.find(i => i.id === id).pos[1] + 1400]);
    expect(openingsOnWall(f.items, f.walls.find(w => w.id === wall.id))).toHaveLength(1); // 원본 것만
    expect(invariant(f)).toBe(true);
  });

  test('제품 교체가 벽을 못 찾으면 부착을 놓는다(끊긴 wallId를 남기지 않는다)', () => {
    const s = setup();
    const id = addItem(s, createItem(productById('door-swing-900'), { wallId: 'w_없음', t: 0.5, pos: [1000, 0] }));
    replaceProduct(s, [id], productById('window-slide-1200'));
    const it = activeFloor(s.get()).items[0];
    expect(it.wallId).toBeNull();
    expect(it.t).toBe(0);
    expect(invariant(activeFloor(s.get()))).toBe(true);
  });
});

// I-5: 잠긴 아이템은 방향키·기즈모·핸들뿐 아니라 그룹 이동·정렬·상대이동·반전으로도 움직이지 않는다.
describe('잠긴 아이템은 이동 경로 전부에서 제외된다', () => {
  function pair() {
    const s = setup();
    const free = addItem(s, createItem(productById('chair-dining'), { pos: [1000, 1000] }));
    const lock = addItem(s, createItem(productById('chair-dining'), { pos: [2000.5, 1500.25], locked: true }));
    return { s, free, lock, at: id => activeFloor(s.get()).items.find(i => i.id === id).pos };
  }

  test('정렬·상대이동·반전이 잠긴 아이템을 건드리지 않는다', () => {
    const a = pair();
    alignSelection(a.s, [a.free, a.lock], 'v', 'center');
    expect(a.at(a.lock)).toEqual([2000.5, 1500.25]);
    expect(a.at(a.free)).toEqual([1000, 1000]); // 짝이 하나뿐이라 정렬할 것이 없다
    relativeMove(a.s, [a.free, a.lock], { dx: 300, dy: -200 });
    expect(a.at(a.lock)).toEqual([2000.5, 1500.25]);
    expect(a.at(a.free)).toEqual([1300, 800]);
    mirrorItems(a.s, [a.free, a.lock], 'h');
    expect(a.at(a.lock)).toEqual([2000.5, 1500.25]);
    expect(activeFloor(a.s.get()).items.find(i => i.id === a.lock).flipH).toBe(false);
    expect(activeFloor(a.s.get()).items.find(i => i.id === a.free).flipH).toBe(true);
  });

  test('방향키와 90° 회전도 잠긴 아이템을 건너뛴다', () => {
    const a = pair();
    nudgeItems(a.s, [a.free, a.lock], [10, 0]);
    expect(a.at(a.lock)).toEqual([2000.5, 1500.25]);
    expect(a.at(a.free)).toEqual([1010, 1000]);
  });
});

describe('그룹·배열·상대이동', () => {
  test('그룹화는 2개 이상일 때만 만들고 겹치는 그룹을 합친다', () => {
    const s = setup();
    const a = addItem(s, createItem(productById('chair-dining'), { pos: [0, 0] }));
    const b = addItem(s, createItem(productById('chair-dining'), { pos: [500, 0] }));
    const c = addItem(s, createItem(productById('chair-dining'), { pos: [1000, 0] }));
    groupItems(s, [a]);
    expect(activeFloor(s.get()).groups).toHaveLength(0);
    groupItems(s, [a, b]);
    expect(activeFloor(s.get()).groups).toHaveLength(1);
    groupItems(s, [b, c]);
    expect(activeFloor(s.get()).groups).toHaveLength(1); // 기존 그룹을 대체
    ungroupItems(s, [c]);
    expect(activeFloor(s.get()).groups).toHaveLength(0);
  });

  test('아이템을 지우면 그룹에서도 빠지고 1개만 남으면 그룹이 사라진다', () => {
    const s = setup();
    const a = addItem(s, createItem(productById('chair-dining'), { pos: [0, 0] }));
    const b = addItem(s, createItem(productById('chair-dining'), { pos: [500, 0] }));
    groupItems(s, [a, b]);
    deleteItems(s, [b]);
    expect(activeFloor(s.get()).groups).toHaveLength(0);
  });

  test('상대이동은 옮기거나 복사한다', () => {
    const s = setup();
    const a = addItem(s, createItem(productById('sofa-3'), { pos: [1000.5, 1000] }));
    relativeMove(s, [a], { dx: 300, dy: -200 });
    expect(activeFloor(s.get()).items[0].pos).toEqual([1300.5, 800]);
    const ids = relativeMove(s, [a], { dx: 100, dy: 0, copy: true });
    expect(activeFloor(s.get()).items).toHaveLength(2);
    expect(ids[0]).not.toBe(a);
    expect(activeFloor(s.get()).items[1].pos).toEqual([1400.5, 800]);
  });

  test('배열 복사는 원본을 남기고 사본을 만든다', () => {
    const s = setup();
    const a = addItem(s, createItem(productById('chair-dining'), { pos: [1000, 1000] }));
    const lin = arrayCopy(s, [a], 'linear', { dx: 500, dy: 0, count: 3 });
    expect(lin).toHaveLength(3);
    expect(activeFloor(s.get()).items.map(i => i.pos[0])).toEqual([1000, 1500, 2000, 2500]);
    s.undo();
    const cir = arrayCopy(s, [a], 'circular', { center: [1000, 0], angle: 90, count: 1 });
    expect(cir).toHaveLength(1);
    const copy = activeFloor(s.get()).items[1];
    expect(copy.pos[0]).toBeCloseTo(0);
    expect(copy.pos[1]).toBeCloseTo(0);
    expect(copy.rot).toBe(90);
    s.undo();
    const rot = arrayCopy(s, [a], 'rotate', { angle: 45, count: 2 });
    expect(rot).toHaveLength(2);
    expect(activeFloor(s.get()).items.slice(1).map(i => [i.pos[0], i.rot])).toEqual([[1000, 45], [1000, 90]]);
  });

  test('정렬은 선택한 아이템을 한 단계로 맞춘다', () => {
    const s = setup();
    const a = addItem(s, createItem(productById('chair-dining'), { pos: [1000, 1000] }));
    const b = addItem(s, createItem(productById('chair-dining'), { pos: [2000, 1500] }));
    alignSelection(s, [a, b], 'v', 'center');
    const ys = activeFloor(s.get()).items.map(i => i.pos[1]);
    expect(ys[0]).toBeCloseTo(1250);
    expect(ys[1]).toBeCloseTo(1250);
    s.undo();
    expect(activeFloor(s.get()).items.map(i => i.pos[1])).toEqual([1000, 1500]);
  });
});

// 회귀 방지 테스트(M-31): 2B의 replaceProduct가 이미 벽 재부착을 하므로 red 단계 없이 통과한다.
test('제품 교체가 벽 부착 제품을 벽에 다시 앉힌다', () => {
  const s = setup();
  const w = activeFloor(s.get()).walls.find(x => x.a[1] === 0 && x.b[1] === 0);
  const id = addItem(s, createItem(productById('window-slide-1200'), { wallId: w.id, t: 0.5, pos: [2000, 0], side: 1 }));
  replaceProduct(s, [id], productById('window-slide-1800'));
  const it = activeFloor(s.get()).items[0];
  expect(it.size).toEqual([1800, 40, 1200]);
  expect(it.wallId).toBe(w.id);
  expect(it.t).toBe(0.5);
  expect(it.pos).toEqual([2000, 0]);   // 개구부는 벽 두께 안에 박힌다(embed)
  expect(it.rot).toBe(0);
});

test('replaceProduct로 설비가 아닌 제품이 되면 덕트 연결·상단 후드 참조가 정리된다(한 단계)', async () => {
  const { addDuct, ductById } = await import('../src/state/ductOps.js');
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [8000.5, 6000.25], 200));
  const hood = addItem(store, createItem(productById('hood-box'), { pos: [2000.5, 1500.25] }));
  const range = addItem(store, createItem(productById('range-gas-high'), { pos: [2000.5, 1500.25], props: { type: 'appliance', kind: 'range', heat: 'gas', hoodId: hood } }));
  const ductId = addDuct(store, { points: [[2000.5, 1500.25], [6000, 1500.25]], segments: [{ w: 750, h: 400, z: 2650 }], connections: [{ point: 0, itemId: hood }] });
  const f = () => activeFloor(store.get());
  expect(ductById(f(), ductId).connections).toHaveLength(1);
  expect(f().items.find(i => i.id === range).props.hoodId).toBe(hood);

  replaceProduct(store, [hood], productById('cabinet-upper'));    // 설비가 아닌 제품으로 교체
  expect(f().items.find(i => i.id === hood).kind).toBe('product');
  expect(f().items.find(i => i.id === hood).props).toBeUndefined();
  expect(ductById(f(), ductId).connections).toEqual([]);           // 유령 연결이 남지 않는다
  expect(f().items.find(i => i.id === range).props.hoodId).toBeNull();
  store.undo();                                                    // 교체 + 정리가 한 단계다
  expect(ductById(f(), ductId).connections).toHaveLength(1);
  expect(f().items.find(i => i.id === range).props.hoodId).toBe(hood);
});

test('설비를 다른 설비로 바꾸면 덕트 연결은 남고, 후드가 아니게 되면 상단 후드만 비워진다', async () => {
  const { addDuct, ductById } = await import('../src/state/ductOps.js');
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [8000, 6000], 200));
  const hood = addItem(store, createItem(productById('hood-box'), { pos: [2000, 1500] }));
  const range = addItem(store, createItem(productById('range-gas-high'), { pos: [2000, 1500], props: { type: 'appliance', kind: 'range', heat: 'gas', hoodId: hood } }));
  const ductId = addDuct(store, { points: [[2000, 1500], [6000, 1500]], segments: [{ w: 750, h: 400, z: 2650 }], connections: [{ point: 0, itemId: hood }] });
  const f = () => activeFloor(store.get());
  replaceProduct(store, [hood], productById('diffuser-650'));      // 설비이지만 후드가 아니다
  expect(f().items.find(i => i.id === hood).props.type).toBe('diffuser');
  expect(ductById(f(), ductId).connections).toHaveLength(1);       // 설비끼리면 연결은 유지된다
  expect(f().items.find(i => i.id === range).props.hoodId).toBeNull();
});
