import { dist, add, sub, mul, dot } from './vec.js';

// 벽 선분 위의 수선의 발(perpendicular foot), 선분 밖으로는 벗어나지 않도록 클램프한다.
// walls.js의 distToSegment와 같은 계산이지만, snap.js가 walls.js를 import하면
// 순환 의존(walls.js가 schema.js를 import)이 생기므로 여기 별도로 둔다.
function footOnSegment(p, a, b) {
  const ab = sub(b, a), l2 = dot(ab, ab);
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return add(a, mul(ab, t));
}

// 직교 모드로 잠긴 축의 직선(y = anchor[1] 또는 x = anchor[0])과 벽 선분의 교점.
// 선분과 평행하거나 선분 범위 밖이면 null.
function lockedAxisIntersection(a, b, yLocked, xLocked, anchor) {
  const ab = sub(b, a);
  if (yLocked) {
    if (ab[1] === 0) return null;
    const t = (anchor[1] - a[1]) / ab[1];
    return t < 0 || t > 1 ? null : add(a, mul(ab, t));
  }
  if (xLocked) {
    if (ab[0] === 0) return null;
    const t = (anchor[0] - a[0]) / ab[0];
    return t < 0 || t > 1 ? null : add(a, mul(ab, t));
  }
  return null;
}

export function snapPoint(p, { points = [], tol = 150, anchor = null, ortho = false, snap = true, guides = [], walls = [] } = {}) {
  let point = [p[0], p[1]], hit = null;
  const alignGuides = [];
  if (ortho && anchor) {
    const dx = Math.abs(p[0] - anchor[0]), dy = Math.abs(p[1] - anchor[1]);
    point = dx >= dy ? [p[0], anchor[1]] : [anchor[0], p[1]];
    hit = 'ortho';
  }
  if (!snap) return { point, guides: alignGuides, hit };
  let best = null, bestD = tol;
  for (const q of points) { const d = dist(point, q); if (d <= bestD) { best = q; bestD = d; } }
  if (best) return { point: [best[0], best[1]], guides: alignGuides, hit: 'point' };
  for (const g of guides) {
    if (g.type === 'v' && Math.abs(g.pos - point[0]) <= tol) { point[0] = g.pos; hit = 'guide'; }
    if (g.type === 'h' && Math.abs(g.pos - point[1]) <= tol) { point[1] = g.pos; hit = 'guide'; }
  }
  if (hit === 'guide') return { point, guides: [], hit };
  // 직교 모드가 고정한 축은 정렬 스냅으로 바꾸지 않는다.
  const yLocked = ortho && anchor && point[1] === anchor[1];
  const xLocked = ortho && anchor && point[0] === anchor[0];
  if (walls.length) {
    let nearestWall = null, nearestD = Infinity;
    for (const w of walls) {
      const d = dist(point, footOnSegment(point, w.a, w.b));
      if (d < nearestD) { nearestD = d; nearestWall = w; }
    }
    if (nearestWall) {
      let wallPoint = null;
      if (yLocked || xLocked) {
        const inter = lockedAxisIntersection(nearestWall.a, nearestWall.b, yLocked, xLocked, anchor);
        if (inter && dist(point, inter) <= tol) wallPoint = inter;
      } else if (nearestD <= tol) {
        wallPoint = footOnSegment(point, nearestWall.a, nearestWall.b);
      }
      if (wallPoint) return { point: [wallPoint[0], wallPoint[1]], guides: [], hit: 'wall' };
    }
  }
  const vx = xLocked ? null : points.find(q => Math.abs(q[0] - point[0]) <= tol);
  const hy = yLocked ? null : points.find(q => Math.abs(q[1] - point[1]) <= tol);
  if (vx) { point[0] = vx[0]; alignGuides.push({ type: 'v', x: vx[0] }); hit = 'align'; }
  if (hy) { point[1] = hy[1]; alignGuides.push({ type: 'h', y: hy[1] }); hit = 'align'; }
  return { point, guides: alignGuides, hit };
}
