// 치수 기준선(2026-10-02). 설계자가 실 면적을 재는 선은 "벽·기둥 중심선"이고, 그 선은 도면의 **치수가 가리키는 좌표**로
// 남아 있다(실파일 사동중: 면적 표기 11개가 전부 치수 좌표로 만든 사각형의 넓이였다). 벽을 세운 뒤, 벽마다 그 띠
// 근처의 치수 좌표를 기준선으로 삼아 axisShift(벽의 왼쪽 법선 쪽으로 기준선이 옮겨진 거리)를 단다 — 방의 "도면 기준"
// 넓이(geom/rooms.js의 areaCenter)가 이것을 쓴다. 좌표는 전부 앱 좌표(mm)다.
//  - 실내벽: 띠 안의 치수 좌표 = 구조체 중심(마감·라이닝까지 넣은 띠의 중심에서 16~50 mm 비낀다).
//  - 외벽: 띠 밖 refOut 안의 **여럿이 재는 선**(≥ refGrid번 — 기둥 그리드) 또는 벽에 박힌 기둥들의 중심선.
import { DXF_PARAMS } from './params.js';

// 축에 나란한 치수의 측정점 좌표를 축마다 센다 → { x: Map<mm, 횟수>, y: Map<mm, 횟수> }. toApp: DXF → 앱 좌표.
export function dimLines(dims, toApp = p => p) {
  const out = { x: new Map(), y: new Map() };
  for (const d of dims ?? []) {
    if (!d.p1 || !d.p2 || (d.axis !== 'x' && d.axis !== 'y')) continue;
    const m = out[d.axis], i = d.axis === 'x' ? 0 : 1;
    for (const p of [d.p1, d.p2]) { const c = Math.round(toApp(p)[i]); if (Number.isFinite(c)) m.set(c, (m.get(c) ?? 0) + 1); }
  }
  return out;
}

const COL_AGREE = 20;      // 기둥 중심들이 이 안에서 한 줄이어야 기둥 중심선이다(mm)

// 벽 하나의 axisShift. 축에 나란한 벽만 정한다(기운 벽은 0). columns: 앱의 기둥 아이템({ pos, size, rot }).
export const axisShiftOf = (wall, lines, columns = [], P = DXF_PARAMS) => refOf(wall, lines, columns, P).shift;

// → { shift, strong }. strong = 여럿이 재는 선이나 기둥 줄에서 온 기준선(약한 것은 이웃의 강한 기준선에 진다).
function refOf(wall, lines, columns, P) {
  const none = { shift: 0, strong: false };
  const dx = wall.b[0] - wall.a[0], dy = wall.b[1] - wall.a[1], L = Math.hypot(dx, dy);
  if (!L) return none;
  const vertical = Math.abs(dx) <= 1, horizontal = Math.abs(dy) <= 1;
  if (!vertical && !horizontal) return none;
  const i = vertical ? 0 : 1, j = 1 - i;                       // i: 법선 축 · j: 벽이 뻗는 축
  const center = wall.a[i], half = wall.thickness / 2;
  const near = [...(vertical ? lines.x : lines.y)].filter(([c]) => Math.abs(c - center) <= half + P.refOut);
  const nearest = list => list.reduce((m, e) => (!m || Math.abs(e[0] - center) < Math.abs(m[0] - center) ? e : m), null);
  // ① 띠 안의 여럿이 재는 선 ② 띠 중심 가까이(refCore)의 좌표 = 구조체 중심 ③ 띠 밖 refOut 안의 여럿이 재는 선(그리드)
  // ④ 벽에 박힌 기둥 둘 이상의 중심선. 띠 안이 먼저다(띠 밖의 그리드 꼴 좌표는 옆 벽의 것일 수 있다) — 다만 한두 번만 재는
  // 좌표가 면 쪽에 붙어 있으면 옆 벽의 문설주라 건너뛴다.
  const grid = near.filter(([, n]) => n >= P.refGrid);
  const core = nearest(near.filter(([c]) => Math.abs(c - center) <= P.refCore));
  const picked = nearest(grid.filter(([c]) => Math.abs(c - center) <= half)) ?? core ?? nearest(grid);
  let ref = picked?.[0], strong = !!picked && picked[1] >= P.refGrid;
  if (ref == null) {
    const lo = Math.min(wall.a[j], wall.b[j]), hi = Math.max(wall.a[j], wall.b[j]);
    const on = columns.filter(c => {
      const turned = Math.abs(Math.sin((c.rot ?? 0) * Math.PI / 180)) > 0.5;
      const across = (i === 0 ? (turned ? c.size[1] : c.size[0]) : (turned ? c.size[0] : c.size[1])) / 2;
      return c.pos[j] >= lo - 100 && c.pos[j] <= hi + 100 && Math.abs(c.pos[i] - center) <= half + across;   // 기둥 몸통이 벽 띠에 걸친다
    }).map(c => c.pos[i]).sort((a, b) => a - b);
    if (on.length >= 2 && on[on.length - 1] - on[0] <= COL_AGREE && Math.abs(on[0] - center) <= half + P.refOut * 2) { ref = Math.round(on.reduce((a, b) => a + b, 0) / on.length); strong = true; }
  }
  if (ref == null) return none;
  // 벽의 왼쪽 법선 perp(b − a) = (−dy, dx)/L 쪽으로 옮겨진 거리
  const n = [-dy / L, dx / L];
  return { shift: Math.round((ref - center) * n[i]) || 0, strong };
}

// 기준선 없는 벽은 끝이 이어진(INHERIT_GAP 안) 나란한 이웃 벽의 기준선을 물려받는다 — 외벽이 창 옆에서 살짝 꺾여 생긴
// 얇은 토막은 제 띠에서 그리드가 멀어 기준선을 못 찾는다. 이웃 벽이 2·refOut보다 멀리 물러나 있으면 다른 줄이라 물려받지 않는다
// (기준선까지의 거리는 보지 않는다 — 설계자의 면적선은 벽이 물러나도 그리드를 따라 곧게 간다).
// weak: 약한 기준선을 단 벽들 — 이웃의 강한 기준선이 있으면 그것으로 바꾼다(없으면 그대로).
const INHERIT_GAP = 600;
export function inheritRefs(walls, P = DXF_PARAMS, weak = new Set()) {
  const axisOf = w => (Math.abs(w.b[0] - w.a[0]) <= 1 ? 0 : Math.abs(w.b[1] - w.a[1]) <= 1 ? 1 : -1);
  const normal = w => { const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy); return [-dy / L, dx / L]; };
  const refAbs = w => w.a[axisOf(w)] + w.axisShift * normal(w)[axisOf(w)];
  const src = walls.filter(w => w.axisShift && !weak.has(w) && axisOf(w) >= 0).map(w => ({ w, i: axisOf(w), ref: refAbs(w) }));
  for (const w of walls) {
    const i = axisOf(w);
    if (i < 0 || (w.axisShift && !weak.has(w))) continue;
    const j = 1 - i, lo = Math.min(w.a[j], w.b[j]), hi = Math.max(w.a[j], w.b[j]), center = w.a[i];
    let best = null;
    for (const s of src) {
      if (s.i !== i || s.w === w) continue;
      const slo = Math.min(s.w.a[j], s.w.b[j]), shi = Math.max(s.w.a[j], s.w.b[j]);
      if (Math.max(lo, slo) - Math.min(hi, shi) > INHERIT_GAP) continue;                    // 축 방향으로 이어져 있지 않다
      const d = Math.abs(s.ref - center);
      if (Math.abs(s.w.a[i] - center) > 2 * P.refOut) continue;                             // 다른 줄의 벽이다
      if (!best || d < best.d) best = { d, ref: s.ref };
    }
    if (best) { const s = Math.round((best.ref - center) * normal(w)[i]); if (s) w.axisShift = s; }
  }
  return walls;
}

// 벽 전체의 기준선: 벽마다 고르고(refOf), 기준선 없는 벽·약한 기준선은 이어진 이웃의 강한 기준선을 따른다.
export function assignRefs(walls, lines, columns = [], P = DXF_PARAMS) {
  const weak = new Set();
  for (const w of walls) {
    const r = refOf(w, lines, columns, P);
    if (r.shift) w.axisShift = r.shift; else delete w.axisShift;
    if (r.shift && !r.strong) weak.add(w);
  }
  return inheritRefs(walls, P, weak);
}
