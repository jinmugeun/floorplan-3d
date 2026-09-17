import { itemAABB, RAD, normDeg } from './items.js';
import { sub } from './vec.js';

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
