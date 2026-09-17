import { test, expect } from 'vitest';
import { rectWalls } from '../src/geom/walls.js';
import { detectRooms } from '../src/geom/rooms.js';
import { hiddenWallIds, wallOwners, isExteriorWall } from '../src/view3d/cutaway.js';

function floor() { const walls = rectWalls([0, 0], [4000, 3000], 200); return { walls, rooms: detectRooms(walls) }; }
const top = f => f.walls.find(w => w.a[1] === 0 && w.b[1] === 0).id;
const bottom = f => f.walls.find(w => w.a[1] === 3000 && w.b[1] === 3000).id;
const left = f => f.walls.find(w => w.a[0] === 0 && w.b[0] === 0).id;
const view = { cutaway: true };

test('camera south-west hides south and west walls', () => {
  const f = floor();
  const hid = hiddenWallIds(f, [-5000, 8000, 4000], 35, view);
  expect(hid.has(bottom(f))).toBe(true); expect(hid.has(left(f))).toBe(true); expect(hid.has(top(f))).toBe(false);
});
test('high elevation shows all walls', () => {
  const f = floor();
  expect(hiddenWallIds(f, [-5000, 8000, 40000], 75, view).size).toBe(0);
});
test('camera below floor shows all walls', () => {
  const f = floor();
  expect(hiddenWallIds(f, [-5000, 8000, -100], 35, view).size).toBe(0);
});
test('cutaway off shows all walls', () => {
  const f = floor();
  expect(hiddenWallIds(f, [-5000, 8000, 4000], 35, { cutaway: false }).size).toBe(0);
});
test('shared interior wall is never hidden', () => {
  const a = rectWalls([0, 0], [4000, 3000], 200), b = rectWalls([4000, 0], [7000, 3000], 200);
  const shared = b.find(w => w.a[0] === 4000 && w.b[0] === 4000);
  const walls = [...a, ...b.filter(w => w !== shared)];
  const f = { walls, rooms: detectRooms(walls) };
  const mid = a.find(w => w.a[0] === 4000 && w.b[0] === 4000).id;
  expect(hiddenWallIds(f, [9000, 9000, 3000], 35, view).has(mid)).toBe(false);
});

function twoRooms() { // 가운데 벽을 공유하는 방 2개, 소수 좌표
  const a = rectWalls([0.5, 0.25], [4000.5, 3000.25], 200);
  const b = rectWalls([4000.5, 0.25], [7000.5, 3000.25], 200);
  const dup = b.find(w => w.a[0] === 4000.5 && w.b[0] === 4000.5);
  const walls = [...a, ...b.filter(w => w !== dup)];
  return { walls, rooms: detectRooms(walls), shared: a.find(w => w.a[0] === 4000.5 && w.b[0] === 4000.5) };
}

test('interior walls are shared, exterior walls belong to one room at most', () => {
  const f = twoRooms();
  expect(wallOwners(f, f.shared)).toHaveLength(2);
  expect(isExteriorWall(f, f.shared)).toBe(false);
  const north = f.walls.find(w => w.a[1] === 0.25 && w.b[1] === 0.25 && w.a[0] === 0.5);
  expect(isExteriorWall(f, north)).toBe(true);
  const lone = { id: 'lone', a: [9000, 9000], b: [9000, 12000], thickness: 200, height: 2300 };
  expect(isExteriorWall({ walls: [lone], rooms: [] }, lone)).toBe(true);
});

test('outerWalls off hides every exterior wall even with cutaway off or a top-down camera', () => {
  const f = twoRooms();
  const hid = hiddenWallIds(f, [-5000, 8000, 4000], 85, { cutaway: false, v3: { outerWalls: false, innerWalls: true } });
  expect(hid.has(f.shared.id)).toBe(false);
  expect(hid.size).toBe(f.walls.length - 1);
});

test('innerWalls off hides only the shared wall', () => {
  const f = twoRooms();
  const hid = hiddenWallIds(f, [-5000, 8000, 4000], 85, { cutaway: false, v3: { outerWalls: true, innerWalls: false } });
  expect([...hid]).toEqual([f.shared.id]);
});

test('with both flags on, the cutaway rules are unchanged', () => {
  const f = twoRooms();
  const hid = hiddenWallIds(f, [-5000, 8000, 4000], 35, { cutaway: true, v3: { outerWalls: true, innerWalls: true } });
  expect(hid.has(f.shared.id)).toBe(false);
  expect(hid.size).toBeGreaterThan(0);
});
