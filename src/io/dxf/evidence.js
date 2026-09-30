// 긴 연장·다리의 근거(2026-09-30 실파일 정확도 2차). walls.js의 joinEnds와 bands.js의 chainRuns가 "이 길이 문·창
// 자리를 지나는가 / 벽 선이 받치는가"를 묻는다 — 근거 없이 빈 바닥을 건너면 없는 벽이 선다(세척실 날개벽 3.1 m ·
// 현관 벽 2.8 m · 405 벽 안의 100 모서리 띠).
import { mergeIv } from './faces.js';
import { OPEN_BLOCK } from './openings.js';

// 문·창 근거 점(2026-09-30): 개구부 레이어의 선·호와 창·문 이름 블록(OPEN_BLOCK)의 선·호. 반환 evidence(p, q, th) —
// 길 p → q(반폭 th/2 + EVIDENCE_PAD) 안에 근거 점이 있는가. 근거가 하나도 없는 도면은 가릴 수 없어 null이다.
const EVIDENCE_PAD = 100;
export function openingEvidence(ex, openFaceLayers, inRoi) {
  const ok = x => openFaceLayers.has(x.layer) || OPEN_BLOCK.test(x.block ?? '');
  const pts = [];
  for (const s of ex.segs) if (ok(s) && (inRoi(s.a) || inRoi(s.b))) pts.push(s.a, s.b, [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2]);
  for (const a of [...(ex.arcs ?? []), ...(ex.polyArcs ?? [])]) if (ok(a) && inRoi(a.c)) pts.push(a.c);
  if (!pts.length) return null;
  const C = 1000, grid = new Map(), cell = (i, j) => `${i},${j}`;
  for (const q of pts) { const k = cell(Math.floor(q[0] / C), Math.floor(q[1] / C)); (grid.get(k) ?? grid.set(k, []).get(k)).push(q); }
  return (p, q, th) => {
    const d = [q[0] - p[0], q[1] - p[1]], L = Math.hypot(d[0], d[1]), h = th / 2 + EVIDENCE_PAD;
    if (!L) return false;
    const u = [d[0] / L, d[1] / L];
    for (let i = Math.floor((Math.min(p[0], q[0]) - h) / C); i <= Math.floor((Math.max(p[0], q[0]) + h) / C); i++) {
      for (let j = Math.floor((Math.min(p[1], q[1]) - h) / C); j <= Math.floor((Math.max(p[1], q[1]) + h) / C); j++) {
        for (const r of grid.get(cell(i, j)) ?? []) {
          const v = [r[0] - p[0], r[1] - p[1]], t = v[0] * u[0] + v[1] * u[1];
          if (t > 1 && t < L - 1 && Math.abs(v[1] * u[0] - v[0] * u[1]) <= h) return true;
        }
      }
    }
    return false;
  };
}

// 길 p → q를 벽 선이 받치는가: 길과 나란하고(2°) 벽 두께 안(th/2 + 30)에 든 벽 선이 길의 절반 이상을 덮는다 —
// 면선 하나만 끝까지 그은 벽(픽스처 화장실 칸 앞면)의 연장은 빈 바닥을 건너는 것이 아니다.
export function faceSupport(segs) {
  return (p, q, th) => {
    const d = [q[0] - p[0], q[1] - p[1]], L = Math.hypot(d[0], d[1]);
    if (!L) return false;
    const u = [d[0] / L, d[1] / L], iv = [];
    for (const s of segs) {
      const e = [s.b[0] - s.a[0], s.b[1] - s.a[1]], Ls = Math.hypot(e[0], e[1]);
      if (!Ls || Math.abs(u[0] * e[1] - u[1] * e[0]) / Ls > 0.035) continue;
      if (Math.abs((s.a[0] - p[0]) * u[1] - (s.a[1] - p[1]) * u[0]) > th / 2 + 30) continue;
      const t0 = (s.a[0] - p[0]) * u[0] + (s.a[1] - p[1]) * u[1], t1 = (s.b[0] - p[0]) * u[0] + (s.b[1] - p[1]) * u[1];
      const a = Math.max(0, Math.min(t0, t1)), b = Math.min(L, Math.max(t0, t1));
      if (b > a) iv.push([a, b]);
    }
    return mergeIv(iv).reduce((m, [a, b]) => m + b - a, 0) >= L / 2;
  };
}
