// 벽에 붙어 달리는 마감 띠(src/io/dxf/linings.js · 2026-10-02). 사동중 조리실 북서 모서리: 외벽(360) 안쪽 면을 따라
// 타일 마감 띠(285 · 길이 2 m)가 벽으로 읽혔고, 식당|조리실 구획 벽의 북쪽 끝이 외벽이 아니라 **그 띠의 중심**에서
// 끝났다 — 348 mm 틈으로 두 실이 이어져 한 방(495 m²)이 됐다. 좌표는 DXF 좌표(mm)다.
import { test, expect } from 'vitest';
import { absorbLinings } from '../src/io/dxf/linings.js';

const wall = (x1, y1, x2, y2, thickness, extra = {}) => ({ a: [x1, y1], b: [x2, y2], thickness, ...extra });

test('두꺼운 벽에 몸통이 닿아 나란히 달리는 얇고 짧은 띠는 그 벽의 마감이다 — 지우고, 띠에 닿았던 벽 끝은 그 벽까지 잇는다', () => {
  const ext = wall(0, 0, 9000, 0, 360), lining = wall(2400, -348, 4366, -348, 285);       // 몸통 틈 25.5 mm
  const cross = wall(2400, -2171, 2400, -348, 355), far = wall(7000, -3000, 7000, -1000, 200);
  const out = absorbLinings([ext, lining, cross, far]);
  expect(out).toHaveLength(3);
  expect(out.find(w => w.thickness === 285)).toBeUndefined();
  expect(out.find(w => w.thickness === 355)).toMatchObject({ a: [2400, -2171], b: [2400, 0] });
  expect(out.find(w => w.thickness === 200)).toMatchObject({ a: [7000, -3000], b: [7000, -1000] });    // 닿지 않은 벽은 그대로
  // 띠 몸통 중간에 닿은 벽 끝도 잇는다(끝점이 아니어도)
  const mid = absorbLinings([ext, lining, wall(3000, -2000, 3000, -490, 200)]);
  expect(mid.find(w => w.thickness === 200)).toMatchObject({ a: [3000, -2000], b: [3000, 0] });
});

test('마감 띠가 아닌 것은 그대로 둔다', () => {
  const ext = wall(0, 0, 9000, 0, 360);
  // 몸통이 떨어져 있다(틈 > 60 mm) — 복도 양쪽 벽
  expect(absorbLinings([ext, wall(2400, -600, 4366, -600, 285)])).toHaveLength(2);
  // 더 두껍다 — 벽기둥·덧벽이지 마감이 아니다
  expect(absorbLinings([ext, wall(2400, -400, 4366, -400, 400)])).toHaveLength(2);
  // 긴 벽의 끝을 넘어 달린다 — 이어지는 다른 벽이다
  expect(absorbLinings([ext, wall(7500, -348, 10500, -348, 285)])).toHaveLength(2);
  // 한 직선 위(이어진 벽) · 직각 · 꺾임 토막
  expect(absorbLinings([ext, wall(9000, 0, 12000, 0, 200), wall(3000, 0, 3000, -3000, 200), wall(5000, -100, 5000, -348, 285, { jog: true })])).toHaveLength(4);
});
