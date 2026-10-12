// 외미닫이 문 기호 → 문 후보(2026-10-12 · 계획 12 Task 2). 신상중 A-DOOR 실측: 벽 면을 따라 미끄러지는 문은 블록도 스윙 호도
// 없이 두 선으로 그린다 —
//  ① 문짝: 열린(주차) 자리에 벽과 **나란히** 그린 점 둘 LWPOLYLINE(900·940·1000·1008·900). 벽 중심선에서 두께/2 + 0~20 mm —
//     벽 면선 위에 겹치거나 문틀 바깥 면에 붙는다. 벽과 수직인 "열린 여닫이 문짝"이 아니다(진단: 다섯 모두 0.0°).
//  ② 미닫이 화살표: 축선 491 mm + 67 mm 꺾쇠 둘(축선 뒤쪽과 63°) + SOLID 화살촉(전개가 SOLID를 버리므로 꺾쇠 선만 본다).
//     화살표는 일곱 개 모두 **개구부 앞**에 서서 문짝이 들어가는 쪽을 가리킨다 — 그래서 개구부는 문짝 끝에서 화살표가 선 쪽이다.
//     축선이 문짝 옆(벽 방향으로 겹침)에 서 있으면 어느 쪽인지 말해 주지 않으므로 그 문짝은 읽지 않는다(닫힌 자리에 그린 문짝 —
//     같은 기호의 주차 쪽 선이 대신 잡힌다).
// 개구부 = 문짝 끝에서 그쪽으로 이어지는, 벽 레이어 면선(중심선에서 두께/2 + FACE_PAD 안)이 없는 구간. 주차 쪽 벽이 문짝 끝보다
// 조금 앞에서 끝나면(문짝이 개구부에 100 mm 걸친다 — 실측 40·100 mm) 그 벽 끝에서 잰다. 폭 = min(문짝 길이, 빈 구간).
// 그 자리는 지금까지 창이 됐다: 문틀·레일 선(레이어 4·WID 1,700~2,000 — 개구부 + 주차 자리)을 windowSpans가 창 면선으로 읽었다.
// buildOpenings가 이 후보를 창보다 **먼저** 앉혀 같은 자리의 창 구간이 충돌로 비켜 간다.
// 이 파일도 워커가 import하므로 DOM·ui를 건드리지 않는다.
import { DXF_PARAMS } from './params.js';
import { blockKind } from './blockOpenings.js';

const PAR_COS = Math.cos(5 * Math.PI / 180);   // 나란함 ±5°
const ARROW_REACH = 300;   // 문짝 ↔ 화살표 축선 최대 거리(mm) — 실측 124~273
const ARM = [50, 100];     // 꺾쇠 한 팔 길이(mm) — 실측 67
const ARM_ANG = [20, 70];  // 꺾쇠 팔이 축선 뒤쪽과 이루는 각(°) — 실측 63.4
const APEX_TOL = 30;       // 꺾쇠 꼭짓점 ↔ 축선 끝(mm) — 실측 1·16(V 두 겹)
const FACE_IN = 50;        // 문짝이 벽 면 안쪽으로 들어와도 되는 거리(두께/2 − 이 값부터)
const FACE_PAD = 30;       // 벽 레이어 면선으로 셀 중심선 거리 = 두께/2 + 이 값
const COVER_MAX = 0.2;     // 문짝 길이만큼의 개구부 구간을 면선·벽 밖이 차지해도 되는 비율(빈 구간 ≥ 문짝의 80 %)

const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const unit = (a, b) => { const L = len(a, b); return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
const dot = (u, v) => u[0] * v[0] + u[1] * v[1];
const segDist = (p, a, b) => {
  const d = [b[0] - a[0], b[1] - a[1]], L2 = d[0] * d[0] + d[1] * d[1];
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - d[0] * t, p[1] - a[1] - d[1] * t);
};
const gap = (s, q) => Math.min(segDist(s.a, q.a, q.b), segDist(s.b, q.a, q.b), segDist(q.a, s.a, s.b), segDist(q.b, s.a, s.b));
// 벽 w(방향 d) 중심선에서 점까지의 거리.
const across = (w, d) => p => Math.abs((p[0] - w.a[0]) * -d[1] + (p[1] - w.a[1]) * d[0]);

// 축선 끝 end에 꺾쇠가 있는가: 같은 레이어의 짧은 선 둘이 end 곁(APEX_TOL)에서 시작해 축선 뒤쪽(back)으로 ARM_ANG만큼 벌어져
// 축선의 **양쪽**으로 뻗는다.
function headed(end, back, layer, arms) {
  let left = false, right = false;
  for (const c of arms) {
    if (c.layer !== layer) continue;
    const [p, q] = len(c.a, end) <= len(c.b, end) ? [c.a, c.b] : [c.b, c.a];
    if (len(p, end) > APEX_TOL) continue;
    const v = unit(p, q), ang = Math.acos(Math.max(-1, Math.min(1, dot(v, back)))) * 180 / Math.PI;
    if (ang < ARM_ANG[0] || ang > ARM_ANG[1]) continue;
    if (v[0] * back[1] - v[1] * back[0] > 0) left = true; else right = true;
  }
  return left && right;
}

// → [{ wall, t, width }] (앱 좌표 · mm). wallLayers가 비면 개구부(면선이 없는 구간)를 볼 수 없으므로 아무것도 내지 않는다.
export function slideDoors(ex, walls, openingLayers, toApp = p => p, P = DXF_PARAMS, wallLayers = new Set()) {
  if (!openingLayers?.size || !wallLayers?.size || !walls?.length) return [];
  const ins = ex?.inserts ?? [];
  // 창·문·포켓 블록 안의 선은 블록 경로(①)가 이미 앉혔다 — 거슬러 올라가 창·문 이름 INSERT가 하나라도 있으면 뺀다.
  const inOpenBlock = s => { for (let k = s.ins, n = 0; k != null && k >= 0 && n < 16; k = ins[k]?.parent, n++) if (blockKind(ins[k]?.name ?? '')) return true; return false; };
  const lines = (ex?.segs ?? []).filter(s => openingLayers.has(s.layer) && !s.src?.endsWith(':bulge') && !inOpenBlock(s))
    .map(s => ({ layer: s.layer, a: toApp(s.a), b: toApp(s.b) })).filter(s => len(s.a, s.b) > 0);
  const between = (s, [lo, hi]) => { const L = len(s.a, s.b); return L >= lo && L <= hi; };
  const arms = lines.filter(s => between(s, ARM));
  const arrows = [];
  for (const s of lines) {
    if (!between(s, P.slideArrowLen)) continue;
    const u = unit(s.a, s.b);
    if (headed(s.b, [-u[0], -u[1]], s.layer, arms) || headed(s.a, u, s.layer, arms)) arrows.push(s);
  }
  if (!arrows.length) return [];
  const faces = (ex?.segs ?? []).filter(s => wallLayers.has(s.layer) && !s.src?.endsWith(':bulge')).map(s => ({ a: toApp(s.a), b: toApp(s.b) }));
  const out = [];
  for (const leaf of lines) {
    if (!between(leaf, P.doorLeaf)) continue;
    const L = len(leaf.a, leaf.b), e = unit(leaf.a, leaf.b);
    // 화살표: 같은 레이어 · 나란함 · ARROW_REACH 안 · 축선 전체가 문짝 한쪽 끝 너머(그쪽이 개구부).
    let side = 0;
    for (const s of arrows) {
      if (s.layer !== leaf.layer || Math.abs(dot(unit(s.a, s.b), e)) < PAR_COS || gap(s, leaf) > ARROW_REACH) continue;
      const t0 = dot([s.a[0] - leaf.a[0], s.a[1] - leaf.a[1]], e), t1 = dot([s.b[0] - leaf.a[0], s.b[1] - leaf.a[1]], e);
      if (Math.max(t0, t1) < 0) side = -1; else if (Math.min(t0, t1) > L) side = 1;
      if (side) break;
    }
    if (!side) continue;
    // 화살표 쪽이 막혀 있으면 반대쪽을 본다(둘 다 막히면 건너뛴다).
    const hit = openingBeside(leaf, L, e, side, walls, faces, P) ?? openingBeside(leaf, L, e, -side, walls, faces, P);
    if (hit) out.push(hit);
  }
  return out;
}

// 문짝 끝(side 쪽)에서 벽을 따라 이어지는 빈 구간 → { wall, t, width } 또는 null.
function openingBeside(leaf, L, e, side, walls, faces, P) {
  const end = side > 0 ? leaf.b : leaf.a, dir = side > 0 ? e : [-e[0], -e[1]];
  let best = null;
  for (const w of walls) {
    const Lw = len(w.a, w.b);
    if (!Lw) continue;
    const d = unit(w.a, w.b);
    if (Math.abs(dot(d, e)) < PAR_COS) continue;
    const off = across(w, d), o0 = off(leaf.a), o1 = off(leaf.b), lo = w.thickness / 2 - FACE_IN, hi = w.thickness / 2 + P.slideOffset;
    if (o0 < lo || o0 > hi || o1 < lo || o1 > hi) continue;
    // 개구부가 시작되는 곳(문짝 끝에서 50 mm 그쪽)이 이 벽 위여야 한다 — 문짝이 두 벽 중심선의 이음매에 걸치면 개구부 쪽 벽을 고른다.
    const tw = p => dot([p[0] - w.a[0], p[1] - w.a[1]], d);
    const probe = tw([end[0] + dir[0] * 50, end[1] + dir[1] * 50]);
    if (probe < 0 || probe > Lw) continue;
    if (!best || o0 + o1 < best.o) best = { w, Lw, d, tw, o: o0 + o1 };
  }
  if (!best) return null;
  const { w, Lw, d, tw } = best;
  // x = 벽 위 좌표를 개구부 쪽이 + 가 되게 뒤집은 것. 벽 구간 [xs0, xs1].
  const sg = dot(dir, d) > 0 ? 1 : -1, X = p => sg * tw(p);
  const xs0 = Math.min(0, sg * Lw), xs1 = Math.max(0, sg * Lw), xe = X(end);
  // 벽 레이어 면선(나란함 · 중심선에서 두께/2 + FACE_PAD 안)이 덮는 구간을 합친다.
  const band = w.thickness / 2 + FACE_PAD, off = across(w, d), cov = [];
  for (const f of faces) {
    if (!len(f.a, f.b) || Math.abs(dot(unit(f.a, f.b), d)) < PAR_COS) continue;
    if (off(f.a) > band || off(f.b) > band) continue;
    const a = X(f.a), b = X(f.b);
    cov.push([Math.min(a, b), Math.max(a, b)]);
  }
  cov.sort((p, q) => p[0] - q[0]);
  const merged = [];
  for (const [a, b] of cov) { const m = merged[merged.length - 1]; if (m && a <= m[1]) m[1] = Math.max(m[1], b); else merged.push([a, b]); }
  // 주차 쪽 벽이 문짝 끝 앞(문짝의 개구부 쪽 절반 안)에서 끝나면 개구부는 그 벽 끝에서 시작한다.
  let under = -Infinity;
  for (const [, b] of merged) if (b >= xe - L / 2 && b <= xe) under = Math.max(under, b);
  const r0 = Math.max(under > -Infinity ? under : xe, xs0);
  // 빈 구간 [r0, r1): 다음 면선이 시작하거나 벽이 끝나는 곳까지. 문짝 길이만큼의 구간에서 면선·벽 밖이 COVER_MAX 넘게
  // 차지하면(= 빈 구간이 문짝의 1 − COVER_MAX보다 짧으면) 개구부가 아니다 — 중간의 짧은 면선 조각도 여기서 걸린다.
  let r1 = xs1;
  for (const [a, b] of merged) if (a <= r0 && b > r0) r1 = r0; else if (a > r0 && a < r1) r1 = a;
  const open = Math.min(L, r1 - r0);
  if (open < (1 - COVER_MAX) * L) return null;
  return { wall: w, t: sg * (r0 + open / 2) / Lw, width: Math.round(open / 50) * 50 };
}
