import { uid } from '../state/schema.js';
import { sub, add, mul, dot, cross, dist, eq } from './vec.js';

const JOIN_TOL = 1;

// 선분 p+t*d(단위벡터) 위에서 점 q의 매개변수 t(mm)
const paramOn = (p, d, q) => dot(sub(q, p), d);

function splitAt(w, point) {
  if (eq(w.a, point, JOIN_TOL) || eq(w.b, point, JOIN_TOL)) return null;
  return [{ ...w, b: [...point] }, { ...w, id: uid('w'), a: [...point] }];
}

// 두 벽의 관계를 한 번만 해소한다. 바뀌면 대체할 벽 배열을, 아니면 null을 돌려준다.
function resolvePair(A, B) {
  const dA = sub(A.b, A.a), dB = sub(B.b, B.a);
  const lA = dist(A.a, A.b), lB = dist(B.a, B.b);
  if (lA <= JOIN_TOL || lB <= JOIN_TOL) return null;
  const uA = mul(dA, 1 / lA), uB = mul(dB, 1 / lB);
  const parallel = Math.abs(cross(uA, uB)) < 1e-6;
  if (parallel) {
    // 같은 직선 위인가: B.a가 A의 직선에서 tol 이내
    const off = Math.abs(cross(uA, sub(B.a, A.a)));
    if (off > JOIN_TOL) return null;
    const t1 = paramOn(A.a, uA, B.a), t2 = paramOn(A.a, uA, B.b);
    const bMin = Math.min(t1, t2), bMax = Math.max(t1, t2);
    if (Math.min(lA, bMax) - Math.max(0, bMin) <= JOIN_TOL) return null; // 겹치지 않음(끝만 닿는 경우 포함)
    const ts = [...new Set([0, lA, bMin, bMax].map(v => Math.round(v)))].sort((x, y) => x - y);
    const pieces = [];
    let usedA = false, usedB = false;
    for (let i = 0; i + 1 < ts.length; i++) {
      const s = ts[i], e = ts[i + 1]; if (e - s <= JOIN_TOL) continue;
      const inA = s >= -JOIN_TOL && e <= lA + JOIN_TOL, inB = s >= bMin - JOIN_TOL && e <= bMax + JOIN_TOL;
      const src = inA ? A : B;
      let id;
      if (inA && !usedA) { id = A.id; usedA = true; } else if (inB && !usedB) { id = B.id; usedB = true; } else id = uid('w');
      pieces.push({ ...src, id, a: add(A.a, mul(uA, s)), b: add(A.a, mul(uA, e)) });
    }
    return pieces;
  }
  // 교차/T자: A.a + s*dA = B.a + t*dB
  const den = cross(dA, dB);
  const s = cross(sub(B.a, A.a), dB) / den, t = cross(sub(B.a, A.a), dA) / den;
  const P = add(A.a, mul(dA, s));
  const insideA = s * lA > JOIN_TOL && (1 - s) * lA > JOIN_TOL;
  const insideB = t * lB > JOIN_TOL && (1 - t) * lB > JOIN_TOL;
  const onA = s * lA >= -JOIN_TOL && (1 - s) * lA >= -JOIN_TOL; // 끝점 포함
  const onB = t * lB >= -JOIN_TOL && (1 - t) * lB >= -JOIN_TOL;
  if (insideA && insideB) return [...splitAt(A, P), ...splitAt(B, P)];
  if (insideA && onB) { const sp = splitAt(A, P); return sp ? [...sp, B] : null; }
  if (insideB && onA) { const sp = splitAt(B, P); return sp ? [A, ...sp] : null; }
  return null;
}

export function normalizeWalls(walls, tol = JOIN_TOL) {
  let list = walls.map(w => ({ ...w, a: [...w.a], b: [...w.b] }));
  for (let guard = 0; guard < 200; guard++) {
    let changed = false;
    outer: for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const r = resolvePair(list[i], list[j]);
        if (r) { const rest = list.filter((_, k) => k !== i && k !== j); list = [...rest, ...r]; changed = true; break outer; }
      }
    }
    if (!changed) break;
  }
  // 완전 중복 제거, 너무 짧은 조각 제거
  const out = [];
  for (const w of list) {
    if (dist(w.a, w.b) <= tol) continue;
    if (out.some(x => (eq(x.a, w.a) && eq(x.b, w.b)) || (eq(x.a, w.b) && eq(x.b, w.a)))) continue;
    out.push(w);
  }
  return out;
}
