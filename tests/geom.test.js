import { describe, test, expect } from 'vitest';
import { add, sub, len, perp, eq } from '../src/geom/vec.js';
import { makeWall, rectWalls, wallPolygon, splitWall, moveWallParallel, moveVertex, hitWall, transformWalls, endpoints } from '../src/geom/walls.js';
import { detectRooms, polygonArea, pointInPolygon, offsetPolygon, centroid } from '../src/geom/rooms.js';

describe('vec', () => {
  test('basics', () => {
    expect(add([1, 2], [3, 4])).toEqual([4, 6]);
    expect(sub([3, 4], [1, 2])).toEqual([2, 2]);
    expect(len([3, 4])).toBe(5);
    expect(perp([1, 0])).toEqual([-0, 1]);
    expect(eq([0, 0], [0.5, 0.5])).toBe(true);
  });
});

describe('walls', () => {
  test('rectWalls makes 4 connected walls', () => {
    const ws = rectWalls([0, 0], [4000, 3000], 200);
    expect(ws).toHaveLength(4);
    expect(endpoints(ws)).toHaveLength(4);
    expect(ws.every(w => w.thickness === 200)).toBe(true);
  });
  test('wallPolygon is offset by half thickness and extended at joints', () => {
    const ws = rectWalls([0, 0], [4000, 3000], 200);
    const top = ws.find(w => w.a[1] === 0 && w.b[1] === 0);
    const poly = wallPolygon(top, ws);
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(-100);
    expect(Math.max(...xs)).toBeCloseTo(4100);
    expect(Math.min(...ys)).toBeCloseTo(-100);
    expect(Math.max(...ys)).toBeCloseTo(100);
  });
  test('splitWall replaces one wall with two sharing the split point', () => {
    const w = makeWall({ a: [0, 0], b: [4000, 0] });
    const out = splitWall([w], w.id, [1000, 5]);
    expect(out).toHaveLength(2);
    expect(out[0].b).toEqual([1000, 0]);
    expect(out[1].a).toEqual([1000, 0]);
  });
  test('moveWallParallel keeps neighbours connected', () => {
    const ws = rectWalls([0, 0], [4000, 3000], 200);
    const top = ws.find(w => w.a[1] === 0 && w.b[1] === 0);
    const out = moveWallParallel(ws, top.id, [0, -500]);
    const moved = out.find(w => w.id === top.id);
    expect(moved.a[1]).toBe(-500);
    expect(endpoints(out)).toHaveLength(4);
    const left = out.find(w => w.id !== top.id && (w.a[0] === 0 && w.b[0] === 0));
    expect(Math.min(left.a[1], left.b[1])).toBe(-500);
  });
  test('moveVertex moves every endpoint at that point', () => {
    const ws = rectWalls([0, 0], [4000, 3000], 200);
    const out = moveVertex(ws, [0, 0], [-200, -300]);
    expect(out.filter(w => eq(w.a, [-200, -300]) || eq(w.b, [-200, -300]))).toHaveLength(2);
  });
  test('hitWall uses half thickness plus tolerance', () => {
    const w = makeWall({ a: [0, 0], b: [4000, 0], thickness: 200 });
    expect(hitWall([w], [2000, 90], 20)).toBe(w);
    expect(hitWall([w], [2000, 130], 20)).toBeNull();
  });
  test('transformWalls flips', () => {
    const ws = rectWalls([0, 0], [4000, 3000], 200);
    const out = transformWalls(ws, p => [-p[0], p[1]]);
    expect(Math.min(...endpoints(out).map(p => p[0]))).toBe(-4000);
  });
});

describe('rooms', () => {
  test('polygonArea and pointInPolygon', () => {
    const sq = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]];
    expect(Math.abs(polygonArea(sq))).toBe(12_000_000);
    expect(pointInPolygon([100, 100], sq)).toBe(true);
    expect(pointInPolygon([-1, 100], sq)).toBe(false);
    expect(centroid(sq)).toEqual([2000, 1500]);
  });
  test('offsetPolygon insets each edge', () => {
    const sq = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]];
    const inner = offsetPolygon(sq, [100, 100, 100, 100]);
    expect(Math.abs(polygonArea(inner))).toBeCloseTo(3800 * 2800);
  });
  test('detectRooms finds one room for a rectangle, none for an open chain', () => {
    const ws = rectWalls([0, 0], [4000, 3000], 200);
    const rooms = detectRooms(ws);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].wallIds).toHaveLength(4);
    expect(rooms[0].area).toBeCloseTo(3.8 * 2.8, 2);
    expect(detectRooms(ws.slice(0, 3))).toHaveLength(0);
  });
  test('detectRooms finds two rooms sharing a wall', () => {
    const a = rectWalls([0, 0], [4000, 3000], 200);
    const b = rectWalls([4000, 0], [7000, 3000], 200);
    // remove duplicate shared wall from b (same segment as a's right wall)
    const shared = b.find(w => w.a[0] === 4000 && w.b[0] === 4000);
    const ws = [...a, ...b.filter(w => w !== shared)];
    const rooms = detectRooms(ws);
    expect(rooms).toHaveLength(2);
  });
  test('detectRooms keeps user props by centroid', () => {
    const ws = rectWalls([0, 0], [4000, 3000], 200);
    const first = detectRooms(ws);
    first[0].name = '가열조리실';
    const again = detectRooms(moveWallParallel(ws, ws[0].id, [0, -100]), first);
    expect(again[0].name).toBe('가열조리실');
    expect(again[0].id).toBe(first[0].id);
  });
});
