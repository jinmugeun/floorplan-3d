import { activeFloor } from './schema.js';
import { detectRooms } from '../geom/rooms.js';
import { transformWalls } from '../geom/walls.js';

const reroom = f => { f.rooms = detectRooms(f.walls, f.rooms); };

export function setWalls(store, walls, opts = {}) {
  return store.dispatch(d => { const f = activeFloor(d); f.walls = walls; reroom(f); }, opts);
}
export function addWalls(store, walls) {
  return store.dispatch(d => { const f = activeFloor(d); f.walls.push(...walls); reroom(f); });
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
  return store.dispatch(d => { const f = activeFloor(d); f.walls = transformWalls(f.walls, fn); reroom(f); });
}
