import { describe, test, expect } from 'vitest';
import { migrate, normalizeProject, activeFloor, createEmptyProject, SCHEMA_VERSION, DEFAULT_SETTINGS } from '../src/state/schema.js';
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
  test('view flags are coerced and nested defaults are filled', () => {
    const p = migrate({ version: 1, view: { wallOpacity: 'abc', display: 'nope', v3: { outerWalls: 0 } } });
    expect(p.view.wallOpacity).toBe(1);
    expect(p.view.display).toBe('normal');
    expect(p.view.v3.outerWalls).toBe(false);
    expect(p.view.v3.innerWalls).toBe(true);
    expect(p.view.v2.grid).toBe(true);
    expect(p.view.perfMode).toBe('display');
    expect(p.view.projection).toBe('perspective');
    expect(p.view.cameraPreset).toEqual({ elevation: 35, azimuth: 47, fov: 60 });
    expect(p.view.sun).toEqual({ month: 6, hour: 12, intensity: 0.8, azimuth: 180, ambient: 0.6 });
  });
  test('old flat view flags migrate into v2', () => {
    const p = migrate({ version: 1, view: { grid: false, labels: false, dimensions: false, background: false, collision: false, cutaway: false } });
    expect(p.view.v2.grid).toBe(false);
    expect(p.view.v2.roomName).toBe(false);
    expect(p.view.v2.roomArea).toBe(false);
    expect(p.view.v2.dims).toBe(false);
    expect(p.view.v2.background).toBe(false);
    expect(p.view.v2.collision).toBe(false);
    expect(p.view.cutaway).toBe(false);
    expect(p.view.grid).toBeUndefined(); // 옛 필드는 남기지 않는다
  });
  test('camera preset and sun values are clamped and wrapped', () => {
    const p = migrate({ version: 1, view: { cameraPreset: { elevation: 200, azimuth: 407, fov: 5 }, sun: { month: 0, hour: 99, intensity: -3, azimuth: -10, ambient: 'x' } } });
    expect(p.view.cameraPreset).toEqual({ elevation: 89, azimuth: 47, fov: 15 });
    expect(p.view.sun).toEqual({ month: 1, hour: 23, intensity: 0, azimuth: 350, ambient: 0.6 });
  });
  test('measures survive normalize with numeric coordinates', () => {
    const p = migrate({ version: 1, floors: [{ measures: [{ id: 'm1', a: ['10.5', 0], b: [4000.25, '0'] }, { a: 'x' }] }] });
    expect(activeFloor(p).measures).toEqual([{ id: 'm1', a: [10.5, 0], b: [4000.25, 0] }]);
  });
  test('a valid project round-trips unchanged in substance', () => {
    const p = createEmptyProject('그대로');
    const q = normalizeProject(structuredClone(p));
    expect(q.name).toBe('그대로'); expect(q.floors[0].id).toBe(p.floors[0].id); expect(q.view).toEqual(p.view);
  });
  test('wall colours and room extras get defaults and are validated', () => {
    const p = migrate({ version: 1, floors: [{ walls: [{ id: 'w1', a: [0, 0], b: [4000, 0], colorIn: 'red', colorOut: '#123456' }] }] });
    const w = activeFloor(p).walls[0];
    expect(w.colorIn).toBe('#f2efe9'); // CSS 이름은 거부하고 기본값
    expect(w.colorOut).toBe('#123456');
    const q = migrate({ version: 1, floors: [{ walls: rectWalls([0, 0], [4000, 3000], 200), rooms: [{ id: 'r1', points: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]], seats: '42.7', matchWallHeight: 1, floorColor: '#aabbcc', ceilingColor: 'x' }] }] });
    const r = activeFloor(q).rooms[0];
    expect(r.seats).toBe(42);
    expect(r.matchWallHeight).toBe(true);
    expect(r.floorColor).toBe('#aabbcc');
    expect(r.ceilingColor).toBe('#f4f4f2');
  });
  test('units accepts only mm or ftin, and settings/areaMode get defaults', () => {
    expect(migrate({ version: 1, units: 'ftin' }).units).toBe('ftin');
    expect(migrate({ version: 1, units: '척' }).units).toBe('mm');
    const p = migrate({ version: 1, settings: { pyeong: 1, background: 'javascript:x' }, areaMode: 'gross' });
    expect(p.settings).toEqual({ pyeong: true, showUnit: false, background: '#f3f4f6' });
    expect(p.areaMode).toBe('gross');
    expect(migrate({ version: 1, areaMode: 'nope' }).areaMode).toBe('net');
  });
});

test('settings.background accepts only hex colours', () => {
  expect(normalizeProject({ settings: { background: '#abc' } }).settings.background).toBe('#abc');
  expect(normalizeProject({ settings: { background: '#11223344' } }).settings.background).toBe('#11223344');
  for (const bad of ['red', 'javascript:1', '#12', 42, null]) {
    expect(normalizeProject({ settings: { background: bad } }).settings.background).toBe(DEFAULT_SETTINGS.background);
  }
});
