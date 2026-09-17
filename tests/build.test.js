import { test, expect, vi } from 'vitest';
import { rectWalls, makeWall } from "../src/geom/walls.js";
import { detectRooms } from '../src/geom/rooms.js';
import { buildFloorGroup, disposeGroup, sceneSignature, TRANSPARENT_OPACITY } from '../src/view3d/build.js';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls, addFloor, setActiveFloor } from "../src/state/floorOps.js";

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
