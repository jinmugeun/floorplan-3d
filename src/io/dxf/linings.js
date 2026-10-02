// 벽에 붙어 달리는 마감 띠(2026-10-02). 벽 면을 따라 그린 타일·단열 마감선은 벽 선과 짝이 맞아 얇은 "벽"이 된다 —
// 두 벽의 몸통이 맞닿아 나란히 달릴 수는 없으므로(틈 ≤ LINING_GAP), 그런 짝에서 **더 얇고 짧으며 긴 벽의 범위 안에 든**
// 것은 긴 벽의 마감이다. 지우고, 그 띠에 닿아 끝났던 벽 끝은 긴 벽의 중심선까지 잇는다(끝이 띠의 중심에서 멈춰 있으면
// 긴 벽과의 사이가 틈으로 남아 방이 새어 나간다 — 사동중 식당|조리실). 좌표는 DXF 좌표(mm).
const LINING_GAP = 60;        // 몸통 사이 틈(mm)
const END_PAD = 100;          // 긴 벽 범위의 여유 · 띠 몸통의 여유(mm)
const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

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
