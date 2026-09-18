import { test, expect, vi } from 'vitest';
import { rectWalls, makeWall } from "../src/geom/walls.js";
import { detectRooms } from '../src/geom/rooms.js';
import { buildFloorGroup, disposeGroup, sceneSignature, TRANSPARENT_OPACITY } from '../src/view3d/build.js';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls, addFloor, setActiveFloor } from "../src/state/floorOps.js";
import { beforeAll, afterAll } from 'vitest';
import { setCanvasFactory, clearTextureCache, materialTexture, faceRepeat, applyAssignment, TEX_PX } from '../src/materials/texture.js';
import { materialById } from '../src/materials/catalog.js';
import * as THREE from 'three';

function floor() { const walls = rectWalls([0, 0], [4000, 3000], 200); return { walls, rooms: detectRooms(walls), height: 2300 }; }

test('buildFloorGroup makes one mesh per wall and wall top, one floor and a hidden ceiling', () => {
  const g = buildFloorGroup(floor(), { wallOpacity: 1 });
  const names = g.children.map(c => c.name);
  expect(names.filter(n => n === 'wall')).toHaveLength(4);
  expect(names.filter(n => n === 'wallTop')).toHaveLength(4);
  expect(names.filter(n => n === 'floor')).toHaveLength(1);
  expect(g.children.find(c => c.name === 'ceiling').visible).toBe(false);
  expect(g.children.filter(c => c.name === 'wall').every(c => typeof c.userData.wallId === 'string')).toBe(true);
});

test('disposeGroup disposes every geometry and only per-mesh materials', () => {
  const g = buildFloorGroup(floor(), { wallOpacity: 1 });
  const geoSpies = [], mats = new Set();
  g.traverse(o => { if (o.geometry) geoSpies.push(vi.spyOn(o.geometry, 'dispose')); if (o.material) mats.add(o.material); });
  const matSpies = [...mats].map(m => [m, vi.spyOn(m, 'dispose')]);
  disposeGroup(g);
  expect(geoSpies.length).toBeGreaterThan(0);
  expect(geoSpies.every(s => s.mock.calls.length === 1)).toBe(true);
  for (const [m, s] of matSpies) expect(s.mock.calls.length).toBe(m.userData.perMesh ? 1 : 0);
});

test('wall material is transparent only when wallOpacity < 1', () => {
  const opaque = buildFloorGroup(floor(), { wallOpacity: 1 }).children.filter(c => c.name === 'wall');
  expect(opaque.every(c => c.material.transparent === false && c.material.opacity === 1 && c.material.depthWrite === true)).toBe(true);
  const seeThrough = buildFloorGroup(floor(), { wallOpacity: 0.4 }).children.filter(c => c.name === 'wall');
  expect(seeThrough.every(c => c.material.transparent === true && c.material.opacity === 0.4 && c.material.depthWrite === false)).toBe(true); // 반투명 면은 깊이를 쓰지 않는다
});

test('every wall gets a hidden footprint outline that carries its wallId', () => {
  const g = buildFloorGroup(floor(), { wallOpacity: 1 });
  const feet = g.children.filter(c => c.name === 'wallFoot');
  expect(feet).toHaveLength(4);
  expect(feet.every(f => f.visible === false && typeof f.userData.wallId === 'string')).toBe(true);
  expect(feet.every(f => f.isLineLoop === true)).toBe(true);
});

test('display mode white paints every surface white; transparent makes walls see-through', () => {
  const white = buildFloorGroup(floor(), { display: 'white', wallOpacity: 1 });
  expect(white.children.find(c => c.name === 'wall').material.color.getHex()).toBe(0xffffff);
  expect(white.children.find(c => c.name === 'floor').material.color.getHex()).toBe(0xffffff);
  const see = buildFloorGroup(floor(), { display: 'transparent', wallOpacity: 1 }).children.find(c => c.name === 'wall');
  expect(see.material.transparent).toBe(true);
  expect(see.material.opacity).toBeCloseTo(0.3, 6);
});

test('hiddenLine adds edge lines for walls, and floorOpacity makes the floor transparent', () => {
  expect(buildFloorGroup(floor(), { wallOpacity: 1 }).children.filter(c => c.name === 'edges')).toHaveLength(0);
  const g = buildFloorGroup(floor(), { wallOpacity: 1, hiddenLine: true });
  expect(g.children.filter(c => c.name === 'edges')).toHaveLength(4);
  const fl = buildFloorGroup(floor(), { wallOpacity: 1, floorOpacity: 0.5 }).children.find(c => c.name === 'floor');
  expect(fl.material.transparent).toBe(true);
  expect(fl.material.opacity).toBe(0.5);
});

test('a floor with fractional coordinates still builds one mesh per wall', () => {
  const walls = rectWalls([0.5, 0.25], [4000.5, 3000.75], 200);
  const g = buildFloorGroup({ walls, rooms: detectRooms(walls), height: 2300 }, { wallOpacity: 1 });
  expect(g.children.filter(c => c.name === 'wall')).toHaveLength(4);
  expect(g.children.filter(c => c.name === 'wallFoot')).toHaveLength(4);
});

test('each room gets inner wall faces painted with colorIn', () => {
  const walls = rectWalls([0, 0], [4000, 3000], 200).map(w => ({ ...w, colorIn: '#ff8800' }));
  const g = buildFloorGroup({ walls, rooms: detectRooms(walls), height: 2300 }, { wallOpacity: 1 });
  const faces = g.children.filter(c => c.name === 'wallFace');
  expect(faces).toHaveLength(4);
  expect(faces.every(f => typeof f.userData.wallId === 'string')).toBe(true);
  expect(faces[0].material.color.getHex()).toBe(0xff8800);
  const white = buildFloorGroup({ walls, rooms: detectRooms(walls), height: 2300 }, { display: 'white', wallOpacity: 1 });
  expect(white.children.find(c => c.name === 'wallFace').material.color.getHex()).toBe(0xffffff);
});

test('the group is built from the store active floor, not the first one', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  addFloor(store, { copy: 'none' });
  addWalls(store, rectWalls([0, 0], [2000, 2000], 200).concat(makeWall({ a: [0, 0], b: [0, -1500], thickness: 200 })));
  expect(store.get().activeFloor).toBe(1);
  const g = buildFloorGroup(activeFloor(store.get()), store.get().view); // view3d가 쓰는 것과 같은 helper
  expect(g.children.filter(c => c.name === 'wall')).toHaveLength(5); // 2층은 벽 5개(1층은 4개)
  expect(g.children.filter(c => c.name === 'floor')).toHaveLength(1);
  setActiveFloor(store, 0);
  const first = buildFloorGroup(activeFloor(store.get()), store.get().view);
  expect(first.children.filter(c => c.name === 'wall')).toHaveLength(4);
  expect(sceneSignature(store.get())).not.toBe(sceneSignature({ ...store.get(), activeFloor: 1 })); // 층을 바꾸면 씬을 다시 만든다
});

test('wall tops follow the wall opacity (both the slider and transparent mode)', () => {
  const tops = buildFloorGroup(floor(), { wallOpacity: 0.4 }).children.filter(c => c.name === 'wallTop');
  expect(tops).toHaveLength(4);
  expect(tops.every(c => c.material.transparent === true && c.material.opacity === 0.4 && c.material.depthWrite === false)).toBe(true);
  const see = buildFloorGroup(floor(), { display: 'transparent', wallOpacity: 1 }).children.find(c => c.name === 'wallTop');
  expect(see.material.opacity).toBeCloseTo(TRANSPARENT_OPACITY.wall, 6);
  const opaque = buildFloorGroup(floor(), { wallOpacity: 1 }).children.find(c => c.name === 'wallTop');
  expect(opaque.material.transparent).toBe(false);
  expect(opaque.material.opacity).toBe(1);
});

test('sceneSignature changes for geometry and display settings but not for sun or camera', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const before = sceneSignature(store.get());
  store.dispatch(d => { d.view.sun.hour = 7; d.view.cameraPreset.elevation = 12; d.view.projection = 'ortho'; d.view.v3.wallTransparent = true; }, { record: false });
  expect(sceneSignature(store.get())).toBe(before); // 씬을 다시 만들 이유가 아니다
  store.dispatch(d => { d.view.wallOpacity = 0.5; }, { record: false });
  expect(sceneSignature(store.get())).not.toBe(before);
  const withOpacity = sceneSignature(store.get());
  store.dispatch(d => { activeFloor(d).walls[0].thickness = 150; }, { record: false });
  expect(sceneSignature(store.get())).not.toBe(withOpacity);
});

test('a wall with a door becomes three boxes that keep the wall id, and items get their own group', async () => {
  const { createItem } = await import('../src/state/schema.js');
  const { productById } = await import('../src/products/catalog.js');
  const walls = rectWalls([0, 0], [4000, 3000], 200);
  const top = walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  const items = [createItem(productById('door-swing-900'), { wallId: top.id, t: 0.5, pos: [2000, 0] }), createItem(productById('sofa-3'), { pos: [2000, 1500] })];
  const f = { walls, rooms: detectRooms(walls), items, height: 2300 };
  const g = buildFloorGroup(f, { wallOpacity: 1, v3: {} });
  const wallMeshes = g.children.filter(c => c.name === 'wall');
  expect(wallMeshes).toHaveLength(3 + 3); // 문이 있는 벽 3조각 + 나머지 벽 3개
  expect(wallMeshes.filter(c => c.userData.wallId === top.id)).toHaveLength(3);
  expect(wallMeshes.filter(c => c.userData.wallId === top.id).every(c => c.geometry.type === 'BoxGeometry')).toBe(true);
  const itemsGroup = g.children.find(c => c.name === 'items');
  expect(itemsGroup.children).toHaveLength(2); // 소파 + 문(문짝은 보인다)
  disposeGroup(g);
});

test('sceneSignature changes when a v3 item-visibility flag changes but not for sun/camera', () => {
  const s = createEmptyProject();
  s.floors[0].items = [{ id: 'i1', kind: 'product', pos: [100.5, 200.25], z: 0, rot: 0, size: [500, 400, 700], attach: 'floor' }];
  const a = sceneSignature(s);
  const b = sceneSignature({ ...s, view: { ...s.view, sun: { ...s.view.sun, hour: 8 } } });
  const c = sceneSignature({ ...s, view: { ...s.view, v3: { ...s.view.v3, wallItems: false } } });
  expect(b).toBe(a);
  expect(c).not.toBe(a);
});

// node 환경에는 document가 없다. drawPattern이 부르는 메서드만 가진 가짜 캔버스를 쓴다.
function fakeCanvas() {
  const ctx = { fillStyle: '', strokeStyle: '', lineWidth: 1, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {} };
  return { width: 0, height: 0, getContext: () => ctx };
}
beforeAll(() => setCanvasFactory(fakeCanvas));
afterAll(() => { clearTextureCache(); setCanvasFactory(null); });

const assign = (id, patch = {}) => ({ id, offset: [0, 0], angle: 0, ...patch });

test('materialTexture는 id마다 한 장을 캐시하고 반복·색공간을 세팅한다', () => {
  const t = materialTexture('wood-oak');
  expect(t).toBeTruthy();
  expect(t.image.width).toBe(TEX_PX);
  expect(t.wrapS).toBe(THREE.RepeatWrapping);
  expect(t.wrapT).toBe(THREE.RepeatWrapping);
  expect(t.colorSpace).toBe(THREE.SRGBColorSpace);
  expect(materialTexture('wood-oak')).toBe(t);       // 같은 재질은 같은 텍스처
  expect(materialTexture('없는재질')).toBeNull();
});

test('faceRepeat은 면 크기를 무늬 크기로 나눈다(소수 크기)', () => {
  const oak = materialById('wood-oak');            // scale [1200, 190]
  const [rx, ry] = faceRepeat(oak, [4000.5, 2300]);
  expect(rx).toBeCloseTo(4000.5 / 1200, 6);
  expect(ry).toBeCloseTo(2300 / 190, 6);
  expect(faceRepeat(oak, [0, 0])[0]).toBe(0.05);   // 0으로 나누지 않고 최소값을 쓴다
  expect(faceRepeat(null, [1000, 1000])).toEqual([1, 1]);
});

test('applyAssignment는 map·repeat·offset·rotation을 세팅하고 화이트 모드에서는 붙이지 않는다', () => {
  const m = new THREE.MeshStandardMaterial();
  applyAssignment(m, assign('tile-white-300', { offset: [150, 75.5], angle: 90 }), [3000, 2400]);
  expect(m.map).toBeTruthy();
  expect(m.map.repeat.x).toBeCloseTo(10, 6);        // 3000 / 300
  expect(m.map.offset.x).toBeCloseTo(0.5, 6);       // 150 / 300
  expect(m.map.offset.y).toBeCloseTo(75.5 / 300, 6);
  expect(m.map.rotation).toBeCloseTo(Math.PI / 2, 6);
  expect(m.map.center.x).toBe(0.5);
  expect(m.color.getHex()).toBe(0xffffff);
  const w = new THREE.MeshStandardMaterial();
  applyAssignment(w, assign('tile-white-300'), [3000, 2400], { display: 'white' });
  expect(w.map).toBeNull();
  const none = new THREE.MeshStandardMaterial();
  applyAssignment(none, null, [3000, 2400]);
  expect(none.map).toBeNull();
});

test('벽 본체는 matOut, 방 안쪽 면은 matIn 텍스처를 쓴다(소수 길이)', () => {
  const walls = rectWalls([0.5, 0.25], [4000.5, 3000.75], 200)
    .map(w => ({ ...w, matIn: assign('paint-navy'), matOut: assign('brick-red') }));
  const g = buildFloorGroup({ walls, rooms: detectRooms(walls), height: 2300 }, { wallOpacity: 1 });
  const body = g.children.find(c => c.name === 'wall');
  const face = g.children.find(c => c.name === 'wallFace');
  expect(body.material.map).toBeTruthy();
  expect(face.material.map).toBeTruthy();
  expect(body.material.map.uuid).not.toBe(face.material.map.uuid); // 면마다 복제한다(반복·오프셋이 다르다)
  const top = walls.find(w => w.a[1] === 0.25 && w.b[1] === 0.25);
  const topBody = g.children.find(c => c.name === 'wall' && c.userData.wallId === top.id);
  expect(topBody.material.map.repeat.x).toBeCloseTo(4000 / 230, 3);  // 벽 길이 4000 / 적벽돌 230
});

test('바닥·천장은 방 재질을 쓰고, 지정이 없으면 색만 쓴다', () => {
  const walls = rectWalls([0, 0], [4000, 3000], 200);
  const rooms = detectRooms(walls).map(r => ({ ...r, floorMat: assign('wood-oak'), ceilingMat: null, hideCeiling: false }));
  const g = buildFloorGroup({ walls, rooms, height: 2300 }, { wallOpacity: 1 });
  expect(g.children.find(c => c.name === 'floor').material.map).toBeTruthy();
  expect(g.children.find(c => c.name === 'ceiling').material.map).toBeNull();
});

test('영역은 벽면에서 띄운 평면 메시가 되고 벽 id·면을 들고 있다', () => {
  const walls = rectWalls([0, 0], [4000, 3000], 200);
  const target = walls[0];
  target.regions = {
    in: [{ id: 'rg1', kind: 'band', u0: 0, u1: 4000, z0: 0, z1: 1200, mat: assign('tile-white-300') }],
    out: [{ id: 'rg2', kind: 'rect', u0: 500.5, u1: 1500.5, z0: 300, z1: 900, mat: assign('brick-red') }],
  };
  const g = buildFloorGroup({ walls, rooms: detectRooms(walls), height: 2300 }, { wallOpacity: 1 });
  const regions = g.children.filter(c => c.name === 'wallRegion');
  expect(regions).toHaveLength(2);
  expect(regions.map(r => r.userData.side).sort()).toEqual(['in', 'out']);
  expect(regions.every(r => r.userData.wallId === target.id)).toBe(true);
  expect(regions.every(r => r.geometry.type === 'PlaneGeometry')).toBe(true);
  const band = regions.find(r => r.userData.side === 'in');
  expect(band.geometry.parameters.width).toBeCloseTo(4);        // 4000mm = 4m
  expect(band.geometry.parameters.height).toBeCloseTo(1.2);
  expect(band.position.y).toBeCloseTo(0.6);                     // (0 + 1200) / 2
  const rect = regions.find(r => r.userData.side === 'out');
  expect(rect.geometry.parameters.width).toBeCloseTo(1.0, 6);   // 1500.5 - 500.5
  // 벽 면(두께 200의 절반)에서 2mm 앞: 아래 벽(y = 0)은 법선이 남(+y) → three z
  expect(Math.abs(rect.position.z)).toBeCloseTo(0.102, 6);
  disposeGroup(g);
});

test('disposeGroup은 면마다 복제한 텍스처만 정리하고 캐시 원본은 남긴다', () => {
  const cached = materialTexture('brick-red');
  const spy = vi.spyOn(cached, 'dispose');
  const walls = rectWalls([0, 0], [4000, 3000], 200).map(w => ({ ...w, matOut: assign('brick-red') }));
  const g = buildFloorGroup({ walls, rooms: detectRooms(walls), height: 2300 }, { wallOpacity: 1 });
  const clones = g.children.filter(c => c.name === 'wall').map(c => vi.spyOn(c.material.map, 'dispose'));
  disposeGroup(g);
  expect(clones.every(s => s.mock.calls.length === 1)).toBe(true);
  expect(spy).not.toHaveBeenCalled();
});
