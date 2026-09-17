import { describe, test, expect } from 'vitest';
import { linearOffsets, circularPlacements, alignPatches } from '../src/geom/arrange.js';
import { createItem } from '../src/state/schema.js';
import { productById } from '../src/products/catalog.js';

const mk = (id, patch) => createItem(productById(id), patch);

describe('배열·정렬 계산', () => {
  test('직선 배열은 간격의 배수로 늘어난다(소수 간격)', () => {
    expect(linearOffsets({ dx: 500.5, dy: 0, count: 3 })).toEqual([[500.5, 0], [1001, 0], [1501.5, 0]]);
    expect(linearOffsets({ dx: 0, dy: -300, count: 1 })).toEqual([[0, -300]]);
    expect(linearOffsets({ dx: 100, dy: 100, count: 0 })).toEqual([]);
  });

  test('원형 배열은 기준점을 돌며 아이템도 같이 돈다', () => {
    const it = mk('chair-dining', { pos: [1000, 0] });
    const out = circularPlacements(it, { center: [0, 0], angle: 90, count: 3 });
    expect(out).toHaveLength(3);
    expect(out[0].pos[0]).toBeCloseTo(0);
    expect(out[0].pos[1]).toBeCloseTo(1000);
    expect(out[0].rot).toBe(90);
    expect(out[2].pos[1]).toBeCloseTo(-1000);
    expect(out[2].rot).toBe(270);
    const fixed = circularPlacements(it, { center: [0, 0], angle: 90, count: 1, rotate: false });
    expect(fixed[0].rot).toBe(0);
  });

  test('회전 복사는 자기 중심에서 각도만 바뀐다(소수 좌표)', () => {
    const it = mk('chair-dining', { pos: [1234.5, -10.25], rot: 30 });
    const out = circularPlacements(it, { center: it.pos, angle: 45, count: 2 });
    expect(out[0].pos[0]).toBeCloseTo(1234.5);
    expect(out[0].pos[1]).toBeCloseTo(-10.25);
    expect(out[0].rot).toBe(75);
    expect(out[1].rot).toBe(120);
  });

  test('정렬은 AABB 기준으로 위/중간/아래·왼/가운데/오른을 맞춘다', () => {
    const a = mk('chair-dining', { pos: [1000, 1000] });     // 450×500
    const b = mk('dining-4', { pos: [2000, 2000.5] });       // 1200×800
    const top = alignPatches([a, b], 'v', 'start');
    expect(top[0].patch.pos[1]).toBeCloseTo(1000);           // 위쪽 750이 기준
    expect(top[1].patch.pos[1]).toBeCloseTo(1150);
    const right = alignPatches([a, b], 'h', 'end');
    expect(right[0].patch.pos[0]).toBeCloseTo(2375);
    expect(right[1].patch.pos[0]).toBeCloseTo(2000);
    const center = alignPatches([a, b], 'h', 'center');
    expect(center[0].patch.pos[0]).toBeCloseTo(center[1].patch.pos[0]);
    expect(alignPatches([a], 'h', 'center')).toEqual([]);
  });
});
