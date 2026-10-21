// 계획 18 Task 3: 사진 갈래의 재질 값(tint · roughness · normalScale) · 면 종류별 뒷면 부호 · 사진 없는 tint(MF) · build.js 광택 거칠기.
// node 환경 — 사진 도착은 가짜 document + TextureLoader.loadAsync 대역(4×4 Texture)으로 만든다(tests/photoMaterial.test.js와 같다).
import { describe, test, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { materialById } from '../src/materials/catalog.js';
import { photoTextures, applyAssignment, normalSign, BACK_FACING_KINDS, PHOTO_TINT, __resetPhotos } from '../src/materials/texture.js';
import { buildFloorGroup } from '../src/view3d/build.js';
import { rectWalls } from '../src/geom/walls.js';
import { detectRooms } from '../src/geom/rooms.js';

const assign = (id, patch = {}) => ({ id, offset: [0, 0], angle: 0, ...patch });
const flush = () => new Promise(r => setTimeout(r, 0));
const rgb = m => [m.color.r, m.color.g, m.color.b];
async function arrive(...ids) {
  vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation(() => Promise.resolve(new THREE.Texture({ width: 4, height: 4 })));
  globalThis.document = {};
  for (const id of ids) photoTextures(materialById(id));
  await flush();
}
const painted = (id, opts) => { const m = new THREE.MeshStandardMaterial(); applyAssignment(m, assign(id), null, { worldUv: true, ...opts }); return m; };
afterEach(() => { delete globalThis.document; vi.restoreAllMocks(); __resetPhotos(); });

describe('뒷면 부호(normalSign)', () => {
  test('바닥·벽 윗면만 −1이고 천장·벽·종류 없음은 +1', () => {
    expect([...BACK_FACING_KINDS].sort()).toEqual(['floor', 'wallTop']);
    expect(['floor', 'wallTop', 'ceiling', 'wall', undefined, null].map(normalSign)).toEqual([-1, -1, 1, 1, 1, 1]);
  });
});

describe('applyPhoto — 재질 값', () => {
  test('MMA: tint 그대로 · 거칠기 1 · 법선 1(바닥 −1 · 천장 +1) · 한 장 1200 mm', async () => {
    await arrive('mma-black');
    const fl = painted('mma-black', { kind: 'floor' }), ce = painted('mma-black', { kind: 'ceiling' });
    expect(rgb(fl)).toEqual([0.6958, 0.6952, 0.7203]);
    expect(fl.roughness).toBe(1);
    expect([fl.normalScale.x, fl.normalScale.y]).toEqual([-1, -1]);
    expect([ce.normalScale.x, ce.normalScale.y]).toEqual([1, 1]);
    expect(fl.map.repeat.x).toBeCloseTo(1000 / 1200, 9);
    expect(fl.normalMap).toBe(ce.normalMap);                              // 부호는 재질 값 — 같은 배치는 같은 공유 복제본
  });

  test('UD200: 거칠기 1 · 법선 1.8(바닥·벽 윗면 −1.8 · 벽 +1.8) · 다섯 색이 맵을 나눠 쓰고 색만 다르다', async () => {
    await arrive('ucrete-ud200-green', 'ucrete-ud200-red');
    const g = painted('ucrete-ud200-green', { kind: 'floor' }), r = painted('ucrete-ud200-red', { kind: 'floor' });
    const top = painted('ucrete-ud200-green', { kind: 'wallTop' }), wall = painted('ucrete-ud200-green', { kind: 'wall' });
    expect([g.normalScale.x, top.normalScale.x, wall.normalScale.x]).toEqual([-1.8, -1.8, 1.8]);
    expect(g.roughness).toBe(1);
    expect(rgb(g)).toEqual([0.1205, 0.2619, 0.0734]);
    expect(rgb(r)).toEqual([0.431, 0.0897, 0.0588]);
    for (const k of ['map', 'normalMap', 'roughnessMap']) expect(r[k]).toBe(g[k]);
    expect(g.map.repeat.x).toBeCloseTo(1, 9);                             // 한 장 1000 mm
  });

  test('그레이 칩 에폭시: PHOTO_TINT · 거칠기 1 · 법선 1(바닥 −1)', async () => {
    await arrive('epoxy-chip-gray');
    const m = painted('epoxy-chip-gray', { kind: 'floor' });
    expect(rgb(m)).toEqual(PHOTO_TINT);
    expect(m.roughness).toBe(1);
    expect(m.normalScale.x).toBe(-1);
  });

  test('재질 값이 없는 사진 재질은 예전 기본값(법선 0.5 · 거칠기 0.9 · PHOTO_TINT)', async () => {
    await arrive('epoxy-chip-gray');
    const e = materialById('epoxy-chip-gray'), saved = { roughness: e.roughness, normalScale: e.normalScale };
    delete e.roughness; delete e.normalScale;
    try {
      const m = painted('epoxy-chip-gray', { kind: 'floor' });
      expect(m.normalScale.x).toBe(-0.5);
      expect(m.roughness).toBe(0.9);
      expect(rgb(m)).toEqual(PHOTO_TINT);
    } finally { Object.assign(e, saved); }
  });

  test('도착 전에는 base(견본 평균 sRGB)만 칠하고 맵을 붙이지 않는다', () => {
    const m = painted('mma-gray', { kind: 'floor' });
    expect(m.map).toBeNull();
    expect(m.color.getHexString()).toBe('bbbdc2');
  });
});

describe('사진 없는 tint(MF)', () => {
  test('무늬 텍스처 없이 tint(선형)를 칠한다', () => {
    const m = painted('ucrete-mf-red', { kind: 'floor', makeCanvas: () => { throw new Error('무늬를 그리면 안 된다'); } });
    expect(m.map).toBeNull();
    expect(rgb(m)).toEqual([0.312, 0.0468, 0.0209]);
  });
  test('화이트 단색 모드는 tint를 칠하지 않는다', () => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff });
    applyAssignment(m, assign('ucrete-mf-red'), null, { worldUv: true, display: 'white', kind: 'floor' });
    expect(m.color.getHex()).toBe(0xffffff);
  });
});

describe('build.js — 면 종류 부호 · 광택 거칠기', () => {
  // floorId = 방 바닥(·천장), wallId = 벽 안·밖(본체·윗면·안쪽 면)
  const floorWith = (floorId, wallId = null, ceiling = false) => {
    const walls = rectWalls([0, 0], [4000, 3000], 200).map(w => (wallId ? { ...w, matIn: assign(wallId), matOut: assign(wallId) } : w));
    return { walls, rooms: detectRooms(walls).map(r => ({ ...r, floorMat: assign(floorId), ceilingMat: ceiling ? assign(floorId) : null })), height: 2300 };
  };
  const ns = (g, name) => [...new Set(g.children.filter(c => c.name === name).map(c => c.material.normalScale.x))];

  test('사진 마감재: 바닥·벽 윗면은 법선 음수, 천장·벽 본체·방 안쪽 면은 양수', async () => {
    await arrive('mma-gray');
    const g = buildFloorGroup(floorWith('mma-gray', 'mma-gray', true), { wallOpacity: 1 });
    expect(ns(g, 'floor')).toEqual([-1]);
    expect(ns(g, 'wallTop')).toEqual([-1]);
    expect(ns(g, 'ceiling')).toEqual([1]);
    expect(ns(g, 'wall')).toEqual([1]);
    expect(ns(g, 'wallFace')).toEqual([1]);
    expect(g.children.find(c => c.name === 'floor').material.side).toBe(THREE.DoubleSide);
    expect(g.children.find(c => c.name === 'ceiling').material.side).toBe(THREE.FrontSide);
  });

  // 리뷰 Fix 1(까닭은 최종 리뷰 I-1에서 정정): three r169는 transparent·DoubleSide·!forceSinglePass 재질을 BackSide → FrontSide 두 번 그린다(WebGLRenderer.renderObject).
  // 바닥·벽 윗면은 평면이라 한 번에 한 면만 보여 한 패스로 충분하다 — forceSinglePass가 반투명 면의 draw를 절반으로 줄이고 프레임마다의 프로그램 재평가를 없앤다.
  // 법선 부호와는 무관하다: BackSide 패스도 three가 normalScale uniform을 negate해(refreshUniformsCommon) 요철이 같으므로, 한 패스에서도 부호는 그대로 −1이다.
  test.each([
    ['투명 모드', { display: 'transparent' }],
    ['불투명도 < 1', { floorOpacity: 0.5, wallOpacity: 0.5 }],
  ])('반투명 바닥·벽 윗면(%s)은 한 패스로 그리고 법선 음수를 그대로 둔다', async (_, view) => {
    await arrive('mma-gray');
    const g = buildFloorGroup(floorWith('mma-gray', 'mma-gray'), view);
    for (const name of ['floor', 'wallTop']) {
      const mats = g.children.filter(c => c.name === name).map(c => c.material);
      expect(mats.length).toBeGreaterThan(0);
      for (const m of mats) expect({ name, transparent: m.transparent, forceSinglePass: m.forceSinglePass, ns: m.normalScale.x })
        .toEqual({ name, transparent: true, forceSinglePass: true, ns: -1 * materialById('mma-gray').normalScale });
    }
  });

  test('MF 바닥: 거칠기 0.6 · 환경 반사 0.15 · tint 색 · 맵 없음 — 흰 타일 벽은 그대로 0.35', () => {
    const fl = buildFloorGroup(floorWith('ucrete-mf-red'), { wallOpacity: 1 }).children.find(c => c.name === 'floor').material;
    expect(fl.roughness).toBe(0.6);
    expect(fl.envMapIntensity).toBe(0.15);
    expect(fl.map).toBeNull();
    expect(rgb(fl)).toEqual([0.312, 0.0468, 0.0209]);
    const face = buildFloorGroup(floorWith('ucrete-mf-red', 'tile-white-300'), { wallOpacity: 1 }).children.find(c => c.name === 'wallFace').material;
    expect(face.roughness).toBe(0.35);
  });

  test('MMA 바닥은 광택이 없어 환경 반사를 넣지 않고, UD200은 0.1 · 칩 에폭시는 0.25(사진 재질 거칠기는 재질 값 그대로)', async () => {
    await arrive('mma-gray', 'ucrete-ud200-gray', 'epoxy-chip-gray');
    const floorOf = id => buildFloorGroup(floorWith(id), { wallOpacity: 1 }).children.find(c => c.name === 'floor').material;
    expect(floorOf('mma-gray').envMapIntensity).toBe(1);                  // three 기본값(환경 맵 없음)
    expect(floorOf('ucrete-ud200-gray')).toMatchObject({ envMapIntensity: 0.1, roughness: 1 });
    expect(floorOf('epoxy-chip-gray')).toMatchObject({ envMapIntensity: 0.25, roughness: 1 });
  });
});
