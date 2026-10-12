// §18.4. 블록 로컬 좌표가 base에서 멀리 떨어져 있어 INSERT 점은 쓸 수 없다 — 창·문 블록은 인서트마다 전개 도형을
// 모아 읽고(tests/dxfBlockOpenings.test.js), 여기서는 그 뒤 경로(문 원호의 중심 · 창 면선 · 벽 틈)를 본다.
// 좌표는 전부 앱 좌표(mm · y 남쪽)이고 소수를 섞는다.
import { test, expect } from 'vitest';
import { doorHinges, gapOpenings, dedupeGaps, windowSpans, nearestWall, productForWidth, buildOpenings, slideDoors, DOOR_PRODUCTS, WINDOW_PRODUCTS, SLIDE_PRODUCTS, OPENING_FALLBACK, OPENING_MATCH_DIST } from '../src/io/dxf/openings.js';
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
    { ...arc(2800.5, 1500.25, 900, 0, 90, 'WAL'), block: '1f plan-1' },   // 개구부 레이어도 문 블록도 아니다
  ], OPEN);
  expect(hinges).toHaveLength(1);
  expect(hinges[0].p[0]).toBeCloseTo(0.5, 6);
  expect(hinges[0].width).toBe(900);        // (900 + 880) / 2 = 890 → 50 mm 반올림
  expect(hinges[0].ends.length).toBe(4);    // 호 두 개의 끝점 넷
  // 배율은 반지름에도 곱해진다(인치 도면의 원호도 같은 창에 걸린다).
  expect(doorHinges([arc(0, 0, 35.43, 0, 90)], OPEN, p => p, 25.4)).toHaveLength(1);
});

// 2026-09-29: 실파일 여닫이문 17개는 역할 "기타"인 WID 레이어의 DR-900·DR-1800 블록 안에 있었다.
test('문 이름 블록(DR-900·door·문) 안의 원호는 레이어 역할과 무관하게 문 궤적이다', () => {
  const inDoor = (cx, cy, name) => ({ c: [cx, cy], r: 900, a0: 0, a1: 90, layer: 'WID', depth: 1, block: name });
  const hinges = doorHinges([
    inDoor(0.5, 1500.25, 'DR-900'), inDoor(3000.5, 1500.25, 'dr-1850'), inDoor(6000.5, 1500.25, 'DOOR_SGL'), inDoor(7500.5, 1500.25, '문_여닫이 900'),
    inDoor(9000.5, 1500.25, '식탁-4인'), inDoor(10500.5, 1500.25, '보냉고 양문1260-800'), inDoor(12000.5, 1500.25, '소독기 단문 1200-750'),
  ], OPEN);
  // 가구·주방 기구 블록의 원호는 문이 아니다("양문"·"단문"이 이름 뒤에 붙은 기구 포함)
  expect(hinges.map(h => Math.round(h.p[0]))).toEqual([1, 3001, 6001, 7501]);
});

test('같은 벽에서 마주 보는 두 짝(힌지 간격 = 두 반지름의 합)은 양개문 하나다', () => {
  // 벽 y 1500 위 x −900~900 개구부: 왼쪽 힌지(−900)는 0°→90°, 오른쪽 힌지(900)는 90°→180°로 돈다
  const leaf = (cx, a0, a1) => ({ c: [cx, 1400.25], r: 900, a0, a1, layer: 'WID', depth: 1, block: 'DR-1800' });
  const items = buildOpenings({ ex: exOf({ arcs: [leaf(-899.5, 270, 360), leaf(900.5, 180, 270)] }), walls: [WALL], openingLayers: OPEN });
  expect(items).toHaveLength(1);
  expect(items[0].productId).toBe('door-double-1800');
  expect(items[0].t).toBeCloseTo(0.5, 3);
  // 한 짝뿐이면 여닫이 900이다
  const single = buildOpenings({ ex: exOf({ arcs: [leaf(-899.5, 270, 360)] }), walls: [WALL], openingLayers: OPEN });
  expect(single.map(i => i.productId)).toEqual(['door-swing-900']);
  // polyArcs(폴리선 bulge 호)도 같은 문 재료다
  const poly = buildOpenings({ ex: { ...exOf(), polyArcs: [leaf(-899.5, 270, 360), leaf(900.5, 180, 270)] }, walls: [WALL], openingLayers: OPEN });
  expect(poly.map(i => i.productId)).toEqual(['door-double-1800']);
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

// --- Task 9 리뷰 수정(F1·F2·C3) + Task 6 재리뷰(틈 중복·차례) 회귀 ---

test('productForWidth는 상대 오차로 먼저 거른 뒤 그중 가장 가까운 것을 고른다 (리뷰 F2)', () => {
  // 절대 거리로 먼저 고르면 1,200(오차 20.9 %)이 이겨 폴백으로 떨어졌다 — 1,800은 19.4 %로 유효했다.
  expect(productForWidth(WINDOW_PRODUCTS, 1450.5)).toEqual({ id: 'window-slide-1800', width: 1800, exact: true });
  expect(productForWidth(DOOR_PRODUCTS, 1230.5)).toEqual({ id: 'door-slide-1500', width: 1500, exact: true });
  expect(productForWidth([], 900.5)).toEqual({ id: OPENING_FALLBACK, width: 900.5, exact: false });
});

test('개구부는 호스트 벽 안에 들어간다 — 벽보다 넓은 카탈로그 폭은 쓰지 않는다 (리뷰 F1)', () => {
  // 실파일 실패 입력: 1,057.7 mm 벽을 덮은 창 면선이 window-slide-1200으로 커져 3D에서 벽 아랫단이 사라졌다.
  const narrow = makeWall({ a: [-528.85, 1500.25], b: [528.85, 1500.25], thickness: 200, height: 3500 });
  const items = buildOpenings({ ex: exOf({ segs: [seg(-600.5, 1450.25, 550.0, 1450.25)] }), walls: [narrow], openingLayers: OPEN });
  expect(items).toHaveLength(1);
  expect(items[0].productId).toBe(OPENING_FALLBACK);
  expect(items[0].size[0]).toBe(950);                        // 1,057.7 − 2 × 50 = 957.7 → 50 mm 내림
  const L = 1057.7, half = items[0].size[0] / 2;
  expect(items[0].t * L - half).toBeGreaterThanOrEqual(50);
  expect(items[0].t * L + half).toBeLessThanOrEqual(L - 50);
  // 598.3 mm 벽의 700 mm 틈도 벽 안에 드는 450 mm로 줄여 앉는다(498.3 → 50 mm 내림).
  const stub = makeWall({ a: [-299.15, 1500.25], b: [299.15, 1500.25], thickness: 200, height: 3500 });
  const gap = buildOpenings({ ex: exOf({}), walls: [stub], openingLayers: OPEN, gaps: [{ p: [0.5, 1500.25], width: 700 }] });
  expect(gap).toHaveLength(1);
  expect(gap[0]).toMatchObject({ productId: OPENING_FALLBACK });
  expect(gap[0].size).toEqual([450, 40, 2100]);
});

test('벽 토막에는 개구부를 놓지 않고, 벽 끝 밖의 틈은 안으로 당겨 앉힌다 (리뷰 F1·F4)', () => {
  // 380.5 − 2 × 50 = 280.5 → 250 mm라 300 mm 미만이다(문이 아니라 벽 토막이다).
  const tiny = makeWall({ a: [-190.25, 1500.25], b: [190.25, 1500.25], thickness: 200, height: 3500 });
  expect(buildOpenings({ ex: exOf({}), walls: [tiny], openingLayers: OPEN, gaps: [{ p: [0.5, 1500.25], width: 700 }] })).toEqual([]);
  const out = buildOpenings({ ex: exOf({}), walls: [WALL], openingLayers: OPEN, gaps: [{ p: [-3500.5, 1500.25], width: 900 }] });
  expect(out).toHaveLength(1);
  expect(out[0].t * 6000).toBeCloseTo(500, 6);               // 50(끝 여유) + 450(반폭)
  expect(out[0].pos[0]).toBeCloseTo(-2500, 3);
});

test('충돌 판정은 놓일 폭으로 한다 — 같은 벽의 창 둘이 겹치지 않는다 (리뷰 C3)', () => {
  // 1,000.5 mm 면선 둘의 중심 간격은 1,100.25 mm인데 제품 폭은 1,200 mm다(측정 폭으로 재면 통과했다).
  const items = buildOpenings({
    ex: exOf({ segs: [seg(-2000.5, 1450.25, -1000.0, 1450.25), seg(-900.25, 1450.25, 100.25, 1450.25)] }),
    walls: [WALL], openingLayers: OPEN,
  });
  expect(items).toHaveLength(1);
  expect(items[0].productId).toBe('window-slide-1200');
  expect(items[0].pos[0]).toBeCloseTo(-1500.25, 3);
  const iv = items.map(i => [i.t * 6000 - i.size[0] / 2, i.t * 6000 + i.size[0] / 2]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < iv.length; i++) expect(iv[i][0]).toBeGreaterThanOrEqual(iv[i - 1][1]);
});

test('같은 자리의 벽 틈 둘은 개구부 하나다 (Task 6 재리뷰)', () => {
  const gaps = [{ p: [0.5, 1500.25], width: 900 }, { p: [121.0, 1500.25], width: 1150 }];
  const deduped = dedupeGaps(gapOpenings(gaps, [WALL]));
  expect(deduped).toHaveLength(1);
  expect(deduped[0].width).toBe(900);                        // 카탈로그 폭에 더 가까운 쪽이 남는다
  const items = buildOpenings({ ex: exOf({}), walls: [WALL], openingLayers: OPEN, gaps });
  expect(items).toHaveLength(1);
  expect(items[0].size[0]).toBe(900);
});

test('창 면선이 같은 자리의 벽 틈을 이기고, 떨어진 틈은 그대로 opening-pass다 (Task 6 재리뷰)', () => {
  const segs = [seg(-600.25, 1450.25, 600.25, 1450.25)];     // 1,200.5 mm 창
  const same = buildOpenings({ ex: exOf({ segs }), walls: [WALL], openingLayers: OPEN, gaps: [{ p: [0.5, 1500.25], width: 1200 }] });
  expect(same).toHaveLength(1);
  expect(same[0].productId).toBe('window-slide-1200');       // 면선은 창이라는 직접 증거다
  const apart = buildOpenings({ ex: exOf({ segs }), walls: [WALL], openingLayers: OPEN, gaps: [{ p: [-2500.5, 1500.25], width: 900 }] });
  expect(apart.map(i => i.productId).sort()).toEqual([OPENING_FALLBACK, 'window-slide-1200']);
});

// --- 계획 12 Task 2(2026-10-12): 외미닫이 문 기호 — 신상중 A-DOOR 문짝 선 다섯 + 미닫이 화살표 ---
// 실측 모양: 문짝은 열린(주차) 자리에 벽과 나란히(면에서 0~20 mm) 그리고, 화살표(축선 491 · 꺾쇠 67 mm)는 **개구부 앞**에 서서
// 문짝 쪽을 가리킨다(일곱 개 모두). 벽 A (0,0)→(6000,0) 두께 200 · 벽 레이어 면선 y ±100이 x 0~2000 · 3000~6000을 덮는다(2000~3000이 개구부).
const WALL_A = makeWall({ a: [0, 0], b: [6000, 0], thickness: 200, height: 3500 });
const SLIDE_OPEN = new Set(['WIN', 'A-DOOR']), SLIDE_WALL = new Set(['WAL']);
const faces = () => [seg(0, 100, 2000, 100, 'WAL'), seg(0, -100, 2000, -100, 'WAL'), seg(3000, 100, 6000, 100, 'WAL'), seg(3000, -100, 6000, -100, 'WAL')];
const leafA = () => seg(1000, 130, 2000, 130, 'A-DOOR');
// 축선 (2700,300)→(2200,300): 개구부 앞에서 문짝(−x) 쪽을 가리키고, 꺾쇠 둘이 머리 (2200,300)에서 뒤쪽으로 34°씩 벌어진다.
const arrowA = (head = true) => [seg(2700, 300, 2200, 300, 'A-DOOR'), ...(head ? [seg(2200, 300, 2260, 260, 'A-DOOR'), seg(2200, 300, 2260, 340, 'A-DOOR')] : [])];

test('외미닫이 기호(벽과 나란한 문짝 선 + 미닫이 화살표)는 문짝 옆 빈 구간에 미닫이문 900으로 앉고 그 자리의 창 면선을 비켜 가게 한다', () => {
  expect(SLIDE_PRODUCTS).toEqual([['door-slide-900', 900], ['door-slide-1500', 1500]]);
  expect(DOOR_PRODUCTS.map(p => p[0])).toEqual(['door-swing-900', 'door-swing-1000', 'door-slide-1500', 'door-double-1800']);   // 여닫이 목록은 그대로
  const cand = slideDoors(exOf({ segs: [...faces(), leafA(), ...arrowA()] }), [WALL_A], SLIDE_OPEN, p => p, P, SLIDE_WALL);
  expect(cand).toHaveLength(1);
  expect(cand[0].wall).toBe(WALL_A);
  expect(cand[0].width).toBe(1000);                           // min(문짝 1000, 빈 구간 1000)
  expect(cand[0].t * 6000).toBeCloseTo(2500, 6);
  // 문틀·레일 선(창 레이어 1,700 mm, 개구부 + 주차 자리)은 창 재료지만 같은 자리에 문이 먼저 앉아 창이 되지 않는다(문짝 선 자체도).
  const items = buildOpenings({ ex: exOf({ segs: [...faces(), leafA(), ...arrowA(), seg(1000, 0, 2700, 0, 'WIN')] }), walls: [WALL_A], openingLayers: SLIDE_OPEN, wallLayers: SLIDE_WALL });
  expect(items.map(i => i.productId)).toEqual(['door-slide-900']);
  expect(items[0].t * 6000).toBeCloseTo(2500, 6);
  expect(items[0].size).toEqual([1000, 40, 2100]);             // 폭은 실측 개구부 그대로, 제품만 가장 가까운 미닫이(블록 경로와 같다)
  // 벽 레이어를 모르면(빈 집합) 빈 구간을 볼 수 없어 이 경로는 아무것도 내지 않는다 — 창 면선이 예전처럼 창이 된다.
  const blind = buildOpenings({ ex: exOf({ segs: [...faces(), leafA(), ...arrowA(), seg(1000, 0, 2700, 0, 'WIN')] }), walls: [WALL_A], openingLayers: SLIDE_OPEN });
  expect(blind.map(i => i.productId)).toEqual(['window-slide-1800']);
});

test('외미닫이 기호가 아닌 것은 읽지 않는다 — 화살표·꺾쇠가 없거나, 문짝이 벽과 수직이거나, 창·문 블록 안이거나, 짧거나, 화살표가 문짝 옆에 서 있다', () => {
  const run = segs => slideDoors(exOf({ segs }), [WALL_A], SLIDE_OPEN, p => p, P, SLIDE_WALL);
  expect(run([...faces(), leafA()])).toEqual([]);                                     // 화살표 없음
  expect(run([...faces(), leafA(), ...arrowA(false)])).toEqual([]);                   // 꺾쇠 없는 축선은 화살표가 아니다
  expect(run([...faces(), seg(2000, 100, 2000, 1100, 'A-DOOR'), ...arrowA()])).toEqual([]);   // 문짝이 벽과 수직(여닫이 문짝 꼴)
  expect(run([...faces(), seg(1500, 130, 2000, 130, 'A-DOOR'), ...arrowA()])).toEqual([]);    // 500 mm는 문짝이 아니다(doorLeaf 700~1300)
  expect(run([...faces(), { ...leafA(), layer: 'EQUIP' }, ...arrowA().map(s => ({ ...s, layer: 'EQUIP' }))])).toEqual([]);   // 개구부 역할이 아닌 레이어
  // 창·문 블록(win-900-3) 안의 선은 블록 경로가 이미 앉혔다 — 부모 INSERT를 거슬러 올라가 본다.
  const inserts = [{ name: 'win-900-3', parent: undefined }, { name: 'frame', parent: 0 }];
  expect(slideDoors({ ...exOf({ segs: [...faces(), { ...leafA(), ins: 1 }, ...arrowA()] }), inserts }, [WALL_A], SLIDE_OPEN, p => p, P, SLIDE_WALL)).toEqual([]);
  // 화살표가 문짝 옆(벽 방향으로 겹침)에 서 있으면 개구부가 어느 쪽인지 알 수 없다(실측 일곱 개는 모두 문짝 끝 너머에 섰다).
  expect(run([...faces(), leafA(), seg(1100, 300, 1600, 300, 'A-DOOR'), seg(1600, 300, 1540, 260, 'A-DOOR'), seg(1600, 300, 1540, 340, 'A-DOOR')])).toEqual([]);
  // 개구부 양쪽이 다 벽 레이어 면선으로 덮여 있으면(벽이 끊기지 않았다) 문이 아니다.
  expect(run([seg(0, 100, 6000, 100, 'WAL'), seg(0, -100, 6000, -100, 'WAL'), leafA(), ...arrowA()])).toEqual([]);
  // 빈 구간이 문짝의 80 %보다 짧으면(2000~2300 뒤에 면선 조각) 문이 아니다 — 300 mm 개구부 조각을 만들지 않는다.
  expect(run([...faces(), seg(2300, 100, 2400, 100, 'WAL'), leafA(), ...arrowA()])).toEqual([]);
});

test('외미닫이 문은 실측 폭으로 앉고 제품은 가장 가까운 미닫이다 — 벽보다 넓으면 벽 안으로 줄이고, 겹치면 놓지 않는다', () => {
  const build = (segs, walls = [WALL_A]) => buildOpenings({ ex: exOf({ segs }), walls, openingLayers: SLIDE_OPEN, wallLayers: SLIDE_WALL });
  // 문짝 900(1100~2000) → 개구부 2000~2900, 폭 900.
  const n900 = build([...faces(), seg(1100, 130, 2000, 130, 'A-DOOR'), ...arrowA()]);
  expect(n900.map(i => [i.productId, i.size[0]])).toEqual([['door-slide-900', 900]]);
  expect(n900[0].t * 6000).toBeCloseTo(2450, 6);
  // 문짝 1300 · 개구부 1300(2000~3300) → 1500 미닫이가 더 가깝다(|1300 − 1500| < |1300 − 900|), 폭은 1300 그대로.
  // 문짝 선은 창 재료에서 빠진다 — 빼지 않으면 그 선이 window-slide-1200으로 문 옆(겹치지 않게 맞닿아)에 앉았다.
  const wide = build([seg(0, 100, 2000, 100, 'WAL'), seg(0, -100, 2000, -100, 'WAL'), seg(3300, 100, 6000, 100, 'WAL'), seg(3300, -100, 6000, -100, 'WAL'),
    seg(700, 130, 2000, 130, 'A-DOOR'), ...arrowA()]);
  expect(wide.map(i => [i.productId, i.size[0]])).toEqual([['door-slide-1500', 1300]]);
  // 개구부 쪽 벽이 1,000 mm뿐이면(쓸 수 있는 폭 900) 폭 1000 기호도 900으로 줄여 벽 안에 앉힌다(fitOpening의 벽 길이 규칙).
  const short = makeWall({ a: [2000, 0], b: [3000, 0], thickness: 200, height: 3500 });
  const clamp = build([...faces(), leafA(), ...arrowA()], [short]);
  expect(clamp.map(i => [i.productId, i.size[0]])).toEqual([['door-slide-900', 900]]);
  expect(clamp[0].t).toBeCloseTo(0.5, 6);
  // 같은 자리에 스윙 호 문이 이미 있으면 겹쳐 놓지 않는다.
  const swing = { c: [2000, 0], r: 900, a0: 0, a1: 90, layer: 'A-DOOR', depth: 0 };
  const both = buildOpenings({ ex: exOf({ arcs: [swing], segs: [...faces(), leafA(), ...arrowA()] }), walls: [WALL_A], openingLayers: SLIDE_OPEN, wallLayers: SLIDE_WALL });
  expect(both.map(i => i.productId)).toEqual(['door-swing-900']);
});

test('화살표 쪽이 막혀 있으면 문짝의 반대쪽 빈 구간을 본다', () => {
  // 화살표가 문짝 왼쪽 끝(x 1000) 너머에 서 있지만 그쪽(0~1000)은 벽 면선이 덮었다 → 오른쪽 2000~3000.
  const left = [seg(300, 300, 800, 300, 'A-DOOR'), seg(800, 300, 740, 260, 'A-DOOR'), seg(800, 300, 740, 340, 'A-DOOR')];
  const cand = slideDoors(exOf({ segs: [...faces(), leafA(), ...left] }), [WALL_A], SLIDE_OPEN, p => p, P, SLIDE_WALL);
  expect(cand).toHaveLength(1);
  expect(cand[0].t * 6000).toBeCloseTo(2500, 6);
});

test('주차 쪽 벽이 문짝 끝보다 앞에서 끝나면 개구부는 그 벽 끝에서 잰다 (신상중 문짝이 개구부에 40~100 mm 걸친다)', () => {
  // 면선이 1900에서 끝나고 개구부는 1900~2800(900) — 문짝(1000~2000)이 개구부에 100 mm 걸쳐 있다. 오른쪽 벽은 2800부터.
  const segs = [seg(0, 100, 1900, 100, 'WAL'), seg(0, -100, 1900, -100, 'WAL'), seg(2800, 100, 6000, 100, 'WAL'), seg(2800, -100, 6000, -100, 'WAL'), leafA(), ...arrowA()];
  const cand = slideDoors(exOf({ segs }), [WALL_A], SLIDE_OPEN, p => p, P, SLIDE_WALL);
  expect(cand).toHaveLength(1);
  expect(cand[0].width).toBe(900);
  expect(cand[0].t * 6000).toBeCloseTo(2350, 6);              // (1900 + 2800) / 2
});

// 2026-10-12 · 계획 13 Task 6(c) — 신상중 B spot 6: 문짝 1000을 **닫힌 자리**(개구부 위 · 벽 면선이 없는 구간)에 그리고 주차 자리에 800 선을
// 이어 그렸다. 화살표는 닫힌 문짝 옆(겹침)에 서므로 예전에는 닫힌 문짝을 읽지 않고 주차 쪽 800이 개구부를 800으로 쟀다(손 정답 1000).
// 닫힌 문짝: 화살표가 벽 방향으로 겹쳐 서 있고, 문짝 구간이 벽 면선 없이 비어 있으면(빈 구간 ≥ 문짝의 80 %) 그 문짝이 곧 개구부다.
test('닫힌 자리에 그린 문짝(화살표가 옆에 겹쳐 서고 문짝 아래가 빈 개구부)은 그 문짝 폭으로 먼저 앉는다 — 주차 쪽 선보다 앞', () => {
  const closed = seg(2000, 130, 3000, 130, 'A-DOOR'), parked = seg(3000, 130, 3800, 130, 'A-DOOR');
  const arrow = [seg(2250, 230, 2750, 230, 'A-DOOR'), seg(2750, 230, 2690, 190, 'A-DOOR'), seg(2750, 230, 2690, 270, 'A-DOOR')];   // 주차 쪽(+x)을 가리킨다
  const cand = slideDoors(exOf({ segs: [...faces(), closed, parked, ...arrow] }), [WALL_A], SLIDE_OPEN, p => p, P, SLIDE_WALL);
  expect(cand.map(c => [c.width, Math.round(c.t * 6000)])).toEqual([[1000, 2500], [800, 2600]]);
  const items = buildOpenings({ ex: exOf({ segs: [...faces(), closed, parked, ...arrow] }), walls: [WALL_A], openingLayers: SLIDE_OPEN, wallLayers: SLIDE_WALL });
  expect(items.map(i => [i.productId, i.size[0], Math.round(i.t * 6000)])).toEqual([['door-slide-900', 1000, 2500]]);
  // 문짝 아래가 벽 면선으로 덮였으면(닫힌 자리가 아니다) 예전처럼 읽지 않는다.
  expect(slideDoors(exOf({ segs: [...faces(), seg(1000, 130, 2000, 130, 'A-DOOR'), seg(1250, 300, 1750, 300, 'A-DOOR'), seg(1750, 300, 1690, 260, 'A-DOOR'), seg(1750, 300, 1690, 340, 'A-DOOR')] }), [WALL_A], SLIDE_OPEN, p => p, P, SLIDE_WALL)).toEqual([]);
});

// 2026-10-12 · 계획 13 Task 6(c) — 신상중 B spot 7: 미닫이 화살표만 개구부 레이어(A-DOOR)에 있고 문짝은 다른 레이어(6·8)에 그렸다. 문짝이 없으면
// 기호를 읽지 못해 문틀 선 1950(레이어 4)이 창 1800이 됐다(손 정답 문 1000). 어느 문짝도 쓰지 않은 화살표는 **그 앞의 빈 구간**(벽 면선이 없는
// 구간 — 화살표 축선 가운데를 품는다)이 개구부다. 폭이 문짝 범위(doorLeaf 700~1300)일 때만.
test('문짝 없이 화살표만 있으면 화살표 앞의 빈 구간(문짝 폭 범위)이 미닫이문이다 — 그 자리의 문틀 선은 창이 되지 않는다', () => {
  const arrow = (x0, x1, y = 230) => [seg(x0, y, x1, y, 'A-DOOR'), seg(x1, y, x1 - 60, y - 40, 'A-DOOR'), seg(x1, y, x1 - 60, y + 40, 'A-DOOR')];
  const build = segs => buildOpenings({ ex: exOf({ segs }), walls: [WALL_A], openingLayers: SLIDE_OPEN, wallLayers: SLIDE_WALL });
  const items = build([...faces(), ...arrow(2250, 2750), seg(2000, 0, 3950, 0, 'WIN')]);
  expect(items.map(i => [i.productId, i.size[0], Math.round(i.t * 6000)])).toEqual([['door-slide-900', 1000, 2500]]);
  // 화살표 앞이 벽 면선으로 덮였거나(1000~1500), 빈 구간이 문짝 범위 밖(2000)이면 읽지 않는다.
  expect(slideDoors(exOf({ segs: [...faces(), ...arrow(1000, 1500)] }), [WALL_A], SLIDE_OPEN, p => p, P, SLIDE_WALL)).toEqual([]);
  const wide = [seg(0, 100, 2000, 100, 'WAL'), seg(0, -100, 2000, -100, 'WAL'), seg(4000, 100, 6000, 100, 'WAL'), seg(4000, -100, 6000, -100, 'WAL')];
  expect(slideDoors(exOf({ segs: [...wide, ...arrow(2750, 3250)] }), [WALL_A], SLIDE_OPEN, p => p, P, SLIDE_WALL)).toEqual([]);
  // 문짝이 쓴 화살표는 화살표만의 자리를 따로 내지 않는다(문짝 경로 그대로 — 후보 하나).
  expect(slideDoors(exOf({ segs: [...faces(), leafA(), ...arrowA()] }), [WALL_A], SLIDE_OPEN, p => p, P, SLIDE_WALL)).toHaveLength(1);
});

// 2026-10-12 · 계획 13 Task 6(c) — 신상중 B spot 2: 주차 자리 문짝이 두 벽 중심선의 이음매에 걸치고, 이웃 벽 쪽 주차 자리(벽 면선이 한쪽뿐)가
// 벽 틈 통로(opening-pass 800)가 됐다. 충돌은 같은 벽만 비교했다 — 문짝이 놓인 주차 자리는 **벽**이다(문이 그 앞으로 미끄러진다):
// 외미닫이 문짝 선이 나란히 걸친 벽마다 그 구간을 차지된 자리로 두어 뒤 경로(창 면선 · 벽 틈)가 비켜 가게 한다.
test('외미닫이 문짝이 놓인 주차 자리는 이웃 벽까지 차지된 자리다 — 그 자리의 벽 틈 통로를 놓지 않는다', () => {
  const A1 = makeWall({ a: [0, 0], b: [3000, 0], thickness: 200, height: 3500 }), A2 = makeWall({ a: [3000, 0], b: [6000, 0], thickness: 200, height: 3500 });
  const wal = [seg(0, 100, 1500, 100, 'WAL'), seg(0, -100, 1500, -100, 'WAL'), seg(2500, 100, 6000, 100, 'WAL'), seg(2500, -100, 6000, -100, 'WAL')];
  const leaf = seg(2500, 130, 3400, 130, 'A-DOOR');
  const arrow = [seg(1750, 230, 2250, 230, 'A-DOOR'), seg(2250, 230, 2190, 190, 'A-DOOR'), seg(2250, 230, 2190, 270, 'A-DOOR')];
  const run = gaps => buildOpenings({ ex: exOf({ segs: [...wal, leaf, ...arrow] }), walls: [A1, A2], openingLayers: SLIDE_OPEN, wallLayers: SLIDE_WALL, gaps });
  expect(run([{ p: [3200, 0], width: 800 }]).map(i => [i.productId, i.size[0], i.wallId])).toEqual([['door-slide-900', 900, A1.id]]);
  // 주차 자리에서 떨어진 틈(4600)은 그대로 통로다.
  expect(run([{ p: [4600, 0], width: 800 }]).map(i => [i.productId, i.wallId])).toEqual([['door-slide-900', A1.id], ['opening-pass', A2.id]]);
});
