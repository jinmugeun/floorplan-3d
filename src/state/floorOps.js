import { activeFloor, uid, createFloor, normalizeItem } from './schema.js';
import { detectRooms, centroid, pointInPolygon } from '../geom/rooms.js';
import { transformWalls, wallLength, wallDir } from '../geom/walls.js';
import { normalizeWalls } from '../geom/normalize.js';
import { dist, eq, dot } from '../geom/vec.js';
import { wallAxis, placeOnWall, isEmbed } from '../geom/items.js';

// mirrorItems, setItemFlag, replaceProduct, pasteItems, sameProductIds는 300줄을 넘어 itemOps.js로 나눴다.
export * from './itemOps.js';
// groupItems, ungroupItems, alignSelection, relativeMove, arrayCopy는 300줄을 넘어 arrangeOps.js로 나눴다.
export * from './arrangeOps.js';

const reroom = f => { f.walls = normalizeWalls(f.walls); f.rooms = detectRooms(f.walls, f.rooms); };
// 벽이 움직이거나 사라졌을 때 그 벽에 붙은 아이템을 다시 앉힌다. reroom이 도는 곳마다 함께 돈다.
// 벽을 지우면 wallId만 비우고 아이템은 남긴다(사용자가 만든 물건을 소리 없이 없애지 않는다).
function reattach(f) {
  for (let i = 0; i < f.items.length; i++) {
    const it = f.items[i];
    if (it.attach !== 'wall' || !it.wallId) continue;
    const w = f.walls.find(x => x.id === it.wallId);
    if (!w) { f.items[i] = { ...it, wallId: null }; continue; }
    const r = placeOnWall(w, it.t, it.side, it.size, { embed: isEmbed(it) });
    f.items[i] = { ...it, pos: [Math.round(r.pos[0]), Math.round(r.pos[1])], rot: r.rot };
  }
}

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
export function deleteWall(store, id) {
  return store.dispatch(d => { const f = activeFloor(d); f.walls = f.walls.filter(w => w.id !== id); reroom(f); reattach(f); });
}
export function deleteWalls(store, ids, opts) {
  const kill = new Set(ids);
  return store.dispatch(d => { const f = activeFloor(d); f.walls = f.walls.filter(w => !kill.has(w.id)); reroom(f); reattach(f); }, opts);
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

const ROOM_PROPS = ['name', 'type', 'height', 'floorOffset', 'hideCeiling', 'seats', 'floorColor', 'ceilingColor', 'matchWallHeight'];
// 복사한 층은 벽 id가 달라 방 자카드 매칭이 되지 않으므로, 중심점이 같은 방에서 속성을 옮긴다.
function copyRoomProps(fromRooms, toRooms) {
  for (const r of toRooms) {
    const src = fromRooms.find(x => Array.isArray(x.points) && x.points.length && dist(centroid(x.points), centroid(r.points)) < 1);
    if (src) for (const k of ROOM_PROPS) if (src[k] !== undefined) r[k] = src[k];
  }
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
    const copies = f.walls.filter(w => r.wallIds.includes(w.id)).map(w => ({ ...w, id: uid('w'), a: [w.a[0] + dx, w.a[1]], b: [w.b[0] + dx, w.b[1]] }));
    const src = { ...r };
    f.walls = [...f.walls, ...copies];
    reroom(f); reattach(f);
    const c = centroid(r.points.map(p => [p[0] + dx, p[1]]));
    const copy = f.rooms.find(x => x.id !== roomId && pointInPolygon(c, x.points));
    if (copy) for (const k of ROOM_PROPS) if (src[k] !== undefined) copy[k] = src[k];
  }, opts);
}

// 기본 층 이름은 아직 쓰이지 않는 가장 작은 Floor N이다("Floor 2"가 이미 있으면 Floor 3).
function defaultFloorName(floors) {
  const used = new Set(floors.map(f => f.name));
  let n = 1;
  while (used.has(`Floor ${n}`)) n += 1;
  return `Floor ${n}`;
}
export function addFloor(store, { name = null, copy = 'none' } = {}, opts) {
  return store.dispatch(d => {
    const base = activeFloor(d);
    const f = createFloor(name && name.trim() ? name.trim() : defaultFloorName(d.floors));
    f.height = base?.height ?? f.height;
    f.slab = base?.slab ?? 0;
    if (copy !== 'none' && base) {
      f.walls = base.walls.map(w => ({ ...w, id: uid('w'), a: [...w.a], b: [...w.b] }));
      f.guides = base.guides.map(g => ({ ...g, id: uid('g') }));
    }
    if (copy === 'all' && base) {
      f.items = structuredClone(base.items);
      f.ducts = structuredClone(base.ducts);
      f.measures = structuredClone(base.measures);
    }
    f.walls = normalizeWalls(f.walls);
    f.rooms = detectRooms(f.walls);
    if (copy !== 'none' && base) copyRoomProps(base.rooms, f.rooms);
    d.floors.push(f);
    d.activeFloor = d.floors.length - 1;
  }, opts);
}
export function setActiveFloor(store, index) {
  return store.dispatch(d => { if (Number.isInteger(index) && index >= 0 && index < d.floors.length) d.activeFloor = index; }, { record: false });
}
export function renameFloor(store, index, name, opts) {
  return store.dispatch(d => { const f = d.floors[index]; if (f && String(name).trim()) f.name = String(name).trim(); }, opts);
}
export function updateFloor(store, index, patch, opts) {
  return store.dispatch(d => { const f = d.floors[index]; if (f) Object.assign(f, patch); }, opts);
}
export function deleteFloor(store, index, opts) {
  return store.dispatch(d => {
    if (d.floors.length <= 1 || !d.floors[index]) return; // 마지막 층은 남긴다
    d.floors.splice(index, 1);
    // 활성 층보다 앞의 층을 지우면 활성 층은 한 칸 앞으로 당겨진다. 활성 층 자체를 지우면 범위 안으로 잘라 준다.
    d.activeFloor = index < d.activeFloor ? d.activeFloor - 1 : Math.min(d.activeFloor, d.floors.length - 1);
  }, opts);
}
// 실면적(net) = 방 폴리곤 면적 합. 실면적+내외벽(gross) = 거기에 벽 바닥면적을 더한 값. 단위 m².
export function totalArea(floor, areaMode = 'net') {
  const net = (floor.rooms ?? []).reduce((s, r) => s + (Number(r.area) || 0), 0);
  if (areaMode !== 'gross') return net;
  const walls = (floor.walls ?? []).reduce((s, w) => s + wallLength(w) * w.thickness, 0) / 1e6;
  return net + walls;
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
  return selectionStillValid(state, selection) ? selection : null;
}

export const itemsOf = (state, ids) => { const set = new Set(ids); return activeFloor(state).items.filter(i => set.has(i.id)); };
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
  const patches = itemsOf(state, ids).filter(it => !it.locked).map(it => {
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
  }, opts);
}
// 제자리 회전. 벽 부착 아이템은 벽 방향에 고정이라 돌리지 않고(명세 8.5), 잠긴 아이템도 건드리지 않는다.
export function rotateItems(store, ids, deltaDeg, opts = {}) {
  const patches = itemsOf(store.get(), ids)
    .filter(it => !it.locked && !(it.attach === 'wall' && it.wallId))
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
export function duplicateItems(store, ids, { delta = [0, 0] } = {}, opts) {
  const copies = itemsOf(store.get(), ids).map(i => normalizeItem({ ...i, id: uid('i'), pos: [i.pos[0] + delta[0], i.pos[1] + delta[1]] }));
  store.dispatch(d => { activeFloor(d).items.push(...copies.map(c => structuredClone(c))); }, opts);
  return copies.map(c => c.id);
}
