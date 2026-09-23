// 중심선 → 정리 → 벽(§18.3의 8·9·10). 좌표계는 **DXF 그대로**다(mm · y 위쪽) — 앱 좌표로 옮기는
// 것은 toProject.js가 한다. 프로토타입 `dxf-walls.mjs`의 6~7단계를 옮기면서 고친 것은 하나뿐이다:
// closeJunctions의 반직선 파라미터를 **앞으로만** 열었다(아래 주석).
import { DXF_PARAMS } from './params.js';
import { largestCluster, ROI_LINK, buildFaces, candidatePairs, thicknessModes, matchPairs, ivOverlap, mergeIv } from './faces.js';

const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const FALLBACK_MIN_SEG = 300;   // §18.3 폴백: 레이어 필터를 뺀 경로의 최소 선분 길이
export const GAP_RANGE = [600, 1500];   // 개구부로 볼 벽 틈의 폭(mm) — 문 900·통로 1200이 이 안이다

// 8. 겹침 구간마다 중앙 오프셋 선 + 두께. 우세 두께가 아예 없는 도면(폴백)이나 범위를 벗어난
// 값은 대화상자의 `기본 두께`를 쓴다.
export function centerlines(accepted, modes, P = DXF_PARAMS, fallback = DXF_PARAMS.thickness) {
  const out = [];
  for (const c of accepted) {
    const u = c.A.u, n = c.A.n, off = (c.A.off + c.B.off) / 2;
    const snapped = modes.modeList.length ? modes.snap(c.d) : fallback;
    const thickness = snapped >= P.tMin && snapped <= P.tMax ? snapped : fallback;
    for (const [t0, t1] of c.ov) {
      if (t1 - t0 < P.minWall) continue;
      out.push({ a: [u[0] * t0 + n[0] * off, u[1] * t0 + n[1] * off], b: [u[0] * t1 + n[0] * off, u[1] * t1 + n[1] * off], thickness, u, n, off });
    }
  }
  return out;
}

// 9. 방향·오프셋(6 mm)·두께(25 mm 계급)가 같고 틈 ≤ mergeGap이면 하나로.
export function mergeCollinear(list, P = DXF_PARAMS) {
  const key = w => `${w.u.map(v => v.toFixed(4)).join(',')}|${Math.round(w.off / P.offTol)}|${Math.round(w.thickness / 25)}`;
  const g = new Map();
  for (const w of list) (g.get(key(w)) ?? g.set(key(w), []).get(key(w))).push(w);
  const out = [];
  for (const arr of g.values()) {
    const u = arr[0].u, n = arr[0].n;
    const off = arr.reduce((a, w) => a + w.off, 0) / arr.length;
    const total = arr.reduce((a, w) => a + len(w.a, w.b), 0);
    const th = Math.round(arr.reduce((a, w) => a + w.thickness * len(w.a, w.b), 0) / (total || 1));
    const iv = arr.map(w => [w.a[0] * u[0] + w.a[1] * u[1], w.b[0] * u[0] + w.b[1] * u[1]])
      .map(([p, q]) => [Math.min(p, q), Math.max(p, q)]).sort((a, b) => a[0] - b[0]);
    const m = [];
    for (const [s0, s1] of iv) {
      const last = m[m.length - 1];
      if (last && s0 - last[1] <= P.mergeGap) last[1] = Math.max(last[1], s1);
      else m.push([s0, s1]);
    }
    for (const [s0, s1] of m) out.push({ a: [u[0] * s0 + n[0] * off, u[1] * s0 + n[1] * off], b: [u[0] * s1 + n[0] * off, u[1] * s1 + n[1] * off], thickness: th, u, n, off });
  }
  return out;
}

// 10-①. 끝점 클러스터 → 무게중심 스냅.
export function snapEndpoints(list, tol) {
  const clusters = [];
  for (const w of list) for (const p of [w.a, w.b]) {
    let c = clusters.find(q => len(q.c, p) <= tol);
    if (!c) { c = { c: [p[0], p[1]], pts: [] }; clusters.push(c); }
    c.pts.push(p);
    c.c = [c.pts.reduce((a, x) => a + x[0], 0) / c.pts.length, c.pts.reduce((a, x) => a + x[1], 0) / c.pts.length];
  }
  const map = p => clusters.find(q => len(q.c, p) <= tol)?.c ?? p;
  return list.map(w => ({ ...w, a: [...map(w.a)], b: [...map(w.b)] }));
}

// 10-②. 매달린 끝을 **자기 방향으로** 연장해 이웃 벽의 무한직선과 만나게 한다(T·L 닫기).
// 뒤로 여는 폭은 살짝 지나친 끝을 되당길 만큼(두께 + snap)뿐이다: 프로토타입처럼 −4,000까지 열면
// 매달린 끝이 반대편 벽 직선으로 수천 mm 점프해 벽이 minWall 아래로 줄어 사라진다.
export function closeJunctions(list, P = DXF_PARAMS) {
  const out = list.map(w => ({ ...w, a: [...w.a], b: [...w.b] }));
  const shared = p => out.filter(w => len(w.a, p) < 1 || len(w.b, p) < 1).length;
  for (const w of out) {
    for (const end of ['a', 'b']) {
      const p = w[end];
      if (shared(p) >= 2) continue;
      const d0 = [w.b[0] - w.a[0], w.b[1] - w.a[1]], L0 = Math.hypot(d0[0], d0[1]);
      if (!L0) continue;
      const dir = end === 'b' ? [d0[0] / L0, d0[1] / L0] : [-d0[0] / L0, -d0[1] / L0];
      const back = -(w.thickness + P.snap);
      let best = null;
      for (const o of out) {
        if (o === w) continue;
        const e = [o.b[0] - o.a[0], o.b[1] - o.a[1]];
        const den = dir[0] * e[1] - dir[1] * e[0];
        if (Math.abs(den) < 1e-9) continue;                        // 평행
        const s = ((o.a[0] - p[0]) * e[1] - (o.a[1] - p[1]) * e[0]) / den;
        if (s < back || s > P.extend) continue;
        const q = [p[0] + dir[0] * s, p[1] + dir[1] * s];
        const t = ((q[0] - o.a[0]) * e[0] + (q[1] - o.a[1]) * e[1]) / (e[0] * e[0] + e[1] * e[1]);
        const marg = (o.thickness + w.thickness) / 2 / Math.hypot(e[0], e[1]);
        if (t < -marg || t > 1 + marg) continue;                   // 이웃 벽의 몸통 밖이면 접합이 아니다
        if (!best || Math.abs(s) < best.cost) best = { cost: Math.abs(s), q };
      }
      if (best) { w[end][0] = best.q[0]; w[end][1] = best.q[1]; }
    }
  }
  return out;
}

// 10-③. 마주보는 매달린 끝 두 개를 벽으로 잇는다(개구부 틈 메우기 — 앱 모델에서 문은 "벽에 뚫린
// 구멍"이므로 벽은 개구부를 지나 이어져야 한다).
export function bridgeGaps(list, P = DXF_PARAMS) {
  const out = list.map(w => ({ ...w, a: [...w.a], b: [...w.b] }));
  const cosTol = Math.cos(P.bridgeAngTol * Math.PI / 180);
  const key = p => `${Math.round(p[0])},${Math.round(p[1])}`;
  for (let pass = 0; pass < P.passes; pass++) {
    const deg = new Map();
    for (const w of out) for (const p of [w.a, w.b]) deg.set(key(p), (deg.get(key(p)) ?? 0) + 1);
    const ends = [];
    for (const w of out) for (const e of ['a', 'b']) {
      if ((deg.get(key(w[e])) ?? 0) >= 2) continue;
      const o = e === 'a' ? w.b : w.a, p = w[e], L = len(p, o);
      if (!L) continue;
      ends.push({ w, p, dir: [(p[0] - o[0]) / L, (p[1] - o[1]) / L] });
    }
    const taken = new Set(), added = [];
    for (let i = 0; i < ends.length; i++) {
      if (taken.has(i)) continue;
      const A = ends[i];
      let best = null;
      for (let j = 0; j < ends.length; j++) {
        if (i === j || taken.has(j) || ends[j].w === A.w) continue;
        const B = ends[j], g = len(A.p, B.p);
        if (g < 1 || g > P.bridge) continue;
        const u = [(B.p[0] - A.p[0]) / g, (B.p[1] - A.p[1]) / g];
        if (u[0] * A.dir[0] + u[1] * A.dir[1] < cosTol) continue;          // 정면으로 마주보는가
        if (-(u[0] * B.dir[0] + u[1] * B.dir[1]) < cosTol) continue;
        const perp = Math.abs((B.p[0] - A.p[0]) * -A.dir[1] + (B.p[1] - A.p[1]) * A.dir[0]);
        if (perp > P.bridgeOffTol) continue;
        if (!best || g < best.g) best = { j, g, B };
      }
      if (!best) continue;
      taken.add(i); taken.add(best.j);
      added.push({ a: [...A.p], b: [...best.B.p], thickness: Math.round((A.w.thickness + best.B.w.thickness) / 2), bridged: true });
    }
    if (!added.length) break;
    out.push(...added);
  }
  return out;
}

// 벽 네트워크의 작은 고립 덩어리를 버린다. normalizeWalls가 T접합을 쪼갠 **뒤에** 부른다
// (그래야 끝점이 실제로 공유된다 — toProject.js가 그 순서를 지킨다).
export function dropTinyComponents(list, minWalls = DXF_PARAMS.minComp) {
  const key = p => `${Math.round(p[0])},${Math.round(p[1])}`;
  const par = new Map();
  const find = x => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
  for (const w of list) for (const p of [w.a, w.b]) if (!par.has(key(p))) par.set(key(p), key(p));
  for (const w of list) { const a = find(key(w.a)), b = find(key(w.b)); if (a !== b) par.set(a, b); }
  const cnt = new Map();
  for (const w of list) { const r = find(key(w.a)); cnt.set(r, (cnt.get(r) ?? 0) + 1); }
  return list.filter(w => (cnt.get(find(key(w.a))) ?? 0) >= minWalls);
}

// 개구부 틈(§18.4의 두 번째 신호 · 사전 검토 C-2). 이 도면의 문은 **미닫이**라 스윙 궤적 원호가
// 아예 없다(파일 전체에서 반지름 600~1,200 mm ∧ 스윕 60~110°인 원호는 5개뿐이고 전부 기구 레이어다).
// 대신 벽을 이루는 면선 쌍이 **둘 다 비는 구간**이 문·통로다: buildFaces가 faceGap(5,200 mm)으로
// 이어 놓기 전의 raw 구간을 보고, 벽의 겹침 구간(c.ov) 안에서 덮이지 않은 600~1,500 mm 토막을 찾는다.
export function openingGaps(accepted, P = DXF_PARAMS) {
  const out = [];
  for (const c of accepted) {
    const u = c.A.u, n = c.A.n, off = (c.A.off + c.B.off) / 2;
    const cov = mergeIv(ivOverlap(c.A.raw ?? c.A.intervals, c.B.raw ?? c.B.intervals));
    const at = (t0, t1) => {
      const m = (t0 + t1) / 2;
      out.push({ p: [u[0] * m + n[0] * off, u[1] * m + n[1] * off], width: t1 - t0 });
    };
    for (const [s0, s1] of c.ov) {
      let t = s0;
      for (const [a, b] of cov) {
        if (b <= s0 || a >= s1) continue;
        if (a - t >= GAP_RANGE[0] && a - t <= GAP_RANGE[1]) at(t, a);
        t = Math.max(t, b);
      }
      if (s1 - t >= GAP_RANGE[0] && s1 - t <= GAP_RANGE[1]) at(t, s1);
    }
  }
  return out;
}

// 2~10단계를 한 줄로. 결과 좌표는 DXF 그대로다.
export function extractWalls(ex, { wallLayers = new Set(), openFaceLayers = new Set(), liveLayers = null, params: P = DXF_PARAMS, thickness = DXF_PARAMS.thickness } = {}) {
  const live = liveLayers ? ex.segs.filter(s => liveLayers.has(s.layer)) : ex.segs;
  const roi = largestCluster(live, ROI_LINK);   // 연결성 기반(C-7) — P.roiCell은 더 이상 쓰지 않는다
  const inRoi = p => !roi || (p[0] >= roi.x0 && p[0] <= roi.x1 && p[1] >= roi.y0 && p[1] <= roi.y1);
  const usable = s => inRoi(s.a) && inRoi(s.b) && !s.src?.endsWith(':bulge');   // 조경 곡선·라운드 코너는 벽이 아니다
  let cand = ex.segs.filter(s => usable(s) && (
    (wallLayers.has(s.layer) && len(s.a, s.b) >= P.minSeg) ||
    (openFaceLayers.has(s.layer) && len(s.a, s.b) >= P.openFaceMin)));
  // 폴백(§18.3): 벽 후보가 0개인 도면은 레이어 필터를 빼고 길이 ≥ 300 mm인 모든 선분으로 돈다.
  let guessed = false;
  if (!cand.length) {
    guessed = true;
    cand = live.filter(s => usable(s) && len(s.a, s.b) >= FALLBACK_MIN_SEG);
  }
  const faces = buildFaces(cand, P);
  const pairs = candidatePairs(faces, P);
  const modes = thicknessModes(pairs, P);
  // 폴백 경로에서는 우세 봉우리에 걸린 쌍만 남긴다(모든 평행선을 벽으로 보지 않게).
  const usePairs = guessed ? pairs.filter(c => modes.modes.has(Math.round(c.d / P.modeBin) * P.modeBin)) : pairs;
  const accepted = matchPairs(usePairs, modes, P);
  const guessedLayers = new Set();
  if (guessed) for (const c of accepted) for (const f of [c.A, c.B]) for (const n of f.layers) guessedLayers.add(n);
  let walls = mergeCollinear(centerlines(accepted, modes, P, thickness), P).filter(w => len(w.a, w.b) >= P.minWall);
  for (let pass = 0; pass < P.passes; pass++) {
    walls = snapEndpoints(walls, P.snap);
    walls = closeJunctions(walls, P);
    walls = bridgeGaps(walls, P);
    walls = walls.filter(w => len(w.a, w.b) >= P.minWall);
  }
  walls = snapEndpoints(walls, P.snapFinal).filter(w => len(w.a, w.b) >= P.minWall);
  return { walls: walls.map(w => ({ a: w.a, b: w.b, thickness: w.thickness })), gaps: openingGaps(accepted, P), roi, faces, pairs, accepted, hist: modes.hist, guessed, guessedLayers };
}
