// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import * as THREE from 'three';
import { gizmoPatch, orthoViewParams, disposeGizmo, gizmoAxes, createItemPicker } from '../src/view3d/pick3d.js';
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
