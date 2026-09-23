import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { placeOnWall } from '../src/geom/items.js';
import { openingsOnWall } from '../src/geom/openings.js';
import { productById } from '../src/products/catalog.js';
import { rectWalls, moveWallParallel, makeWall } from '../src/geom/walls.js';
import { addWalls, addItem, deleteWall, deleteRoom, updateRoom, setRoomWallThickness, transformFloor, setWalls, selectionStillValid, addMeasure, addFloor, setActiveFloor, renameFloor, deleteFloor, updateFloor, totalArea, setWallLength, setRoomWallHeight, pruneSelection, deleteWalls, duplicateRoom, pruneSolo, updateWallProps, deleteMeasure, crossFloorName, changedFloorIndex, updateItem } from '../src/state/floorOps.js';

const setup = () => { const s = createStore(createEmptyProject()); addWalls(s, rectWalls([0, 0], [4000, 3000], 200)); return s; };

test('addWalls detects rooms', () => {
  const s = setup();
  expect(activeFloor(s.get()).rooms).toHaveLength(1);
});
test('deleteWall removes room', () => {
  const s = setup();
  deleteWall(s, activeFloor(s.get()).walls[0].id);
  expect(activeFloor(s.get()).walls).toHaveLength(3);
  expect(activeFloor(s.get()).rooms).toHaveLength(0);
});
test('updateRoom and thickness', () => {
  const s = setup();
  const r = activeFloor(s.get()).rooms[0];
  updateRoom(s, r.id, { name: '식당' });
  setRoomWallThickness(s, r.id, 100);
  const f = activeFloor(s.get());
  expect(f.rooms[0].name).toBe('식당');
  expect(f.walls.every(w => w.thickness === 100)).toBe(true);
  expect(f.rooms[0].area).toBeCloseTo(3.9 * 2.9, 2);
});
test('deleteRoom removes its unshared walls', () => {
  const s = setup();
  deleteRoom(s, activeFloor(s.get()).rooms[0].id);
  expect(activeFloor(s.get()).walls).toHaveLength(0);
});
test('addWalls skips a wall coincident with an existing wall', () => {
  const s = setup();
  addWalls(s, rectWalls([4000, 0], [7000, 3000], 200));
  const f = activeFloor(s.get());
  expect(f.walls).toHaveLength(7);
  expect(f.rooms).toHaveLength(2);
});
test('transformFloor flips walls and rerooms', () => {
  const s = setup();
  transformFloor(s, p => [-p[0], p[1]]);
  const f = activeFloor(s.get());
  expect(f.rooms).toHaveLength(1);
  expect(Math.min(...f.walls.map(w => w.a[0]))).toBe(-4000);
});
test('transformFloor keeps room identity and name after a flip', () => {
  const s = setup();
  const r = activeFloor(s.get()).rooms[0];
  updateRoom(s, r.id, { name: '식당' });
  transformFloor(s, p => [-p[0], p[1]]);
  const f = activeFloor(s.get());
  expect(f.rooms).toHaveLength(1);
  expect(f.rooms[0].id).toBe(r.id);
  expect(f.rooms[0].name).toBe('식당');
});
test('setWalls with a wall moved 600 mm in one step keeps room identity and name', () => {
  const s = setup();
  const r = activeFloor(s.get()).rooms[0];
  updateRoom(s, r.id, { name: '식당' });
  const walls = activeFloor(s.get()).walls;
  const top = walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  setWalls(s, moveWallParallel(walls, top.id, [0, -600]));
  const f = activeFloor(s.get());
  expect(f.rooms[0].id).toBe(r.id);
  expect(f.rooms[0].name).toBe('식당');
});
test('selectionStillValid checks the selected wall/room still exists on the active floor', () => {
  const s = setup();
  const f = activeFloor(s.get());
  expect(selectionStillValid(s.get(), null)).toBe(true);
  expect(selectionStillValid(s.get(), { type: 'wall', id: f.walls[0].id })).toBe(true);
  expect(selectionStillValid(s.get(), { type: 'room', id: f.rooms[0].id })).toBe(true);
  expect(selectionStillValid(s.get(), { type: 'wall', id: 'nope' })).toBe(false);
  s.undo(); // 벽이 사라진다
  expect(selectionStillValid(s.get(), { type: 'wall', id: f.walls[0].id })).toBe(false);
  expect(selectionStillValid(s.get(), { type: 'room', id: f.rooms[0].id })).toBe(false);
});
test('selectionStillValid returns true when there is no active floor', () => {
  expect(selectionStillValid({ floors: [], activeFloor: 0 }, { type: 'wall', id: 'x' })).toBe(true);
});
test('addWalls joins walls: a divider across a room makes two rooms', () => {
  const s = setup();
  addWalls(s, [makeWall({ a: [2000, 0], b: [2000, 3000] })]);
  const f = activeFloor(s.get());
  expect(f.rooms).toHaveLength(2);
  expect(f.walls).toHaveLength(7); // 위·아래 벽이 각각 둘로 나뉘고 가운데 벽 하나
});
test('adjacent rooms of different depth share one wall piece', () => {
  const s = setup();
  addWalls(s, rectWalls([4000, 0], [7000, 2000], 200));
  const f = activeFloor(s.get());
  expect(f.rooms).toHaveLength(2);
  expect(f.walls.filter(w => w.a[0] === 4000 && w.b[0] === 4000)).toHaveLength(2); // 공유선이 두 조각, 중복 없음
});
test('moving a wall onto another wall joins them', () => {
  const s = setup();
  addWalls(s, [makeWall({ a: [6000, 500], b: [6000, 2500] })]);
  const f = activeFloor(s.get());
  const lone = f.walls.find(w => w.a[0] === 6000);
  setWalls(s, moveWallParallel(f.walls, lone.id, [-2000, 0]));
  const g = activeFloor(s.get());
  expect(g.walls.filter(w => w.a[0] === 4000 && w.b[0] === 4000)).toHaveLength(3); // 오른쪽 벽이 3조각
});

test('addFloor with copy "none" starts empty and becomes the active floor', () => {
  const s = setup();
  addFloor(s, { name: '2층', copy: 'none' });
  const p = s.get();
  expect(p.floors).toHaveLength(2);
  expect(p.activeFloor).toBe(1);
  expect(p.floors[1].name).toBe('2층');
  expect(p.floors[1].height).toBe(p.floors[0].height);
  expect(activeFloor(p).walls).toHaveLength(0);
  expect(p.floors[0].walls).toHaveLength(4); // 원본은 그대로
});

test('addFloor with copy "plan" duplicates walls with new ids and keeps room names', () => {
  const s = setup();
  const r = activeFloor(s.get()).rooms[0];
  updateRoom(s, r.id, { name: '가열조리실', type: 'cook', height: 2800 });
  addFloor(s, { copy: 'plan' });
  const p = s.get();
  const f = activeFloor(p);
  expect(f.name).toBe('Floor 2');
  expect(f.walls).toHaveLength(4);
  expect(f.walls.every(w => !p.floors[0].walls.some(o => o.id === w.id))).toBe(true); // 새 id
  expect(f.rooms).toHaveLength(1);
  expect(f.rooms[0].name).toBe('가열조리실');
  expect(f.rooms[0].type).toBe('cook');
  expect(f.rooms[0].height).toBe(2800);
  expect(f.rooms[0].id).not.toBe(r.id);
});

test('addFloor with copy "all" also copies measures, and fractional walls survive', () => {
  const s = createStore(createEmptyProject());
  addWalls(s, rectWalls([0.5, 0.25], [4000.5, 3000.75], 200)); // 소수 좌표
  addMeasure(s, { id: 'm1', a: [0.5, 0.25], b: [4000.5, 0.25] });
  addFloor(s, { copy: 'all' });
  const f = activeFloor(s.get());
  expect(f.measures).toEqual([{ id: 'm1', a: [0.5, 0.25], b: [4000.5, 0.25] }]);
  expect(f.rooms).toHaveLength(1);
  expect(f.rooms[0].area).toBeCloseTo(3.8 * 2.8005, 2);
});

// I-1: 벽은 새 id를 받으므로 아이템의 wallId도 함께 옮겨야 한다. 옮기지 않으면 2D에는 문이 보이는데
// 3D 벽에는 구멍이 없고, 그 층에서 벽을 한 번 만지면 부착이 조용히 풀렸다.
test('addFloor with copy "all" re-seats wall items on the new walls so openings survive (fractional)', () => {
  const s = createStore(createEmptyProject());
  addWalls(s, rectWalls([0.5, 0.25], [4000.5, 3000.75], 200)); // 소수 좌표
  const w0 = activeFloor(s.get()).walls[0];
  const seat = placeOnWall(w0, 0.375, 1, [900, 40, 2100], { embed: true });
  addItem(s, createItem(productById('door-swing-900'), { wallId: w0.id, t: 0.375, side: 1, pos: [Math.round(seat.pos[0]), Math.round(seat.pos[1])], rot: seat.rot }));
  addFloor(s, { copy: 'all' });
  const f = activeFloor(s.get());
  expect(f.items).toHaveLength(1);
  const it = f.items[0];
  expect(it.wallId).not.toBe(w0.id);                       // 옛 층의 벽을 가리키지 않는다
  const w = f.walls.find(x => x.id === it.wallId);
  expect(w).toBeTruthy();                                  // 새 층의 벽을 가리킨다
  expect(it.t).toBeCloseTo(0.375, 6);
  expect(f.walls.reduce((n, x) => n + openingsOnWall(f.items, x).length, 0)).toBe(1); // 3D 개구부가 남는다
  expect(openingsOnWall(f.items, w)).toHaveLength(1);
  const r = placeOnWall(w, it.t, it.side, it.size, { embed: true });
  expect(it.pos).toEqual([Math.round(r.pos[0]), Math.round(r.pos[1])]); // pos는 (wallId, t)의 결과다
  setWallLength(s, w.id, 3800);                            // 새 층에서 벽을 만져도 부착이 풀리지 않는다
  expect(activeFloor(s.get()).items[0].wallId).toBe(w.id);
});

test('setActiveFloor switches without an undo step; rename, updateFloor and delete work', () => {
  const s = setup();
  addFloor(s, { copy: 'none' });
  const undoable = s.canUndo();
  setActiveFloor(s, 0);
  expect(s.get().activeFloor).toBe(0);
  expect(s.canUndo()).toBe(undoable); // 층 전환은 되돌릴 단계가 아니다
  renameFloor(s, 1, '옥상');
  expect(s.get().floors[1].name).toBe('옥상');
  updateFloor(s, 1, { slab: 250, height: 3000 });
  expect(s.get().floors[1].slab).toBe(250);
  deleteFloor(s, 1);
  expect(s.get().floors).toHaveLength(1);
  expect(s.get().activeFloor).toBe(0);
  deleteFloor(s, 0);
  expect(s.get().floors).toHaveLength(1); // 마지막 층은 지우지 않는다
});

test('totalArea sums room areas, and gross adds the wall footprints', () => {
  const s = setup(); // 4000 x 3000, 두께 200 → 내부 3800 x 2800 = 10.64 m²
  const f = activeFloor(s.get());
  expect(totalArea(f, 'net')).toBeCloseTo(10.64, 2);
  const wallFootprint = (4000 + 3000) * 2 * 200 / 1e6; // 2.8 m²
  expect(totalArea(f, 'gross')).toBeCloseTo(10.64 + wallFootprint, 2);
  expect(totalArea({ rooms: [], walls: [] }, 'gross')).toBe(0);
  // 소수 좌표: 길이 4000 x 두께 200 = 0.8 m²
  expect(totalArea({ rooms: [{ area: 1.5 }], walls: [{ a: [0.5, 0.25], b: [4000.5, 0.25], thickness: 200 }] }, 'gross')).toBeCloseTo(1.5 + 0.8, 3);
});

test('setWallLength moves b along the wall direction and keeps the room', () => {
  const s = createStore(createEmptyProject());
  addWalls(s, [makeWall({ a: [0.5, 0.25], b: [4000.5, 0.25] })]); // 소수 좌표, 동쪽 방향
  const w = activeFloor(s.get()).walls[0];
  setWallLength(s, w.id, 2500);
  const moved = activeFloor(s.get()).walls.find(x => x.id === w.id);
  expect(moved.b[0]).toBeCloseTo(2500.5, 6);
  expect(moved.b[1]).toBeCloseTo(0.25, 6);
  setWallLength(s, w.id, 0); // 0 이하는 무시
  expect(activeFloor(s.get()).walls.find(x => x.id === w.id).b[0]).toBeCloseTo(2500.5, 6);
});

test('setRoomWallHeight applies one height to every wall of that room only', () => {
  const s = setup();
  addWalls(s, rectWalls([9000, 0], [11000, 2000], 200)); // 떨어진 두 번째 방
  const f = activeFloor(s.get());
  const room = f.rooms.find(r => r.points.some(p => p[0] === 0));
  setRoomWallHeight(s, room.id, 2800);
  const g = activeFloor(s.get());
  for (const w of g.walls) expect(w.height).toBe(room.wallIds.includes(w.id) ? 2800 : 2300);
});

test('deleting a floor before the active one keeps the same floor active', () => {
  const s = setup();
  addFloor(s, { name: 'F1', copy: 'none' });
  addFloor(s, { name: 'F2', copy: 'none' });
  setActiveFloor(s, 1); // F1 활성
  deleteFloor(s, 0);    // 앞의 Floor 1 삭제
  expect(s.get().floors.map(f => f.name)).toEqual(['F1', 'F2']);
  expect(s.get().floors[s.get().activeFloor].name).toBe('F1');
  deleteFloor(s, 1);    // 뒤의 F2 삭제 → 활성 인덱스 그대로
  expect(s.get().floors[s.get().activeFloor].name).toBe('F1');
  s.undo(); s.undo();
  expect(s.get().floors).toHaveLength(3);
  expect(s.get().floors[s.get().activeFloor].name).toBe('F1');
});

test('pruneSelection keeps live ids, drops dead ones and returns the same object when unchanged', () => {
  const s = setup();
  const f = activeFloor(s.get());
  const ids = f.walls.map(w => w.id);
  const sel = { type: 'multi', kind: 'wall', ids };
  expect(pruneSelection(s.get(), sel)).toBe(sel);
  const mixed = { type: 'multi', kind: 'wall', ids: [ids[0], 'gone'] };
  expect(pruneSelection(s.get(), mixed)).toEqual({ type: 'multi', kind: 'wall', ids: [ids[0]] });
  expect(pruneSelection(s.get(), { type: 'multi', kind: 'wall', ids: ['gone'] })).toBeNull();
  expect(pruneSelection(s.get(), null)).toBeNull();
  expect(selectionStillValid(s.get(), { type: 'multi', kind: 'wall', ids: [ids[0], 'gone'] })).toBe(true);
  expect(selectionStillValid(s.get(), { type: 'multi', kind: 'wall', ids: ['gone'] })).toBe(false);
});

test('deleteWalls removes several walls in one undo step', () => {
  const s = setup();
  const ids = activeFloor(s.get()).walls.slice(0, 2).map(w => w.id);
  deleteWalls(s, ids);
  expect(activeFloor(s.get()).walls).toHaveLength(2);
  s.undo();
  expect(activeFloor(s.get()).walls).toHaveLength(4);
});

test('duplicateRoom copies the room one width to the east and keeps its properties', () => {
  const s = createStore(createEmptyProject());
  addWalls(s, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200)); // 소수 좌표
  const r = activeFloor(s.get()).rooms[0];
  updateRoom(s, r.id, { name: '가열조리실', type: 'cook', seats: 12, height: 2800 });
  duplicateRoom(s, r.id);
  const f = activeFloor(s.get());
  expect(f.rooms).toHaveLength(2);
  const copy = f.rooms.find(x => x.id !== r.id);
  expect(copy.name).toBe('가열조리실');
  expect(copy.type).toBe('cook');
  expect(copy.seats).toBe(12);
  expect(copy.height).toBe(2800);
  expect(Math.min(...copy.points.map(p => p[0]))).toBe(4001); // detectRooms가 노드를 정수로 반올림한다(4000.5 → 4001)
  expect(copy.area).toBeCloseTo(r.area, 6);
  s.undo();
  expect(activeFloor(s.get()).rooms).toHaveLength(1);
});

test('pruneSolo drops a solo room that no longer exists', () => {
  const s = createStore(createEmptyProject());
  addWalls(s, rectWalls([0, 0], [4000, 3000], 200));
  const room = activeFloor(s.get()).rooms[0];
  expect(pruneSolo(s.get(), room.id)).toBe(room.id);
  expect(pruneSolo(s.get(), null)).toBeNull();
  deleteRoom(s, room.id);
  expect(pruneSolo(s.get(), room.id)).toBeNull();
});

test('addFloor picks the smallest unused default name', () => {
  const s = createStore(createEmptyProject());
  addFloor(s, { copy: 'none' });                 // Floor 1 이 있으므로 Floor 2
  expect(s.get().floors.map(f => f.name)).toEqual(['Floor 1', 'Floor 2']);
  renameFloor(s, 1, 'Floor 3');
  addFloor(s, { copy: 'none' });                 // Floor 3 은 이미 쓰였다 → Floor 2
  expect(s.get().floors.map(f => f.name)).toEqual(['Floor 1', 'Floor 3', 'Floor 2']);
  addFloor(s, { copy: 'none' });
  expect(s.get().floors.map(f => f.name)).toEqual(['Floor 1', 'Floor 3', 'Floor 2', 'Floor 4']);
  deleteFloor(s, 0);
  addFloor(s, { copy: 'none' });                 // 앞의 Floor 1 이 비었으므로 다시 Floor 1
  expect(s.get().floors.map(f => f.name)).toEqual(['Floor 3', 'Floor 2', 'Floor 4', 'Floor 1']);
});

test('an item selection survives pruning while a stale item id does not', () => {
  const s = createStore(createEmptyProject());
  s.dispatch(d => { activeFloor(d).items.push({ id: 'i1', type: 'sink' }); }, { record: false });
  const sel = { type: 'item', id: 'i1' };
  expect(selectionStillValid(s.get(), sel)).toBe(true);
  expect(pruneSelection(s.get(), sel)).toBe(sel);
  const gone = { type: 'item', id: 'i9' };
  expect(selectionStillValid(s.get(), gone)).toBe(false);
  expect(pruneSelection(s.get(), gone)).toBeNull();
});

test('every floor op forwards opts to the dispatch, so a transaction stays one undo step', () => {
  const s = createStore(createEmptyProject());
  addWalls(s, rectWalls([0, 0], [4000, 3000], 200));
  const wall = activeFloor(s.get()).walls[0], room = activeFloor(s.get()).rooms[0];
  const steps = () => { let n = 0; while (s.canUndo()) { s.undo(); n++; } return n; };
  s.beginTransaction();
  setWallLength(s, wall.id, 3000, { record: false });
  updateWallProps(s, wall.id, { colorOut: '#123456' }, { record: false });
  addMeasure(s, { a: [0, 0], b: [1000, 0] }, { record: false });
  deleteMeasure(s, activeFloor(s.get()).measures[0].id, { record: false });
  duplicateRoom(s, room.id, { record: false });
  addFloor(s, { copy: 'none' }, { record: false });
  renameFloor(s, 1, '2층', { record: false });
  updateFloor(s, 1, { slab: 120 }, { record: false });
  deleteFloor(s, 1, { record: false });
  deleteWalls(s, [wall.id], { record: false });
  s.endTransaction();
  expect(s.get().floors).toHaveLength(1);
  expect(steps()).toBe(2); // 트랜잭션 한 단계 + setup의 addWalls 한 단계
  expect(activeFloor(s.get()).walls).toHaveLength(0);
});

test('층 관리 export는 floorMgmt에 모이고 floorOps가 같은 것을 다시 내보낸다', async () => {
  const mgmt = await import('../src/state/floorMgmt.js');
  const ops = await import('../src/state/floorOps.js');
  const internal = await import('../src/state/floorInternal.js');
  for (const name of ['addFloor', 'setActiveFloor', 'renameFloor', 'updateFloor', 'deleteFloor', 'totalArea', 'copyRoomProps', 'defaultFloorName']) {
    expect(typeof mgmt[name], name).toBe('function');
    expect(ops[name], name).toBe(mgmt[name]);
  }
  // ROOM_PROPS·copyRoomProps의 정본은 floorInternal.js다: floorMgmt는 재내보내기만 한다(정의가 두 벌이면 안 된다).
  expect(mgmt.ROOM_PROPS).toBe(internal.ROOM_PROPS);
  expect(mgmt.copyRoomProps).toBe(internal.copyRoomProps);
  expect(ops.ROOM_PROPS).toBe(internal.ROOM_PROPS);
  expect(mgmt.ROOM_PROPS).toContain('floorMat');       // Task 2가 더한 두 키
  expect(mgmt.ROOM_PROPS).toContain('ceilingMat');
  expect(mgmt.defaultFloorName([{ name: 'Floor 1' }, { name: 'Floor 3' }])).toBe('Floor 2');
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  ops.addFloor(store, { copy: 'all' });
  expect(store.get().floors).toHaveLength(2);
  expect(ops.totalArea(activeFloor(store.get()), 'net')).toBeCloseTo(activeFloor(store.get()).rooms[0].area, 6);
});

// §15.6(감사 §28): 벽을 지우면 붙어 있던 문·창·벽 제품이 wallId 없이 허공에 남았다.
test('deleteWalls는 그 벽에 붙은 아이템을 같은 단계에서 함께 지우고 개수를 돌려준다', () => {
  const s = setup();
  addWalls(s, [makeWall({ a: [0, 3000], b: [1732.0508, 4000], thickness: 200, height: 2300 })]); // 30° 벽
  const f = activeFloor(s.get());
  const top = f.walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  const slant = f.walls.find(w => Math.abs(w.a[1] - w.b[1]) > 100 && Math.abs(w.a[0] - w.b[0]) > 100);
  const door = addItem(s, createItem(productById('door-swing-900'), { wallId: top.id, t: 0.5, pos: [2000.5, 0.25] }));
  const cap = addItem(s, createItem(productById('ventcap-150'), { wallId: slant.id, t: 0.5 }));
  const sofa = addItem(s, createItem(productById('sofa-3'), { pos: [2000, 1500] }));
  const before = activeFloor(s.get()).rooms.length;
  const r = deleteWalls(s, [top.id, slant.id]);
  expect(r).toEqual({ walls: 2, items: 2, rooms: before - activeFloor(s.get()).rooms.length });
  const items = activeFloor(s.get()).items.map(i => i.id);
  expect(items).toEqual([sofa]);                   // 바닥 제품은 그대로 남는다
  expect(items).not.toContain(door);
  expect(items).not.toContain(cap);
  s.undo();                                        // 벽·아이템·방이 한 단계로 되돌아온다
  expect(activeFloor(s.get()).items.map(i => i.id).sort()).toEqual([door, cap, sofa].sort());
  expect(activeFloor(s.get()).walls).toHaveLength(5);
});

test('없는 벽을 지우면 아무 단계도 만들지 않는다', () => {
  const s = setup();
  const steps = [];
  const off = s.subscribe(() => steps.push(1));
  expect(deleteWalls(s, ['없는id'])).toEqual({ walls: 0, items: 0, rooms: 0 });
  expect(steps).toEqual([]);
  off();
});

// §15.6(감사 §28) — 벽 삭제와 같은 규칙이 방 삭제에도 적용된다: 그 방만 쓰는 벽에 붙어 있던
// 문·창·벽 제품이 wallId 없이 허공에 남으면 안 된다.
test('deleteRoom은 지우는 벽에 붙은 제품도 같은 단계에서 지우고 개수를 돌려준다', () => {
  const s = setup();
  addWalls(s, [makeWall({ a: [0, 3000], b: [1732.0508, 4000], thickness: 200, height: 2300 })]); // 방에 속하지 않는 30° 벽
  const f0 = activeFloor(s.get());
  const room = f0.rooms[0];
  const top = f0.walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  const slant = f0.walls.find(w => !room.wallIds.includes(w.id));
  const door = addItem(s, createItem(productById('door-swing-900'), { wallId: top.id, t: 0.37, pos: [1480.5, 0.25] }));
  const cap = addItem(s, createItem(productById('ventcap-150'), { wallId: slant.id, t: 0.5 }));
  const sofa = addItem(s, createItem(productById('sofa-3'), { pos: [2000, 1500] }));

  const r = deleteRoom(s, room.id);
  expect(r).toEqual({ walls: 4, items: 1, rooms: 1 });
  const f = activeFloor(s.get());
  expect(f.walls.map(w => w.id)).toEqual([slant.id]);   // 방의 벽 4개만 사라졌다
  expect(f.items.map(i => i.id).sort()).toEqual([cap, sofa].sort());
  expect(f.items.some(i => i.wallId === null && i.attach === 'wall')).toBe(false); // 허공에 남은 제품이 없다

  s.undo();                                             // 벽·제품·방이 한 단계로 돌아온다
  const u = activeFloor(s.get());
  expect(u.walls).toHaveLength(5);
  expect(u.rooms).toHaveLength(1);
  expect(u.items.map(i => i.id).sort()).toEqual([door, cap, sofa].sort());
  const back = u.items.find(i => i.id === door);
  expect(back.wallId).toBe(top.id);
  expect(back.t).toBeCloseTo(0.37, 6);
});

test('deleteRoom은 이웃 방과 공유하는 벽과 그 벽에 붙은 제품을 건드리지 않는다', () => {
  const s = setup();
  addWalls(s, rectWalls([4000, 0], [7000, 3000], 200));
  const f0 = activeFloor(s.get());
  expect(f0.rooms).toHaveLength(2);
  const shared = f0.walls.find(w => f0.rooms.every(r => r.wallIds.includes(w.id)));
  expect(shared).toBeTruthy();
  const win = addItem(s, createItem(productById('window-slide-1200'), { wallId: shared.id, t: 0.42, pos: [4000, 1260.5] }));
  const left = activeFloor(s.get()).rooms.find(r => r.wallIds.includes(shared.id) && r.points.some(p => p[0] < 1000));

  const r = deleteRoom(s, left.id);
  const f = activeFloor(s.get());
  expect(f.walls.some(w => w.id === shared.id)).toBe(true);
  expect(r.items).toBe(0);
  const kept = f.items.find(i => i.id === win);
  expect(kept.wallId).toBe(shared.id);                  // 공유 벽의 제품은 그대로 붙어 있다
  expect(kept.t).toBeCloseTo(0.42, 6);
});

test('없는 방을 지우면 아무 단계도 만들지 않는다', () => {
  const s = setup();
  const steps = [];
  const off = s.subscribe(() => steps.push(1));
  expect(deleteRoom(s, '없는id')).toEqual({ walls: 0, items: 0, rooms: 0 });
  expect(steps).toEqual([]);
  off();
});

// §17.7(감사 §53): **데려갈 층**의 기준은 "도착한 층"이 아니라 내용이 달라진 층이다.
// 부를 이름은 거기에 한 갈래가 더 있다 — 리뷰 I-1의 프로젝트 수준 단계(아래).
test('crossFloorName은 달라진 층을 부르고, 달라진 층이 없으면 도착한 층을 부른다', () => {
  const store = createStore(createEmptyProject());
  addFloor(store, { name: 'Floor 2', copy: 'none' });
  const onTwo = store.get();
  setActiveFloor(store, 0);
  const onOne = store.get();
  expect(changedFloorIndex(onOne, onTwo)).toBeNull();       // 층 전환만으로는 달라진 층이 없다
  expect(crossFloorName(onTwo, onTwo)).toBeNull();          // 같은 스냅숏: 화면도 그대로다
  expect(crossFloorName(undefined, onOne)).toBeNull();
  // 리뷰 I-1: 층 내용을 하나도 바꾸지 않으면서 **기록되는** 단계가 실제로 있다(프로젝트 이름 변경 ·
  // 배경 도면 삽입·제거). 그 단계의 되돌리기·다시 실행도 스냅숏의 activeFloor로 화면을 옮기는데,
  // 부를 "변경 층"이 없다고 토스트까지 사라지면 §16.4의 보증("화면이 말없이 다른 층으로 넘어갔다")이
  // 이 경로에서만 되살아난다. 그래서 옛 규칙(도착한 층)으로 돌아간다 — 되돌리기·다시 실행 양쪽 다.
  expect(crossFloorName(onOne, { ...onTwo, background: { src: 'x' } })).toBe('Floor 2');
  expect(crossFloorName({ ...onTwo, background: { src: 'x' } }, onOne)).toBe('Floor 1');
  expect(changedFloorIndex(onOne, { ...onTwo, name: '다른 이름' })).toBeNull();  // 그래도 데려갈 층은 없다
  // 판정은 activeFloor만 본다(무엇이 달라졌는지는 묻지 않는다): 순수한 층 전환은 { record: false }라
  // 애초에 되돌리기 짝을 만들지 않으므로, 이 한 갈래로 두 경우를 가르려 애쓰지 않는다.
  expect(crossFloorName(onOne, onTwo)).toBe('Floor 2');
});

// §17.7: 되돌리기(도착 층이 곧 변경 층)와 다시 실행(도착 층이 어긋난다)이 같은 판정 하나를 쓴다.
// 사용자가 보던 층도, 도착할 층도 변경 층이면 "같은 층 안의 변경"이라 null이다.
test('changedFloorIndex는 내용이 달라진 층을 찾고 같은 층 안의 변경은 null이다', () => {
  const store = createStore(createEmptyProject());
  addFloor(store, { name: '2층', copy: 'none' });            // 활성 층 = 1
  const id = addItem(store, createItem(productById('hood-box'), { pos: [1000.5, 2000.25] }));
  const before = store.get();
  updateItem(store, id, { pos: [1111, 2222] });
  const after = store.get();
  expect(changedFloorIndex(before, after)).toBeNull();       // 둘 다 2층에서 본 변경이다
  const onOne = { ...after, activeFloor: 0 };
  expect(changedFloorIndex(onOne, before)).toBe(1);          // 1층에서 누른 Ctrl+Z
  expect(crossFloorName(onOne, before)).toBe('2층');
  const redoTarget = { ...after, activeFloor: 0 };           // 다시 실행의 스냅숏은 "되돌리기를 누른 순간"의 층을 들고 있다
  expect(changedFloorIndex(before, redoTarget)).toBe(1);
  expect(crossFloorName(before, redoTarget)).toBe('2층');
});

// 리뷰 I-1: addFloor·deleteFloor는 **자기 자신이** 활성 층을 옮기는 기록된 단계다. 그 단계의
// undo/redo는 "다른 층에 살던 변경"이 아니라 "층을 더하거나 지운 일"이므로 토스트가 뜨면 오탐이다.
test('층을 더하거나 지운 단계의 undo/redo는 층 간 변경으로 세지 않는다', () => {
  const store = createStore(createEmptyProject());
  addFloor(store, { name: 'Floor 2', copy: 'none' });
  const added = store.get();                                  // 2개 층, activeFloor 1
  store.undo();
  const undone = store.get();                                 // 1개 층, activeFloor 0
  expect(undone.activeFloor).toBe(0);                         // 인덱스는 실제로 갈아탔다
  expect(crossFloorName(added, undone)).toBeNull();           // 그래도 층 간 undo는 아니다
  store.redo();
  expect(crossFloorName(undone, store.get())).toBeNull();     // 다시 실행도 마찬가지다

  // 삭제 쪽도 같다: 앞 층을 지우면 활성 층 인덱스가 당겨진다.
  deleteFloor(store, 0);
  const deleted = store.get();
  store.undo();
  expect(crossFloorName(deleted, store.get())).toBeNull();
});

// 전역 제약: 사용자 동작 하나 = undo 한 단계이고, **빈 단계는 만들지 않는다**(최종 리뷰 I-3).
// 겹치는 벽은 addWalls가 이미 버리고 있었지만 dispatch는 무조건 돌아 상태만 갈리고 단계가 남았다.
test('addWalls: 더할 벽이 하나도 없으면 dispatch하지 않는다(리뷰 I-3a)', () => {
  const s = setup();
  const walls = rectWalls([0, 0], [4000, 3000], 200);
  const before = s.get(), undoable = s.canUndo();
  addWalls(s, walls);                                  // 같은 사각형을 두 번
  expect(s.get()).toBe(before);                        // 상태가 교체되지 않았다
  expect(s.canUndo()).toBe(undoable);
  expect(activeFloor(s.get()).walls).toHaveLength(4);
  addWalls(s, []);
  expect(s.get()).toBe(before);
  // 일부만 겹치면 남은 것만 더한다(예전과 같다).
  addWalls(s, [walls[0], makeWall({ a: [0, 3000], b: [0, 6000], thickness: 200 })]);
  expect(activeFloor(s.get()).walls).toHaveLength(5);
});

test('renameFloor: 같은 이름으로 바꾸면 dispatch하지 않는다(리뷰 I-3b)', () => {
  const s = setup();
  addFloor(s, { name: '옥상', copy: 'none' });
  const before = s.get(), undoable = s.canUndo();
  renameFloor(s, 1, '옥상');                            // 대화상자가 미리 채워 준 이름 그대로 [변경]
  expect(s.get()).toBe(before);
  expect(s.canUndo()).toBe(undoable);
  renameFloor(s, 1, '  옥상  ');                        // 공백만 다른 것도 같은 이름이다
  expect(s.get()).toBe(before);
  renameFloor(s, 1, '');                                // 빈 이름은 예전처럼 무시한다
  expect(s.get()).toBe(before);
  renameFloor(s, 1, '3층');
  expect(s.get()).not.toBe(before);
  expect(s.get().floors[1].name).toBe('3층');
});
