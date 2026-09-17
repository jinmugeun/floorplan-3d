import { describe, test, expect } from 'vitest';
import { normalizeWalls } from '../src/geom/normalize.js';
import { makeWall, rectWalls, endpoints } from '../src/geom/walls.js';
import { detectRooms } from '../src/geom/rooms.js';
import { eq } from '../src/geom/vec.js';

const seg = (a, b) => makeWall({ a, b });
const has = (ws, a, b) => ws.some(w => (eq(w.a, a) && eq(w.b, b)) || (eq(w.a, b) && eq(w.b, a)));

describe('normalizeWalls', () => {
  test('T-junction splits the wall that is touched', () => {
    const base = seg([0, 0], [4000, 0]);
    const t = seg([2000, 3000], [2000, 0]);
    const out = normalizeWalls([base, t]);
    expect(out).toHaveLength(3);
    expect(has(out, [0, 0], [2000, 0])).toBe(true);
    expect(has(out, [2000, 0], [4000, 0])).toBe(true);
    expect(out.find(w => eq(w.a, [0, 0]) || eq(w.b, [0, 0])).id).toBe(base.id); // 첫 조각이 id 유지
    expect(out.find(w => w.id === t.id)).toBeTruthy();
  });

  test('crossing walls are split at the intersection', () => {
    const h = seg([0, 0], [4000, 0]);
    const v = seg([2000, -1000], [2000, 1000]);
    const out = normalizeWalls([h, v]);
    expect(out).toHaveLength(4);
    expect(endpoints(out)).toHaveLength(5);
  });

  test('collinear overlapping walls become shared pieces without duplicates', () => {
    const a = seg([0, 0], [0, 4000]);
    const b = seg([0, 0], [0, 2000]);
    const out = normalizeWalls([a, b]);
    expect(out).toHaveLength(2);
    expect(has(out, [0, 0], [0, 2000])).toBe(true);
    expect(has(out, [0, 2000], [0, 4000])).toBe(true);
  });

  test('a contained collinear wall sharing an endpoint keeps both ids', () => {
    const a = seg([0, 0], [0, 5000]);
    const b = seg([0, 0], [0, 2000]);
    const out = normalizeWalls([a, b]);
    expect(out).toHaveLength(2);
    expect(has(out, [0, 0], [0, 2000])).toBe(true);
    expect(has(out, [0, 2000], [0, 5000])).toBe(true);
    expect(out.map(w => w.id).sort()).toEqual([a.id, b.id].sort());
  });

  test('a contained collinear wall strictly inside keeps both ids', () => {
    const a = seg([0, 0], [0, 5000]);
    const b = seg([0, 1000], [0, 2000]);
    const out = normalizeWalls([a, b]);
    expect(out).toHaveLength(3);
    expect(has(out, [0, 0], [0, 1000])).toBe(true);
    expect(has(out, [0, 1000], [0, 2000])).toBe(true);
    expect(has(out, [0, 2000], [0, 5000])).toBe(true);
    const ids = out.map(w => w.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  test('three walls meeting at interior points of a fourth wall split it into three pieces', () => {
    const base = seg([0, 0], [6000, 0]);
    const v1 = seg([2000, -1000], [2000, 0]); // T from below at x=2000
    const v2 = seg([4000, -1000], [4000, 0]); // T from below at x=4000
    const v3 = seg([2000, 0], [2000, 1000]); // T from above at x=2000
    const out = normalizeWalls([base, v1, v2, v3]);
    expect(out).toHaveLength(6);
    expect(has(out, [0, 0], [2000, 0])).toBe(true);
    expect(has(out, [2000, 0], [4000, 0])).toBe(true);
    expect(has(out, [4000, 0], [6000, 0])).toBe(true);
    expect(has(out, [2000, -1000], [2000, 0])).toBe(true);
    expect(has(out, [4000, -1000], [4000, 0])).toBe(true);
    expect(has(out, [2000, 0], [2000, 1000])).toBe(true);
    const twice = normalizeWalls(out);
    expect(twice.map(w => w.id).sort()).toEqual(out.map(w => w.id).sort());
  });

  test('walls that only touch at endpoints or do not meet are left alone', () => {
    const ws = rectWalls([0, 0], [4000, 3000], 200);
    const far = seg([9000, 9000], [9000, 12000]);
    const out = normalizeWalls([...ws, far]);
    expect(out).toHaveLength(5);
    expect(out.map(w => w.id).sort()).toEqual([...ws, far].map(w => w.id).sort());
  });

  test('two adjacent rooms of different depth share one wall piece and yield two rooms', () => {
    const a = rectWalls([0, 0], [4000, 4000], 200);
    const b = rectWalls([4000, 0], [7000, 2000], 200);
    const out = normalizeWalls([...a, ...b]);
    expect(out).toHaveLength(8);
    expect(has(out, [4000, 0], [4000, 2000])).toBe(true);
    expect(has(out, [4000, 2000], [4000, 4000])).toBe(true);
    const rooms = detectRooms(out);
    expect(rooms.map(r => +r.area.toFixed(2)).sort()).toEqual([3.8 * 3.8, 2.8 * 1.8].map(v => +v.toFixed(2)).sort());
  });

  test('a wall drawn across a room splits it into two rooms', () => {
    const room = rectWalls([0, 0], [4000, 3000], 200);
    const divider = seg([2000, 0], [2000, 3000]);
    const out = normalizeWalls([...room, divider]);
    expect(detectRooms(out)).toHaveLength(2);
  });

  test('overlapping rooms split into three faces', () => {
    const a = rectWalls([0, 0], [4000, 3000], 200);
    const b = rectWalls([3000, 2000], [6000, 5000], 200);
    const out = normalizeWalls([...a, ...b]);
    expect(detectRooms(out)).toHaveLength(3);
  });

  test('does not mutate its input and is idempotent', () => {
    const base = seg([0, 0], [4000, 0]), t = seg([2000, 3000], [2000, 0]);
    const input = [base, t]; const snapshot = JSON.stringify(input);
    const once = normalizeWalls(input);
    expect(JSON.stringify(input)).toBe(snapshot);
    const twice = normalizeWalls(once);
    expect(twice.map(w => w.id).sort()).toEqual(once.map(w => w.id).sort());
  });
});
