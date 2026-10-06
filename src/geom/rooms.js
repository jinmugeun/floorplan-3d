import { uid } from '../state/schema.js';
import { add, sub, mul, dot, cross, norm, perp, eq, dist } from './vec.js';

export const ROOM_FLOOR_COLOR = '#c9a77a';
export const ROOM_CEILING_COLOR = '#f4f4f2';

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

// 변마다 안쪽으로 insets[i]만큼 옮긴 폴리곤(음수면 바깥으로). 안쪽은 **감긴 방향**으로 정한다 — offsetPolygon은
// 무게중심 쪽을 안쪽으로 보아 ㄱ자 방의 일부 변에서 틀린다. 한 직선 위의 두 변이 다른 값이면 단이 진다(두 점을 낸다).
export function insetPolygon(pts, insets) {
  const sgn = polygonArea(pts) >= 0 ? 1 : -1, n = pts.length;
  const lines = pts.map((a, i) => {
    const d = norm(sub(pts[(i + 1) % n], a)), nn = mul(perp(d), sgn);
    return { p: add(a, mul(nn, insets[i] ?? 0)), d };
  });
  return lines.flatMap((l, i) => {
    const prev = lines[(i - 1 + n) % n];
    const x = lineIntersect(prev.p, prev.d, l.p, l.d);
    if (x) return [x];
    const end = add(prev.p, mul(prev.d, dist(pts[(i - 1 + n) % n], pts[i])));   // 앞 변의 옮겨진 끝
    return eq(end, l.p, 1e-6) ? [l.p] : [end, l.p];
  });
}

// 방의 "도면 기준" 넓이(mm²): 변마다 그 벽의 axisShift(벽의 왼쪽 법선 perp(b − a) 쪽으로 기준선이 옮겨진 거리)만큼
// 중심선을 옮긴 폴리곤. axisShift가 없으면 벽 중심선 그대로다.
function centerArea(pts, walls) {
  const sgn = polygonArea(pts) >= 0 ? 1 : -1, n = pts.length;
  const insets = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const w = walls.find(x => (eq(x.a, a) && eq(x.b, b)) || (eq(x.a, b) && eq(x.b, a)));
    if (!w?.axisShift) return 0;
    return w.axisShift * dot(perp(norm(sub(w.b, w.a))), mul(perp(norm(sub(b, a))), sgn));
  });
  return Math.abs(polygonArea(insets.some(Boolean) ? insetPolygon(pts, insets) : pts));
}

// 화면에 보여 줄 방 넓이(m²). '도면 기준'(center)이면 벽·기둥 중심선 넓이, 아니면 안목 넓이(옛 파일은 areaCenter가 없다).
export const roomArea = (room, mode = 'net') => (mode === 'center' && room?.areaCenter > 0 ? room.areaCenter : Number(room?.area) || 0);

function nodeKey(p) { return `${Math.round(p[0])},${Math.round(p[1])}`; }

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

// 새 면마다 이전 방을 하나씩 짝짓는다(이전 방은 최대 한 번만 쓴다).
// 1순위: 공유하는 벽 id의 자카드 겹침이 가장 큰 방(겹침 > 0). 벽을 하나도 공유하지 않을 때만
// 2순위로 중심점이 500 mm 안에 있는 방으로 대체한다(좌표만 바뀐 옛 파일 등).
function matchPrevRooms(faces, prevRooms) {
  const used = new Set(), result = new Array(faces.length).fill(null);
  const pairs = [];
  faces.forEach((f, i) => prevRooms.forEach(r => { const s = jaccard(f.wallIds, r.wallIds ?? []); if (s > 0) pairs.push({ i, r, s }); }));
  pairs.sort((x, y) => y.s - x.s);
  for (const { i, r, s } of pairs) { if (result[i] || used.has(r) || s <= 0) continue; result[i] = r; used.add(r); }
  faces.forEach((f, i) => {
    if (result[i]) return;
    const c = centroid(f.pts);
    const r = prevRooms.find(x => !used.has(x) && Array.isArray(x.points) && x.points.length && dist(centroid(x.points), c) < 500);
    if (r) { result[i] = r; used.add(r); }
  });
  return result;
}

export function detectRooms(walls, prevRooms = []) {
  const nodes = new Map();
  const getNode = p => { const k = nodeKey(p); if (!nodes.has(k)) nodes.set(k, { p: [Math.round(p[0]), Math.round(p[1])], out: [] }); return nodes.get(k); };
  const halfEdges = [], seenPairs = new Set();
  for (const w of walls) {
    if (w.noSplit) continue;      // 방을 나누지 않는 벽(딸린 칸의 칸막이 — io/dxf/reconcile.js): 그리되 면을 가르지 않는다
    const A = getNode(w.a), B = getNode(w.b);
    if (A === B) continue;
    const pairKey = [nodeKey(A.p), nodeKey(B.p)].sort().join('|');
    if (seenPairs.has(pairKey)) continue; // 같은 두 점을 잇는 중복 벽은 한 번만 센다
    seenPairs.add(pairKey);
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
  const matches = matchPrevRooms(faces, prevRooms);
  return faces.map((f, i) => {
    const prev = matches[i];
    const inner = roomInnerPolygon({ points: f.pts }, walls);
    return {
      id: prev?.id ?? uid('r'),
      name: prev?.name ?? '', type: prev?.type ?? 'none',
      floorOffset: prev?.floorOffset ?? 0, height: prev?.height ?? 2300, hideCeiling: prev?.hideCeiling ?? false,
      // 카탈로그 id로 둔다(materialOps의 LEGACY_MATERIAL 별칭은 **옛 파일**만을 위한 것이다).
      floorMaterial: prev?.floorMaterial ?? 'wood-oak', ceilingMaterial: prev?.ceilingMaterial ?? 'paint-white',
      seats: prev?.seats ?? 0, matchWallHeight: prev?.matchWallHeight ?? false,
      floorColor: prev?.floorColor ?? ROOM_FLOOR_COLOR, ceilingColor: prev?.ceilingColor ?? ROOM_CEILING_COLOR,
      floorMat: prev?.floorMat ?? null, ceilingMat: prev?.ceilingMat ?? null,
      design: prev?.design ?? { EA: 0, SA: 0 },
      points: f.pts, wallIds: f.wallIds.filter(id => wallById[id]),
      // 안쪽 폴리곤은 roomInnerPolygon이 이미 saneInner로 걸러 준다(뒤집힘·폭발이면 바깥 폴리곤 — 2026-10-06). saneArea는
      // 숫자에 대한 두 번째 보루다: 그래도 넓이가 0 이하이거나 바깥을 넘으면 바깥 폴리곤 면적(상한)으로 되돌린다
      // (처음 보고: 폭 6 mm 조각이 54.8 m² — 계획 10 슬리버 리뷰).
      area: saneArea(polygonArea(inner), f.area) / 1e6,
      // 도면 기준(벽·기둥 중심선) 넓이 — 치수가 가리키는 선으로 잰 값(DXF 도면의 실 면적 표기가 이 기준이다).
      areaCenter: saneCenter(centerArea(f.pts, walls), f.area) / 1e6,
    };
  });
}

// 기준선 넓이는 중심선 넓이에서 크게 벗어날 수 없다(벽 두께만큼) — 교차 계산이 폭발하면 중심선 넓이로 되돌린다.
const saneCenter = (a, outerA) => (Number.isFinite(a) && a > 0 && a <= outerA * 1.5 + 4e6 ? a : outerA);
const saneArea = (innerA, outerA) => (Number.isFinite(innerA) && innerA > 0 && innerA <= outerA) ? innerA : outerA;

// 안쪽 폴리곤의 보루(2026-10-06 · 계획 10 이월 ④): offsetPolygon은 근-평행 변이 만나면 뒤집히거나 폭발한다(6 mm 조각이
// 54.8 m² · 3D 바닥 폴리곤 123 m). saneArea는 숫자만 고쳤고 2D 바닥(view2d)·3D 바닥/천장/벽면(build.js)·템플릿은 그 폴리곤을
// 그대로 그렸다. 네 가지를 모두 지켜야 안쪽을 쓴다 — 점이 유한하고, 부호가 바깥과 같고(뒤집히지 않음), 넓이가 바깥 이하이고,
// 모든 점이 바깥 bbox 안이다(음수가 아닌 inset은 bbox를 벗어날 수 없다). 넓이만으로는 모자랐다(2026-10-06 리뷰: 5 m 변 끝이
// 5 mm 꺾이고 다음 변이 구획선이면 한 점이 x ≈ 105 m로 튀는데 넓이는 22.9 m² < 29.99 m²였다). 하나라도 어기면 **바깥
// 폴리곤의 복사본**으로 되돌린다 — build.js의 edgeWall이 i번째 변 ↔ i번째 벽을 전제하므로 점 수와 차례는 지킨다.
export function saneInner(inner, outer) {
  const copy = () => outer.map(p => [p[0], p[1]]);
  if (inner.length !== outer.length || inner.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return copy();
  // bbox는 1 mm 여유를 둔다: 구획선(inset 0) 변의 점은 bbox 선 위에 그대로 앉는다(부동소수 오차 포함).
  const xs = outer.map(p => p[0]), ys = outer.map(p => p[1]);
  const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
  if (inner.some(([x, y]) => x < x0 || x > x1 || y < y0 || y > y1)) return copy();
  const ai = polygonArea(inner), ao = polygonArea(outer);
  return Math.sign(ai) === Math.sign(ao) && Math.abs(ai) <= Math.abs(ao) ? inner : copy();
}

export function roomInnerPolygon(room, walls, extra = 0) {
  const insets = room.points.map((_, i) => {
    const a = room.points[i], b = room.points[(i + 1) % room.points.length];
    const w = walls.find(x => (eq(x.a, a) && eq(x.b, b)) || (eq(x.a, b) && eq(x.b, a)));
    return (w ? (w.virtual ? 0 : w.thickness) : 200) / 2 + extra;      // 구획선(virtual)은 두께가 없다
  });
  return saneInner(offsetPolygon(room.points, insets), room.points);
}
