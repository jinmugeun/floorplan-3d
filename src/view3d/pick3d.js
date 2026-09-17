import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { activeFloor } from '../state/schema.js';
import { updateItem } from '../state/floorOps.js';
import { DEG, normDeg } from '../geom/items.js';
import { itemMenuItems } from '../ui/itemMenu.js';

// three 오브젝트(m, y = 위) → 아이템 필드(mm, z = 밑면 높이, rot = 화면 시계 방향 각도)
export function gizmoPatch(object, item) {
  return {
    pos: [object.position.x * 1000, object.position.z * 1000],
    z: object.position.y * 1000 - item.size[2] / 2,
    rot: normDeg(-DEG(object.rotation.y)),
  };
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
export function createItemPicker({ renderer, camera, controls, scene, store, ui, getGroup, requestRender, openMenu = () => {}, itemActions = {} }) {
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const proxy = new THREE.Object3D();
  scene.add(proxy);
  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.showY = false;                   // 이동은 바닥면(XZ)에서만
  gizmo.setTranslationSnap(0.01);        // 10mm
  gizmo.setRotationSnap(THREE.MathUtils.degToRad(15));
  scene.add(gizmo.getHelper ? gizmo.getHelper() : gizmo);
  gizmo.enabled = false;
  let current = null;

  const pointFrom = ev => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const g = getGroup()?.children.find(c => c.name === 'items');
    const hit = g ? ray.intersectObjects(g.children, false)[0] : null;
    return hit?.object?.userData?.itemId ?? null;
  };

  let down = null;
  const onDown = ev => { if (ev.button === 0) down = [ev.clientX, ev.clientY]; };
  const onUp = ev => {
    if (ev.button !== 0 || !down) return;
    const moved = Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 4;
    down = null;
    if (moved || gizmo.dragging) return;   // 궤도 회전이나 기즈모 드래그는 선택이 아니다
    const id = pointFrom(ev);
    ui.set({ selection: id ? { type: 'item', id } : null });
  };
  const onMenu = ev => {
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
    if (e.value) store.beginTransaction(); else store.endTransaction();
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
    const id = sel?.type === 'item' ? sel.id : null;
    const it = id ? activeFloor(store.get()).items.find(x => x.id === id) : null;
    if (!it || it.locked) { detach(); return; }
    current = id;
    proxy.position.set(it.pos[0] / 1000, (it.z + it.size[2] / 2) / 1000, it.pos[1] / 1000);
    proxy.rotation.set(0, -THREE.MathUtils.degToRad(it.rot), 0);
    gizmo.attach(proxy); gizmo.enabled = true;
    requestRender();
  }
  function detach() { current = null; gizmo.detach(); gizmo.enabled = false; requestRender(); }

  return {
    attach, detach,
    isDragging: () => !!gizmo.dragging,   // 드래그 중에는 다시 attach하지 않는다(기즈모가 커서에서 튄다)
    setMode(mode) { gizmo.setMode(mode === 'rotate' ? 'rotate' : 'translate'); gizmo.showY = false; requestRender(); },
    destroy() {
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('contextmenu', onMenu);
      gizmo.detach(); gizmo.dispose?.();
      scene.remove(gizmo.getHelper ? gizmo.getHelper() : gizmo);
      scene.remove(proxy);
    },
  };
}
