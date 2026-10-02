// 면선 → 벽 띠 → 벽(§18.3 개정 · 2026-09-29 정확도 수정). 좌표계는 **DXF 그대로**다(mm · y 위쪽) —
// 앱 좌표로 옮기는 것은 toProject.js가 한다.
//
// 옛 파이프라인(면선 쌍 탐욕 매칭 → 5.2 m 면선 잇기 → 250 mm 무게중심 스냅 → 연장 → 다리)을 버렸다.
// 실파일에서 쌍 짓기는 여러 겹으로 그린 벽 하나에 평행 중심선을 2~4개 냈고(몸통이 겹치는 쌍 22개),
// 면선 잇기는 기둥 면끼리 이어 없는 벽(지지율 20 % 미만 143 m)을 세웠으며, 스냅이 그 끝점들을 한 점으로
// 모아 벽 31개를 최대 227 mm 기울이고 1 m² 미만 조각 방 23개를 만들었다. 지금은
//  ① bands.js가 **그 자리에 함께 있는 면선 무리**로 벽 띠를 세우고(기둥은 먼저 뺀다),
//  ② 같은 띠끼리만 틈을 이으며(문·창),
//  ③ joinEnds가 끝점을 **자기 축 위에서만** 늘이거나 줄인다 — 벽 선이 옆으로 움직이는 단계가 없다.
import { absorbLinings } from './linings.js';
import { DXF_PARAMS } from './params.js';
import { largestCluster, ROI_LINK, buildFaces, latticeFaces } from './faces.js';
import { wallBands, bandRuns, wallsOfRuns } from './bands.js';
import { findColumns, findPilasters, mergeColumns, growLinings, findIslands } from './columns.js';
import { openingEvidence, faceSupport } from './evidence.js';
import { OPEN_BLOCK } from './blockOpenings.js';

const OPEN_FACE = 'open-block';   // 창·문 블록에서 온 면선의 표지 레이어(실제 레이어 이름과 겹치지 않는다)

const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const FALLBACK_MIN_SEG = 300;   // §18.3 폴백: 레이어 필터를 뺀 경로의 최소 선분 길이
const FALLBACK_MODES = 6;       // 폴백에서 남길 우세 두께 계급 수(5 mm 계급 · 길이 가중)

// 매달린 끝마다 **자기 방향 직선**이 다른 벽 중심선과 만나는 점으로 연장(≤ extend)하거나 되당긴다
// (≤ 상대 두께/2 + 내 두께 + joinMargin — 살짝 지나친 끝). 받는 조건: 교점이 상대 벽 몸통 안(양끝 ± 내 두께/2 +
// joinMargin)이고, 되당겨도 벽이 minWall 이상 남는다(리뷰 F2 — 두 바 사이 가벽을 지우지 않는다).
// 교점이 상대 벽 끝 밖이면(L 모서리) 상대 끝도 매달려 있을 때만 그 점까지 함께 늘인다.
// 가장 가까운 교점이 이긴다. 끝이 옮겨 가는 점은 늘 자기 직선 위다 — 벽이 기울 수 없다.
// 늘이는 길의 제약(2026-09-30 실파일):
//  - 평행한 다른 벽의 몸통 안을 절반 넘게 지나지 않는다(405 벽 안의 100 모서리 띠가 3.9 m 늘어 벽이 겹쳤다).
//  - bareReach보다 멀면 evidence(p, q, 두께)가 참이어야 한다 — 길(내 끝 → 상대 벽 면)에 문·창 근거가 있다(날개벽이
//    빈 바닥 3.1 m를 건너 방을 가르고, 현관 벽이 2.8 m를 건넜다). evidence가 없으면(근거를 볼 수 없는 도면) 제약도 없다.
export function joinEnds(list, P = DXF_PARAMS, evidence = null) {
  const out = list.map(w => ({ ...w, a: [...w.a], b: [...w.b] }));
  const key = p => `${Math.round(p[0])},${Math.round(p[1])}`;
  for (let pass = 0; pass < P.passes; pass++) {
    const deg = new Map();
    for (const w of out) for (const p of [w.a, w.b]) deg.set(key(p), (deg.get(key(p)) ?? 0) + 1);
    let moved = false;
    for (const w of out) for (const end of ['a', 'b']) {
      const p = w[end];
      if ((deg.get(key(p)) ?? 0) > 1) continue;
      const o = end === 'a' ? w.b : w.a, L0 = len(p, o);
      if (!L0) continue;
      const dir = [(p[0] - o[0]) / L0, (p[1] - o[1]) / L0];
      let best = null;
      for (const v of out) {
        if (v === w) continue;
        const e = [v.b[0] - v.a[0], v.b[1] - v.a[1]], Lv = Math.hypot(e[0], e[1]);
        if (!Lv) continue;
        const den = dir[0] * e[1] - dir[1] * e[0];
        if (Math.abs(den) < 1e-6 * Lv) continue;                      // 평행
        const s = ((v.a[0] - p[0]) * e[1] - (v.a[1] - p[1]) * e[0]) / den;
        if (s < -(v.thickness / 2 + w.thickness + P.joinMargin) || s > P.extend) continue;
        if (s < 0 && L0 + s < P.minWall) continue;
        const q = [p[0] + dir[0] * s, p[1] + dir[1] * s];
        const t = ((q[0] - v.a[0]) * e[0] + (q[1] - v.a[1]) * e[1]) / (Lv * Lv);
        const marg = (w.thickness / 2 + P.joinMargin) / Lv;
        if (t < -marg || t > 1 + marg) continue;                      // 상대 벽 몸통 밖이면 접합이 아니다
        const tip = t < 0 ? 'a' : t > 1 ? 'b' : null;
        if (tip && (deg.get(key(v[tip])) ?? 0) > 1) continue;         // 이미 이어진 상대 끝은 끌지 않는다
        if (best && Math.abs(s) >= best.cost) continue;
        if (s > 0 && insideParallel(out, w, p, dir, s) > s / 2) continue;
        if (evidence && s > P.bareReach) {
          const f = Math.max(0, s - v.thickness / 2);
          if (!evidence(p, [p[0] + dir[0] * f, p[1] + dir[1] * f], w.thickness)) continue;
        }
        best = { cost: Math.abs(s), q, v, tip };
      }
      if (!best || best.cost < 1e-9) continue;
      w[end] = [...best.q];
      if (best.tip) best.v[best.tip] = [...best.q];
      moved = true;
    }
    if (!moved) break;
  }
  return out;
}

// 길 p → p + dir·s 가운데 **평행한 다른 벽의 몸통 안**(길의 선이 그 벽 두께 안)에 든 길이.
function insideParallel(list, self, p, dir, s) {
  let cov = 0;
  for (const v of list) {
    if (v === self) continue;
    const e = [v.b[0] - v.a[0], v.b[1] - v.a[1]], Lv = Math.hypot(e[0], e[1]);
    if (!Lv || Math.abs(dir[0] * e[1] - dir[1] * e[0]) / Lv > 0.035) continue;      // 2° 안으로 평행한 것만
    if (Math.abs((p[0] - v.a[0]) * e[1] - (p[1] - v.a[1]) * e[0]) / Lv > v.thickness / 2) continue;
    const t0 = (v.a[0] - p[0]) * dir[0] + (v.a[1] - p[1]) * dir[1], t1 = (v.b[0] - p[0]) * dir[0] + (v.b[1] - p[1]) * dir[1];
    cov += Math.max(0, Math.min(s, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1)));
  }
  return cov;
}

// 가지 치기: 한 끝만 다른 벽에 닿고(끝점 공유 또는 T자로 몸통 위) 다른 끝이 매달린 spur 미만 토막을
// 지운다. 벽기둥 윤곽·문틀 면이 남긴 가지는 방을 둘러싸지 못하면서, 옆 벽 끝을 먼저 붙잡아 그 끝이
// 진짜 벽까지 늘어나지 못하게 막는다 — 지운 뒤 joinEnds를 한 번 더 돌리면 그 끝이 제자리를 찾는다.
export function pruneSpurs(list, P = DXF_PARAMS) {
  const key = p => `${Math.round(p[0])},${Math.round(p[1])}`;
  let cur = list;
  for (let pass = 0; pass < P.passes; pass++) {
    const deg = new Map();
    for (const w of cur) for (const p of [w.a, w.b]) deg.set(key(p), (deg.get(key(p)) ?? 0) + 1);
    const onBody = (p, self) => cur.some(v => v !== self && distToSeg(p, v.a, v.b) < 1);
    const attached = (p, self) => (deg.get(key(p)) ?? 0) > 1 || onBody(p, self);
    const next = cur.filter(w => !(len(w.a, w.b) < P.spur && attached(w.a, w) !== attached(w.b, w)));
    if (next.length === cur.length) break;
    cur = next;
  }
  return cur;
}

const distToSeg = (p, a, b) => {
  const d = [b[0] - a[0], b[1] - a[1]], L2 = d[0] * d[0] + d[1] * d[1];
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - d[0] * t, p[1] - a[1] - d[1] * t);
};

// 벽 네트워크의 작은 고립 덩어리를 버린다. normalizeWalls가 T접합을 쪼갠 **뒤에** 부른다
// (그래야 끝점이 실제로 공유된다 — toProject.js가 그 순서를 지킨다).
// link(w): 벽 w가 닿은 기둥들의 표지(없으면 빈 배열). 같은 기둥에 닿은 벽들은 그 기둥을 거쳐 이어진 것으로 본다.
export function dropTinyComponents(list, minWalls = DXF_PARAMS.minComp, minLen = Infinity, link = null) {
  const key = p => `${Math.round(p[0])},${Math.round(p[1])}`;
  const par = new Map();
  const find = x => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
  for (const w of list) for (const p of [w.a, w.b]) if (!par.has(key(p))) par.set(key(p), key(p));
  for (const w of list) { const a = find(key(w.a)), b = find(key(w.b)); if (a !== b) par.set(a, b); }
  if (link) for (const w of list) for (const c of link(w)) {
    const ck = `col:${c}`;
    if (!par.has(ck)) par.set(ck, ck);
    const a = find(key(w.a)), b = find(ck);
    if (a !== b) par.set(a, b);
  }
  const cnt = new Map(), total = new Map();
  for (const w of list) { const r = find(key(w.a)); cnt.set(r, (cnt.get(r) ?? 0) + 1); total.set(r, (total.get(r) ?? 0) + len(w.a, w.b)); }
  // 벽 수가 적어도 길면 남긴다(minLen) — 기둥에 가로막혀 본 네트워크와 떨어진 실제 벽이다.
  return list.filter(w => { const r = find(key(w.a)); return (cnt.get(r) ?? 0) >= minWalls || (total.get(r) ?? 0) >= minLen; });
}

// 두께 분포(5 mm 계급 · 길이 가중, 큰 것부터) — 검토 화면의 분포 줄과 폴백의 우세 두께가 쓴다.
const thicknessHist = runs => {
  const h = new Map();
  for (const r of runs) { const k = Math.round((r.hi - r.lo) / 5) * 5; h.set(k, (h.get(k) ?? 0) + (r.t1 - r.t0)); }
  return [...h].sort((a, b) => b[1] - a[1]);
};

// 2~10단계를 한 줄로. 결과 좌표는 DXF 그대로다.
// roi: 도면 후보(regions.planRegions) 하나. 안 주면 가장 큰 덩어리다.
export function extractWalls(ex, { wallLayers = new Set(), openFaceLayers = new Set(), liveLayers = null, params: P = DXF_PARAMS, thickness = DXF_PARAMS.thickness, roi: picked = null } = {}) {
  const live = liveLayers ? ex.segs.filter(s => liveLayers.has(s.layer)) : ex.segs;
  const roi = picked ?? largestCluster(live, ROI_LINK);   // 연결성 기반(C-7)
  const inRoi = p => !roi || (p[0] >= roi.x0 && p[0] <= roi.x1 && p[1] >= roi.y0 && p[1] <= roi.y1);
  const usable = s => inRoi(s.a) && inRoi(s.b) && !s.src?.endsWith(':bulge');   // 조경 곡선·라운드 코너는 벽이 아니다
  // 벽 레이어에 놓인 창·문 이름 블록(2026-10-02 내곡중: 미서기단창_7800)의 선은 벽 선이 아니라 **개구부 면선**이다 —
  // 개구부 레이어의 선과 같이 긴 것(≥ openFaceMin)만 쓰고, 표지 레이어 OPEN_FACE를 달아 창틀 띠(op)로 다룬다.
  const inOpenBlock = s => wallLayers.has(s.layer) && OPEN_BLOCK.test(s.block ?? '');
  const openLayers = new Set([...openFaceLayers, OPEN_FACE]);
  let cand = ex.segs.filter(s => usable(s) && (inOpenBlock(s) || openFaceLayers.has(s.layer)
    ? len(s.a, s.b) >= P.openFaceMin : wallLayers.has(s.layer) && len(s.a, s.b) >= P.minSeg))
    .map(s => (inOpenBlock(s) ? { ...s, layer: OPEN_FACE } : s));
  // 폴백(§18.3): 벽 후보가 0개인 도면은 레이어 필터를 빼고 길이 ≥ 300 mm인 모든 선분으로 돈다.
  let guessed = false;
  if (!cand.length) {
    guessed = true;
    cand = live.filter(s => usable(s) && len(s.a, s.b) >= FALLBACK_MIN_SEG);
  }
  const rects = findColumns(cand, P);
  const colSegs = new Set(rects.flatMap(c => c.segs));
  // 주 평면 블록: 벽 레이어 선 길이가 가장 많은 블록. 그 blockShare 미만인 블록의 벽 레이어 선은 기호다
  // (실파일: 도면에 그린 트럭 "탑차"가 벽 6개가 됐다). 기호 블록의 선은 기둥 찾기에만 쓴다.
  const wallish = s => guessed || wallLayers.has(s.layer);
  const byBlock = new Map();
  for (const s of cand) if (wallish(s)) byBlock.set(s.block, (byBlock.get(s.block) ?? 0) + len(s.a, s.b));
  const major = Math.max(0, ...byBlock.values());
  const symbol = s => wallish(s) && (byBlock.get(s.block) ?? 0) < P.blockShare * major;
  // 홀로 선 가늘고 긴 닫힌 사각형(트렌치·작업대)은 벽 재료가 아니다. 닿는지는 후보에서 빠진 짧은 벽·창틀 선까지 본다.
  const inCand = new Set(cand);
  const shorts = guessed ? [] : ex.segs.filter(s => usable(s) && !inCand.has(s) && (wallLayers.has(s.layer) || openFaceLayers.has(s.layer)) && !(inOpenBlock(s) && len(s.a, s.b) >= P.openFaceMin));
  const islandSegs = new Set(findIslands(cand, colSegs, P, shorts).flatMap(c => c.segs));
  // 규칙 간격 선 무리(계단 디딤판·해치)는 벽 재료가 아니다.
  const drawn = buildFaces(cand.filter((s, i) => !colSegs.has(i) && !islandSegs.has(i) && !symbol(s)), P);
  const lattice = latticeFaces(drawn, P);
  const faces = lattice.size ? drawn.filter(f => !lattice.has(f)) : drawn;
  const byKey = new Map();
  for (const f of faces) (byKey.get(f.key) ?? byKey.set(f.key, []).get(f.key)).push(f);
  // 긴 연장·줄 끝 토막 다리의 근거: 문·창(개구부 레이어·블록)이 있거나 벽 선이 길을 받친다. 문·창 근거를 볼 수 없는
  // 도면(개구부 레이어·블록이 하나도 없다)은 가리지 않는다.
  const opening = openingEvidence(ex, openFaceLayers, inRoi);
  const support = faceSupport(cand.filter((s, i) => !colSegs.has(i) && !symbol(s) && wallish(s)));
  const evidence = opening && ((p, q, th) => opening(p, q, th) || support(p, q, th));
  const pieces = [], jogs = [], gaps = [];
  for (const list of byKey.values()) {
    const { u, n } = list[0];
    const at = (t, off) => [u[0] * t + n[0] * off, u[1] * t + n[1] * off];
    // 줄 끝 토막 다리는 문·창 근거만 본다 — 벽 선 받침은 옆 벽의 면선이 대신 설 수 있다(405 벽 안의 100 모서리 띠).
    const binEvidence = opening && ((t0, t1, lo, hi) => opening(at(t0, (lo + hi) / 2), at(t1, (lo + hi) / 2), hi - lo));
    const br = wallsOfRuns(bandRuns(wallBands(list, P, openLayers), P), P, binEvidence);
    const perChain = new Map();
    for (const r of br.sections) perChain.set(r.chain, (perChain.get(r.chain) ?? 0) + 1);
    for (const r of br.sections) {
      const L = r.t1 - r.t0, th = r.hi - r.lo;
      // 짧은 토막 거르기는 **홀로 선** 구간에만 한다 — 꺾임으로 이어진 구간을 지우면 꺾임이 매달린다.
      if (perChain.get(r.chain) === 1 && (L < P.minWall || (L < P.colRatio * th && L < P.colMax))) continue;   // 못 알아본 기둥·벽기둥 토막
      pieces.push({ ...r, u, n, layers: layersOf(list, r) });
    }
    for (const j of br.jogs) jogs.push({ ...j, u, n });
    for (const g of br.gaps) { const o = openingOf(list, g, P); if (o) gaps.push({ p: [u[0] * o.t + n[0] * g.off, u[1] * o.t + n[1] * g.off], width: o.width }); }
  }
  const hist = thicknessHist(pieces);
  // 폴백에서는 우세 두께 계급에 드는 띠만 남긴다(기구·가구의 평행선을 벽으로 보지 않게).
  const modes = new Set(hist.slice(0, FALLBACK_MODES).map(([k]) => k));
  const kept = guessed ? pieces.filter(r => modes.has(Math.round((r.hi - r.lo) / 5) * 5)) : pieces;
  const guessedLayers = new Set();
  if (guessed) for (const r of kept) for (const l of r.layers) guessedLayers.add(l);
  const thOf = mm => { const th = Math.round(mm / 5) * 5; return th >= P.tMin ? th : thickness; };
  let walls = kept.map(r => {
    const off = (r.lo + r.hi) / 2;
    return {
      a: [r.u[0] * r.t0 + r.n[0] * off, r.u[1] * r.t0 + r.n[1] * off],
      b: [r.u[0] * r.t1 + r.n[0] * off, r.u[1] * r.t1 + r.n[1] * off],
      thickness: thOf(r.hi - r.lo),
    };
  });
  // 꺾임(두께가 바뀌는 경계): 두 구간 중심선을 잇는 짧은 수직 벽. 끝점은 두 구간 끝과 같은 식으로 계산해
  // 정확히 겹친다(joinEnds가 건드리지 않는다). minWall보다 짧아도 남긴다 — 지우면 벽이 끊긴다.
  for (const j of jogs) walls.push({ a: [j.u[0] * j.t + j.n[0] * j.c0, j.u[1] * j.t + j.n[1] * j.c0], b: [j.u[0] * j.t + j.n[0] * j.c1, j.u[1] * j.t + j.n[1] * j.c1], thickness: thOf(j.th), jog: true });
  walls = absorbLinings(joinEnds(pruneSpurs(joinEnds(walls, P, evidence), P), P, evidence)).filter(w => w.jog || len(w.a, w.b) >= P.minWall)
    .map(({ a, b, thickness: th }) => ({ a, b, thickness: th }));
  // 벽기둥(ㄷ자): 두 열린 끝이 모두 벽 몸통(± 30 mm)에 닿거나 **다른 벽 선의 끝과 이어져야** 한다 — 허공의 ㄷ자는
  // 기구·기호다. (실파일 식당 벽기둥은 창 아래 오목한 벽 안쪽 단에 붙어 벽 띠에서 200 mm 넘게 떨어져 있다.)
  const onWall = p => walls.some(w => distToSeg(p, w.a, w.b) <= w.thickness / 2 + 30);
  const endKey = p => `${Math.round(p[0] / P.colTol)},${Math.round(p[1] / P.colTol)}`;
  const ends = new Map();
  cand.forEach((s, i) => { for (const p of [s.a, s.b]) { const k2 = endKey(p); (ends.get(k2) ?? ends.set(k2, []).get(k2)).push(i); } });
  const linked = (p, own) => (ends.get(endKey(p)) ?? []).some(i => !own.includes(i) && len(cand[i].a, cand[i].b) >= 1);
  const us = findPilasters(cand, colSegs, P);
  const okU = new Set(us.filter(pl => pl.open.every(p => onWall(p) || linked(p, pl.segs))));
  // 기둥 자리의 틈은 개구부가 아니다(벽선이 기둥 면에서 끊겼다가 이어진 것이다).
  const atColumn = p => [...rects, ...us].some(c => len(c.c, p) <= Math.max(c.w, c.h) / 2 + 50);
  // 세울 기둥: 벽에 닿은 사각형과, 떨어져 있어도 그와 같은 크기(10 mm 계급)인 사각형 — 크기가 다른 떨어진
  // 사각형은 설비 뚜껑·기호일 수 있어 세우지 않는다.
  const sizeKey = c => `${Math.round(Math.min(c.w, c.h) / 10)},${Math.round(Math.max(c.w, c.h) / 10)}`;
  const touches = c => walls.some(w => distToSeg(c.c, w.a, w.b) <= w.thickness / 2 + Math.max(c.w, c.h) / 2 + 100);
  const touching = rects.filter(touches);
  const modules = new Set(touching.map(sizeKey));
  // 한 자리에 겹쳐 그린 윤곽(구조체 사각형·ㄷ자·마감 라이닝)은 바깥 윤곽의 기둥 하나다 — 인정된 윤곽이 하나라도 든 묶음만.
  // 기둥 둘레를 감아 돈 마감·라이닝 선(ㄱ·ㄷ자, 다리 길이 제각각)은 기둥 윤곽에 넣는다.
  const columns = growLinings(mergeColumns([
    ...rects.map(c => ({ ...c, ok: touching.includes(c) || modules.has(sizeKey(c)) })),
    ...us.map(c => ({ ...c, ok: okU.has(c) })),
  ]), cand.filter(wallish));
  return { walls, gaps: gaps.filter(g => !atColumn(g.p)), columns, roi, faces, hist, guessed, guessedLayers };
}

// run을 낸 면선의 레이어들(폴백의 guessedLayers — 사람이 확인할 체크 줄).
function layersOf(faces, r) {
  const out = new Set();
  for (const f of faces) {
    if (f.off < r.lo - 1 || f.off > r.hi + 1) continue;
    if (!(f.raw ?? []).some(([a, b]) => b > r.t0 && a < r.t1)) continue;
    for (const l of f.layers) out.add(l);
  }
  return out;
}

// 틈이 개구부인가(리뷰 F1 · 사전 검토 C-2): 띠 안(lo..hi)의 어떤 면선도 덮지 않는 **가장 긴 빈 구간**이
// gapMin 이상이어야 한다. 한쪽 면선만 끊긴 작도 오류는 다른 쪽 선이 덮고 있어 문이 아니다.
function openingOf(faces, g, P) {
  const cov = [];
  for (const f of faces) {
    if (f.off < g.lo - P.offTol || f.off > g.hi + P.offTol) continue;
    for (const [a, b] of f.raw ?? []) if (b > g.t0 && a < g.t1) cov.push([Math.max(a, g.t0), Math.min(b, g.t1)]);
  }
  cov.sort((x, y) => x[0] - y[0]);
  let t = g.t0, best = null;
  const hole = (a, b) => { if (b - a > 0 && (!best || b - a > best.width)) best = { t: (a + b) / 2, width: b - a }; };
  for (const [a, b] of cov) { if (a > t) hole(t, a); t = Math.max(t, b); }
  hole(t, g.t1);
  return best && best.width >= P.gapMin ? best : null;
}
