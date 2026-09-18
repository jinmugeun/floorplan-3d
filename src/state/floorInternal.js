// floorOps.js와 floorMgmt.js가 함께 쓰는 내부 조각. 두 모듈이 서로를 import하지 않도록 여기에 둔다
// (floorOps.js → floorMgmt.js 한 방향만 남는다).
import { uid, normalizeItem } from './schema.js';
import { normalizeWalls } from '../geom/normalize.js';
import { detectRooms, centroid } from '../geom/rooms.js';
import { dist } from '../geom/vec.js';
import { placeOnWall, isEmbed, nearestWallPlacement, WALL_ATTACH_DIST } from '../geom/items.js';
import { wallLength } from '../geom/walls.js';

export const reroom = f => { f.walls = normalizeWalls(f.walls); f.rooms = detectRooms(f.walls, f.rooms); };

// 벽이 움직이거나 사라졌을 때 그 벽에 붙은 아이템을 다시 앉힌다. reroom이 도는 곳마다 함께 돈다.
// 벽을 지우면 wallId만 비우고 아이템은 남긴다(사용자가 만든 물건을 소리 없이 없애지 않는다).
// 아이템을 새로 만드는 경로(사본·층 복사)도 끝에서 이것을 부른다: "pos는 (wallId, t)의 결과"가 불변식이다.
export function reattach(f) {
  for (let i = 0; i < f.items.length; i++) {
    const it = f.items[i];
    if (it.attach !== 'wall' || !it.wallId) continue;
    const w = f.walls.find(x => x.id === it.wallId);
    if (!w) { f.items[i] = { ...it, wallId: null }; continue; }
    const r = placeOnWall(w, it.t, it.side, it.size, { embed: isEmbed(it) });
    f.items[i] = { ...it, pos: [Math.round(r.pos[0]), Math.round(r.pos[1])], rot: r.rot };
  }
}

// 아이템 사본을 만드는 모든 경로(복제·붙여넣기·배열 복사·층 전체 복사)가 지나는 한 곳.
// 사본에서도 "pos는 (wallId, t)의 결과"를 지킨다:
//   - idMap을 주면(층 복사) 같은 기하의 새 벽 id로 옮기고 t를 그대로 쓴다(pos는 reattach가 다시 만든다).
//   - walls를 주면(같은 층에서 delta로 옮긴 사본) 새 pos 근처 벽에 다시 앉힌다.
//   - 둘 다 실패하면 wallId/t를 비운다(2D에 보이는 자리와 3D 개구부가 어긋나지 않게).
// 호출자는 돌려받은 사본을 dispatch로 밀어 넣고 같은 dispatch에서 reattach(f)를 부른다.

// 같은 벽에 이미 앉은 아이템(taken: [{ t, w }])과 겹치지 않는 t를 찾는다. 원래 자리가 비어 있으면 그대로,
// 아니면 제품 너비만큼 앞뒤로 옮겨 보고(벽 안에서), 자리가 없으면 null(호출자가 부착을 놓는다).
// 벽에 수직인 delta나 회전 복사는 nearestWallPlacement가 원본과 같은 t를 돌려주므로 이것이 없으면 사본이 원본 위에 겹친다.
export function freeT(wall, t, w, taken = []) {
  const len = wallLength(wall) || 1;
  const ok = tt => tt * len >= w / 2 - 0.5 && tt * len <= len - w / 2 + 0.5 && !taken.some(o => Math.abs(o.t - tt) * len < (o.w + w) / 2 - 0.5);
  if (ok(t)) return t;
  for (let k = 1; k <= 50; k++) {
    const a = t + (k * w) / len; if (ok(a)) return a;
    const b = t - (k * w) / len; if (ok(b)) return b;
  }
  return null;
}
export function seatCopy(draft, { walls = null, idMap = null, items = [] } = {}) {
  const it = normalizeItem({ ...draft, id: uid('i') });
  if (it.attach !== 'wall' || !it.wallId) return it;
  if (idMap) { const id = idMap.get(it.wallId) ?? null; return normalizeItem({ ...it, wallId: id, t: id ? it.t : 0 }); }
  const hit = walls?.length ? nearestWallPlacement(walls, it.pos, it.size, WALL_ATTACH_DIST, { embed: isEmbed(it) }) : null;
  if (!hit) return normalizeItem({ ...it, wallId: null, t: 0 });
  const wall = walls.find(w => w.id === hit.wallId);
  const taken = items.filter(o => o.attach === 'wall' && o.wallId === hit.wallId && o.id !== it.id).map(o => ({ t: o.t, w: o.size[0] }));
  const t = freeT(wall, hit.t, it.size[0], taken);
  if (t === null) return normalizeItem({ ...it, wallId: null, t: 0 });
  const r = placeOnWall(wall, t, hit.side, it.size, { embed: isEmbed(it) });
  return normalizeItem({ ...it, wallId: hit.wallId, t, side: hit.side, pos: [Math.round(r.pos[0]), Math.round(r.pos[1])], rot: r.rot });
}
// 사본끼리도 겹치지 않게, 앞서 앉힌 사본을 다음 사본의 "이미 앉은 아이템"에 더해 간다.
export function seatCopies(drafts, ctx = {}) {
  const acc = [...(ctx.items ?? [])];
  return drafts.map(d => { const c = seatCopy(d, { ...ctx, items: acc }); acc.push(c); return c; });
}

// 잠긴 아이템은 이동·정렬·상대이동·반전으로 움직이지 않는다(계획 I16). 패치를 만드는 자리마다
// 흩어지지 않게 한 곳에서 걸러 낸다. updateItems 자체에는 넣지 않는다(setItemFlag의 잠금 해제가 막힌다).
export const movable = items => (items ?? []).filter(i => !i.locked);

export const ROOM_PROPS = ['name', 'type', 'height', 'floorOffset', 'hideCeiling', 'seats', 'floorColor', 'ceilingColor', 'matchWallHeight', 'floorMat', 'ceilingMat'];
// 복사한 층은 벽 id가 달라 방 자카드 매칭이 되지 않으므로, 중심점이 같은 방에서 속성을 옮긴다.
export function copyRoomProps(fromRooms, toRooms) {
  for (const r of toRooms) {
    const src = fromRooms.find(x => Array.isArray(x.points) && x.points.length && dist(centroid(x.points), centroid(r.points)) < 1);
    if (src) for (const k of ROOM_PROPS) if (src[k] !== undefined) r[k] = src[k];
  }
}
