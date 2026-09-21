// 선택 도구의 덕트 분기(아키텍처 §11.3). selectTool.js가 300줄을 넘지 않게 여기로 나눴다.
// 꼭짓점 드래그 = 그 점만, 구간 드래그 = 폴리라인 전체 평행 이동(연결된 설비는 따라오지 않는다).
import { activeFloor } from '../../state/schema.js';
import { snapToEquipment, DUCT_SNAP_TOL } from '../../geom/ducts.js';
import { lerp } from '../../geom/vec.js';
import { ductById, moveDuctPoint, translateDuct, connectDuct, disconnectDuct, deleteDuctSelection } from '../../state/ductOps.js';
import { ductMenuItems } from '../../ui/ductMenu.js';
import { drawDuctSelection, ductVisible } from '../ducts2d.js';

// Delete 키의 덕트 규칙(판정은 state/ductOps.js의 deleteDuctSelection에 있다 — 아키텍처 §11.3·§9).
// main.js의 deleteSelection과 ui/ductPanel.js의 삭제 버튼도 그 판정 함수를 부른다: 이 함수는
// 선택 상태를 읽고(ui.get()) 판정 결과에 맞춰 선택·토스트를 처리하는 view2d 쪽 얇은 래퍼일 뿐이다.
// 이름이 상태 함수와 같으면 floorOps의 재내보내기(`export * from './ductOps.js'`)와 충돌해 보이므로
// 래퍼는 deleteSelectedDuct다(상태 op만 deleteDuctSelection이라는 이름을 갖는다).
export function deleteSelectedDuct({ store, ui, toast = () => {} }) {
  const s = ui.get().selection;
  if (s?.type !== 'duct') return false;
  const r = deleteDuctSelection(store, s);
  if (r.missing) { ui.set({ selection: null }); return true; }
  if (r.locked) { toast('잠긴 덕트는 삭제할 수 없습니다'); return true; }
  if (r.deleted === 'point') { ui.set({ selection: { type: 'duct', id: s.id, segment: null, vertex: null } }); return true; }
  ui.set({ selection: null });   // r.deleted === 'duct'
  return true;
}

export function createDuctSelect({ store, ui, toast = () => {} }) {
  const floor = () => activeFloor(store.get());
  const flags = () => store.get().view?.v2 ?? {};
  let drag = null;   // { kind:'vertex'|'duct', id, index, startP, base: points[], applied:[dx,dy], moved }

  const current = () => { const s = ui.get().selection; return s?.type === 'duct' ? s : null; };

  // 히트 하나를 선택으로 바꾸고, 움직일 수 있으면 드래그를 시작한다.
  // 히트 판정은 이 파일에 없다(§14.6): 2D의 히트 순서와 허용오차는 pick.pickAt 한 곳에만 있고
  // 좌클릭(selectTool.onPointerDown)·우클릭(onContextMenu)이 그 결과를 begin·menuFor로 넘긴다.
  // 예전에는 여기에도 pick·pickHandle이 있어 구간 허용오차(px(8))와 꼭짓점 핸들 루프가 두 벌이었다.
  function begin(hit, p) {
    const d = ductById(floor(), hit.ductId);
    ui.set({ selection: { type: 'duct', id: hit.ductId, segment: hit.segment ?? null, vertex: hit.vertex ?? null } });
    if (!d) return true;
    if (d.locked) { toast('잠긴 덕트는 움직일 수 없습니다'); return true; }
    drag = {
      kind: hit.vertex != null ? 'vertex' : 'duct', id: hit.ductId, index: hit.vertex ?? hit.segment,
      startP: p, base: d.points.map(q => [...q]), applied: [0, 0], moved: false,
    };
    store.beginTransaction();
    return true;
  }

  function apply(p) {
    if (!drag) return;
    const dx = Math.round(p[0] - drag.startP[0]), dy = Math.round(p[1] - drag.startP[1]);
    if (!drag.moved && Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    drag.moved = true;
    if (drag.kind === 'vertex') {
      const b = drag.base[drag.index];
      moveDuctPoint(store, drag.id, drag.index, [b[0] + dx, b[1] + dy], { record: false });
      return;
    }
    // 평행 이동은 "지금까지 적용한 양"과의 차이만 넘긴다: 반올림이 드래그 내내 쌓이지 않는다.
    translateDuct(store, drag.id, [dx - drag.applied[0], dy - drag.applied[1]], { record: false });
    drag.applied = [dx, dy];
  }

  // 연결된 꼭짓점을 설비에서 떼어 놓으면 연결을 끊고, 다른 설비 위에 떨어뜨리면 그쪽으로 갈아 끼운다
  // (아키텍처 §11.3). 이것이 없으면 3D 라이저가 설비 위에 남아 아무것도 잇지 않는 수직 박스가 된다.
  // 판정은 snapToEquipment과 같은 규칙이다: 풋프린트 안이거나 접속점에서 DUCT_SNAP_TOL 이내면 붙어 있다.
  // 드래그와 같은 트랜잭션 안에서 { record:false }로 부르므로 되돌림은 여전히 한 단계다.
  function resnap(id, index) {
    const f = floor();
    const d = ductById(f, id);
    const conn = d?.connections.find(c => c.point === index);
    if (!conn || !d.points[index]) return;
    const snap = snapToEquipment(f.items ?? [], d.points[index], DUCT_SNAP_TOL);
    if (!snap) disconnectDuct(store, id, index, { record: false });
    else if (snap.itemId !== conn.itemId) connectDuct(store, id, index, snap.itemId, { record: false });
  }

  function finish() {
    if (!drag) return false;
    const moved = drag.moved;
    if (moved && drag.kind === 'vertex') resnap(drag.id, drag.index);
    moved ? store.endTransaction() : store.cancelTransaction();
    drag = null;
    return moved;
  }
  function cancel() { if (drag) { store.cancelTransaction(); drag = null; } }

  // 히트 하나에서 덕트 메뉴를 만든다(§14.6: 우클릭 대상은 좌클릭 대상과 같아야 하므로
  // 판정은 pick.pickAt이 하고 여기서는 그 결과를 메뉴로 바꾼다).
  function menuFor(hit) {
    if (!hit) return null;
    const next = { type: 'duct', id: hit.ductId, segment: hit.segment ?? null, vertex: hit.vertex ?? null };
    ui.set({ selection: next });
    // 구간 히트면 hitDuct가 돌려준 t로 중심선 위의 점을 넘긴다(클릭은 띠 반폭만큼 벗어날 수 있다).
    const d = ductById(floor(), hit.ductId);
    const a = hit.segment != null ? d?.points[hit.segment] : null, b = hit.segment != null ? d?.points[hit.segment + 1] : null;
    return ductMenuItems({ store, ui, sel: next, at: a && b ? lerp(a, b, hit.t ?? 0.5) : null });
  }
  function draw(ctx, v) {
    const s = current();
    if (!s) return;
    const d = ductById(floor(), s.id);
    if (d && ductVisible(d, flags())) drawDuctSelection(ctx, v, d, s);
  }

  return {
    begin, apply, finish, cancel, menuFor, draw,
    deleteSelected: () => deleteSelectedDuct({ store, ui, toast }),
    getDrag: () => (drag ? { kind: drag.kind, id: drag.id, index: drag.index } : null),
  };
}
