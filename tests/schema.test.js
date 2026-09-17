import { describe, test, expect } from 'vitest';
import { migrate, normalizeProject, activeFloor, createEmptyProject, SCHEMA_VERSION } from '../src/state/schema.js';
import { rectWalls } from '../src/geom/walls.js';

describe('normalizeProject / migrate', () => {
  test('a bare { version: 1 } becomes a usable project with one floor', () => {
    const p = migrate({ version: 1 });
    expect(p.version).toBe(SCHEMA_VERSION);
    expect(typeof p.name).toBe('string'); expect(p.units).toBe('mm');
    expect(p.floors).toHaveLength(1); expect(p.activeFloor).toBe(0);
    const f = activeFloor(p);
    expect(f.walls).toEqual([]); expect(f.rooms).toEqual([]); expect(f.guides).toEqual([]);
    expect(f.height).toBe(2300);
    expect(p.view.cutaway).toBe(true); expect(p.camera.mode).toBe('2d');
    expect(p.background).toBeNull();
  });
  test('wall coordinates and sizes are coerced to numbers and clamped', () => {
    const p = migrate({ version: 1, floors: [{ id: 'f1', name: '1층', height: '99999', walls: [{ id: 'w1', a: ['0', '0'], b: ['4000', '0'], thickness: '5000', height: 'abc' }] }] });
    const f = activeFloor(p);
    expect(f.height).toBe(8000);
    expect(f.walls[0].a).toEqual([0, 0]); expect(f.walls[0].b).toEqual([4000, 0]);
    expect(f.walls[0].thickness).toBe(1000); expect(f.walls[0].height).toBe(2300);
  });
  test('rooms are recomputed so area is numeric, and activeFloor out of range falls back to 0', () => {
    const walls = rectWalls([0, 0], [4000, 3000], 200);
    const p = migrate({ version: 1, activeFloor: 7, floors: [{ id: 'f1', walls, rooms: [{ id: 'r1', name: '식당', wallIds: walls.map(w => w.id), points: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] }] }] });
    expect(p.activeFloor).toBe(0);
    const f = activeFloor(p);
    expect(f.rooms).toHaveLength(1); expect(f.rooms[0].id).toBe('r1'); expect(f.rooms[0].name).toBe('식당');
    expect(typeof f.rooms[0].area).toBe('number'); expect(f.rooms[0].area).toBeCloseTo(3.8 * 2.8, 2);
  });
  test('background is null or a validated object; opacity clamps to 0-1', () => {
    expect(migrate({ version: 1, background: 'nope' }).background).toBeNull();
    expect(migrate({ version: 1, background: { width: 10 } }).background).toBeNull(); // src 없는 배경은 버린다
    const bg = migrate({ version: 1, background: { src: 'data:,', width: '10', height: 20, scale: 'x', opacity: 5, offset: ['1', 2], visible: 'yes', locked: undefined } }).background;
    expect(bg.opacity).toBe(1); expect(bg.width).toBe(10); expect(bg.scale).toBe(1); expect(bg.offset).toEqual([1, 2]);
    expect(bg.visible).toBe(true); expect(bg.locked).toBe(true);
  });
  test('a valid project round-trips unchanged in substance', () => {
    const p = createEmptyProject('그대로');
    const q = normalizeProject(structuredClone(p));
    expect(q.name).toBe('그대로'); expect(q.floors[0].id).toBe(p.floors[0].id); expect(q.view).toEqual(p.view);
  });
});
