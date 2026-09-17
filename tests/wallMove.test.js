import { describe, test, expect } from 'vitest';
import { makeWall, rectWalls, moveWallParallel, translateNodes } from '../src/geom/walls.js';
import { normalizeWalls } from '../src/geom/normalize.js';
import { detectRooms } from '../src/geom/rooms.js';

const axisAligned = w => Math.abs(w.a[0] - w.b[0]) < 1 || Math.abs(w.a[1] - w.b[1]) < 1;
const closeTo = (x, y, tol = 1) => Math.abs(x - y) <= tol;
const sameSeg = (w, a, b, tol) =>
  (closeTo(w.a[0], a[0], tol) && closeTo(w.a[1], a[1], tol) && closeTo(w.b[0], b[0], tol) && closeTo(w.b[1], b[1], tol)) ||
  (closeTo(w.a[0], b[0], tol) && closeTo(w.a[1], b[1], tol) && closeTo(w.b[0], a[0], tol) && closeTo(w.b[1], a[1], tol));
const has = (walls, a, b, tol = 1) => walls.some(w => sameSeg(w, a, b, tol));
const findWall = (walls, a, b, tol = 1) => walls.find(w => sameSeg(w, a, b, tol));

describe('moveWallParallel: jog connectors instead of tilted neighbours', () => {
  test('moving a wall does not tilt a collinear neighbour wall in the next room', () => {
    const a = rectWalls([0, 0], [4000, 3000]);
    const b = rectWalls([4000, 0], [5500, 2000]);
    const before = normalizeWalls([...a, ...b]);
    const beforeJSON = JSON.stringify(before);
    const top = findWall(before, [0, 0], [4000, 0]);
    expect(top).toBeTruthy();

    const out = normalizeWalls(moveWallParallel(before, top.id, [0, -400]));

    expect(JSON.stringify(before)).toBe(beforeJSON); // input untouched
    expect(out.every(axisAligned)).toBe(true);
    expect(has(out, [4000, 0], [5500, 0])).toBe(true); // B's top wall stays put
    expect(has(out, [4000, -400], [4000, 0])).toBe(true); // jog connector appears

    const rooms = detectRooms(out);
    expect(rooms).toHaveLength(2);
    const roomA = rooms.find(r => r.points.some(p => p[0] < 1000));
    expect(roomA.area).toBeCloseTo(3.8 * 3.2, 2);
  });

  test('moving a shared vertical piece does not tilt the wall segment below it', () => {
    const a = rectWalls([0, 0], [4000, 3000]);
    const b = rectWalls([4000, 0], [5500, 2000]);
    const before = normalizeWalls([...a, ...b]);
    const seg = findWall(before, [4000, 0], [4000, 2000]);
    expect(seg).toBeTruthy();

    const out = normalizeWalls(moveWallParallel(before, seg.id, [300, 0]));

    expect(out.every(axisAligned)).toBe(true);
    expect(has(out, [4000, 2000], [4000, 3000])).toBe(true); // piece below stays put
    expect(has(out, [4300, 0], [4300, 2000])).toBe(true); // jog connector appears
    expect(detectRooms(out)).toHaveLength(2);
  });

  test('a wall with no neighbours only keeps the normal component of the move', () => {
    const w = makeWall({ a: [0, 0], b: [4000, 0] });
    const out = moveWallParallel([w], w.id, [300, -400]);
    expect(out).toHaveLength(1);
    expect(out[0].a).toEqual([0, -400]);
    expect(out[0].b).toEqual([4000, -400]);
  });

  test('zero normal-component move leaves wall count and coordinates unchanged', () => {
    const w = makeWall({ a: [0, 0], b: [4000, 0] });
    const out = moveWallParallel([w], w.id, [500, 0]);
    expect(out).toHaveLength(1);
    expect(out[0].a).toEqual([0, 0]);
    expect(out[0].b).toEqual([4000, 0]);
  });
});

describe('translateNodes', () => {
  test('moving a set of nodes does not tilt outside walls attached at only one endpoint', () => {
    const a = rectWalls([0, 0], [4000, 3000]);
    const b = rectWalls([4000, 0], [5500, 2000]);
    const before = normalizeWalls([...a, ...b]);
    const beforeJSON = JSON.stringify(before);

    const out = normalizeWalls(translateNodes(before, p => p[0] <= 4000, [0, -500]));

    expect(JSON.stringify(before)).toBe(beforeJSON); // input untouched
    expect(out.every(axisAligned)).toBe(true);
    expect(has(out, [4000, 0], [5500, 0])).toBe(true); // B's top wall unaffected
    expect(has(out, [4000, 2000], [5500, 2000])).toBe(true); // B's bottom wall unaffected
    expect(detectRooms(out)).toHaveLength(2);
  });

  test('an outside wall parallel to delta stretches instead of getting a connector', () => {
    const a = rectWalls([0, 0], [4000, 3000]);
    const outer = makeWall({ a: [4000, 1000], b: [6000, 1000] });
    const walls = [...a, outer];

    const out = translateNodes(walls, p => p[0] === 4000 && p[1] === 1000, [300, 0]);

    expect(out).toHaveLength(walls.length); // no connector added
    const moved = out.find(w => w.id === outer.id);
    expect(moved.a).toEqual([4300, 1000]);
    expect(moved.b).toEqual([6000, 1000]);
  });
});
