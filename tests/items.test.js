import { describe, test, expect } from 'vitest';
import { itemCorners, itemAABB, toLocal, pointInItem, wallAxis, placeOnWall, nearestWallPlacement, normDeg } from '../src/geom/items.js';
import { pointInPolygon } from '../src/geom/rooms.js';
import { makeWall } from '../src/geom/walls.js';

const item = (patch = {}) => ({ id: 'i1', pos: [0, 0], z: 0, rot: 0, size: [1200, 600, 700], attach: 'floor', ...patch });

describe('아이템 기하', () => {
  test('itemCorners는 좌상→우상→우하→좌하 순서다(소수 좌표)', () => {
    const c = itemCorners(item({ pos: [1000.5, 2000.25] }));
    expect(c[0]).toEqual([400.5, 1700.25]);
    expect(c[1]).toEqual([1600.5, 1700.25]);
    expect(c[2]).toEqual([1600.5, 2300.25]);
    expect(c[3]).toEqual([400.5, 2300.25]);
  });

  test('rot 90°면 너비가 남북 방향으로 눕는다', () => {
    const c = itemCorners(item({ rot: 90 }));
    expect(c[0][0]).toBeCloseTo(300); expect(c[0][1]).toBeCloseTo(-600);
    const bb = itemAABB(item({ rot: 90, pos: [10.5, -3.25] }));
    expect(bb.min[0]).toBeCloseTo(-289.5); expect(bb.max[0]).toBeCloseTo(310.5);
    expect(bb.min[1]).toBeCloseTo(-603.25); expect(bb.max[1]).toBeCloseTo(596.75);
  });

  test('45° 회전한 정사각 아이템의 AABB는 대각선 폭이다(소수 크기)', () => {
    const bb = itemAABB(item({ rot: 45, size: [1000.5, 1000.5, 700] }));
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(1000.5 * Math.SQRT2, 3);
  });

  test('pointInItem은 회전 사각형 판정이고 pointInPolygon과 일치한다', () => {
    const it = item({ pos: [1000.5, 500.25], rot: 30 });
    const inside = [1100.25, 520.5], outside = [1900.75, 520.5];
    expect(pointInItem(inside, it)).toBe(true);
    expect(pointInPolygon(inside, itemCorners(it))).toBe(true);
    expect(pointInItem(outside, it)).toBe(false);
    expect(pointInPolygon(outside, itemCorners(it))).toBe(false);
    expect(toLocal(it.pos, it)).toEqual([0, 0]);
  });

  test('normDeg는 음수·초과 각도를 0~360으로 감는다', () => {
    expect(normDeg(-90)).toBe(270);
    expect(normDeg(455.5)).toBe(95.5);
    expect(normDeg('x')).toBe(0);
  });

  test('wallAxis는 벽 방향·법선·길이·각도를 준다', () => {
    const ax = wallAxis(makeWall({ a: [0, 0], b: [0, 3000.5], thickness: 200 }));
    expect(ax.len).toBeCloseTo(3000.5);
    expect(ax.rot).toBeCloseTo(90);
    expect(ax.n[0]).toBeCloseTo(-1); expect(ax.n[1]).toBeCloseTo(0);
  });

  test('placeOnWall은 뒷면을 벽면에 붙이고 벽 방향으로 정렬한다', () => {
    const w = makeWall({ a: [0, 0], b: [4000, 0], thickness: 200 });
    const size = [900, 400, 2100];
    expect(placeOnWall(w, 0.25, 1, size).pos).toEqual([1000, 300]);
    expect(placeOnWall(w, 0.25, 1, size).rot).toBe(0);
    expect(placeOnWall(w, 0.25, -1, size).pos).toEqual([1000, -300]);
    expect(placeOnWall(w, 0.25, -1, size).rot).toBe(180);   // 뒷면이 벽을 본다
    expect(placeOnWall(w, 0.25, 1, size, { embed: true }).pos).toEqual([1000, 0]);
    expect(placeOnWall(w, 5, 1, size).pos[0]).toBe(4000); // t는 0~1로 잘린다
  });

  test('nearestWallPlacement는 300mm 안의 가장 가까운 벽에 붙이고 벽 안으로 미끄러진다', () => {
    const walls = [makeWall({ a: [0, 0], b: [4000, 0], thickness: 200 }), makeWall({ a: [0, 3000], b: [4000, 3000], thickness: 200 })];
    const size = [900, 400, 2100];
    const near = nearestWallPlacement(walls, [1000.5, 120.25], size, 300);
    expect(near.wallId).toBe(walls[0].id);
    expect(near.t).toBeCloseTo(0.250125);
    expect(near.side).toBe(1);
    expect(near.pos[0]).toBeCloseTo(1000.5); expect(near.pos[1]).toBeCloseTo(300);
    expect(nearestWallPlacement(walls, [1000, 1500], size, 300)).toBeNull();
    const slid = nearestWallPlacement(walls, [100, 50], size, 300);
    expect(slid.t).toBeCloseTo(0.1125);
    expect(slid.pos[0]).toBeCloseTo(450);
    const other = nearestWallPlacement(walls, [2000, 2950], size, 300);
    expect(other.wallId).toBe(walls[1].id);
    expect(other.side).toBe(-1);
    expect(other.rot).toBe(180);   // 아래쪽 벽의 안쪽 면을 보도록 180° 돌아간다
  });
});
