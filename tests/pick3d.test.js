import { describe, test, expect } from 'vitest';
import { gizmoPatch, orthoViewParams } from '../src/view3d/pick3d.js';
import { createItem } from '../src/state/schema.js';
import { productById } from '../src/products/catalog.js';

describe('3D 편집 계산', () => {
  test('기즈모 위치·회전을 아이템 필드로 되돌린다(소수 좌표)', () => {
    const it = createItem(productById('sofa-3'), { pos: [0, 0] }); // 높이 800
    const obj = { position: { x: 1.0005, y: 0.4, z: 2.00025 }, rotation: { y: -Math.PI / 2 } };
    const patch = gizmoPatch(obj, it);
    expect(patch.pos[0]).toBeCloseTo(1000.5);
    expect(patch.pos[1]).toBeCloseTo(2000.25);
    expect(patch.z).toBeCloseTo(0);
    expect(patch.rot).toBeCloseTo(90);
  });

  test('위로 올린 기즈모는 바닥으로부터의 높이로 바뀐다', () => {
    const it = createItem(productById('storage-box'), { pos: [0, 0] }); // 높이 400
    const patch = gizmoPatch({ position: { x: 0, y: 0.95, z: 0 }, rotation: { y: 0 } }, it);
    expect(patch.z).toBeCloseTo(750);
    expect(patch.rot).toBe(0);
  });

  test('직교 프리셋 6종의 방향과 up이 다르다', () => {
    const opts = { center: [2000, 1500], extent: 6000, height: 2300, aspect: 2 };
    const front = orthoViewParams('front', opts);
    expect(front.target).toEqual([2, 1.15, 1.5]);
    expect(front.pos[2]).toBeGreaterThan(front.target[2]);
    expect(front.up).toEqual([0, 1, 0]);
    expect(orthoViewParams('back', opts).pos[2]).toBeLessThan(front.target[2]);
    expect(orthoViewParams('left', opts).pos[0]).toBeLessThan(front.target[0]);
    expect(orthoViewParams('right', opts).pos[0]).toBeGreaterThan(front.target[0]);
    const top = orthoViewParams('top', opts);
    expect(top.pos[1]).toBeGreaterThan(top.target[1]);
    expect(top.up).toEqual([0, 0, -1]);
    expect(orthoViewParams('bottom', opts).pos[1]).toBeLessThan(top.target[1]);
    expect(orthoViewParams('bottom', opts).up).toEqual([0, 0, 1]);
  });

  test('직교 프레임은 도면 크기와 화면 비율을 따른다', () => {
    const a = orthoViewParams('front', { center: [0, 0], extent: 6000, height: 2300, aspect: 2 });
    const b = orthoViewParams('front', { center: [0, 0], extent: 12000, height: 2300, aspect: 2 });
    expect(b.halfH).toBeGreaterThan(a.halfH);
    expect(a.halfW / a.halfH).toBeCloseTo(2);
    const small = orthoViewParams('front', { center: [0, 0], extent: 100, height: 2300, aspect: 1 });
    expect(small.halfH).toBeGreaterThan(1); // 아주 작은 도면도 최소 크기를 갖는다
  });

  test('모르는 이름은 정면으로 떨어진다', () => {
    const p = orthoViewParams('없음', { center: [0, 0], extent: 6000, height: 2300, aspect: 1 });
    expect(p.pos[2]).toBeGreaterThan(0);
    expect(p.up).toEqual([0, 1, 0]);
  });
});
