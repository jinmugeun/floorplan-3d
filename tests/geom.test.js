import { describe, test, expect } from 'vitest';
import { add, sub, len, perp, eq } from '../src/geom/vec.js';
import { makeWall, rectWalls, wallPolygon, splitWall, moveWallParallel, moveVertex, hitWall, transformWalls, endpoints, nodeKey } from '../src/geom/walls.js';
import { detectRooms, polygonArea, pointInPolygon, offsetPolygon, centroid, roomInnerPolygon, saneInner } from '../src/geom/rooms.js';

describe('vec', () => {
  test('basics', () => {
    expect(add([1, 2], [3, 4])).toEqual([4, 6]);
    expect(sub([3, 4], [1, 2])).toEqual([2, 2]);
    expect(len([3, 4])).toBe(5);
    expect(perp([1, 0])).toEqual([-0, 1]);
    expect(eq([0, 0], [0.5, 0.5])).toBe(true);
  });
});

describe('walls', () => {
  test('rectWalls makes 4 connected walls', () => {
    const ws = rectWalls([0, 0], [4000, 3000], 200);
    expect(ws).toHaveLength(4);
    expect(endpoints(ws)).toHaveLength(4);
    expect(ws.every(w => w.thickness === 200)).toBe(true);
  });
  test('wallPolygon is offset by half thickness and extended at joints', () => {
    const ws = rectWalls([0, 0], [4000, 3000], 200);
    const top = ws.find(w => w.a[1] === 0 && w.b[1] === 0);
    const poly = wallPolygon(top, ws);
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(-100);
    expect(Math.max(...xs)).toBeCloseTo(4100);
    expect(Math.min(...ys)).toBeCloseTo(-100);
    expect(Math.max(...ys)).toBeCloseTo(100);
  });
  test('splitWall replaces one wall with two sharing the split point', () => {
    const w = makeWall({ a: [0, 0], b: [4000, 0] });
    const out = splitWall([w], w.id, [1000, 5]);
    expect(out).toHaveLength(2);
    expect(out[0].b).toEqual([1000, 0]);
    expect(out[1].a).toEqual([1000, 0]);
  });
  test('moveWallParallel keeps neighbours connected', () => {
    const ws = rectWalls([0, 0], [4000, 3000], 200);
    const top = ws.find(w => w.a[1] === 0 && w.b[1] === 0);
    const out = moveWallParallel(ws, top.id, [0, -500]);
    const moved = out.find(w => w.id === top.id);
    expect(moved.a[1]).toBe(-500);
    expect(endpoints(out)).toHaveLength(4);
    const left = out.find(w => w.id !== top.id && (w.a[0] === 0 && w.b[0] === 0));
    expect(Math.min(left.a[1], left.b[1])).toBe(-500);
  });
  test('moveVertex moves every endpoint at that point', () => {
    const ws = rectWalls([0, 0], [4000, 3000], 200);
    const out = moveVertex(ws, [0, 0], [-200, -300]);
    expect(out.filter(w => eq(w.a, [-200, -300]) || eq(w.b, [-200, -300]))).toHaveLength(2);
  });
  test('hitWall uses half thickness plus tolerance', () => {
    const w = makeWall({ a: [0, 0], b: [4000, 0], thickness: 200 });
    expect(hitWall([w], [2000, 90], 20)).toBe(w);
    expect(hitWall([w], [2000, 130], 20)).toBeNull();
  });
  test('transformWalls flips', () => {
    const ws = rectWalls([0, 0], [4000, 3000], 200);
    const out = transformWalls(ws, p => [-p[0], p[1]]);
    expect(Math.min(...endpoints(out).map(p => p[0]))).toBe(-4000);
  });
});

describe('rooms', () => {
  test('polygonArea and pointInPolygon', () => {
    const sq = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]];
    expect(Math.abs(polygonArea(sq))).toBe(12_000_000);
    expect(pointInPolygon([100, 100], sq)).toBe(true);
    expect(pointInPolygon([-1, 100], sq)).toBe(false);
    expect(centroid(sq)).toEqual([2000, 1500]);
  });
  test('offsetPolygon insets each edge', () => {
    const sq = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]];
    const inner = offsetPolygon(sq, [100, 100, 100, 100]);
    expect(Math.abs(polygonArea(inner))).toBeCloseTo(3800 * 2800);
  });
  test('detectRooms finds one room for a rectangle, none for an open chain', () => {
    const ws = rectWalls([0, 0], [4000, 3000], 200);
    const rooms = detectRooms(ws);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].wallIds).toHaveLength(4);
    expect(rooms[0].area).toBeCloseTo(3.8 * 2.8, 2);
    expect(detectRooms(ws.slice(0, 3))).toHaveLength(0);
  });
  test('detectRooms finds two rooms sharing a wall', () => {
    const a = rectWalls([0, 0], [4000, 3000], 200);
    const b = rectWalls([4000, 0], [7000, 3000], 200);
    // remove duplicate shared wall from b (same segment as a's right wall)
    const shared = b.find(w => w.a[0] === 4000 && w.b[0] === 4000);
    const ws = [...a, ...b.filter(w => w !== shared)];
    const rooms = detectRooms(ws);
    expect(rooms).toHaveLength(2);
  });
  test('detectRooms ignores a duplicate wall on the same two points', () => {
    const a = rectWalls([0, 0], [4000, 3000], 200);
    const b = rectWalls([4000, 0], [7000, 3000], 200); // b의 왼쪽 벽이 a의 오른쪽 벽과 겹친다
    expect(detectRooms([...a, ...b])).toHaveLength(2);
  });
  test('detectRooms matches a previous room by shared wall ids even when the centroid moved far', () => {
    const ws = rectWalls([0, 0], [4000, 3000], 200);
    const first = detectRooms(ws);
    first[0].name = '식당';
    // 이전 방의 중심을 2 m 옮겨 두어도 벽 id 4개 중 3개가 같으면 같은 방이다
    const prev = { ...first[0], points: first[0].points.map(p => [p[0] + 2000, p[1] + 2000]), wallIds: first[0].wallIds.slice(0, 3) };
    const again = detectRooms(ws, [prev]);
    expect(again[0].id).toBe(prev.id);
    expect(again[0].name).toBe('식당');
  });
  test('detectRooms keeps user props when wall ids overlap', () => {
    const ws = rectWalls([0, 0], [4000, 3000], 200);
    const first = detectRooms(ws);
    first[0].name = '가열조리실';
    const again = detectRooms(moveWallParallel(ws, ws[0].id, [0, -100]), first);
    expect(again[0].name).toBe('가열조리실');
    expect(again[0].id).toBe(first[0].id);
  });
  test('detectRooms falls back to centroid matching when no wall ids overlap', () => {
    const ws = rectWalls([0, 0], [4000, 3000], 200);
    const first = detectRooms(ws);
    first[0].name = '식당';
    first[0].wallIds = ['nope'];
    const again = detectRooms(ws, first);
    expect(again[0].name).toBe('식당');
    expect(again[0].id).toBe(first[0].id);
  });
  // 2026-10-06(계획 10 이월 ④): 안쪽 폴리곤은 2D 바닥·3D 바닥/천장/벽면·템플릿이 같이 쓴다. 폭발하면 바깥 폴리곤으로.
  test('roomInnerPolygon은 조각 방에서 폭발하지 않고 바깥 폴리곤(같은 점 수·차례)으로 돌아온다', () => {
    const ws = rectWalls([0, 0], [4000, 3000], 200);
    const [room] = detectRooms(ws);
    const inner = roomInnerPolygon(room, ws);
    expect(inner).toHaveLength(4);
    expect(Math.abs(polygonArea(inner))).toBeCloseTo(3800 * 2800, 3);          // 정상 방은 두께/2만큼 안쪽
    // 폭 6 mm · 길이 5 m 조각(벽 두께 200): 안쪽으로 100씩 밀면 변이 서로를 지나 뒤집힌다.
    const sliver = { points: [[0, 0], [5000, 0], [5000, 6], [0, 6]] };
    const thin = sliver.points.map((p, i) => makeWall({ a: p, b: sliver.points[(i + 1) % 4], thickness: 200, height: 2300 }));
    const out = roomInnerPolygon(sliver, thin);
    expect(out).toEqual(sliver.points);                                          // 바깥 그대로(새 배열)
    expect(out).not.toBe(sliver.points);
    expect(Math.abs(polygonArea(out))).toBe(30000);                              // 0.03 m² — 54.8 m²가 아니다
    // 같은 점이 잇따르면(변 길이 0) vec.norm이 [0, 0]을 주어 그 변은 밀리지 않는다 — 점 수는 그대로 5다.
    const dup = { points: [[0, 0], [0, 0], [4000, 0], [4000, 3000], [0, 3000]] };
    expect(roomInnerPolygon(dup, []).every(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))).toBe(true);
    expect(roomInnerPolygon(dup, [])).toHaveLength(5);
    // 유한하지 않은 점이 섞이면 바깥으로.
    expect(saneInner([[NaN, 0], [1, 0], [1, 1]], [[0, 0], [10, 0], [10, 10]])).toEqual([[0, 0], [10, 0], [10, 10]]);
    expect(saneInner([[0, 0], [1, 0], [1, 1]], [[0, 0], [10, 0], [10, 10]])).toEqual([[0, 0], [1, 0], [1, 1]]);      // 멀쩡하면 그대로
    expect(saneInner([[0, 0], [10, 0], [10, 10]], [[0, 0], [1, 0], [1, 1]])).toEqual([[0, 0], [1, 0], [1, 1]]);      // 바깥보다 크면 바깥
    expect(saneInner([[0, 0], [1, 1], [1, 0]], [[0, 0], [1, 0], [1, 1]])).toEqual([[0, 0], [1, 0], [1, 1]]);         // 부호 뒤집힘
  });
});

test('nodeKey distinguishes endpoints down to 0.01 mm', () => {
  expect(nodeKey([0, 0])).toBe('0,0');
  expect(nodeKey([1500.25, -30.5])).toBe('150025,-3050');
  expect(nodeKey([10.004, 0])).toBe(nodeKey([10, 0]));   // 0.01 mm 미만은 같은 노드
  expect(nodeKey([10.02, 0])).not.toBe(nodeKey([10, 0]));
});

// ── 2026-10-02 면적 기준 "도면 기준(벽·기둥 중심선)" ─────────────────────────────────────────────
// 실파일 사동중: 도면의 실 면적 11개는 전부 치수가 가리키는 선(벽 구조체 중심 · 기둥 그리드)으로 잰 값이었다 —
// 벽 안쪽 면으로 잰 실면적(안목)은 15 m² 방에서 2 m² 작다. 방마다 areaCenter를 함께 낸다: 벽 중심선 폴리곤에서
// 변마다 그 벽의 axisShift(벽의 왼쪽 법선 perp(b − a) 방향으로 기준선이 옮겨진 거리)만큼 옮긴 넓이다.
import { insetPolygon } from '../src/geom/rooms.js';
const W4 = (x0, y0, x1, y1, extra = {}) => [
  makeWall({ a: [x0, y0], b: [x1, y0], thickness: 200 }), makeWall({ a: [x1, y0], b: [x1, y1], thickness: 200, ...extra }),
  makeWall({ a: [x1, y1], b: [x0, y1], thickness: 200 }), makeWall({ a: [x0, y1], b: [x0, y0], thickness: 200 }),
];

test('areaCenter는 벽 중심선 넓이이고 실면적(area)은 안쪽 면 넓이 그대로다', () => {
  const [room] = detectRooms(W4(0, 0, 4000, 3000));
  expect(room.areaCenter).toBeCloseTo(12.0, 6);
  expect(room.area).toBeCloseTo(3.8 * 2.8, 6);
});

test('벽의 axisShift만큼 그 변의 기준선이 옮겨진다 — 한쪽 방이 넓어지면 맞은편 방은 좁아진다', () => {
  // 가운데 벽 x = 4000 (a → b 가 +y 방향이면 왼쪽 법선은 −x): axisShift −100 = 기준선이 x 4100.
  const mid = makeWall({ a: [4000, 0], b: [4000, 3000], thickness: 200 });
  mid.axisShift = -100;
  const walls = [
    makeWall({ a: [0, 0], b: [4000, 0], thickness: 200 }), makeWall({ a: [4000, 0], b: [9000, 0], thickness: 200 }),
    makeWall({ a: [9000, 0], b: [9000, 3000], thickness: 200 }), makeWall({ a: [9000, 3000], b: [4000, 3000], thickness: 200 }),
    makeWall({ a: [4000, 3000], b: [0, 3000], thickness: 200 }), makeWall({ a: [0, 3000], b: [0, 0], thickness: 200 }), mid,
  ];
  const rooms = detectRooms(walls).sort((p, q) => p.points[0][0] - q.points[0][0] || polygonArea(p.points) - polygonArea(q.points));
  const left = rooms.find(r => r.points.every(p => p[0] <= 4000)), right = rooms.find(r => r.points.every(p => p[0] >= 4000));
  expect(left.areaCenter).toBeCloseTo(4.1 * 3.0, 6);
  expect(right.areaCenter).toBeCloseTo(4.9 * 3.0, 6);
  // 벽을 반대 방향으로 그려도(b → a) 같은 자리의 기준선이면 같은 값이다(axisShift의 부호가 뒤집힌다).
  const flip = makeWall({ a: [4000, 3000], b: [4000, 0], thickness: 200 }); flip.axisShift = 100;
  const again = detectRooms([...walls.slice(0, 6), flip]);
  expect(again.find(r => r.points.every(p => p[0] <= 4000)).areaCenter).toBeCloseTo(12.3, 6);
});

test('insetPolygon은 감긴 방향으로 안쪽을 정한다 — ㄱ자 방에서도 변마다 제 쪽으로 옮긴다', () => {
  // ㄱ자: (0,0)-(6000,0)-(6000,2000)-(2000,2000)-(2000,5000)-(0,5000). 모든 변을 100 안으로 → 넓이 = 원래 − 둘레×100 + 모서리 보정
  const L = [[0, 0], [6000, 0], [6000, 2000], [2000, 2000], [2000, 5000], [0, 5000]];
  const full = Math.abs(polygonArea(L));
  expect(full).toBe(6000 * 2000 + 2000 * 3000);
  const inner = Math.abs(polygonArea(insetPolygon(L, L.map(() => 100))));
  expect(inner).toBeCloseTo(5800 * 1800 + 1800 * 3000, 6);        // 가로 띠 5800 × 1800 + 세로 띠 1800 × 3000(겹침 없음)
  // 점 순서를 뒤집어도 같다.
  expect(Math.abs(polygonArea(insetPolygon([...L].reverse(), L.map(() => 100))))).toBeCloseTo(inner, 6);
  // 한 직선 위의 두 변이 서로 다른 값이면 단이 진다(모서리를 잘라 먹지 않는다).
  const S = [[0, 0], [2000, 0], [4000, 0], [4000, 3000], [0, 3000]];
  expect(Math.abs(polygonArea(insetPolygon(S, [0, 100, 0, 0, 0])))).toBeCloseTo(4000 * 3000 - 2000 * 100, 6);
});
