import { describe, test, expect } from 'vitest';
import { linearOffsets, circularPlacements, alignPatches, pathPlacements } from '../src/geom/arrange.js';
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

describe('경로 배열 계산(pathPlacements)', () => {
  const it0 = () => mk('chair-dining', { pos: [0, 0], rot: 30 });

  test('시작점부터 간격마다 놓고 원본 자리를 건너뛰지 않는다(소수 좌표)', () => {
    const out = pathPlacements(it0(), [[0.5, 0.25], [2000.5, 0.25]], { spacing: 500 });
    expect(out).toHaveLength(5);                                  // 0 · 500 · 1000 · 1500 · 2000
    expect(out.map(p => p.pos[0])).toEqual([0.5, 500.5, 1000.5, 1500.5, 2000.5]);
    expect(out.every(p => p.pos[1] === 0.25)).toBe(true);
    expect(out[0].rot).toBe(0);                                   // 동쪽으로 가는 경로 = 0°
  });

  test('간격으로 딱 나누어지지 않으면 남는 끝은 비워 둔다', () => {
    const out = pathPlacements(it0(), [[0, 0], [2500, 0]], { spacing: 1000 });
    expect(out.map(p => p.pos[0])).toEqual([0, 1000, 2000]);       // 2500에는 놓지 않는다
  });

  test('count가 있으면 간격을 길이/count로 덮어쓰고 정확히 count개를 낸다', () => {
    const out = pathPlacements(it0(), [[0, 0], [1000, 0]], { spacing: 999, count: 4 });
    expect(out.map(p => p.pos[0])).toEqual([0, 250, 500, 750]);
    expect(pathPlacements(it0(), [[0, 0], [1000, 0]], { count: 1 })).toHaveLength(1);
  });

  test('꺾인 경로는 구간 방향각을 따라 돌고, 꺾이는 점은 앞 구간의 각도를 쓴다', () => {
    const out = pathPlacements(it0(), [[0, 0], [1000, 0], [1000, 1000]], { spacing: 500 });
    expect(out).toHaveLength(5);
    expect(out.map(p => [Math.round(p.pos[0]), Math.round(p.pos[1])])).toEqual([[0, 0], [500, 0], [1000, 0], [1000, 500], [1000, 1000]]);
    expect(out.map(p => p.rot)).toEqual([0, 0, 0, 90, 90]);        // y는 남쪽이라 아래로 가면 +90°
  });

  test('follow가 false면 원본 회전을 그대로 쓴다(90° 스냅 없음)', () => {
    const plain = pathPlacements(it0(), [[0, 0], [1000, 1000]], { spacing: 500, follow: false });
    expect(plain.every(p => p.rot === 30)).toBe(true);
    const turned = pathPlacements(it0(), [[0, 0], [1000, 1000]], { spacing: 500 });
    expect(turned[0].rot).toBeCloseTo(45, 9);                     // 45°가 90°로 붙지 않는다
  });

  test('점이 2개 미만·같은 점·간격 0이면 아무것도 내지 않는다', () => {
    expect(pathPlacements(it0(), [[0, 0]], { spacing: 500 })).toEqual([]);
    expect(pathPlacements(it0(), [], { spacing: 500 })).toEqual([]);
    expect(pathPlacements(it0(), null, { spacing: 500 })).toEqual([]);
    expect(pathPlacements(it0(), [[10, 10], [10, 10]], { spacing: 500 })).toEqual([]);
    expect(pathPlacements(it0(), [[0, 0], [1000, 0]], { spacing: 0 })).toEqual([]);
    // 간격의 부호는 무시한다: |−5| = 5 mm 간격이므로 1000 mm 경로에 floor(1000/5) + 1 = 201개다.
    expect(pathPlacements(it0(), [[0, 0], [1000, 0]], { spacing: -5 })).toHaveLength(201);
  });
});
