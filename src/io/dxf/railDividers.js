// 난간 선 → 구획선(2026-10-12 · 계획 12 Task 5). 공개 코퍼스의 발코니는 건물 벽 + **난간**으로 둘러싸이는데 난간이 벽 레이어가 아니라
// (`栏杆`·`0-栏杆`·`阳台`·`4-BACLONY`…) 방이 닫히지 않았다 — 놓친 정답 발코니 159/269 · 정원 50/66, 그 빈 변(우리 벽이 150 mm 안에 없는 변)
// 365개 중 211개를 난간 계열 레이어 선이 덮는다(레이어 하나로는 꺼진 축선 DOTE 95 다음이 栏杆 78 · 계획 12 Task 5 보고서의 진단 표). 난간은 벽이 아니므로(두께·3D·견적 없음)
// **구획선(virtual)** 으로만 넣는다 — 계획 10 5차의 `wall.virtual` 그대로(2D 점선 · 방만 나눈다).
//  ① 같은 직선 위(가로 ≤ offTol) 조각을 틈 ≤ railSnap까지 한 줄로 잇는다(난간 기둥에서 끊긴 선).
//  ② 나란한 두 줄(간격 ≤ railPair · 짧은 쪽 절반 이상 겹침)은 한 난간 — 가운데 한 줄로.
//  ③ 이미 있는 벽과 나란히 겹치는 구간(벽 몸통 + railSnap 안)은 뺀다(벽이 이미 닫는다 · 같은 직선 위에 겹치면 normalizeWalls가 벽을 구획선 조각으로
//     바꿔 버릴 수 있다). 남은 줄 중 railMin 이상만 쓴다.
//  ④ 줄 끝은 **자기 축 위에서만** 옮긴다(walls.js의 extend와 같은 원칙 — 줄을 기울이면 그 줄에 T자로 붙은 다른 난간이 어긋난다):
//     두 줄 끝이 서로의 직선 교점까지 각자 railSnap 안이면 모서리(둘 다 그 교점으로), 아니면 가장 가까운 것 하나 —
//     벽 중심선 몸통(railSnap + 두께/2 안) · 벽 끝점(축 위 가장 가까운 점에서 짧은 연결선으로) · 다른 난간 줄의 몸통(T자).
//  ⑤ 모서리·T자로 이어진 난간 묶음은 **끝이 모두 붙고 벽에 두 곳 이상 닿을 때만** 구획선이 된다 — 떠 있는 난간은 끊긴 끝을 늘리고, 난간끼리만 닫힌
//     사각형(기둥)은 작은 방을 만든다. 홀로 선 구획선은 railMin 이상, 묶음 안 조각은 붙이며 줄어도 railSnap 이상(모서리에 붙은 550 mm 짜리 되돌림 —
//     4suite (7) 阳台露台)이어야 한다.
// 좌표는 앱 좌표(mm · 정수 — makeToApp)다. 반환 { walls(정규화한 새 배열 · 넣은 것이 없으면 받은 배열 그대로), added(만든 구획선 수) }.
// 만든 구획선에는 rail 표지를 단다(toProject가 세고 지운다 — 저장 형식은 그대로다).
import { makeWall } from '../../geom/walls.js';
import { normalizeWalls } from '../../geom/normalize.js';
import { DXF_PARAMS } from './params.js';

const SIN_CROSS = 0.5;          // 끝을 붙일 두 선의 최소 사잇각(30°) — 그보다 나란하면 만나는 점이 축 위 멀리 달아난다
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
// 방향을 x ≥ 0 반평면으로(같은 직선의 두 방향을 하나로).
const canon = u => (u[0] > 1e-9 || (Math.abs(u[0]) <= 1e-9 && u[1] > 0) ? u : [-u[0], -u[1]]);
// 줄 = { u(단위 방향), n(왼쪽 법선), off(법선 쪽 거리), t0, t1(방향 쪽 구간) } — 점 = u·t + n·off.
const at = (r, t) => [r.u[0] * t + r.n[0] * r.off, r.u[1] * t + r.n[1] * r.off];

// 서로소 집합으로 묶는다(linked(i, j)가 참인 쌍을 잇는다).
function groups(n, linked) {
  const p = Array.from({ length: n }, (_, i) => i);
  const find = i => (p[i] === i ? i : (p[i] = find(p[i])));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (linked(i, j)) p[find(i)] = find(j);
  const out = new Map();
  for (let i = 0; i < n; i++) (out.get(find(i)) ?? out.set(find(i), []).get(find(i))).push(i);
  return [...out.values()];
}

// 선 묶음 → 한 줄: 가장 긴 것의 방향, 구간은 전부의 합, off는 pickOff(끝점들의 법선 거리).
function lineOf(items, pickOff) {
  const ref = items.reduce((a, b) => (b.len > a.len ? b : a));
  const u = ref.u, n = [-u[1], u[0]];
  const ts = items.flatMap(x => [dot(x.a, u), dot(x.b, u)]);
  const r = { u, n, off: pickOff(items.flatMap(x => [dot(x.a, n), dot(x.b, n)])), t0: Math.min(...ts), t1: Math.max(...ts) };
  return { ...r, a: at(r, r.t0), b: at(r, r.t1), len: r.t1 - r.t0 };
}

// ①·② 조각 → 줄 → 난간(두 줄이면 가운데).
function railsOf(segs, P) {
  const sinTol = Math.sin(P.angTol * Math.PI / 180);
  const items = segs.map(s => {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    return { a: s.a, b: s.b, len, u: canon([(s.b[0] - s.a[0]) / len, (s.b[1] - s.a[1]) / len]) };
  });
  const span = (x, u) => { const p = dot(x.a, u), q = dot(x.b, u); return [Math.min(p, q), Math.max(p, q)]; };
  const parallel = (x, y) => Math.abs(cross(x.u, y.u)) <= sinTol;
  const runs = groups(items.length, (i, j) => {
    const x = items[i], y = items[j], n = [-x.u[1], x.u[0]];
    if (!parallel(x, y) || Math.max(Math.abs(dot(y.a, n) - dot(x.a, n)), Math.abs(dot(y.b, n) - dot(x.a, n))) > P.offTol) return false;
    const [a0, a1] = span(x, x.u), [b0, b1] = span(y, x.u);
    return Math.max(b0 - a1, a0 - b1) <= P.railSnap;
  }).map(g => lineOf(g.map(i => items[i]), offs => offs.reduce((s, v) => s + v, 0) / offs.length));
  return groups(runs.length, (i, j) => {
    const x = runs[i], y = runs[j];
    if (!parallel(x, y) || Math.abs(dot(y.a, x.n) - x.off) > P.railPair) return false;
    const [b0, b1] = span(y, x.u);
    return Math.min(x.t1, b1) - Math.max(x.t0, b0) >= 0.5 * Math.min(x.len, b1 - b0);
  }).map(g => lineOf(g.map(i => runs[i]), offs => (Math.min(...offs) + Math.max(...offs)) / 2));
}

// ③ 나란한 벽(몸통 + railSnap 안)이 덮는 구간을 뺀 나머지 줄 조각(railMin 이상).
function uncovered(rail, solid, P) {
  const sinTol = Math.sin(P.angTol * Math.PI / 180);
  const cov = [];
  for (const { w, v } of solid) {
    if (Math.abs(cross(rail.u, v)) > sinTol) continue;
    if (Math.max(Math.abs(dot(w.a, rail.n) - rail.off), Math.abs(dot(w.b, rail.n) - rail.off)) > w.thickness / 2 + P.railSnap) continue;
    const p = dot(w.a, rail.u), q = dot(w.b, rail.u);
    cov.push([Math.min(p, q), Math.max(p, q)]);
  }
  cov.sort((x, y) => x[0] - y[0]);
  const keep = [];
  let t = rail.t0;
  for (const [c0, c1] of cov) {
    if (c1 <= t) continue;
    if (c0 >= rail.t1) break;
    if (c0 > t) keep.push([t, c0]);
    t = Math.max(t, c1);
  }
  if (t < rail.t1) keep.push([t, rail.t1]);
  return keep.filter(([s, e]) => e - s >= P.railMin).map(([s, e]) => ({ ...rail, t0: s, t1: e, a: at(rail, s), b: at(rail, e), len: e - s }));
}

// ④ 끝 e에서 바깥 방향 d로(음수면 되돌려) 자기 축을 따라가 선분 A + r·v(r ∈ [0, len]) 몸통에 닿는 점. s = 축 위 이동 거리.
function meet(e, d, A, v, len, reach) {
  const den = cross(d, v);
  if (Math.abs(den) < SIN_CROSS) return null;
  const q = [A[0] - e[0], A[1] - e[1]];
  const s = cross(q, v) / den, r = cross(q, d) / den;
  if (Math.abs(s) > reach || r < 0 || r > len) return null;
  return { s, p: [e[0] + d[0] * s, e[1] + d[1] * s] };
}

export function railDividers(walls, rails, { height = DXF_PARAMS.height, params: P = DXF_PARAMS } = {}) {
  const segs = (rails ?? []).filter(s => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > 1);
  if (!segs.length) return { walls, added: 0 };
  const solid = walls.filter(w => !w.virtual).map(w => {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    return { w, L, v: L ? [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L] : [1, 0] };
  }).filter(x => x.L > 0);
  const pieces = railsOf(segs, P).flatMap(r => uncovered(r, solid, P));
  const ends = pieces.flatMap((pc, i) => [[pc.t0, -1], [pc.t1, 1]].map(([t, k]) => ({ i, e: at(pc, t), d: [pc.u[0] * k, pc.u[1] * k], to: null })));
  // 모서리: 가까운 짝부터 한 번씩.
  const corners = [];
  for (let a = 0; a < ends.length; a++) for (let b = a + 1; b < ends.length; b++) {
    const x = ends[a], y = ends[b], den = cross(x.d, y.d);
    if (x.i === y.i || Math.abs(den) < SIN_CROSS) continue;
    const q = [y.e[0] - x.e[0], y.e[1] - x.e[1]], s = cross(q, y.d) / den, s2 = cross(q, x.d) / den;
    if (Math.abs(s) <= P.railSnap && Math.abs(s2) <= P.railSnap) corners.push({ x, y, cost: Math.abs(s) + Math.abs(s2), p: [x.e[0] + x.d[0] * s, x.e[1] + x.d[1] * s] });
  }
  for (const c of corners.sort((m, n) => m.cost - n.cost)) {
    if (c.x.to || c.y.to) continue;
    c.x.to = { p: c.p, j: c.y.i };
    c.y.to = { p: c.p, j: c.x.i };
  }
  for (const x of ends) {
    if (x.to) continue;
    let best = null;
    const take = m => { if (m && (!best || m.cost < best.cost)) best = m; };
    for (const o of solid) {
      const reach = P.railSnap + o.w.thickness / 2, m = meet(x.e, x.d, o.w.a, o.v, o.L, reach);
      take(m && { p: m.p, cost: Math.abs(m.s), wall: true });
      for (const W of [o.w.a, o.w.b]) {
        const q = [W[0] - x.e[0], W[1] - x.e[1]], s = dot(q, x.d);
        if (Math.hypot(q[0], q[1]) <= reach) take({ p: [x.e[0] + x.d[0] * s, x.e[1] + x.d[1] * s], hook: W, cost: Math.hypot(q[0], q[1]), wall: true });
      }
    }
    pieces.forEach((o, j) => {
      const m = j === x.i ? null : meet(x.e, x.d, at(o, o.t0), o.u, o.len, P.railSnap);
      take(m && { p: m.p, cost: Math.abs(m.s), j });
    });
    x.to = best;
  }
  // ⑤ 난간끼리 붙은 끝(모서리·T자)으로 묶음을 짓는다.
  const linked = new Set(ends.filter(x => x.to && x.to.j != null).map(x => `${Math.min(x.i, x.to.j)},${Math.max(x.i, x.to.j)}`));
  const out = [];
  const rnd = p => p.map(v => Math.round(v) || 0);
  for (const g of groups(pieces.length, (i, j) => linked.has(`${i},${j}`))) {
    const own = ends.filter(x => g.includes(x.i));
    if (own.some(x => !x.to) || own.filter(x => x.to.wall).length < 2) continue;
    const lines = g.map(i => own.filter(x => x.i === i).map(x => rnd(x.to.p)));
    const lens = lines.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
    if (lens.some(l => l < P.railSnap) || lens.reduce((s, l) => s + l, 0) < P.railMin) continue;
    for (const x of own) {
      if (!x.to.hook) continue;
      const p = rnd(x.to.p);
      if (Math.hypot(p[0] - x.to.hook[0], p[1] - x.to.hook[1]) > 1) lines.push([p, [...x.to.hook]]);   // 벽 끝까지 짧은 연결선
    }
    for (const [a, b] of lines) {
      const v = makeWall({ a, b, thickness: 20, height });
      v.virtual = true;
      v.rail = true;
      out.push(v);
    }
  }
  return out.length ? { walls: normalizeWalls([...walls, ...out]), added: out.length } : { walls, added: 0 };
}
