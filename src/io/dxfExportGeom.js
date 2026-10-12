// 정규화 DXF의 벽 도형(2026-10-12 · 계획 12 Task 3). 좌표는 전부 DXF(y 위 · mm)다. 왜 따로 계산하는가: 앱의 wallPolygon은
// 이어진 끝을 제 두께/2만큼 늘린 사각형이라 모서리에서 사각형끼리 **겹친다** — 그 네 변을 그대로 그리면 벽 몸통 안에 선이 들어가
// CAD 도면이 지저분하고, 가져오기(bands.js)가 겹친 선을 다른 벽의 면으로 볼 수 있다. 여기서는
//  ① 끝마다 이어진 (나란하지 않은) 이웃 벽의 **먼 면**까지 늘린 사다리꼴을 만들고(직각이면 이웃 두께/2 — 비스듬하면 면마다 따로 늘려
//     끝선이 이웃 면 위에 눕는다),
//  ② 사다리꼴의 변마다 다른 사다리꼴 **안쪽**에 든 구간과, 반대 방향으로 맞붙은 변(일직선 이음의 끝선)을 지워 합집합의 경계만 남기고,
//  ③ 통로 자리(opening-pass — 블록 종류가 없다)는 면선·중심선을 끊고 문설주 선을 그린다(가져오기의 벽 틈 경로가 같은 폭으로 다시 읽는다).
//     다만 가져오기가 그 틈을 그 폭으로 읽지 못하면(150 mm(minSeg) 미만 토막 · bridge 3000 넘는 폭 · gapMin 600 미만) 벽을 끊지 않는다 —
//     끊으면 통로뿐 아니라 벽까지 사라진다(2026-10-12 픽스처 동쪽 벽: 50·80 mm 토막 사이 통로 둘). 판정은 가져오기의 띠 스윕을 그대로 돌린다.
//  ④ 띠가 바뀌는 이음(두께·중심이 바뀌는 자리 · 꺾임 벽)은 dxfExportJoints.js가 가져오기의 구간 규칙이 읽는 꼴로 정한다.
// mergeCollinear가 같은 직선 위 조각(일직선으로 이어진 벽들의 면)을 한 선으로 잇는다 — 원 도면처럼 긴 면선이 된다.
import { pointInPolygon } from '../geom/rooms.js';
import { DXF_PARAMS } from './dxf/params.js';
import { buildFaces } from './dxf/faces.js';
import { wallBands, bandRuns, wallsOfRuns } from './dxf/bands.js';
import { growLinings } from './dxf/columns.js';
import { joints, clipJoints, remain, infoOf, endAt, farOf, binU, dot, sub, at, cross } from './dxfExportJoints.js';
import { WALL_LAYERS } from './dxfExportTemplate.js';

const EPS = 0.5;                                     // 경계 위로 볼 거리(mm) — 정수 mm 좌표의 반올림 여유
const SKEW = Math.sin(10 * Math.PI / 180);           // 이보다 나란한 이웃은 일직선 이음이다(늘리지 않는다)
const PAR = Math.sin(2 * Math.PI / 180);

// ⑤ 벽 레이어 두 색(WALL_LAYERS): 나란히 붙은 이웃 벽(축 방향으로 겹치고 띠 사이 틈이 bandGap 이하)은 다른 레이어에 둔다 — 가져오기는 레이어가
// 겹치지 않는 두 면선 사이 틈(≥ cavityMin)에서만 두 벽으로 가른다(bands.groupOffsets). 같은 띠로 일직선 이어진 벽들(한 줄)은 같은 색이다
// (가져오기의 면은 오프셋마다 하나라 한 줄의 면에 두 레이어가 섞이면 그 면은 어느 쪽과도 "겹치지 않는" 면이 아니다). 줄끼리 충돌을 BFS로 두 색칠한다.
function colourWalls(info, layers, P) {
  const par = info.map((_, i) => i), find = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  const bandOf = (s, n) => { const c = dot(s.a, n); return [c - s.h, c + s.h]; };
  for (let i = 0; i < info.length; i++) for (let j = i + 1; j < info.length; j++) {
    const s = info[i], o = info[j];
    if (Math.abs(cross(s.u, o.u)) > PAR || !(endAt(o, s.a) || endAt(o, s.b))) continue;
    const n = [-s.u[1], s.u[0]], [l1, h1] = bandOf(s, n), [l2, h2] = bandOf(o, n);
    if (Math.abs(l1 - l2) <= 1 && Math.abs(h1 - h2) <= 1) par[find(i)] = find(j);
  }
  const adj = new Map();
  for (let i = 0; i < info.length; i++) for (let j = i + 1; j < info.length; j++) {
    const s = info[i], o = info[j], ri = find(i), rj = find(j);
    if (ri === rj || Math.abs(cross(s.u, o.u)) > PAR) continue;
    const u = binU(s.u), n = [-u[1], u[0]], [l1, h1] = bandOf(s, n), [l2, h2] = bandOf(o, n);
    const gap = Math.max(l2 - h1, l1 - h2);
    const t = x => [Math.min(dot(x.a, u), dot(x.b, u)), Math.max(dot(x.a, u), dot(x.b, u))], [a0, a1] = t(s), [b0, b1] = t(o);
    if (gap < 0 || gap > P.bandGap || Math.min(a1, b1) - Math.max(a0, b0) <= 0) continue;
    (adj.get(ri) ?? adj.set(ri, new Set()).get(ri)).add(rj);
    (adj.get(rj) ?? adj.set(rj, new Set()).get(rj)).add(ri);
  }
  const colour = new Map();
  for (const start of adj.keys()) {
    if (colour.has(start)) continue;
    colour.set(start, 0);
    for (const queue = [start]; queue.length;) {
      const r = queue.shift();
      for (const x of adj.get(r)) if (!colour.has(x)) { colour.set(x, 1 - colour.get(r)); queue.push(x); }
    }
  }
  info.forEach((s, i) => { s.layer = layers[colour.get(find(i)) ?? 0]; });
}

// 벽 → quad: [a+, b+, b−, a−]. 끝 p의 늘림은 면(σ = ±1)마다: 이웃 o의 법선 m을 바깥쪽(out·m > 0)으로 두면
// 면선 p + e·out + σ·h·n이 o의 먼 면(m 방향 h_o)에 닿는 e = (h_o − σ·h·(n·m)) / (out·m). 직각이면 h_o. fix가 있는 끝은 그 값이다(④).
function quads(info) {
  for (const s of info) {
    const ends = {};
    for (const end of ['a', 'b']) {
      const p = s[end], out = end === 'b' ? s.u : [-s.u[0], -s.u[1]], e = { 1: 0, [-1]: 0 };
      if (s.fix[end] != null) e[1] = e[-1] = s.fix[end];
      else for (const o of info) {
        if (o === s || !endAt(o, p)) continue;
        const v = sub(farOf(o, endAt(o, p)), p), lv = Math.hypot(v[0], v[1]);
        if (!lv || Math.abs(cross(out, v)) / lv < SKEW) continue;
        let m = o.n, dm = dot(out, m);
        if (dm < 0) { m = [-m[0], -m[1]]; dm = -dm; }
        for (const sg of [1, -1]) e[sg] = Math.max(e[sg], Math.min(4 * (o.h + s.h), Math.max(0, (o.h - sg * s.h * dot(s.n, m)) / dm)));
      }
      ends[end] = [at(at(p, out, e[1]), s.n, s.h), at(at(p, out, e[-1]), s.n, -s.h)];
      s[`e${end}`] = s.fix[end] ?? 0;
    }
    s.quad = [ends.a[0], ends.b[0], ends.b[1], ends.a[1]];
    const xs = s.quad.map(q => q[0]), ys = s.quad.map(q => q[1]);
    s.box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    // 안쪽 법선(볼록 사다리꼴 — 넓이 부호로 방향을 잡는다).
    let A = 0;
    for (let k = 0; k < 4; k++) { const p = s.quad[k], q = s.quad[(k + 1) % 4]; A += p[0] * q[1] - q[0] * p[1]; }
    s.inward = s.quad.map((p, k) => { const q = s.quad[(k + 1) % 4], d = sub(q, p), l = Math.hypot(d[0], d[1]) || 1; return A > 0 ? [-d[1] / l, d[0] / l] : [d[1] / l, -d[0] / l]; });
  }
}

// 선분 P→R 가운데 사다리꼴 o의 안쪽에 든 구간 [t0, t1](Cyrus–Beck) — 구간 가운데가 경계에서 EPS보다 깊을 때만(경계 위 선은 남긴다).
function insideSpan(P, R, o) {
  let lo = 0, hi = 1;
  const D = sub(R, P);
  for (let k = 0; k < 4; k++) {
    const f0 = dot(sub(P, o.quad[k]), o.inward[k]), df = dot(D, o.inward[k]);
    if (Math.abs(df) < 1e-12) { if (f0 < 0) return null; continue; }
    const t = -f0 / df;
    if (df > 0) lo = Math.max(lo, t); else hi = Math.min(hi, t);
  }
  if (hi - lo < 1e-9) return null;
  const mid = at(P, D, (lo + hi) / 2);
  for (let k = 0; k < 4; k++) if (dot(sub(mid, o.quad[k]), o.inward[k]) <= EPS) return null;
  return [lo, hi];
}

// 기둥 마감선 오라클(2026-10-12 · Task 3 리뷰 M-1): 가져오기의 columns.growLinings가 이 선 하나로 어느 기둥을 키우는가. 중심선·가운데 run 선은
// 원 도면에 없던 새 선이라, 기둥 면 밖 150 mm 안에 놓이면 기둥이 왕복마다 커졌다(사동중 790×855 → 971 → 1086 · 내곡중 660 → 755 → 851).
// cols: 가져오기 꼴 { c, u, w, h }(DXF 좌표).
export const liningOracle = cols => ([a, b]) => cols.some(c => {
  const g = growLinings([c], [{ a, b }])[0];
  return Math.abs(g.w - c.w) > 0.5 || Math.abs(g.h - c.h) > 0.5;
});

// 한 번 그리기: info(사다리꼴이 선 벽들) · js(이음) · gaps(벽 → 통로 구간들) → 이어 붙인 면선·중심선·문설주.
// 중심선은 **bandGap(520)보다 두꺼운 벽만** 긋는다(사전 검토 3의 뜻 — 그보다 얇은 벽은 두 면선만으로 띠가 선다). 그리고 그 중심선도
// 기둥 마감선으로 먹히는 조각은 버린다(lining).
function draw(all, info, js, gaps, lining = () => false) {
  const faces = [], centers = [], jambs = [];
  for (const s of info) {
    const own = gaps.get(s) ?? [];
    for (let k = 0; k < 4; k++) {
      const P = s.quad[k], R = s.quad[(k + 1) % 4], D = sub(R, P), L2 = dot(D, D);
      if (L2 < 1) continue;
      const outN = [-s.inward[k][0], -s.inward[k][1]], cuts = [];
      for (const o of info) {
        if (o === s || o.box[0] > s.box[2] + 1 || o.box[2] < s.box[0] - 1 || o.box[1] > s.box[3] + 1 || o.box[3] < s.box[1] - 1) continue;
        const iv = insideSpan(P, R, o);
        if (iv) cuts.push(iv);
        // 반대 방향으로 맞붙은 변(일직선 이음의 두 끝선) — 겹친 만큼은 합집합 안쪽이다.
        for (let j = 0; j < 4; j++) {
          const F0 = o.quad[j], F1 = o.quad[(j + 1) % 4];
          if (dot(outN, o.inward[j]) < 0.9999 || Math.abs(dot(sub(F0, P), outN)) > EPS) continue;
          const t0 = dot(sub(F0, P), D) / L2, t1 = dot(sub(F1, P), D) / L2;
          const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(1, Math.max(t0, t1));
          if (hi > lo) cuts.push([lo, hi]);
        }
      }
      // 통로: 면선(벽과 나란한 변 — k 0·2)만 그 구간을 끊는다.
      if (k % 2 === 0) for (const [c0, c1] of own) {
        const sP = dot(sub(P, s.a), s.u), sR = dot(sub(R, s.a), s.u);
        if (Math.abs(sR - sP) < 1e-9) continue;
        const t0 = (c0 - sP) / (sR - sP), t1 = (c1 - sP) / (sR - sP);
        cuts.push([Math.max(0, Math.min(t0, t1)), Math.min(1, Math.max(t0, t1))]);
      }
      for (const [t0, t1] of remain(cuts)) if ((t1 - t0) * Math.sqrt(L2) >= 1) faces.push([at(P, D, t0), at(P, D, t1), s.layer]);
    }
    // 중심선: a→b(벽 축 s0..s1). 이음에서 끊은 끝(fix < 0)은 그만큼 짧게, 통로 자리는 끊는다.
    const s0 = Math.max(0, -s.ea), s1 = s.L - Math.max(0, -s.eb), span = s1 - s0;
    if (span >= 1 && s.w.t > DXF_PARAMS.bandGap) {
      const cuts = own.map(([c0, c1]) => [Math.max(0, (c0 - s0) / span), Math.min(1, (c1 - s0) / span)]).filter(([x, y]) => y > x);
      for (const [t0, t1] of remain(cuts)) if ((t1 - t0) * span >= 1) centers.push([at(s.a, s.u, s0 + t0 * span), at(s.a, s.u, s0 + t1 * span), s.layer]);
    }
    for (const [c0, c1] of own) for (const c of [c0, c1]) { const m = at(s.a, s.u, c); jambs.push([at(m, s.n, s.h), at(m, s.n, -s.h), s.layer]); }
  }
  for (const J of all.filter(s => s.jog && s.w.t > DXF_PARAMS.bandGap)) centers.push([J.a, J.b, WALL_LAYERS[0]]);
  const extra = js.filter(j => j.extra).map(j => [...j.extra, (j.thinA ? j.a : j.b).layer]);
  const f = clipJoints(faces, js), c = [...clipJoints(centers, js).filter(seg => !lining(seg)), ...extra];
  oneLayerPerLine([...f, ...c, ...jambs], DXF_PARAMS);
  return { faces: mergeCollinear(f), centers: mergeCollinear(c), jambs };
}

// 가져오기의 면은 bin마다 **오프셋**(offTol 6 안)으로 묶여 그 위 모든 조각의 레이어를 함께 갖는다(faces.buildFaces). 한 오프셋에 두 벽 레이어가
// 섞이면(옆 벽의 끝선이 이웃 벽 면 위에 눕는다) 그 면은 어느 쪽과도 "레이어가 겹치지 않는" 면이 아니어서 벽 사이 틈 규칙이 무너진다 —
// 같은 방향·같은 오프셋의 선들은 길이가 가장 긴 레이어 하나로 맞춘다(segs의 세 번째 값을 고친다).
function oneLayerPerLine(segs, P) {
  const rows = segs.map(s => {
    const L = Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]), d = binU(sub(s[1], s[0])), u = [d[0] / (L || 1), d[1] / (L || 1)];
    return { s, L, key: Math.round(Math.atan2(u[1], u[0]) / (P.angTol * Math.PI / 180)), off: dot(s[0], [-u[1], u[0]]) };
  }).filter(r => r.L > 0).sort((x, y) => x.key - y.key || x.off - y.off);
  for (let i = 0; i < rows.length;) {
    let j = i + 1;
    while (j < rows.length && rows[j].key === rows[i].key && rows[j].off - rows[j - 1].off <= P.offTol) j++;
    const len = new Map();
    for (const r of rows.slice(i, j)) len.set(r.s[2], (len.get(r.s[2]) ?? 0) + r.L);
    const top = [...len].sort((x, y) => y[1] - x[1])[0][0];
    for (const r of rows.slice(i, j)) r.s[2] = top;
    i = j;
  }
}

// 가져오기가 통로 g(벽 s의 축 구간 [c0, c1])를 **그 자리·그 폭**(PASS_TOL 안)의 벽 틈으로 읽는가 — 그 벽 bin의 벽 선(minSeg 이상)만 모아
// 가져오기의 띠 스윕(faces.buildFaces → bands.wallBands → bandRuns → wallsOfRuns)을 그대로 돌려 본다. 문·창 근거는 있다고 본다(통로 X 표시).
// 허용이 넓으면(±50) 왕복마다 통로가 밀린다: 통로와 벽 끝 사이 50 mm 토막이 안 보여 틈이 벽 끝까지 읽히고, 가져오기가 벽 끝 여유(50)만큼
// 통로를 당겨 앉힌다(2026-10-12 픽스처 850 → 900 → 950). 그래서 거의 같을 때만 끊는다.
const PASS_TOL = 10;
function passReadable(s, [c0, c1], lines, P = DXF_PARAMS) {
  if (c1 - c0 < P.gapMin || c1 - c0 > P.bridge) return false;
  const u = binU(s.u), n = [-u[1], u[0]], cOff = dot(s.a, n);
  const tc = dot(at(s.a, s.u, (c0 + c1) / 2), u), reach = P.bridge + 2 * (c1 - c0);
  const segs = lines.filter(([p, q]) => {
    const d = sub(q, p), L = Math.hypot(d[0], d[1]);
    return L >= P.minSeg && Math.abs(cross(d, u)) <= 1e-6 * L && Math.abs(dot(p, n) - cOff) <= s.h + P.bandGap &&
      Math.max(dot(p, u), dot(q, u)) >= tc - reach && Math.min(dot(p, u), dot(q, u)) <= tc + reach;
  }).map(([a, b, layer]) => ({ a, b, layer }));
  const { gaps } = wallsOfRuns(bandRuns(wallBands(buildFaces(segs, P), P), P), P, () => true);
  return gaps.some(g => Math.abs(g.t - tc) <= PASS_TOL && Math.abs(g.width - (c1 - c0)) <= PASS_TOL);
}

// walls: DXF 좌표의 몸통 있는 벽({ id, a, b, t }). passes: [{ wall, c, width }](통로 — 벽 선을 끊는다). columns: 가져오기 꼴 기둥(마감선 오라클).
// → { faces, centers, jambs: [[a, b, layer]] · skipped: 벽을 끊지 않은 통로들 }.
export function wallOutline(walls, passes = [], { columns = [] } = {}) {
  const all = walls.map(infoOf);
  const lining = columns.length ? liningOracle(columns) : () => false;
  const js = joints(all, DXF_PARAMS, lining);
  const info = all.filter(s => !s.jog);
  colourWalls(info, WALL_LAYERS, DXF_PARAMS);
  quads(info);
  const spans = passes.map(g => {
    const s = info.find(x => x.w === g.wall);
    if (!s) return null;
    const c = dot(sub(g.c, s.a), s.u), half = g.width / 2;
    return { g, s, iv: [c - half, c + half] };
  }).filter(Boolean);
  const gapsOf = list => { const m = new Map(); for (const { s, iv } of list) (m.get(s) ?? m.set(s, []).get(s)).push(iv); return m; };
  let res = draw(all, info, js, gapsOf(spans), lining);
  const lines = [...res.faces, ...res.centers];
  const bad = spans.filter(x => !passReadable(x.s, x.iv, lines));
  if (bad.length) res = draw(all, info, js, gapsOf(spans.filter(x => !bad.includes(x))), lining);
  return { ...res, skipped: bad.map(x => x.g) };
}

// 같은 직선·같은 레이어 위 선분을 잇는다(겹치거나 EPS 안에서 맞닿은 것). 방향을 한쪽(+x, 수직이면 +y)으로 모아 각도·법선 거리로 무리 짓는다.
// segs: [[a, b, layer?]] → [[a, b, layer]].
export function mergeCollinear(segs) {
  const rows = [];
  for (const [a, b, layer = WALL_LAYERS[0]] of segs) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    const d = binU(sub(b, a)), u = [d[0] / L, d[1] / L], n = [-u[1], u[0]], s0 = dot(a, u), s1 = dot(b, u);
    rows.push({ layer, key: Math.round(Math.atan2(u[1], u[0]) * 1e6), u, n, rho: dot(a, n), s0: Math.min(s0, s1), s1: Math.max(s0, s1) });
  }
  rows.sort((x, y) => (x.layer < y.layer ? -1 : x.layer > y.layer ? 1 : 0) || x.key - y.key || x.rho - y.rho);
  const out = [];
  for (let i = 0; i < rows.length;) {
    const g = rows[i];
    let j = i;
    while (j < rows.length && rows[j].layer === g.layer && rows[j].key === g.key && rows[j].rho - g.rho < EPS) j++;
    const iv = rows.slice(i, j).map(r => [r.s0, r.s1]).sort((x, y) => x[0] - y[0]);
    let [lo, hi] = iv[0];
    const base = at([0, 0], g.n, g.rho), emit = () => out.push([at(base, g.u, lo), at(base, g.u, hi), g.layer]);
    for (const [a, b] of iv.slice(1)) { if (a <= hi + EPS) hi = Math.max(hi, b); else { emit(); lo = a; hi = b; } }
    emit();
    i = j;
  }
  return out;
}

// 다각형 안에서 변들로부터 가장 먼 점(격자로 찾고 두 번 좁힌다) — 실명·면적 글자가 방 안에 들게 한다(ㄱ자 방은 꼭짓점 평균이 밖일 수 있다).
export function interiorPoint(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const depth = p => {
    let m = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], d = sub(b, a), l2 = dot(d, d);
      const t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / l2)) : 0;
      m = Math.min(m, Math.hypot(p[0] - a[0] - d[0] * t, p[1] - a[1] - d[1] * t));
    }
    return m;
  };
  let best = null;
  const tryAt = p => { if (pointInPolygon(p, pts)) { const d = depth(p); if (!best || d > best.d) best = { p, d }; } };
  tryAt([xs.reduce((s, v) => s + v, 0) / xs.length, ys.reduce((s, v) => s + v, 0) / ys.length]);
  for (let round = 0, N = 16; round < 3; round++, N = 8) {
    const sx = (x1 - x0) / N, sy = (y1 - y0) / N;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) tryAt([x0 + sx * i, y0 + sy * j]);
    if (!best) break;
    [x0, x1, y0, y1] = [best.p[0] - sx, best.p[0] + sx, best.p[1] - sy, best.p[1] + sy];
  }
  return best ? best.p.map(v => Math.round(v)) : pts[0];
}
