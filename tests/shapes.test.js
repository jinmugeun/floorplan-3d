// 계획 17 Task 5: 스테인리스 형상 18종(src/view3d/shapes/) — 바운딩 박스 규약 · 병합 · 공유 · 크기 가드 · 공유 재질.
import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { FAMILY, SHAPE_FAMILIES, shapeParts, buildShape, shapeSpecFor, fitSpec, GENERIC_ID } from '../src/view3d/shapes/index.js';
import { cachedShape, shapeKey, clearShapeCache, shapeCacheSize, SHAPE_CACHE_LIMIT, mergeParts, boxProjectUv } from '../src/view3d/shapes/merge.js';
import { shapeMaterial, tintedSteel, SHAPE_MATERIALS, STEEL_BASE, STEEL_TINT, __resetShapeMaterials } from '../src/view3d/shapes/materials.js';
import { setEnvMap, envMapNow } from '../src/view3d/itemAssets.js';

const SIZES = { small: [450, 400, 300], mid: [1200, 750, 850], big: [2400, 1100, 1950], thin: [1600, 15, 605], low: [900, 700, 150] };
const OPTS = {
  range: [{ burners: 1 }, { burners: 3 }, { burners: 6, gas: false }], sink: [{ bowls: 1 }, { bowls: 3, deep: true }],
  cabinet: [{ doors: 1 }, { doors: 4, glass: true, panel: true, casters: true }], ricecooker: [{ tiers: 2 }, { tiers: 4 }],
  rack: [{ tiers: 2 }, { tiers: 6, casters: true }], counter: [{ wells: 1 }, { wells: 5 }], kettle: [{}, { tilt: true }, { square: true }],
  griddle: [{}, { hooded: true }], dishwasher: [{}, { conveyor: true }], table: [{}, { stools: true }],
  worktable: [{}, { splash: true }, { splash: true, cabinet: true }], cart: [{}, { round: true }], machine: [{}, { round: true }],
};
const bboxOf = list => { const b = new THREE.Box3(); for (const p of list) { p.geo.computeBoundingBox(); b.union(p.geo.boundingBox); } return b; };
const item = (size, patch = {}) => ({ id: 'i1', kind: 'product', productId: 'k-1', name: '시험', size, color: '#cfd4da', ...patch });

describe('형상 18종 — 바운딩 박스 규약(부품이 item.size 밖으로 나가지 않는다)', () => {
  test('계열 목록', () => {
    expect(SHAPE_FAMILIES).toHaveLength(18);
    expect(Object.keys(FAMILY).sort()).toEqual([...SHAPE_FAMILIES].sort());
  });
  const cases = [];
  for (const shape of SHAPE_FAMILIES) for (const [sk, size] of Object.entries(SIZES)) for (const o of OPTS[shape] ?? [{}]) cases.push([shape, sk, o, size]);
  test.each(cases)('%s · %s · %j', (shape, sk, o, size) => {
    const spec = fitSpec({ shape, opts: o }, size);
    const b = bboxOf(shapeParts(spec.shape, spec.opts, size));
    const [hw, hd, hh] = size.map(v => v / 2000), e = 1e-6;
    expect([b.min.x, b.min.y, b.min.z].every(Number.isFinite)).toBe(true);
    expect(b.min.x).toBeGreaterThanOrEqual(-hw - e); expect(b.max.x).toBeLessThanOrEqual(hw + e);
    expect(b.min.y).toBeGreaterThanOrEqual(-hh - e); expect(b.max.y).toBeLessThanOrEqual(hh + e);
    expect(b.min.z).toBeGreaterThanOrEqual(-hd - e); expect(b.max.z).toBeLessThanOrEqual(hd + e);
  });
  test('아이템당 메시 ≤ 4 · 삼각형 ≤ 1,500(병합 뒤)', () => {
    for (const shape of SHAPE_FAMILIES) for (const o of OPTS[shape] ?? [{}]) {
      const g = buildShape({ shape, opts: o }, item(SIZES.big), null);
      expect(g.children.length).toBeLessThanOrEqual(4);
      const tris = g.children.reduce((a, m) => a + m.geometry.index.count / 3, 0);
      expect(tris).toBeLessThanOrEqual(1500);
    }
  });
  test('후드 갓의 앞면 법선은 바깥(+z)을 본다', () => {
    const frustum = shapeParts('hood', {}, SIZES.mid).find(p => !p.geo.parameters).geo;
    expect(frustum.attributes.normal.getZ(0)).toBeGreaterThan(0.5);
  });
});

describe('크기 가드(fitSpec)', () => {
  test('아주 얇으면 판 · 아주 낮으면 받침 · 나머지는 그대로', () => {
    expect(fitSpec({ shape: 'cabinet', opts: { doors: 2 } }, [1600, 15, 605])).toEqual({ shape: 'panel', opts: {} });
    expect(fitSpec({ shape: 'rack', opts: { tiers: 4 } }, [900, 700, 150])).toEqual({ shape: 'worktable', opts: {} });
    expect(fitSpec({ shape: 'worktable', opts: {} }, [900, 700, 150])).toEqual({ shape: 'worktable', opts: {} });
    expect(fitSpec({ shape: 'sink', opts: { bowls: 2 } }, [1500, 750, 850])).toEqual({ shape: 'sink', opts: { bowls: 2 } });
    expect(fitSpec(null, [1, 1, 1])).toBeNull();
  });
});

describe('형상 고르기(shapeSpecFor)', () => {
  test('엑셀 제품은 제품의 shape · 도면 기구는 이름 · 나머지는 옛 형상(null)', () => {
    expect(shapeSpecFor(item([1500, 750, 850]), { id: 'k-1', shape: 'sink', shapeOpts: { bowls: 2 } })).toEqual({ shape: 'sink', opts: { bowls: 2 } });
    expect(shapeSpecFor(item([1500, 750, 850], { productId: GENERIC_ID, name: '세정대 2조 1500-750' }), { id: GENERIC_ID })).toEqual({ shape: 'sink', opts: { bowls: 2 } });
    expect(shapeSpecFor(item([900, 600, 850], { productId: 'sofa-3' }), { id: 'sofa-3' })).toBeNull();
    for (const kind of ['door', 'window', 'column', 'opening']) expect(shapeSpecFor(item([900, 40, 2100], { kind }), { id: 'x', shape: 'panel' })).toBeNull();
    expect(shapeSpecFor(item([900, 600, 850]), { id: 'k-1', shape: '없는형상' })).toBeNull();
  });
});

describe('세우기(buildShape)', () => {
  test('재질별 메시 · 공유 표시 · 충돌 상자 크기', () => {
    const g = buildShape({ shape: 'cabinet', opts: { doors: 2, glass: true } }, item([1260, 800, 1910]), { color: '#cfd4da' });
    expect(g.children.map(m => m.name).sort()).toEqual(['shape-accent', 'shape-dark', 'shape-glass', 'shape-steel']);
    expect(g.children.every(m => m.userData.shared && m.castShadow && m.receiveShadow)).toBe(true);
    expect(g.userData.assetSize).toEqual([1260, 800, 1910]);
    expect(g.userData.shape).toBe('cabinet');
  });
  test('같은 형상·옵션·크기는 지오메트리를 나눠 쓰고 크기가 다르면 따로', () => {
    const a = buildShape({ shape: 'sink', opts: { bowls: 2 } }, item([1500, 750, 850]), null);
    const b = buildShape({ shape: 'sink', opts: { bowls: 2 } }, item([1500, 750, 850]), null);
    const c = buildShape({ shape: 'sink', opts: { bowls: 2 } }, item([1800, 750, 850]), null);
    expect(a.children[0].geometry).toBe(b.children[0].geometry);
    expect(a.children[0].geometry).not.toBe(c.children[0].geometry);
  });
  test('사용자가 색을 바꾼 아이템만 아이템 전용 스테인리스', () => {
    const steelOf = g => g.children.find(m => m.name === 'shape-steel').material;
    expect(steelOf(buildShape({ shape: 'worktable', opts: {} }, item([1200, 750, 850]), { color: '#cfd4da' }))).toBe(shapeMaterial('steel'));
    expect(steelOf(buildShape({ shape: 'worktable', opts: {} }, item([1200, 750, 850], { color: '#c6ccd2' }), { color: '#c6ccd2' }))).toBe(shapeMaterial('steel'));
    const own = steelOf(buildShape({ shape: 'worktable', opts: {} }, item([1200, 750, 850], { color: '#ff0000' }), { color: '#cfd4da' }));
    expect(own).not.toBe(shapeMaterial('steel'));
    expect(own.color.getHexString()).toBe('ff0000');
    expect(own.userData.perMesh).toBe(true);
  });
});

describe('병합·캐시(merge.js)', () => {
  test('재질별로 하나씩 합친다', () => {
    const m = mergeParts(shapeParts('oven', {}, [1140, 1150, 1500]));
    expect([...m.keys()].sort()).toEqual(['accent', 'dark', 'glass', 'steel']);
    for (const g of m.values()) expect(g.boundingBox).not.toBeNull();
  });
  test('상자 투영 uv: 세로면은 수평 거리, 윗면은 x·z(미터)', () => {
    const g = boxProjectUv(new THREE.BoxGeometry(2, 1, 0.5).translate(3, 0, 0));
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(nor.getY(i)) > 0.9) { expect(uv.getX(i)).toBeCloseTo(pos.getX(i)); expect(uv.getY(i)).toBeCloseTo(pos.getZ(i)); }
      else if (Math.abs(nor.getZ(i)) > 0.9) { expect(uv.getX(i)).toBeCloseTo(pos.getX(i)); expect(uv.getY(i)).toBeCloseTo(pos.getY(i)); }
    }
  });
  test('키 규칙과 LRU 상한', () => {
    expect(shapeKey('sink', { bowls: 2 }, [1500.4, 750, 850])).toBe('sink|{"bowls":2}|1500x750x850');
    clearShapeCache();
    let built = 0;
    const list = () => { built++; return shapeParts('panel', {}, [600, 530, 30]); };
    cachedShape('k1', list); cachedShape('k1', list);
    expect(built).toBe(1);
    for (let i = 0; i < SHAPE_CACHE_LIMIT + 5; i++) cachedShape(`n${i}`, () => shapeParts('panel', {}, [600, 530, 30]));
    expect(shapeCacheSize()).toBe(SHAPE_CACHE_LIMIT);
    clearShapeCache();
    expect(shapeCacheSize()).toBe(0);
  });
});

describe('공유 재질(materials.js)', () => {
  test('이름마다 한 개 · 공유(perMesh 없음) · 스테인리스 양면 · 유리 반투명', () => {
    expect(SHAPE_MATERIALS).toEqual(['steel', 'dark', 'glass', 'accent', 'food', 'greens']);
    for (const n of SHAPE_MATERIALS) { expect(shapeMaterial(n)).toBe(shapeMaterial(n)); expect(shapeMaterial(n).userData.perMesh).toBeUndefined(); }
    expect(shapeMaterial('steel').side).toBe(THREE.DoubleSide);
    expect(shapeMaterial('glass').transparent).toBe(true);
    expect(shapeMaterial('없음')).toBe(shapeMaterial('steel'));
  });
  test('node에서는 텍스처 없이 바탕색 · 복제는 아이템 전용', () => {
    expect(shapeMaterial('steel').map).toBeNull();
    expect(`#${shapeMaterial('steel').color.getHexString()}`).toBe(STEEL_BASE);
    const t = tintedSteel('#00ff00');
    expect(t).not.toBe(shapeMaterial('steel'));
    expect(t.userData.perMesh).toBe(true);
  });
  // 계획 17 Task 5 리뷰: 환경 맵 배선(itemAssets.setEnvMap → onEnvMap 구독자 → applyEnv · 처음 만들 때 envMapNow)이 지워져도 잡는다.
  const METAL = ['steel', 'dark', 'glass', 'accent'];
  test('환경 맵: 이미 만든 금속 재질 4종에 setEnvMap이 걸고 null이면 뗀다(음식·채소는 안 건다)', () => {
    const tex = { isTexture: true, dispose() {} };
    __resetShapeMaterials(); setEnvMap(null);
    try {
      expect(shapeMaterial('steel').envMap).toBeNull();          // 환경 맵 없이 먼저 만든다
      setEnvMap(tex);
      for (const n of METAL) expect(shapeMaterial(n).envMap).toBe(tex);
      for (const n of ['food', 'greens']) expect(shapeMaterial(n).envMap).toBeNull();
      setEnvMap(null);
      for (const n of METAL) expect(shapeMaterial(n).envMap).toBeNull();
    } finally { setEnvMap(null); __resetShapeMaterials(); }
  });
  test('환경 맵: setEnvMap 뒤에 처음 만든 재질도 envMapNow로 받는다', () => {
    const tex = { isTexture: true, dispose() {} };
    __resetShapeMaterials(); setEnvMap(tex);
    try {
      expect(envMapNow()).toBe(tex);
      for (const n of METAL) expect(shapeMaterial(n).envMap).toBe(tex);
    } finally { setEnvMap(null); __resetShapeMaterials(); }
  });
  // 공유 스테인리스는 어두운 헤어라인 텍스처에 STEEL_TINT(≈1.3)를 곱해 밝기를 맞춘다 — 색 바꾼 복제도 같은 보정을 곱해야 고른 색보다 어둡지 않다.
  test('색 바꾼 스테인리스: 텍스처가 붙으면 고른 색 × STEEL_TINT, 없으면 고른 색 그대로', () => {
    const s = shapeMaterial('steel'), want = new THREE.Color('#808080');
    expect(s.map).toBeNull();
    expect(tintedSteel('#808080').color.getHexString()).toBe('808080');
    const fakeMap = { isTexture: true };
    s.map = fakeMap;
    try {
      const lit = tintedSteel('#808080');
      expect(lit.map).toBe(fakeMap);
      expect(lit.color.r).toBeCloseTo(want.r * STEEL_TINT[0], 6);
      expect(lit.color.g).toBeCloseTo(want.g * STEEL_TINT[1], 6);
      expect(lit.color.b).toBeCloseTo(want.b * STEEL_TINT[2], 6);
      expect(lit.userData.perMesh).toBe(true);
    } finally { s.map = null; }
  });
});
