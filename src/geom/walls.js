import { uid } from '../state/schema.js';
import { add, sub, mul, dot, dist, norm, perp, eq } from './vec.js';

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

export function moveWallParallel(walls, id, delta) {
  const w = walls.find(x => x.id === id);
  if (!w) return walls;
  const n = wallNormal(w), off = mul(n, dot(delta, n));
  const na = add(w.a, off), nb = add(w.b, off);
  return walls.map(x => {
    if (x.id === id) return { ...x, a: na, b: nb };
    const y = { ...x };
    if (eq(x.a, w.a)) y.a = na; else if (eq(x.a, w.b)) y.a = nb;
    if (eq(x.b, w.a)) y.b = na; else if (eq(x.b, w.b)) y.b = nb;
    return y;
  });
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
