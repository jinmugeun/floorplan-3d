// 계획 17 Task 7: 사진 마감재(칩 에폭시 바닥)와 새 방 바닥 기본값.
// node 환경이라 document·Image가 없다 — 사진을 받는 경로는 가짜 document와 TextureLoader.loadAsync 대역으로 돌린다.
import { describe, test, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_FLOOR_MAT_ID, KITCHEN_WALL_MAT_ID, defaultFloorMat, kitchenWallMat } from '../src/materials/defaults.js';
import { materialById, MATERIAL_PATTERNS } from '../src/materials/catalog.js';
import { photoTextures, onPhotoReady, applyAssignment, PHOTO_TINT, __resetPhotos } from '../src/materials/texture.js';
import { buildFloorGroup, disposeGroup } from '../src/view3d/build.js';
import { drawSwatch, SWATCH_PX } from '../src/ui/materialPanel.js';
import { rectWalls, makeWall } from '../src/geom/walls.js';
import { detectRooms } from '../src/geom/rooms.js';
import { normalizeWalls } from '../src/geom/normalize.js';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, migrate } from '../src/state/schema.js';
import { createRoomTool } from '../src/view2d/tools/roomTool.js';

const epoxy = () => materialById('epoxy-chip-gray');
const assign = (id, patch = {}) => ({ id, offset: [0, 0], angle: 0, ...patch });
const flush = () => new Promise(r => setTimeout(r, 0));

// 가짜 document + 텍스처 대역: loadAsync는 url마다 4×4 이미지를 든 Texture를 돌려준다(복제·repeat이 실제로 돈다).
function fakeLoading() {
  const urls = [];
  const spy = vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation(url => { urls.push(url); return Promise.resolve(new THREE.Texture({ width: 4, height: 4 })); });
  globalThis.document = {};
  return { urls, spy };
}
afterEach(() => { delete globalThis.document; delete globalThis.Image; vi.restoreAllMocks(); __resetPhotos(); });

describe('급식실 마감 기본값(defaults.js)', () => {
  test('바닥은 칩 에폭시, 벽은 흰 타일 300이고 함수는 매번 새 객체다', () => {
    expect(DEFAULT_FLOOR_MAT_ID).toBe('epoxy-chip-gray');
    expect(KITCHEN_WALL_MAT_ID).toBe('tile-white-300');
    expect(defaultFloorMat()).toEqual({ id: 'epoxy-chip-gray', offset: [0, 0], angle: 0 });
    expect(kitchenWallMat()).toEqual({ id: 'tile-white-300', offset: [0, 0], angle: 0 });
    expect(defaultFloorMat()).not.toBe(defaultFloorMat());
    expect(defaultFloorMat().offset).not.toBe(defaultFloorMat().offset);
  });
});

describe('칩 에폭시 카탈로그 항목', () => {
  test('테라조 칸의 사진 마감재이고 단가·크기·광택이 정해져 있다', () => {
    const m = epoxy();
    expect(m).toMatchObject({ name: '그레이 칩 에폭시', code: 'TZ-05', category: '테라조', maker: '오늘의집', base: '#a7a7a3', pattern: 'speckle', scale: [1200, 1200], pricePerM2: 45000, photo: 'granite-gray', gloss: 0.25 });
    expect(MATERIAL_PATTERNS).toContain(m.pattern);
    expect(materialById('tile-white-300').gloss).toBe(0.3);
    expect(materialById('tile-white-300').photo).toBeUndefined();
  });
});

describe('사진 텍스처(photoTextures)', () => {
  test('node(document 없음)에서는 null이고 아무것도 받지 않는다', () => {
    const spy = vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync');
    expect(photoTextures(epoxy())).toBeNull();
    expect(photoTextures(materialById('tile-white-300'))).toBeNull();   // 사진이 없는 재질
    expect(spy).not.toHaveBeenCalled();
  });

  test('세 장을 한 번 받아 캐시하고 도착을 한 번 알린다', async () => {
    const { urls } = fakeLoading();
    const seen = [];
    const off = onPhotoReady(dir => seen.push(dir));
    expect(photoTextures(epoxy())).toBeNull();                          // 도착 전
    expect(photoTextures(epoxy())).toBeNull();                          // 두 번 불러도 다시 받지 않는다
    await flush();
    off();
    expect(urls).toEqual(['textures/granite-gray/color.webp', 'textures/granite-gray/normal.webp', 'textures/granite-gray/rough.webp']);
    expect(seen).toEqual(['granite-gray']);
    const maps = photoTextures(epoxy());
    expect(maps.map.wrapS).toBe(THREE.RepeatWrapping);
    expect(maps.map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(maps.normalMap.colorSpace).not.toBe(THREE.SRGBColorSpace);   // 법선·거칠기는 색이 아니다
  });

  test('받기에 실패하면 한 번 경고하고 계속 null(바탕색)이다', async () => {
    globalThis.document = {};
    vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockRejectedValue(new Error('404'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(photoTextures(epoxy())).toBeNull();
    await flush();
    expect(photoTextures(epoxy())).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('applyAssignment — 사진 갈래', () => {
  test('도착 전에는 바탕색만 칠하고 맵을 붙이지 않는다', () => {
    const m = new THREE.MeshStandardMaterial();
    applyAssignment(m, assign('epoxy-chip-gray'), null, { worldUv: true });
    expect(m.map).toBeNull();
    expect(m.normalMap).toBeNull();
    expect(m.color.getHexString()).toBe('a7a7a3');
  });

  test('도착 뒤에는 세 맵의 복제를 붙이고 반복은 미터당 1000 / 1200이다', async () => {
    fakeLoading();
    photoTextures(epoxy()); await flush();
    const orig = photoTextures(epoxy());
    const m = new THREE.MeshStandardMaterial();
    applyAssignment(m, assign('epoxy-chip-gray', { offset: [600, 0], angle: 90 }), null, { worldUv: true });
    for (const k of ['map', 'normalMap', 'roughnessMap']) {
      expect(m[k]).toBeTruthy();
      expect(m[k]).not.toBe(orig[k]);                                    // 원본이 아니라 복제
      expect(m[k].userData.clone).toBe(true);
      expect(m[k].repeat.x).toBeCloseTo(1000 / 1200, 9);
      expect(m[k].offset.x).toBeCloseTo(0.5, 9);                         // 600 mm ÷ 1200 mm
      expect(m[k].rotation).toBeCloseTo(Math.PI / 2, 9);
    }
    expect(m.normalScale.x).toBe(0.5);
    expect(m.roughness).toBe(0.9);
    expect([m.color.r, m.color.g, m.color.b]).toEqual(PHOTO_TINT);
  });

  test('화이트 단색 모드는 사진이 와 있어도 맵이 없다', async () => {
    fakeLoading();
    photoTextures(epoxy()); await flush();
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff });
    applyAssignment(m, assign('epoxy-chip-gray'), null, { worldUv: true, display: 'white' });
    expect(m.map).toBeNull();
    expect(m.color.getHex()).toBe(0xffffff);
  });

  test('disposeGroup은 세 복제본만 버리고 캐시 원본은 남긴다', async () => {
    fakeLoading();
    photoTextures(epoxy()); await flush();
    const orig = photoTextures(epoxy());
    const mat = new THREE.MeshStandardMaterial(); mat.userData.perMesh = true;
    applyAssignment(mat, assign('epoxy-chip-gray'), null, { worldUv: true });
    const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BufferGeometry(), mat));
    const clones = ['map', 'normalMap', 'roughnessMap'].map(k => vi.spyOn(mat[k], 'dispose'));
    const origs = ['map', 'normalMap', 'roughnessMap'].map(k => vi.spyOn(orig[k], 'dispose'));
    disposeGroup(g);
    for (const s of clones) expect(s).toHaveBeenCalledTimes(1);
    for (const s of origs) expect(s).not.toHaveBeenCalled();
  });
});

describe('build.js — 광택 마감', () => {
  const floorWith = (patch = {}) => {
    const walls = rectWalls([0, 0], [4000, 3000], 200).map(w => ({ ...w, ...patch }));
    return { walls, rooms: detectRooms(walls), height: 2300 };
  };
  test('칩 에폭시 바닥은 환경 반사 0.25, 흰 타일 벽 안쪽 면은 거칠기 0.35 · 반사 0.3', () => {
    const g = buildFloorGroup(floorWith({ matIn: assign('tile-white-300') }), { wallOpacity: 1 });
    const fl = g.children.find(c => c.name === 'floor');
    expect(fl.material.envMapIntensity).toBe(0.25);
    const face = g.children.find(c => c.name === 'wallFace');
    expect(face.material.roughness).toBe(0.35);
    expect(face.material.envMapIntensity).toBe(0.3);
    const plain = buildFloorGroup(floorWith({ matIn: assign('paint-white') }), { wallOpacity: 1 }).children.find(c => c.name === 'wallFace');
    expect(plain.material.roughness).toBe(0.9);                          // 무광 면은 그대로
    expect(plain.material.envMapIntensity).toBe(1);                      // three 기본값(환경 맵 없음)
  });
  test('화이트 단색 모드는 광택을 넣지 않는다', () => {
    const fl = buildFloorGroup(floorWith(), { wallOpacity: 1, display: 'white' }).children.find(c => c.name === 'floor');
    expect(fl.material.envMapIntensity).toBe(1);
    expect(fl.material.color.getHex()).toBe(0xffffff);
  });
});

describe('마감재 견본 — 사진', () => {
  const fakeCanvas = () => {
    const ctx = { fillStyle: '', strokeStyle: '', lineWidth: 1, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}, drawImage: vi.fn() };
    return { width: 0, height: 0, getContext: () => ctx, ctx };
  };
  test('무늬를 먼저 그리고 사진이 오면 같은 캔버스에 덮는다(이미지는 한 번 받는다)', async () => {
    const made = [];
    globalThis.Image = class { constructor() { made.push(this); } set src(v) { this._src = v; queueMicrotask(() => this.onload?.()); } get src() { return this._src; } };
    const a = fakeCanvas(), b = fakeCanvas();
    drawSwatch(a, epoxy()); drawSwatch(b, epoxy());
    expect(a.width).toBe(SWATCH_PX);
    expect(a.ctx.drawImage).not.toHaveBeenCalled();                      // 오기 전에는 무늬만
    await flush();
    expect(made).toHaveLength(1);
    expect(made[0].src).toBe('textures/granite-gray/color.webp');
    expect(a.ctx.drawImage).toHaveBeenCalledWith(made[0], 0, 0, SWATCH_PX, SWATCH_PX);
    expect(b.ctx.drawImage).toHaveBeenCalledTimes(1);
    const c = fakeCanvas(); drawSwatch(c, epoxy());                       // 도착 뒤에는 바로 덮는다
    expect(c.ctx.drawImage).toHaveBeenCalledTimes(1);
  });
  test('사진이 없는 재질과 Image가 없는 환경은 무늬만 그린다', () => {
    const a = fakeCanvas();
    drawSwatch(a, materialById('wood-oak'));
    drawSwatch(a, epoxy());                                               // Image 없음(node)
    expect(a.ctx.drawImage).not.toHaveBeenCalled();
  });
});

describe('새 방 바닥 기본값(detectRooms)', () => {
  test('짝이 없는 새 면은 칩 에폭시이고 방마다 다른 객체다', () => {
    const walls = normalizeWalls([...rectWalls([0, 0], [6000.5, 3000.25], 200), makeWall({ a: [3000.25, 0], b: [3000.25, 3000.25], thickness: 100 })]);
    const rooms = detectRooms(walls);
    expect(rooms).toHaveLength(2);
    for (const r of rooms) expect(r.floorMat).toEqual(defaultFloorMat());
    expect(rooms[0].floorMat).not.toBe(rooms[1].floorMat);
    expect(rooms[0].ceilingMat).toBeNull();                               // 천장은 기본값이 없다
  });
  test('짝이 있는 방은 저장된 값을 그대로 둔다(null도, 키가 없어도 null)', () => {
    const walls = rectWalls([0, 0], [4000.5, 3000.25], 200);
    const [r] = detectRooms(walls);
    expect(detectRooms(walls, [{ ...r, floorMat: null }])[0].floorMat).toBeNull();
    const { floorMat, ...noKey } = r;
    expect(detectRooms(walls, [noKey])[0].floorMat).toBeNull();
    expect(detectRooms(walls, [{ ...r, floorMat: assign('wood-oak') }])[0].floorMat).toEqual(assign('wood-oak'));
  });
  test('불러오기(migrate)는 바닥을 고르지 않은 옛 방을 바꾸지 않는다', () => {
    const walls = rectWalls([0, 0], [4000.5, 3000.25], 200);
    const rooms = detectRooms(walls).map(r => ({ ...r, floorMat: null }));
    const p = migrate({ ...createEmptyProject(), floors: [{ ...createEmptyProject().floors[0], walls, rooms }] });
    expect(activeFloor(p).rooms[0].floorMat).toBeNull();
    expect(activeFloor(migrate(p)).rooms[0].floorMat).toBeNull();
  });
  test('방 그리기는 여전히 되돌리기 한 단계이고 새 방은 칩 에폭시다', () => {
    const store = createStore(createEmptyProject());
    const t = createRoomTool({ store, onDone() {} });
    t.onPointerDown([0, 0]); t.onPointerMove([4000.5, 3000.25]); t.onPointerDown([4000.5, 3000.25]);
    expect(activeFloor(store.get()).rooms[0].floorMat).toEqual(defaultFloorMat());
    expect(store.undo()).toBe(true);
    expect(activeFloor(store.get()).rooms).toHaveLength(0);
    expect(store.canUndo()).toBe(false);
  });
});
