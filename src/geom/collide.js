import { itemCorners } from './items.js';
import { sub, dot, norm, perp } from './vec.js';

const axesOf = pts => [norm(sub(pts[1], pts[0])), norm(sub(pts[3], pts[0]))].map(perp);
const project = (pts, ax) => { const vs = pts.map(p => dot(p, ax)); return [Math.min(...vs), Math.max(...vs)]; };

// 회전 사각형(OBB) 두 개의 겹침을 분리축 정리(SAT)로 본다. 축은 두 사각형의 변 법선 4개면 충분하다.
// 겹침이 tol(mm) 이하면 "맞닿았다"로 보고 충돌이 아니다.
export function obbOverlap(a, b, tol = 1) {
  const A = itemCorners(a), B = itemCorners(b);
  for (const ax of [...axesOf(A), ...axesOf(B)]) {
    const [a0, a1] = project(A, ax), [b0, b1] = project(B, ax);
    if (Math.min(a1, b1) - Math.max(a0, b0) <= tol) return false;
  }
  return true;
}

// 같은 층의 바닥 아이템끼리 겹치는 것들의 id. 벽·천장 부착과 숨긴 아이템은 보지 않는다.
export function collidingIds(items, { tol = 1 } = {}) {
  const list = (items ?? []).filter(i => !i.hidden && (i.attach === 'floor' || i.attach === 'floorLay'));
  const out = new Set();
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const aTop = a.z + a.size[2], bTop = b.z + b.size[2];
      if (a.z >= bTop - tol || b.z >= aTop - tol) continue; // 높이 구간이 안 겹치면 충돌 아님
      if (obbOverlap(a, b, tol)) { out.add(a.id); out.add(b.id); }
    }
  }
  return out;
}
