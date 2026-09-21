// 선택 도구의 덕트 분기(아키텍처 §11.3). selectTool.js가 300줄을 넘지 않게 여기로 나눴다.
// 꼭짓점 드래그 = 그 점만, 구간 드래그 = 폴리라인 전체 평행 이동(연결된 설비는 따라오지 않는다).
import { activeFloor } from '../../state/schema.js';
import { hitDuct } from '../../geom/ducts.js';
import { ductById, moveDuctPoint, translateDuct, deleteDucts, deleteDuctPoint } from '../../state/ductOps.js';
import { ductMenuItems } from '../../ui/ductMenu.js';
import { drawDuctSelection, ductVisible } from '../ducts2d.js';

// Delete 키의 덕트 규칙: 꼭짓점을 골랐고 점이 3개 이상이면 점 하나, 아니면 덕트 전체(아키텍처 §11.3).
// main.js의 deleteSelection도 이 함수를 부른다 — 규칙이 두 곳에 갈리지 않게 모듈 함수로 둔다.
export function deleteDuctSelection({ store, ui, toast = () => {} }) {
  const s = ui.get().selection;
  if (s?.type !== 'duct') return false;
  const d = ductById(activeFloor(store.get()), s.id);
  if (!d) { ui.set({ selection: null }); return true; }
  if (d.locked) { toast('잠긴 덕트는 삭제할 수 없습니다'); return true; }
  if (Number.isInteger(s.vertex) && d.points.length > 2) {
    deleteDuctPoint(store, d.id, s.vertex);
    ui.set({ selection: { type: 'duct', id: d.id, segment: null, vertex: null } });
    return true;
  }
  deleteDucts(store, [d.id]);
  ui.set({ selection: null });
  return true;
}

export function createDuctSelect({ store, ui, view, toast = () => {} }) {
  const px = n => n / view.camera.scale;
  const floor = () => activeFloor(store.get());
  const flags = () => store.get().view?.v2 ?? {};
  let drag = null;   // { kind:'vertex'|'duct', id, index, startP, base: points[], applied:[dx,dy], moved }

  const visible = () => (floor().ducts ?? []).filter(d => ductVisible(d, flags()));
  const pick = p => hitDuct(visible(), p, px(8));
  const current = () => { const s = ui.get().selection; return s?.type === 'duct' ? s : null; };

  function onDown(p) {
    const hit = pick(p);
    if (!hit) return false;
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

  function finish() {
    if (!drag) return false;
    const moved = drag.moved;
    moved ? store.endTransaction() : store.cancelTransaction();
    drag = null;
    return moved;
  }
  function cancel() { if (drag) { store.cancelTransaction(); drag = null; } }

  function menuItems(p) {
    const hit = pick(p);
    if (!hit) return null;
    const next = { type: 'duct', id: hit.ductId, segment: hit.segment ?? null, vertex: hit.vertex ?? null };
    ui.set({ selection: next });
    return ductMenuItems({ store, ui, sel: next, at: hit.segment != null ? [Math.round(p[0]), Math.round(p[1])] : null });
  }

  function draw(ctx, v) {
    const s = current();
    if (!s) return;
    const d = ductById(floor(), s.id);
    if (d && ductVisible(d, flags())) drawDuctSelection(ctx, v, d, s);
  }

  return {
    pick, onDown, apply, finish, cancel, menuItems, draw,
    deleteSelected: () => deleteDuctSelection({ store, ui, toast }),
    getDrag: () => (drag ? { kind: drag.kind, id: drag.id, index: drag.index } : null),
  };
}
