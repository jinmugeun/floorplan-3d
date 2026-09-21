import { test, expect, vi, beforeAll, afterAll } from 'vitest';
import { rectWalls, makeWall } from "../src/geom/walls.js";
import { detectRooms } from '../src/geom/rooms.js';
import { buildFloorGroup, disposeGroup, sceneSignature, TRANSPARENT_OPACITY } from '../src/view3d/build.js';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls, addFloor, setActiveFloor } from "../src/state/floorOps.js";
import { setCanvasFactory, clearTextureCache, materialTexture, faceRepeat, applyAssignment, assignScale, TEX_PX } from '../src/materials/texture.js';
import { materialById } from '../src/materials/catalog.js';
import * as THREE from 'three';

function floor() { const walls = rectWalls([0, 0], [4000, 3000], 200); return { walls, rooms: detectRooms(walls), height: 2300 }; }

// node 환경에는 document가 없다. drawPattern이 부르는 메서드만 가진 가짜 캔버스를 파일 전체에 깔아 둔다.
function fakeCanvas() {
  const ctx = { fillStyle: '', strokeStyle: '', lineWidth: 1, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {} };
  return { width: 0, height: 0, getContext: () => ctx };
}
beforeAll(() => setCanvasFactory(fakeCanvas));
afterAll(() => { clearTextureCache(); setCanvasFactory(null); });

const assign = (id, patch = {}) => ({ id, offset: [0, 0], angle: 0, ...patch });

// 지오메트리의 uv가 실제로 덮는 범위. 무늬가 몇 번 반복되는지는 (이 범위 × repeat)이라 이것 없이는 검증이 안 된다.
function uvSpan(geo) {
  const uv = geo.attributes.uv;
  if (!uv) return null;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i));
    v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i));
  }
  return [u1 - u0, v1 - v0];
}

// ExtrudeGeometry는 캡(그룹 0, 벽 윗면·밑면)과 측벽(그룹 1)의 uv 규약이 다르다. 벽 무늬는 측벽만 봐야 한다.
function sideUv(geo) {
  const grp = geo.groups.find(x => x.materialIndex === 1);   // 비인덱스 지오메트리라 start/count가 곧 정점 번호다
  const uv = geo.attributes.uv;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let i = grp.start; i < grp.start + grp.count; i++) {
    u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i));
    v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i));
  }
  return { u0, u1, v0, v1 };
}
// BoxGeometry 면 순서 +x −x +y −y +z −z 중 한 면의 정점 번호.
function boxFaceVerts(geo, materialIndex) {
  const grp = geo.groups.find(x => x.materialIndex === materialIndex);
  return [...new Set([...Array(grp.count).keys()].map(k => geo.index.getX(grp.start + k)))];
}

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
  // 아이템 윤곽선은 씬을 지을 때 읽는 값이다 — 서명에서 빠지면 팝오버 체크박스를 눌러도
  // 씬을 다시 짓지 않아 기능이 조용히 죽는다.
  const withThickness = sceneSignature(store.get());
  store.dispatch(d => { d.view.v3.itemEdges = false; }, { record: false });
  expect(sceneSignature(store.get())).not.toBe(withThickness);
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

test('faceRepeat worldUv는 면 크기를 무시하고 미터당 반복 수를 준다', () => {
  const tile = materialById('tile-white-300');
  const [rx, ry] = faceRepeat(tile, [4000, 3000], { worldUv: true });
  expect(rx).toBeCloseTo(1000 / 300, 9);
  expect(ry).toBeCloseTo(1000 / 300, 9);
  // uv가 미터라 4 m × 3 m 바닥에서는 uv 범위 × repeat = 13.33 × 10칸이 된다(= 4000/300 × 3000/300).
  expect(4 * rx).toBeCloseTo(4000 / 300, 6);
  expect(3 * ry).toBeCloseTo(10, 6);
  // 면이 커져도 repeat은 그대로다 — 0~1 uv 모드와 달리 무늬 한 칸 크기가 면 크기에 끌려다니지 않는다.
  expect(faceRepeat(tile, [40000, 30000], { worldUv: true })).toEqual([rx, ry]);
  expect(faceRepeat(materialById('wood-oak'), null, { worldUv: true })[1]).toBeCloseTo(1000 / 190, 9);
});

test('applyAssignment는 map·repeat·offset·rotation을 세팅하고 화이트 모드에서는 붙이지 않는다', () => {
  const m = new THREE.MeshStandardMaterial();
  applyAssignment(m, assign('tile-white-300', { offset: [150, 75.5], angle: 90 }), [3000, 2400]);
  expect(m.map).toBeTruthy();
  expect(m.map.repeat.x).toBeCloseTo(10, 6);        // 3000 / 300
  expect(m.map.offset.x).toBeCloseTo(0.5, 6);       // 150 / 300
  expect(m.map.offset.y).toBeCloseTo(75.5 / 300, 6);
  expect(m.map.rotation).toBeCloseTo(Math.PI / 2, 6);
  expect(m.map.center.x).toBe(0);                  // 회전·오프셋은 원점 기준(조각 위상이 렌더에서도 맞게)
  expect(m.color.getHex()).toBe(0xffffff);
  const w = new THREE.MeshStandardMaterial();
  applyAssignment(w, assign('tile-white-300'), [3000, 2400], { display: 'white' });
  expect(w.map).toBeNull();
  const none = new THREE.MeshStandardMaterial();
  applyAssignment(none, null, [3000, 2400]);
  expect(none.map).toBeNull();
});

test('applyAssignment worldUv는 repeat만 미터당으로 바꾸고 offset·각도는 그대로 둔다', () => {
  const m = new THREE.MeshStandardMaterial();
  applyAssignment(m, assign('wood-oak', { offset: [600.5, 95], angle: 30 }), [4000, 3000], { worldUv: true });
  expect(m.map.repeat.x).toBeCloseTo(1000 / 1200, 9);   // 오크 마루 scale [1200, 190]
  expect(m.map.repeat.y).toBeCloseTo(1000 / 190, 9);
  expect(m.map.offset.x).toBeCloseTo(600.5 / 1200, 9);  // offset은 repeat 뒤에 더해지는 텍스처 공간 값이라 식이 같다
  expect(m.map.offset.y).toBeCloseTo(95 / 190, 9);
  expect(m.map.rotation).toBeCloseTo(Math.PI / 6, 9);
  expect(m.userData.perMesh).toBeUndefined();           // perMesh는 재질을 만든 쪽이 찍는다
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
  // 벽 본체는 ExtrudeGeometry = 월드 uv(미터)라 repeat이 미터당 반복 수여야 벽돌이 230 × 60 mm로 나온다.
  expect(body.geometry.type).toBe('ExtrudeGeometry');
  expect(body.material.map.repeat.x).toBeCloseTo(1000 / 230, 9);
  expect(body.material.map.repeat.y).toBeCloseTo(1000 / 60, 9);
  // 방 안쪽 면은 직접 만든 쿼드다: uv가 없으면 무늬가 (0,0) 텍셀 한 점으로 뭉개진다.
  // uv는 벽 본체와 같은 벽 축 미터(u = w.a에서 잰 거리, v = 높이)라 repeat도 미터당 반복 수다.
  const faceUv = face.geometry.attributes.uv;
  expect(faceUv).toBeTruthy();
  expect(faceUv.count).toBe(4);
  expect(faceUv.itemSize).toBe(2);
  expect(face.material.map.repeat.y).toBeCloseTo(1000 / 1000, 9);   // 페인트 scale [1000, 1000]
  const [fu, fv] = uvSpan(face.geometry);
  expect(fv).toBeCloseTo(2.3, 6);                                   // 면 높이 2300 mm
  expect(fv * face.material.map.repeat.y).toBeCloseTo(2300 / 1000, 6); // 보이는 반복 수는 그대로
  expect(fu).toBeCloseTo(3.79, 6);                                  // 4000 − 양 끝 벽 105씩
});

test('바닥·천장은 방 재질을 쓰고 월드 uv 반복(미터당)을 쓴다', () => {
  // 벽 두께 200, 외곽 4200 × 3200 → 방 안쪽 바닥이 정확히 4000 × 3000 mm.
  const walls = rectWalls([0, 0], [4200, 3200], 200);
  const rooms = detectRooms(walls).map(r => ({ ...r, floorMat: assign('tile-white-300'), ceilingMat: null, hideCeiling: false }));
  const g = buildFloorGroup({ walls, rooms, height: 2300 }, { wallOpacity: 1 });
  const fl = g.children.find(c => c.name === 'floor');
  expect(fl.material.map).toBeTruthy();
  expect(g.children.find(c => c.name === 'ceiling').material.map).toBeNull(); // 지정이 없으면 색만
  // ShapeGeometry는 정점(미터)을 그대로 uv로 쓴다 → uv 범위가 곧 방 크기다.
  const [su, sv] = uvSpan(fl.geometry);
  expect(su).toBeCloseTo(4, 6);
  expect(sv).toBeCloseTo(3, 6);
  expect(fl.material.map.repeat.x).toBeCloseTo(1000 / 300, 9);
  expect(fl.material.map.repeat.y).toBeCloseTo(1000 / 300, 9);
  // 화면에 보이는 타일 수 = uv 범위 × repeat. 300 mm 타일이면 13.33 × 10장이어야 한다.
  expect(su * fl.material.map.repeat.x).toBeCloseTo(40 / 3, 6);
  expect(sv * fl.material.map.repeat.y).toBeCloseTo(10, 6);
});

test('월드 uv 면은 방이 커져도 무늬 한 칸 크기가 같다(타일 수만 늘어난다)', () => {
  const build = (wmm, hmm) => {
    const walls = rectWalls([0, 0], [wmm + 200, hmm + 200], 200);
    const rooms = detectRooms(walls).map(r => ({ ...r, floorMat: assign('tile-white-300'), hideCeiling: true }));
    return buildFloorGroup({ walls, rooms, height: 2300 }, { wallOpacity: 1 }).children.find(c => c.name === 'floor');
  };
  const small = build(2000, 2000), big = build(6000.5, 4000);
  expect(big.material.map.repeat.x).toBeCloseTo(small.material.map.repeat.x, 9); // 반복 배율은 면 크기와 무관
  expect(uvSpan(small.geometry)[0] * small.material.map.repeat.x).toBeCloseTo(2000 / 300, 6);
  // 소수 크기: 방 폴리곤이 0.5 mm 단위로 정리되므로 타일 0.01장 안에서만 맞춘다.
  expect(uvSpan(big.geometry)[0] * big.material.map.repeat.x).toBeCloseTo(6000.5 / 300, 2);
});

// BoxGeometry 한 면의 uv 범위. uv가 벽 축 미터라 면마다 다르다(0~1이 아니다).
function faceUvSpan(geo, materialIndex) {
  const uv = geo.attributes.uv, vs = boxFaceVerts(geo, materialIndex);
  const us = vs.map(i => uv.getX(i)), ws = vs.map(i => uv.getY(i));
  return [Math.max(...us) - Math.min(...us), Math.max(...ws) - Math.min(...ws)];
}

test('개구부가 있는 벽 조각의 uv는 벽 축 미터라 조각마다 무늬 실치수가 같다', async () => {
  const { createItem } = await import('../src/state/schema.js');
  const { productById } = await import('../src/products/catalog.js');
  const walls = rectWalls([0, 0], [4000, 3000], 200).map(w => ({ ...w, matOut: assign('brick-red') }));
  const target = walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  const items = [createItem(productById('door-swing-900'), { wallId: target.id, t: 0.5, pos: [2000, 0] })];
  const g = buildFloorGroup({ walls, rooms: detectRooms(walls), items, height: 2300 }, { wallOpacity: 1, v3: {} });
  const pieces = g.children.filter(c => c.name === 'wall' && c.userData.wallId === target.id);
  expect(pieces).toHaveLength(3);
  expect(pieces.every(c => c.geometry.type === 'BoxGeometry')).toBe(true);
  // 반복 배율은 조각 크기와 무관한 미터당 반복 수고, 보이는 벽돌 수 = uv 범위 × repeat이다.
  for (const p of pieces) {
    expect(p.material.map.repeat.x).toBeCloseTo(1000 / 230, 6);
    expect(p.material.map.repeat.y).toBeCloseTo(1000 / 60, 6);
    const { width, height } = p.geometry.parameters;
    const [su, sv] = faceUvSpan(p.geometry, 4);        // 앞면(+z) = 벽 한쪽 면
    expect(su).toBeCloseTo(width, 5);                  // uv 범위가 곧 조각 크기(m). 정점은 float32다
    expect(sv).toBeCloseTo(height, 5);
    expect(su * p.material.map.repeat.x).toBeCloseTo((width * 1000) / 230, 4);
    expect(sv * p.material.map.repeat.y).toBeCloseTo((height * 1000) / 60, 4);
  }
  // 인방(문 위 200 mm)에는 벽돌이 3.33줄만 들어간다 — 벽 전체 크기로 반복을 잡으면 38줄이 된다.
  const lintel = pieces.find(p => p.geometry.parameters.height < 0.5);
  expect(faceUvSpan(lintel.geometry, 4)[1] * lintel.material.map.repeat.y).toBeCloseTo(200 / 60, 4);
  const side = pieces.find(p => p.geometry.parameters.height > 2);
  expect(faceUvSpan(side.geometry, 4)[1] * side.material.map.repeat.y).toBeCloseTo(2300 / 60, 4);
  // 개구부 단면(±x)·인방 밑(±y)도 실치수다: 두께 200 mm만큼 펼친 좌표를 쓴다.
  expect(faceUvSpan(lintel.geometry, 3)[1]).toBeCloseTo(0.2, 5);
  expect(faceUvSpan(side.geometry, 0)[0]).toBeCloseTo(0.2, 5);
  disposeGroup(g);
});

test('벽 본체 측벽 uv는 축 투영이 아니라 벽을 따라 잰 거리다(기울어진 벽, 소수 길이)', () => {
  const L = 3000.5;                                   // 소수 길이 — 벽 축 거리를 그대로 uv로 쓰는지 본다
  const body = deg => {
    const r = (deg * Math.PI) / 180;
    const w = { ...makeWall({ a: [100.5, 200.25], b: [100.5 + Math.cos(r) * L, 200.25 + Math.sin(r) * L], thickness: 200 }), matOut: assign('brick-red') };
    return buildFloorGroup({ walls: [w], rooms: [], items: [], height: 2300 }, { wallOpacity: 1, v3: {} }).children.find(c => c.name === 'wall');
  };
  for (const deg of [0, 30, 45, 60, 90]) {
    const b = body(deg);
    const { u0, u1, v0, v1 } = sideUv(b.geometry);
    expect(u0, `${deg}°`).toBeCloseTo(0, 5);                          // 벽 시작점 w.a가 u = 0
    expect(u1 - u0, `${deg}°`).toBeCloseTo(L / 1000, 5);              // 지배 축에 투영하면 45°에서 2.1217 m로 줄어든다
    expect(v0, `${deg}°`).toBeCloseTo(0, 5);                          // 바닥이 v = 0 (three 기본 생성기는 1 − z라 −1.3)
    expect(v1, `${deg}°`).toBeCloseTo(2.3, 5);
    // 보이는 벽돌 수 = uv 범위 × repeat. 적벽돌 230 × 60 mm가 각도와 무관하게 실치수로 나와야 한다
    // (기본 생성기는 45°에서 9.838장 = 한 장 305 mm, 1.414배).
    expect((u1 - u0) * b.material.map.repeat.x, `${deg}°`).toBeCloseTo(L / 230, 4);
    expect((v1 - v0) * b.material.map.repeat.y, `${deg}°`).toBeCloseTo(2300 / 60, 4);
  }
});

// 렌더가 실제로 쓰는 uv 행렬(offset·repeat·rotation·center)로 텍셀을 구한다.
const texel = (map, u, v) => { map.updateMatrix(); const p = new THREE.Vector3(u, v, 1).applyMatrix3(map.matrix); return [p.x, p.y]; };
const frac = x => ((x % 1) + 1) % 1;
const sameTexel = (a, b, msg = '') => {
  const near = (x, y) => Math.abs(frac(x) - frac(y)) < 1e-4 || Math.abs(frac(x) - frac(y)) > 1 - 1e-4;   // 정점이 float32
  for (let i = 0; i < 2; i++) expect(near(a[i], b[i]), `${msg}: ${a} vs ${b}`).toBe(true);
};
const expectUv = (got, want, msg) => { expect(got[0], msg).toBeCloseTo(want[0], 5); expect(got[1], msg).toBeCloseTo(want[1], 5); };
// BoxGeometry 한 면에서 로컬 좌표가 극값인 꼭짓점의 uv.
const cornerUv = (mesh, mi, maxX, maxY) => {
  const pos = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
  const vs = boxFaceVerts(mesh.geometry, mi);
  const x = Math[maxX ? 'max' : 'min'](...vs.map(i => pos.getX(i))), y = Math[maxY ? 'max' : 'min'](...vs.map(i => pos.getY(i)));
  const i = vs.find(k => pos.getX(k) === x && pos.getY(k) === y);
  return [uv.getX(i), uv.getY(i)];
};

test('개구부 조각의 무늬 위상이 문 없는 벽과 이어진다(소수 좌표, 무늬를 돌려도)', async () => {
  const { createItem } = await import('../src/state/schema.js');
  const { productById } = await import('../src/products/catalog.js');
  const mk = angle => rectWalls([0.5, 0.25], [4000.5, 3000.75], 200).map(w => ({ ...w, matOut: assign('brick-red', { offset: [46, 15], angle }) }));
  // 무늬를 돌리면 회전 중심이 uv 원점이다. 조각마다 원점이 다르면(0~1 uv + uvShift) 30°에서 문을
  // 건너는 동안 위상이 어긋났다 — 벽 축 미터 uv는 원점이 벽 하나뿐이라 각도와 무관하게 이어진다.
  for (const angle of [0, 30]) {
    const walls = mk(angle);
    const target = walls[0];                                  // [0.5, 0.25] → [4000.5, 0.25], 길이 4000
    const items = [createItem(productById('door-swing-900'), { wallId: target.id, t: 0.5, pos: [2000.5, 0.25] })];
    const g = buildFloorGroup({ walls, rooms: detectRooms(walls), items, height: 2300 }, { wallOpacity: 1, v3: {} });
    const [left, lintel, right] = g.children
      .filter(c => c.name === 'wall' && c.userData.wallId === target.id)
      .sort((a, b) => a.position.x - b.position.x);
    const plain = mk(angle);
    const pg = buildFloorGroup({ walls: plain, rooms: detectRooms(plain), height: 2300 }, { wallOpacity: 1 });
    const bodyMap = pg.children.find(c => c.name === 'wall' && c.userData.wallId === plain[0].id).material.map;
    // 문 900이 벽 가운데(u 1550~2450). 조각의 uv는 벽 축 미터라 그 자리 값이 그대로 들어 있다.
    expectUv(cornerUv(right, 4, false, false), [2.45, 0], `${angle}° 오른쪽`);
    expectUv(cornerUv(left, 4, true, false), [1.55, 0], `${angle}° 왼쪽`);
    expectUv(cornerUv(lintel, 4, false, false), [1.55, 2.1], `${angle}° 인방`);
    expect(cornerUv(lintel, 4, true, true)[1]).toBeCloseTo(2.3, 6);
    // 벽 양면 모두 u가 "벽 시작점 → 끝점"으로 흐른다(뒷면 −z도 같은 u를 쓴다).
    for (const mi of [4, 5]) expectUv(cornerUv(right, mi, false, false), [2.45, 0], `${angle}° face ${mi}`);
    // 조각·본체가 같은 uv 규약이라 repeat·offset·rotation이 모두 같은 값이고, 위상이 저절로 맞는다.
    for (const [nm, pc] of [['왼쪽', left], ['인방', lintel], ['오른쪽', right]]) {
      expect(pc.material.map.repeat.x, `${angle}° ${nm}`).toBeCloseTo(bodyMap.repeat.x, 9);
      expect(pc.material.map.offset.x, `${angle}° ${nm}`).toBeCloseTo(bodyMap.offset.x, 9);
      expect(pc.material.map.rotation, `${angle}° ${nm}`).toBeCloseTo(bodyMap.rotation, 9);
    }
    // 문 양옆 조각이 만나는 자리(문 좌우 끝)의 텍셀이 문 없는 벽의 같은 자리와 한 칸 위상이다.
    sameTexel(texel(right.material.map, ...cornerUv(right, 4, false, false)), texel(bodyMap, 2.45, 0), `${angle}° 오른쪽`);
    sameTexel(texel(left.material.map, ...cornerUv(left, 4, true, false)), texel(bodyMap, 1.55, 0), `${angle}° 왼쪽`);
    sameTexel(texel(lintel.material.map, ...cornerUv(lintel, 4, false, false)), texel(bodyMap, 1.55, 2.1), `${angle}° 인방`);
    disposeGroup(g); disposeGroup(pg);
  }
});

test('floorOffset ≠ 0이어도 안쪽 면 조각의 무늬 위상이 벽 본체와 이어진다(무늬를 돌려도)', async () => {
  const { createItem } = await import('../src/state/schema.js');
  const { productById } = await import('../src/products/catalog.js');
  for (const angle of [0, 30]) {
    const mat = () => assign('brick-red', { offset: [46, 15], angle });
    const walls = rectWalls([0.5, 0.25], [4000.5, 3000.75], 200).map(w => ({ ...w, matIn: mat(), matOut: mat() }));
    const target = walls.find(w => w.a[1] === 0.25 && w.b[1] === 0.25);   // 길이 4000, 문은 u 1550~2450
    const items = [createItem(productById('door-swing-900'), { wallId: target.id, t: 0.5, pos: [2000.5, 0.25] })];
    // floorOffset은 바닥/방 메시를 위로 띄울 뿐, 벽면 uv는 늘 벽 밑(z) 기준이어야 한다.
    const rooms = detectRooms(walls).map(r => ({ ...r, floorOffset: 300 }));
    const g = buildFloorGroup({ walls, rooms, items, height: 2300 }, { wallOpacity: 1, v3: {} });
    const pieces = g.children.filter(c => c.name === 'wallFace' && c.userData.wallId === target.id).sort((a, b) => a.position.x - b.position.x);
    expect(pieces).toHaveLength(3);                                     // 좌 · 인방 · 우
    const body = g.children.find(c => c.name === 'wall' && c.userData.wallId === target.id);
    // 문 좌우 끝·인방 밑의 텍셀이 floorOffset과 무관하게 벽 본체의 같은 자리(u, z)와 한 무늬 칸 위상이다.
    sameTexel(texel(pieces[2].material.map, 2.45, 0), texel(body.material.map, 2.45, 0), `${angle}° floorOffset 300 오른쪽`);
    sameTexel(texel(pieces[0].material.map, 1.55, 0), texel(body.material.map, 1.55, 0), `${angle}° floorOffset 300 왼쪽`);
    sameTexel(texel(pieces[1].material.map, 1.55, 2.1), texel(body.material.map, 1.55, 2.1), `${angle}° floorOffset 300 인방`);
    disposeGroup(g);
  }
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
  // 영역 평면의 uv도 벽 축 미터(u = w.a에서 잰 거리, v = 높이)다 → 반복은 미터당 반복 수,
  // 보이는 타일 수 = uv 범위 × repeat. 영역 크기가 달라도 타일 실치수가 같다.
  expect(uvSpan(band.geometry)[0]).toBeCloseTo(4, 6);
  expect(uvSpan(band.geometry)[1]).toBeCloseTo(1.2, 6);
  expect(band.material.map.repeat.x).toBeCloseTo(1000 / 300, 6);
  expect(uvSpan(band.geometry)[0] * band.material.map.repeat.x).toBeCloseTo(4000 / 300, 6);   // 4000 mm 띠 / 300 타일
  expect(uvSpan(band.geometry)[1] * band.material.map.repeat.y).toBeCloseTo(1200 / 300, 6);
  expect(uvSpan(rect.geometry)[0] * rect.material.map.repeat.x).toBeCloseTo(1000 / 230, 5);   // 1500.5 - 500.5 = 1000 / 적벽돌 230
  expect(uvSpan(rect.geometry)[1] * rect.material.map.repeat.y).toBeCloseTo(600 / 60, 5);
  // 벽 축 좌표라 uv 값 자체가 영역이 벽에서 있는 자리다(0~1 uv면 늘 0~1이었다).
  const ruv = rect.geometry.attributes.uv;
  const rus = [...Array(ruv.count).keys()].map(i => ruv.getX(i)), rvs = [...Array(ruv.count).keys()].map(i => ruv.getY(i));
  expect(Math.min(...rus)).toBeCloseTo(0.5005, 4);   // u0 500.5 mm
  expect(Math.min(...rvs)).toBeCloseTo(0.3, 5);      // z0 300 mm
  disposeGroup(g);
});

test('재질이 없는 영역은 평면을 만들지 않는다', () => {
  const walls = rectWalls([0, 0], [4000, 3000], 200);
  walls[0].regions = {
    in: [{ id: 'rg1', kind: 'rect', u0: 0, u1: 1000, z0: 0, z1: 1000, mat: null },
         { id: 'rg2', kind: 'rect', u0: 1200.5, u1: 2200.5, z0: 0, z1: 1000, mat: assign('brick-red') }],
    out: [{ id: 'rg3', kind: 'band', u0: 0, u1: 4000, z0: 0, z1: 900 }],   // mat 키 자체가 없는 옛 데이터
  };
  const g = buildFloorGroup({ walls, rooms: detectRooms(walls), height: 2300 }, { wallOpacity: 1 });
  const regions = g.children.filter(c => c.name === 'wallRegion');
  expect(regions).toHaveLength(1);                     // 재질 있는 rg2 하나만
  expect(regions[0].userData.regionId).toBe('rg2');
  expect(regions[0].material.map).toBeTruthy();
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

// --- 방 안쪽 면(wallFace)·영역도 개구부를 피해 쪼갠다 -----------------------------------------
// 통판이면 벽 본체가 뚫어 놓은 문·창을 방 쪽에서 도로 막아 고정창이 실내에서 안 보였다.
const doorFloor = async (extra = {}) => {
  const { createItem } = await import('../src/state/schema.js');
  const { productById } = await import('../src/products/catalog.js');
  const walls = rectWalls([0.5, 0.25], [4000.5, 3000.75], 200).map(w => ({ ...w, ...extra }));
  const target = walls.find(w => w.a[1] === 0.25 && w.b[1] === 0.25);   // 길이 4000, 문은 u 1550~2450
  const items = [createItem(productById('door-swing-900'), { wallId: target.id, t: 0.5, pos: [2000.5, 0.25] })];
  return { walls, target, g: buildFloorGroup({ walls, rooms: detectRooms(walls), items, height: 2300 }, { wallOpacity: 1, v3: {} }) };
};
// 메시 정점을 벽 축 좌표 [u(mm), z(mm)]로 되돌린다(three (x, y, z) = (동쪽 m, 높이 m, 남쪽 m)).
const wallUZ = (mesh, wall, i) => {
  const a = mesh.geometry.attributes.position;
  const dx = a.getX(i) * 1000 - wall.a[0], dy = a.getZ(i) * 1000 - wall.a[1];
  const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  return [(dx * (wall.b[0] - wall.a[0]) + dy * (wall.b[1] - wall.a[1])) / len, a.getY(i) * 1000];
};

test('문이 있는 벽의 방 안쪽 면은 세 조각으로 쪼개지고 문 구멍을 덮지 않는다', async () => {
  const { target, g } = await doorFloor();
  const faces = g.children.filter(c => c.name === 'wallFace' && c.userData.wallId === target.id);
  expect(faces).toHaveLength(3);                                  // 좌 · 인방 · 우
  expect(faces.every(f => typeof f.userData.roomId === 'string')).toBe(true);
  for (const f of faces) {
    for (let i = 0; i < f.geometry.attributes.position.count; i++) {
      const [u, z] = wallUZ(f, target, i);
      expect(u > 1550.5 && u < 2449.5 && z > 0.5 && z < 2099.5, `정점 ${i} (${u}, ${z})가 문 안에 있다`).toBe(false);
    }
  }
  // 어느 조각도 문 구멍(가운데 u 2000, z 1000)을 덮지 않는다 — 통판이던 옛 코드가 걸리는 검사다.
  for (const f of faces) {
    const uz = [...Array(4).keys()].map(i => wallUZ(f, target, i));
    const u = uz.map(x => x[0]), z = uz.map(x => x[1]);
    expect(Math.min(...u) < 2000 && Math.max(...u) > 2000 && Math.min(...z) < 1000 && Math.max(...z) > 1000).toBe(false);
  }
  // 조각 높이: 인방은 문 위 200 mm(2100~2300), 양옆은 바닥부터 천장까지.
  const hs = faces.map(f => { const zs = [...Array(4).keys()].map(i => wallUZ(f, target, i)[1]); return Math.max(...zs) - Math.min(...zs); }).sort((a, b) => a - b);
  expect(hs[0]).toBeCloseTo(200, 3);      // 정점은 float32라 mm 소수 넷째 자리까지만 본다
  expect(hs[1]).toBeCloseTo(2300, 3);
  expect(g.children.filter(c => c.name === 'wallFace')).toHaveLength(3 + 3);   // 나머지 세 벽은 통면 그대로
  disposeGroup(g);
});

test('개구부가 없는 벽의 안쪽 면은 쿼드 하나고 uv는 벽 축 미터다', async () => {
  const { walls, target, g } = await doorFloor();
  const other = walls.find(w => w.id !== target.id);
  const faces = g.children.filter(c => c.name === 'wallFace' && c.userData.wallId === other.id);
  expect(faces).toHaveLength(1);
  expect(faces[0].geometry.attributes.uv.count).toBe(4);
  const [su, sv] = uvSpan(faces[0].geometry);
  // u 범위 = 면 길이(m), v 범위 = 면 높이(m). 3000.5 벽이라 짧은 쪽 면은 3000.5 − 210.
  const len = faces[0].geometry.attributes.position;
  expect(su).toBeCloseTo(Math.hypot(len.getX(1) - len.getX(0), len.getZ(1) - len.getZ(0)), 5);
  expect(sv).toBeCloseTo(2.3, 5);
  disposeGroup(g);
});

test('안쪽 면 조각의 uv도 벽 축 미터라 본체·통면과 위상이 이어진다(무늬를 돌려도)', async () => {
  for (const angle of [0, 30]) {
    const mat = () => assign('brick-red', { offset: [46, 15], angle });
    const { target, g } = await doorFloor({ matIn: mat(), matOut: mat() });
    const plainWalls = rectWalls([0.5, 0.25], [4000.5, 3000.75], 200).map(w => ({ ...w, matIn: mat() }));
    const plainT = plainWalls.find(w => w.a[1] === 0.25 && w.b[1] === 0.25);
    const pg = buildFloorGroup({ walls: plainWalls, rooms: detectRooms(plainWalls), height: 2300 }, { wallOpacity: 1 });
    const plain = pg.children.find(c => c.name === 'wallFace' && c.userData.wallId === plainT.id);
    const pieces = g.children.filter(c => c.name === 'wallFace' && c.userData.wallId === target.id).sort((a, b) => a.position.x - b.position.x);
    const body = g.children.find(c => c.name === 'wall' && c.userData.wallId === target.id);
    const uvs = m => { const a = m.geometry.attributes.uv; return [...Array(a.count).keys()].map(i => [a.getX(i), a.getY(i)]); };
    // 조각의 uv는 벽 축 자리 그대로다: 문(u 1550~2450, z 0~2100)의 경계가 조각 모서리로 들어 있다.
    expect(Math.max(...uvs(pieces[0]).map(p => p[0])), `${angle}° 왼쪽`).toBeCloseTo(1.55, 5);
    expect(Math.min(...uvs(pieces[2]).map(p => p[0])), `${angle}° 오른쪽`).toBeCloseTo(2.45, 5);
    expect(Math.min(...uvs(pieces[1]).map(p => p[1])), `${angle}° 인방`).toBeCloseTo(2.1, 5);
    expect(Math.min(...uvs(pieces[0]).map(p => p[0])), `${angle}° 면 끝`).toBeCloseTo(0.1055, 4);  // 방 폴리곤이 5 mm 더 들어간다
    // 안쪽 면·통면·벽 본체가 모두 같은 uv 규약이라 map 설정이 같고 위상이 저절로 맞는다.
    for (const [nm, m] of [['왼쪽', pieces[0]], ['인방', pieces[1]], ['오른쪽', pieces[2]], ['통면', plain], ['본체', body]]) {
      expect(m.material.map.repeat.x, `${angle}° ${nm}`).toBeCloseTo(1000 / 230, 9);
      expect(m.material.map.offset.x, `${angle}° ${nm}`).toBeCloseTo(46 / 230, 9);
      expect(m.material.map.rotation, `${angle}° ${nm}`).toBeCloseTo((angle * Math.PI) / 180, 9);
    }
    // 문 좌우 끝의 텍셀이 문 없는 통면의 같은 자리와 한 무늬 칸 위상이다(회전 각도가 있어도).
    sameTexel(texel(pieces[2].material.map, 2.45, 0), texel(plain.material.map, 2.45, 0), `${angle}° 오른쪽`);
    sameTexel(texel(pieces[0].material.map, 1.55, 0), texel(plain.material.map, 1.55, 0), `${angle}° 왼쪽`);
    sameTexel(texel(pieces[1].material.map, 1.55, 2.1), texel(body.material.map, 1.55, 2.1), `${angle}° 인방`);
    disposeGroup(g); disposeGroup(pg);
  }
});

test('영역도 개구부를 피해 쪼개지고, 개구부 안에 잠긴 영역은 사라진다', async () => {
  const { createItem } = await import('../src/state/schema.js');
  const { productById } = await import('../src/products/catalog.js');
  const walls = rectWalls([0, 0], [4000, 3000], 200);
  const target = walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  target.regions = {
    in: [{ id: 'band', kind: 'band', u0: 0, u1: 4000, z0: 0, z1: 900, mat: assign('tile-white-300') }],
    out: [{ id: 'inside', kind: 'rect', u0: 1600, u1: 2400, z0: 200, z1: 800, mat: assign('brick-red') }],
  };
  const items = [createItem(productById('door-swing-900'), { wallId: target.id, t: 0.5, pos: [2000, 0] })];
  const g = buildFloorGroup({ walls, rooms: detectRooms(walls), items, height: 2300 }, { wallOpacity: 1, v3: {} });
  const regions = g.children.filter(c => c.name === 'wallRegion');
  expect(regions.filter(r => r.userData.regionId === 'inside')).toHaveLength(0);  // 문 안에 완전히 잠겼다
  const band = regions.filter(r => r.userData.regionId === 'band').sort((a, b) => a.position.x - b.position.x);
  expect(band).toHaveLength(2);                                   // 문 좌 · 우
  expect(band.every(r => r.userData.side === 'in' && r.userData.wallId === target.id)).toBe(true);
  expect(band[0].geometry.parameters.width).toBeCloseTo(1.55, 6);
  expect(band[1].geometry.parameters.width).toBeCloseTo(1.55, 6); // 4000 − 2450
  expect(band.every(r => r.geometry.parameters.height === 0.9)).toBe(true);
  expect(band[1].position.x).toBeCloseTo((2450 + 4000) / 2 / 1000, 6);
  // uv가 벽 축 미터라 무늬 위상은 띠 전체와 저절로 이어진다: 오른쪽 조각의 uv가 2.45에서 시작한다.
  const uOf = m => { const a = m.geometry.attributes.uv; return [...Array(a.count).keys()].map(i => a.getX(i)); };
  expect(Math.max(...uOf(band[0]))).toBeCloseTo(1.55, 5);
  expect(Math.min(...uOf(band[1]))).toBeCloseTo(2.45, 5);
  expect(band[0].material.map.offset.x).toBeCloseTo(band[1].material.map.offset.x, 9);
  expect(band[0].material.map.repeat.x).toBeCloseTo(1000 / 300, 9);
  // 창(z 900~2100)은 z가 겹치지 않으니 z 0~900 띠를 나누지 않는다.
  const w2 = rectWalls([0, 0], [4000, 3000], 200);
  const t2 = w2.find(w => w.a[1] === 0 && w.b[1] === 0);
  t2.regions = { in: [{ id: 'band', kind: 'band', u0: 0, u1: 4000, z0: 0, z1: 900, mat: assign('tile-white-300') }], out: [] };
  const it2 = [createItem(productById('window-slide-1200'), { wallId: t2.id, t: 0.5, pos: [2000, 0] })];
  const g2 = buildFloorGroup({ walls: w2, rooms: detectRooms(w2), items: it2, height: 2300 }, { wallOpacity: 1, v3: {} });
  expect(g2.children.filter(c => c.name === 'wallRegion')).toHaveLength(1);
  disposeGroup(g); disposeGroup(g2);
});

// §13.4: 성능 모드는 라벨·윤곽선을 렌더에서 생략하므로 씬을 다시 지어야 한다.
test('sceneSignature는 성능 모드가 바뀌면 달라진다', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  const before = sceneSignature(store.get());
  store.dispatch(d => { d.view.perfMode = 'performance'; }, { record: false });
  expect(sceneSignature(store.get())).not.toBe(before);
  store.dispatch(d => { d.view.perfMode = 'display'; }, { record: false });
  expect(sceneSignature(store.get())).toBe(before);
});

// §13.3: 배정의 scale이 재질의 기본 무늬 크기를 덮어쓴다(견적 면적은 영향 없음 — 계산에 안 쓴다).
test('assignScale과 faceRepeat가 assignment.scale을 우선한다(소수 크기)', () => {
  const tile = materialById('tile-white-300');                 // scale [300, 300]
  expect(assignScale({ id: 'tile-white-300', scale: [600, 450] }, tile)).toEqual([600, 450]);
  expect(assignScale({ id: 'tile-white-300' }, tile)).toEqual([300, 300]);
  expect(assignScale({ id: 'tile-white-300', scale: ['a', 5] }, tile)).toEqual([300, 300]);
  expect(assignScale(null, null)).toEqual([1000, 1000]);
  expect(faceRepeat(tile, [3000, 2400])).toEqual([10, 8]);
  expect(faceRepeat(tile, [3000, 2400], { scale: [600, 600] })).toEqual([5, 4]);
  expect(faceRepeat(tile, [3000.5, 2400], { scale: [100, 100] })[0]).toBeCloseTo(30.005, 9);
  expect(faceRepeat(tile, null, { worldUv: true, scale: [500, 250] })).toEqual([2, 4]);
});

test('applyAssignment는 assignment.scale로 반복·오프셋을 잡고 텍스처 캐시 키를 나눈다', () => {
  const m = new THREE.MeshStandardMaterial();
  applyAssignment(m, { id: 'tile-white-300', offset: [150, 0], angle: 0, scale: [600, 600] }, [3000, 2400]);
  expect(m.map.repeat.x).toBeCloseTo(5, 9);
  expect(m.map.repeat.y).toBeCloseTo(4, 9);
  expect(m.map.offset.x).toBeCloseTo(0.25, 9);                 // 150 / 600
  const base = materialTexture('tile-white-300');
  const scaled = materialTexture('tile-white-300', { scale: [600, 600] });
  expect(scaled).not.toBe(base);                               // 키가 다르다
  expect(materialTexture('tile-white-300', { scale: [600, 600] })).toBe(scaled);
});
