import { itemCorners, itemAABB } from './items.js';
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

// 충돌을 셀 대상과 높이 규칙은 두 함수가 나눠 쓴다(collidingIds · collidingFor).
const FLOOR_ATTACH = new Set(['floor', 'floorLay']);
const collidable = i => !!i && !i.hidden && FLOOR_ATTACH.has(i.attach);
const zOverlap = (a, b, tol) => !(a.z >= b.z + b.size[2] - tol || b.z >= a.z + a.size[2] - tol);

// 같은 층의 바닥 아이템끼리 겹치는 것들의 id. 벽·천장 부착과 숨긴 아이템은 보지 않는다.
// 넓은 단계(2026-10-12 · 계획 13 Task 5 · 사전 검토 I-5): 쌍마다 itemCorners·SAT를 돌던 N²가 DXF로 가져온 기구
// 330개에서 50~65 ms였다(겹침이 없는 흩어진 배치도 같다). 아이템마다 AABB를 한 번 재고 minX로 정렬해 훑는다 —
// x 구간이 떨어지면 뒤의 것도 모두 떨어졌으니 끊고, y 구간이 떨어지면 건너뛴다. 남은 쌍만 지금의 좁은 단계(높이 · SAT)를 지난다.
// 결과가 옛 전수 비교와 같은 까닭: OBB ⊂ AABB라 AABB가 떨어진 두 사각형은 내부가 겹치지 않고, 그러면 SAT의 변 법선 중
// 하나에서 겹침 ≤ 0 ≤ tol이다(좁은 단계도 false). 맞닿은 상자(간격 0)는 부동소수 흔들림이 판정을 뒤집을 수 있어
// 거르지 않고 좁은 단계에 맡긴다(AABB_EPS). tol < 0("떨어져도 충돌")은 이 논증이 서지 않아 거르지 않는다(쓰는 곳 없음).
const AABB_EPS = 1e-6;   // mm. 이만큼은 떨어져야 넓은 단계가 쌍을 버린다
export function collidingIds(items, { tol = 1 } = {}) {
  const list = (Array.isArray(items) ? items : []).filter(collidable)
    .map(it => ({ it, box: itemAABB(it) })).sort((p, q) => p.box.min[0] - q.box.min[0]);
  const pad = tol >= 0 ? AABB_EPS : Infinity;
  const out = new Set();
  for (let i = 0; i < list.length; i++) {
    const { it: a, box: A } = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const { it: b, box: B } = list[j];
      if (B.min[0] > A.max[0] + pad) break;                                       // x로 떨어졌다(정렬했으니 뒤도 모두)
      if (B.min[1] > A.max[1] + pad || A.min[1] > B.max[1] + pad) continue;       // y로 떨어졌다
      if (!zOverlap(a, b, tol)) continue;      // 높이 구간이 안 겹치면 충돌 아님
      if (obbOverlap(a, b, tol)) { out.add(a.id); out.add(b.id); }
    }
  }
  return out;
}

// 드래그 중의 충돌(§15.2). 끌고 있는 것(ids)만 기준으로 나머지와 비교한다: 511개 도면에서
// 전체 N²(130,000쌍)이 아니라 N×|ids|(511쌍)만 돈다. preview(Map<id, item>)가 있으면 그 자리로
// 바꿔 본다 — 프리뷰 드래그는 스토어를 건드리지 않으므로 items의 자리는 아직 옛 자리다.
// 돌려주는 Set은 새 객체다(memoCollisions의 캐시와 달리 호출자가 마음대로 써도 된다).
export function collidingFor(items, ids, preview = null, { tol = 1 } = {}) {
  const set = new Set(ids ?? []);
  const out = new Set();
  if (!set.size) return out;
  const at = i => preview?.get?.(i.id) ?? i;
  const list = (Array.isArray(items) ? items : []).map(at).filter(collidable);
  for (const a of list) {
    if (!set.has(a.id)) continue;
    for (const b of list) {
      if (a.id === b.id) continue;
      if (!zOverlap(a, b, tol)) continue;
      if (obbOverlap(a, b, tol)) { out.add(a.id); out.add(b.id); }
    }
  }
  return out;
}

// 같은 아이템 배열을 여러 번 물어도 한 번만 계산한다(§13.5).
// 스토어가 불변 스냅샷이라 "아이템 배열 참조가 같다 = 아이템이 하나도 안 바뀌었다"가 늘 참이다.
// 2D는 매 프레임(패닝·줌·선택 표시 변화마다) 충돌을 물어보므로, 캐시 없이는 도면을 움직이기만 해도
// SAT를 N² 번 돈다. WeakMap이라 옛 스냅샷은 GC가 알아서 가져간다.
// tol마다 결과가 다르므로 배열 하나당 tol별로 따로 들고 있다(tol은 사실상 1뿐이라 칸이 늘지 않는다).
// 돌려주는 Set은 캐시에 든 내부 객체다: 호출자는 읽기 전용으로만 쓴다(add·delete는 캐시를 오염시킨다 — M-3).
const memo = new WeakMap();
export function memoCollisions(items, { tol = 1 } = {}) {
  // 배열이 아니면 캐시 칸을 잡지 않는다(객체는 typeof 'object'를 지나 collidingIds에서 던졌다 — M-2).
  if (!Array.isArray(items)) return collidingIds(items, { tol });
  let byTol = memo.get(items);
  if (!byTol) memo.set(items, (byTol = new Map()));
  if (!byTol.has(tol)) byTol.set(tol, collidingIds(items, { tol }));
  return byTol.get(tol);
}
