import { wallNormal } from '../geom/walls.js';
import { centroid } from '../geom/rooms.js';
import { sub, dot, mul } from '../geom/vec.js';

// 벽이 방 하나에만(또는 어느 방에도) 속하면 외벽, 둘 이상에 속하면 내벽(공유 벽)이다.
export function wallOwners(floor, wall) { return floor.rooms.filter(r => r.wallIds.includes(wall.id)); }
export function isExteriorWall(floor, wall) { return wallOwners(floor, wall).length <= 1; }

export function hiddenWallIds(floor, camPos, elevationDeg, view) {
  const out = new Set();
  const v3 = view?.v3 ?? {};
  // 보기 옵션 "외벽 보기"/"내벽 보기"는 카메라와 무관하게 먼저 적용된다.
  if (v3.outerWalls === false || v3.innerWalls === false) {
    for (const w of floor.walls) {
      const ext = isExteriorWall(floor, w);
      if ((ext && v3.outerWalls === false) || (!ext && v3.innerWalls === false)) out.add(w.id);
    }
  }
  if (!view?.cutaway || elevationDeg >= 70 || camPos[2] <= 0) return out;
  for (const w of floor.walls) {
    const owners = wallOwners(floor, w);
    if (owners.length !== 1) continue;
    const mid = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
    let n = wallNormal(w);
    if (dot(n, sub(centroid(owners[0].points), mid)) > 0) n = mul(n, -1); // 바깥쪽
    const toCam = sub([camPos[0], camPos[1]], mid);
    if (dot(n, toCam) > 0) out.add(w.id);
  }
  return out;
}
