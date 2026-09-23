// 면선(face line)과 평행쌍(§18.3의 2·4·5·6·7). 프로토타입 `dxf-walls.mjs`의 largestCluster·
// buildFaces·candidatePairs·히스토그램·탐욕 매칭을 그대로 옮기고, §18.3-7의 동점 규칙만 더했다.
import { DXF_PARAMS } from './params.js';

const norm180 = a => { let x = a % 180; if (x < 0) x += 180; return x; };
// 구간 리스트 두 개의 교집합 구간들과 그 총 길이.
export const ivOverlap = (A, B) => {
  const out = [];
  for (const [a0, a1] of A) for (const [b0, b1] of B) {
    const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
    if (hi - lo > 0) out.push([lo, hi]);
  }
  return out.sort((x, y) => x[0] - y[0]);
};
export const ivLen = L => L.reduce((a, [p, q]) => a + (q - p), 0);
// 구간을 합친다. gap = 0이면 겹치거나 맞닿은 것만 합치고 **틈은 남긴다**(개구부 틈 판정이 이것을 본다).
export const mergeIv = (L, gap = 0) => {
  const out = [];
  for (const [s0, s1] of [...L].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && s0 - last[1] <= gap) last[1] = Math.max(last[1], s1);
    else out.push([s0, s1]);
  }
  return out;
};

// 모델스페이스에 도면이 여러 장 흩어져 있다(실측 209덩어리). **연결성**으로 묶어 가장 큰 것 하나
// (사전 검토 C-7 — 격자 점유만 보던 규칙은 긴 벽 하나가 도면을 둘로 갈랐다). 규칙은 둘이다:
//  ① 선분 하나는 자기 두 끝점의 칸을 잇는다(선분이 곧 연결이다 — 12 m 벽이 빈 칸을 건너간다).
//  ② 이웃 칸(8-이웃)끼리 잇는다(끝점이 link 안팎으로 가까우면 같은 덩어리다).
// 끝점을 모두 짝지어 정확히 ≤ link를 재는 판은 실파일(끝점 138,050개)에서 1.1~1.4 s가 걸려
// §18.9의 "재추출 ≤ 1.0 s"를 혼자 깨뜨린다 — 칸 양자화로 62 ms다(실측).
export const ROI_LINK = 500;
// 좌표 하나가 NaN·Infinity면 아래 bbox의 Math.min/max가 네 값을 통째로 오염시키고, 소비처의
// inRoi는 NaN 비교가 전부 false라 **모든 선분을 버린다** — 오류 없이 벽 0개가 나온다.
// 던지지 않고 그런 선분만 세지 않는다(정상 선분으로 만든 덩어리는 그대로 남는다).
const finite = p => Number.isFinite(p[0]) && Number.isFinite(p[1]);
export function largestCluster(segs, link = ROI_LINK) {
  const ok = segs.filter(s => finite(s.a) && finite(s.b));
  if (!ok.length) return null;
  const cell = p => `${Math.floor(p[0] / link)},${Math.floor(p[1] / link)}`;
  const par = new Map();
  const find = x => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
  const uni = (x, y) => { const a = find(x), b = find(y); if (a !== b) par.set(a, b); };
  for (const s of ok) for (const p of [s.a, s.b]) { const k = cell(p); if (!par.has(k)) par.set(k, k); }
  for (const s of ok) uni(cell(s.a), cell(s.b));                       // ①
  for (const k of [...par.keys()]) {                                     // ②
    const [i, j] = k.split(',').map(Number);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const nk = `${i + di},${j + dj}`;
      if (par.has(nk)) uni(k, nk);
    }
  }
  const g = new Map();
  for (const s of ok) for (const p of [s.a, s.b]) {
    const r = find(cell(p));
    const o = g.get(r) ?? { n: 0, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    o.n++;
    o.x0 = Math.min(o.x0, p[0]); o.x1 = Math.max(o.x1, p[0]);            // bbox는 칸이 아니라 실제 끝점이다
    o.y0 = Math.min(o.y0, p[1]); o.y1 = Math.max(o.y1, p[1]);
    g.set(r, o);
  }
  return [...g.values()].sort((a, b) => b.n - a.n)[0];
}

// 방향 bin → 법선 오프셋 클러스터 → 구간 투영 → 틈 ≤ faceGap으로 잇기(문·창 개구부를 건너뛴다).
export function buildFaces(segs, P = DXF_PARAMS) {
  const bins = new Map();
  const wrap = Math.round(180 / P.angTol);
  for (const s of segs) {
    let dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1];
    const L = Math.hypot(dx, dy);
    if (!L || !Number.isFinite(L)) continue;                                // 영-길이·비유한 좌표
    if (dx < 0 || (Math.abs(dx) < 1e-9 && dy < 0)) { dx = -dx; dy = -dy; }   // 방향을 한쪽으로 모은다
    const key = String(Math.round(norm180(Math.atan2(dy, dx) * 180 / Math.PI) / P.angTol) % wrap);
    const list = bins.get(key) ?? bins.set(key, []).get(key);
    list.push({ s, u: [dx / L, dy / L] });
  }
  const faces = [];
  for (const [key, list] of bins) {
    // 키가 곧 각도다(angle = key × angTol). 90° bin은 :69가 모으는 반평면의 **절단면 위**에 놓여
    // 89.998°(u = [+ε, +1])와 90.002°(u = [+ε, −1])가 한 bin에 섞인다. 그냥 평균하면 [1, 0](수평)이
    // 되어 수직 벽이 통째로 사라진다 — bin 대표 방향과 내적이 음수인 u를 먼저 뒤집고 평균한다.
    const th = Number(key) * P.angTol * Math.PI / 180;
    const r = [Math.cos(th), Math.sin(th)];
    if (r[0] < 0 || (Math.abs(r[0]) < 1e-9 && r[1] < 0)) { r[0] = -r[0]; r[1] = -r[1]; }   // :69와 같은 반평면으로
    const al = list.map(x => (x.u[0] * r[0] + x.u[1] * r[1] < 0 ? [-x.u[0], -x.u[1]] : x.u));
    const u = [al.reduce((a, v) => a + v[0], 0) / al.length, al.reduce((a, v) => a + v[1], 0) / al.length];
    const m = Math.hypot(u[0], u[1]); u[0] /= m; u[1] /= m;
    const n = [-u[1], u[0]];
    // off·t는 정렬이 끝난 bin 공통 u·n으로 재므로 한 벽의 두 면선 오프셋 차는 그대로 두께다.
    const items = list.map(x => {
      const ta = x.s.a[0] * u[0] + x.s.a[1] * u[1], tb = x.s.b[0] * u[0] + x.s.b[1] * u[1];
      return { off: x.s.a[0] * n[0] + x.s.a[1] * n[1], t0: Math.min(ta, tb), t1: Math.max(ta, tb), layer: x.s.layer };
    }).sort((a, b) => a.off - b.off);
    let group = [];
    const flush = () => {
      if (!group.length) return;
      const off = group.reduce((a, x) => a + x.off, 0) / group.length;
      const spans = group.map(x => [x.t0, x.t1]);
      const merged = mergeIv(spans, P.faceGap);
      // raw는 틈을 잇지 않은 원 구간이다 — faceGap으로 이어 버린 뒤에는 문 자리가 사라지므로
      // Task 6의 openingGaps가 이것을 보고 개구부를 되찾는다(사전 검토 C-2).
      faces.push({ key, u, n, off, intervals: merged, raw: mergeIv(spans), layers: new Set(group.map(x => x.layer)), span: ivLen(merged) });
      group = [];
    };
    for (const it of items) {
      if (group.length && it.off - group[group.length - 1].off > P.offTol) flush();
      group.push(it);
    }
    flush();
  }
  return faces;
}

// 같은 방향 bin 안에서만 짝짓는다. clear = 두 면 사이에 (겹치는 구간에서) 다른 면선이 없다.
export function candidatePairs(faces, P = DXF_PARAMS) {
  const out = [], byKey = new Map();
  for (const f of faces) (byKey.get(f.key) ?? byKey.set(f.key, []).get(f.key)).push(f);
  for (const list of byKey.values()) {
    list.sort((a, b) => a.off - b.off);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const d = list[j].off - list[i].off;
        if (d < P.tMin) continue;
        if (d > P.tMax) break;
        const ov = ivOverlap(list[i].intervals, list[j].intervals);
        const L = ivLen(ov);
        if (L < P.minOverlap) continue;
        const clear = !list.slice(i + 1, j).some(f => ivLen(ivOverlap(f.intervals, ov)) > 0);
        out.push({ A: list[i], B: list[j], d, ov, L, clear });
      }
    }
  }
  return out;
}

// 겹침 길이 가중 5 mm bin. 상위 6개가 우세 두께(점수 ×2.5), 상위 8개로 15 mm 스냅.
export function thicknessModes(pairs, P = DXF_PARAMS) {
  const hist = new Map();
  for (const c of pairs) {
    const k = Math.round(c.d / P.modeBin) * P.modeBin;
    hist.set(k, (hist.get(k) ?? 0) + c.L);
  }
  const sorted = [...hist].sort((a, b) => b[1] - a[1]);
  const modes = new Set(sorted.slice(0, P.modeTop).map(([k]) => k));
  const modeList = sorted.slice(0, P.modeSnapTop).map(([k]) => k).sort((a, b) => a - b);
  const snap = d => {
    let best = d, bd = P.modeSnap;
    for (const m of modeList) { const x = Math.abs(d - m); if (x <= bd) { bd = x; best = m; } }
    return Math.round(best);
  };
  const boost = d => (modes.has(Math.round(d / P.modeBin) * P.modeBin) ? P.modeBoost : 1);
  return { hist: sorted, modes, modeList, snap, boost };
}

// 탐욕 매칭. 점수 = 겹침 × 우세 가중. 이미 consume(40 %)을 넘게 쓰인 면은 거절한다.
// 동점 처리(§18.3-7): 점수가 tieBand(10 %) 이내인 후보들 **사이에서만** clear인 쌍을 먼저 뽑는다.
// 전면 규칙으로 올리지 않는 이유 — 9겹 외벽에서 "사이에 아무것도 없는 쌍"은 가장 얇은 인접 쌍이라
// 100 mm 오판을 오히려 굳힌다(두께 오차는 §18.6의 분포 표시와 사람의 편집으로 닫는다).
export function matchPairs(pairs, modes, P = DXF_PARAMS) {
  const left = pairs.map(c => ({ c, score: c.L * modes.boost(c.d) })).sort((x, y) => y.score - x.score);
  const used = new Map();
  const usedLen = (f, iv) => ivLen(ivOverlap(used.get(f) ?? [], iv));
  const take = (f, iv) => used.set(f, [...(used.get(f) ?? []), ...iv]);
  const accepted = [];
  while (left.length) {
    let pick = 0;
    const lim = left[0].score * (1 - P.tieBand);
    for (let k = 0; k < left.length && left[k].score >= lim; k++) if (left[k].c.clear) { pick = k; break; }
    const { c } = left.splice(pick, 1)[0];
    if (usedLen(c.A, c.ov) > P.consume * c.L || usedLen(c.B, c.ov) > P.consume * c.L) continue;
    take(c.A, c.ov); take(c.B, c.ov);
    accepted.push(c);
  }
  return accepted;
}
