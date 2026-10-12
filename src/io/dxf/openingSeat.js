// 문·창(§18.4)을 벽에 앉히는 순수 도우미 — 제품 목록·폭 맞추기(productForWidth·fitOpening·fitT)·틈 중복 제거(dedupeGaps)·벽 찾기(nearestWall)·블록 제품(blockProduct)·아이템 만들기(makeItem).
// 2026-10-12 · 300줄 예산 · 계획 12 Task 0: openings.js에서 그대로 옮겼다(동작 불변) — openings.js가 예전 공개 이름을 다시 내보낸다.
// 이 파일도 워커가 import하므로 DOM·ui를 건드리지 않는다.
// 알려진 한계(2026-10-12 · 계획 12 Task 7 리뷰 — spanPieces):
//  - m-4: 이어 앉힌 창의 **가운데** 조각(벽 전체)이 OPENING_MIN(300)보다 짧으면 빠져 창 안에 벽 토막이 남고 무리의 폭 합이 그만큼 모자란다.
//  - m-5: 제품은 조각별 충돌 검사 **전에** 창 전체 폭으로 고른다 — 한 조각이 충돌로 빠져도 남은 조각은 창 전체의 제품(높이·sill)을 그대로 쓴다.
import { createItem } from '../../state/schema.js';
import { productById } from '../../products/catalog.js';
import { placeOnWall } from '../../geom/items.js';

export const DOOR_PRODUCTS = [['door-swing-900', 900], ['door-swing-1000', 1000], ['door-slide-1500', 1500], ['door-double-1800', 1800]];
// 외미닫이 문 기호(slideDoors.js · 2026-10-12 신상중 A-DOOR)가 앉는 미닫이문. 여닫이 목록(DOOR_PRODUCTS)과 따로 둔다.
export const SLIDE_PRODUCTS = [['door-slide-900', 900], ['door-slide-1500', 1500]];
export const WINDOW_PRODUCTS = [['window-fix-600', 600], ['window-slide-1200', 1200], ['window-slide-1800', 1800]];
export const OPENING_FALLBACK = 'opening-pass';
export const OPENING_MATCH_DIST = 900;     // 개구부 중심 → 벽 중심선 최대 거리(mm)
// 개구부가 벽 끝에서 둘 여유(mm · 리뷰 F1). 틈·호 개구부(fitOpening)는 늘, 블록 개구부(spanPieces)는 블록이 벽 끝에 닿거나 넘을 때만 둔다 —
// 벽 안에 든 블록 끝은 도면의 문설주 자리 그대로다(2026-10-12 · 계획 13 Task 6(b) · 최종 리뷰 M6-3).
export const OPENING_EDGE = 50;
export const OPENING_MIN = 300;            // 이보다 좁으면 개구부가 아니라 벽 토막이다(mm)
const GAP_SAME = 300;                      // 같은 개구부로 볼 벽 틈 중심 거리(mm)
const CATALOG_WIDTHS = [...new Set([...DOOR_PRODUCTS, ...WINDOW_PRODUCTS].map(e => e[1]))].sort((a, b) => a - b);

export const clamp01 = v => Math.max(0, Math.min(1, v));

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

// 블록 개구부의 제품: 여닫이는 폭이 가장 가까운 여닫이문, 포켓 미닫이는 **포켓 미닫이문**(2026-10-06 — 그 전에는 미닫이문 1500에 폭 900으로
// 앉아 명세서가 다른 제품을 말했다), 창은 900 미만 고정창 · 1500 이하 1200 미닫이창 · 그 위 1800 미닫이창(높이·sill이 그 제품 값이다).
// 폭은 제품 폭이 아니라 블록 폭으로 앉는다.
export function blockProduct(kind, width) {
  if (kind === 'pocket') return 'door-pocket-900';
  // slide: 역할표의 종류(2026-10-12 · 계획 12 Task 9)와 이름 `SLIDING-…`(같은 날 Task 3 리뷰 — 정규화 DXF의 외미닫이) → 폭이 가장 가까운 미닫이문.
  if (kind === 'slide') return nearestProduct(SLIDE_PRODUCTS, width);
  // pass: 문 없는 통로 블록(2026-10-12 · Task 3 리뷰 — 정규화 DXF의 PASS-폭-두께) → 통로, 폭은 블록 폭. 같은 자리의 벽 틈 통로는 뒤에서 충돌로 빠진다.
  if (kind === 'pass') return OPENING_FALLBACK;
  if (kind === 'window') return width < 900 ? 'window-fix-600' : width <= 1500 ? 'window-slide-1200' : 'window-slide-1800';
  return nearestProduct(DOOR_PRODUCTS.filter(([id]) => id !== 'door-slide-1500'), width);
}

// 목록에서 폭이 가장 가까운 제품 id(같으면 앞의 것). 실측 폭을 그대로 두고 제품 이름만 고르는 경로(블록 · 외미닫이 기호)가 쓴다 —
// productForWidth와 달리 20 % 문턱도 opening-pass 폴백도 없다.
export function nearestProduct(list, width) {
  return list.reduce((m, e) => (Math.abs(e[1] - width) < Math.abs(m[1] - width) ? e : m))[0];
}

// 블록 개구부 구간 [c0, c1](호스트 벽 a→b 축 mm)을 벽 조각들에 나눠 앉힐 자리 → [{ wall, width, t }](벽 축 차례 · 빈 배열 = 놓지 않는다).
// 2026-10-12 · 계획 12 Task 7 — 사동중 win-4800-3 둘째(T자 칸막이): 창 도중 x 1176986에 355 칸막이가 T자로 붙어 normalizeWalls가 외벽을
// 같은 끝점을 나눠 갖는 두 조각(a→p · p→b)으로 갈랐고, 창이 호스트 조각(2834) 안으로 잘려 2700만 앉았다. 구간이 벽 끝을 넘고 그 끝점을
// **같은 방향(호스트 축에서 2° 안)·호스트와 같은 두께(±tol)**의 벽이 공유하면 그 조각으로 잇는다(T자로 붙는 칸막이는 방향이 달라 잇지 않는다).
// 두께는 바로 앞 조각이 아니라 **호스트**와 잰다(2026-10-12 리뷰 m-2: 앞 조각과 재면 200 → 250 → 300이 사슬로 이어졌다).
//  - 공유 접점에서는 OPENING_EDGE를 면제한다 — 지키면 4000 창이 1950 + 1950이 된다. 바깥 끝은 블록이 벽 끝에 닿거나 넘을 때만 여유를 지키고(아래 edge ·
//    2026-10-12 최종 리뷰 M6-3), 넘치면 잘리지 않은 쪽(접점) 문설주를 제자리에 둔다.
//  - 그리기: 이 조각들은 접점에 딱 붙는 유일한 개구부다(다른 경로는 벽 끝에서 떨어진다 — 틈·호는 OPENING_EDGE, 블록은 벽 끝에 닿거나 넘을 때만 OPENING_EDGE이고
//    벽 안에 든 블록은 도면 자리). 두 렌더러(2D walls2d.wallRange · 3D build.js)는
//    같은 선으로 이어지는 벽의 접점에 딱 붙은 개구부가 있으면 그 접점을 공유하는 벽을 모두 늘리지 않는다(geom/walls.wallExtent · 2026-10-12 리뷰 M-1 후속)
//    — 두 조각의 구멍이 접점에서 맞닿아 이어지고(사동중 그 창: 보이는 유리 4390 → 4750) T자 칸막이는 외벽 중심선(유리 자리 · y −12204)에서 멈춘다.
//    그 전에는 접점마다 늘린 t/2 상자가 제 벽 개구부로만 잘려 벽 두께만 한 통높이 기둥(360 mm)이 섰고, 칸막이 끝이 외벽 겉면 2.5 mm 안까지 와 유리를 가로질렀다.
//  - 양 끝 조각이 OPENING_MIN 미만이면 버리고 남은 이웃의 그 끝을 벽 끝으로 다시 잰다(잇지 않던 지금의 자르기와 같다).
//  - 이웃이 없으면 결과는 예전 호스트 자르기와 똑같다(조각 하나). 문 블록은 부르는 쪽(openings.js)이 이웃을 주지 않는다(리뷰 m-3) —
//    포켓·미닫이도 문이다(2026-10-12 최종 리뷰 X-3 · M7-2: 나누면 포켓 둘 · 견적 두 배). 이어 앉히는 것은 창뿐이다.
const JOINT_COS = Math.cos(2 * Math.PI / 180);
const JOINT_EPS = 1;                       // 공유 끝점으로 볼 거리(mm) — normalizeWalls 뒤에는 정확히 같다
export function spanPieces(walls, host, c0, c1, tol) {
  const L = Math.hypot(host.b[0] - host.a[0], host.b[1] - host.a[1]);
  if (!L) return [];
  const d = [(host.b[0] - host.a[0]) / L, (host.b[1] - host.a[1]) / L];
  const s = p => (p[0] - host.a[0]) * d[0] + (p[1] - host.a[1]) * d[1];        // 호스트 축 좌표
  const span = w => { const sa = s(w.a), sb = s(w.b); return { wall: w, L: Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), sa, sign: sb >= sa ? 1 : -1, S: Math.min(sa, sb), E: Math.max(sa, sb) }; };
  const chain = [span(host)], used = new Set([host]);
  // J를 끝점으로 갖고, 호스트와 나란하며, J에서 바깥(out = −1: a 쪽 · +1: b 쪽)으로 뻗는, 호스트와 같은 두께의 벽.
  const next = (J, out) => (walls ?? []).find(w => {
    if (used.has(w) || Math.abs(w.thickness - host.thickness) > tol) return false;
    const atA = Math.hypot(w.a[0] - J[0], w.a[1] - J[1]) <= JOINT_EPS;
    if (!atA && Math.hypot(w.b[0] - J[0], w.b[1] - J[1]) > JOINT_EPS) return false;
    const far = atA ? w.b : w.a, v = [far[0] - J[0], far[1] - J[1]], l = Math.hypot(v[0], v[1]);
    return l > 0 && (v[0] * d[0] + v[1] * d[1]) * out >= l * JOINT_COS;
  });
  for (const out of [-1, 1]) {
    for (let cur = chain.at(out < 0 ? 0 : -1); out < 0 ? cur.S > c0 : cur.E < c1;) {
      const J = (cur.sign > 0) === (out < 0) ? cur.wall.a : cur.wall.b;
      const w = next(J, out);
      if (!w) break;
      used.add(w); cur = span(w);
      if (out < 0) chain.unshift(cur); else chain.push(cur);
    }
  }
  // 조각 하나: [r0, r1]을 [S + m0, E − m1] 안으로(호스트 하나뿐이면 예전 블록 경로의 자르기 그대로). 나뉜 조각(n > 1)은 바깥 끝에서
  // 잘려도 50 mm 단위로 내리지 않는다 — 접점 쪽 폭이 이미 실측(1966)이라 단위가 뜻이 없고, 내리면 무리의 폭 합이 여유 말고도 최대 49 mm
  // 더 모자란다(사동중 그 창: 호스트 조각의 바깥 끝이 외벽 꺾임(x 1174152)에 딱 붙어 [50, 2834] → 2784 · 내리면 2750이라 합 4716).
  const fit = (c, r0, r1, m0, m1, n) => {
    const u0 = Math.max(r0, c.S + m0), u1 = Math.min(r1, c.E - m1);
    const whole = u1 - u0 >= r1 - r0 - 1;
    const width = whole ? Math.round(r1 - r0) : n > 1 ? Math.round(u1 - u0) : Math.floor((u1 - u0) / 50) * 50;
    if (width < OPENING_MIN) return null;
    const mid = whole ? (r0 + r1) / 2 : r0 < c.S + m0 ? u1 - width / 2 : u0 + width / 2;
    return { wall: c.wall, width, t: (mid - c.sa) * c.sign / c.L };
  };
  // 바깥 끝 여유(OPENING_EDGE)는 블록이 그 벽 끝에 **닿거나 넘을**(1 mm 안까지 오면) 때만 둔다(2026-10-12 · 계획 13 Task 6(b) — 내곡중 SD1100_폭150:
  // 문틀이 곧 벽 조각이라 벽 1130 안에 문 1100이 양쪽 15 mm로 들어 있는데 여유로 1030까지 깎여 1000으로 앉았다). 벽 안에 든 끝은 도면의 문설주
  // 자리 그대로다. 끝에 닿은 블록(사동중 win-4800-3 둘째 — 꺾임에서 −0.13)은 예전처럼 여유 50을 지킨다.
  const edge = (r, end, out) => ((r - end) * out > -JOINT_EPS ? OPENING_EDGE : 0);
  for (let lo = 0, hi = chain.length - 1; ;) {
    const out = chain.slice(lo, hi + 1).map((c, i, a) => fit(c, i ? c.S : c0, i < a.length - 1 ? c.E : c1, i ? 0 : edge(c0, c.S, -1), i < a.length - 1 ? 0 : edge(c1, c.E, 1), a.length));
    if (lo < hi && !out[0]) lo++;
    else if (lo < hi && !out.at(-1)) hi--;
    else return out.filter(Boolean);       // 가운데 조각은 벽 전체다(그 벽이 OPENING_MIN보다 짧을 때만 빠진다)
  }
}

// 높이·sill은 **카탈로그 기본값 그대로**다 — 도면에 입면 정보가 전혀 없다. 폭만 실측으로 덮어쓴다.
// 제품마다 값이 다르다(사전 검토 I-9): 문 z 0 · h 2100 / `window-slide-*` z 900 · h 1200 /
// **`window-fix-600`은 z 1200 · h 600** / `opening-pass` z 0 · h 2100.
export function makeItem(id, width, wall, t) {
  const product = productById(id);
  if (!product) return null;
  const size = [width, product.size[1], product.size[2]];
  return createItem(product, { attach: 'wall', wallId: wall.id, t, side: 1, size, ...placeOnWall(wall, t, 1, size, { embed: true }) });
}
