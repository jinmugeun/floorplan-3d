import { activeFloor, uid, createFloor } from './schema.js';
import { detectRooms, centroid, pointInPolygon } from '../geom/rooms.js';
import { transformWalls, wallLength, wallDir } from '../geom/walls.js';
import { normalizeWalls } from '../geom/normalize.js';
import { dist, eq } from '../geom/vec.js';

const reroom = f => { f.walls = normalizeWalls(f.walls); f.rooms = detectRooms(f.walls, f.rooms); };

export function setWalls(store, walls, opts = {}) {
  return store.dispatch(d => { const f = activeFloor(d); f.walls = walls; reroom(f); }, opts);
}
export function addWalls(store, walls) {
  return store.dispatch(d => {
    const f = activeFloor(d);
    const same = (w, x) => (eq(x.a, w.a) && eq(x.b, w.b)) || (eq(x.a, w.b) && eq(x.b, w.a));
    for (const w of walls) if (!f.walls.some(x => same(w, x))) f.walls.push(w); // 겹치는 벽은 추가하지 않는다
    reroom(f);
  });
}
export function deleteWall(store, id) {
  return store.dispatch(d => { const f = activeFloor(d); f.walls = f.walls.filter(w => w.id !== id); reroom(f); });
}
export function deleteWalls(store, ids) {
  const kill = new Set(ids);
  return store.dispatch(d => { const f = activeFloor(d); f.walls = f.walls.filter(w => !kill.has(w.id)); reroom(f); });
}
export function deleteRoom(store, id) {
  return store.dispatch(d => {
    const f = activeFloor(d);
    const room = f.rooms.find(r => r.id === id); if (!room) return;
    const shared = new Set(f.rooms.filter(r => r.id !== id).flatMap(r => r.wallIds));
    f.walls = f.walls.filter(w => !room.wallIds.includes(w.id) || shared.has(w.id));
    reroom(f);
  });
}
// opts는 store.dispatch로 그대로 전달된다(트랜잭션 안에서 여러 벽을 한 번에 고칠 때 { record: false }가 필요하다).
export function updateWall(store, id, patch, opts) {
  return store.dispatch(d => { const f = activeFloor(d); const w = f.walls.find(x => x.id === id); if (w) Object.assign(w, patch); reroom(f); }, opts);
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
  });
}
export function setWallLength(store, id, mm) {
  return store.dispatch(d => {
    const f = activeFloor(d);
    const w = f.walls.find(x => x.id === id);
    if (!w || !(mm > 0)) return;
    const dir = wallDir(w); // b를 방향 그대로 옮긴다: a와 각도는 그대로 두고 길이만 바꾼다
    w.b = [w.a[0] + dir[0] * mm, w.a[1] + dir[1] * mm];
    reroom(f);
  });
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
  });
}
export function addMeasure(store, measure) {
  return store.dispatch(d => { activeFloor(d).measures.push({ id: measure.id ?? uid('m'), a: [...measure.a], b: [...measure.b] }); });
}
export function deleteMeasure(store, id) {
  return store.dispatch(d => { const f = activeFloor(d); f.measures = f.measures.filter(m => m.id !== id); });
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
export function duplicateRoom(store, roomId) {
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
    reroom(f);
    const c = centroid(r.points.map(p => [p[0] + dx, p[1]]));
    const copy = f.rooms.find(x => x.id !== roomId && pointInPolygon(c, x.points));
    if (copy) for (const k of ROOM_PROPS) if (src[k] !== undefined) copy[k] = src[k];
  });
}

// 기본 층 이름은 아직 쓰이지 않는 가장 작은 Floor N이다("Floor 2"가 이미 있으면 Floor 3).
function defaultFloorName(floors) {
  const used = new Set(floors.map(f => f.name));
  let n = 1;
  while (used.has(`Floor ${n}`)) n += 1;
  return `Floor ${n}`;
}
export function addFloor(store, { name = null, copy = 'none' } = {}) {
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
  });
}
export function setActiveFloor(store, index) {
  return store.dispatch(d => { if (Number.isInteger(index) && index >= 0 && index < d.floors.length) d.activeFloor = index; }, { record: false });
}
export function renameFloor(store, index, name) {
  return store.dispatch(d => { const f = d.floors[index]; if (f && String(name).trim()) f.name = String(name).trim(); });
}
export function updateFloor(store, index, patch) {
  return store.dispatch(d => { const f = d.floors[index]; if (f) Object.assign(f, patch); });
}
export function deleteFloor(store, index) {
  return store.dispatch(d => {
    if (d.floors.length <= 1 || !d.floors[index]) return; // 마지막 층은 남긴다
    d.floors.splice(index, 1);
    // 활성 층보다 앞의 층을 지우면 활성 층은 한 칸 앞으로 당겨진다. 활성 층 자체를 지우면 범위 안으로 잘라 준다.
    d.activeFloor = index < d.activeFloor ? d.activeFloor - 1 : Math.min(d.activeFloor, d.floors.length - 1);
  });
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
