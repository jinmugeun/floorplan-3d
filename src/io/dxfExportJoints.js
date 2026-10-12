// 정규화 DXF의 **띠가 바뀌는 이음**(2026-10-12 · 계획 12 Task 3 — dxfExportGeom.js의 ④). 좌표는 DXF(y 위 · mm)다.
// 일직선으로 이어지며 두께·중심이 바뀌는 자리와, 그 사이의 짧은 꺾임(jog) 벽은 가져오기의 구간 규칙(io/dxf/sections.js)이 읽는 꼴로 그린다:
//  - 두 벽이 **서로 다른 run**이어야 꺾임이 선다(같은 run이면 짧은 쪽이 벽기둥 부풂으로 지워진다 — bands.splitRun·sectionsOf).
//  - 경계(= 꺾임)는 **두꺼운 쪽 끝**에 선다(sectionsOf — 틈은 얇은 쪽이 갖는다). 그래서 두꺼운 벽은 이음 자리 X에서 정확히 끝나고
//    얇은 벽은 X 앞 JOINT_GAP에서 끊긴다(그 틈에는 선이 하나도 없다 — runJoin 5·faceGap 20보다 넓다).
//  - 꺾임 벽은 중심선만 그린다 — 가져오기가 그 자리에 두 중심선을 잇는 꺾임을 다시 세운다.
// 2026-10-12 실측(사동중): 합집합 윤곽 그대로면 꺾임 11개가 사라졌고(벽 94 → 78), 이 규칙으로 94 → 91이다(남은 셋은 jogTol 20 안의
// 13 mm 꺾임처럼 가져오기 자체가 한 중심선으로 맞추는 것).

const PAR = Math.sin(2 * Math.PI / 180);             // 나란함·직각 판정(2°)
const JOG_MAX = 700;                                 // 꺾임 벽의 최대 길이(bandMax — 한 띠 폭을 넘는 꺾임은 없다)
export const JOINT_GAP = 30;                         // 얇은 벽을 이음 앞에서 끊는 폭(mm) — runJoin 5·faceGap 20보다 넓게
const MID_LEN = 160;                                 // 가운데 run의 길이(minSeg 150 이상)
export const near = (p, q) => Math.abs(p[0] - q[0]) <= 1 && Math.abs(p[1] - q[1]) <= 1;   // geom/vec.js eq와 같은 1 mm
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const at = (p, d, k) => [p[0] + d[0] * k, p[1] + d[1] * k];
export const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
// 가져오기의 bin 방향(faces.buildFaces): +x 쪽(수직이면 +y 쪽)으로 모은 단위 벡터.
export const binU = d => (d[0] < -1e-9 || (Math.abs(d[0]) <= 1e-9 && d[1] < 0) ? [-d[0], -d[1]] : d);
export const infoOf = w => {
  const d = sub(w.b, w.a), L = Math.hypot(d[0], d[1]) || 1, u = [d[0] / L, d[1] / L];
  return { w, a: w.a, b: w.b, u, n: [-u[1], u[0]], h: w.t / 2, L, fix: {} };
};
export const endAt = (s, p) => (near(s.a, p) ? 'a' : near(s.b, p) ? 'b' : null);
export const farOf = (s, end) => (end === 'a' ? s.b : s.a);

// 가져오기의 줄 잇기 호환(bands.compatible — 공통 폭 ≥ max(tMin, 좁은 쪽 절반)).
const compatible = (P, l1, h1, l2, h2) => Math.min(h1, h2) - Math.max(l1, l2) >= Math.max(P.tMin, 0.5 * Math.min(h1 - l1, h2 - l2));

// 호환이 아닌 꺾임(두 띠가 반 넘게 비껴 있다 — 사동중 405|230 · 신상중 150|200 맞닿음)의 **가운데 run**: 얇은 벽 T 쪽에 길이 MID_LEN만큼,
// T의 선들에 선 하나(오프셋 e)를 더해 띠를 [e, hT](T가 위) 또는 [lT, e](T가 아래)로 넓힌다. 이 run은 T를 품고 두꺼운 벽 K는 품지 않으며
// K와 호환이다 — 줄 잇기가 K → 가운데 → T를 한 줄로 꿰고, 구간 규칙의 "이웃을 품는 짧은 run은 그 이웃의 띠를 따른다"로 가운데가 T가
// 되어 경계(= 꺾임)가 K의 끝 X에 선다. e는 K 중심선에서 10 mm(offTol 6보다 멀리) 비켜 둔다. 안 되면 null(꺾임을 보통 벽으로 그린다).
function middleOffset(P, lK, hK, lT, hT) {
  const cK = (lK + hK) / 2;
  if ((lT + hT) / 2 > cK) {
    const e = Math.min(cK - 10, hK - P.tMin - 5);
    return e > lK + 10 && e < lT - 10 && lT - e <= P.bandGap && hK - e >= Math.max(P.tMin, 0.5 * Math.min(hT - e, hK - lK)) ? e : null;
  }
  const e = Math.max(cK + 10, lK + P.tMin + 5);
  return e < hK - 10 && e > hT + 10 && e - hT <= P.bandGap && e - lK >= Math.max(P.tMin, 0.5 * Math.min(e - lT, hK - lK)) ? e : null;
}

// info(infoOf 꼴) → 이음들 [{ a, b, X, u, n, lo, hi, mid, gaps, extra? }]. 벽마다 fix(끝의 늘림 · 음수면 줄임)와 꺾임 표지(jog)를 단다.
// a는 bin 방향(u)으로 앞(−u 쪽)에 있는 벽이다. P는 가져오기 파라미터(io/dxf/params.js).
export function joints(info, P) {
  const out = [];
  // 꺾임은 두 띠가 줄 잇기에서 호환일 때만 구간 경계로 다시 선다. 호환이 아니면 가운데 run(middleOffset)을 끼우고,
  // 그것도 안 되면 꺾임 벽을 보통 벽으로 그린다 — 그 벽이 minWall보다 짧으면 다시 읽히지 않는다(가져오기의 한계 · 보고서).
  const add = (A, eA, B, eB, X, u, jog = null) => {
    const n = [-u[1], u[0]], band = s => { const c = dot(s.a, n); return [c - s.h, c + s.h]; };
    const [a, endA, b, endB] = Math.sign(dot(sub(farOf(A, eA), A[eA]), u)) < 0 ? [A, eA, B, eB] : [B, eB, A, eA];
    const [la, ha] = band(a), [lb, hb] = band(b);
    if (!jog && Math.abs(la - lb) <= 1 && Math.abs(ha - hb) <= 1) return false;      // 같은 띠 — 이어 그린다
    const thinA = ha - la <= hb - lb;                                                 // 같은 두께면 a(sectionsOf의 `<=`)
    let e = null;
    if (!compatible(P, la, ha, lb, hb)) {
      const [lK, hK, lT, hT, T] = thinA ? [lb, hb, la, ha, a] : [la, ha, lb, hb, b];
      e = jog && T.L >= 2 * JOINT_GAP + MID_LEN + P.minSeg ? middleOffset(P, lK, hK, lT, hT) : null;
      if (e == null) return false;
    }
    out.push({ a, b, endA, endB, X, u, n, lo: Math.min(la, lb), hi: Math.max(ha, hb), mid: [Math.max(la, lb), Math.min(ha, hb)], thinA, e });
    return true;
  };
  // 일직선 이음: 한 끝점을 나눠 갖고 나란하며 서로 반대쪽으로 뻗는 두 벽.
  const seen = new Set();
  for (const A of info) for (const eA of ['a', 'b']) for (const B of info) {
    if (B === A || seen.has(B) || Math.abs(cross(A.u, B.u)) > PAR) continue;
    const eB = endAt(B, A[eA]);
    if (!eB) continue;
    const u = binU(A.u);
    if (Math.sign(dot(sub(farOf(A, eA), A[eA]), u)) === Math.sign(dot(sub(farOf(B, eB), B[eB]), u))) continue;
    add(A, eA, B, eB, dot(A[eA], u), u);
    seen.add(A);
  }
  // 꺾임: 짧은 벽 J의 두 끝에 J와 직각인 나란한 두 벽이 서로 반대쪽으로 뻗는다(Z자). J의 직선을 잇는 벽이 있으면 꺾임이 아니다(T자).
  for (const J of info) {
    if (J.L > JOG_MAX) continue;
    const hang = end => info.filter(o => o !== J && endAt(o, J[end]) && Math.abs(dot(o.u, J.u)) < PAR);
    const through = end => info.some(o => o !== J && endAt(o, J[end]) && Math.abs(cross(o.u, J.u)) < PAR);
    const A = hang('a'), B = hang('b');
    if (A.length !== 1 || B.length !== 1 || through('a') || through('b')) continue;
    const eA = endAt(A[0], J.a), eB = endAt(B[0], J.b), u = binU(A[0].u);
    if (Math.sign(dot(sub(farOf(A[0], eA), J.a), u)) === Math.sign(dot(sub(farOf(B[0], eB), J.b), u))) continue;
    if (add(A[0], eA, B[0], eB, dot(J.a, u), u, J)) J.jog = true;
  }
  // 두꺼운 쪽은 X에서 끝(늘리지 않는다), 얇은 쪽은 X 앞 JOINT_GAP에서 끊는다. 두 벽의 그 끝은 모두 X 위에 있다(일직선 이음은 같은 점,
  // 꺾임은 J의 두 끝 — J가 bin과 직각이다). 가운데 run(e)이 있으면 얇은 쪽에 [틈 · 가운데 MID_LEN · 틈]을 두고 가운데에 오프셋 e의 선을 더한다.
  for (const j of out) {
    const [thin, eThin, thick, eThick] = j.thinA ? [j.a, j.endA, j.b, j.endB] : [j.b, j.endB, j.a, j.endA];
    thick.fix[eThick] = 0;
    thin.fix[eThin] = -JOINT_GAP;
    const s = j.thinA ? -1 : 1, g = JOINT_GAP, span = (t0, t1) => [Math.min(t0, t1), Math.max(t0, t1)];
    j.gaps = [span(j.X, j.X + s * g)];
    if (j.e != null) {
      j.gaps.push(span(j.X + s * (g + MID_LEN), j.X + s * (2 * g + MID_LEN)));
      const pt = t => at(at([0, 0], j.u, t), j.n, j.e);
      j.extra = [pt(j.X + s * g), pt(j.X + s * (g + MID_LEN))];
    }
  }
  return out;
}

// [0, 1]에서 구간들을 빼고 남은 구간들.
export function remain(cuts) {
  cuts.sort((x, y) => x[0] - y[0]);
  const out = [];
  let cur = 0;
  for (const [a, b] of cuts) { if (a > cur) out.push([cur, a]); cur = Math.max(cur, b); }
  if (cur < 1) out.push([cur, 1]);
  return out;
}

// segs: [[a, b, layer]]. 이음 틈: 그 bin과 나란하고 두 띠 안에 든 선분에서 틈 구간을 지운다(얇은 벽에 붙은 T자 벽의 끝선 등 — 틈에 선이 남으면 두 run이 이어진다).
// 첫 틈 양쪽의 끝선(bin과 직각 · t = 틈 끝)은 두 띠가 겹치는 높이만큼 지운다 — 두 벽이 맞붙은 것처럼 단차만 남긴다. 다 그리면 두꺼운 벽의
// 끝선·두 면선·옆 벽 면이 닫힌 ㄷ자가 되어 가져오기가 벽기둥으로 읽는다(columns.findPilasters — 2026-10-12 픽스처 515 벽).
export function clipJoints(segs, js) {
  if (!js.length) return segs;
  const out = [];
  for (const [p, q, layer] of segs) {
    const d = sub(q, p), L = Math.hypot(d[0], d[1]);
    const cuts = [];
    for (const j of js) {
      const [g0] = j.gaps;
      if (Math.abs(dot(d, j.u)) <= 1e-6 * L) {
        const t = dot(p, j.u), o0 = dot(p, j.n), o1 = dot(q, j.n);
        if ((Math.abs(t - g0[0]) > 1 && Math.abs(t - g0[1]) > 1) || Math.abs(o1 - o0) < 1e-9) continue;
        const c0 = (j.mid[0] - o0) / (o1 - o0), c1 = (j.mid[1] - o0) / (o1 - o0);
        cuts.push([Math.max(0, Math.min(c0, c1)), Math.min(1, Math.max(c0, c1))]);
        continue;
      }
      const off = dot(p, j.n), t0 = dot(p, j.u), t1 = dot(q, j.u);
      if (Math.abs(cross(d, j.u)) > 1e-6 * L || off < j.lo - 1 || off > j.hi + 1 || Math.abs(t1 - t0) < 1e-9) continue;
      for (const g of j.gaps) {
        const c0 = (g[0] - t0) / (t1 - t0), c1 = (g[1] - t0) / (t1 - t0);
        cuts.push([Math.max(0, Math.min(c0, c1)), Math.min(1, Math.max(c0, c1))]);
      }
    }
    const live = cuts.filter(([a, b]) => b > a);
    if (!live.length) { out.push([p, q, layer]); continue; }
    for (const [t0, t1] of remain(live)) if ((t1 - t0) * L >= 1) out.push([at(p, d, t0), at(p, d, t1), layer]);
  }
  return out;
}
