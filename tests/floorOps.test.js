import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { rectWalls, moveWallParallel, makeWall } from '../src/geom/walls.js';
import { addWalls, deleteWall, deleteRoom, updateRoom, setRoomWallThickness, transformFloor, setWalls, selectionStillValid } from '../src/state/floorOps.js';

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
