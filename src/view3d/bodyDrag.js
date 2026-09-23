// 3D 몸체 드래그와 벽 슬라이드 핸들(§17.5 · 감사 §2·§6). TransformControls는 축 화살표·평면 핸들
// 위에서만 잡히므로 선택된 후드 중심에서 60 px을 끌어도 pos가 그대로였다. pick3d.js가 203줄이라
// 300줄 규칙 앞에서 새 파일로 나눈다(기즈모 자체의 규칙은 그 파일에 그대로 남는다).
// 순수 조각(snapMm·dragPointOnPlane·makeGhost·slidePlacement)은 WebGL 없이 테스트된다.
import * as THREE from 'three';
import { activeFloor } from '../state/schema.js';
import { updateItem } from '../state/floorOps.js';
import { nearestWallPlacement, WALL_ATTACH_DIST } from '../geom/items.js';
import { toThree } from './build.js';
import { GIZMO_COLORS } from './pick3d.js';
import { toast as showToast } from '../ui/toast.js';
import { LOCKED_ITEM_EDIT } from '../ui/messages.js';

export const DRAG_SNAP_MM = 10;      // 기즈모의 setTranslationSnap(0.01)과 같은 격자
export const DRAG_MIN_PX = 4;        // 선택 판정의 문턱과 같은 값(그보다 작으면 클릭이다)
export const GHOST_OPACITY = 0.25;   // cutawayMeshStyle의 벽 투명화 값과 같은 수
export const SLIDE_HANDLE_R = 0.06;  // 지름 0.12 m
// 아이템 윗면에서 핸들까지(mm). labels3d.js:23의 비공개 LABEL_LIFT와 **의도적으로 같은 값**이다
// (핸들과 라벨이 같은 높이에서 뜬다 — §17.5). 한쪽을 바꾸면 다른 쪽도 함께 바꾼다(사전 검토 M-14).
export const SLIDE_LIFT = 150;

export const snapMm = (v, step = DRAG_SNAP_MM) => Math.round(v / step) * step;

// 법선 +Y·높이 y(m)인 평면과 광선의 교점 → 월드 mm [x, y]. 평행하면 null.
export function dragPointOnPlane(ray, y) {
  const hit = ray?.intersectPlane?.(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3());
  return hit ? [hit.x * 1000, hit.z * 1000] : null;
}

// 원위치 고스트: 선택된 아이템 메시의 복제본을 반투명으로. 재질은 반드시 복제한다(원본을 물들이면
// 드래그가 끝난 뒤에도 그 아이템이 반투명으로 남는다 — tintGizmo가 배운 것과 같은 함정이다).
export function makeGhost(object) {
  const g = object.clone(true);
  g.name = 'ghost';
  g.traverse(o => {
    if (!o.material) return;
    o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
    for (const m of [].concat(o.material)) { m.transparent = true; m.opacity = GHOST_OPACITY; m.depthWrite = false; }
  });
  return g;
}

// 벽 부착 제품의 새 자리. **같은 벽일 때만** 돌려준다(다른 벽으로 넘어가는 이동은 2D 경로가 맡는다).
// pos는 (wallId, t)의 결과다 — 이 함수 밖에서 pos를 직접 쓰지 않는다(전역 불변식).
export function slidePlacement(floor, item, p) {
  const hit = nearestWallPlacement(floor?.walls ?? [], p, item.size, WALL_ATTACH_DIST);
  if (!hit || hit.wallId !== item.wallId) return null;
  return { t: hit.t, pos: [Math.round(hit.pos[0]), Math.round(hit.pos[1])], side: hit.side, rot: hit.rot };
}

export function createBodyDrag({ renderer, getCamera, getGroup, scene, store, ui, controls = null, requestRender = () => {}, dragLatch = null, toast = showToast, getMode = () => 'iso' }) {
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let handle = null, ghost = null, drag = null;
  const floor = () => activeFloor(store.get());
  const selected = () => {
    const s = ui.get().selection;
    const id = s?.type === 'item' ? s.id : null;
    return id ? (floor().items.find(x => x.id === id) ?? null) : null;
  };
  const meshFor = id => getGroup()?.children.find(c => c.name === 'items')?.children.find(o => o.userData?.itemId === id) ?? null;
  const liftOf = it => (Number(it.z) || 0) + (Number(it.size?.[2]) || 0) + SLIDE_LIFT;
  const setRay = ev => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / (r.width || 1)) * 2 - 1, -((ev.clientY - r.top) / (r.height || 1)) * 2 + 1);
    ray.setFromCamera(ndc, getCamera());
  };
  const dropHandle = () => { if (!handle) return; scene.remove(handle); handle.geometry?.dispose?.(); handle.material?.dispose?.(); handle = null; };
  const dropGhost = () => { if (!ghost) return; scene.remove(ghost); ghost = null; };

  // 선택이 바뀌거나 씬을 다시 지으면 부른다: **벽 부착 제품에만** 주황 핸들을 세운다(§17.5(2)).
  // 잠긴 아이템에는 핸들도 없다(움직일 수 없는 것에 손잡이를 주지 않는다).
  function refresh() {
    dropHandle();
    const it = selected();
    if (it && !it.locked && it.attach === 'wall' && it.wallId && getMode() !== 'fp') {
      handle = new THREE.Mesh(new THREE.SphereGeometry(SLIDE_HANDLE_R, 16, 12), new THREE.MeshBasicMaterial({ color: GIZMO_COLORS.plane }));
      handle.name = 'slideHandle';
      handle.userData.itemId = it.id;
      handle.position.copy(toThree([it.pos[0], it.pos[1], liftOf(it)]));
      handle.updateMatrixWorld();   // 레이캐스트는 matrixWorld를 보는데 렌더 전에 pointerdown이 올 수 있다
      scene.add(handle);
    }
    requestRender();
  }

  function onDown(ev) {
    if (ev.button !== 0 || getMode() === 'fp' || ui.get().matPick) return;
    const it = selected();
    if (!it) return;
    setRay(ev);
    const onHandle = !!handle && ray.intersectObject(handle, false).length > 0;
    const mesh = meshFor(it.id);
    const onBody = !onHandle && !!mesh && ray.intersectObjects([mesh], true).some(x => x.object.isMesh);
    if (!onHandle && !onBody) return;
    // 불변식 둘이 이긴다(§17.5): 잠긴 아이템은 어떤 경로로도 움직이지 않고,
    // 벽 부착 제품의 pos는 (wallId, t)의 결과이므로 몸체 드래그를 열지 않는다(핸들이 그 일을 한다).
    if (it.locked) { toast(LOCKED_ITEM_EDIT); return; }
    if (onBody && it.attach === 'wall' && it.wallId) return;
    const y = mesh ? mesh.position.y : handle.position.y;
    const at = dragPointOnPlane(ray.ray, y);   // Raycaster가 아니라 그 안의 Ray를 넘긴다(순수 조각의 계약)
    if (!at) return;
    drag = { id: it.id, slide: onHandle, y, grab: at, from: [...it.pos], px: [ev.clientX, ev.clientY], open: false };
    if (controls) controls.enabled = false;   // 궤도 회전이 같은 드래그를 함께 먹지 않게(기즈모와 같은 규칙)
    renderer.domElement.setPointerCapture?.(ev.pointerId);
  }

  function onMove(ev) {
    if (!drag) return;
    if (!drag.open) {
      if (Math.hypot(ev.clientX - drag.px[0], ev.clientY - drag.px[1]) <= DRAG_MIN_PX) return;
      drag.open = true;
      dragLatch?.arm();            // 드래그로 끝난 pointerup 하나는 두 피커가 함께 먹는다
      store.beginTransaction();    // 한 드래그 = 되돌리기 한 단계
      const mesh = meshFor(drag.id);
      if (mesh && !drag.slide) { ghost = makeGhost(mesh); scene.add(ghost); }
    }
    setRay(ev);
    const at = dragPointOnPlane(ray.ray, drag.y);
    if (!at) return;
    const p = [drag.from[0] + (at[0] - drag.grab[0]), drag.from[1] + (at[1] - drag.grab[1])];
    if (drag.slide) {
      const it = floor().items.find(x => x.id === drag.id);
      const next = it ? slidePlacement(floor(), it, p) : null;
      if (next) updateItem(store, drag.id, next, { record: false });
    } else updateItem(store, drag.id, { pos: [snapMm(p[0]), snapMm(p[1])] }, { record: false });
    const it2 = floor().items.find(x => x.id === drag.id);
    if (handle && it2) handle.position.copy(toThree([it2.pos[0], it2.pos[1], liftOf(it2)]));
    requestRender();
  }

  function onUp() {
    if (!drag) return;
    const open = drag.open;
    drag = null;
    dropGhost();
    if (controls) controls.enabled = true;
    if (open) store.endTransaction();   // 움직이지 않았으면 트랜잭션을 열지도 않았다(빈 단계 금지)
    requestRender();
  }

  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointercancel', onUp);
  return {
    refresh,
    isDragging: () => !!drag?.open,
    destroy() {
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointercancel', onUp);
      dropHandle(); dropGhost();
    },
  };
}
