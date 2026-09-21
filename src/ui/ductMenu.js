// 덕트 우클릭 메뉴(아키텍처 §11.3). 2D 선택 도구와 3D 면 피커가 같은 함수를 쓴다(surfaceMenu와 같은 자리).
import { activeFloor } from '../state/schema.js';
import { ductById, insertDuctPoint, deleteDuctPoint, addDamper, updateDuct, deleteDucts, disconnectDuct } from '../state/ductOps.js';
import { projectOnSegment } from '../geom/ducts.js';

// at(클릭 지점)은 구간 중심선에서 최대 w/2만큼 벗어나 있을 수 있다(히트 허용치가 띠 반폭이다).
// 그 좌표를 그대로 새 꼭짓점으로 쓰면 직선 덕트가 꺾이므로, 여기서 한 번 구간 위로 투영한다 —
// 2D 선택 도구·3D 면 피커·다른 호출자가 모두 이 한 곳을 지난다(DT-05 "구간 중간에 점 삽입").
export function ductMenuItems({ store, ui, sel, at = null }) {
  const d = sel?.type === 'duct' ? ductById(activeFloor(store.get()), sel.id) : null;
  if (!d) return null;
  const seg = Number.isInteger(sel.segment) ? sel.segment : null;
  const vtx = Number.isInteger(sel.vertex) ? sel.vertex : null;
  const conn = vtx !== null ? d.connections.find(c => c.point === vtx) : null;
  const a = seg !== null ? d.points[seg] : null, b = seg !== null ? d.points[seg + 1] : null;
  const mid = a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null;
  const insertAt = a && b && at ? projectOnSegment(a, b, at) : mid;
  const clear = () => ui.set({ selection: { type: 'duct', id: d.id, segment: null, vertex: null } });
  return [
    { label: '점 삽입', disabled: seg === null || d.locked, onSelect: () => { insertDuctPoint(store, d.id, seg, insertAt); clear(); } },
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
