import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { activeFloor } from '../state/schema.js';
import { updateItem } from '../state/floorOps.js';
import { DEG, RAD, normDeg } from '../geom/items.js';
import { itemMenuItems } from '../ui/itemMenu.js';
// 입면 프레이밍의 정본은 geom/elevation.js 한 곳이다(리뷰 M-7): 시방서가 그리는 바닥선·천장선이
// 이 카메라와 같은 값을 써야 자리가 맞는다. 인쇄물 포매터(io/specSheet.js)가 아니라 geom/에 두어
// 3D 카메라가 카탈로그·풍량까지 딸린 모듈에 의존하지 않는다(view3d → geom은 이미 여는 방향이다).
import { elevationFrame, planFrame } from '../geom/elevation.js';

// three 오브젝트(m, y = 위) → 아이템 필드(mm, z = 밑면 높이, rot = 화면 시계 방향 각도)
// rot은 정수 도로 반올림한다: 15° 스냅의 부동소수 오차가 문서에 남지 않게.
export function gizmoPatch(object, item) {
  return {
    pos: [object.position.x * 1000, object.position.z * 1000],
    z: object.position.y * 1000 - item.size[2] / 2,
    rot: normDeg(Math.round(-DEG(object.rotation.y))),
  };
}

// items 그룹에서 아이템 하나의 오브젝트를 찾는다(조합 형상은 Group이고, 개구부는 메시가 없어 null이다).
export const itemMeshOf = (group, id) => group?.children.find(c => c.name === 'items')?.children.find(o => o.userData?.itemId === id) ?? null;

// 드래그 중 미리보기: store에 쓰지 않고 아이템 오브젝트만 옮긴다(§15.2의 프리뷰 계약을 3D에도 — 리뷰 I-4).
// 패치의 pos·z·rot을 items3d.js:53-54와 **같은 수식**으로 되돌린다(패치에 없는 필드는 아이템 값 그대로).
// matrixWorld까지 갱신한다: 레이캐스트(아이템·면 피커)와 다음 렌더가 최신 행렬을 본다.
export function previewItemMesh(obj, item, patch = {}) {
  if (!obj || !item) return null;
  const pos = patch.pos ?? item.pos, z = patch.z ?? item.z, rot = patch.rot ?? item.rot;
  obj.position.set(pos[0] / 1000, (z + item.size[2] / 2) / 1000, pos[1] / 1000);
  obj.rotation.y = -RAD(rot);
  obj.updateMatrixWorld(true);
  return obj;
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

// 기즈모 축 배색(§13.6). 오늘의집과 같은 방향: 축은 신호색, 평면 핸들은 주황. 설정은 두지 않는다.
export const GIZMO_COLORS = { X: '#e5484d', Y: '#30a46c', Z: '#0090ff', plane: '#f5a524' };
const GIZMO_PLANES = new Set(['XY', 'YZ', 'XZ']);

// 핸들 이름 → 색. 평면 셋이 먼저이고, 그 밖에 X/Y/Z로 시작하는 이름은 그 축 색이다
// (XYZ·XYZE도 X로 시작하므로 X 색을 쓴다 — §13.6이 평면으로 센 것은 XY/YZ/XZ 셋뿐이다).
// E·AXIS·START·END·DELTA는 축이 아니라 손대지 않는다.
export function gizmoTintFor(name, colors = GIZMO_COLORS) {
  const n = typeof name === 'string' ? name : '';
  if (!n) return null;
  if (GIZMO_PLANES.has(n)) return colors.plane ?? null;
  const axis = n[0];
  return axis === 'X' || axis === 'Y' || axis === 'Z' ? (colors[axis] ?? null) : null;
}

// gizmo.getHelper()를 훑어 축·평면 핸들의 색을 바꾼다. 색을 바꾼 개수를 돌려준다.
// three 0.169의 TransformControlsGizmo는 재질 몇 개를 여러 핸들이 나눠 쓰므로(X 핸들 14개가 재질 4개)
// 반드시 clone한 뒤 칠한다 — 공유 재질에 칠하면 엉뚱한 핸들까지 물든다.
// 그리고 three는 updateMatrixWorld마다 material.color를 material._color로 되돌리므로
// (TransformControls.js:1479) 그 캐시도 같이 세운다 — 순서에 상관없이 색이 남는다.
// clone()은 _color를 복사하지 않으므로 복제본에는 우리가 넣은 값만 남는다.
export function tintGizmo(gizmo, colors = GIZMO_COLORS) {
  const helper = gizmo?.getHelper ? gizmo.getHelper() : gizmo;
  if (!helper?.traverse) return 0;
  let n = 0;
  helper.traverse(o => {
    if (!o.material || Array.isArray(o.material)) return;
    const hex = gizmoTintFor(o.name, colors);
    if (!hex) return;
    o.material = o.material.clone();
    o.material.color.set(hex);
    o.material._color = o.material.color.clone();
    n += 1;
  });
  return n;
}

// 기즈모 드래그가 끝난 pointerup 하나를 막는 빗장. 아이템 피커와 면 피커가 같은 빗장을 나눠 본다:
// 한 이벤트에 두 번 물어도 같은 답을 주고(둘 다 물러난다), 다음 pointerup부터는 평소대로 선택이 된다.
export function createDragLatch() {
  let armed = false, ev = null;
  return {
    arm() { armed = true; ev = null; },
    latched(e) {
      if (!armed) return false;
      if (ev === null) { ev = e; return true; }  // 드래그 직후 첫 pointerup이 바로 이것이다
      if (ev === e) return true;                 // 다른 피커가 같은 이벤트로 다시 물었다
      armed = false; ev = null; return false;
    },
  };
}

const DIRS = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0] };
const UPS = { top: [0, 0, -1], bottom: [0, 0, 1] };

// 2D 투영(정면/배면/좌/우/평면/저면) 직교 카메라 값. 모두 three 좌표(m).
// 입면(dir[1] === 0: 정면·배면·좌·우)의 세로 절두체는 **건물 높이**에서 나온다(§17.4(2) 개정 ·
// 리뷰 I-3): 평면 크기로 잡으면 층고 3.5 m 건물이 세로 23 m 화면의 15%짜리 회색 띠가 된다.
// 평면도·저면도는 size(도면의 가로·세로 mm)를 받으면 planFrame이 잡는다(최종 리뷰 I-6): 예전
// 규칙(max(가로, 세로))은 폭 20 m · 깊이 5 m 도면을 가로·세로 모두 22%로 그렸다. size를 주지
// 않는 부름은 옛 규칙 그대로다(두 호출자 view3d.renderImage·orthoView.setOrthoView가 모두 준다).
export function orthoViewParams(name, { center = [0, 0], extent = 6000, height = 2300, aspect = 1, size = null } = {}) {
  const dir = DIRS[name] ?? DIRS.front;
  const up = UPS[name] ?? [0, 1, 0];
  const span = (Math.max(extent, 2000) * 1.15) / 1000;
  const target = [center[0] / 1000, height / 2000, center[1] / 1000];
  const dist = span * 2 + 10;
  const fr = dir[1] === 0 ? elevationFrame({ extent, height, aspect })
    : size ? planFrame({ width: size[0], depth: size[1], aspect }) : null;
  return {
    target, up, dist,
    pos: [target[0] + dir[0] * dist, target[1] + dir[1] * dist, target[2] + dir[2] * dist],
    halfH: fr ? fr.halfH : span / 2,
    halfW: fr ? fr.halfW : (span / 2) * aspect,
  };
}

// 3D에서 아이템을 고르고 기즈모로 옮긴다. 렌더러·카메라는 view3d가 준다.
// getCamera는 매번 읽는다: 투영 전환(persp/ortho)과 2D 투영 뷰가 카메라를 바꾼다.
export function createItemPicker({ renderer, getCamera, controls, scene, store, ui, getGroup, getMode = () => 'iso', requestRender, openMenu = () => {}, itemActions = {}, dragLatch = createDragLatch() }) {
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const proxy = new THREE.Object3D();
  scene.add(proxy);
  const gizmo = new TransformControls(getCamera(), renderer.domElement);
  let gizmoMode = 'translate';
  Object.assign(gizmo, gizmoAxes(gizmoMode));
  gizmo.setTranslationSnap(0.01);        // 10mm
  gizmo.setRotationSnap(THREE.MathUtils.degToRad(15));
  scene.add(gizmo.getHelper ? gizmo.getHelper() : gizmo);
  tintGizmo(gizmo);                      // 첫 렌더 전에 칠한다(§13.6)
  gizmo.enabled = false;
  let current = null, pending = null;   // pending: 기즈모 드래그 중의 미리보기 패치(store에는 드래그가 끝날 때 한 번만 쓴다)
  // 드래그가 살아 있는가. gizmo.dragging을 그대로 보지 않는다: 취소([Esc]·Ctrl+Z) 뒤에도 손은
  // 아직 버튼을 누르고 있어 three의 dragging은 참으로 남는다 — 우리 쪽 "이 드래그는 끝났다"다.
  let dragging = false;

  const pointFrom = ev => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, getCamera());
    const g = getGroup()?.children.find(c => c.name === 'items'); g?.updateMatrixWorld();   // 다시 지은 직후(렌더 전) 클릭도 맞아야 한다
    // 조합 형상은 Group이라 재귀로 맞힌다. 엣지 선(LineSegments)은 건너뛴다 — Raycaster의 Line
    // 허용치는 월드 1 m라 선이 먼 거리에서 엉뚱하게 이긴다. visible도 여기서 본다(레이캐스터는
    // 보지 않으므로 숨긴 아이템이 모든 픽을 이겼다 — facePick.js:36과 같은 규칙, Task 6 리뷰 M-4).
    const hit = g ? ray.intersectObjects(g.children, true).find(x => x.object.isMesh && x.object.visible) : null;
    return hit?.object?.userData?.itemId ?? null;
  };

  let down = null;
  const onDown = ev => { if (getMode() === 'fp' || ui.get().matPick) return; if (ev.button === 0) down = [ev.clientX, ev.clientY]; };
  const onUp = ev => {
    const latched = dragLatch.latched(ev); // 빗장은 어느 경로로 나가든 한 번만 쓴다(오른쪽 버튼·fp 진입으로 새지 않게)
    if (getMode() === 'fp' || ui.get().matPick) return; // 마감재 적용 모드의 클릭은 면 피커가 쓴다
    if (ev.button !== 0 || !down) return;
    const moved = Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 4;
    down = null;
    // 궤도 회전이나 기즈모 드래그는 선택이 아니다. TransformControls는 pointerup 전에 dragging을
    // 되돌리므로 dragging-changed에서 걸어 둔 빗장(dragLatch)을 본다(면 피커도 같은 것을 본다).
    if (moved || latched) return;
    const id = pointFrom(ev);
    ui.set({ selection: id ? { type: 'item', id } : null });
  };
  const onMenu = ev => {
    if (getMode() === 'fp' || ui.get().matPick) return; // 적용 모드에서는 면 메뉴가 뜬다(아이템 메뉴가 가로채지 않는다)
    const id = pointFrom(ev);
    if (!id) return;
    ev.preventDefault();
    ui.set({ selection: { type: 'item', id } });
    openMenu(ev.clientX, ev.clientY, itemMenuItems({ store, ui, ids: [id], itemActions }) ?? []);
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('contextmenu', onMenu);
  window.addEventListener('keydown', onKey, true);   // 캡처: keymap보다 먼저 본다(destroy에서 해제한다)

  gizmo.addEventListener('dragging-changed', e => {
    controls.enabled = !e.value;
    if (e.value) { dragging = true; dragLatch.arm(); pending = null; store.beginTransaction(); return; }
    // 취소된 드래그는 트랜잭션도 미리보기도 이미 닫혔다(onKey): 놓는 순간 아무것도 쓰지 않는다.
    // 프록시만 아이템 자리로 되맞춘다 — 취소 뒤에도 three는 프록시를 계속 끌고 다녔다.
    if (!dragging) { pending = null; attach(current ? { type: 'item', id: current } : null); return; }
    dragging = false;
    // 드래그당 dispatch는 이 하나다(§15.2의 프리뷰 계약 · 리뷰 I-4). 10 mm마다 쓰면 sceneSignature가
    // 바뀌어 층 전체를 다시 짓는다(감사 §29의 480 ms/프레임). 트랜잭션 안이므로 record: false이고
    // endTransaction이 그것을 되돌리기 한 단계로 닫는다 — 움직이지 않았으면 빈 단계도 남지 않는다.
    if (pending && current) updateItem(store, current, pending, { record: false });
    pending = null;
    store.endTransaction();
  });
  gizmo.addEventListener('objectChange', () => {
    if (!current || !dragging) return;   // 취소 뒤의 움직임은 미리보기에도 pending에도 닿지 않는다
    const it = activeFloor(store.get()).items.find(x => x.id === current);
    if (!it) return;
    const patch = gizmoPatch(proxy, it);
    pending = { pos: [Math.round(patch.pos[0]), Math.round(patch.pos[1])], z: Math.round(patch.z), rot: patch.rot };
    previewItemMesh(itemMeshOf(getGroup(), current), it, pending);   // 씬을 다시 짓지 않고 아이템 메시만 옮긴다
    requestRender();
  });

  function attach(sel) {
    if (getMode() === 'fp' || ui.get().matPick) { detach(); return; } // 걷는 화면·마감재 적용 모드에는 기즈모가 없다(TransformControls의 자체 포인터 리스너가 클릭을 가로채지 않게)
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
  // [Esc]·Ctrl+Z는 축 드래그의 취소다(bodyDrag.js의 onKey와 같은 규칙 — Task 7 재리뷰 OPEN-1):
  // 트랜잭션을 되돌리고 메시를 모델 값으로 돌린다 → 되돌리기 단계가 남지 않는다. 키를 캡처에서
  // 소비하는 이유도 같다: keymap(window, 버블)이 이어서 선택을 비우거나 **한 단계 더** 되돌리면
  // 취소 한 번이 두 일을 한다. 예전에는 [Esc]가 선택만 풀고 pointerup이 그대로 커밋했다.
  function onKey(ev) {
    // ev.key가 없는 합성 이벤트에서 던지지 않게 감싼다(리뷰 m-2): 던지면 축 드래그 중 Ctrl을 누른 채 도는 키마다 예외가 보고되고 이 리스너의 취소 경로가 통째로 건너뛰어진다.
    if (!dragging || !(ev.key === 'Escape' || ((ev.ctrlKey || ev.metaKey) && String(ev.key ?? '').toLowerCase() === 'z'))) return;
    dragging = false;                    // 남은 objectChange와 놓는 순간의 dragging-changed를 막는다
    gizmo.reset?.();                     // 프록시를 드래그 시작 자리로(실제 드래그 중일 때만 동작한다)
    pending = null;
    const it = current ? activeFloor(store.get()).items.find(x => x.id === current) : null;
    if (it) previewItemMesh(itemMeshOf(getGroup(), current), it);   // 미리보기를 모델 값으로 되돌린다
    store.cancelTransaction();
    ev.stopPropagation(); ev.preventDefault();
    requestRender();
  }

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
      window.removeEventListener('keydown', onKey, true);
      disposeGizmo(gizmo, scene);
      scene.remove(proxy);
    },
  };
}
