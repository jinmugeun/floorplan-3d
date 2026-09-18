// 층 관리(추가·전환·이름·속성·삭제·면적). floorOps.js가 300줄 규칙을 넘어 여기로 나누고
// floorOps.js에서 다시 내보낸다(호출자는 계속 floorOps.js만 import한다).
// 공유 조각(reattach·seatCopies·copyRoomProps)은 floorInternal.js에서 가져온다: floorOps.js를 import하지
// 않으므로 순환 import가 없다.
import { createFloor, uid, activeFloor } from './schema.js';
import { normalizeWalls } from '../geom/normalize.js';
import { detectRooms } from '../geom/rooms.js';
import { wallLength } from '../geom/walls.js';
import { reattach, seatCopies, copyRoomProps } from './floorInternal.js';

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
    // 벽은 새 id를 받는다. 벽 부착 아이템이 옛 층의 벽을 가리키지 않도록 id 맵을 만들어 함께 옮긴다.
    const idMap = new Map();
    if (copy !== 'none' && base) {
      f.walls = base.walls.map(w => { const id = uid('w'); idMap.set(w.id, id); return { ...w, id, a: [...w.a], b: [...w.b] }; });
      f.guides = base.guides.map(g => ({ ...g, id: uid('g') }));
    }
    if (copy === 'all' && base) {
      f.items = seatCopies(base.items, { idMap });
      f.ducts = structuredClone(base.ducts);
      f.measures = structuredClone(base.measures);
    }
    f.walls = normalizeWalls(f.walls);
    f.rooms = detectRooms(f.walls);
    reattach(f); // 새 벽 id로 옮긴 아이템의 pos·rot을 (wallId, t)에서 다시 만든다(3D 개구부가 생기게)
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
