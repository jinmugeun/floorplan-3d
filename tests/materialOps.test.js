import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, normalizeProject, normalizeAssignment, normalizeRegion } from '../src/state/schema.js';
import { addWalls, duplicateRoom, addFloor } from '../src/state/floorOps.js';
import { applyMaterial, applyRoomWalls, setWallRegions, assignmentOf, regionsOf, faceArea } from '../src/state/materialOps.js';
import { rectWalls, makeWall, splitWall, wallLength } from '../src/geom/walls.js';

function setup() {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  return store;
}
const mat = (id, patch = {}) => ({ id, offset: [0, 0], angle: 0, ...patch });

describe('마감재 정규화', () => {
  test('normalizeAssignment는 범위를 자르고 모르는 id를 버린다', () => {
    expect(normalizeAssignment({ id: 'wood-oak', offset: [1500, -20.5], angle: 725.5 })).toEqual({ id: 'wood-oak', offset: [1000, 0], angle: 5.5 });
    expect(normalizeAssignment({ id: 'wood-oak' })).toEqual({ id: 'wood-oak', offset: [0, 0], angle: 0 });
    expect(normalizeAssignment({ id: '없는재질' })).toBeNull();
    expect(normalizeAssignment(null)).toBeNull();
  });

  test('normalizeRegion은 재질·범위를 검사하고 band는 벽 전체 폭이 된다', () => {
    const box = { len: 4000.5, height: 2300 };
    const band = normalizeRegion({ kind: 'band', z0: 0, z1: 1200.5, mat: mat('tile-white-300') }, box);
    expect(band.kind).toBe('band');
    expect(band.u0).toBe(0);
    expect(band.u1).toBeCloseTo(4000.5);
    expect(band.z1).toBeCloseTo(1200.5);
    expect(typeof band.id).toBe('string');
    const r = normalizeRegion({ kind: 'rect', u0: -100, u1: 99999, z0: 100.25, z1: 900, mat: mat('brick-red') }, box);
    expect(r.u0).toBe(0);
    expect(r.u1).toBeCloseTo(4000.5);
    expect(r.z0).toBeCloseTo(100.25);
    expect(normalizeRegion({ kind: 'rect', u0: 500, u1: 400, z0: 0, z1: 900, mat: mat('brick-red') }, box)).toBeNull();
    expect(normalizeRegion({ kind: 'band', z0: 900, z1: 900, mat: mat('brick-red') }, box)).toBeNull();
    expect(normalizeRegion({ kind: 'band', z0: 0, z1: 900 }, box)).toBeNull(); // 재질 없는 영역은 그릴 것이 없다
  });

  test('새 벽과 불러온 프로젝트의 벽·방에 마감재 필드가 있다', () => {
    const w = makeWall({ a: [0, 0], b: [1000, 0] });
    expect(w.matIn).toBeNull();
    expect(w.regions).toEqual({ in: [], out: [] });
    const p = normalizeProject({
      version: 1,
      floors: [{ walls: [{ a: [0, 0], b: [4000, 0], matIn: { id: 'paint-navy', offset: [2000, 10.5], angle: 90 }, matOut: { id: '없음' }, regions: { in: [{ kind: 'band', z0: 0, z1: 1000, mat: { id: 'tile-white-300' } }], out: 'x' } }] }],
    });
    const wall = p.floors[0].walls[0];
    expect(wall.matIn).toEqual({ id: 'paint-navy', offset: [1000, 10.5], angle: 90 });
    expect(wall.matOut).toBeNull();
    expect(wall.regions.in).toHaveLength(1);
    expect(wall.regions.out).toEqual([]);
  });

  test('벽 나누기는 재질은 잇고 영역은 비운다', () => {
    const s = setup();
    const f = activeFloor(s.get());
    const w = f.walls[0];
    applyMaterial(s, { kind: 'wall', id: w.id, side: 'in' }, mat('brick-red'));
    setWallRegions(s, w.id, 'in', [{ kind: 'band', z0: 0, z1: 1000, mat: mat('tile-white-300') }]);
    const walls = splitWall(activeFloor(s.get()).walls, w.id, [1000, 0]);
    const parts = walls.filter(x => x.matIn?.id === 'brick-red');
    expect(parts).toHaveLength(2);
    expect(parts.every(x => x.regions.in.length === 0)).toBe(true);
  });
});

describe('마감재 상태 연산', () => {
  test('applyMaterial이 벽 안/밖, 바닥, 천장에 각각 붙고 한 단계로 되돌려진다', () => {
    const s = setup();
    const f = activeFloor(s.get());
    const wallId = f.walls[0].id, roomId = f.rooms[0].id;
    applyMaterial(s, { kind: 'wall', id: wallId, side: 'in' }, mat('paint-navy'));
    applyMaterial(s, { kind: 'wall', id: wallId, side: 'out' }, mat('brick-red', { offset: [120.5, 0], angle: 15 }));
    applyMaterial(s, { kind: 'floor', id: roomId }, mat('wood-oak'));
    applyMaterial(s, { kind: 'ceiling', id: roomId }, mat('paint-white'));
    const g = activeFloor(s.get());
    expect(g.walls[0].matIn.id).toBe('paint-navy');
    expect(g.walls[0].matOut).toEqual({ id: 'brick-red', offset: [120.5, 0], angle: 15 });
    expect(g.rooms[0].floorMat.id).toBe('wood-oak');
    expect(g.rooms[0].ceilingMat.id).toBe('paint-white');
    s.undo();
    expect(activeFloor(s.get()).rooms[0].ceilingMat).toBeNull();
    applyMaterial(s, { kind: 'floor', id: roomId }, null);
    expect(activeFloor(s.get()).rooms[0].floorMat).toBeNull();
    applyMaterial(s, { kind: 'wall', id: '없음', side: 'in' }, mat('paint-navy')); // 없는 대상은 조용히 지나간다
  });

  test('applyRoomWalls는 그 방 벽의 내벽 재질을 한 dispatch로 바꾼다', () => {
    const s = setup();
    const f = activeFloor(s.get());
    applyRoomWalls(s, f.rooms[0].id, mat('wallpaper-stripe'));
    const g = activeFloor(s.get());
    expect(g.walls.every(w => w.matIn.id === 'wallpaper-stripe')).toBe(true);
    expect(g.walls.every(w => w.matOut === null)).toBe(true);
    s.undo();
    expect(activeFloor(s.get()).walls.every(w => w.matIn === null)).toBe(true);
  });

  test('setWallRegions는 면마다 따로 두고 잘못된 영역을 걸러낸다', () => {
    const s = setup();
    const w = activeFloor(s.get()).walls[0];
    setWallRegions(s, w.id, 'in', [
      { kind: 'band', z0: 0, z1: 1200.5, mat: mat('tile-white-300') },
      { kind: 'rect', u0: 100, u1: 50, z0: 0, z1: 900, mat: mat('brick-red') }, // 뒤집힌 범위 → 버린다
    ]);
    const g = activeFloor(s.get());
    expect(g.walls[0].regions.in).toHaveLength(1);
    expect(g.walls[0].regions.in[0].u1).toBeCloseTo(wallLength(w));
    expect(g.walls[0].regions.out).toEqual([]);
    expect(regionsOf(g, { kind: 'wall', id: w.id, side: 'in' })).toHaveLength(1);
    setWallRegions(s, w.id, 'in', []);
    expect(activeFloor(s.get()).walls[0].regions.in).toEqual([]);
  });

  test('assignmentOf와 faceArea(소수 좌표)', () => {
    const s = setup();
    const f = activeFloor(s.get());
    const wallId = f.walls[0].id, roomId = f.rooms[0].id;
    applyMaterial(s, { kind: 'wall', id: wallId, side: 'in' }, mat('paint-navy'));
    const g = activeFloor(s.get());
    expect(assignmentOf(g, { kind: 'wall', id: wallId, side: 'in' }).id).toBe('paint-navy');
    expect(assignmentOf(g, { kind: 'wall', id: wallId, side: 'out' })).toBeNull();
    expect(assignmentOf(g, { kind: 'floor', id: roomId })).toBeNull();
    expect(assignmentOf(g, null)).toBeNull();
    const w = g.walls.find(x => x.id === wallId);
    expect(faceArea(g, { kind: 'wall', id: wallId, side: 'in' })).toBeCloseTo((wallLength(w) * w.height) / 1e6, 6);
    expect(faceArea(g, { kind: 'floor', id: roomId })).toBeCloseTo(g.rooms[0].area, 6);
    expect(faceArea(g, { kind: 'ceiling', id: roomId })).toBeCloseTo(g.rooms[0].area, 6);
    expect(faceArea(g, { kind: 'wall', id: '없음', side: 'in' })).toBe(0);
  });

  test('벽을 옮겨 방을 다시 검출해도 방 재질이 살아남는다', () => {
    const s = setup();
    const f = activeFloor(s.get());
    applyMaterial(s, { kind: 'floor', id: f.rooms[0].id }, mat('wood-walnut'));
    addWalls(s, [makeWall({ a: [0, 0], b: [0, -1500.5], thickness: 200 })]); // reroom·detectRooms를 다시 돌린다
    expect(activeFloor(s.get()).rooms[0].floorMat.id).toBe('wood-walnut');
  });

  // ROOM_PROPS(floorInternal.js)가 방 속성을 옮기는 유일한 목록이다: 마감재 두 키가 빠지면 여기서 걸린다.
  test('방 복사는 바닥·천장 마감재를 함께 옮긴다', () => {
    const s = setup();
    const roomId = activeFloor(s.get()).rooms[0].id;
    applyMaterial(s, { kind: 'floor', id: roomId }, mat('wood-oak'));
    applyMaterial(s, { kind: 'ceiling', id: roomId }, mat('paint-white'));
    duplicateRoom(s, roomId);
    const g = activeFloor(s.get());
    expect(g.rooms).toHaveLength(2);
    expect(g.rooms.every(r => r.floorMat?.id === 'wood-oak')).toBe(true);
    expect(g.rooms.every(r => r.ceilingMat?.id === 'paint-white')).toBe(true);
  });

  test('층 추가(복사)도 방 마감재를 이어받는다', () => {
    const s = setup();
    const roomId = activeFloor(s.get()).rooms[0].id;
    applyMaterial(s, { kind: 'floor', id: roomId }, mat('wood-walnut'));
    addFloor(s, { copy: 'all' });
    expect(s.get().floors).toHaveLength(2);
    expect(activeFloor(s.get()).rooms[0].floorMat.id).toBe('wood-walnut'); // copyRoomProps가 ROOM_PROPS를 쓴다
  });
});
