// 덕트 상태 변경 한 곳(아키텍처 §11.2). floorOps.js가 300줄 규칙에 걸리지 않게 별도 모듈이고,
// floorOps.js가 다시 내보낸다(호출자는 계속 floorOps.js만 import해도 된다 — 이름이 겹치는 export는 없다).
// floorOps.js를 import하지 않으므로 순환 import가 없다(floorInternal.js·floorMgmt.js와 같은 규칙).
// 모든 액션은 put()을 지나 normalizeDuct로 다시 정규화된다(구간 수·연결·댐퍼 인덱스가 늘 맞는다).
import { activeFloor } from './schema.js';
import { normalizeDuct } from './ductSchema.js';
import { movePoint, insertPoint, deletePoint } from '../geom/ducts.js';

export const ductById = (floor, id) => (floor?.ducts ?? []).find(d => d.id === id) ?? null;
export const ductsOf = (state, ids) => { const set = new Set(ids); return (activeFloor(state).ducts ?? []).filter(d => set.has(d.id)); };
// 잠긴 덕트는 어떤 이동 경로로도 움직이지 않는다(잠긴 아이템의 movable과 같은 규칙).
export const movableDucts = (state, ids) => ductsOf(state, ids).filter(d => !d.locked);

const liveItemIds = f => new Set((f.items ?? []).map(i => i.id));

// 덕트 하나를 함수로 바꿔 제자리에 다시 넣는다. fn이 null을 돌려주거나 정규화한 결과가
// 지금 덕트와 똑같으면 아무 일도 하지 않는다(잠긴 덕트·없는 구간·범위 밖 index·같은 좌표로
// 이동·중복 연결 등 — 되돌릴 단계도 만들지 않는다: dispatch 자체가 히스토리를 쌓으므로 먼저
// 지금 상태로 한 번 가늠해 보고 바뀔 것이 없으면 dispatch를 부르지 않는다. fn은 순수 함수라
// 여기서 한 번만 부르고 그 결과를 dispatch 안에 그대로 넣는다).
function put(store, id, fn, opts = {}) {
  const now = activeFloor(store.get());
  const cur = ductById(now, id);
  if (!cur) return store.get();
  const draft = fn(cur, now);
  const norm = draft ? normalizeDuct(draft, { itemIds: liveItemIds(now) }) : null;
  if (!norm || JSON.stringify(norm) === JSON.stringify(cur)) return store.get();
  return store.dispatch(s => {
    const f = activeFloor(s);
    const i = (f.ducts ?? []).findIndex(x => x.id === id);
    if (i >= 0) f.ducts[i] = structuredClone(norm);
  }, opts);
}

// 호출자가 들고 있는 객체를 그대로 상태에 넣지 않는다(밖에서 고치면 스냅샷이 몰래 바뀐다).
// 추가 경로도 put()과 같은 itemIds 검사를 지난다 — 없는 설비를 가리키는 연결은 들어오는 순간 버린다(§11.2).
export function addDuct(store, duct, opts = {}) {
  const d = normalizeDuct(duct, { itemIds: liveItemIds(activeFloor(store.get())) });
  if (!d) return null;
  store.dispatch(s => { const f = activeFloor(s); f.ducts = [...(f.ducts ?? []), structuredClone(d)]; }, opts);
  return d.id;
}
export const updateDuct = (store, id, patch, opts) => put(store, id, d => ({ ...d, ...patch }), opts);
export function deleteDucts(store, ids, opts = {}) {
  const kill = new Set(ids);
  if (!(activeFloor(store.get()).ducts ?? []).some(d => kill.has(d.id))) return store.get();
  return store.dispatch(s => { const f = activeFloor(s); f.ducts = (f.ducts ?? []).filter(d => !kill.has(d.id)); }, opts);
}
// 숨김·잠금 토글(아이템의 setItemFlag와 같은 규칙): 여러 덕트를 한 단계로 바꾸고, 잠금 자체를
// 거르지 않는다(걸러 내면 잠긴 덕트를 다시 풀 수 없다). value가 null이면 덕트마다 뒤집는다.
export function setDuctFlag(store, ids, key, value = null, opts = {}) {
  const set = new Set(ids);
  if (!(activeFloor(store.get()).ducts ?? []).some(d => set.has(d.id))) return store.get();
  return store.dispatch(s => {
    const f = activeFloor(s);
    const itemIds = liveItemIds(f);
    f.ducts = (f.ducts ?? []).map(d => (set.has(d.id) ? normalizeDuct({ ...d, [key]: value === null ? !d[key] : !!value }, { itemIds }) ?? d : d));
  }, opts);
}
export const updateSegment = (store, id, i, patch, opts) =>
  put(store, id, d => (d.segments[i] ? { ...d, segments: d.segments.map((s, k) => (k === i ? { ...s, ...patch } : s)) } : null), opts);
export const setAllSegments = (store, id, patch, opts) =>
  put(store, id, d => ({ ...d, segments: d.segments.map(s => ({ ...s, ...patch })) }), opts);

export const moveDuctPoint = (store, id, i, p, opts) => put(store, id, d => (d.locked ? null : movePoint(d, i, p)), opts);
export const insertDuctPoint = (store, id, segment, p, opts) => put(store, id, d => (d.locked ? null : insertPoint(d, segment, p)), opts);
export const deleteDuctPoint = (store, id, i, opts) => put(store, id, d => (d.locked ? null : deletePoint(d, i)), opts);
export const translateDuct = (store, id, delta, opts) =>
  put(store, id, d => (d.locked ? null : { ...d, points: d.points.map(p => [p[0] + delta[0], p[1] + delta[1]]) }), opts);

// Delete 키·패널 삭제 버튼이 함께 쓰는 판정(아키텍처 §11.3): 꼭짓점을 골랐고 점이 3개 이상이면
// 점 하나만, 아니면 덕트 전체를 지운다. view2d(선택 도구)와 ui(패널) 둘 다 이 함수만 부르고
// 각자 선택 상태·토스트는 알아서 처리한다(§9 — 상태 판정은 state 계층에, DOM 부수효과는 호출자에).
// sel은 ui.selection 모양 그대로({ type, id, segment, vertex, ... }); duct 선택이 아니면 손대지 않는다.
export function deleteDuctSelection(store, sel) {
  if (sel?.type !== 'duct') return { deleted: null };
  const d = ductById(activeFloor(store.get()), sel.id);
  if (!d) return { deleted: null, missing: true };
  if (d.locked) return { deleted: null, locked: true };
  if (Number.isInteger(sel.vertex) && d.points.length > 2) {
    deleteDuctPoint(store, d.id, sel.vertex);
    return { deleted: 'point' };
  }
  deleteDucts(store, [d.id]);
  return { deleted: 'duct' };
}

export const addDamper = (store, id, damper, opts) =>
  put(store, id, d => ({ ...d, dampers: [...d.dampers, { segment: 0, t: 0.5, type: 'VD', ...damper }] }), opts);
export const updateDamper = (store, id, index, patch, opts) =>
  put(store, id, d => (d.dampers[index] ? { ...d, dampers: d.dampers.map((x, k) => (k === index ? { ...x, ...patch } : x)) } : null), opts);
export const deleteDamper = (store, id, index, opts) =>
  put(store, id, d => (d.dampers[index] ? { ...d, dampers: d.dampers.filter((_, k) => k !== index) } : null), opts);

// 한 점에 연결은 하나다: 다시 연결하면 갈아 끼운다.
export const connectDuct = (store, id, point, itemId, opts) =>
  put(store, id, d => ({ ...d, connections: [...d.connections.filter(c => c.point !== point), { point, itemId }] }), opts);
export const disconnectDuct = (store, id, point, opts) =>
  put(store, id, d => ({ ...d, connections: d.connections.filter(c => c.point !== point) }), opts);
