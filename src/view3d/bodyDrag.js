// 3D 몸체 드래그와 벽 슬라이드 핸들(§17.5 · 감사 §2·§6). TransformControls는 축 화살표·평면 핸들
// 위에서만 잡히므로 선택된 후드 중심에서 60 px을 끌어도 pos가 그대로였다. pick3d.js가 203줄이라
// 300줄 규칙 앞에서 새 파일로 나눈다(기즈모 자체의 규칙은 그 파일에 그대로 남는다).
// 순수 조각(snapMm·dragPointOnPlane·makeGhost·slidePlacement)은 WebGL 없이 테스트된다.
// 드래그 중에는 store에 쓰지 않는다(§15.2의 프리뷰 계약을 3D에도 — 리뷰 I-4): 아이템 메시·고스트·
// 핸들만 옮기고 pointerup에서 딱 한 번 dispatch한다(되돌리기는 그대로 한 단계이고 sceneSignature도
// 드래그 중에는 그대로다). [Esc]·Ctrl+Z는 2D와 같이 드래그 취소다(리뷰 I-5).
import * as THREE from 'three';
import { activeFloor } from '../state/schema.js';
import { updateItem } from '../state/floorOps.js';
import { nearestWallPlacement, WALL_ATTACH_DIST, isEmbed } from '../geom/items.js';
import { toThree } from './build.js';
import { GIZMO_COLORS, itemMeshOf, previewItemMesh } from './pick3d.js';
import { itemVisible3 } from './items3d.js';
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
// Raycaster와 Ray를 모두 받는다(리뷰 M-5): 옵셔널 호출로 감싸면 "Raycaster에는 intersectPlane이
// 없다"는 인자 타입 오류를 조용히 삼켜 null만 돌려준다 — 그 결함이 순수 테스트에 잡히지 않았다.
export function dragPointOnPlane(ray, y) {
  const r = ray?.ray ?? ray;   // three 0.169의 Raycaster에는 isRaycaster 표시가 없다 — 안의 Ray로 판별한다
  const hit = r ? r.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3()) : null;
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
// embed는 반드시 넘긴다(리뷰 C-1): 없으면 placeOnWall이 문·창·개구부를 벽면 앞으로 (두께/2 +
// 깊이/2)만큼 띄워, 벽 구멍(t·size만 보는 openingsOnWall)과 문짝이 어긋난다. 2D 드래그·재부착·
// 복제·화살표 이동(itemDrag.js:63 · floorInternal.js:23 · floorOps.js:227)이 모두 넘기는 그 플래그다.
export function slidePlacement(floor, item, p) {
  const hit = nearestWallPlacement(floor?.walls ?? [], p, item.size, WALL_ATTACH_DIST, { embed: isEmbed(item) });
  if (!hit || hit.wallId !== item.wallId) return null;
  return { t: hit.t, pos: [Math.round(hit.pos[0]), Math.round(hit.pos[1])], side: hit.side, rot: hit.rot };
}

export function createBodyDrag({ renderer, getCamera, getGroup, scene, store, ui, controls = null, requestRender = () => {}, dragLatch = null, toast = showToast, getMode = () => 'iso', isOrtho = () => false, onEnd = () => {} }) {
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let handle = null, ghost = null, drag = null;
  const floor = () => activeFloor(store.get());
  const selected = () => {
    const s = ui.get().selection;
    const id = s?.type === 'item' ? s.id : null;
    return id ? (floor().items.find(x => x.id === id) ?? null) : null;
  };
  const meshFor = id => itemMeshOf(getGroup(), id);
  const liftOf = it => (Number(it.z) || 0) + (Number(it.size?.[2]) || 0) + SLIDE_LIFT;
  const setRay = ev => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / (r.width || 1)) * 2 - 1, -((ev.clientY - r.top) / (r.height || 1)) * 2 + 1);
    ray.setFromCamera(ndc, getCamera());
  };
  const dropHandle = () => { if (!handle) return; scene.remove(handle); handle.geometry?.dispose?.(); handle.material?.dispose?.(); handle = null; };
  // 복제한 재질은 버린다(M-1: 드래그마다 한 벌씩 샜다). 지오메트리는 원본과 공유하므로 손대지 않는다.
  const dropGhost = () => { if (!ghost) return; scene.remove(ghost); ghost.traverse(o => { for (const m of [].concat(o.material ?? [])) m.dispose?.(); }); ghost = null; };

  // 선택이 바뀌거나 씬을 다시 지으면 부른다: **벽 부착 제품에만** 주황 핸들을 세운다(§17.5(2)).
  // 잠긴 아이템에는 핸들도 없다(움직일 수 없는 것에 손잡이를 주지 않는다). 편집할 수 없는 고정
  // 투영 뷰(정면·평면 도면)도 같고(리뷰 I-1), 숨긴 아이템도 같다(M-3: 보이지 않는 것을 끌지 않는다).
  function refresh() {
    dropHandle();
    const it = selected();
    if (it && !it.locked && it.attach === 'wall' && it.wallId && getMode() !== 'fp' && !isOrtho() && itemVisible3(it, store.get().view?.v3 ?? {})) {
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
    // controls.enabled === false이면 기즈모 축 드래그가 이 pointerdown을 이미 먹었다(리뷰 I-3):
    // TransformControls의 리스너가 먼저 돌아 dragging-changed가 궤도 조작을 끈 상태다. 같은 이벤트로
    // 몸체 드래그까지 열면 한 프레임에 두 기계가 같은 필드를 쓴다. 고정 투영 뷰도 열지 않는다(I-1).
    // 이미 드래그 중이면 두 번째 pointerdown으로 갈아타지 않는다(M-6).
    if (ev.button !== 0 || drag || getMode() === 'fp' || isOrtho() || ui.get().matPick || controls?.enabled === false) return;
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
    const at = dragPointOnPlane(ray, y);
    if (!at) return;
    // base는 시작 시점의 아이템이다: 드래그 중에는 store에 쓰지 않으므로(I-4) 끝까지 유효하고,
    // 취소가 되돌릴 자리(pos·rot)도 여기 있다. wasEnabled는 드래그를 열기 전의 궤도 조작 상태다.
    drag = { id: it.id, base: it, slide: onHandle, y, grab: at, from: [...it.pos], px: [ev.clientX, ev.clientY], open: false, preview: null, wasEnabled: controls ? controls.enabled : true };
    if (controls) controls.enabled = false;   // 궤도 회전이 같은 드래그를 함께 먹지 않게(기즈모와 같은 규칙)
    // 활성 포인터가 아닌 id는 NotFoundError를 던진다(리뷰 m-3 · 합성 포인터 이벤트). 캡처는 "있으면
    // 좋은 것"이지 드래그의 계약이 아니다 — 놓쳤다고 pointerdown이 예외로 끝나서는 안 된다.
    try { renderer.domElement.setPointerCapture?.(ev.pointerId); } catch { /* 합성 포인터 */ }
  }

  // 드래그 중 미리보기(리뷰 I-4): store 대신 아이템 메시와 핸들만 옮긴다. preview가 null이면
  // 시작 자리로 되돌린다 — 취소([Esc]·Ctrl+Z)가 이 길로 원상복구한다.
  function showPreview() {
    const patch = drag.preview ?? { pos: drag.from, rot: drag.base.rot };
    previewItemMesh(meshFor(drag.id), drag.base, patch);
    if (handle) { handle.position.copy(toThree([patch.pos[0], patch.pos[1], liftOf(drag.base)])); handle.updateMatrixWorld(); }
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
    const at = dragPointOnPlane(ray, drag.y);
    if (!at) return;
    const p = [drag.from[0] + (at[0] - drag.grab[0]), drag.from[1] + (at[1] - drag.grab[1])];
    // §15.2를 3D에도(리뷰 I-4): 여기서는 dispatch하지 않는다. 10 mm마다 쓰면 sceneSignature가
    // 바뀌어 층 전체를 다시 짓고(감사 §29의 480 ms/프레임) 고스트가 원본과 나눠 쓰는 지오메트리도
    // 매 프레임 다시 올라간다. 대가는 2D와 같다: 속성 패널·배너는 놓는 순간의 자리를 보여 준다.
    const next = drag.slide ? slidePlacement(floor(), drag.base, p) : { pos: [snapMm(p[0]), snapMm(p[1])] };
    if (!next) return;             // 벽에서 300 mm 밖: 이동을 무시한다(부착을 풀지 않는다 — §17.5)
    drag.preview = next;
    showPreview();
    requestRender();
  }

  function onUp(ev) {
    if (!drag || (ev?.type === 'pointerup' && ev.button !== 0)) return;   // 오른쪽 버튼을 떼는 것은 이 드래그의 끝이 아니다(M-6)
    const { id, open, preview, wasEnabled } = drag;
    drag = null;
    dropGhost();
    if (controls) controls.enabled = wasEnabled;   // 드래그 전 값으로만 되돌린다(고정 투영 뷰의 잠금을 되살리지 않는다 — 리뷰 I-1)
    if (open) {
      // 드래그당 dispatch는 이 하나다. 트랜잭션 안이므로 record: false이고 endTransaction이 그것을
      // 되돌리기 한 단계로 닫는다 — 아무것도 움직이지 않았으면 상태가 그대로라 빈 단계도 남지 않는다.
      if (preview) updateItem(store, id, preview, { record: false });
      store.endTransaction();
      onEnd();   // 기즈모 프록시를 아이템의 새 자리로(리뷰 I-2: endTransaction은 알리지 않는다)
    }
    requestRender();
  }

  // [Esc]·Ctrl+Z는 드래그 취소다(2D selectTool.js:183-196과 같은 규칙 — 리뷰 I-5): 트랜잭션을
  // 되돌리고 메시·고스트·핸들을 시작 자리로 돌린다 → 되돌리기 단계가 남지 않는다. 키를 여기서
  // 소비하는 이유도 2D와 같다: keymap(window, 버블)이 이어서 선택을 비우거나 **한 단계 더** 되돌리면
  // 취소 한 번이 두 일을 한다. 아직 열리지 않은 드래그(클릭일 수도 있다)는 조용히 버리고 키는 넘긴다.
  function onKey(ev) {
    // ev.key가 없는 합성 이벤트에서 던지지 않게 감싼다(리뷰 m-2): 던지면 드래그 중 Ctrl을 누른 채 도는 키마다 예외가 보고되고 이 리스너의 취소 경로가 통째로 건너뛰어진다.
    if (!drag || !(ev.key === 'Escape' || ((ev.ctrlKey || ev.metaKey) && String(ev.key ?? '').toLowerCase() === 'z'))) return;
    const { open, wasEnabled } = drag;
    if (open) { drag.preview = null; showPreview(); }
    drag = null;
    dropGhost();
    if (controls) controls.enabled = wasEnabled;
    if (open) { store.cancelTransaction(); ev.stopPropagation(); ev.preventDefault(); }
    requestRender();
  }

  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKey, true);   // 캡처: keymap보다 먼저 본다(destroy에서 해제한다)
  return {
    refresh,
    isDragging: () => !!drag?.open,
    destroy() {
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey, true);
      dropHandle(); dropGhost();
    },
  };
}
