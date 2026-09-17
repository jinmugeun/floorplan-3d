import { dist } from './vec.js';

const HOLE_KINDS = ['door', 'window', 'opening'];

// 벽 위 개구부를 벽 a→b 방향 구간 [u0, u1](mm)과 높이 구간 [z0, z1](mm)로 바꾼다.
// 개구부 크기는 아이템 자신의 크기다(너비 size[0], 높이 size[2], sill = z).
export function openingsOnWall(items, wall) {
  const len = dist(wall.a, wall.b);
  const out = [];
  for (const it of items ?? []) {
    if (it.hidden || it.wallId !== wall.id || !HOLE_KINDS.includes(it.kind)) continue;
    const uc = it.t * len, half = it.size[0] / 2;
    out.push({ u0: uc - half, u1: uc + half, z0: it.z, z1: it.z + it.size[2], itemId: it.id });
  }
  return out.sort((a, b) => a.u0 - b.u0);
}

// 개구부를 뺀 벽 조각. 개구부마다 좌측 전체 높이 · 하단(sill 밑) · 상단(lintel 위)을 내고,
// 마지막에 오른쪽 남은 부분을 낸다(개구부 1개 = 최대 4조각). start/end로 벽 접합 연장분을 넘긴다.
export function wallPieces(wall, openings, { start = 0, end = null } = {}) {
  const L = end ?? dist(wall.a, wall.b);
  const H = wall.height;
  const out = [];
  let u = start;
  for (const o of openings ?? []) {
    const u0 = Math.max(start, Math.min(o.u0, L)), u1 = Math.max(start, Math.min(o.u1, L));
    const z0 = Math.max(0, Math.min(o.z0, H)), z1 = Math.max(0, Math.min(o.z1, H));
    if (u1 - u0 <= 1 || z1 - z0 <= 1) continue;        // 벽 밖이거나 높이가 없는 개구부는 무시
    // u 구간이 앞 개구부에 완전히 잠긴 개구부는 건너뛰고, 걸친 개구부는 겹치는 앞부분을 잘라 쓴다.
    // (자르지 않으면 이 개구부의 sill·lintel 조각이 앞 개구부의 구멍을 다시 막는다.)
    if (u1 <= u + 1) continue;
    const a0 = Math.max(u0, u), a1 = u1;
    if (a0 > u + 1) out.push({ u0: u, u1: a0, z0: 0, z1: H });
    if (z0 > 1) out.push({ u0: a0, u1: a1, z0: 0, z1: z0 });   // 창 밑
    if (z1 < H - 1) out.push({ u0: a0, u1: a1, z0: z1, z1: H }); // 문·창 위
    u = Math.max(u, a1);
  }
  if (L - u > 1) out.push({ u0: u, u1: L, z0: 0, z1: H });
  return out;
}
