// 벽에 붙어 달리는 마감 띠(src/io/dxf/linings.js · 2026-10-02). 사동중 조리실 북서 모서리: 외벽(360) 안쪽 면을 따라
// 타일 마감 띠(285 · 길이 2 m)가 벽으로 읽혔고, 식당|조리실 구획 벽의 북쪽 끝이 외벽이 아니라 **그 띠의 중심**에서
// 끝났다 — 348 mm 틈으로 두 실이 이어져 한 방(495 m²)이 됐다. 좌표는 DXF 좌표(mm)다.
import { test, expect } from 'vitest';
import { absorbLinings, buttJoin } from '../src/io/dxf/linings.js';

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

// 2026-10-02 신상중: 식당 북쪽 외벽(200)과 창벽(150)의 끊긴 끝이 1,025 mm 틈을 두고 **마주 보는데 중심선이 175 mm
// 어긋나** 있었다 — 틈에는 다른 레이어('8')로 그린 얇은 벽 두 줄이 있었다. 같은 띠가 아니라 띠 잇기가, 나란해서
// joinEnds가 잇지 못했다. 몸통 폭 안에서 어긋나 마주 보는 두 끝은 맞대어 잇는다(얇은 쪽을 늘이고 꺾임 벽을 둔다).
test('buttJoin: 몸통 폭 안에서 어긋나 마주 보는 두 끊긴 끝을 잇는다 — 먼 틈은 선이 받칠 때만', () => {
  const left = wall(-9000, 0, -1025, 0, 200), right = wall(0, 175, 6000, 175, 150);
  const P = { bareReach: 1000, extend: 4000 };
  // 틈 1,025 > bareReach: 받치는 선이 없으면 그대로
  expect(buttJoin([left, right], P, () => false)).toHaveLength(2);
  const seen = [];
  const out = buttJoin([left, right], P, (...a) => { seen.push(a); return true; });
  expect(out).toHaveLength(3);
  expect(out[1]).toMatchObject({ a: [-1025, 175], b: [6000, 175], thickness: 150 });      // 얇은 쪽이 제 축 위에서 늘어난다
  expect(out[2]).toMatchObject({ a: [-1025, 175], b: [-1025, 0], thickness: 150, jog: true });
  expect(out[0]).toMatchObject({ a: [-9000, 0], b: [-1025, 0] });
  expect(seen[0]).toEqual([[0, 175], [-1025, 175], 150]);
  // bareReach 안의 틈은 근거 없이 잇는다
  expect(buttJoin([wall(-9000, 0, -800, 0, 200), right], P, () => false)).toHaveLength(3);
  // 한 직선 위면 꺾임 없이 끝이 만난다
  const flat = buttJoin([wall(-9000, 175, -800, 175, 200), right], P, () => false);
  expect(flat).toHaveLength(2);
  expect(flat[1].a).toEqual([-800, 175]);
});

test('buttJoin: 맞댈 수 없는 끝은 그대로 둔다', () => {
  const P = { bareReach: 1000, extend: 4000 }, right = wall(0, 175, 6000, 175, 150), yes = () => true;
  // 두 몸통이 면만 맞닿아도(어긋남 = 두께 합의 절반 — 실파일 175.00001) 맞댄다
  expect(buttJoin([wall(-9000, -0.00001, -500, -0.00001, 200), right], P, yes)).toHaveLength(3);
  // 몸통 폭 밖으로 어긋났다(복도 양쪽 벽)
  expect(buttJoin([wall(-9000, -400, -500, -400, 200), right], P, yes)).toHaveLength(2);
  // 연장 한도보다 멀다
  expect(buttJoin([wall(-9000, 0, -4500, 0, 200), right], P, yes)).toHaveLength(2);
  // 늘어날 쪽 끝이 이미 다른 벽에 이어져 있다(끝점이 0.4 mm 어긋나 있어도 이어진 것이다)
  expect(buttJoin([wall(-9000, 0, -500, 0, 200), wall(-500, 0, -500, -3000, 200), right, wall(0.4, 175, 0.4, 3000, 150)], P, yes)).toHaveLength(4);
  // T자로 다른 벽의 몸통에 닿은 끝도 이어진 것이다
  expect(buttJoin([wall(-9000, 0, -500, 0, 200), wall(-500, -2000, -500, 2000, 200), right, wall(0, -1000, 0, 3000, 150)], P, yes)).toHaveLength(4);
  // 마주 보지 않는다(같은 쪽을 향한 끝 · 서로 지나친 끝)
  expect(buttJoin([wall(500, 0, 9000, 0, 200), right], P, yes)).toHaveLength(2);
});

// 신상중 B 식당 남서 모서리: 식당 남쪽 벽(150)이 모서리 기둥의 동쪽 면에서 끝났다 — 400 mm 앞에 주방 남쪽 벽(200)과
// 서쪽 벽이 만나는 모서리가 있는데, 두 남쪽 벽의 중심선이 175 mm 어긋나 있어 닿지 못했다(끊긴 끝은 기둥 몸통에 가려
// 배너에도 나오지 않았다). 마주 보는 상대 끝은 **이미 이어진 모서리**여도 된다 — 끊긴 쪽만 늘인다.
test('buttJoin: 끊긴 끝이 이미 이어진 모서리를 마주 보면 그 모서리까지 맞댄다', () => {
  const P = { bareReach: 1000, extend: 4000 };
  const south = wall(-4000, 0, -400, 0, 200), west = wall(-400, 0, -400, 5000, 200), dining = wall(0, -175, 9000, -175, 150);
  const out = buttJoin([south, west, dining], P, () => false);
  expect(out).toHaveLength(4);
  expect(out[2]).toMatchObject({ a: [-400, -175], b: [9000, -175] });
  expect(out[3]).toMatchObject({ a: [-400, -175], b: [-400, 0], thickness: 150, jog: true });
  expect([out[0].b, out[1].a]).toEqual([[-400, 0], [-400, 0]]);          // 모서리는 그대로다
  // 한 직선 위의 모서리면 끝이 그 점에 닿는다(모서리 점은 옮기지 않는다)
  const flat = buttJoin([south, west, wall(0, 0, 9000, 0, 150)], P, () => false);
  expect(flat).toHaveLength(3);
  expect(flat[2].a).toEqual([-400, 0]);
});
