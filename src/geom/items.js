import { add, sub, mul, dot, norm, perp, dist } from './vec.js';

export const RAD = d => ((Number(d) || 0) * Math.PI) / 180;
export const DEG = r => (r * 180) / Math.PI;
export const normDeg = v => { const n = Number(v); return Number.isFinite(n) ? ((n % 360) + 360) % 360 : 0; };

export const ITEM_SNAP_TOL = 150;    // 아이템 정렬·벽면 스냅 거리(mm)
export const WALL_ATTACH_DIST = 300; // 벽 부착 제품이 벽을 찾는 거리(mm)

// 회전 규약: R(θ) = [[cos, -sin], [sin, cos]]. y가 남쪽(화면 아래)이므로 rot이 커지면 화면에서 시계 방향으로 돈다.
// 아이템 로컬 축: +x = 너비(size[0]), +y = 깊이(size[1]). 원점은 아이템 중심.
export function itemCorners(item) {
  const [w, d] = item.size, c = Math.cos(RAD(item.rot)), s = Math.sin(RAD(item.rot));
  const hw = w / 2, hd = d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
    .map(([x, y]) => [item.pos[0] + x * c - y * s, item.pos[1] + x * s + y * c]);
}
export function itemAABB(item) {
  const pts = itemCorners(item), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] };
}
// 월드 점을 아이템 로컬 좌표로(회전의 역변환).
export function toLocal(p, item) {
  const c = Math.cos(RAD(item.rot)), s = Math.sin(RAD(item.rot)), q = sub(p, item.pos);
  return [q[0] * c + q[1] * s, -q[0] * s + q[1] * c];
}
// 회전한 사각형 안인지. tol = 0이면 pointInPolygon(p, itemCorners(item))과 같은 판정이고,
// 히트 테스트에서 몇 px 여유를 주려고 tol(mm)을 더할 수 있다.
export function pointInItem(p, item, tol = 0) {
  const [x, y] = toLocal(p, item);
  return Math.abs(x) <= item.size[0] / 2 + tol && Math.abs(y) <= item.size[1] / 2 + tol;
}

export function wallAxis(wall) {
  const dir = norm(sub(wall.b, wall.a));
  return { dir, n: perp(dir), len: dist(wall.a, wall.b), rot: normDeg(DEG(Math.atan2(dir[1], dir[0]))) };
}
// t(0~1)와 side(±1)로 벽 부착 아이템의 중심과 각도를 만든다.
// embed = true(문·창·개구부)는 벽 두께 안에 놓이고, false는 뒷면을 벽면에 딱 붙인다.
export function placeOnWall(wall, t, side, size, { embed = false } = {}) {
  const { dir, n, len, rot } = wallAxis(wall);
  const s = side >= 0 ? 1 : -1;
  const base = add(wall.a, mul(dir, Math.max(0, Math.min(1, t)) * len));
  const off = embed ? 0 : (wall.thickness / 2 + size[1] / 2) * s;
  // 아이템 로컬 -y가 뒷면, 로컬 +y는 +n. side = -1이면 180° 돌려 뒷면이 벽을 보게 한다.
  return { pos: add(base, mul(n, off)), rot: s > 0 ? rot : normDeg(rot + 180) };
}
// 점 p에서 가장 가까운 벽의 부착 자리. 벽면까지 maxDist(mm) 밖이면 null.
// 아이템이 벽 밖으로 튀어나가지 않게 벽을 따라 미끄러진다(t 클램프).
export function nearestWallPlacement(walls, p, size, maxDist = WALL_ATTACH_DIST, opts = {}) {
  let best = null;
  for (const w of walls) {
    const { dir, n, len } = wallAxis(w);
    if (len <= 0) continue;
    const alongRaw = dot(sub(p, w.a), dir);
    if (alongRaw < -maxDist || alongRaw > len + maxDist) continue; // 벽 끝을 크게 벗어난 클릭은 이 벽이 아니다
    const off = dot(sub(p, w.a), n);
    const d = Math.abs(off) - w.thickness / 2;
    if (d > maxDist || (best && d >= best.d)) continue;
    const half = size[0] / 2, lo = Math.min(half, len / 2), hi = Math.max(len - half, len / 2);
    const along = Math.max(lo, Math.min(alongRaw, hi));
    const t = len ? along / len : 0;
    const side = off >= 0 ? 1 : -1;
    best = { wallId: w.id, t, side, d, ...placeOnWall(w, t, side, size, opts) };
  }
  return best;
}
