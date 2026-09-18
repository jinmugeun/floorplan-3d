import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { placeOnWall } from '../src/geom/items.js';
import { openingsOnWall } from '../src/geom/openings.js';
import { productById } from '../src/products/catalog.js';
import { rectWalls, moveWallParallel, makeWall } from '../src/geom/walls.js';
import { addWalls, addItem, deleteWall, deleteRoom, updateRoom, setRoomWallThickness, transformFloor, setWalls, selectionStillValid, addMeasure, addFloor, setActiveFloor, renameFloor, deleteFloor, updateFloor, totalArea, setWallLength, setRoomWallHeight, pruneSelection, deleteWalls, duplicateRoom, pruneSolo, updateWallProps, deleteMeasure } from '../src/state/floorOps.js';

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
