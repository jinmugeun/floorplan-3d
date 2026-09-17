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

// 아이템을 벽면(뒷면 맞춤)과 다른 아이템의 모서리·중심선에 맞춘다.
// 축에 평행한 벽만 후보로 삼는다(비스듬한 벽에는 벽 부착 경로가 따로 있다).
// 회전한 아이템은 AABB 기준으로 맞춘다.
export function snapItemPos(item, { walls = [], items = [], tol = ITEM_SNAP_TOL } = {}) {
  const box = itemAABB(item);
  const vs = [], hs = [];
  for (const w of walls) {
    const h = w.thickness / 2;
    if (Math.abs(w.a[0] - w.b[0]) < 1) vs.push(w.a[0] - h, w.a[0] + h);
    if (Math.abs(w.a[1] - w.b[1]) < 1) hs.push(w.a[1] - h, w.a[1] + h);
  }
  for (const o of items) {
    const b = itemAABB(o);
    vs.push(b.min[0], b.max[0], (b.min[0] + b.max[0]) / 2);
    hs.push(b.min[1], b.max[1], (b.min[1] + b.max[1]) / 2);
  }
  const pick = (lines, axis) => {
    const edges = [box.min[axis], box.max[axis], (box.min[axis] + box.max[axis]) / 2];
    let best = null;
    for (const line of lines) for (const e of edges) {
      const d = line - e;
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line };
    }
    return best;
  };
  const bx = pick(vs, 0), by = pick(hs, 1);
  const guides = [];
  if (bx) guides.push({ type: 'v', x: bx.line });
  if (by) guides.push({ type: 'h', y: by.line });
  return { pos: [item.pos[0] + (bx ? bx.d : 0), item.pos[1] + (by ? by.d : 0)], guides };
}

export const isEmbed = item => ['door', 'window', 'opening'].includes(item?.kind);

// 이동 중 표시할 벽까지 거리(mm). 축에 평행한 벽만 보고, 아이템 AABB와 겹치는 구간이 있는 벽만 센다.
// up은 -y(화면 위), down은 +y 방향이다. 해당 방향에 벽이 없으면 null.
export function wallGaps(box, walls) {
  const out = { left: null, right: null, up: null, down: null };
  const put = (k, v) => { if (v >= 0 && (out[k] === null || v < out[k])) out[k] = v; };
  const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 0;
  for (const w of walls) {
    const h = w.thickness / 2;
    if (Math.abs(w.a[0] - w.b[0]) < 1) {          // 남북 벽
      const y0 = Math.min(w.a[1], w.b[1]), y1 = Math.max(w.a[1], w.b[1]);
      if (!overlap(box.min[1], box.max[1], y0, y1)) continue;
      put('right', (w.a[0] - h) - box.max[0]);
      put('left', box.min[0] - (w.a[0] + h));
    } else if (Math.abs(w.a[1] - w.b[1]) < 1) {   // 동서 벽
      const x0 = Math.min(w.a[0], w.b[0]), x1 = Math.max(w.a[0], w.b[0]);
      if (!overlap(box.min[0], box.max[0], x0, x1)) continue;
      put('down', (w.a[1] - h) - box.max[1]);
      put('up', box.min[1] - (w.a[1] + h));
    }
  }
  return out;
}
