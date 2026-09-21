// 덕트 우클릭 메뉴(아키텍처 §11.3). 2D 선택 도구와 3D 면 피커가 같은 함수를 쓴다(surfaceMenu와 같은 자리).
import { activeFloor } from '../state/schema.js';
import { ductById, insertDuctPoint, deleteDuctPoint, addDamper, updateDuct, deleteDucts, disconnectDuct } from '../state/ductOps.js';

export function ductMenuItems({ store, ui, sel, at = null }) {
  const d = sel?.type === 'duct' ? ductById(activeFloor(store.get()), sel.id) : null;
  if (!d) return null;
  const seg = Number.isInteger(sel.segment) ? sel.segment : null;
  const vtx = Number.isInteger(sel.vertex) ? sel.vertex : null;
  const conn = vtx !== null ? d.connections.find(c => c.point === vtx) : null;
  const mid = seg !== null && d.points[seg + 1] ? [(d.points[seg][0] + d.points[seg + 1][0]) / 2, (d.points[seg][1] + d.points[seg + 1][1]) / 2] : null;
  const clear = () => ui.set({ selection: { type: 'duct', id: d.id, segment: null, vertex: null } });
  return [
    { label: '점 삽입', disabled: seg === null || d.locked, onSelect: () => { insertDuctPoint(store, d.id, seg, at ?? mid); clear(); } },
    { label: '점 삭제', disabled: vtx === null || d.locked || d.points.length <= 2, onSelect: () => { deleteDuctPoint(store, d.id, vtx); clear(); } },
    { label: '댐퍼 추가', disabled: seg === null || d.locked, onSelect: () => addDamper(store, d.id, { segment: seg, t: 0.5, type: 'VD' }) },
    'sep',
    { label: d.kind === 'supply' ? '배기로 전환' : '급기로 전환', disabled: d.locked, onSelect: () => updateDuct(store, d.id, { kind: d.kind === 'supply' ? 'exhaust' : 'supply' }) },
    { label: '설비 연결 해제', disabled: !conn, onSelect: () => disconnectDuct(store, d.id, vtx) },
    'sep',
    { label: d.locked ? '잠금 해제' : '잠금', onSelect: () => updateDuct(store, d.id, { locked: !d.locked }) },
    { label: d.hidden ? '숨김 해제' : '숨김', onSelect: () => updateDuct(store, d.id, { hidden: !d.hidden }) },
    'sep',
    { label: '삭제', shortcut: '⌫', danger: true, onSelect: () => { deleteDucts(store, [d.id]); ui.set({ selection: null }); } },
  ];
}
