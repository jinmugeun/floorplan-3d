import { activeFloor, uid, createFloor } from './schema.js';
import { detectRooms, centroid } from '../geom/rooms.js';
import { transformWalls, wallLength } from '../geom/walls.js';
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
export function deleteRoom(store, id) {
  return store.dispatch(d => {
    const f = activeFloor(d);
    const room = f.rooms.find(r => r.id === id); if (!room) return;
    const shared = new Set(f.rooms.filter(r => r.id !== id).flatMap(r => r.wallIds));
    f.walls = f.walls.filter(w => !room.wallIds.includes(w.id) || shared.has(w.id));
    reroom(f);
  });
}
export function updateWall(store, id, patch) {
  return store.dispatch(d => { const f = activeFloor(d); const w = f.walls.find(x => x.id === id); if (w) Object.assign(w, patch); reroom(f); });
}
export function updateRoom(store, id, patch) {
  return store.dispatch(d => { const f = activeFloor(d); const r = f.rooms.find(x => x.id === id); if (r) Object.assign(r, patch); });
}
export function setRoomWallThickness(store, roomId, thickness) {
  return store.dispatch(d => {
    const f = activeFloor(d); const r = f.rooms.find(x => x.id === roomId); if (!r) return;
    for (const w of f.walls) if (r.wallIds.includes(w.id)) w.thickness = thickness;
    reroom(f);
  });
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

export function addFloor(store, { name = null, copy = 'none' } = {}) {
  return store.dispatch(d => {
    const base = activeFloor(d);
    const f = createFloor(name && name.trim() ? name.trim() : `Floor ${d.floors.length + 1}`);
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
    d.activeFloor = Math.min(d.activeFloor, d.floors.length - 1);
  });
}
// 실면적(net) = 방 폴리곤 면적 합. 실면적+내외벽(gross) = 거기에 벽 바닥면적을 더한 값. 단위 m².
export function totalArea(floor, areaMode = 'net') {
  const net = (floor.rooms ?? []).reduce((s, r) => s + (Number(r.area) || 0), 0);
  if (areaMode !== 'gross') return net;
  const walls = (floor.walls ?? []).reduce((s, w) => s + wallLength(w) * w.thickness, 0) / 1e6;
  return net + walls;
}

// ui.selection이 가리키는 객체가 아직 활성 층에 있는지(undo/redo/방 재검출로 사라졌을 수 있다).
export function selectionStillValid(state, selection) {
  if (!selection) return true;
  const f = activeFloor(state);
  if (!f) return true; // 활성 층을 찾지 못해도 구독이 절대 예외를 던지면 안 된다
  if (selection.type === 'wall') return f.walls.some(w => w.id === selection.id);
  if (selection.type === 'room') return f.rooms.some(r => r.id === selection.id);
  return true;
}
