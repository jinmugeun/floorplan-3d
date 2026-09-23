// §18.4. 이 도면의 문은 INSERT 하나가 도면 전체의 문을 담은 블록이라 INSERT 좌표를 쓸 수 없다 —
// 문 위치는 전개 후 **원호의 중심**이다. 좌표는 전부 앱 좌표(mm · y 남쪽)이고 소수를 섞는다.
import { test, expect } from 'vitest';
import { doorHinges, gapOpenings, windowSpans, nearestWall, productForWidth, buildOpenings, DOOR_PRODUCTS, WINDOW_PRODUCTS, OPENING_FALLBACK, OPENING_MATCH_DIST } from '../src/io/dxf/openings.js';
import { DXF_PARAMS as P } from '../src/io/dxf/params.js';
import { makeWall } from '../src/geom/walls.js';

const WALL = makeWall({ a: [-3000, 1500], b: [3000, 1500], thickness: 200, height: 3500 });
const arc = (cx, cy, r, a0, a1, layer = '04창호') => ({ c: [cx, cy], r, a0, a1, layer, depth: 1, block: '문_슬라이딩 포켓 900' });
const seg = (x0, y0, x1, y1, layer = 'WIN') => ({ a: [x0, y0], b: [x1, y1], layer, src: 'LINE' });
const exOf = ({ arcs = [], segs = [] } = {}) => ({ arcs, segs, circles: [], texts: [], inserts: [], dims: [], hatches: [] });
const OPEN = new Set(['04창호', 'WIN']);

test('doorHinges는 반지름·스윕으로 거르고 100 mm 안의 원호를 한 문으로 묶는다', () => {
  const hinges = doorHinges([
    arc(0.5, 1500.25, 900, 0, 90),          // 문 하나
    arc(40.5, 1500.25, 880, 5, 95),         // 같은 문의 두 번째 호(중심 40 mm 차)
    arc(2000.5, 1500.25, 300, 0, 90),       // 반지름이 작다(가구 모서리)
    arc(2400.5, 1500.25, 900, 0, 200),      // 스윕이 크다(원에 가깝다)
    arc(2800.5, 1500.25, 900, 0, 90, 'WAL'),// 개구부 역할 레이어가 아니다
  ], OPEN);
  expect(hinges).toHaveLength(1);
  expect(hinges[0].p[0]).toBeCloseTo(0.5, 6);
  expect(hinges[0].width).toBe(900);        // (900 + 880) / 2 = 890 → 50 mm 반올림
  expect(hinges[0].ends.length).toBe(4);    // 호 두 개의 끝점 넷
  // 배율은 반지름에도 곱해진다(인치 도면의 원호도 같은 창에 걸린다).
  expect(doorHinges([arc(0, 0, 35.43, 0, 90)], OPEN, p => p, 25.4)).toHaveLength(1);
});

test('nearestWall은 900 mm 안의 가장 가까운 벽을 주고 t를 클램프한다', () => {
  expect(nearestWall([WALL], [0.5, 1500.25])).toMatchObject({ wall: WALL });
  expect(nearestWall([WALL], [0.5, 1500.25]).t).toBeCloseTo(0.5, 3);
  expect(nearestWall([WALL], [-9000.5, 1500.25])).toBe(null);   // 벽 끝에서 6,000 mm 밖
  expect(nearestWall([WALL], [0.5, 3000.25])).toBe(null);       // 벽면에서 1,500 mm 떨어져 있다
  expect(nearestWall([WALL], [-4000.5, 1500.25])).toBe(null);
  expect(nearestWall([WALL], [-3500.5, 1500.25]).t).toBe(0);    // 끝을 넘어선 점은 t가 클램프된다
  expect(OPENING_MATCH_DIST).toBe(900);
});

test('productForWidth는 가장 가까운 제품을 고르고 20 % 넘게 다르면 opening-pass다', () => {
  expect(DOOR_PRODUCTS.map(p => p[0])).toEqual(['door-swing-900', 'door-swing-1000', 'door-slide-1500', 'door-double-1800']);
  expect(WINDOW_PRODUCTS.map(p => p[0])).toEqual(['window-fix-600', 'window-slide-1200', 'window-slide-1800']);
  expect(productForWidth(DOOR_PRODUCTS, 900)).toEqual({ id: 'door-swing-900', width: 900, exact: true });
  expect(productForWidth(DOOR_PRODUCTS, 1050)).toEqual({ id: 'door-swing-1000', width: 1000, exact: true });
  expect(productForWidth(DOOR_PRODUCTS, 1700)).toEqual({ id: 'door-double-1800', width: 1800, exact: true });
  expect(productForWidth(DOOR_PRODUCTS, 700)).toEqual({ id: OPENING_FALLBACK, width: 700, exact: false });
  expect(productForWidth(WINDOW_PRODUCTS, 2400)).toEqual({ id: OPENING_FALLBACK, width: 2400, exact: false });
  expect(productForWidth(WINDOW_PRODUCTS, 1250)).toEqual({ id: 'window-slide-1200', width: 1200, exact: true });
});

test('문은 힌지와 벽에 나란한 호 끝점의 중점에 앉고 placeOnWall(embed)이 pos·rot을 준다', () => {
  // 힌지 (0.5, 1500.25) · 반지름 900 · 0°~90° → 끝점 (900.5, 1500.25)와 (0.5, 2400.25).
  // 벽 방향 (1, 0)과 나란한 것은 앞의 것이므로 개구부 중심은 (450.5, 1500.25)다.
  const items = buildOpenings({ ex: exOf({ arcs: [arc(0.5, 1500.25, 900, 0, 90)] }), walls: [WALL], openingLayers: OPEN });
  expect(items).toHaveLength(1);
  const it = items[0];
  expect(it).toMatchObject({ kind: 'door', productId: 'door-swing-900', attach: 'wall', wallId: WALL.id, side: 1 });
  expect(it.t).toBeCloseTo(0.57508, 4);                    // (450.5 + 3000) / 6000
  expect(it.pos[0]).toBeCloseTo(450.5, 3);
  expect(it.pos[1]).toBeCloseTo(1500, 3);                  // embed = 벽 두께 안(옆으로 밀지 않는다)
  expect(it.rot).toBe(0);
  expect(it.size).toEqual([900, 40, 2100]);
  expect(it.z).toBe(0);                                    // 카탈로그 기본값(문 z 0 · h 2100)
});

test('벽에서 900 mm보다 먼 원호는 버린다', () => {
  const far = buildOpenings({ ex: exOf({ arcs: [arc(0.5, 3200.25, 900, 0, 90)] }), walls: [WALL], openingLayers: OPEN });
  expect(far).toEqual([]);
});

// 사전 검토 C-2: 이 도면의 문은 미닫이라 스윙 호가 없다 — Task 6의 벽 틈이 두 번째 신호다.
test('벽 틈은 opening-pass로 앉고, 스윙 호가 있는 자리에는 겹치지 않는다', () => {
  const g = gapOpenings([{ p: [0.5, 1500.25], width: 900 }, { p: [0.5, 9000.25], width: 900 }], [WALL]);
  expect(g).toHaveLength(1);                               // 두 번째 틈은 벽에서 7,500 mm 밖이다
  expect(g[0].t).toBeCloseTo(0.50008, 4);
  expect(g[0].width).toBe(900);
  const items = buildOpenings({ ex: exOf({}), walls: [WALL], openingLayers: OPEN, gaps: [{ p: [0.5, 1500.25], width: 875 }] });
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ productId: OPENING_FALLBACK, kind: 'opening', attach: 'wall', wallId: WALL.id });
  expect(items[0].size).toEqual([900, 40, 2100]);           // 875 → 50 mm 단위로 900
  expect(items[0].z).toBe(0);
  expect(items[0].pos[1]).toBeCloseTo(1500, 3);             // embed = 벽 두께 안
  // 같은 자리에 스윙 호가 있으면 문이 이긴다(원호 증거가 면선·틈 증거보다 강하다).
  const both = buildOpenings({
    ex: exOf({ arcs: [arc(0.5, 1500.25, 900, 0, 90)] }), walls: [WALL], openingLayers: OPEN,
    gaps: [{ p: [450.5, 1500.25], width: 900 }],
  });
  expect(both.map(i => i.productId)).toEqual(['door-swing-900']);
});

// 사전 검토 I-9: sill·높이는 제품마다 다르다 — window-fix-600만 z 1200 · h 600이다.
test('창의 sill은 카탈로그 기본값이고 제품마다 다르다', () => {
  const win = (L) => buildOpenings({ ex: exOf({ segs: [seg(-1000.5, 1450.25, -1000.5 + L, 1450.25)] }), walls: [WALL], openingLayers: OPEN })[0];
  const fix = win(700);
  expect(fix).toMatchObject({ productId: 'window-fix-600', kind: 'window' });
  expect(fix.z).toBe(1200);                                 // 고정창은 sill이 1,200 mm다
  expect(fix.size).toEqual([600, 40, 600]);
  const slide = win(1200);
  expect(slide).toMatchObject({ productId: 'window-slide-1200', kind: 'window' });
  expect(slide.z).toBe(900);
  expect(slide.size).toEqual([1200, 40, 1200]);
  // 카탈로그와 20 % 넘게 다른 폭은 실측 폭 그대로의 opening-pass다(z 0 · h 2100).
  const odd = win(750);
  expect(odd).toMatchObject({ productId: OPENING_FALLBACK, z: 0 });
  expect(odd.size).toEqual([750, 40, 2100]);
});

test('창은 개구부 레이어의 700 mm 이상 면선이 벽을 덮는 구간에서 만들어진다', () => {
  const spans = windowSpans([seg(-1000.5, 1450.25, 200.5, 1450.25)], OPEN, [WALL], P);
  expect(spans).toHaveLength(1);
  expect(spans[0].width).toBe(1200);
  expect(spans[0].t).toBeCloseTo(0.43333, 4);              // ((1999.5 + 3200.5) / 2) / 6000
  // 면선 하한(openFaceMin 700)과 창 폭 상한(4800)은 서로 다른 문턱이다.
  expect(windowSpans([seg(-1000.5, 1450.25, -250.5, 1450.25)], OPEN, [WALL], P)).toHaveLength(1);   // 750 mm
  expect(windowSpans([seg(-1000.5, 1450.25, -500.5, 1450.25)], OPEN, [WALL], P)).toHaveLength(0);   // 500 mm
  expect(windowSpans([seg(-2900.5, 1450.25, 2900.5, 1450.25)], OPEN, [WALL], P)).toHaveLength(0);   // 5800 mm
  // 벽면에서 멀거나(두께/2 + 100 밖) 나란하지 않은 선분은 재료가 아니다.
  expect(windowSpans([seg(-1000.5, 1900.25, 200.5, 1900.25)], OPEN, [WALL], P)).toHaveLength(0);
  expect(windowSpans([seg(-1000.5, 1450.25, 200.5, 1550.25)], OPEN, [WALL], P)).toHaveLength(0);
});

test('벽 하나에 창은 최대 여섯 개다', () => {
  const segs = Array.from({ length: 8 }, (_, i) => seg(-2900.5 + i * 720, 1450.25, -2200.5 + i * 720, 1450.25));
  expect(windowSpans(segs, OPEN, [WALL], P)).toHaveLength(6);
});

test('문이 이미 앉은 자리에는 창을 겹쳐 놓지 않고, 창은 카탈로그 기본 sill을 쓴다', () => {
  const overlap = buildOpenings({
    ex: exOf({ arcs: [arc(0.5, 1500.25, 900, 0, 90)], segs: [seg(100.5, 1450.25, 800.5, 1450.25)] }),
    walls: [WALL], openingLayers: OPEN,
  });
  expect(overlap.map(i => i.kind)).toEqual(['door']);
  const apart = buildOpenings({
    ex: exOf({ arcs: [arc(-2500.5, 1500.25, 900, 180, 270)], segs: [seg(1000.5, 1450.25, 2200.5, 1450.25)] }),
    walls: [WALL], openingLayers: OPEN,
  });
  expect(apart.map(i => i.kind).sort()).toEqual(['door', 'window']);
  const win = apart.find(i => i.kind === 'window');
  expect(win).toMatchObject({ productId: 'window-slide-1200', attach: 'wall', wallId: WALL.id });
  expect(win.z).toBe(900);                                  // 카탈로그 기본 sill(창 z 900 · h 1200)
  expect(win.size).toEqual([1200, 40, 1200]);
});
