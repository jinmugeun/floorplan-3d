// 계획 19 Task 3: 줄눈 규칙(onBeforeCompile + customProgramCacheKey + uniform) · 금속 타일(metalness · metalnessMap)과 재사용 재질 초기화 · 셰이더 예열 변형.
// node 환경 — 사진 도착은 가짜 document + TextureLoader.loadAsync 대역(4×4 Texture). 셰이더는 컴파일하지 않고 onBeforeCompile이 고친 글만 본다.
import { describe, test, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { materialById } from '../src/materials/catalog.js';
import { applyAssignment, photoTextures, withWarmPhotos, __resetPhotos } from '../src/materials/texture.js';
import { GROUT_KEY, GROUT_MAP_FRAGMENT, groutLinear, groutUniform, groutPatch } from '../src/materials/grout.js';
import { buildFloorGroup } from '../src/view3d/build.js';
import { warmGroup, WARM_TILES } from '../src/view3d/shaderWarm.js';
import { rectWalls } from '../src/geom/walls.js';
import { detectRooms } from '../src/geom/rooms.js';

const assign = (id, patch = {}) => ({ id, offset: [0, 0], angle: 0, ...patch });
const flush = () => new Promise(r => setTimeout(r, 0));
async function arrive(...ids) {
  vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation(() => Promise.resolve(new THREE.Texture({ width: 4, height: 4 })));
  globalThis.document = {};
  for (const id of ids) photoTextures(materialById(id));
  await flush();
}
const painted = (id, m = new THREE.MeshStandardMaterial()) => applyAssignment(m, assign(id), null, { worldUv: true, kind: 'wall' });
// three r169가 컴파일 직전에 넘기는 셰이더 객체를 흉내 낸다(MeshStandardMaterial = ShaderLib.physical)
const compiled = m => { const sh = { uniforms: {}, fragmentShader: THREE.ShaderLib.physical.fragmentShader, vertexShader: THREE.ShaderLib.physical.vertexShader }; m.onBeforeCompile(sh, null); return sh; };
const isDefault = m => !Object.hasOwn(m, 'onBeforeCompile') && !Object.hasOwn(m, 'customProgramCacheKey');
afterEach(() => { delete globalThis.document; vi.restoreAllMocks(); __resetPhotos(); });

describe('줄눈 규칙(materials/grout.js)', () => {
  test('타일 재질은 줄눈 프로그램 키를 갖고, map_fragment를 mix(groutColor, tint, 면 마스크)로 바꾼다', async () => {
    await arrive('tile-black-25');
    const m = painted('tile-black-25');
    expect(m.customProgramCacheKey()).toBe(GROUT_KEY);
    const sh = compiled(m);
    expect(sh.fragmentShader).toContain('uniform vec3 groutColor;\nvoid main() {');
    expect(sh.fragmentShader).toContain('diffuseColor.rgb = mix( groutColor, diffuseColor.rgb, tileFace ) * sampledDiffuseColor.rgb;');
    expect(sh.fragmentShader).not.toContain('#include <map_fragment>');
    expect(sh.fragmentShader).toContain('#include <roughnessmap_fragment>');      // 다른 청크는 그대로
    expect(sh.vertexShader).toBe(THREE.ShaderLib.physical.vertexShader);
    expect(sh.uniforms.groutColor).toBe(groutUniform(m));
    const [r, g, b] = sh.uniforms.groutColor.value.toArray();
    expect([r, g, b].map(v => +v.toFixed(4))).toEqual([0.823, 0.797, 0.7383]);   // lin(#d4d1ca) ÷ 0.80 — 시안 groutTint
    expect(GROUT_MAP_FRAGMENT).toContain('texture2D( roughnessMap, vRoughnessMapUv ).r');
  });

  test('줄눈색은 카탈로그 grout(sRGB)를 따르고 없으면 #d4d1ca — 같은 재질에 다시 걸면 같은 uniform 객체의 값만 바뀐다', () => {
    const m = new THREE.MeshStandardMaterial();
    groutPatch(m, '#ffffff');
    const u = groutUniform(m);
    expect(u.value.toArray().map(v => +v.toFixed(4))).toEqual([1.25, 1.25, 1.25]);
    groutPatch(m, undefined);
    expect(groutUniform(m)).toBe(u);
    expect(u.value.equals(groutLinear('#d4d1ca'))).toBe(true);
  });

  test('타일이 아닌 사진 재질(MMA)·무늬 재질·화이트 단색 모드는 줄눈 패치를 걸지 않는다(three 기본 onBeforeCompile·키)', async () => {
    expect(isDefault(painted('brick-red'))).toBe(true);                            // 무늬 갈래(document 없음 — 바탕색)
    await arrive('mma-gray', 'tile-white-300');
    expect(isDefault(painted('mma-gray'))).toBe(true);
    const white = new THREE.MeshStandardMaterial();
    applyAssignment(white, assign('tile-white-300'), null, { worldUv: true, kind: 'wall', display: 'white' });
    expect(isDefault(white)).toBe(true);
    const before = new THREE.MeshStandardMaterial();
    applyAssignment(before, assign('tile-mint-25'), null, { worldUv: true, kind: 'wall' });   // 사진 도착 전: base만 칠하고 패치도 없다
    expect(isDefault(before)).toBe(true);
    expect(before.map).toBeNull();
  });
});

describe('금속 타일 · 재사용 재질 초기화', () => {
  test('메탈: metalness 1 · metalnessMap = 거칠기 지도(같은 공유 복제본) · 거칠기 1.6 · 엠보는 법선만 다르다', async () => {
    await arrive('tile-metal-48', 'tile-metal-emboss-48', 'tile-white-matte-48');
    const metal = painted('tile-metal-48'), emboss = painted('tile-metal-emboss-48'), matte = painted('tile-white-matte-48');
    expect(metal.metalness).toBe(1);
    expect(metal.metalnessMap).toBe(metal.roughnessMap);
    expect(metal.roughness).toBe(1.6);
    expect(emboss.metalnessMap).toBe(emboss.roughnessMap);
    expect(emboss.normalMap).not.toBe(metal.normalMap);                             // tile-sq48-emboss 법선
    expect(emboss.roughnessMap.source).toBe(metal.roughnessMap.source);              // 색·거칠기는 sq48 공용(URL마다 한 번 — 묶음 키가 달라 복제본만 따로)
    expect([matte.metalness, matte.metalnessMap, matte.roughness]).toEqual([0, null, 5.5]);
  });

  test('재사용 재질: 메탈 타일 → 다른 재질이면 metalness 0 · metalnessMap null · 줄눈 패치 없음으로 돌아간다', async () => {
    await arrive('tile-metal-48', 'mma-gray');
    const m = painted('tile-metal-48');
    expect(m.customProgramCacheKey()).toBe(GROUT_KEY);
    painted('mma-gray', m);
    expect([m.metalness, m.metalnessMap]).toEqual([0, null]);
    expect(isDefault(m)).toBe(true);
    expect(groutUniform(m)).toBeNull();
    painted('tile-metal-48', m);
    applyAssignment(m, null, null, { worldUv: true });                               // 지정 없음도 같다
    expect([m.metalness, m.metalnessMap, m.map]).toEqual([0, null, null]);
    expect(isDefault(m)).toBe(true);
  });

  test('build.js: 금속 타일 벽은 환경 반사 0.9 · 벽 본체·안쪽 면·영역 모두 줄눈 키(부호 +1)', async () => {
    await arrive('tile-metal-48');
    const walls = rectWalls([0, 0], [4000, 3000], 200).map(w => ({ ...w, matIn: assign('tile-metal-48'), matOut: assign('tile-metal-48') }));
    walls[0].regions = { in: [{ id: 'rg', kind: 'band', u0: 0, u1: 4000, z0: 0, z1: 1200, mat: assign('tile-metal-48') }], out: [] };
    const g = buildFloorGroup({ walls, rooms: detectRooms(walls), height: 2300 }, { wallOpacity: 1 });
    for (const name of ['wall', 'wallFace', 'wallRegion']) {
      const mats = g.children.filter(c => c.name === name).map(c => c.material);
      expect(mats.length, name).toBeGreaterThan(0);
      for (const m of mats) expect([name, m.customProgramCacheKey(), m.metalness, m.envMapIntensity, m.normalScale.x]).toEqual([name, GROUT_KEY, 1, 0.9, 1]);
    }
  });
});

describe('셰이더 예열(shaderWarm)', () => {
  test('예열 층은 타일 변형 네 가지(줄눈 키 × 금속 × 벽 본체 FrontSide · 안쪽 면 DoubleSide)를 갖고, 지정 없는 벽도 남긴다', () => {
    expect(WARM_TILES).toEqual(['tile-white-300', 'tile-metal-48']);
    const g = warmGroup({});
    const kinds = new Set(), plain = new Set();
    g.traverse(o => {
      if (!o.material || !['wall', 'wallFace'].includes(o.name)) return;
      if (o.material.customProgramCacheKey() === GROUT_KEY) {
        expect(!!(o.material.map && o.material.normalMap && o.material.roughnessMap), o.name).toBe(true);
        kinds.add(`${o.name}|${o.material.side}|${o.material.metalnessMap ? '금속' : '타일'}`);
      } else plain.add(o.name);
    });
    expect(kinds).toEqual(new Set(['wall|0|금속', 'wall|0|타일', 'wallFace|2|금속', 'wallFace|2|타일']));   // side 0 = FrontSide · 2 = DoubleSide
    expect(plain).toEqual(new Set(['wall', 'wallFace']));
  });

  test('withWarmPhotos는 사진을 받지 않고(document가 있어도), 끝나면 평소대로 받는다', () => {
    const spy = vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation(() => new Promise(() => {}));
    globalThis.document = {};
    const warm = withWarmPhotos(() => painted('tile-metal-48'));
    expect(spy).not.toHaveBeenCalled();
    expect(warm.customProgramCacheKey()).toBe(GROUT_KEY);
    expect(warm.metalnessMap).toBe(warm.roughnessMap);
    const real = painted('tile-metal-48');                                           // 예열 뒤: 받기 시작 · 도착 전이라 base만
    expect(spy).toHaveBeenCalledTimes(3);
    expect(real.map).toBeNull();
    expect(real.color.getHexString()).toBe('dfe3e6');
  });
});
