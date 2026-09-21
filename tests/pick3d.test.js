// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import * as THREE from 'three';
import { gizmoPatch, orthoViewParams, disposeGizmo, gizmoAxes, createItemPicker, createDragLatch, tintGizmo, gizmoTintFor, GIZMO_COLORS } from '../src/view3d/pick3d.js';
import { createItem, createEmptyProject } from '../src/state/schema.js';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { addItem } from '../src/state/floorOps.js';
import { productById } from '../src/products/catalog.js';

describe('3D 편집 계산', () => {
  test('기즈모 위치·회전을 아이템 필드로 되돌린다(소수 좌표)', () => {
    const it = createItem(productById('sofa-3'), { pos: [0, 0] }); // 높이 800
    const obj = { position: { x: 1.0005, y: 0.4, z: 2.00025 }, rotation: { y: -Math.PI / 2 } };
    const patch = gizmoPatch(obj, it);
    expect(patch.pos[0]).toBeCloseTo(1000.5);
    expect(patch.pos[1]).toBeCloseTo(2000.25);
    expect(patch.z).toBeCloseTo(0);
    expect(patch.rot).toBeCloseTo(90);
  });

  test('위로 올린 기즈모는 바닥으로부터의 높이로 바뀐다', () => {
    const it = createItem(productById('storage-box'), { pos: [0, 0] }); // 높이 400
    const patch = gizmoPatch({ position: { x: 0, y: 0.95, z: 0 }, rotation: { y: 0 } }, it);
    expect(patch.z).toBeCloseTo(750);
    expect(patch.rot).toBe(0);
  });

  // 15° 스냅의 부동소수 오차(89.99999…)가 문서에 남지 않게 정수 도로 반올림한다.
  test('회전은 정수 도로 반올림해서 문서에 들어간다', () => {
    const it = createItem(productById('storage-box'), { pos: [0, 0] });
    const rad = -THREE.MathUtils.degToRad(15) * 6; // 90°에 아주 가까운 값
    const patch = gizmoPatch({ position: { x: 0, y: 0.2, z: 0 }, rotation: { y: rad } }, it);
    expect(Number.isInteger(patch.rot)).toBe(true);
    expect(patch.rot).toBe(90);
    const wrapped = gizmoPatch({ position: { x: 0, y: 0.2, z: 0 }, rotation: { y: THREE.MathUtils.degToRad(30.2) } }, it);
    expect(wrapped.rot).toBe(330); // 음수 각도도 0~360으로 정규화된다
  });

  test('기즈모 축: 이동은 바닥면(XZ), 회전은 수직축(Y)만 보여 준다', () => {
    expect(gizmoAxes('translate')).toEqual({ showX: true, showY: false, showZ: true });
    expect(gizmoAxes('rotate')).toEqual({ showX: false, showY: true, showZ: false });
    expect(gizmoAxes(undefined)).toEqual(gizmoAxes('translate'));
  });

  test('직교 프리셋 6종의 방향과 up이 다르다', () => {
    const opts = { center: [2000, 1500], extent: 6000, height: 2300, aspect: 2 };
    const front = orthoViewParams('front', opts);
    expect(front.target).toEqual([2, 1.15, 1.5]);
    expect(front.pos[2]).toBeGreaterThan(front.target[2]);
    expect(front.up).toEqual([0, 1, 0]);
    expect(orthoViewParams('back', opts).pos[2]).toBeLessThan(front.target[2]);
    expect(orthoViewParams('left', opts).pos[0]).toBeLessThan(front.target[0]);
    expect(orthoViewParams('right', opts).pos[0]).toBeGreaterThan(front.target[0]);
    const top = orthoViewParams('top', opts);
    expect(top.pos[1]).toBeGreaterThan(top.target[1]);
    expect(top.up).toEqual([0, 0, -1]);
    expect(orthoViewParams('bottom', opts).pos[1]).toBeLessThan(top.target[1]);
    expect(orthoViewParams('bottom', opts).up).toEqual([0, 0, 1]);
  });

  test('직교 프레임은 도면 크기와 화면 비율을 따른다', () => {
    const a = orthoViewParams('front', { center: [0, 0], extent: 6000, height: 2300, aspect: 2 });
    const b = orthoViewParams('front', { center: [0, 0], extent: 12000, height: 2300, aspect: 2 });
    expect(b.halfH).toBeGreaterThan(a.halfH);
    expect(a.halfW / a.halfH).toBeCloseTo(2);
    const small = orthoViewParams('front', { center: [0, 0], extent: 100, height: 2300, aspect: 1 });
    expect(small.halfH).toBeGreaterThan(1); // 아주 작은 도면도 최소 크기를 갖는다
  });

  test('모르는 이름은 정면으로 떨어진다', () => {
    const p = orthoViewParams('없음', { center: [0, 0], extent: 6000, height: 2300, aspect: 1 });
    expect(p.pos[2]).toBeGreaterThan(0);
    expect(p.up).toEqual([0, 1, 0]);
  });
});

describe('기즈모 정리(disposeGizmo)', () => {
  test('dispose() 대신 헬퍼를 직접 정리하고 씬에서 뺀다', () => {
    const calls = [];
    const child = { geometry: { dispose: () => calls.push('geo') }, material: { dispose: () => calls.push('mat') } };
    const helper = { traverse: fn => { fn(helper); fn(child); } };
    const gizmo = { detach: () => calls.push('detach'), disconnect: () => calls.push('disconnect'), getHelper: () => helper, dispose: () => { throw new Error('three 0.169에서 던진다'); } };
    const scene = { remove: o => calls.push(o === helper ? 'remove' : 'remove?') };
    disposeGizmo(gizmo, scene);
    expect(calls).toEqual(['detach', 'disconnect', 'geo', 'mat', 'remove']);
  });
});

function setupPicker() {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  const domElement = document.createElement('div'); document.body.appendChild(domElement);
  // jsdom에는 포인터 캡처가 없다. TransformControls가 같은 요소의 pointer 이벤트를 듣고 부른다.
  domElement.setPointerCapture = () => {}; domElement.releasePointerCapture = () => {}; domElement.hasPointerCapture = () => false;
  const scene = new THREE.Scene();
  const persp = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const ortho2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  let useOrtho = false, mode = 'iso';
  const getCamera = vi.fn(() => (useOrtho ? ortho2 : persp));
  const controls = { enabled: true };
  const requestRender = vi.fn();
  const picker = createItemPicker({ renderer: { domElement }, getCamera, controls, scene, store, ui, getGroup: () => null, getMode: () => mode, requestRender });
  const gizmo = scene.children.find(c => c.isTransformControlsRoot).controls;
  return {
    store, ui, scene, picker, gizmo, getCamera, controls, requestRender, persp, ortho2, domElement,
    setOrtho: v => { useOrtho = v; }, setMode: m => { mode = m; },
    click: (x, y) => {
      domElement.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: x, clientY: y }));
      domElement.dispatchEvent(new MouseEvent('pointerup', { button: 0, clientX: x, clientY: y }));
    },
  };
}

describe('3D 아이템 피커', () => {
  test('바닥 아이템에는 기즈모가 붙고, 벽에 붙은 문·창에는 붙지 않는다(선택만 된다)', () => {
    const a = setupPicker();
    const sofa = addItem(a.store, createItem(productById('sofa-3'), { pos: [1000, 2000] }));
    a.picker.attach({ type: 'item', id: sofa });
    expect(a.gizmo.object).toBeTruthy();
    expect(a.gizmo.enabled).toBe(true);
    const door = addItem(a.store, createItem(productById('door-swing-900'), { pos: [0, 0], wallId: 'w1', t: 0.5 }));
    a.picker.attach({ type: 'item', id: door });
    expect(a.gizmo.object).toBeUndefined();   // 벽 부착은 2D에서 편집한다(명세 8.5)
    expect(a.gizmo.enabled).toBe(false);
  });

  test('잠긴 아이템과 선택 없음도 기즈모를 떼어 놓는다', () => {
    const a = setupPicker();
    const id = addItem(a.store, createItem(productById('sofa-3'), { pos: [0, 0], locked: true }));
    a.picker.attach({ type: 'item', id });
    expect(a.gizmo.object).toBeUndefined();
    a.picker.attach({ type: 'wall', id: 'w1' });
    expect(a.gizmo.object).toBeUndefined();
    a.picker.attach(null);
    expect(a.gizmo.object).toBeUndefined();
  });

  test('붙일 때마다 현재 카메라를 다시 읽는다(투영 뷰로 바뀌어도 기즈모가 따라간다)', () => {
    const a = setupPicker();
    const id = addItem(a.store, createItem(productById('sofa-3'), { pos: [0, 0] }));
    a.picker.attach({ type: 'item', id });
    expect(a.gizmo.camera).toBe(a.persp);
    a.setOrtho(true);
    a.picker.attach({ type: 'item', id });
    expect(a.gizmo.camera).toBe(a.ortho2);
  });

  test('기즈모 모드 토글이 모드와 보이는 축을 함께 바꾼다', () => {
    const a = setupPicker();
    expect(a.picker.getGizmoMode()).toBe('translate');
    expect([a.gizmo.mode, a.gizmo.showX, a.gizmo.showY, a.gizmo.showZ]).toEqual(['translate', true, false, true]);
    a.picker.setGizmoMode('rotate');
    expect(a.picker.getGizmoMode()).toBe('rotate');
    expect([a.gizmo.mode, a.gizmo.showX, a.gizmo.showY, a.gizmo.showZ]).toEqual(['rotate', false, true, false]);
    a.picker.setGizmoMode('없음'); // 모르는 값은 이동으로 떨어진다
    expect(a.picker.getGizmoMode()).toBe('translate');
  });

  test('기즈모 핸들을 그냥 클릭해도 선택이 풀리지 않는다', () => {
    const a = setupPicker();
    const id = addItem(a.store, createItem(productById('sofa-3'), { pos: [0, 0] }));
    a.ui.set({ selection: { type: 'item', id } });
    a.picker.attach({ type: 'item', id });
    // TransformControls는 pointerup 앞에서 dragging을 되돌린다: 빗장이 없으면 선택이 지워졌다.
    a.gizmo.dispatchEvent({ type: 'dragging-changed', value: true });
    a.gizmo.dispatchEvent({ type: 'dragging-changed', value: false });
    a.click(10, 10);
    expect(a.ui.get().selection).toEqual({ type: 'item', id });
    a.click(10, 10); // 다음 클릭은 평소처럼 빈 곳을 눌러 선택을 비운다
    expect(a.ui.get().selection).toBeNull();
  });

  test('빗장은 오른쪽 버튼을 떼는 경로로도 한 번만 쓰이고 다음 왼클릭으로 새지 않는다', () => {
    const a = setupPicker();
    const id = addItem(a.store, createItem(productById('sofa-3'), { pos: [0.5, 0.25] }));
    a.ui.set({ selection: { type: 'item', id } });
    a.picker.attach({ type: 'item', id });
    a.gizmo.dispatchEvent({ type: 'dragging-changed', value: true });
    a.gizmo.dispatchEvent({ type: 'dragging-changed', value: false });
    a.domElement.dispatchEvent(new MouseEvent('pointerup', { button: 2, clientX: 10, clientY: 10 })); // 오른쪽 버튼 up이 빗장을 소모한다
    a.click(10, 10); // 그 다음 왼클릭은 빈 곳 클릭으로 정상 처리된다
    expect(a.ui.get().selection).toBeNull();
  });

  // I-3: 1인칭으로 들어갈 때 기즈모가 남으면 걷는 화면에 헬퍼가 그려지고 보이지 않는 편집이 된다.
  // view3d의 fp 분기가 떼는 것을 잊어도(ui 구독이 그 사이에 붙이려 해도) 피커가 스스로 거절한다.
  test('1인칭에서는 기즈모를 붙이지 않고 이미 붙은 것은 떼어 낸다', () => {
    const a = setupPicker();
    const id = addItem(a.store, createItem(productById('sofa-3'), { pos: [1000.5, 2000.25] }));
    a.ui.set({ selection: { type: 'item', id } });
    a.picker.attach({ type: 'item', id });
    expect(a.gizmo.object).toBeTruthy();
    a.setMode('fp');
    a.picker.attach({ type: 'item', id });
    expect(a.gizmo.object).toBeUndefined();
    expect(a.gizmo.enabled).toBe(false);
    a.setMode('iso'); // 1인칭을 나오면 다시 붙는다
    a.picker.attach({ type: 'item', id });
    expect(a.gizmo.object).toBeTruthy();
  });

  test('1인칭에서는 클릭·우클릭이 선택을 건드리지 않는다', () => {
    const a = setupPicker();
    const id = addItem(a.store, createItem(productById('sofa-3'), { pos: [0, 0] }));
    a.ui.set({ selection: { type: 'item', id } });
    a.setMode('fp');
    a.click(10, 10);
    expect(a.ui.get().selection).toEqual({ type: 'item', id });
    const menuEv = new MouseEvent('contextmenu', { button: 2, clientX: 10, clientY: 10, cancelable: true });
    a.domElement.dispatchEvent(menuEv);
    expect(menuEv.defaultPrevented).toBe(false);
  });

  test('destroy가 던지지 않고 기즈모와 프록시를 씬에서 뺀다', () => {
    const a = setupPicker();
    expect(a.scene.children.length).toBe(2); // 프록시 + 기즈모 헬퍼
    expect(() => a.picker.destroy()).not.toThrow();
    expect(a.scene.children.length).toBe(0);
  });
});

// 마감재 적용 모드에서는 아이템 피커가 물러나고 그 클릭·우클릭을 면 피커가 쓴다(아키텍처 §10.3).
function setupMatPick() {
  const store = createStore(createEmptyProject()), ui = createUiState();
  const domElement = document.createElement('div'); document.body.appendChild(domElement);
  domElement.setPointerCapture = () => {}; domElement.releasePointerCapture = () => {}; domElement.hasPointerCapture = () => false;
  domElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const group = new THREE.Group(); const items = new THREE.Group(); items.name = 'items'; group.add(items);
  const id = addItem(store, createItem(productById('sofa-3'), { pos: [1000.5, 2000.25] }));
  const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  box.userData.itemId = id; items.add(box);
  scene.add(group); group.updateMatrixWorld(true);
  const menu = [];
  const picker = createItemPicker({
    renderer: { domElement }, getCamera: () => camera, controls: { enabled: true }, scene, store, ui,
    getGroup: () => group, requestRender: () => {}, openMenu: (x, y, its) => menu.push(its),
  });
  return {
    store, ui, picker, menu, id,
    click: () => {
      domElement.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100, clientY: 100 }));
      domElement.dispatchEvent(new MouseEvent('pointerup', { button: 0, clientX: 100, clientY: 100 }));
    },
    rightClick: () => { const ev = new MouseEvent('contextmenu', { button: 2, clientX: 100, clientY: 100, cancelable: true }); domElement.dispatchEvent(ev); return ev; },
  };
}

describe('마감재 적용 모드의 아이템 피커', () => {
  test('평소에는 아이템 좌클릭이 그 아이템을 고른다', () => {
    const a = setupMatPick();
    a.click();
    expect(a.ui.get().selection).toEqual({ type: 'item', id: a.id });
  });

  test('적용 모드의 좌클릭은 선택을 바꾸지 않는다(면 피커가 재질을 바른다)', () => {
    const a = setupMatPick();
    a.ui.set({ matPick: { assignment: { id: 'wood-oak', offset: [0, 0], angle: 0 } } });
    a.click();
    expect(a.ui.get().selection).toBeNull();
    expect(a.ui.get().matPick).not.toBeNull();     // 모드는 Esc까지 유지된다
  });

  // M-33: 적용 모드에서 아이템 메뉴가 뜨면 면 메뉴를 가로챈다.
  test('적용 모드의 우클릭은 아이템 메뉴를 열지 않는다', () => {
    const a = setupMatPick();
    a.ui.set({ matPick: { assignment: { id: 'wood-oak', offset: [0, 0], angle: 0 } } });
    const ev = a.rightClick();
    expect(a.menu).toHaveLength(0);
    expect(ev.defaultPrevented).toBe(false);       // 면 피커가 쓰도록 이벤트를 막지도 않는다
  });
});

describe('기즈모 드래그 빗장(createDragLatch)', () => {
  test('드래그 직후 pointerup 하나만 막고, 두 피커가 같은 답을 받는다', () => {
    const l = createDragLatch();
    const up0 = {}, up1 = {}, up2 = {};
    expect(l.latched(up0)).toBe(false);   // 드래그가 없으면 아무것도 막지 않는다
    l.arm();
    expect(l.latched(up1)).toBe(true);
    expect(l.latched(up1)).toBe(true);    // 같은 이벤트를 두 피커가 물어본다
    expect(l.latched(up2)).toBe(false);   // 다음 클릭부터는 평소대로
    expect(l.latched(up2)).toBe(false);
  });
});

// 최종 리뷰 I-2: 마감재 적용 모드에서는 기즈모를 붙이지 않는다(TransformControls 자체 리스너가 면 클릭을 가로채 가구를 끌지 않게).
test('matPick 모드에서는 attach가 기즈모를 떼어 두고, 모드가 끝나면 다시 붙는다', () => {
  const a = setupPicker();
  const id = addItem(a.store, createItem(productById('sofa-3'), { pos: [100.5, 200.25] }));
  a.ui.set({ selection: { type: 'item', id }, matPick: { assignment: { id: 'wood-oak', offset: [0, 0], angle: 0 } } });
  a.picker.attach({ type: 'item', id });
  expect(a.gizmo.object).toBeUndefined();
  a.ui.set({ matPick: null });
  a.picker.attach({ type: 'item', id });
  expect(a.gizmo.object).toBeTruthy();
});

describe('기즈모 배색(§13.6)', () => {
  const namesOf = helper => { const s = new Set(); helper.traverse(o => { if (o.name) s.add(o.name); }); return [...s].sort(); };

  // three 0.169에 고정된 이름 규칙: 이 집합이 바뀌면 배색이 조용히 죽으므로 테스트로 못 박는다.
  test('TransformControls 헬퍼의 핸들 이름 집합이 three 0.169 그대로다', () => {
    const a = setupPicker();
    expect(namesOf(a.gizmo.getHelper())).toEqual(['AXIS', 'DELTA', 'E', 'END', 'START', 'X', 'XY', 'XYZ', 'XYZE', 'XZ', 'Y', 'YZ', 'Z']);
  });

  test('gizmoTintFor: X/Y/Z로 시작하면 그 축 색, 평면 핸들은 주황, 나머지는 null', () => {
    expect(GIZMO_COLORS).toEqual({ X: '#e5484d', Y: '#30a46c', Z: '#0090ff', plane: '#f5a524' });
    expect(gizmoTintFor('X')).toBe('#e5484d');
    expect(gizmoTintFor('Y')).toBe('#30a46c');
    expect(gizmoTintFor('Z')).toBe('#0090ff');
    expect(gizmoTintFor('XY')).toBe('#f5a524');
    expect(gizmoTintFor('YZ')).toBe('#f5a524');
    expect(gizmoTintFor('XZ')).toBe('#f5a524');
    expect(gizmoTintFor('XYZ')).toBe('#e5484d');    // 평면 셋이 아니면 첫 글자를 따른다
    expect(gizmoTintFor('XYZE')).toBe('#e5484d');
    for (const n of ['E', 'AXIS', 'START', 'END', 'DELTA', '', null, undefined]) expect(gizmoTintFor(n), String(n)).toBeNull();
  });

  test('피커가 만든 기즈모는 축 색이 바뀌어 있고 재질을 복제해 쓴다', () => {
    const a = setupPicker();                         // createItemPicker가 tintGizmo를 한 번 부른다
    const helper = a.gizmo.getHelper();
    const pick = name => { const out = []; helper.traverse(o => { if (o.name === name && o.material) out.push(o.material); }); return out; };
    const xs = pick('X');
    expect(xs.length).toBeGreaterThan(1);
    expect(new Set(xs).size).toBe(xs.length);        // 공유 재질을 더럽히지 않는다(하나씩 clone)
    expect(xs.every(m => m.color.getHexString() === 'e5484d')).toBe(true);
    expect(pick('Y').every(m => m.color.getHexString() === '30a46c')).toBe(true);
    expect(pick('Z').every(m => m.color.getHexString() === '0090ff')).toBe(true);
    expect(pick('XY').every(m => m.color.getHexString() === 'f5a524')).toBe(true);

    // three는 매 updateMatrixWorld에서 material._color로 색을 되돌린다 — 그 캐시도 세워 둔다.
    const obj = new THREE.Object3D(); a.scene.add(obj); a.gizmo.attach(obj);
    helper.updateMatrixWorld(true);
    expect(pick('X').every(m => m.color.getHexString() === 'e5484d')).toBe(true);
    expect(pick('XY').every(m => m.color.getHexString() === 'f5a524')).toBe(true);

    // 색을 바꾼 개수를 돌려주고, 색 표를 바꿔 끼울 수 있다.
    const n = tintGizmo(a.gizmo, { X: '#000000', Y: '#111111', Z: '#222222', plane: '#333333' });
    expect(n).toBeGreaterThan(20);
    expect(pick('X').every(m => m.color.getHexString() === '000000')).toBe(true);
    expect(tintGizmo(null)).toBe(0);                 // 기즈모가 없으면 아무것도 하지 않는다
  });
});
