// 문·창(§18.4). **문은 INSERT 좌표를 쓰지 않는다**: 이 도면의 문 대부분은 블록 두 개가 도면 전체의
// 문을 통째로 그려 한 INSERT의 bbox가 33 m × 13 m다(프로토타입이 21개 중 9개만 맞힌 원인).
// 문 위치는 전개 후 **원호의 중심**이고, 창은 개구부 레이어의 긴 면선이 벽을 덮는 구간이다.
// 다만 이 도면의 문은 **미닫이**라 스윙 궤적 원호가 없다(사전 검토 C-2: 04창호의 원호 1,034개는
// 반지름 0.1~16.8 mm의 손잡이·모따기 디테일이고, 파일 전체에서 r 600~1,200 ∧ 스윕 60~110°인
// 원호는 5개뿐이며 전부 기구 레이어다). 그래서 두 번째 신호를 둔다 — Task 6이 준 **벽 틈**(gaps)을
// `opening-pass`로 앉힌다. 스윙 호가 있으면 그쪽이 이기고, 같은 자리에 겹쳐 놓지 않는다.
// 이 파일은 워커가 import하므로 DOM·ui를 건드리지 않는다.
import { createItem } from '../../state/schema.js';
import { productById } from '../../products/catalog.js';
import { placeOnWall } from '../../geom/items.js';
import { DXF_PARAMS } from './params.js';

export const DOOR_PRODUCTS = [['door-swing-900', 900], ['door-swing-1000', 1000], ['door-slide-1500', 1500], ['door-double-1800', 1800]];
export const WINDOW_PRODUCTS = [['window-fix-600', 600], ['window-slide-1200', 1200], ['window-slide-1800', 1800]];
export const OPENING_FALLBACK = 'opening-pass';
export const OPENING_MATCH_DIST = 900;     // 개구부 중심 → 벽 중심선 최대 거리(mm)
export const OPENING_EDGE = 50;            // 개구부가 벽 끝에서 떨어져 있어야 할 최소 여유(mm · 리뷰 F1)
const OPENING_MIN = 300;                   // 이보다 좁으면 개구부가 아니라 벽 토막이다(mm)
const GAP_SAME = 300;                      // 같은 개구부로 볼 벽 틈 중심 거리(mm)
const CATALOG_WIDTHS = [...new Set([...DOOR_PRODUCTS, ...WINDOW_PRODUCTS].map(e => e[1]))].sort((a, b) => a - b);
const DOOR_R = [600, 1200];                // 문 회전 궤적의 반지름 범위(mm)
const DOOR_SWEEP = [60, 110];              // 스윕 각 범위(°)
const HINGE_CLUSTER = 100;                 // 같은 문으로 볼 원호 중심 거리(mm)
const WIN_SPAN = [600, 4800];              // 창 폭 범위(mm)
const WIN_PER_WALL = 6;
const OPENING_BAND = 100;                  // 벽 중심선에서 창 면선까지 허용 오차(두께/2에 더한다)
const PARALLEL_COS = Math.cos(DXF_PARAMS.bridgeAngTol * Math.PI / 180);
const ALONG_DOT = 0.9;                     // "벽 방향과 가장 나란한 호 끝점"의 문턱

const clamp01 = v => Math.max(0, Math.min(1, v));
const normSweep = d => ((d % 360) + 360) % 360;

// 원호 → 문 후보(앱 좌표). toApp·scale로 DXF 좌표계를 앱 좌표계로 옮기며 센다.
export function doorHinges(arcs, layers, toApp = p => p, scale = 1) {
  const clusters = [];
  for (const a of arcs ?? []) {
    if (!layers.has(a.layer)) continue;
    const r = (a.r ?? 0) * scale;
    if (r < DOOR_R[0] || r > DOOR_R[1]) continue;
    const sweep = normSweep((a.a1 ?? 0) - (a.a0 ?? 0));
    if (sweep < DOOR_SWEEP[0] || sweep > DOOR_SWEEP[1]) continue;
    const p = toApp(a.c);
    // 끝점은 DXF 좌표계에서 만들고 나서 옮긴다 — 각도를 뒤집는 계산을 두 번 하지 않는다.
    const ends = [a.a0 ?? 0, a.a1 ?? 0].map(deg => {
      const t = deg * Math.PI / 180;
      return toApp([a.c[0] + a.r * Math.cos(t), a.c[1] + a.r * Math.sin(t)]);
    });
    let c = clusters.find(q => Math.hypot(q.p[0] - p[0], q.p[1] - p[1]) <= HINGE_CLUSTER);
    if (!c) { c = { p, rs: [], ends: [] }; clusters.push(c); }
    c.rs.push(r); c.ends.push(...ends);
  }
  return clusters.map(c => ({ p: c.p, width: Math.round(c.rs.reduce((a, x) => a + x, 0) / c.rs.length / 50) * 50, ends: c.ends }));
}

// 벽 틈 → 개구부 후보(사전 검토 C-2). gaps는 walls.js의 openingGaps가 DXF 좌표로 준 { p, width }다.
export function gapOpenings(gaps, walls, toApp = p => p, scale = 1) {
  const out = [];
  for (const g of gaps ?? []) {
    const hit = nearestWall(walls, toApp(g.p));
    if (!hit) continue;
    out.push({ wall: hit.wall, t: hit.t, width: Math.round(g.width * scale / 50) * 50 });
  }
  return out;
}

// 점에서 가장 가까운 벽 중심선(≤ maxDist). t = clamp(dot(p − a, dir) / len, 0, 1).
export function nearestWall(walls, p, maxDist = OPENING_MATCH_DIST) {
  let best = null;
  for (const w of walls) {
    const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]], L2 = d[0] * d[0] + d[1] * d[1];
    if (!L2) continue;
    const t = clamp01(((p[0] - w.a[0]) * d[0] + (p[1] - w.a[1]) * d[1]) / L2);
    const q = [w.a[0] + d[0] * t, w.a[1] + d[1] * t];
    const dist = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (!best || dist < best.dist) best = { wall: w, t, dist };
  }
  return best && best.dist <= maxDist ? best : null;
}

// 폭이 가장 가까운 카탈로그 제품. **고르는 척도와 거르는 척도를 맞춘다**(리뷰 F2): 상대 오차
// |mm − w| / w ≤ 0.2로 후보를 먼저 거르고 그중 절대 거리가 가장 가까운 것을 고른다. 절대 거리로
// 먼저 고르면 20 % 안에 드는 제품이 있는데도 폴백으로 떨어졌다(창 1,450.5 → window-slide-1800 ·
// 문 1,230.5 → door-slide-1500). 후보가 하나도 없으면(빈 목록 포함) 실측 폭 그대로의 개구부다.
export function productForWidth(list, mm) {
  let best = null;
  for (const e of list ?? []) {
    if (Math.abs(mm - e[1]) / e[1] > 0.2) continue;
    if (!best || Math.abs(mm - e[1]) < Math.abs(mm - best[1])) best = e;
  }
  return best ? { id: best[0], width: best[1], exact: true } : { id: OPENING_FALLBACK, width: mm, exact: false };
}

// 호스트 벽 길이를 다시 본다(리뷰 F1). 쓸 수 있는 폭은 L − 2·OPENING_EDGE이고 카탈로그 제품은 그
// 안에 들어가는 것만 후보다. 하나도 못 들어가면 실측 폭을 그 폭으로 자르고 50 mm 단위로 **내림**한
// opening-pass이며, 그래도 300 mm 미만이면 개구부를 아예 놓지 않는다(문이 아니라 벽 토막이다).
// 벽보다 넓은 개구부를 놓으면 geom/openings.js의 wallPieces가 그 벽의 아랫단을 통째로 지운다.
export function fitOpening(list, mm, wallLen) {
  const usable = wallLen - 2 * OPENING_EDGE;
  const pick = productForWidth((list ?? []).filter(e => e[1] <= usable), mm);
  if (pick.id !== OPENING_FALLBACK) return pick;
  const width = Math.floor(Math.min(mm, usable) / 50) * 50;
  return width >= OPENING_MIN ? { id: OPENING_FALLBACK, width, exact: false } : null;
}

// 개구부가 벽 끝 밖으로 삐져나오지 않게 t를 반폭만큼 안으로 당긴다(리뷰 F1·F4).
export function fitT(t, wallLen, width) {
  const lo = OPENING_EDGE + width / 2, hi = wallLen - OPENING_EDGE - width / 2;
  return wallLen > 0 && lo <= hi ? Math.max(lo, Math.min(t * wallLen, hi)) / wallLen : 0.5;
}

// 같은 물리 개구부를 두 번 세지 않는다(Task 6 재리뷰): 겹치는 면선 쌍이 둘 다 받아들여지면 한 자리의
// 틈이 둘로 보고된다(실파일 43쌍이 300 mm 안에 붙어 있고 그중 넷은 거리 0이다). 같은 벽에서 구간이
// 겹치거나 중심이 max(300 mm, 좁은 쪽 반폭) 안이면 하나로 보고, 카탈로그 폭에 가장 가까운 것을
// 남긴다(같으면 넓은 쪽). 입력·출력 모두 gapOpenings의 { wall, t, width }다.
export function dedupeGaps(list) {
  const near = w => Math.min(...CATALOG_WIDTHS.map(x => Math.abs(w - x)));
  const out = [];
  for (const g of list ?? []) {
    const L = Math.hypot(g.wall.b[0] - g.wall.a[0], g.wall.b[1] - g.wall.a[1]);
    const c = g.t * L;
    const i = out.findIndex(o => {
      if (o.g.wall.id !== g.wall.id) return false;
      const d = Math.abs(o.c - c);
      return d < (o.g.width + g.width) / 2 || d <= Math.max(GAP_SAME, Math.min(o.g.width, g.width) / 2);
    });
    if (i < 0) { out.push({ g, c }); continue; }
    const o = out[i].g, dn = near(g.width) - near(o.width);
    if (dn < 0 || (dn === 0 && g.width > o.width)) out[i] = { g, c };
  }
  return out.map(o => o.g);
}

// 개구부 레이어의 긴 면선이 벽 중심선을 덮는 구간 → 창(벽 하나당 최대 여섯 개).
export function windowSpans(segs, layers, walls, P = DXF_PARAMS) {
  const cand = (segs ?? []).filter(s => layers.has(s.layer) && Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) >= P.openFaceMin);
  const out = [];
  for (const w of walls) {
    const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]], L = Math.hypot(d[0], d[1]);
    if (L < P.minWall) continue;
    const u = [d[0] / L, d[1] / L], n = [-u[1], u[0]], band = w.thickness / 2 + OPENING_BAND;
    const iv = [];
    for (const s of cand) {
      const sd = [s.b[0] - s.a[0], s.b[1] - s.a[1]], sl = Math.hypot(sd[0], sd[1]);
      if (Math.abs((sd[0] * u[0] + sd[1] * u[1]) / sl) < PARALLEL_COS) continue;
      const o0 = (s.a[0] - w.a[0]) * n[0] + (s.a[1] - w.a[1]) * n[1];
      const o1 = (s.b[0] - w.a[0]) * n[0] + (s.b[1] - w.a[1]) * n[1];
      if (Math.abs(o0) > band || Math.abs(o1) > band) continue;
      const t0 = (s.a[0] - w.a[0]) * u[0] + (s.a[1] - w.a[1]) * u[1];
      const t1 = (s.b[0] - w.a[0]) * u[0] + (s.b[1] - w.a[1]) * u[1];
      iv.push([Math.max(0, Math.min(t0, t1)), Math.min(L, Math.max(t0, t1))]);
    }
    iv.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [a, b] of iv) {
      const last = merged[merged.length - 1];
      if (last && a - last[1] <= 1) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    for (const [a, b] of merged.filter(([a2, b2]) => b2 - a2 >= WIN_SPAN[0] && b2 - a2 <= WIN_SPAN[1]).slice(0, WIN_PER_WALL)) {
      out.push({ wall: w, t: clamp01((a + b) / 2 / L), width: Math.round((b - a) / 50) * 50 });
    }
  }
  return out;
}

// 높이·sill은 **카탈로그 기본값 그대로**다 — 도면에 입면 정보가 전혀 없다. 폭만 실측으로 덮어쓴다.
// 제품마다 값이 다르다(사전 검토 I-9): 문 z 0 · h 2100 / `window-slide-*` z 900 · h 1200 /
// **`window-fix-600`은 z 1200 · h 600** / `opening-pass` z 0 · h 2100.
function makeItem(id, width, wall, t) {
  const product = productById(id);
  if (!product) return null;
  const size = [width, product.size[1], product.size[2]];
  return createItem(product, { attach: 'wall', wallId: wall.id, t, side: 1, size, ...placeOnWall(wall, t, 1, size, { embed: true }) });
}

export function buildOpenings({ ex, walls = [], toApp = p => p, scale = 1, openingLayers = new Set(), gaps = [], params: P = DXF_PARAMS } = {}) {
  const items = [], placed = new Map();
  const wallLen = w => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  const clash = (wall, t, width) => (placed.get(wall.id) ?? []).some(o => Math.abs(o.t - t) * o.L < (o.width + width) / 2);
  const mark = (wall, t, width) => (placed.get(wall.id) ?? placed.set(wall.id, []).get(wall.id)).push({ t, width, L: wallLen(wall) });
  // 세 경로가 같은 규칙을 지난다: 벽 길이에 맞춰 폭을 정하고(fitOpening) → 그 폭만큼 t를 당기고(fitT)
  // → **놓일 폭 그대로** 충돌을 본다(리뷰 C3 — 예전에는 측정 폭으로 재고 카탈로그 폭으로 앉혔다).
  const seat = (list, mm, wall, t0) => {
    const L = wallLen(wall);
    const fit = fitOpening(list, mm, L);
    if (!fit) return;
    const t = fitT(t0, L, fit.width);
    if (clash(wall, t, fit.width)) return;
    const item = makeItem(fit.id, fit.width, wall, t);
    if (!item) return;
    items.push(item);
    mark(wall, t, fit.width);
  };
  for (const h of doorHinges(ex?.arcs ?? [], openingLayers, toApp, scale)) {
    const hit = nearestWall(walls, h.p);
    if (!hit) continue;
    const { wall } = hit;
    const d = [wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]], L = Math.hypot(d[0], d[1]);
    if (!L) continue;
    const u = [d[0] / L, d[1] / L];
    // 개구부 중심 = 힌지와 "벽 방향과 가장 나란한 호 끝점"의 중점(§18.4).
    let bestEnd = null;
    for (const e of h.ends) {
      const v = [e[0] - h.p[0], e[1] - h.p[1]], vl = Math.hypot(v[0], v[1]);
      if (vl < 1) continue;
      const dot = Math.abs((v[0] * u[0] + v[1] * u[1]) / vl);
      if (dot >= ALONG_DOT && (!bestEnd || dot > bestEnd.dot)) bestEnd = { e, dot };
    }
    const mid = bestEnd ? [(h.p[0] + bestEnd.e[0]) / 2, (h.p[1] + bestEnd.e[1]) / 2] : h.p;
    seat(DOOR_PRODUCTS, h.width, wall, clamp01(((mid[0] - wall.a[0]) * u[0] + (mid[1] - wall.a[1]) * u[1]) / L));
  }
  // 차례가 규칙이다(Task 6 재리뷰): 스윙 호 → **창(면선)** → 벽 틈. 개구부 레이어의 면선은 그 자리가
  // 창이라는 직접 증거라 같은 자리의 일반 틈을 이긴다. 틈은 마지막 폴백이고, 이미 앉은 개구부와
  // 겹치면 놓지 않는다(사전 검토 C-2의 "같은 자리에 겹쳐 놓지 않는다").
  const appSegs = (ex?.segs ?? []).map(s => ({ layer: s.layer, a: toApp(s.a), b: toApp(s.b) }));
  for (const span of windowSpans(appSegs, openingLayers, walls, P)) seat(WINDOW_PRODUCTS, span.width, span.wall, span.t);
  for (const g of dedupeGaps(gapOpenings(gaps, walls, toApp, scale))) seat([], g.width, g.wall, g.t);
  return items;
}
