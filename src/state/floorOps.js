import { activeFloor, uid, normalizeItem } from './schema.js';
import { pointInPolygon, centroid } from '../geom/rooms.js';
import { transformWalls, wallDir } from '../geom/walls.js';
import { eq, dot } from '../geom/vec.js';
import { wallAxis, placeOnWall, isEmbed } from '../geom/items.js';
import { reroom, reattach, seatCopies, movable, ROOM_PROPS, cloneProp, pruneDuctConnections } from './floorInternal.js';

// mirrorItems, setItemFlag, replaceProduct, pasteItems, sameProductIds는 300줄을 넘어 itemOps.js로 나눴다.
export * from './itemOps.js';
// groupItems, ungroupItems, alignSelection, relativeMove, arrayCopy는 300줄을 넘어 arrangeOps.js로 나눴다.
export * from './arrangeOps.js';
// addFloor, setActiveFloor, renameFloor, updateFloor, deleteFloor, totalArea는 300줄을 넘어 floorMgmt.js로 나눴다.
export * from './floorMgmt.js';
// 덕트 액션(addDuct·updateSegment·connectDuct·deleteDuctSelection …)은 ductOps.js에 있고, 위의
// itemOps·arrangeOps·floorMgmt와 똑같이 여기서 다시 내보낸다(호출자는 floorOps.js만 import해도 된다.
// ductOps.js를 바로 import하는 기존 호출자도 그대로 둔다 — 같은 함수다).
// 이름이 겹치는 export는 없다: deleteDuctSelection(store, sel)이라는 이름은 이 상태 op만 쓰고,
// 선택·토스트를 처리하는 view2d 쪽 래퍼는 deleteSelectedDuct다(ductSelect.js).
// 좌표는 moveDuctPoint·translateDuct로만 고친다(updateDuct에 points를 넘기지 않는다).
export * from './ductOps.js';

export function setWalls(store, walls, opts = {}) {
  return store.dispatch(d => { const f = activeFloor(d); f.walls = walls; reroom(f); reattach(f); }, opts);
}
export function addWalls(store, walls) {
  return store.dispatch(d => {
    const f = activeFloor(d);
    const same = (w, x) => (eq(x.a, w.a) && eq(x.b, w.b)) || (eq(x.a, w.b) && eq(x.b, w.a));
    for (const w of walls) if (!f.walls.some(x => same(w, x))) f.walls.push(w); // 겹치는 벽은 추가하지 않는다
    reroom(f); reattach(f);
  });
}
// 그 벽에 붙은 아이템(문·창·개구부·벽 제품)의 id. 벽을 지우면 이들도 함께 사라진다(§15.6):
// 예전에는 wallId만 비워 허공에 남았고, 방 하나가 조용히 사라지는 것과 겹쳐 무엇이 없어졌는지
// 알 수 없었다(감사 §28). 확인 대화상자는 두지 않는다 — undo 한 번으로 전부 돌아온다.
const wallItemIds = (f, kill) => (f.items ?? []).filter(i => i.attach === 'wall' && i.wallId && kill.has(i.wallId)).map(i => i.id);

export function deleteWall(store, id, opts) { return deleteWalls(store, [id], opts); }
export function deleteWalls(store, ids, opts) {
  const kill = new Set(ids);
  const before = activeFloor(store.get());
  const walls = before.walls.filter(w => kill.has(w.id)).length;
  if (!walls) return { walls: 0, items: 0, rooms: 0 };      // 지울 벽이 없으면 빈 단계도 만들지 않는다
  const items = wallItemIds(before, kill).length;
  const rooms0 = before.rooms.length;
  store.dispatch(d => {
    const f = activeFloor(d);
    const gone = new Set(wallItemIds(f, kill));
    f.walls = f.walls.filter(w => !kill.has(w.id));
    f.items = f.items.filter(i => !gone.has(i.id));
    f.groups = (f.groups ?? []).map(g => ({ ...g, itemIds: g.itemIds.filter(x => !gone.has(x)) })).filter(g => g.itemIds.length > 1);
    pruneDuctConnections(f);   // 사라진 벽 제품을 가리키는 덕트 연결도 함께 사라진다(deleteItems와 같다)
    reroom(f); reattach(f);
  }, opts);
  return { walls, items, rooms: rooms0 - activeFloor(store.get()).rooms.length };
}
export function deleteRoom(store, id) {
  return store.dispatch(d => {
    const f = activeFloor(d);
    const room = f.rooms.find(r => r.id === id); if (!room) return;
    const shared = new Set(f.rooms.filter(r => r.id !== id).flatMap(r => r.wallIds));
    f.walls = f.walls.filter(w => !room.wallIds.includes(w.id) || shared.has(w.id));
    reroom(f);
    reattach(f);
  });
}
// opts는 store.dispatch로 그대로 전달된다(트랜잭션 안에서 여러 벽을 한 번에 고칠 때 { record: false }가 필요하다).
export function updateWall(store, id, patch, opts) {
  return store.dispatch(d => { const f = activeFloor(d); const w = f.walls.find(x => x.id === id); if (w) Object.assign(w, patch); reroom(f); reattach(f); }, opts);
}
// opts는 store.dispatch로 그대로 전달된다: 여러 dispatch를 store.beginTransaction()/endTransaction()로
// 한 단계로 묶을 때, 안의 dispatch들은 { record: false }를 넘겨야 첫 dispatch가 트랜잭션을 조기에 닫지 않는다.
export function updateRoom(store, id, patch, opts) {
  return store.dispatch(d => { const f = activeFloor(d); const r = f.rooms.find(x => x.id === id); if (r) Object.assign(r, patch); }, opts);
}
export function setRoomWallThickness(store, roomId, thickness) {
  return store.dispatch(d => {
    const f = activeFloor(d); const r = f.rooms.find(x => x.id === roomId); if (!r) return;
    for (const w of f.walls) if (r.wallIds.includes(w.id)) w.thickness = thickness;
    reroom(f);
    reattach(f);
  });
}
export function setWallLength(store, id, mm, opts) {
  return store.dispatch(d => {
    const f = activeFloor(d);
    const w = f.walls.find(x => x.id === id);
    if (!w || !(mm > 0)) return;
    const dir = wallDir(w); // b를 방향 그대로 옮긴다: a와 각도는 그대로 두고 길이만 바꾼다
    w.b = [w.a[0] + dir[0] * mm, w.a[1] + dir[1] * mm];
    reroom(f); reattach(f);
  }, opts);
}
// 높이는 기하(방 폴리곤·면적)를 바꾸지 않으므로 reroom을 부르지 않는다.
// opts는 updateRoom과 마찬가지로 store.dispatch에 전달된다(트랜잭션 안에서는 { record: false }).
export function setRoomWallHeight(store, roomId, height, opts) {
  return store.dispatch(d => {
    const f = activeFloor(d);
    const r = f.rooms.find(x => x.id === roomId);
    if (!r) return;
    for (const w of f.walls) if (r.wallIds.includes(w.id)) w.height = height;
  }, opts);
}
// 기하에 영향이 없는 벽 필드(height, colorIn, colorOut …)를 고칠 때 쓴다. reroom을 부르지 않는다.
// 끝점 이동과 두께 변경만 updateWall(= reroom 포함)을 쓴다.
export function updateWallProps(store, id, patch, opts) {
  return store.dispatch(d => { const w = activeFloor(d).walls.find(x => x.id === id); if (w) Object.assign(w, patch); }, opts);
}
export function transformFloor(store, fn) {
  return store.dispatch(d => {
    const f = activeFloor(d);
    f.walls = transformWalls(f.walls, fn);
    f.rooms = f.rooms.map(r => ({ ...r, points: r.points.map(fn) })); // 중심점 대체 매칭도 계속 맞도록 방 좌표도 같이 옮긴다
    reroom(f);
    reattach(f);
  });
}
export function addMeasure(store, measure, opts) {
  return store.dispatch(d => { activeFloor(d).measures.push({ id: measure.id ?? uid('m'), a: [...measure.a], b: [...measure.b] }); }, opts);
}
export function deleteMeasure(store, id, opts) {
  return store.dispatch(d => { const f = activeFloor(d); f.measures = f.measures.filter(m => m.id !== id); }, opts);
}

// 방 복사: 그 방의 벽을 방 너비만큼 동쪽(+x)으로 복사한다. 정규화 후 새로 생긴 방에 속성을 옮긴다.
export function duplicateRoom(store, roomId, opts) {
  return store.dispatch(d => {
    const f = activeFloor(d);
    const r = f.rooms.find(x => x.id === roomId);
    if (!r) return;
    const xs = r.points.map(p => p[0]);
    const dx = Math.max(...xs) - Math.min(...xs);
    if (!(dx > 0)) return;
    // regions/matIn/matOut는 객체라 그대로 옮기면 사본과 원본 벽이 같은 참조를 공유한다(I1).
    const copies = f.walls.filter(w => r.wallIds.includes(w.id)).map(w => ({
      ...w, id: uid('w'), a: [w.a[0] + dx, w.a[1]], b: [w.b[0] + dx, w.b[1]],
      matIn: cloneProp(w.matIn), matOut: cloneProp(w.matOut), regions: cloneProp(w.regions),
    }));
    const src = { ...r };
    f.walls = [...f.walls, ...copies];
    reroom(f); reattach(f);
    const c = centroid(r.points.map(p => [p[0] + dx, p[1]]));
    const copy = f.rooms.find(x => x.id !== roomId && pointInPolygon(c, x.points));
    if (copy) for (const k of ROOM_PROPS) if (src[k] !== undefined) copy[k] = cloneProp(src[k]);
  }, opts);
}

// ui.soloRoom이 가리키는 방이 아직 활성 층에 있는지. 없으면 null(단일 공간 모드를 끈다).
export function pruneSolo(state, soloRoom) {
  if (!soloRoom) return null;
  const f = activeFloor(state);
  if (!f) return soloRoom; // 활성 층을 못 찾아도 예외를 던지지 않는다
  return f.rooms.some(r => r.id === soloRoom) ? soloRoom : null;
}

// ui.selection이 가리키는 객체가 아직 활성 층에 있는지(undo/redo/방 재검출로 사라졌을 수 있다).
export function selectionStillValid(state, selection) {
  if (!selection) return true;
  const f = activeFloor(state);
  if (!f) return true; // 활성 층을 찾지 못해도 구독이 절대 예외를 던지면 안 된다
  if (selection.type === 'wall') return f.walls.some(w => w.id === selection.id);
  if (selection.type === 'room') return f.rooms.some(r => r.id === selection.id);
  if (selection.type === 'item') return (f.items ?? []).some(i => i.id === selection.id); // 2B의 배치 아이템
  if (selection.type === 'duct') return (f.ducts ?? []).some(d => d.id === selection.id);
  if (selection.type === 'multi') {
    const pool = selection.kind === 'wall' ? f.walls : f.items;
    return selection.ids.some(id => pool.some(x => x.id === id));
  }
  return true;
}
// ui.selection이 가리키는 객체가 아직 활성 층에 있는지. multi는 살아 있는 id만 남긴다(0개면 null).
export function pruneSelection(state, selection) {
  if (!selection) return null;
  const f = activeFloor(state);
  if (!f) return selection; // 활성 층을 못 찾아도 예외를 던지지 않는다
  if (selection.type === 'multi') {
    const pool = selection.kind === 'wall' ? f.walls : f.items;
    const ids = selection.ids.filter(id => pool.some(x => x.id === id));
    if (ids.length === selection.ids.length) return selection; // 그대로면 같은 객체
    return ids.length ? { ...selection, ids } : null;
  }
  // 점을 지우면 고른 꼭짓점·구간 번호가 범위를 벗어난다: 덕트는 남기고 번호만 비운다.
  if (selection.type === 'duct') {
    const d = (f.ducts ?? []).find(x => x.id === selection.id);
    if (!d) return null;
    const vertex = Number.isInteger(selection.vertex) && selection.vertex < d.points.length ? selection.vertex : null;
    const segment = Number.isInteger(selection.segment) && selection.segment < d.segments.length ? selection.segment : null;
    return vertex === (selection.vertex ?? null) && segment === (selection.segment ?? null)
      ? selection : { type: 'duct', id: selection.id, segment, vertex };
  }
  return selectionStillValid(state, selection) ? selection : null;
}

export const itemsOf = (state, ids) => { const set = new Set(ids); return activeFloor(state).items.filter(i => set.has(i.id)); };
// 움직일 수 있는 선택(잠금 필터 한 곳). 이동 드래그·정렬·상대이동·반전·방향키·회전이 모두 이것만 쓴다.
export const movableItems = (state, ids) => movable(itemsOf(state, ids));
// 그룹에 속한 아이템을 하나 고르면 그룹 전체가 선택된다.
export function expandGroups(floor, ids) {
  const out = new Set(ids);
  for (const g of floor.groups ?? []) if (g.itemIds.some(id => out.has(id))) for (const id of g.itemIds) out.add(id);
  return [...out].filter(id => floor.items.some(i => i.id === id));
}
// 호출자가 들고 있는 객체를 그대로 상태에 넣지 않는다(밖에서 고치면 스냅샷이 몰래 바뀐다).
export function addItem(store, item, opts = {}) {
  const it = normalizeItem(item);
  store.dispatch(d => { activeFloor(d).items.push(structuredClone(it)); }, opts);
  return it.id;
}
// 방향키 이동. 벽 부착 아이템은 벽을 따라 t로 미끄러지고, 나머지는 pos를 그대로 옮긴다.
// 잠긴 아이템은 움직이지 않는다(방향키·기즈모·핸들 모두 같은 규칙).
export function nudgeItems(store, ids, delta, opts = {}) {
  const state = store.get(), f = activeFloor(state);
  const patches = movableItems(state, ids).map(it => {
    const w = it.attach === 'wall' && it.wallId ? f.walls.find(x => x.id === it.wallId) : null;
    if (w) {
      const { dir, len } = wallAxis(w);
      const t = Math.max(0, Math.min(1, it.t + dot(delta, dir) / (len || 1)));
      const { pos, rot } = placeOnWall(w, t, it.side, it.size, { embed: isEmbed(it) });
      return { id: it.id, patch: { t, pos: [Math.round(pos[0]), Math.round(pos[1])], rot } };
    }
    return { id: it.id, patch: { pos: [it.pos[0] + delta[0], it.pos[1] + delta[1]] } };
  });
  const changed = patches.filter(p => { const it = f.items.find(x => x.id === p.id); return !it || Object.keys(p.patch).some(k => JSON.stringify(p.patch[k]) !== JSON.stringify(it[k])); }); // 벽에 수직인 방향키처럼 아무것도 안 바뀌면 되돌림 단계를 만들지 않는다
  return changed.length ? updateItems(store, changed, opts) : store.get();
}
export function updateItem(store, id, patch, opts = {}) { return updateItems(store, [{ id, patch }], opts); }
export function updateItems(store, patches, opts = {}) {
  return store.dispatch(d => {
    const f = activeFloor(d);
    for (const { id, patch } of patches) {
      const i = f.items.findIndex(x => x.id === id);
      if (i >= 0) f.items[i] = normalizeItem({ ...f.items[i], ...patch });
    }
  }, opts);
}
export function deleteItems(store, ids, opts = {}) {
  const set = new Set(ids);
  return store.dispatch(d => {
    const f = activeFloor(d);
    f.items = f.items.filter(i => !set.has(i.id));
    f.groups = (f.groups ?? []).map(g => ({ ...g, itemIds: g.itemIds.filter(x => !set.has(x)) })).filter(g => g.itemIds.length > 1);
    pruneDuctConnections(f);   // 지운 설비를 가리키는 덕트 연결도 함께 사라진다
  }, opts);
}
// 제자리 회전. 벽 부착 아이템은 벽 방향에 고정이라 돌리지 않고(명세 8.5), 잠긴 아이템도 건드리지 않는다.
export function rotateItems(store, ids, deltaDeg, opts = {}) {
  const patches = movableItems(store.get(), ids)
    .filter(it => !(it.attach === 'wall' && it.wallId))
    .map(it => ({ id: it.id, patch: { rot: it.rot + deltaDeg } }));
  return patches.length ? updateItems(store, patches, opts) : store.get();
}
// 크기 변경. 벽 부착이면 벽에 다시 맞춘다(두께가 바뀌면 벽면에서 떨어지기 때문). 잠긴 아이템은 그대로 둔다.
export function resizeItem(store, id, size, opts = {}) {
  const f = activeFloor(store.get());
  const it = f.items.find(x => x.id === id);
  if (!it || it.locked) return store.get();
  const patch = { size };
  const w = it.attach === 'wall' && it.wallId ? f.walls.find(x => x.id === it.wallId) : null;
  if (w) {
    const r = placeOnWall(w, it.t, it.side, size, { embed: isEmbed(it) });
    patch.pos = [Math.round(r.pos[0]), Math.round(r.pos[1])];
    patch.rot = r.rot;
  }
  return updateItem(store, id, patch, opts);
}
// 새 id를 먼저 만들어 돌려준다(dispatch는 상태를 복제하므로 안에서 만든 id를 밖에서 알 수 없다).
// 사본은 seatCopies를 지난다: 벽 부착 제품은 옮겨진 자리의 벽에 다시 앉거나 wallId를 비운다(I-2).
export function duplicateItems(store, ids, { delta = [0, 0] } = {}, opts) {
  const f = activeFloor(store.get());
  const copies = seatCopies(itemsOf(store.get(), ids).map(i => ({ ...structuredClone(i), pos: [i.pos[0] + delta[0], i.pos[1] + delta[1]] })), { walls: f.walls, items: f.items });
  store.dispatch(d => { const g = activeFloor(d); g.items.push(...copies.map(c => structuredClone(c))); reattach(g); }, opts);
  return copies.map(c => c.id);
}
