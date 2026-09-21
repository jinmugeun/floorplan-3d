// 덕트 폴리라인의 순수 기하(명세 §11.2 DT-01~07, 아키텍처 §11.2).
// three도 DOM도 스토어도 쓰지 않는다 — ductTool·ductSelect·ducts2d·ducts3d·풍량이 모두 여기를 부른다.
import { add, sub, mul, norm, perp, dist, lerp } from './vec.js';
import { distToSegment } from './walls.js';
import { pointInItem } from './items.js';

export const DUCT_SNAP_TOL = 300;   // 설비 접속점 스냅 허용 거리(mm, 명세 DT-02)

// 구간 하나를 폭 w의 사각형으로. 길이가 0이면 그릴 것이 없다.
export function segmentQuad(p, q, w) {
  const d = sub(q, p);
  if (!(Math.hypot(d[0], d[1]) > 0)) return null;
  const n = mul(perp(norm(d)), w / 2);
  return [add(p, n), add(q, n), sub(q, n), sub(p, n)];
}

export const segmentLength = (duct, i) => {
  const p = duct?.points?.[i], q = duct?.points?.[i + 1];
  return p && q ? dist(p, q) : 0;
};
export const ductLength = duct => {
  let s = 0;
  for (let i = 0; i < (duct?.points?.length ?? 0) - 1; i++) s += segmentLength(duct, i);
  return s;
};

export function ductPolygons(duct) {
  const out = [];
  for (let i = 0; i < (duct?.points?.length ?? 0) - 1; i++) {
    const q = segmentQuad(duct.points[i], duct.points[i + 1], duct.segments[i]?.w ?? 0);
    if (q) out.push(q);
  }
  return out;
}

// 꼭짓점이 구간보다 먼저다(아키텍처 §11.3). 두 단계로 나눠 도는 이유가 그것이다:
// 한 번에 돌면 덕트 A의 구간이 덕트 B의 꼭짓점을 이긴다. 뒤에 그린 덕트가 먼저 잡힌다.
// 구간 허용치는 띠 반폭과 tol 중 큰 쪽이다(가는 덕트도 클릭할 수 있게).
export function hitDuct(ducts, p, tol = 0) {
  const list = (ducts ?? []).filter(d => d && !d.hidden);
  for (let k = list.length - 1; k >= 0; k--) {
    const d = list[k];
    for (let i = 0; i < d.points.length; i++) if (dist(p, d.points[i]) <= tol) return { ductId: d.id, vertex: i };
  }
  for (let k = list.length - 1; k >= 0; k--) {
    const d = list[k];
    for (let i = 0; i < d.points.length - 1; i++) {
      const a = d.points[i], b = d.points[i + 1];
      if (distToSegment(p, a, b) > Math.max(tol, (d.segments[i]?.w ?? 0) / 2)) continue;
      const ab = sub(b, a), l2 = ab[0] * ab[0] + ab[1] * ab[1];
      const t = l2 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2)) : 0;
      return { ductId: d.id, segment: i, t };
    }
  }
  return null;
}

export function movePoint(duct, i, p) {
  if (!duct?.points?.[i]) return duct;
  return { ...duct, points: duct.points.map((q, k) => (k === i ? [p[0], p[1]] : [...q])) };
}

// 구간 segment 위의 점 p를 그 구간 뒤에 끼운다. 새 구간은 나뉜 구간의 단면을 복제한다(DT-05).
// 쪼개지는 구간 위의 댐퍼는 t를 다시 스케일해 같은 자리에 남는다(쪼개지지 않는 구간은 인덱스만 밀린다).
export function insertPoint(duct, segment, p) {
  const n = duct?.points?.length ?? 0;
  if (!(Number.isInteger(segment) && segment >= 0 && segment < n - 1)) return duct;
  const a = duct.points[segment], b = duct.points[segment + 1];
  const L = dist(a, b);
  const ts = L ? Math.min(1, Math.max(0, dist(a, p) / L)) : 0;   // 쪼개는 지점이 구간에서 차지하는 비율
  const points = duct.points.map(q => [...q]);
  points.splice(segment + 1, 0, [p[0], p[1]]);
  const segments = duct.segments.map(s => ({ ...s }));
  segments.splice(segment + 1, 0, { ...duct.segments[segment] });
  return {
    ...duct, points, segments,
    connections: duct.connections.map(c => ({ ...c, point: c.point > segment ? c.point + 1 : c.point })),
    dampers: duct.dampers.map(x => {
      if (x.segment > segment) return { ...x, segment: x.segment + 1 };
      if (x.segment < segment) return { ...x };
      const t = Math.min(1, Math.max(0, Number(x.t) || 0));
      return t < ts
        ? { ...x, t: ts > 0 ? Math.min(1, Math.max(0, t / ts)) : 0 }
        : { ...x, segment: segment + 1, t: ts < 1 ? Math.min(1, Math.max(0, (t - ts) / (1 - ts))) : 1 };
    }),
  };
}

// 점 2개짜리 덕트는 점을 지울 수 없다(null). 안쪽 점을 지우면 앞뒤 두 구간이 하나로 합쳐지고 그 위의
// 댐퍼는 t를 다시 스케일해 같은 자리에 남는다. 끝 점을 지우면 사라지는 구간의 댐퍼도 함께 사라진다.
export function deletePoint(duct, i) {
  const n = duct?.points?.length ?? 0;
  if (n <= 2 || !(Number.isInteger(i) && i >= 0 && i < n)) return null;
  const drop = Math.min(i, n - 2);            // 끝 점을 지우면 마지막 구간이 사라진다
  const interior = i > 0 && i < n - 1;
  const keep = drop - 1;                      // 합쳐진 구간이 남는 자리(끝 점 삭제면 쓰지 않는다)
  const L1 = interior ? dist(duct.points[i - 1], duct.points[i]) : 0;
  const L2 = interior ? dist(duct.points[i], duct.points[i + 1]) : 0;
  const sum = L1 + L2;
  const dampers = [];
  for (const x of duct.dampers) {
    const t = Math.min(1, Math.max(0, Number(x.t) || 0));
    if (interior && x.segment === keep) {
      dampers.push({ ...x, t: sum ? Math.min(1, Math.max(0, (t * L1) / sum)) : t });
    } else if (interior && x.segment === drop) {
      dampers.push({ ...x, segment: keep, t: sum ? Math.min(1, Math.max(0, (L1 + t * L2) / sum)) : t });
    } else if (x.segment === drop) {
      continue;                                // 끝 점 삭제: 사라지는 구간의 댐퍼도 사라진다
    } else {
      dampers.push({ ...x, segment: x.segment > drop ? x.segment - 1 : x.segment });
    }
  }
  return {
    ...duct,
    points: duct.points.filter((_, k) => k !== i).map(q => [...q]),
    segments: duct.segments.filter((_, k) => k !== drop).map(s => ({ ...s })),
    connections: duct.connections.filter(c => c.point !== i).map(c => ({ ...c, point: c.point > i ? c.point - 1 : c.point })),
    dampers,
  };
}

// 설비의 접속점은 설비 중심이다(아키텍처 §11.2).
export const connectionPoint = item => [item?.pos?.[0] ?? 0, item?.pos?.[1] ?? 0];

// 가장 가까운 "보이는" 설비. 숨긴 설비에는 붙지 않는다(보이지 않는 것에 연결하지 않는다).
// 설비 풋프린트 안이면 거리와 무관하게 스냅한다(명세 DT-02 "설비 위를 클릭"), 풋프린트 밖이라도
// 중심에서 tol 이내면 붙는다(작은 설비 옆을 스치는 클릭). 여럿이 걸리면 중심이 가장 가까운 쪽을 고른다.
export function snapToEquipment(items, p, tol = DUCT_SNAP_TOL) {
  let best = null;
  for (const it of items ?? []) {
    if (it?.kind !== 'equipment' || it.hidden) continue;
    const c = connectionPoint(it);
    const d = dist(p, c);
    if ((pointInItem(p, it, 0) || d <= tol) && (!best || d < best.d)) best = { itemId: it.id, pos: c, d };
  }
  return best ? { itemId: best.itemId, pos: [...best.pos] } : null;
}

// 설비 윗면과 덕트 구간 아랫면을 잇는 수직 덕트(명세 DT-07). 어느 쪽이 위인지는 정해져 있지 않으므로
// 작은 쪽에서 큰 쪽으로 잇고, 10 mm 미만이면 만들지 않는다. 단면은 그 구간 단면의 짧은 변 정사각형이다.
export function riser(item, duct, conn) {
  const i = conn?.point ?? 0;
  const seg = duct?.segments?.[Math.min(i, (duct?.segments?.length ?? 1) - 1)];
  if (!item || !seg) return null;
  const top = (Number(item.z) || 0) + (Number(item.size?.[2]) || 0);
  const bottom = seg.z - seg.h / 2;
  const z0 = Math.min(top, bottom), z1 = Math.max(top, bottom);
  if (z1 - z0 < 10) return null;
  const side = Math.min(seg.w, seg.h);
  return { pos: connectionPoint(item), z0, z1, w: side, h: side };
}

export function damperPos(duct, damper) {
  const a = duct?.points?.[damper?.segment], b = duct?.points?.[(damper?.segment ?? -1) + 1];
  if (!a || !b) return null;
  return lerp(a, b, Math.min(1, Math.max(0, Number(damper.t) || 0)));
}
