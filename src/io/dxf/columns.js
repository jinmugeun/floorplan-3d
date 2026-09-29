// 기둥(2026-09-29 정확도 수정 · bands.js에서 분리). 벽 레이어 선으로 그린 기둥 윤곽을 찾아 앱의 사각 기둥으로 세운다:
//  findColumns   — 닫힌 작은 직사각형(띠를 만들기 전에 빼야 벽이 기둥 모양 토막으로 잘리지 않는다).
//  findPilasters — 벽 면을 네 번째 변으로 삼는 ㄷ자(벽기둥).
//  mergeColumns  — 한 자리에 겹쳐 그린 윤곽들(구조체·ㄷ자·마감 라이닝)을 바깥 윤곽의 기둥 하나로.
import { DXF_PARAMS } from './params.js';

const hyp = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// ① 기둥. 선분 넷이 끝점(colTol 격자)으로 닫는 직사각형이고, 짧은 변 ≥ colMin · 긴 변 ≤ colMax ·
// 종횡비 ≤ colAspect다. 200×950 같은 가늘고 긴 닫힌 사각형은 창 사이 벽 토막이라 기둥이 아니다.
export function findColumns(segs, P = DXF_PARAMS) {
  const k = p => `${Math.round(p[0] / P.colTol)},${Math.round(p[1] / P.colTol)}`;
  const at = new Map();
  segs.forEach((s, i) => { for (const e of ['a', 'b']) { const key = k(s[e]); (at.get(key) ?? at.set(key, []).get(key)).push([i, e]); } });
  const other = (i, e) => segs[i][e === 'a' ? 'b' : 'a'];
  const out = [], used = new Set();
  segs.forEach((s, i) => {
    const l0 = hyp(s.a, s.b);
    if (used.has(i) || l0 < P.colMin || l0 > P.colMax) return;
    const d0 = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
    for (const [j, ej] of at.get(k(s.b)) ?? []) {
      if (j === i || used.has(j)) continue;
      const c = other(j, ej), d1 = [c[0] - s.b[0], c[1] - s.b[1]], l1 = Math.hypot(d1[0], d1[1]);
      if (l1 < P.colMin || l1 > P.colMax || Math.max(l0, l1) / Math.min(l0, l1) > P.colAspect) continue;
      if (Math.abs(d0[0] * d1[0] + d0[1] * d1[1]) > 0.02 * l0 * l1) continue;          // 직각이 아니다
      const d = [s.a[0] + d1[0], s.a[1] + d1[1]];
      const edge = (p, q) => (at.get(k(p)) ?? []).find(([m, em]) => m !== i && m !== j && !used.has(m) && k(other(m, em)) === k(q))?.[0];
      const m1 = edge(c, d), m2 = edge(d, s.a);
      if (m1 == null || m2 == null || m1 === m2) continue;
      for (const x of [i, j, m1, m2]) used.add(x);
      out.push({ c: [(s.a[0] + c[0]) / 2, (s.a[1] + c[1]) / 2], u: [d0[0] / l0, d0[1] / l0], w: l0, h: l1, segs: [i, j, m1, m2] });
      break;
    }
  });
  return out;
}

// ①-b 벽기둥 = 벽 면을 네 번째 변으로 삼는 ㄷ자(앞 변 + 같은 쪽으로 난 같은 길이의 옆 변 둘). 모양만 본다 —
// 열린 끝이 정말 벽에 닿는지는 벽을 세운 뒤 walls.js가 확인한다. 닫힌 사각형에 쓰인 선분(used)은 건너뛴다.
export function findPilasters(segs, used = new Set(), P = DXF_PARAMS) {
  const k = p => `${Math.round(p[0] / P.colTol)},${Math.round(p[1] / P.colTol)}`;
  const at = new Map();
  segs.forEach((s, i) => { if (!used.has(i)) for (const e of ['a', 'b']) { const key = k(s[e]); (at.get(key) ?? at.set(key, []).get(key)).push([i, e]); } });
  const other = (i, e) => segs[i][e === 'a' ? 'b' : 'a'];
  const out = [], taken = new Set();
  segs.forEach((s, i) => {
    const W = hyp(s.a, s.b);
    if (used.has(i) || taken.has(i) || W < P.colMin || W > P.colMax) return;
    const u = [(s.b[0] - s.a[0]) / W, (s.b[1] - s.a[1]) / W];
    // 앞 변의 두 끝에서 앞 변에 직각인 옆 변
    const legs = end => (at.get(k(s[end])) ?? []).filter(([j]) => j !== i && !taken.has(j)).map(([j, e]) => {
      const q = other(j, e), d = [q[0] - s[end][0], q[1] - s[end][1]], D = Math.hypot(d[0], d[1]);
      return { j, q, D, n: [d[0] / D, d[1] / D] };
    }).filter(l => l.D >= 100 && l.D <= P.colMax && Math.abs(l.n[0] * u[0] + l.n[1] * u[1]) < 0.02);
    for (const A of legs('a')) for (const B of legs('b')) {
      if (A.j === B.j || A.n[0] * B.n[0] + A.n[1] * B.n[1] < 0.99 || Math.abs(A.D - B.D) > 20) continue;
      const D = (A.D + B.D) / 2;
      if (Math.max(W, D) / Math.min(W, D) > P.colAspect) continue;
      const m = [(s.a[0] + s.b[0]) / 2 + A.n[0] * D / 2, (s.a[1] + s.b[1]) / 2 + A.n[1] * D / 2];
      for (const x of [i, A.j, B.j]) taken.add(x);
      out.push({ c: m, u, w: W, h: D, segs: [i, A.j, B.j], open: [A.q, B.q] });
      return;
    }
  });
  return out;
}

// ①-c 한 자리에 겹쳐 그린 기둥 윤곽들을 한 기둥으로 묶는다(실파일 식당 벽기둥: 구조체 500×700 + ㄷ자 550 + 마감
// 라이닝 ㄷ자 650·670·690). 한쪽 중심이 다른 쪽 윤곽 안에 들면 같은 기둥이고, 가장 큰 윤곽의 방향으로 잰 모든
// 꼭짓점의 범위(바깥 윤곽)가 기둥이다 — 벽을 모든 선의 바깥 폭으로 잡는 것과 같은 규칙이다. 묶음에 인정된(ok)
// 윤곽이 하나도 없으면 세우지 않는다. 입력·출력 모두 { c, u, w, h }(w는 u 방향 변).
export function mergeColumns(list) {
  const par = list.map((_, i) => i);
  const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  // 같은 기둥 = 한쪽의 중심이 다른 쪽 윤곽(+50 mm) 안에 든다(겹쳐 그린 라이닝 · 큰 윤곽 안에 포갠 작은 윤곽).
  const inside = (p, c) => {
    const d = [p[0] - c.c[0], p[1] - c.c[1]];
    return Math.abs(d[0] * c.u[0] + d[1] * c.u[1]) <= c.w / 2 + 50 && Math.abs(-d[0] * c.u[1] + d[1] * c.u[0]) <= c.h / 2 + 50;
  };
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (inside(a.c, b) || inside(b.c, a)) par[find(i)] = find(j);
  }
  const groups = new Map();
  list.forEach((c, i) => (groups.get(find(i)) ?? groups.set(find(i), []).get(find(i))).push(c));
  const out = [];
  for (const g of groups.values()) {
    if (!g.some(c => c.ok)) continue;
    const big = g.reduce((m, c) => (c.w * c.h > m.w * m.h ? c : m));
    const u = big.u, n = [-u[1], u[0]], o = big.c;
    let u0 = Infinity, u1 = -Infinity, n0 = Infinity, n1 = -Infinity;
    for (const c of g) {
      const cu = c.u, cn = [-cu[1], cu[0]];
      for (const su of [-1, 1]) for (const sn of [-1, 1]) {
        const p = [c.c[0] + cu[0] * su * c.w / 2 + cn[0] * sn * c.h / 2 - o[0], c.c[1] + cu[1] * su * c.w / 2 + cn[1] * sn * c.h / 2 - o[1]];
        const pu = p[0] * u[0] + p[1] * u[1], pn = p[0] * n[0] + p[1] * n[1];
        u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); n0 = Math.min(n0, pn); n1 = Math.max(n1, pn);
      }
    }
    out.push({ c: [o[0] + u[0] * (u0 + u1) / 2 + n[0] * (n0 + n1) / 2, o[1] + u[1] * (u0 + u1) / 2 + n[1] * (n0 + n1) / 2], u, w: u1 - u0, h: n1 - n0 });
  }
  return out;
}
