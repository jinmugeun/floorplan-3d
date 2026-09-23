import * as THREE from 'three';
import { applyMaterial } from '../state/materialOps.js';
import { wallMenuItems, roomMenuItems } from '../ui/surfaceMenu.js';
import { ductMenuItems } from '../ui/ductMenu.js';
import { activeFloor } from '../state/schema.js';
import { ductById } from '../state/ductOps.js';
import { segmentForMeshData } from '../geom/ducts.js';

// 레이캐스트로 고를 수 있는 면 메시 이름(build.js가 붙인다).
export const FACE_NAMES = new Set(['wall', 'wallFace', 'wallRegion', 'floor', 'ceiling', 'wallTop']);

// hit → materialOps의 target. 벽 본체·윗면은 외벽, 방 안쪽 면은 내벽으로 본다.
export function targetOf(hit) {
  if (hit?.kind === 'wall') return { kind: 'wall', id: hit.id, side: hit.side === 'out' ? 'out' : 'in' };
  return { kind: hit?.kind === 'ceiling' ? 'ceiling' : 'floor', id: hit?.id };
}

// 3D에서 면(벽·바닥·천장)을 고르고, 마감재 적용 모드면 클릭마다 재질을 바른다.
// 아이템은 pick3d의 아이템 피커가 맡는다: 여기서는 아이템을 맞히면 물러난다.
export function createFacePicker({ renderer, getCamera, scene, getGroup, store, ui, openMenu = () => {}, onSelect = null, surfaceActions = {}, getMode = () => 'iso', requestRender = () => {}, dragLatch = { latched: () => false } }) {
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();

  function hitAt(ev, { skipItems = false } = {}) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / (r.width || 1)) * 2 - 1, -((ev.clientY - r.top) / (r.height || 1)) * 2 + 1);
    ray.setFromCamera(ndc, getCamera());
    const root = getGroup() ?? scene;
    root.updateMatrixWorld();   // 레이캐스트는 최신 월드 행렬을 본다: 다시 지은 직후(렌더 전) 클릭도 맞아야 한다
    const roots = root.children;
    const itemGroup = roots.find(c => c.name === 'items');
    // 조합 형상은 Group이다: 재귀로 맞히고 엣지 선(LineSegments)은 건너뛴다(Line 허용치가 월드 1 m다).
    // 레이캐스터는 object.visible을 보지 않으므로 여기서 거른다(숨긴 아이템이 모든 픽을 이기지 않게 — M-5).
    // skipItems는 마감재 적용 모드다: 그 모드에서는 아이템이 선택 대상이 아니므로(pick3d의 아이템
    // 피커도 물러난다) 아이템을 겨루지 않는다 — 광선 위 어디든 아이템이 있으면 그 **뒤의** 면까지
    // 칠할 수 없어 "클릭이 먹지 않는다"가 됐다(리뷰 I-1).
    const itemHit = !skipItems && itemGroup ? ray.intersectObjects(itemGroup.children, true).find(x => x.object.isMesh && x.object.visible) ?? null : null;
    const ductGroup = roots.find(c => c.name === 'ducts');
    const ductHit = ductGroup ? ray.intersectObjects(ductGroup.children, false)[0] : null;
    const faceHit = ray.intersectObjects(roots.filter(c => FACE_NAMES.has(c.name) && c.visible), false)[0] ?? null;
    // 아이템이 맞으면 **언제나 아이템**이다(§17.1(2) · 감사 §1의 11건). 거리로 다시 재면 안 된다:
    // pick3d의 아이템 피커는 items 그룹만 레이캐스트하므로 광선이 아이템에 닿으면 무조건 그것을
    // 고른다 → 거리 비교를 하는 이쪽이 벽·덕트를 골라 두 피커가 같은 클릭에 다른 답을 내고
    // 나중 것이 이겼다. 대가: 후드 앞을 지나는 덕트는 그 지점에서 3D로 집히지 않는다(덕트는 2D ·
    // 레이어 패널 · 덕트 선택 도구로 계속 집힌다). 덕트 대 면의 거리 비교는 그대로다.
    if (itemHit) return { kind: 'item', id: itemHit.object.userData.itemId };
    if (ductHit && (!faceHit || ductHit.distance <= faceHit.distance)) {
      // 구간 메시는 segment를 들고 있지만 라이저는 연결 점, 댐퍼는 댐퍼 번호만 들고 있다(§12.5).
      const u = ductHit.object.userData;
      return { kind: 'duct', id: u.ductId, segment: segmentForMeshData(ductById(activeFloor(store.get()), u.ductId), u) };
    }
    if (!faceHit) return null;
    const o = faceHit.object;
    if (o.userData.wallId) {
      const side = o.userData.side ?? (o.name === 'wallFace' ? 'in' : 'out');
      return { kind: 'wall', id: o.userData.wallId, side, roomId: o.userData.roomId ?? null };
    }
    if (o.userData.roomId) return { kind: o.name === 'ceiling' ? 'ceiling' : 'floor', id: o.userData.roomId };
    return null;
  }

  let down = null;
  const onDown = ev => { if (ev.button === 0 && getMode() !== 'fp') down = [ev.clientX, ev.clientY]; };
  const onUp = ev => {
    const start = down; down = null;
    // 기즈모 드래그로 끝난 pointerup은 선택이 아니다(TransformControls는 같은 요소의 이벤트를 막지 않는다).
    if (dragLatch.latched(ev)) return;
    if (ev.button !== 0 || !start || getMode() === 'fp') return;
    if (Math.hypot(ev.clientX - start[0], ev.clientY - start[1]) > 4) return; // 궤도 회전은 선택이 아니다
    const pick = ui.get().matPick;
    const hit = hitAt(ev, { skipItems: !!pick });
    if (pick) {
      if (hit && hit.kind !== 'item' && hit.kind !== 'duct') { applyMaterial(store, targetOf(hit), pick.assignment); requestRender(); }
      return;                                    // 적용 모드는 Esc까지 계속된다(덕트에는 재질을 바르지 않는다)
    }
    if (!hit || hit.kind === 'item') return;      // 아이템은 아이템 피커가 이미 골랐다
    if (hit.kind === 'duct') { ui.set({ selection: { type: 'duct', id: hit.id, segment: hit.segment, vertex: null } }); onSelect?.(hit); return; }
    ui.set({ selection: hit.kind === 'wall' ? { type: 'wall', id: hit.id } : { type: 'room', id: hit.id } });
    onSelect?.(hit);
  };
  const onMenu = ev => {
    // defaultPrevented는 보지 않는다: OrbitControls가 enabled인 동안 모든 contextmenu를 먼저 막으므로
    // 그것으로는 "아이템 피커가 이미 열었다"를 알 수 없다. 아래 hit.kind === 'item'이 그 판정을 한다.
    if (getMode() === 'fp') return;
    const hit = hitAt(ev, { skipItems: !!ui.get().matPick });
    if (!hit || hit.kind === 'item') return;
    ev.preventDefault();
    if (hit.kind === 'duct') {
      const sel = { type: 'duct', id: hit.id, segment: hit.segment, vertex: null };
      ui.set({ selection: sel });
      openMenu(ev.clientX, ev.clientY, ductMenuItems({ store, ui, sel }) ?? []);
      return;
    }
    if (hit.kind === 'wall') {
      ui.set({ selection: { type: 'wall', id: hit.id } });
      openMenu(ev.clientX, ev.clientY, wallMenuItems({ store, ui, wallId: hit.id, roomId: hit.roomId, side: hit.side, in3d: true, actions: surfaceActions }) ?? []);
      return;
    }
    ui.set({ selection: { type: 'room', id: hit.id } });
    openMenu(ev.clientX, ev.clientY, roomMenuItems({ store, ui, roomId: hit.id, in3d: true, actions: surfaceActions }) ?? []);
  };

  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('contextmenu', onMenu);

  return {
    hitAt,
    destroy() {
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('contextmenu', onMenu);
    },
  };
}
