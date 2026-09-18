import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { activeFloor } from '../state/schema.js';
import { updateItem } from '../state/floorOps.js';
import { DEG, normDeg } from '../geom/items.js';
import { itemMenuItems } from '../ui/itemMenu.js';

// three 오브젝트(m, y = 위) → 아이템 필드(mm, z = 밑면 높이, rot = 화면 시계 방향 각도)
// rot은 정수 도로 반올림한다: 15° 스냅의 부동소수 오차가 문서에 남지 않게.
export function gizmoPatch(object, item) {
  return {
    pos: [object.position.x * 1000, object.position.z * 1000],
    z: object.position.y * 1000 - item.size[2] / 2,
    rot: normDeg(Math.round(-DEG(object.rotation.y))),
  };
}

// three 0.169의 TransformControls.dispose()는 Controls에 없는 this.traverse를 부른다(던진다).
// 헬퍼를 직접 정리한다.
export function disposeGizmo(gizmo, scene) {
  gizmo.detach?.();
  gizmo.disconnect?.();
  const helper = gizmo.getHelper ? gizmo.getHelper() : gizmo;
  helper?.traverse?.(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  if (helper) scene.remove(helper);
}

// 기즈모 모드별로 보이는 축. 이동은 바닥면(XZ), 회전은 수직축(Y)만.
export function gizmoAxes(mode) {
  return mode === 'rotate' ? { showX: false, showY: true, showZ: false } : { showX: true, showY: false, showZ: true };
}

const DIRS = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0] };
const UPS = { top: [0, 0, -1], bottom: [0, 0, 1] };

// 2D 투영(정면/배면/좌/우/평면/저면) 직교 카메라 값. 모두 three 좌표(m).
export function orthoViewParams(name, { center = [0, 0], extent = 6000, height = 2300, aspect = 1 } = {}) {
  const dir = DIRS[name] ?? DIRS.front;
  const up = UPS[name] ?? [0, 1, 0];
  const size = (Math.max(extent, 2000) * 1.15) / 1000;
  const target = [center[0] / 1000, height / 2000, center[1] / 1000];
  const dist = size * 2 + 10;
  return {
    target, up, dist,
    pos: [target[0] + dir[0] * dist, target[1] + dir[1] * dist, target[2] + dir[2] * dist],
    halfH: size / 2,
    halfW: (size / 2) * aspect,
  };
}

// 3D에서 아이템을 고르고 기즈모로 옮긴다. 렌더러·카메라는 view3d가 준다.
// getCamera는 매번 읽는다: 투영 전환(persp/ortho)과 2D 투영 뷰가 카메라를 바꾼다.
export function createItemPicker({ renderer, getCamera, controls, scene, store, ui, getGroup, getMode = () => 'iso', requestRender, openMenu = () => {}, itemActions = {} }) {
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const proxy = new THREE.Object3D();
  scene.add(proxy);
  const gizmo = new TransformControls(getCamera(), renderer.domElement);
  let gizmoMode = 'translate';
  Object.assign(gizmo, gizmoAxes(gizmoMode));
  gizmo.setTranslationSnap(0.01);        // 10mm
  gizmo.setRotationSnap(THREE.MathUtils.degToRad(15));
  scene.add(gizmo.getHelper ? gizmo.getHelper() : gizmo);
  gizmo.enabled = false;
  let current = null, wasDragging = false;

  const pointFrom = ev => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, getCamera());
    const g = getGroup()?.children.find(c => c.name === 'items');
    const hit = g ? ray.intersectObjects(g.children, false)[0] : null;
    return hit?.object?.userData?.itemId ?? null;
  };

  let down = null;
  const onDown = ev => { if (getMode() === 'fp') return; if (ev.button === 0) down = [ev.clientX, ev.clientY]; };
  const onUp = ev => {
    const latched = wasDragging; wasDragging = false; // 빗장은 어느 경로로 나가든 한 번만 쓴다(오른쪽 버튼·fp 진입으로 새지 않게)
    if (getMode() === 'fp') return;
    if (ev.button !== 0 || !down) return;
    const moved = Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 4;
    down = null;
    // 궤도 회전이나 기즈모 드래그는 선택이 아니다. TransformControls는 pointerup 전에 dragging을
    // 되돌리므로 dragging-changed에서 걸어 둔 빗장(wasDragging)을 본다.
    if (moved || latched) return;
    const id = pointFrom(ev);
    ui.set({ selection: id ? { type: 'item', id } : null });
  };
  const onMenu = ev => {
    if (getMode() === 'fp') return;
    const id = pointFrom(ev);
    if (!id) return;
    ev.preventDefault();
    ui.set({ selection: { type: 'item', id } });
    openMenu(ev.clientX, ev.clientY, itemMenuItems({ store, ui, ids: [id], itemActions }) ?? []);
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('contextmenu', onMenu);

  gizmo.addEventListener('dragging-changed', e => {
    controls.enabled = !e.value;
    if (e.value) { wasDragging = true; store.beginTransaction(); } else store.endTransaction();
  });
  gizmo.addEventListener('objectChange', () => {
    if (!current) return;
    const it = activeFloor(store.get()).items.find(x => x.id === current);
    if (!it) return;
    const patch = gizmoPatch(proxy, it);
    updateItem(store, current, { pos: [Math.round(patch.pos[0]), Math.round(patch.pos[1])], z: Math.round(patch.z), rot: patch.rot }, { record: false });
    requestRender();
  });

  function attach(sel) {
    if (getMode() === 'fp') { detach(); return; } // 걷는 화면에는 기즈모가 없다(뷰가 떼는 것을 잊어도 붙지 않는다)
    const id = sel?.type === 'item' ? sel.id : null;
    const it = id ? activeFloor(store.get()).items.find(x => x.id === id) : null;
    // 벽 부착 아이템(문·창)은 벽을 따라 2D에서 편집한다(명세 8.5). 기즈모로 옮기면 wallId/t가
    // 그대로 남아 유령 벽 개구부가 생기므로, 잠긴 아이템처럼 기즈모를 붙이지 않는다(선택은 된다).
    if (!it || it.locked || (it.attach === 'wall' && it.wallId)) { detach(); return; }
    current = id;
    proxy.position.set(it.pos[0] / 1000, (it.z + it.size[2] / 2) / 1000, it.pos[1] / 1000);
    proxy.rotation.set(0, -THREE.MathUtils.degToRad(it.rot), 0);
    gizmo.camera = getCamera();
    gizmo.attach(proxy); gizmo.enabled = true;
    requestRender();
  }
  function detach() { current = null; gizmo.detach(); gizmo.enabled = false; requestRender(); }

  return {
    attach, detach,
    isDragging: () => !!gizmo.dragging,   // 드래그 중에는 다시 attach하지 않는다(기즈모가 커서에서 튄다)
    getGizmoMode: () => gizmoMode,
    setGizmoMode(mode) {
      gizmoMode = mode === 'rotate' ? 'rotate' : 'translate';
      gizmo.setMode(gizmoMode);
      Object.assign(gizmo, gizmoAxes(gizmoMode));
      requestRender();
    },
    destroy() {
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('contextmenu', onMenu);
      disposeGizmo(gizmo, scene);
      scene.remove(proxy);
    },
  };
}
