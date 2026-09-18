// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { createFacePicker, targetOf, FACE_NAMES } from '../src/view3d/facePick.js';

// 평면 하나로 이루어진 가짜 층 그룹: 레이캐스트가 확실히 맞도록 위에서 내려보는 직교 카메라를 쓴다.
function fakeGroup({ wallId, roomId, mesh = 'floor', side = null }) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial());
  m.rotation.x = -Math.PI / 2;                 // 바닥처럼 눕힌다
  m.name = mesh;
  if (wallId) m.userData.wallId = wallId;
  if (roomId) m.userData.roomId = roomId;
  if (side) m.userData.side = side;
  g.add(m);
  const items = new THREE.Group(); items.name = 'items'; g.add(items);
  return { g, items, m };
}
function setup({ mesh = 'floor', side = null, mode = 'iso' } = {}) {
  const store = createStore(createEmptyProject()), ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  const f = activeFloor(store.get());
  const { g, items } = fakeGroup({ wallId: mesh === 'floor' || mesh === 'ceiling' ? null : f.walls[0].id, roomId: mesh === 'floor' || mesh === 'ceiling' ? f.rooms[0].id : null, mesh, side });
  const domElement = document.createElement('div');
  document.body.appendChild(domElement);
  domElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 });
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 10, 0); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const scene = new THREE.Scene(); scene.add(g);
  const menu = [];
  const picker = createFacePicker({
    renderer: { domElement }, getCamera: () => camera, scene, getGroup: () => g, store, ui,
    openMenu: (x, y, items2) => menu.push({ x, y, items: items2 }),
    surfaceActions: { openEditor: () => {}, replaceMaterial: () => {}, applyTemplate: () => {} },
    getMode: () => mode,
  });
  const click = (x = 100, y = 100, to = null) => {
    domElement.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: x, clientY: y }));
    const [ux, uy] = to ?? [x, y];
    domElement.dispatchEvent(new MouseEvent('pointerup', { button: 0, clientX: ux, clientY: uy }));
  };
  const rightClick = (opts = {}) => {
    const ev = new MouseEvent('contextmenu', { button: 2, clientX: 100, clientY: 100, cancelable: true });
    if (opts.prevented) ev.preventDefault();
    domElement.dispatchEvent(ev);
    return ev;
  };
  return { store, ui, picker, click, rightClick, menu, items, domElement, floor: () => activeFloor(store.get()), wallId: f.walls[0].id, roomId: f.rooms[0].id };
}
const mat = id => ({ id, offset: [0, 0], angle: 0 });
const labels = items => items.filter(x => x !== 'sep').map(x => x.label);

describe('3D 면 피커', () => {
  test('targetOf와 FACE_NAMES', () => {
    expect(targetOf({ kind: 'wall', id: 'w1', side: 'out' })).toEqual({ kind: 'wall', id: 'w1', side: 'out' });
    expect(targetOf({ kind: 'wall', id: 'w1' })).toEqual({ kind: 'wall', id: 'w1', side: 'in' });     // side 기본값
    expect(targetOf({ kind: 'floor', id: 'r1' })).toEqual({ kind: 'floor', id: 'r1' });
    expect(targetOf({ kind: 'ceiling', id: 'r1' })).toEqual({ kind: 'ceiling', id: 'r1' });           // 천장 분기
    // hit의 roomId는 target에 남지 않는다(materialOps의 target 모양은 kind·id·side뿐이다).
    expect(targetOf({ kind: 'wall', id: 'w1', side: 'out', roomId: 'r1' })).toEqual({ kind: 'wall', id: 'w1', side: 'out' });
    for (const n of ['wall', 'wallFace', 'wallRegion', 'floor', 'ceiling', 'wallTop']) expect(FACE_NAMES.has(n)).toBe(true);
    expect(FACE_NAMES.has('item')).toBe(false);
  });

  test('바닥을 클릭하면 방이 선택된다', () => {
    const a = setup({ mesh: 'floor' });
    a.click();
    expect(a.ui.get().selection).toEqual({ type: 'room', id: a.roomId });
  });

  test('벽면을 클릭하면 벽이 선택되고 side는 메시가 들고 있던 값이다', () => {
    const a = setup({ mesh: 'wallRegion', side: 'out' });
    expect(a.picker.hitAt({ clientX: 100, clientY: 100 })).toEqual({ kind: 'wall', id: a.wallId, side: 'out', roomId: null });
    a.click();
    expect(a.ui.get().selection).toEqual({ type: 'wall', id: a.wallId });
    const b = setup({ mesh: 'wallFace' });
    expect(b.picker.hitAt({ clientX: 100, clientY: 100 }).side).toBe('in');  // 방 안쪽 면은 내벽
    const c = setup({ mesh: 'wall' });
    expect(c.picker.hitAt({ clientX: 100, clientY: 100 }).side).toBe('out'); // 벽 본체는 외벽
  });

  test('적용 모드에서는 클릭이 그 면 하나에 재질을 바르고 모드가 유지된다', () => {
    const a = setup({ mesh: 'wall' });
    a.ui.set({ matPick: { assignment: mat('brick-red') } });
    a.click();
    const w = a.floor().walls.find(x => x.id === a.wallId);
    expect(w.matOut.id).toBe('brick-red');
    expect(w.matIn).toBeNull();                 // 3D는 클릭한 면만 바른다
    expect(a.ui.get().matPick).not.toBeNull();
    expect(a.ui.get().selection).toBeNull();
    const b = setup({ mesh: 'floor' });
    b.ui.set({ matPick: { assignment: mat('wood-oak') } });
    b.click();
    expect(b.floor().rooms[0].floorMat.id).toBe('wood-oak');
  });

  test('아이템을 맞히면 면 피커는 손대지 않는다(아이템 피커 담당)', () => {
    const a = setup({ mesh: 'floor' });
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    box.position.set(0, 1, 0); box.name = 'item'; box.userData.itemId = 'i1';
    a.items.add(box);
    a.click();
    expect(a.ui.get().selection).toBeNull();
    expect(a.picker.hitAt({ clientX: 100, clientY: 100 })).toEqual({ kind: 'item', id: 'i1' });
  });

  test('궤도 회전(4px 초과 이동)과 1인칭에서는 아무 일도 없다', () => {
    const a = setup({ mesh: 'floor' });
    a.click(100, 100, [140, 100]);
    expect(a.ui.get().selection).toBeNull();
    const b = setup({ mesh: 'floor', mode: 'fp' });
    b.click();
    expect(b.ui.get().selection).toBeNull();
  });

  test('우클릭은 3D 벽 메뉴를 열고, 이미 처리된 이벤트는 건너뛴다', () => {
    const a = setup({ mesh: 'wall' });
    const ev = a.rightClick();
    expect(ev.defaultPrevented).toBe(true);
    expect(labels(a.menu[0].items)).toEqual(['벽 나누기', '곡선벽 전환', '재질 교체', '마감재 복사', '마감재 방 전체 벽에 적용', '마감재 편집기로 이동', '도면 뷰 전환', '삭제']);
    expect(a.ui.get().selection).toEqual({ type: 'wall', id: a.wallId });
    a.rightClick({ prevented: true });
    expect(a.menu).toHaveLength(1);
    const b = setup({ mesh: 'floor' });
    b.rightClick();
    expect(labels(b.menu[0].items)).toContain('템플릿 적용하기');
  });

  test('destroy가 리스너를 떼어낸다', () => {
    const a = setup({ mesh: 'floor' });
    a.picker.destroy();
    a.click();
    expect(a.ui.get().selection).toBeNull();
  });
});
