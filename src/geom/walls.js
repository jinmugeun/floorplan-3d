import { uid } from '../state/schema.js';
import { add, sub, mul, dot, cross, dist, norm, perp, eq } from './vec.js';

export function makeWall({ a, b, thickness = 200, height = 2300, material = 'paint-white' }) {
  return { id: uid('w'), a: [...a], b: [...b], thickness, height, material };
}
export const wallDir = w => norm(sub(w.b, w.a));
export const wallLength = w => dist(w.a, w.b);
export const wallNormal = w => perp(wallDir(w));

export function wallPolygon(w, walls = []) {
  const d = wallDir(w), n = wallNormal(w), h = w.thickness / 2;
  const joined = p => walls.some(o => o.id !== w.id && (eq(o.a, p) || eq(o.b, p)));
  const a = joined(w.a) ? sub(w.a, mul(d, h)) : w.a;
  const b = joined(w.b) ? add(w.b, mul(d, h)) : w.b;
  return [add(a, mul(n, h)), add(b, mul(n, h)), sub(b, mul(n, h)), sub(a, mul(n, h))];
}

export function rectWalls(p, q, thickness = 200, height = 2300) {
  const x0 = Math.min(p[0], q[0]), x1 = Math.max(p[0], q[0]);
  const y0 = Math.min(p[1], q[1]), y1 = Math.max(p[1], q[1]);
  const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  return c.map((a, i) => makeWall({ a, b: c[(i + 1) % 4], thickness, height }));
}

export function splitWall(walls, id, point) {
  const w = walls.find(x => x.id === id);
  if (!w) return walls;
  const d = wallDir(w), t = dot(sub(point, w.a), d);
  const m = add(w.a, mul(d, Math.max(0, Math.min(wallLength(w), t))));
  const w1 = { ...w, b: m }, w2 = { ...w, id: uid('w'), a: m };
  return walls.flatMap(x => (x.id === id ? [w1, w2] : [x]));
}

const COLLINEAR_TOL = 0.05; // 두 단위 방향의 외적 절댓값, 약 3도

// x가 점 q에서 다른 벽 d(단위 방향)와 같은 직선 위에 이어져 있는가
const isCollinearAt = (x, d) => Math.abs(cross(d, wallDir(x))) < COLLINEAR_TOL;

export function moveWallParallel(walls, id, delta) {
  const w = walls.find(x => x.id === id);
  if (!w) return walls;
  const n = wallNormal(w), off = mul(n, dot(delta, n));
  if (dist(off, [0, 0]) <= 1) return walls.map(x => ({ ...x, a: [...x.a], b: [...x.b] }));
  const na = add(w.a, off), nb = add(w.b, off);
  const d = wallDir(w);
  const moves = [[w.a, na], [w.b, nb]];
  const out = walls.map(x => {
    if (x.id === id) return { ...x, a: na, b: nb };
    const y = { ...x, a: [...x.a], b: [...x.b] };
    for (const [q, qp] of moves) {
      if (isCollinearAt(x, d)) continue; // 공선 이웃은 끝점을 옮기지 않는다
      if (eq(x.a, q)) y.a = [...qp];
      if (eq(x.b, q)) y.b = [...qp];
    }
    return y;
  });
  const connectors = [];
  for (const [q, qp] of moves) {
    const hasCollinearNeighbour = walls.some(x => x.id !== id && (eq(x.a, q) || eq(x.b, q)) && isCollinearAt(x, d));
    if (hasCollinearNeighbour) connectors.push({ ...w, id: uid('w'), a: [...q], b: [...qp] });
  }
  return [...out, ...connectors];
}

// isMoved(point) → boolean인 노드 집합을 delta만큼 평행 이동한다.
// 한쪽 끝점만 이동하는 바깥 이웃 벽은, delta와 평행하면 그 끝점을 따라 늘어나고/줄어들고,
// 그렇지 않으면 그대로 둔 채 연결 벽(jog connector)을 노드마다 최대 1개 추가한다.
export function translateNodes(walls, isMoved, delta) {
  if (dist(delta, [0, 0]) <= 1) return walls.map(w => ({ ...w, a: [...w.a], b: [...w.b] }));
  const du = norm(delta);
  const connectorAt = new Set(); // 이미 연결 벽을 추가한 노드 키
  const connectors = [];
  const out = walls.map(w => {
    const aMoved = isMoved(w.a), bMoved = isMoved(w.b);
    if (aMoved && bMoved) return { ...w, a: add(w.a, delta), b: add(w.b, delta) };
    if (!aMoved && !bMoved) return { ...w, a: [...w.a], b: [...w.b] };
    const parallel = Math.abs(cross(wallDir(w), du)) < COLLINEAR_TOL;
    if (parallel) {
      return aMoved ? { ...w, a: add(w.a, delta), b: [...w.b] } : { ...w, a: [...w.a], b: add(w.b, delta) };
    }
    const oldPt = aMoved ? w.a : w.b;
    const key = oldPt.join(',');
    if (!connectorAt.has(key)) {
      connectorAt.add(key);
      connectors.push({ ...w, id: uid('w'), a: [...oldPt], b: add(oldPt, delta) });
    }
    return { ...w, a: [...w.a], b: [...w.b] };
  });
  return [...out, ...connectors];
}

export function moveVertex(walls, point, newPoint) {
  return walls.map(w => ({ ...w, a: eq(w.a, point) ? [...newPoint] : w.a, b: eq(w.b, point) ? [...newPoint] : w.b }));
}

export function endpoints(walls) {
  const out = [];
  for (const w of walls) for (const p of [w.a, w.b]) if (!out.some(q => eq(q, p))) out.push(p);
  return out;
}

export function distToSegment(p, a, b) {
  const ab = sub(b, a), l2 = dot(ab, ab);
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, add(a, mul(ab, t)));
}

export function hitWall(walls, p, tol = 0) {
  let best = null, bestD = Infinity;
  for (const w of walls) {
    const d = distToSegment(p, w.a, w.b) - w.thickness / 2;
    if (d <= tol && d < bestD) { best = w; bestD = d; }
  }
  return best;
}

export function transformWalls(walls, fn) {
  return walls.map(w => ({ ...w, a: fn(w.a), b: fn(w.b) }));
}
