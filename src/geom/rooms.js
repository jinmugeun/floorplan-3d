import { uid } from '../state/schema.js';
import { add, sub, mul, dot, cross, norm, perp, eq, dist } from './vec.js';

export function polygonArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}
export function centroid(pts) {
  const n = pts.length;
  return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
}
export function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function lineIntersect(p, d, q, e) {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(q, p), e) / den;
  return add(p, mul(d, t));
}

export function offsetPolygon(pts, insets) {
  const c = centroid(pts), n = pts.length, lines = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], d = norm(sub(b, a));
    let nn = perp(d);
    if (dot(sub(c, a), nn) < 0) nn = mul(nn, -1);
    lines.push({ p: add(a, mul(nn, insets[i] ?? 0)), d });
  }
  return lines.map((l, i) => {
    const prev = lines[(i - 1 + n) % n];
    return lineIntersect(prev.p, prev.d, l.p, l.d) ?? l.p;
  });
}

function nodeKey(p) { return `${Math.round(p[0])},${Math.round(p[1])}`; }

export function detectRooms(walls, prevRooms = []) {
  const nodes = new Map();
  const getNode = p => { const k = nodeKey(p); if (!nodes.has(k)) nodes.set(k, { p: [Math.round(p[0]), Math.round(p[1])], out: [] }); return nodes.get(k); };
  const halfEdges = [];
  for (const w of walls) {
    const A = getNode(w.a), B = getNode(w.b);
    if (A === B) continue;
    const h1 = { from: A, to: B, wall: w.id }, h2 = { from: B, to: A, wall: w.id };
    h1.twin = h2; h2.twin = h1;
    A.out.push(h1); B.out.push(h2);
    halfEdges.push(h1, h2);
  }
  // 각 노드의 나가는 반변을 각도순(y를 뒤집어 수학 좌표계로) 정렬
  for (const n of nodes.values()) {
    n.out.sort((x, y) => Math.atan2(-(x.to.p[1] - n.p[1]), x.to.p[0] - n.p[0]) - Math.atan2(-(y.to.p[1] - n.p[1]), y.to.p[0] - n.p[0]));
  }
  const visited = new Set(), faces = [];
  for (const start of halfEdges) {
    if (visited.has(start)) continue;
    const pts = [], wallIds = []; let h = start, guard = 0;
    do {
      visited.add(h); pts.push(h.from.p); wallIds.push(h.wall);
      const out = h.to.out, idx = out.indexOf(h.twin);
      h = out[(idx + 1) % out.length];
      guard++;
    } while (h !== start && guard < 10000);
    // 위 순회 규칙(각도 정렬은 y를 뒤집어 수학 좌표계 기준)으로 추적하면, 이 y-남 좌표계에서
    // 방 내부 면은 polygonArea가 양수, 바깥 면은 음수로 나온다. 양수 면만 방으로 취한다.
    const area = polygonArea(pts);
    if (area > 1) faces.push({ pts, wallIds: [...new Set(wallIds)], area });
  }
  const wallById = Object.fromEntries(walls.map(w => [w.id, w]));
  return faces.map(f => {
    const c = centroid(f.pts);
    const prev = prevRooms.find(r => dist(centroid(r.points), c) < 500);
    const inner = roomInnerPolygon({ points: f.pts }, walls);
    return {
      id: prev?.id ?? uid('r'),
      name: prev?.name ?? '', type: prev?.type ?? 'none',
      floorOffset: prev?.floorOffset ?? 0, height: prev?.height ?? 2300, hideCeiling: prev?.hideCeiling ?? false,
      floorMaterial: prev?.floorMaterial ?? 'wood', ceilingMaterial: prev?.ceilingMaterial ?? 'paint-white',
      points: f.pts, wallIds: f.wallIds.filter(id => wallById[id]),
      area: Math.abs(polygonArea(inner)) / 1e6,
    };
  });
}

export function roomInnerPolygon(room, walls) {
  const insets = room.points.map((_, i) => {
    const a = room.points[i], b = room.points[(i + 1) % room.points.length];
    const w = walls.find(x => (eq(x.a, a) && eq(x.b, b)) || (eq(x.a, b) && eq(x.b, a)));
    return (w ? w.thickness : 200) / 2;
  });
  return offsetPolygon(room.points, insets);
}
