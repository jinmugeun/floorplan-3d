// 문·창(§18.4). 차례가 규칙이다: ① 창·문 블록 INSERT(blockOpenings.js — 2026-09-30, 인서트마다 **전개된 월드
// 도형**을 모아 자리·종류·폭을 읽는다. INSERT 점과 블록 로컬 bbox는 쓰지 않는다: 블록 로컬 좌표가 base에서
// 수십만 mm 떨어져 있어 bbox가 33 m × 13 m로 나왔다 — 프로토타입이 21개 중 9개만 맞힌 원인) → ② 문 원호의
// 중심 → ②′ 외미닫이 문 기호(slideDoors.js — 2026-10-12 신상중 A-DOOR: 벽과 나란한 문짝 선 + 미닫이 화살표)
// → ③ 개구부 레이어의 긴 면선이 벽을 덮는 구간(창) → ④ 벽 틈. 뒤 경로는 앞 경로가 앉힌 자리를 비켜 간다.
// 이 도면의 문은 두 가지다(2026-09-29 정정 — 계획 10의 "스윙 원호가 없다"는 ARC만 센 오판이었다):
//  ① 여닫이 6짝(양개 4 · 외짝 2): 역할 "기타"인 WID 레이어의 DR-900·DR-1800·dr-1850 블록에 있고 궤적은
//     **폴리선 bulge**다 — 그래서 문 블록 이름(DOOR_BLOCK)과 polyArcs를 함께 본다.
//  ② 미닫이 11짝(문_슬라이딩 포켓 900/800): 궤적이 없다(04창호의 원호 1,034개는 반지름 0.1~16.8 mm의
//     손잡이·모따기). 2026-10-06부터 ① 블록 경로가 `door-pocket-900`(폭은 블록 폭)으로 앉힌다 — **벽 틈**(gaps)의
//     `opening-pass`는 포켓 블록이 없는 도면의 보루다.
// 스윙 호가 있으면 그쪽이 이기고, 같은 자리에 겹쳐 놓지 않는다.
// 이 파일은 워커가 import하므로 DOM·ui를 건드리지 않는다.
import { DXF_PARAMS } from './params.js';
import { DOOR_BLOCK, OPEN_BLOCK, blockOpenings } from './blockOpenings.js';
import { DOOR_PRODUCTS, WINDOW_PRODUCTS, SLIDE_PRODUCTS, clamp01, nearestWall, fitOpening, fitT, dedupeGaps, blockProduct, nearestProduct, makeItem, spanPieces } from './openingSeat.js';
import { slideDoors } from './slideDoors.js';
import { uid } from '../../state/schema.js';

export { DOOR_BLOCK, OPEN_BLOCK, slideDoors };
// 제품 목록·폭 맞추기·틈 중복 제거·벽 찾기·아이템 만들기(순수 도우미)는 openingSeat.js로 옮겼다(2026-10-12 · 300줄 예산).
// 테스트·워커가 이 경로로 부르던 이름은 그대로 다시 내보낸다.
export { DOOR_PRODUCTS, WINDOW_PRODUCTS, SLIDE_PRODUCTS, OPENING_FALLBACK, OPENING_MATCH_DIST, OPENING_EDGE, nearestWall, productForWidth, fitOpening, fitT, dedupeGaps } from './openingSeat.js';

const DOOR_R = [600, 1200];                // 문 회전 궤적의 반지름 범위(mm)
const DOOR_SWEEP = [60, 110];              // 스윕 각 범위(°)
const HINGE_CLUSTER = 100;                 // 같은 문으로 볼 원호 중심 거리(mm)
const WIN_SPAN = [600, 4800];              // 창 폭 범위(mm)
const WIN_PER_WALL = 6;
const OPENING_BAND = 100;                  // 벽 중심선에서 창 면선까지 허용 오차(두께/2에 더한다)
const PARALLEL_COS = Math.cos(DXF_PARAMS.bridgeAngTol * Math.PI / 180);
const ALONG_DOT = 0.9;                     // "벽 방향과 가장 나란한 호 끝점"의 문턱

const normSweep = d => ((d % 360) + 360) % 360;

// 문 블록 이름(DOOR_BLOCK)·창·문 블록 이름(OPEN_BLOCK)은 blockOpenings.js에 있다(2026-09-29: 실파일 여닫이문
// 17개는 역할 "기타"인 WID 레이어의 DR-900·DR-1800·dr-1850 블록에 있었다 — 블록 이름이 문이면 레이어와 무관하다).

// 원호 → 문 후보(앱 좌표). toApp·scale로 DXF 좌표계를 앱 좌표계로 옮기며 센다.
export function doorHinges(arcs, layers, toApp = p => p, scale = 1) {
  const clusters = [];
  for (const a of arcs ?? []) {
    if (!layers.has(a.layer) && !DOOR_BLOCK.test(a.block ?? '')) continue;
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

// 벽 틈 → 개구부 후보(사전 검토 C-2). gaps는 walls.js의 extractWalls가 DXF 좌표로 준 { p, width }다(같은 띠 사이 틈).
export function gapOpenings(gaps, walls, toApp = p => p, scale = 1) {
  const out = [];
  for (const g of gaps ?? []) {
    const hit = nearestWall(walls, toApp(g.p));
    if (!hit) continue;
    out.push({ wall: hit.wall, t: hit.t, width: Math.round(g.width * scale / 50) * 50 });
  }
  return out;
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

// wallLayers: 벽을 뽑은 레이어(외미닫이 기호의 개구부 = 벽 레이어 면선이 없는 구간 — 없으면 그 경로를 건너뛴다).
export function buildOpenings({ ex, walls = [], toApp = p => p, scale = 1, openingLayers = new Set(), wallLayers = new Set(), gaps = [], params: P = DXF_PARAMS } = {}) {
  const items = [], placed = new Map();
  const wallLen = w => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  const clash = (wall, t, width) => (placed.get(wall.id) ?? []).some(o => Math.abs(o.t - t) * o.L < (o.width + width) / 2);
  const mark = (wall, t, width) => (placed.get(wall.id) ?? placed.set(wall.id, []).get(wall.id)).push({ t, width, L: wallLen(wall) });
  // 세 경로가 같은 규칙을 지난다: 벽 길이에 맞춰 폭을 정하고(fitOpening) → 그 폭만큼 t를 당기고(fitT)
  // → **놓일 폭 그대로** 충돌을 본다(리뷰 C3 — 예전에는 측정 폭으로 재고 카탈로그 폭으로 앉혔다).
  // keep(2026-10-12 · 외미닫이 기호): 폭은 실측 그대로(벽보다 넓으면 fitOpening의 벽 길이 규칙으로 줄인다) 두고 제품만 목록에서
  // 가장 가까운 것을 고른다 — 블록 경로(makeItem(blockProduct(…), 블록 폭, …))와 같은 뜻이다. 1,000 mm 기호 → door-slide-900 · 폭 1000.
  const seat = (list, mm, wall, t0, keep = false) => {
    const L = wallLen(wall);
    const fit = fitOpening(keep ? [] : list, mm, L);
    if (!fit) return;
    const t = fitT(t0, L, fit.width);
    if (clash(wall, t, fit.width)) return;
    const item = makeItem(keep ? nearestProduct(list, fit.width) : fit.id, fit.width, wall, t);
    if (!item) return;
    items.push(item);
    mark(wall, t, fit.width);
  };
  // ① 창·문 블록: 종류로 제품을 고르고 폭은 블록 그대로다(벽보다 넓으면 벽 안으로 줄인다).
  for (const o of blockOpenings(ex, walls, toApp)) {
    // 자리가 정확하므로 옮기지 않는다: 벽 끝(여유 OPENING_EDGE)을 넘는 쪽만 잘라 50 mm 단위로 내리고 반대쪽
    // 문설주는 제자리에 둔다(옮기면 문설주가 치수에서 어긋나고 이웃 개구부와 겹쳐 통째로 빠졌다).
    // 2026-10-12 · 계획 12 Task 7 — 사동중 win-4800-3 둘째(T자 칸막이): 넘친 끝을 **같은 선 위 이웃 조각**이 이어 받으면
    // 자르지 않고 그 조각에 나머지를 앉힌다(spanPieces — 공유 접점은 여유 면제). 조각마다 충돌을 따로 보고, 둘 이상 앉으면
    // 같은 openingGroup 표지를 단다(코퍼스 점수판이 그 폭을 더해 블록 폭과 맞댄다). 제품은 조각이 아니라 창 전체 폭으로 고른다
    // (1200 창의 600 조각이 고정창이 되지 않게 — 두 조각의 높이·sill이 같아야 한다).
    const L = wallLen(o.wall), c = o.t * L, half = o.width / 2;
    const pieces = spanPieces(walls, o.wall, c - half, c + half, P.bandTol);
    const id = blockProduct(o.kind, pieces.reduce((a, p) => a + p.width, 0));
    const group = [];
    for (const { wall, width, t } of pieces) {
      if (clash(wall, t, width)) continue;
      const item = makeItem(id, width, wall, t);
      if (!item) continue;
      items.push(item); group.push(item);
      mark(wall, t, width);
    }
    if (group.length > 1) { const g = uid('og'); for (const it of group) it.openingGroup = g; }
  }
  // ② 문 재료는 ARC 엔티티와 폴리선 bulge 호(polyArcs) 둘 다다.
  const leaves = [];
  for (const h of doorHinges([...(ex?.arcs ?? []), ...(ex?.polyArcs ?? [])], openingLayers, toApp, scale)) {
    const hit = nearestWall(walls, h.p);
    if (!hit) continue;
    const { wall } = hit;
    const d = [wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]], L = Math.hypot(d[0], d[1]);
    if (!L) continue;
    const u = [d[0] / L, d[1] / L];
    const tOf = p => ((p[0] - wall.a[0]) * u[0] + (p[1] - wall.a[1]) * u[1]) / L;
    // 개구부 중심 = 힌지와 "벽 방향과 가장 나란한 호 끝점"의 중점(§18.4).
    let bestEnd = null;
    for (const e of h.ends) {
      const v = [e[0] - h.p[0], e[1] - h.p[1]], vl = Math.hypot(v[0], v[1]);
      if (vl < 1) continue;
      const dot = Math.abs((v[0] * u[0] + v[1] * u[1]) / vl);
      if (dot >= ALONG_DOT && (!bestEnd || dot > bestEnd.dot)) bestEnd = { e, dot };
    }
    const mid = bestEnd ? [(h.p[0] + bestEnd.e[0]) / 2, (h.p[1] + bestEnd.e[1]) / 2] : h.p;
    leaves.push({ wall, L, width: h.width, tHinge: tOf(h.p), tMid: tOf(mid) });
  }
  // 양개문: 같은 벽 위 두 짝의 힌지 간격이 두 폭의 합(±10 %)이고 두 짝이 서로를 향해 연다 → 두 힌지의
  // 가운데에 폭 합의 문 하나(door-double-1800). 두 짝을 따로 앉히면 한가운데 문설주가 선 문 둘이 된다.
  const paired = new Set();
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const A = leaves[i], B = leaves[j];
    if (paired.has(i) || paired.has(j) || A.wall !== B.wall) continue;
    const gap = (B.tHinge - A.tHinge) * A.L, sum = A.width + B.width;
    if (Math.abs(Math.abs(gap) - sum) > 0.1 * sum) continue;
    if (Math.sign(A.tMid - A.tHinge) !== Math.sign(gap) || Math.sign(B.tMid - B.tHinge) !== -Math.sign(gap)) continue;
    paired.add(i); paired.add(j);
    seat(DOOR_PRODUCTS, sum, A.wall, clamp01((A.tHinge + B.tHinge) / 2));
  }
  leaves.forEach((f, i) => { if (!paired.has(i)) seat(DOOR_PRODUCTS, f.width, f.wall, clamp01(f.tMid)); });
  // ②′ 외미닫이 문 기호(2026-10-12 · 신상중 A-DOOR 문짝 선 + 미닫이 화살표 — 여섯 자리): 스윙 호 뒤 · 창 앞. 그 자리의 문틀·레일 선
  // (개구부 + 주차 자리, 1,700~2,000 mm)은 windowSpans가 창으로 읽던 재료라, 문을 먼저 앉혀 창 구간이 충돌로 비켜 가게 한다.
  // 문짝 선 자체도 창 재료에서 뺀다 — 문의 증거이고, 문 옆에 맞닿아(겹치지 않아) 충돌로는 못 막는 창·통로 조각이 됐다(합성 900·1300 문짝).
  const slides = slideDoors(ex, walls, openingLayers, toApp, P, wallLayers);
  for (const d of slides) seat(SLIDE_PRODUCTS, d.width, d.wall, clamp01(d.t), true);
  const leafSegs = new Set(slides.map(d => d.leaf));
  // 차례가 규칙이다(Task 6 재리뷰): 스윙 호 → **창(면선)** → 벽 틈. 개구부 레이어의 면선은 그 자리가
  // 창이라는 직접 증거라 같은 자리의 일반 틈을 이긴다. 틈은 마지막 폴백이고, 이미 앉은 개구부와
  // 겹치면 놓지 않는다(사전 검토 C-2의 "같은 자리에 겹쳐 놓지 않는다").
  const appSegs = (ex?.segs ?? []).filter(s => !leafSegs.has(s)).map(s => ({ layer: s.layer, a: toApp(s.a), b: toApp(s.b) }));
  for (const span of windowSpans(appSegs, openingLayers, walls, P)) seat(WINDOW_PRODUCTS, span.width, span.wall, span.t);
  for (const g of dedupeGaps(gapOpenings(gaps, walls, toApp, scale))) seat([], g.width, g.wall, g.t);
  return items;
}
