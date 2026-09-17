import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { rectWalls } from '../src/geom/walls.js';
import { addWalls, deleteWall, deleteRoom, updateRoom, setRoomWallThickness, transformFloor } from '../src/state/floorOps.js';

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
test('transformFloor flips walls and rerooms', () => {
  const s = setup();
  transformFloor(s, p => [-p[0], p[1]]);
  const f = activeFloor(s.get());
  expect(f.rooms).toHaveLength(1);
  expect(Math.min(...f.walls.map(w => w.a[0]))).toBe(-4000);
});
