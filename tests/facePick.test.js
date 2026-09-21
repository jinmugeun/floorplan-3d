// @vitest-environment jsdom
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createFacePicker, targetOf, FACE_NAMES } from '../src/view3d/facePick.js';
import { createItemPicker, createDragLatch } from '../src/view3d/pick3d.js';
import { buildFloorGroup } from '../src/view3d/build.js';
import { applyMaterial } from '../src/state/materialOps.js';
import { addDuct } from '../src/state/ductOps.js';
import { setCanvasFactory, clearTextureCache } from '../src/materials/texture.js';

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
  return { store, ui, picker, click, rightClick, menu, items, domElement, g, floor: () => activeFloor(store.get()), wallId: f.walls[0].id, roomId: f.rooms[0].id };
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

  test('우클릭은 3D 벽·방 메뉴를 연다(다른 리스너가 먼저 막은 이벤트여도)', () => {
    const a = setup({ mesh: 'wall' });
    const ev = a.rightClick();
    expect(ev.defaultPrevented).toBe(true);
    expect(labels(a.menu[0].items)).toEqual(['벽 나누기', '곡선벽 전환', '재질 교체', '마감재 복사', '마감재 방 전체 벽에 적용', '마감재 편집기로 이동', '도면 뷰 전환', '삭제']);
    expect(a.ui.get().selection).toEqual({ type: 'wall', id: a.wallId });
    a.rightClick({ prevented: true });   // OrbitControls가 먼저 preventDefault 한 경우와 같다
    expect(a.menu).toHaveLength(2);      // defaultPrevented는 "아이템 메뉴가 이미 열렸다"의 신호가 아니다
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

// ── 실물 그룹·등록 순서·드래그 빗장 ──────────────────────────────────────────
// jsdom 캔버스에는 2D 컨텍스트가 없다: build.test.js와 같은 가짜 캔버스를 깔아 둔다.
function fakeCanvas() {
  const ctx = { fillStyle: '', strokeStyle: '', lineWidth: 1, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {} };
  return { width: 0, height: 0, getContext: () => ctx };
}
beforeAll(() => setCanvasFactory(fakeCanvas));
afterAll(() => { clearTextureCache(); setCanvasFactory(null); });

// 진짜 buildFloorGroup 위의 면 피커. 카메라를 옮겨 가며 바닥·벽 본체·방 안쪽 면을 겨눈다.
function realSetup({ matIn = null, orbit = false } = {}) {
  const store = createStore(createEmptyProject()), ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  const f0 = activeFloor(store.get());
  const south = f0.walls.find(w => w.a[1] === 0 && w.b[1] === 0);   // three 좌표로 z ≈ 0에 서 있는 벽
  if (matIn) applyMaterial(store, { kind: 'wall', id: south.id, side: 'in' }, mat(matIn));
  const f = activeFloor(store.get());
  const g = buildFloorGroup(f, store.get().view);
  const domElement = document.createElement('div');
  document.body.appendChild(domElement);
  domElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 });
  const scene = new THREE.Scene(); scene.add(g);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  const aim = (from, to, up = [0, 1, 0]) => { camera.up.set(...up); camera.position.set(...from); camera.lookAt(new THREE.Vector3(...to)); camera.updateMatrixWorld(); };
  const controls = orbit ? new OrbitControls(new THREE.PerspectiveCamera(50, 1, 0.1, 100), domElement) : null; // 면 피커보다 먼저 건다(view3d의 순서)
  const menu = [];
  const picker = createFacePicker({
    renderer: { domElement }, getCamera: () => camera, scene, getGroup: () => g, store, ui,
    openMenu: (x, y, its) => menu.push(its), surfaceActions: { openEditor: () => {}, replaceMaterial: () => {}, applyTemplate: () => {} },
  });
  const at = { clientX: 100, clientY: 100 };   // 화면 한가운데 = 카메라 중심을 지나는 광선
  return {
    store, ui, picker, menu, controls, domElement, at, south, roomId: f.rooms[0].id,
    aimFloor: () => aim([2.00025, 5, 1.500125], [2.00025, 0, 1.500125], [0, 0, -1]),      // 방 한가운데를 위에서
    aimWallBody: () => aim([2.00025, 1, -2.5], [2.00025, 1, 1]),                          // 바깥에서 벽 본체를
    aimWallFace: () => aim([2.00025, 1, 1.5], [2.00025, 1, -1]),                          // 방 안에서 벽 안쪽 면을
    click: () => {
      domElement.dispatchEvent(new MouseEvent('pointerdown', { button: 0, ...at }));
      domElement.dispatchEvent(new MouseEvent('pointerup', { button: 0, ...at }));
    },
    rightClick: () => { const ev = new MouseEvent('contextmenu', { button: 2, ...at, cancelable: true }); domElement.dispatchEvent(ev); return ev; },
  };
}

// 두 피커를 view3d와 같은 순서(아이템 → 면)로 한 요소에 건다.
function bothSetup({ mesh = 'floor', withItem = false } = {}) {
  const store = createStore(createEmptyProject()), ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  const f = activeFloor(store.get());
  const isRoom = mesh === 'floor' || mesh === 'ceiling';
  const { g, items } = fakeGroup({ wallId: isRoom ? null : f.walls[0].id, roomId: isRoom ? f.rooms[0].id : null, mesh });
  const domElement = document.createElement('div');
  document.body.appendChild(domElement);
  domElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 });
  // jsdom에는 포인터 캡처가 없다(TransformControls가 부른다).
  domElement.setPointerCapture = () => {}; domElement.releasePointerCapture = () => {}; domElement.hasPointerCapture = () => false;
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 10, 0); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const scene = new THREE.Scene(); scene.add(g);
  if (withItem) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    box.position.set(0, 1, 0); box.userData.itemId = 'i1'; items.add(box);
  }
  const dragLatch = createDragLatch();          // view3d가 두 피커에 같은 빗장을 준다
  const common = { renderer: { domElement }, getCamera: () => camera, scene, getGroup: () => g, store, ui, requestRender: () => {}, dragLatch };
  const itemPicker = createItemPicker({ ...common, controls: { enabled: true } });
  const facePicker = createFacePicker(common);  // 아이템 피커 다음이다
  const gizmo = scene.children.find(c => c.isTransformControlsRoot).controls;
  return {
    store, ui, itemPicker, facePicker, gizmo, wallId: f.walls[0].id, roomId: f.rooms[0].id,
    click: () => {
      domElement.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100, clientY: 100 }));
      domElement.dispatchEvent(new MouseEvent('pointerup', { button: 0, clientX: 100, clientY: 100 }));
    },
  };
}

describe('면 피커와 실물 그룹·다른 피커', () => {
  // I-1: build.js가 붙이는 이름(FACE_NAMES)과 userData(wallId/roomId/side) 계약을 진짜 그룹으로 지킨다.
  test('실물 buildFloorGroup의 바닥과 벽을 그대로 집는다', () => {
    const a = realSetup(); a.aimFloor();
    expect(a.picker.hitAt(a.at)).toEqual({ kind: 'floor', id: a.roomId });
    a.click();
    expect(a.ui.get().selection).toEqual({ type: 'room', id: a.roomId });

    const b = realSetup(); b.aimWallBody();
    expect(b.picker.hitAt(b.at)).toEqual({ kind: 'wall', id: b.south.id, side: 'out', roomId: null }); // 벽 본체 = 외벽
    b.click();
    expect(b.ui.get().selection).toEqual({ type: 'wall', id: b.south.id });
  });

  // 방 안쪽 면(wallFace)은 roomId를 들고 있어야 "마감재 방 전체 벽에 적용"이 산다.
  test('방 안쪽 벽면은 벽 + roomId를 주고 메뉴의 방 전체 적용이 켜진다', () => {
    const a = realSetup({ matIn: 'wood-oak' }); a.aimWallFace();
    expect(a.picker.hitAt(a.at)).toEqual({ kind: 'wall', id: a.south.id, side: 'in', roomId: a.roomId });
    a.rightClick();
    const all = a.menu[0].find(x => x !== 'sep' && x.label === '마감재 방 전체 벽에 적용');
    expect(all.disabled).toBeFalsy();
    expect(a.ui.get().selection).toEqual({ type: 'wall', id: a.south.id });
  });

  // C1 회귀: OrbitControls는 enabled인 동안 모든 contextmenu를 preventDefault 한다.
  // 그것을 "이미 처리됨"으로 읽으면 3D 면 메뉴가 영영 열리지 않았다.
  test('먼저 걸린 실물 OrbitControls가 막은 우클릭에서도 면 메뉴가 열린다', () => {
    const a = realSetup({ orbit: true }); a.aimWallBody();
    expect(a.controls.enabled).toBe(true);
    const ev = a.rightClick();
    expect(ev.defaultPrevented).toBe(true);        // OrbitControls가 먼저 막았다
    expect(a.menu).toHaveLength(1);                // 그래도 면 메뉴는 열린다
    expect(labels(a.menu[0])).toContain('재질 교체');
    a.controls.dispose();
  });

  // I-2: 등록 순서가 계약이다(아이템 → 면). 뒤집으면 아이템 피커의 selection: null이 나중에 덮어쓴다.
  test('등록 순서: 빈 바닥은 방, 아이템 위는 아이템으로 남는다', () => {
    const a = bothSetup({ mesh: 'floor' });
    a.click();
    expect(a.ui.get().selection).toEqual({ type: 'room', id: a.roomId });
    const b = bothSetup({ mesh: 'floor', withItem: true });
    b.click();
    expect(b.ui.get().selection).toEqual({ type: 'item', id: 'i1' });
  });

  // I-4: TransformControls는 pointerup을 막지 않는다. 빗장이 없으면 기즈모를 살짝 민 드래그가
  // 아이템 밖에서 끝날 때 뒤 벽이 선택되고 기즈모가 떨어졌다.
  test('기즈모 드래그로 끝난 클릭은 벽을 고르지 않는다(두 피커가 같은 빗장을 본다)', () => {
    const a = bothSetup({ mesh: 'wall' });
    a.ui.set({ selection: { type: 'item', id: 'i1' } });
    a.gizmo.dispatchEvent({ type: 'dragging-changed', value: true });
    a.gizmo.dispatchEvent({ type: 'dragging-changed', value: false });
    a.click();
    expect(a.ui.get().selection).toEqual({ type: 'item', id: 'i1' }); // 아이템 피커도 면 피커도 물러난다
    a.click();                                                        // 빗장은 한 번만 쓰인다
    expect(a.ui.get().selection).toEqual({ type: 'wall', id: a.wallId });
  });
  test('덕트 메시를 맞히면 hitAt이 덕트를 돌려주고 좌클릭이 덕트를 고른다', () => {
    const { ui, picker, domElement, g } = setup();              // 기존 setup()이 돌려주는 것들
    const box = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 0.75), new THREE.MeshBasicMaterial());
    box.position.set(0, 3, 0);                                  // 바닥 평면보다 카메라에 가깝다
    box.name = 'duct';
    box.userData.ductId = 'd1';
    box.userData.segment = 1;
    const ducts = new THREE.Group(); ducts.name = 'ducts'; ducts.add(box); g.add(ducts);
    const ev = { button: 0, clientX: 100, clientY: 100, preventDefault() {} };
    expect(picker.hitAt(ev)).toEqual({ kind: 'duct', id: 'd1', segment: 1 });
    domElement.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100, clientY: 100 }));
    domElement.dispatchEvent(new MouseEvent('pointerup', { button: 0, clientX: 100, clientY: 100 }));
    expect(ui.get().selection).toEqual({ type: 'duct', id: 'd1', segment: 1, vertex: null });
  });

  // 실물 덕트(2구간, 소수 좌표, z 2100). 댐퍼 하나는 3D 댐퍼 클릭 테스트가 쓴다.
  const ductFixture = store => addDuct(store, {
    points: [[1234.5, 678.25], [4234.5, 678.25], [4234.5, 3678.75]],
    segments: [{ w: 500, h: 300, z: 2100 }, { w: 500, h: 300, z: 2100 }],
    dampers: [{ segment: 1, t: 0.5, type: 'VD' }],
  });
  const mkDuctGroup = (id, segment, y = 3) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 0.5), new THREE.MeshBasicMaterial());
    box.position.set(0, y, 0);           // 바닥 평면보다 카메라에 가깝다(기본 y)
    box.name = 'duct';
    box.userData.ductId = id;
    box.userData.segment = segment;
    const ducts = new THREE.Group(); ducts.name = 'ducts'; ducts.add(box);
    return ducts;
  };

  test('마감재 적용 모드에서 덕트를 맞히면 선택도 재질도 바뀌지 않는다', () => {
    const a = setup({ mesh: 'floor' });
    const ductId = ductFixture(a.store);
    a.g.add(mkDuctGroup(ductId, 0));
    a.ui.set({ matPick: { assignment: mat('brick-red') } });
    a.click();
    expect(a.ui.get().selection).toBeNull();               // 덕트는 선택되지 않는다
    expect(a.ui.get().matPick).not.toBeNull();              // 적용 모드는 계속된다
    expect(a.floor().rooms[0].floorMat).toBeNull();         // 바닥 마감재도 바뀌지 않는다(재질을 바르지 않았다)
  });

  test('덕트 우클릭은 ductMenuItems를 열고 선택을 그 구간으로 맞춘다', () => {
    const a = setup({ mesh: 'floor' });
    const ductId = ductFixture(a.store);
    a.g.add(mkDuctGroup(ductId, 1));
    const ev = a.rightClick();
    expect(ev.defaultPrevented).toBe(true);
    expect(labels(a.menu[0].items)).toEqual(['점 삽입', '점 삭제', '댐퍼 추가', '급기로 전환', '설비 연결 해제', '잠금', '숨김', '삭제']);
    expect(a.ui.get().selection).toEqual({ type: 'duct', id: ductId, segment: 1, vertex: null });
  });

  test('아이템과 덕트가 겹치면 카메라에 더 가까운 쪽이 이긴다', () => {
    const mkItem = y => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
      box.position.set(0, y, 0); box.name = 'item'; box.userData.itemId = 'i1';
      return box;
    };
    const ev = { clientX: 100, clientY: 100 };

    const a = setup({ mesh: 'floor' });                    // 아이템(y=4)이 덕트(y=3)보다 가깝다
    const ductIdA = ductFixture(a.store);
    a.items.add(mkItem(4));
    a.g.add(mkDuctGroup(ductIdA, 0, 3));
    expect(a.picker.hitAt(ev)).toEqual({ kind: 'item', id: 'i1' });

    const b = setup({ mesh: 'floor' });                    // 덕트(y=4)가 아이템(y=3)보다 가깝다
    const ductIdB = ductFixture(b.store);
    b.items.add(mkItem(3));
    b.g.add(mkDuctGroup(ductIdB, 0, 4));
    expect(b.picker.hitAt(ev)).toEqual({ kind: 'duct', id: ductIdB, segment: 0 });
  });

  test('라이저·댐퍼 메시를 맞히면 인접 구간이 선택된다', () => {
    const a = setup({ mesh: 'floor' });
    const ductId = ductFixture(a.store);                 // 점 3개 · 구간 2개
    const riser = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 0.3), new THREE.MeshBasicMaterial());
    riser.position.set(0, 3, 0);
    riser.name = 'riser';
    riser.userData.ductId = ductId;
    riser.userData.point = 2;                            // 마지막 점 → 마지막 구간(1)
    const ducts = new THREE.Group(); ducts.name = 'ducts'; ducts.add(riser); a.g.add(ducts);
    expect(a.picker.hitAt({ clientX: 100, clientY: 100 })).toEqual({ kind: 'duct', id: ductId, segment: 1 });
    a.click();
    expect(a.ui.get().selection).toEqual({ type: 'duct', id: ductId, segment: 1, vertex: null });

    // 댐퍼 메시도 같은 경로를 지난다(이 분기가 "3D에서 댐퍼를 우클릭하면 구간 항목이 살아난다"의 근거다).
    const damper = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.5), new THREE.MeshBasicMaterial());
    damper.position.set(0, 3.5, 0);            // 라이저보다 카메라에 가깝다
    damper.name = 'damper';
    damper.userData.ductId = ductId;
    damper.userData.damper = 0;
    ducts.add(damper);
    expect(a.picker.hitAt({ clientX: 100, clientY: 100 })).toEqual({ kind: 'duct', id: ductId, segment: 1 });
  });

  // 조합 형상은 그룹이라 비재귀 레이캐스트로는 아무것도 맞지 않는다(클릭이 먹지 않는 회귀).
  test('그룹으로 된 조합 형상도 아이템으로 잡힌다', () => {
    const a = setup({ mesh: 'floor' });
    const group = new THREE.Group();
    const part = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 2), new THREE.MeshBasicMaterial());
    part.position.set(0, 0, 0);
    group.add(part);
    group.position.set(0, 3, 0);
    group.name = 'item';
    group.traverse(o => { o.userData.itemId = 'i9'; });
    a.items.add(group);
    expect(a.picker.hitAt({ clientX: 100, clientY: 100 })).toEqual({ kind: 'item', id: 'i9' });
  });
});
