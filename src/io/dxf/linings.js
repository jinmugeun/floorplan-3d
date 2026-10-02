// 벽에 붙어 달리는 마감 띠(2026-10-02). 벽 면을 따라 그린 타일·단열 마감선은 벽 선과 짝이 맞아 얇은 "벽"이 된다 —
// 두 벽의 몸통이 맞닿아 나란히 달릴 수는 없으므로(틈 ≤ LINING_GAP), 그런 짝에서 **더 얇고 짧으며 긴 벽의 범위 안에 든**
// 것은 긴 벽의 마감이다. 지우고, 그 띠에 닿아 끝났던 벽 끝은 긴 벽의 중심선까지 잇는다(끝이 띠의 중심에서 멈춰 있으면
// 긴 벽과의 사이가 틈으로 남아 방이 새어 나간다 — 사동중 식당|조리실). 좌표는 DXF 좌표(mm).
const LINING_GAP = 60;        // 몸통 사이 틈(mm)
const BUTT_SLACK = 20;        // 맞대는 두 몸통이 면만 맞닿은 경우의 여유(mm · 좌표 오차 포함)
const END_PAD = 100;          // 긴 벽 범위의 여유 · 띠 몸통의 여유(mm)
const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const distToSeg = (p, a, b) => {
  const d = [b[0] - a[0], b[1] - a[1]], L2 = d[0] * d[0] + d[1] * d[1];
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - d[0] * t, p[1] - a[1] - d[1] * t);
};

export function absorbLinings(walls) {
  const dead = new Map();      // 마감 띠 → 그 벽
  for (const s of walls) {
    const ls = len(s.a, s.b);
    if (s.jog || !ls) continue;
    const us = [(s.b[0] - s.a[0]) / ls, (s.b[1] - s.a[1]) / ls];
    for (const w of walls) {
      const lw = len(w.a, w.b);
      if (w === s || w.jog || dead.has(w) || lw <= ls || w.thickness < s.thickness) continue;
      const u = [(w.b[0] - w.a[0]) / lw, (w.b[1] - w.a[1]) / lw];
      if (Math.abs(u[0] * us[1] - u[1] * us[0]) > 0.01) continue;
      const off = p => (p[0] - w.a[0]) * u[1] - (p[1] - w.a[1]) * u[0], t = p => (p[0] - w.a[0]) * u[0] + (p[1] - w.a[1]) * u[1];
      const gap = Math.abs(off(s.a)) - (s.thickness + w.thickness) / 2;
      if (gap < -LINING_GAP || gap > LINING_GAP || Math.abs(off(s.a) - off(s.b)) > 1) continue;
      if (Math.min(t(s.a), t(s.b)) < -END_PAD || Math.max(t(s.a), t(s.b)) > lw + END_PAD) continue;
      dead.set(s, w);
      break;
    }
  }
  if (!dead.size) return walls;
  const out = [];
  for (const x of walls) {
    if (dead.has(x)) continue;
    let { a, b } = x;
    for (const [s, w] of dead) {
      const ls = len(s.a, s.b), us = [(s.b[0] - s.a[0]) / ls, (s.b[1] - s.a[1]) / ls];
      const lx = len(a, b), ux = [(b[0] - a[0]) / lx, (b[1] - a[1]) / lx];
      if (x === w || !lx || Math.abs(ux[0] * us[0] + ux[1] * us[1]) > 0.1) continue;       // 띠와 직각인 벽만
      const lw = len(w.a, w.b), u = [(w.b[0] - w.a[0]) / lw, (w.b[1] - w.a[1]) / lw];
      // 끝이 띠 몸통에 닿아 있으면 벽 방향 그대로 긴 벽의 중심선까지 늘인다.
      const onto = p => {
        const ts = (p[0] - s.a[0]) * us[0] + (p[1] - s.a[1]) * us[1], d = Math.abs((p[0] - s.a[0]) * us[1] - (p[1] - s.a[1]) * us[0]);
        if (ts < -END_PAD || ts > ls + END_PAD || d > s.thickness / 2 + END_PAD) return p;
        const k = ((w.a[0] - p[0]) * u[1] - (w.a[1] - p[1]) * u[0]) / (ux[0] * u[1] - ux[1] * u[0]);
        return [p[0] + ux[0] * k, p[1] + ux[1] * k];
      };
      a = onto(a); b = onto(b);
    }
    out.push(a === x.a && b === x.b ? x : { ...x, a, b });
  }
  return out;
}

// 맞대기(2026-10-02): 끊긴 벽 끝이 몸통 폭 안에서 어긋난 **나란한 벽의 끝을 마주 보는** 자리. 같은 띠가 아니라 띠 잇기(bands)가,
// 나란해서 joinEnds가 잇지 못한다(두께가 바뀌는 자리의 틈 · 모서리 기둥에서 끝난 벽). 끊긴 쪽을 제 축 위에서 상대 끝까지
// 늘이고, 중심선이 어긋나면 꺾임 벽을 둔다. 둘 다 끊겼으면 얇은 쪽이 늘어난다. 상대 끝은 이미 이어진 모서리여도 된다.
// bareReach보다 먼 틈(≤ extend)은 support(p, q, 두께) — 그 길을 선이 받친다 — 가 참일 때만 잇는다.
export function buttJoin(walls, P, support = () => false) {
  // 끊긴 끝 = 다른 벽(끝점이든 몸통 중심선이든)이 1 mm 안에 없다 — T자로 몸통에 닿은 끝은 이어진 것이다.
  const free = (p, self) => !walls.some(w => w !== self && distToSeg(p, w.a, w.b) <= 1);
  const ends = [];
  walls.forEach((w, i) => { for (const end of ['a', 'b']) {
    const p = w[end], o = end === 'a' ? w.b : w.a, L = len(p, o);
    if (L && !w.jog) ends.push({ i, end, p, dir: [(p[0] - o[0]) / L, (p[1] - o[1]) / L], th: w.thickness, free: free(p, w) });
  } });
  const out = walls.map(w => ({ ...w })), used = new Set();
  for (const a of ends) {
    if (!a.free || used.has(a)) continue;
    let best = null;
    for (const b of ends) {
      if (a.i === b.i || used.has(b) || (b.free && (a.th > b.th || (a.th === b.th && a.i > b.i)))) continue;
      if (a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1] > -0.999) continue;                                          // 마주 본다
      const v = [b.p[0] - a.p[0], b.p[1] - a.p[1]], s = v[0] * a.dir[0] + v[1] * a.dir[1], d = Math.abs(v[0] * a.dir[1] - v[1] * a.dir[0]);
      if (s <= 0 || s > P.extend || d > (a.th + b.th) / 2 + BUTT_SLACK) continue;
      if (!best || s < best.s) best = { b, s, d };
    }
    if (!best) continue;
    const { b, s, d } = best, q = [a.p[0] + a.dir[0] * s, a.p[1] + a.dir[1] * s];
    if (s > P.bareReach && !support(a.p, q, a.th)) continue;
    out[a.i][a.end] = d < 1 ? [...b.p] : q;
    if (d >= 1) out.push({ a: q, b: [...b.p], thickness: a.th, jog: true });
    used.add(a).add(b);
  }
  return out;
}
