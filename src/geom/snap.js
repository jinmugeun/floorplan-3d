import { dist } from './vec.js';

export function snapPoint(p, { points = [], tol = 150, anchor = null, ortho = false, snap = true } = {}) {
  let point = [p[0], p[1]], hit = null;
  const guides = [];
  if (ortho && anchor) {
    const dx = Math.abs(p[0] - anchor[0]), dy = Math.abs(p[1] - anchor[1]);
    point = dx >= dy ? [p[0], anchor[1]] : [anchor[0], p[1]];
    hit = 'ortho';
  }
  if (!snap) return { point, guides, hit };
  let best = null, bestD = tol;
  for (const q of points) { const d = dist(point, q); if (d <= bestD) { best = q; bestD = d; } }
  if (best) return { point: [best[0], best[1]], guides, hit: 'point' };
  // 직교 모드가 고정한 축은 정렬 스냅으로 바꾸지 않는다.
  const yLocked = ortho && anchor && point[1] === anchor[1];
  const xLocked = ortho && anchor && point[0] === anchor[0];
  const vx = xLocked ? null : points.find(q => Math.abs(q[0] - point[0]) <= tol);
  const hy = yLocked ? null : points.find(q => Math.abs(q[1] - point[1]) <= tol);
  if (vx) { point[0] = vx[0]; guides.push({ type: 'v', x: vx[0] }); hit = 'align'; }
  if (hy) { point[1] = hy[1]; guides.push({ type: 'h', y: hy[1] }); hit = 'align'; }
  return { point, guides, hit };
}
