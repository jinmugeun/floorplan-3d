import { describe, test, expect } from 'vitest';
import { openingsOnWall, wallPieces } from '../src/geom/openings.js';
import { makeWall } from '../src/geom/walls.js';
import { createItem } from '../src/state/schema.js';
import { productById } from '../src/products/catalog.js';

const wall = (b = [4000, 0]) => makeWall({ a: [0, 0], b, thickness: 200, height: 2300 });
const on = (w, id, patch) => createItem(productById(id), { wallId: w.id, ...patch });

describe('벽 개구부', () => {
  test('문 하나는 좌·우·상단 3조각을 만든다(하단은 없다)', () => {
    const w = wall();
    const ops = openingsOnWall([on(w, 'door-swing-900', { t: 0.25 })], w);
    expect(ops).toEqual([{ u0: 550, u1: 1450, z0: 0, z1: 2100, itemId: ops[0].itemId }]);
    const pieces = wallPieces(w, ops, { start: 0, end: 4000 });
    expect(pieces).toEqual([
      { u0: 0, u1: 550, z0: 0, z1: 2300 },
      { u0: 550, u1: 1450, z0: 2100, z1: 2300 },
      { u0: 1450, u1: 4000, z0: 0, z1: 2300 },
    ]);
  });

  test('창 하나는 좌·하단·상단·우 4조각을 만든다', () => {
    const w = wall();
    const ops = openingsOnWall([on(w, 'window-slide-1200', { t: 0.5 })], w);
    expect(ops[0]).toMatchObject({ u0: 1400, u1: 2600, z0: 900, z1: 2100 });
    const pieces = wallPieces(w, ops, { start: 0, end: 4000 });
    expect(pieces).toHaveLength(4);
    expect(pieces[1]).toEqual({ u0: 1400, u1: 2600, z0: 0, z1: 900 });
    expect(pieces[2]).toEqual({ u0: 1400, u1: 2600, z0: 2100, z1: 2300 });
  });

  test('개구부가 없으면 벽 전체 한 조각이고 조각 길이 합은 벽 길이다(소수 길이)', () => {
    const w = wall([3000.5, 0]);
    expect(wallPieces(w, [], { start: 0, end: 3000.5 })).toEqual([{ u0: 0, u1: 3000.5, z0: 0, z1: 2300 }]);
    const ops = openingsOnWall([on(w, 'opening-pass', { t: 0.5 })], w);
    expect(ops[0].u0).toBeCloseTo(1050.25);
    const pieces = wallPieces(w, ops, { start: 0, end: 3000.5 });
    expect(pieces).toHaveLength(3); // 좌 · 상단 · 우
    expect(pieces[0].u1).toBeCloseTo(1050.25);
    expect(pieces[2].u1).toBeCloseTo(3000.5);
  });

  test('개구부 두 개는 사이 벽을 남기고 정렬된다', () => {
    const w = wall();
    const ops = openingsOnWall([on(w, 'window-slide-1200', { t: 0.75 }), on(w, 'door-swing-900', { t: 0.15 })], w);
    expect(ops.map(o => Math.round(o.u0))).toEqual([150, 2400]);
    const pieces = wallPieces(w, ops, { start: 0, end: 4000 });
    expect(pieces.filter(p => p.z0 === 0 && p.z1 === 2300).map(p => [p.u0, p.u1])).toEqual([[0, 150], [1050, 2400], [3600, 4000]]);
  });

  test('겹친 개구부는 서로의 구멍을 막지 않는다', () => {
    const w = wall();
    const ops = openingsOnWall([on(w, 'door-swing-900', { t: 0.25 }), on(w, 'window-slide-1200', { t: 0.3 })], w);
    const pieces = wallPieces(w, ops, { start: 0, end: 4000 });
    const over = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
    for (const p of pieces) {
      for (const o of ops) {
        const du = over(p.u0, p.u1, o.u0, o.u1), dz = over(p.z0, p.z1, o.z0, o.z1);
        expect(du <= 1 || dz <= 1, `${p.u0}~${p.u1} / ${p.z0}~${p.z1}`).toBe(true);
      }
    }
  });

  test('시작·끝을 벽 접합만큼 늘려도 조각이 그 범위를 덮는다', () => {
    const w = wall();
    const ops = openingsOnWall([on(w, 'door-swing-900', { t: 0.5 })], w);
    const pieces = wallPieces(w, ops, { start: -100, end: 4100 });
    expect(pieces[0].u0).toBe(-100);
    expect(pieces[pieces.length - 1].u1).toBe(4100);
  });

  test('다른 벽·숨긴 아이템·일반 제품은 개구부가 아니다', () => {
    const w = wall();
    const items = [on(w, 'door-swing-900', { t: 0.5, hidden: true }), on(w, 'sofa-3', { t: 0.5 }), createItem(productById('door-swing-900'), { wallId: 'other', t: 0.5 })];
    expect(openingsOnWall(items, w)).toEqual([]);
  });
});
