import { test, expect } from 'vitest';
import { rectWalls } from '../src/geom/walls.js';
import { detectRooms } from '../src/geom/rooms.js';
import { hiddenWallIds } from '../src/view3d/cutaway.js';

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
