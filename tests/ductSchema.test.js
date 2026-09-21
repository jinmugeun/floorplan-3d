import { describe, test, expect } from 'vitest';
import { normalizeDuct, createDuct, DUCT_DEFAULT_SEGMENT, DUCT_RANGE, DAMPER_TYPES } from '../src/state/ductSchema.js';
import { migrate, createEmptyProject, activeFloor, normalizeRoomDesign } from '../src/state/schema.js';
import { createStore } from '../src/state/store.js';
import { addWalls, updateRoom } from '../src/state/floorOps.js';
import { ROOM_PROPS } from '../src/state/floorInternal.js';
import { rectWalls } from '../src/geom/walls.js';

describe('덕트 정규화', () => {
  test('점이 2개 미만이면 덕트가 아니다', () => {
    expect(normalizeDuct({ points: [[0, 0]] })).toBeNull();
    expect(normalizeDuct({ points: [] })).toBeNull();
    expect(normalizeDuct(null)).toBeNull();
    expect(normalizeDuct({ points: [[0, 0], ['x', 1], [10, 20]] }).points).toEqual([[0, 0], [10, 20]]);
  });

  test('segments는 늘 points.length - 1개이고 모자라면 마지막 값을 복제한다', () => {
    const d = normalizeDuct({ points: [[0, 0], [1000.5, 0], [1000.5, 2000.25], [3000, 2000.25]], segments: [{ w: 750, h: 400, z: 2650 }] });
    expect(d.segments).toHaveLength(3);
    expect(d.segments.every(s => s.w === 750 && s.h === 400 && s.z === 2650)).toBe(true);
    const none = normalizeDuct({ points: [[0, 0], [1, 1]] });
    expect(none.segments).toEqual([{ ...DUCT_DEFAULT_SEGMENT }]);
    const many = normalizeDuct({ points: [[0, 0], [1, 1]], segments: [{ w: 100 }, { w: 200 }, { w: 300 }] });
    expect(many.segments).toHaveLength(1);
    expect(normalizeDuct({ points: [[0, 0], [1, 1]], segments: [{ w: 99999, h: 0, z: -5 }] }).segments[0])
      .toEqual({ w: DUCT_RANGE.w[1], h: DUCT_RANGE.h[0], z: 0 });
  });

  test('연결은 있는 설비·유효한 점만 남고 한 점에 하나다', () => {
    const base = { points: [[0, 0], [100, 0], [200, 0]] };
    const d = normalizeDuct({ ...base, connections: [{ point: 0, itemId: 'i1' }, { point: 0, itemId: 'i2' }, { point: 9, itemId: 'i1' }, { point: 2, itemId: 'gone' }] }, { itemIds: new Set(['i1', 'i2']) });
    expect(d.connections).toEqual([{ point: 0, itemId: 'i1' }]);
    // 명세 §14는 필드 이름이 item이다: 읽을 때 받아 준다.
    expect(normalizeDuct({ ...base, connections: [{ point: 1, item: 'i9' }] }).connections).toEqual([{ point: 1, itemId: 'i9' }]);
  });

  test('댐퍼는 구간 안에 있어야 하고 크기는 그 구간 단면을 기본값으로 쓴다', () => {
    const d = normalizeDuct({
      points: [[0, 0], [1000, 0], [1000, 500.5]], segments: [{ w: 1000, h: 450, z: 2625 }, { w: 800, h: 450, z: 2625 }],
      dampers: [{ segment: 1, t: 0.3, type: 'VD', size: '550x450' }, { segment: 0, type: 'FVD' }, { segment: 5, type: 'VD' }, { type: 'VD' }],
    });
    expect(d.dampers).toEqual([
      { segment: 1, t: 0.3, type: 'VD', w: 550, h: 450 },
      { segment: 0, t: 0.5, type: 'FVD', w: 1000, h: 450 },
    ]);
    expect(DAMPER_TYPES).toEqual(['VD', 'FVD']);
    expect(normalizeDuct({ points: [[0, 0], [1, 0]], dampers: [{ segment: 0, type: '??', t: 9 }] }).dampers[0])
      .toMatchObject({ type: 'VD', t: 1 });
  });

  test('createDuct는 기본 배기 덕트를 만들고 estimated 플래그가 남는다', () => {
    const d = createDuct({ kind: 'supply', system: 'F-3', points: [[0, 0], [1000, 0]], estimated: true });
    expect(d.kind).toBe('supply');
    expect(d.system).toBe('F-3');
    expect(d.estimated).toBe(true);
    expect(d.locked).toBe(false);
    expect(d.hidden).toBe(false);
    expect(typeof d.id).toBe('string');
    expect(createDuct().kind).toBe('exhaust');
  });
});

describe('층 정규화가 덕트와 설계 풍량을 거른다', () => {
  test('덕트가 걸러지고 방에 design이 생긴다', () => {
    const p = createEmptyProject();
    p.floors[0].walls = rectWalls([0, 0], [4000.5, 3000.25], 200);
    p.floors[0].ducts = [{ points: [[0, 0]] }, { points: [[0, 0], [1000, 0]], kind: 'supply' }];
    const out = migrate(p);
    const f = activeFloor(out);
    expect(f.ducts).toHaveLength(1);
    expect(f.ducts[0].kind).toBe('supply');
    expect(f.rooms[0].design).toEqual({ EA: 0, SA: 0 });
  });

  test('normalizeRoomDesign은 음수·문자를 0으로 떨어뜨린다', () => {
    expect(normalizeRoomDesign({ EA: 32641, SA: 24000 })).toEqual({ EA: 32641, SA: 24000 });
    expect(normalizeRoomDesign({ EA: -1, SA: 'x' })).toEqual({ EA: 0, SA: 0 });
    expect(normalizeRoomDesign(undefined)).toEqual({ EA: 0, SA: 0 });
    expect(normalizeRoomDesign({ EA: 1234.6 })).toEqual({ EA: 1235, SA: 0 });
  });

  test('벽이 바뀌어 방을 다시 검출해도 설계 풍량이 남는다', () => {
    const store = createStore(createEmptyProject());
    addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
    const id = activeFloor(store.get()).rooms[0].id;
    updateRoom(store, id, { design: { EA: 32641, SA: 24000 } });
    addWalls(store, rectWalls([4000.5, 0], [6000, 3000.25], 200));   // 벽을 더하면 detectRooms가 다시 돈다
    const kept = activeFloor(store.get()).rooms.find(r => r.id === id);
    expect(kept.design).toEqual({ EA: 32641, SA: 24000 });
    expect(ROOM_PROPS).toContain('design');                          // 방 복사·층 복사도 설계 풍량을 옮긴다
  });
});
