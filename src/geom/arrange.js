import { itemAABB, RAD, DEG, normDeg } from './items.js';
import { sub, dist } from './vec.js';

// 직선 배열: i번째 사본의 오프셋은 간격의 (i+1)배.
export function linearOffsets({ dx = 0, dy = 0, count = 1 } = {}) {
  const n = Math.max(0, Math.round(count));
  return Array.from({ length: n }, (_, i) => [dx * (i + 1), dy * (i + 1)]);
}

// 원형 배열: center를 중심으로 angle°씩 count개. rotate면 아이템 자체도 같은 각도만큼 돈다.
// center를 아이템 자기 위치로 주면 회전 복사(제자리에서 각도만 바뀜)가 된다.
export function circularPlacements(item, { center = [0, 0], angle = 30, count = 1, rotate = true } = {}) {
  const n = Math.max(0, Math.round(count));
  const v = sub(item.pos, center);
  const out = [];
  for (let i = 1; i <= n; i++) {
    const a = RAD(angle * i), c = Math.cos(a), s = Math.sin(a);
    out.push({
      pos: [center[0] + v[0] * c - v[1] * s, center[1] + v[0] * s + v[1] * c],
      rot: rotate ? normDeg(item.rot + angle * i) : normDeg(item.rot),
    });
  }
  return out;
}

// 정렬: axis 'h'는 x(왼·가운데·오른), 'v'는 y(위·중간·아래). 회전한 아이템도 AABB로 맞춘다.
export function alignPatches(items, axis, mode) {
  if (!items || items.length < 2) return [];
  const a = axis === 'h' ? 0 : 1;
  const boxes = items.map(it => ({ it, b: itemAABB(it) }));
  const min = Math.min(...boxes.map(x => x.b.min[a]));
  const max = Math.max(...boxes.map(x => x.b.max[a]));
  const mid = (min + max) / 2;
  return boxes.map(({ it, b }) => {
    const half = (b.max[a] - b.min[a]) / 2;
    const cur = (b.min[a] + b.max[a]) / 2;
    const target = mode === 'start' ? min + half : mode === 'end' ? max - half : mid;
    const pos = [...it.pos];
    pos[a] += target - cur;
    return { id: it.id, patch: { pos } };
  });
}

// 경로 배열(§13.1): 폴리라인 points(≥ 2)를 따라 시작점부터 spacing mm 간격으로 놓는다.
// count가 1 이상이면 spacing을 "전체 길이 / count"로 덮어쓰고 정확히 count개를 낸다.
// follow면 그 구간의 방향각으로 돈다(rot = atan2를 도로, 90° 스냅 없음), 아니면 원본 회전 유지.
// 원본 자리(s = 0)는 건너뛰지 않는다 — 사용자가 경로를 원본에서 시작하지 않아도 되게 한 결정이다.
// 꺾이는 점(s가 구간 경계와 딱 같은 자리)은 앞 구간에 속하므로 앞 구간의 각도를 쓴다.
export function pathPlacements(item, points, { spacing = 600, count = null, follow = true } = {}) {
  const pts = (points ?? []).filter(p => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])));
  if (pts.length < 2) return [];
  // 길이 0 구간(같은 점을 두 번 찍은 경우)은 버린다. at = 경로 시작부터 이 구간 시작까지의 거리.
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = dist(pts[i], pts[i + 1]);
    if (!(d > 0)) continue;
    segs.push({ a: pts[i], b: pts[i + 1], len: d, at: total });
    total += d;
  }
  if (!segs.length) return [];
  const n = Number(count) >= 1 ? Math.round(Number(count)) : null;
  const step = n ? total / n : Math.abs(Number(spacing) || 0);
  if (!(step > 0)) return [];
  const limit = n ?? Math.floor(total / step) + 1;
  const out = [];
  for (let i = 0; i < limit; i++) {
    const s = Math.min(i * step, total);
    const seg = segs.find(g => s <= g.at + g.len) ?? segs[segs.length - 1];
    const t = (s - seg.at) / seg.len;
    out.push({
      pos: [seg.a[0] + (seg.b[0] - seg.a[0]) * t, seg.a[1] + (seg.b[1] - seg.a[1]) * t],
      rot: follow ? normDeg(DEG(Math.atan2(seg.b[1] - seg.a[1], seg.b[0] - seg.a[0]))) : normDeg(item?.rot),
    });
  }
  return out;
}
