import { uid } from '../state/schema.js';
import { add, sub, mul, dot, cross, dist, norm, perp, eq } from './vec.js';
import { openingsOnWall } from './openings.js';

export const WALL_COLOR_IN = '#f2efe9';
export const WALL_COLOR_OUT = '#e9e6e0';

export function makeWall({ a, b, thickness = 200, height = 2300, material = 'paint-white', colorIn = WALL_COLOR_IN, colorOut = WALL_COLOR_OUT }) {
  return { id: uid('w'), a: [...a], b: [...b], thickness, height, material, colorIn, colorOut, matIn: null, matOut: null, regions: { in: [], out: [] } };
}
// 노드(끝점) 키: 0.01 mm까지 구분한다. 같은 자리에 모인 끝점을 한 묶음으로 옮길 때 쓴다.
export const nodeKey = p => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
export const wallDir = w => norm(sub(w.b, w.a));
export const wallLength = w => dist(w.a, w.b);
export const wallNormal = w => perp(wallDir(w));

// ext({ start, end } · 벽 축 u)를 주면 그 범위의 사각형이다 — 3D 본체·윗면·밑동이 wallExtent와 같은 끝을 쓴다(2026-10-12 · 리뷰 M-1 후속).
export function wallPolygon(w, walls = [], ext = null) {
  const d = wallDir(w), n = wallNormal(w), h = w.thickness / 2;
  const joined = p => walls.some(o => o.id !== w.id && !o.virtual && (eq(o.a, p) || eq(o.b, p)));   // 구획선은 벽 접합이 아니다
  const a = ext ? add(w.a, mul(d, ext.start)) : joined(w.a) ? sub(w.a, mul(d, h)) : w.a;
  const b = ext ? add(w.a, mul(d, ext.end)) : joined(w.b) ? add(w.b, mul(d, h)) : w.b;
  return [add(a, mul(n, h)), add(b, mul(n, h)), sub(b, mul(n, h)), sub(a, mul(n, h))];
}

// 두 렌더러(2D view2d/walls2d.wallRange · 3D view3d/build.js)가 함께 쓰는 벽 축 u 범위 — 규칙은 여기 한 곳이다.
// 다른 벽(구획선 제외)이 끝점 P를 공유하면 그 끝을 두께/2만큼 늘린다(모서리·T자에서 빈틈이 없게 — wallPolygon과 같은 뿌리). 예외 하나
// (2026-10-12 · 계획 12 Task 7 리뷰 M-1 후속): P를 공유하는 벽(자기 자신 포함) 가운데 **P에 딱 붙은(1 mm 안) 개구부**를 가진 벽이 있고
// 그 벽이 P에서 같은 선으로 이어지면(다른 벽이 P에서 그 벽의 바깥 방향 2° 안으로 뻗는다), P를 공유하는 벽은 모두 늘리지 않는다.
//  - 왜: T자로 갈린 같은 선 조각들에 이어 앉힌 창(io/dxf/openingSeat.spanPieces · 사동중 win-4800-3 둘째)은 접점에 딱 붙는다. 늘린 t/2 상자는
//    제 벽 개구부로만 잘려 창 가운데에 벽 두께만 한 통높이 기둥(360 mm)이 섰고, T자 칸막이의 연장은 외벽 겉면 2.5 mm 안까지 와 유리를
//    가로질렀다. 이제 두 조각은 접점에서 맞닿고 칸막이는 외벽 중심선(유리 자리)에서 멈춘다.
//  - 그 밖은 예전 그대로다: 개구부 없는 같은 선 분할(splitWall · 개구부 없는 T자)은 t/2씩 겹쳐 2D 캔버스 이음매·3D 숨은선 모서리가 생기지 않고,
//    모서리는 늘 늘린다 — 도면 개구부는 벽 끝에서 떨어지고(틈·호 개구부는 OPENING_EDGE 50, 블록 개구부는 블록이 벽 끝에 닿거나 넘을 때만 50이고
//    벽 안에 든 블록은 도면의 문설주 자리라 15~30 mm일 수 있다 — 2026-10-12 계획 13 Task 6(b) · 최종 리뷰 M6-3), 손으로 끝에 붙인 창도 같은 선
//    이어짐이 아니면 예외가 아니다.
// items: 아이템 배열(openingsOnWall로 구멍을 구한다) 또는 벽 → 구멍([{ u0, u1 }]) 함수(그리는 쪽이 이미 구한 색인).
const COLLINEAR_COS = Math.cos(2 * Math.PI / 180);
const FLUSH_TOL = 1;
export function wallEndExtends(w, P, walls = [], items = []) {
  const holesOf = typeof items === 'function' ? items : o => openingsOnWall(items ?? [], o);
  const at = [w, ...(walls ?? []).filter(o => o.id !== w.id && !o.virtual && (eq(o.a, P) || eq(o.b, P)))];
  if (at.length < 2) return false;                                   // 접합이 없다
  const far = o => (eq(o.a, P) ? o.b : o.a);
  const continues = o => {
    const out = sub(P, far(o)), ol = Math.hypot(out[0], out[1]);     // P에서 o의 바깥 방향
    return at.some(x => { if (x === o) return false; const v = sub(far(x), P), vl = Math.hypot(v[0], v[1]); return ol > 0 && vl > 0 && dot(v, out) >= vl * ol * COLLINEAR_COS; });
  };
  const flush = o => { const L = wallLength(o), atA = eq(o.a, P); return (holesOf(o) ?? []).some(hl => (atA ? Math.abs(hl.u0) : Math.abs(hl.u1 - L)) <= FLUSH_TOL); };
  return !at.some(o => flush(o) && continues(o));
}
export function wallExtent(w, walls = [], items = []) {
  const h = w.thickness / 2;
  return { start: wallEndExtends(w, w.a, walls, items) ? -h : 0, end: wallLength(w) + (wallEndExtends(w, w.b, walls, items) ? h : 0) };
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
  const empty = () => ({ in: [], out: [] });
  const w1 = { ...w, b: m, regions: empty() }, w2 = { ...w, id: uid('w'), a: m, regions: empty() };
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
