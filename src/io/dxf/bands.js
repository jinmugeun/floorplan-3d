// 벽 띠 스윕(§18.3 개정 · 2026-09-29 정확도 수정). 벽을 "면선 두 개의 짝"으로 보지 않고
// **축을 따라 가며 그 자리에 실제로 함께 있는 면선들의 무리**로 본다:
//  ① 기둥(columns.js) — 닫힌 작은 직사각형을 먼저 뺀다. 벽에 붙은 기둥이 띠를 부풀린다.
//  ② wallBands   — 한 방향 bin의 면선을 축으로 쓸며 기본 구간마다 이웃 간격 ≤ bandGap인 선 무리 = 띠.
//  ③ bandRuns    — 옆으로 겹치며 이어지는 띠 조각을 run으로 묶고, 대표 띠는 길이 가중 최빈 구성이다.
//  ④ chainRuns   — 같은 벽(띠가 같거나 공통 핵심이 두꺼운) run들을 틈(문·창) 너머로 한 줄에 꿴다.
//  ⑤ sectionsOf  — 한 줄 안에서 구간마다 제 띠를 쓰고(두께가 바뀌면 꺾임 jog), 틈을 개구부로 알린다.
// 좌표는 bin 공통 u·n의 (t, off)다 — 벽 선이 옆으로 움직이는 단계는 여기에 없다.
import { mergeIv } from './faces.js';
import { DXF_PARAMS } from './params.js';

// 활성 오프셋 → 띠들. 이웃 간격 > bandGap이면 무리가 갈리고, 폭 > bandMax인 무리는 (양쪽이 벽이 되는) 가장 큰 내부
// 틈에서 다시 가른다. 선 하나짜리 무리와 폭 < tMin인 무리는 벽이 아니다.
// lines: [{ off, layers, op }] 오프셋 순. 반환 [[lo, hi, n, op]] — op는 개구부 레이어 선만 가진 면선이 무리에 끼었는지다.
function groupOffsets(lines, P, prev = []) {
  const out = [];
  // 앞 구간 띠들과의 가장 좋은 겹침 비율(IoU). 가르기 점수는 벽이 되는 조각들의 이 값의 합이다.
  const iou = (lo, hi) => prev.reduce((m, [a, b]) => { const i = Math.min(hi, b) - Math.max(lo, a); return i > 0 ? Math.max(m, i / (Math.max(hi, b) - Math.min(lo, a))) : m; }, 0);
  const valid = part => part.length >= 2 && part[part.length - 1].off - part[0].off >= P.tMin;
  const disjoint = (a, b) => ![...a.layers].some(l => b.layers.has(l));
  const split = items => {
    const arr = items.map(x => x.off);
    const w = arr[arr.length - 1] - arr[0];
    // 벽 사이 공간(실파일 조리실 윗벽): cavityMin 이상 틈이 **레이어가 겹치지 않는** 두 선 사이에 있고 양쪽이 모두
    // 벽이면 두 벽이다. 같은 레이어 선 사이의 틈(WAL|WAL)은 구조체 한 덩어리라 가르지 않는다(식당 서쪽 벽).
    let cav = -1, cavG = -1;
    for (let j = 1; j < items.length; j++) {
      const g = arr[j] - arr[j - 1];
      if (g >= P.cavityMin && g > cavG && disjoint(items[j - 1], items[j]) && valid(items.slice(0, j)) && valid(items.slice(j))) { cav = j; cavG = g; }
    }
    if (cav > 0) { split(items.slice(0, cav)); split(items.slice(cav)); return; }
    if (w <= P.bandMax) { if (items.length >= 2 && w >= P.tMin) out.push([arr[0], arr[arr.length - 1], items.length, items.some(x => x.op)]); return; }
    // 가르는 자리 = **바로 앞 구간의 띠와 가장 잘 이어지는** 틈(같으면 더 큰 틈 · 앞 구간이 없으면 가장 큰 틈).
    // 한 자리만 보고는 못 가른다 — 실측 세 사례가 모양으로는 구별되지 않는다:
    //  - 조리실 윗벽: 외벽(240) 안쪽 200 mm에 실내벽(275). 가장 큰 틈(253)은 실내벽 안쪽이다 → 외벽 띠가 이어지게.
    //  - 식당 서쪽 벽의 벽기둥: 405 벽 앞면에 기둥 윤곽 선. 선 수로 고르면 벽 한가운데가 갈린다 → 405 띠가 이어지게.
    //  - 조리실 서쪽 벽: 357 벽 옆 511 mm 외톨이 선(벽의 시작이라 앞 구간 없음) → 가장 큰 틈.
    const score = part => { const w = part[part.length - 1] - part[0]; return part.length >= 2 && w >= P.tMin && w <= P.bandMax ? iou(part[0], part[part.length - 1]) : 0; };
    let k = 1, big = -1, best = -1;
    for (let j = 1; j < arr.length; j++) {
      const g = arr[j] - arr[j - 1], sc = score(arr.slice(0, j)) + score(arr.slice(j));
      if (sc > best + 1e-9 || (Math.abs(sc - best) <= 1e-9 && g > big)) { best = sc; big = g; k = j; }
    }
    split(items.slice(0, k)); split(items.slice(k));
  };
  let g = [];
  for (const x of lines) {
    if (g.length && x.off - g[g.length - 1].off > P.bandGap) { split(g); g = []; }
    g.push(x);
  }
  if (g.length) split(g);
  return out;
}

// ② 한 bin의 면선 → 띠 조각 [{ t0, t1, lo, hi, n, op }]. 면선마다 raw 구간(작도 이음매 faceGap만 이은)을
// 쓴다 — 멀리 떨어진 조각을 이어 둔 구간을 쓰면 기둥 면끼리 이어진 유령 벽이 선다.
// openLayers: 개구부(창·문) 레이어. 그 레이어 선만 가진 면선이 낀 조각은 op — 벽 몸통이 아니라 창틀 자리다.
export function wallBands(faces, P = DXF_PARAMS, openLayers = new Set()) {
  const opOf = f => f.layers?.size > 0 && [...f.layers].every(l => openLayers.has(l));
  const ev = [];
  faces.forEach((f, i) => { for (const [a, b] of mergeIv(f.raw ?? f.intervals ?? [], P.faceGap)) if (b > a) ev.push([a, 1, i], [b, -1, i]); });
  ev.sort((x, y) => x[0] - y[0] || x[1] - y[1]);            // 같은 t에서는 빠지는 것이 먼저
  const active = new Map(), out = [];
  let last = [];                                            // 바로 앞 구간의 띠(가르기의 맥락)
  let prev = null;
  for (let k = 0; k < ev.length;) {
    const t = ev[k][0];
    if (prev !== null && t - prev >= 1 && active.size >= 2) {
      const lines = [...active.keys()].map(i => ({ off: faces[i].off, layers: faces[i].layers ?? new Set(), op: opOf(faces[i]) })).sort((a, b) => a.off - b.off);
      const cur = groupOffsets(lines, P, last);
      for (const [lo, hi, n, op] of cur) out.push({ t0: prev, t1: t, lo, hi, n, op });
      last = cur.map(([lo, hi]) => [lo, hi]);
    }
    while (k < ev.length && ev[k][0] === t) {
      const [, d, i] = ev[k++];
      const c = (active.get(i) ?? 0) + d;
      if (c > 0) active.set(i, c); else active.delete(i);
    }
    prev = t;
  }
  return out;
}

const bandKey = p => `${Math.round(p.lo / 10)},${Math.round(p.hi / 10)}`;
const overlapOk = (a, b) => Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) >= 0.5 * Math.min(a.hi - a.lo, b.hi - b.lo);

// 대표 띠 = 길이 가중 최빈 (lo, hi) 구성(10 mm 계급) · 그 계급 조각들의 길이 가중 평균.
// 창틀이 낀 조각(op)은 벽이 개구부를 지나는 모양이라 벽 몸통 조각이 있으면 그것만 센다(2026-09-30 치수 대조 —
// 식당 외벽은 창 자리 합이 창 사이 벽 합보다 길어 창틀 띠가 벽 두께가 됐다). 벽 몸통 = 창틀 없이 minWall 이상
// 이어지는 구간(창 사이 벽)이다 — 창틀 끝의 수십 mm 자투리(북쪽 외벽 창 옆 26·65 mm)는 벽 몸통이 아니다.
function repOf(parts, P) {
  const h = new Map();
  const solid = [];
  for (let i = 0; i < parts.length;) {
    let j = i;
    while (j < parts.length && !parts[j].op && (j === i || parts[j].t0 - parts[j - 1].t1 <= P.runJoin)) j++;
    if (j === i) { i++; continue; }
    if (parts[j - 1].t1 - parts[i].t0 >= P.minWall) solid.push(...parts.slice(i, j));
    i = j;
  }
  const pool = solid.length ? solid : parts;
  for (const p of pool) h.set(bandKey(p), (h.get(bandKey(p)) ?? 0) + (p.t1 - p.t0));
  let best = null;
  for (const [key, L] of h) if (!best || L > best[1]) best = [key, L];
  const rep = pool.filter(p => bandKey(p) === best[0]);
  const W = rep.reduce((a, p) => a + p.t1 - p.t0, 0) || 1;
  return {
    t0: parts[0].t0, t1: parts[parts.length - 1].t1,
    lo: rep.reduce((a, p) => a + p.lo * (p.t1 - p.t0), 0) / W,
    hi: rep.reduce((a, p) => a + p.hi * (p.t1 - p.t0), 0) / W,
  };
}

// 대표 띠와 안 겹치는 구간이 bandBreak보다 길면 그 구간은 다른 벽(단차)이다 — run을 가른다.
// 짧은 구간(벽기둥 부풂·접합부)은 run에 그대로 태운다.
function splitRun(parts, P, depth = 0) {
  const rep = repOf(parts, P);
  if (depth >= 4) return [rep];
  const segs = [];
  for (const p of parts) {
    const f = overlapOk(p, rep), last = segs[segs.length - 1];
    if (last && last.f === f) last.parts.push(p); else segs.push({ f, parts: [p] });
  }
  const long = s => !s.f && s.parts[s.parts.length - 1].t1 - s.parts[0].t0 >= P.bandBreak;
  if (!segs.some(long)) return [rep];
  const out = [];
  let cur = [];
  for (const s of segs) {
    if (!long(s)) { cur.push(...s.parts); continue; }
    if (cur.length) out.push(...splitRun(cur, P, depth + 1));
    out.push(...splitRun(s.parts, P, depth + 1));
    cur = [];
  }
  if (cur.length) out.push(...splitRun(cur, P, depth + 1));
  return out;
}

// ③ 띠 조각 → run [{ t0, t1, lo, hi }]. 앞 조각 끝(± runJoin)에서 시작하고 옆으로 겹치는 조각을
// 가장 많이 겹치는 run에 붙인다.
export function bandRuns(items, P = DXF_PARAMS) {
  const sorted = [...items].sort((a, b) => a.t0 - b.t0 || a.lo - b.lo);
  const runs = [];
  let open = [];
  for (const it of sorted) {
    open = open.filter(r => r.parts[r.parts.length - 1].t1 >= it.t0 - P.runJoin);
    let best = null;
    for (const r of open) {
      const last = r.parts[r.parts.length - 1];
      if (Math.abs(it.t0 - last.t1) > P.runJoin) continue;
      const ov = Math.min(it.hi, last.hi) - Math.max(it.lo, last.lo);
      if (ov > 0 && (!best || ov > best.ov)) best = { r, ov };
    }
    if (best) best.r.parts.push(it);
    else { const r = { parts: [it] }; runs.push(r); open.push(r); }
  }
  return runs.flatMap(r => splitRun(r.parts, P));
}

// ④ 같은 벽의 run들을 한 줄(chain)로 꿴다(앱 모델에서 문·창은 "벽에 뚫린 구멍"이라 벽은 개구부를 지나
// 이어져야 한다). 같은 벽 = 두 면이 bandTol 안이거나(띠가 같다), 공통 핵심이 좁은 쪽의 절반 이상 ∧ tMin 이상.
// 틈 ≤ bridge이고 가장 가까운 짝부터 — run마다 앞뒤 이웃은 하나씩이다.
const same = (a, b, P) => Math.abs(a.lo - b.lo) <= P.bandTol && Math.abs(a.hi - b.hi) <= P.bandTol;
const compatible = (a, b, P) => same(a, b, P) ||
  Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) >= Math.max(P.tMin, 0.5 * Math.min(a.hi - a.lo, b.hi - b.lo));
// evidence(t0, t1, lo, hi): 틈(t0..t1, 띠 lo..hi)에 문·창 근거가 있는가. 주면 줄 **끝**의 기둥 꼴 토막(길이 < minWall
// 또는 < colRatio × 두께)이 근거 없는 다리(≥ gapMin)로만 붙어 있을 때 떼어 제 줄로 둔다 — 벽 끝에서 빈 바닥 너머
// 기둥까지 없는 벽이 서지 않게(2026-09-30 실파일 현관). 안 주면(근거를 볼 수 없는 도면) 예전처럼 잇는다.
export function chainRuns(runs, P = DXF_PARAMS, evidence = null) {
  // t 순서로 훑으며 run을 줄에 붙인다. 호환은 줄의 **대표 run**(가장 긴 = 온전한 벽)과도 본다 — 창틀 띠와
  // 바깥 선 띠처럼 둘 다 벽의 일부인 좁은 조각이 서로는 안 겹쳐도 같은 벽이다(실파일 오른쪽 외벽).
  const chains = [];
  for (const r of [...runs].sort((x, y) => x.t0 - y.t0)) {
    let best = null;
    for (const c of chains) {
      const gap = r.t0 - c.end;
      if (gap < -P.runJoin || gap > P.bridge) continue;
      if (!compatible(c.rep, r, P) && !compatible(c.runs[c.runs.length - 1], r, P)) continue;
      const ov = Math.min(c.rep.hi, r.hi) - Math.max(c.rep.lo, r.lo);
      if (!best || gap < best.gap - 1 || (Math.abs(gap - best.gap) <= 1 && ov > best.ov)) best = { c, gap, ov };
    }
    if (!best) { chains.push({ runs: [r], rep: r, end: r.t1 }); continue; }
    const c = best.c;
    c.runs.push(r);
    c.end = Math.max(c.end, r.t1);
    if (r.t1 - r.t0 > c.rep.t1 - c.rep.t0) c.rep = r;
  }
  const out = chains.map(c => c.runs.map(({ t0, t1, lo, hi }) => ({ t0, t1, lo, hi })));
  if (!evidence) return out;
  const stub = r => { const L = r.t1 - r.t0, th = r.hi - r.lo; return L < P.minWall || (L < P.colRatio * th && L < P.colMax); };
  // 건너편이 온전한 벽일 때만 뗀다 — 토막끼리 이어진 줄(픽스처 화장실 칸 앞면: 면선 하나 + 230 mm 문틀 조각들)은
  // 그 줄이 곧 벽이다.
  const loose = (x, y) => y.t0 - x.t1 >= P.gapMin && !(stub(x) && stub(y)) &&
    !evidence(x.t1, y.t0, Math.min(x.lo, y.lo), Math.max(x.hi, y.hi));
  const res = [];
  for (const ch of out) {
    const cut = [];
    while (ch.length >= 2 && stub(ch[ch.length - 1]) && loose(ch[ch.length - 2], ch[ch.length - 1])) cut.push([ch.pop()]);
    while (ch.length >= 2 && stub(ch[0]) && loose(ch[0], ch[1])) cut.push([ch.shift()]);
    res.push(ch, ...cut);
  }
  return res;
}

// ⑤ 한 줄의 구간화(2026-09-29 감사 — 실파일 식당 서쪽 벽은 위·아래 405 mm, 가운데 320 mm였고 한 띠를 벽 전체에
// 씌우면 가운데가 92 mm 비껴 섰다). 먼저 **두께 변화가 아닌 것**을 이웃 띠로 되돌린다:
//  - 벽기둥 부풂: bandBreak보다 짧고 이웃 띠를 품는 구간(기둥 면이 띠를 넓혔다).
//  - 창·문틀·바깥선만 남은 구간: **양쪽**에 자기를 품는 run이 있는 구간(개구부 자리 — 오른쪽 외벽이 이 모양이다).
// 그다음 띠가 같은 이웃끼리 한 구간으로 합치고(길이 가중 평균), 남은 경계는 진짜 두께 변화다:
//  - 경계 사이의 틈(문)은 **얇은 쪽** 구간이 가진다(문틀은 벽의 몸통에 선다).
//  - 두 중심이 jogTol보다 벌어지면 경계에 꺾임(jog)을 두고, 그 안이면 한 중심선으로 맞춘다.
// 반환: sections [{ t0, t1, lo, hi }] · jogs [{ t, c0, c1, th }] · gaps [{ t, off, width, t0, t1, lo, hi }] (bin 좌표).
const contains = (A, B) => A.lo <= B.lo + 10 && A.hi >= B.hi - 10;
export function sectionsOf(chain, P = DXF_PARAMS) {
  const rs = chain.map(r => ({ ...r }));
  const adopt = (r, x) => { if (r.lo === x.lo && r.hi === x.hi) return false; r.lo = x.lo; r.hi = x.hi; return true; };
  const longer = (a, b) => (a.t1 - a.t0 >= b.t1 - b.t0 ? a : b);
  // r을 품는 가장 가까운 run(dir 방향). 사이에 건너뛴 run들도 모두 그 띠에 품겨야 한다(연달아 붙은 창 구간).
  const hostOn = (i, dir) => {
    const r = rs[i];
    for (let k = i + dir; k >= 0 && k < rs.length; k += dir) {
      const x = rs[k];
      if ((dir > 0 ? x.t0 - r.t1 : r.t0 - x.t1) > 2 * P.bridge) return null;
      if (!contains(x, r) || contains(r, x)) continue;
      for (let j = i + dir; j !== k; j += dir) if (!contains(x, rs[j])) return null;
      return x;
    }
    return null;
  };
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    rs.forEach((r, i) => {
      const hugs = [rs[i - 1], rs[i + 1]].filter(x => x && contains(r, x) && !contains(x, r));
      if (r.t1 - r.t0 < P.bandBreak && hugs.length) { changed = adopt(r, hugs.reduce(longer)) || changed; return; }
      const L = hostOn(i, -1), R = hostOn(i, 1);
      if (L && R) changed = adopt(r, longer(L, R)) || changed;
    });
    if (!changed) break;
  }
  const secs = [];
  for (const r of rs) {
    const s = secs[secs.length - 1];
    if (s && same(s, r, P)) {
      const wa = s.w, wb = r.t1 - r.t0;
      s.lo = (s.lo * wa + r.lo * wb) / (wa + wb); s.hi = (s.hi * wa + r.hi * wb) / (wa + wb);
      s.w = wa + wb; s.parts.push(r); s.t1 = r.t1;
    } else secs.push({ t0: r.t0, t1: r.t1, lo: r.lo, hi: r.hi, w: r.t1 - r.t0, parts: [r] });
  }
  const gaps = [];
  const gapOf = (t0, t1, s) => { if (t1 - t0 >= P.gapMin) gaps.push({ t: (t0 + t1) / 2, off: (s.lo + s.hi) / 2, width: t1 - t0, t0, t1, lo: s.lo, hi: s.hi }); };
  for (const s of secs) for (let k = 1; k < s.parts.length; k++) gapOf(s.parts[k - 1].t1, s.parts[k].t0, s);
  const jogs = [];
  for (let k = 1; k < secs.length; k++) {
    const a = secs[k - 1], b = secs[k];
    const thin = a.hi - a.lo <= b.hi - b.lo ? a : b;
    gapOf(a.t1, b.t0, thin);
    const t = thin === a ? b.t0 : a.t1;
    a.t1 = t; b.t0 = t;
    const ca = (a.lo + a.hi) / 2, cb = (b.lo + b.hi) / 2;
    if (Math.abs(ca - cb) <= P.jogTol) { b.lo += ca - cb; b.hi += ca - cb; }
    else jogs.push({ t, c0: ca, c1: cb, th: Math.min(a.hi - a.lo, b.hi - b.lo) });
  }
  return { sections: secs.map(({ t0, t1, lo, hi }) => ({ t0, t1, lo, hi })), jogs, gaps };
}

// 한 bin의 run들 → 구간·꺾임·틈(④ + ⑤). evidence는 chainRuns로 간다.
export function wallsOfRuns(runs, P = DXF_PARAMS, evidence = null) {
  const out = { sections: [], jogs: [], gaps: [], chains: 0 };
  for (const chain of chainRuns(runs, P, evidence)) {
    const r = sectionsOf(chain, P);
    out.sections.push(...r.sections.map(s => ({ ...s, chain: out.chains })));
    out.jogs.push(...r.jogs);
    out.gaps.push(...r.gaps);
    out.chains++;
  }
  return out;
}
