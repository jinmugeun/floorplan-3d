import { describe, test, expect } from 'vitest';
import { itemCorners, itemAABB, toLocal, pointInItem, wallAxis, placeOnWall, nearestWallPlacement, normDeg, snapItemPos, wallGaps, isEmbed, scaleFromHandle, rotateToPoint } from '../src/geom/items.js';
import { pointInPolygon } from '../src/geom/rooms.js';
import { makeWall, rectWalls } from '../src/geom/walls.js';

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

describe('아이템 스냅', () => {
  test('뒷면이 벽 안쪽 면에 붙는다(소수 좌표)', () => {
    const walls = rectWalls([0, 0], [4000, 3000], 200);
    const it = item({ pos: [2000, 480.5], size: [1000, 600, 700] });
    const r = snapItemPos(it, { walls, items: [] });
    expect(r.pos[1]).toBeCloseTo(400);   // AABB 위 모서리 180.5 → 벽 안쪽 면 100
    expect(r.pos[0]).toBeCloseTo(2000);
    expect(r.guides).toEqual([{ type: 'h', y: 100 }]);
  });

  test('다른 아이템의 중심선에 맞고 노란 가이드를 돌려준다', () => {
    const other = item({ id: 'o', pos: [2000, 2000], size: [800, 400, 700] });
    const it = item({ pos: [1990.4, 1000], size: [1000, 600, 700] });
    const r = snapItemPos(it, { walls: [], items: [other] });
    expect(r.pos[0]).toBeCloseTo(2000);
    expect(r.guides).toEqual([{ type: 'v', x: 2000 }]);
  });

  test('150mm보다 멀면 스냅하지 않는다', () => {
    const walls = rectWalls([0, 0], [4000, 3000], 200);
    const it = item({ pos: [2000, 1500.25], size: [1000, 600, 700] });
    const r = snapItemPos(it, { walls, items: [] });
    expect(r.pos).toEqual([2000, 1500.25]);
    expect(r.guides).toEqual([]);
  });
});

describe('벽까지 거리', () => {
  test('네 방향에서 가장 가까운 벽면까지 거리를 준다(소수 좌표)', () => {
    const walls = rectWalls([0, 0], [4000, 3000], 200);
    const gaps = wallGaps(itemAABB(item({ pos: [2000.5, 1500.25], size: [1000, 600, 700] })), walls);
    expect(gaps.left).toBeCloseTo(1400.5);
    expect(gaps.right).toBeCloseTo(1399.5);
    expect(gaps.up).toBeCloseTo(1100.25);
    expect(gaps.down).toBeCloseTo(1099.75);
  });

  test('겹치는 구간이 없는 벽은 세지 않는다', () => {
    const walls = [{ id: 'w', a: [0, 0], b: [0, 500], thickness: 200 }];
    const gaps = wallGaps(itemAABB(item({ pos: [2000, 2000], size: [1000, 600, 700] })), walls);
    expect(gaps.left).toBeNull();
    expect(gaps.right).toBeNull();
  });

  test('isEmbed는 문·창·개구부만 참이다', () => {
    expect(isEmbed({ kind: 'door' })).toBe(true);
    expect(isEmbed({ kind: 'window' })).toBe(true);
    expect(isEmbed({ kind: 'opening' })).toBe(true);
    expect(isEmbed({ kind: 'product' })).toBe(false);
  });
});

describe('아이템 크기·회전 계산', () => {
  test('오른쪽 변 핸들(3)은 왼쪽 변을 고정한 채 너비만 늘린다', () => {
    const it = item({ pos: [1000, 1000], size: [1200, 600, 700] });
    const r = scaleFromHandle(it, 3, [2000, 1000]);
    expect(r.size).toEqual([1600, 600, 700]);
    expect(r.pos[0]).toBeCloseTo(1200);   // 왼쪽 변 400은 그대로, 중심이 오른쪽으로
    expect(r.pos[1]).toBeCloseTo(1000);
  });

  test('코너 핸들(4)은 두 축을 함께 바꾸고 소수 좌표도 유지한다', () => {
    const it = item({ pos: [0, 0], size: [1000, 500, 700] });
    const r = scaleFromHandle(it, 4, [750.5, 375.25]);
    expect(r.size[0]).toBeCloseTo(1250.5);
    expect(r.size[1]).toBeCloseTo(625.25);
    expect(r.pos[0]).toBeCloseTo(125.25);
    expect(r.pos[1]).toBeCloseTo(62.625);
  });

  test('Shift(비율 유지)는 코너에서 두 축을 같은 비율로 키운다', () => {
    const it = item({ pos: [0, 0], size: [1000, 500, 700] });
    const r = scaleFromHandle(it, 4, [750, 250], { keepRatio: true });
    expect(r.size[0]).toBeCloseTo(1250);   // 너비 비율 1.25가 더 크므로 그 비율을 쓴다
    expect(r.size[1]).toBeCloseTo(625);
    expect(r.size[0] / r.size[1]).toBeCloseTo(2);
  });

  test('크기는 10~5000으로 잘린다', () => {
    const it = item({ pos: [0, 0], size: [1000, 500, 700] });
    expect(scaleFromHandle(it, 3, [-9000, 0]).size[0]).toBe(5000);
    // 왼쪽 고정 변(-500)을 5mm 넘겨 끌면(-495) 너비 후보가 5 → 최소 10으로 잘린다.
    expect(scaleFromHandle(it, 3, [-495, 0]).size[0]).toBe(10);
  });

  test('회전한 아이템의 핸들 드래그는 로컬 축으로 계산된다', () => {
    const it = item({ pos: [0, 0], size: [1000, 500, 700], rot: 90 });
    const r = scaleFromHandle(it, 3, [0, 750]); // rot 90이면 로컬 +x가 월드 +y
    expect(r.size[0]).toBeCloseTo(1250);
    expect(r.pos[1]).toBeCloseTo(125);
  });

  test('rotateToPoint는 아래쪽 핸들이 커서를 향하게 하고 15°로 스냅한다', () => {
    const it = item({ pos: [0, 0] });
    expect(rotateToPoint(it, [0, 1000])).toBe(0);
    expect(rotateToPoint(it, [1000, 0])).toBe(270);
    expect(rotateToPoint(it, [1000.5, 1000.5])).toBe(315);
    expect(rotateToPoint(it, [100, 1000])).toBe(0);           // 약 5.7° → 0°로 스냅
    expect(rotateToPoint(it, [100, 1000], { snapDeg: 0 })).toBeCloseTo(354.29, 1);
  });
});
