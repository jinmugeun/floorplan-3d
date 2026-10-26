// 계획 17 Task 5: 스테인리스 형상 18종(src/view3d/shapes/) — 바운딩 박스 규약 · 병합 · 공유 · 크기 가드 · 공유 재질.
// 2026-10-26: 19번째 형상 enclosure(공기질 함체 — 둥근 판 plate 부품).
import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { FAMILY, SHAPE_FAMILIES, shapeParts, buildShape, shapeSpecFor, fitSpec, GENERIC_ID } from '../src/view3d/shapes/index.js';
import { cachedShape, shapeKey, clearShapeCache, shapeCacheSize, SHAPE_CACHE_LIMIT, mergeParts, boxProjectUv } from '../src/view3d/shapes/merge.js';
import { shapeMaterial, tintedSteel, SHAPE_MATERIALS, STEEL_BASE, STEEL_TINT, __resetShapeMaterials } from '../src/view3d/shapes/materials.js';
import { createParts } from '../src/view3d/shapes/parts.js';
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

describe('형상 19종 — 바운딩 박스 규약(부품이 item.size 밖으로 나가지 않는다)', () => {
  test('계열 목록', () => {
    expect(SHAPE_FAMILIES).toHaveLength(19);
    expect(SHAPE_FAMILIES.at(-1)).toBe('enclosure');
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
    expect(fitSpec({ shape: 'enclosure', opts: {} }, [510, 217, 250])).toEqual({ shape: 'enclosure', opts: {} });   // 기본 310에서 조금 줄여도 함체 그대로
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

describe('둥근 판(parts.plate)', () => {
  test('삼각형 12·(seg + 1) · 바깥 면 법선이 face 쪽 · 크기 그대로', () => {
    const P = createParts([1, 1, 1]);
    const g = P.plate('dark', [0.4, 0.13], 0.018, 0.002, [0, 0.1, 0.3]);
    expect(g.index.count / 3).toBe(48);
    expect([g.attributes.normal.getX(0), g.attributes.normal.getY(0), g.attributes.normal.getZ(0)]).toEqual([0, 0, 1]);
    g.computeBoundingBox();
    expect(g.boundingBox.max.x - g.boundingBox.min.x).toBeCloseTo(0.4, 6);
    expect(g.boundingBox.max.y - g.boundingBox.min.y).toBeCloseTo(0.13, 6);
    expect(g.boundingBox.max.z).toBeCloseTo(0.301, 6);
    for (const [face, nx] of [['+x', 1], ['-x', -1]]) {
      const q = P.plate('paint', [0.07, 0.072], 0.012, 0.004, [0, 0, 0], { face });
      expect(q.attributes.normal.getX(0), face).toBeCloseTo(nx, 6);
      q.computeBoundingBox();
      expect(q.boundingBox.max.z - q.boundingBox.min.z, face).toBeCloseTo(0.07, 6);   // 옆을 보는 판은 a가 깊이
    }
    const sq = P.plate('dark', [0.1, 0.1], 0, 0.01, [0, 0, 0]);   // 반경 0이면 네모 판(모서리 점 하나씩)
    expect(sq.index.count / 3).toBe(12);
  });
  // 리뷰: 법선을 꼭짓점 하나로만 보면 감김이 뒤집혀도(면이 컬링돼 사라져도) 지나간다 — 삼각형마다 변의 외적이 저장된 법선과 같은 쪽인지 본다.
  const flipped = g => {
    const p = g.attributes.position, nr = g.attributes.normal, ix = g.index.array, v = i => new THREE.Vector3().fromBufferAttribute(p, i);
    let bad = 0;
    for (let k = 0; k < ix.length; k += 3) {
      const [a, b, c] = [ix[k], ix[k + 1], ix[k + 2]], n = new THREE.Vector3().crossVectors(v(b).sub(v(a)), v(c).sub(v(a)));
      if (n.lengthSq() < 1e-18) continue;                                   // 넓이 0(겹친 점)은 그려지지 않는다
      if (n.dot(new THREE.Vector3().fromBufferAttribute(nr, a)) <= 0) bad++;
    }
    return bad;
  };
  test('감김과 법선이 맞다(+z · ±x · 깎음 있음/없음 · 반경 0) · 큰 깎음에도 바깥 면이 뒤집히지 않는다 · 두께 0도 법선이 있다', () => {
    const P = createParts([1, 1, 1]);
    for (const face of ['+z', '+x', '-x']) for (const taper of [0, 0.005]) for (const r of [0, 0.012]) {
      expect(flipped(P.plate('steel', [0.075, 0.076], r, 0.004, [0.1, 0.2, 0.3], { face, taper })), `${face} ${taper} ${r}`).toBe(0);
    }
    expect(flipped(P.plate('steel', [0.075, 0.076], 0.012, 0.004, [0, 0, 0], { taper: 0.0375 - 2e-5 }))).toBe(0);
    const flat = P.plate('dark', [0.1, 0.05], 0.01, 0, [0, 0, 0]);
    const nr = flat.attributes.normal;
    for (let i = 0; i < nr.count; i++) expect(Math.hypot(nr.getX(i), nr.getY(i), nr.getZ(i)), String(i)).toBeCloseTo(1, 6);
  });
});

describe('공기질 함체(enclosure)', () => {
  const parts = (size = [510, 217, 310]) => shapeParts('enclosure', {}, size);
  const windowOf = list => list.find(p => p.mat === 'dark' && !p.geo.parameters);   // 앞창(둥근 판) — 어두운 재질의 첫 둥근 판
  test('몸체 두 쪽 + 이음매 · 관측창 · 옆 덮개 8 · 경첩 2 · 잠금쇠 — 재질은 스테인리스·어두움·밝은 금속 셋(외형도 DXF 자리)', () => {
    const list = parts();
    expect([...new Set(list.map(p => p.mat))].sort()).toEqual(['accent', 'dark', 'steel']);
    const bossesOn = sign => list.filter(p => p.mat === 'steel' && !p.geo.parameters && Math.sign(p.geo.attributes.normal.getX(0)) === sign);
    expect(bossesOn(1)).toHaveLength(4);
    expect(bossesOn(-1)).toHaveLength(4);
    const boss = bossesOn(1)[0].geo; boss.computeBoundingBox();
    expect((boss.boundingBox.max.z - boss.boundingBox.min.z) * 1000).toBeCloseTo(75, 3);   // 덮개 75 × 76(SIDE_R)
    expect((boss.boundingBox.max.y - boss.boundingBox.min.y) * 1000).toBeCloseTo(76, 3);
    const win = windowOf(list);
    win.geo.computeBoundingBox();
    const bb = win.geo.boundingBox;
    expect((bb.max.x - bb.min.x) * 1000).toBeCloseTo(410, 3);
    expect((bb.max.y - bb.min.y) * 1000).toBeCloseTo(130, 3);
    expect(((bb.max.y + bb.min.y) / 2) * 1000).toBeCloseTo(40, 3);       // 창은 위로 40 mm(외형도 AQ_BOX_FRONT y 130…260)
    expect(bb.max.z).toBeCloseTo(0.217 / 2, 6);                          // 앞면에 붙는다(+z)
  });
  // 리뷰: 경첩·잠금쇠·덮개·슬롯이 옆을 바꾸거나 뒤쪽으로 가도 잡는다(외형도 SIDE_R · SIDE_L · BOTTOM).
  test('경첩은 +x(y ±87) · 잠금쇠는 −x · 덮개는 옆마다 앞쪽(z +63) 셋 + 뒤쪽(z −63) 하나 · 슬롯 20은 바닥 앞쪽(z +54)', () => {
    const list = parts(), mm = v => Math.round(v * 10000) / 10;
    const centre = g => { g.computeBoundingBox(); return g.boundingBox.getCenter(new THREE.Vector3()); };
    const accent = list.filter(p => p.mat === 'accent').map(p => centre(p.geo));
    const hinges = accent.filter(c => c.x > 0), latch = accent.filter(c => c.x < 0);
    expect(hinges).toHaveLength(4);                                       // 날개 + 축 × 2
    expect([...new Set(hinges.map(c => mm(c.y)))].sort((a, b) => a - b)).toEqual([-87, 87]);
    expect(hinges.every(c => Math.abs(c.z) < 1e-9)).toBe(true);           // 이음매(z 0)를 걸친다
    expect(latch.map(c => mm(c.z)).sort((a, b) => a - b)).toEqual([-31.8, -28, 10.3]);   // 받침 · 손잡이 · 걸이
    for (const side of [1, -1]) {
      const covers = list.filter(p => p.mat === 'steel' && !p.geo.parameters && Math.sign(p.geo.attributes.normal.getX(0)) === side).map(p => centre(p.geo));
      expect(covers.map(c => [mm(c.z), mm(c.y)]).sort((a, b) => b[0] - a[0] || b[1] - a[1]), String(side)).toEqual([[63, 97], [63, 0], [63, -97], [-63, 97]]);
    }
    const slots = list.filter(p => p.mat === 'dark' && p.geo.parameters?.width && Math.abs(p.geo.parameters.depth - 0.067) < 1e-9).map(p => centre(p.geo));
    expect(slots).toHaveLength(20);
    expect(slots.every(c => mm(c.z) === 54 && c.y < -0.15)).toBe(true);
    expect(slots.map(c => mm(c.x)).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => -190 + i * 20));
  });
  test('크기를 바꾸면 자리가 비율로 늘어난다(창 폭 = 410/510 × w)', () => {
    const win = windowOf(parts([1020, 217, 310]));
    win.geo.computeBoundingBox();
    expect((win.geo.boundingBox.max.x - win.geo.boundingBox.min.x) * 1000).toBeCloseTo(820, 3);
  });
  test('세우면 메시 셋(공유 재질) · 색을 바꾸면 스테인리스만 아이템 전용', () => {
    const g = buildShape({ shape: 'enclosure', opts: {} }, item([510, 217, 310]), { color: '#cfd4da' });
    expect(g.children.map(m => m.name).sort()).toEqual(['shape-accent', 'shape-dark', 'shape-steel']);
    expect(g.children.find(m => m.name === 'shape-steel').material).toBe(shapeMaterial('steel'));
    const own = buildShape({ shape: 'enclosure', opts: {} }, item([510, 217, 310], { color: '#ff0000' }), { color: '#cfd4da' });
    expect(own.children.find(m => m.name === 'shape-steel').material.userData.perMesh).toBe(true);
  });
});
