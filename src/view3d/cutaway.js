import { wallNormal } from '../geom/walls.js';
import { centroid } from '../geom/rooms.js';
import { sub, dot, mul } from '../geom/vec.js';

export function hiddenWallIds(floor, camPos, elevationDeg, view) {
  const out = new Set();
  if (!view?.cutaway || elevationDeg >= 70 || camPos[2] <= 0) return out;
  for (const w of floor.walls) {
    const owners = floor.rooms.filter(r => r.wallIds.includes(w.id));
    if (owners.length !== 1) continue;
    const mid = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
    let n = wallNormal(w);
    if (dot(n, sub(centroid(owners[0].points), mid)) > 0) n = mul(n, -1); // 바깥쪽
    const toCam = sub([camPos[0], camPos[1]], mid);
    if (dot(n, toCam) > 0) out.add(w.id);
  }
  return out;
}
