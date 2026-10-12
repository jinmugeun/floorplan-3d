// 기구 블록 → 아이템(src/io/dxf/equipment.js · 2026-10-12 계획 13 Task 2). 좌표: 전개 도형(DXF mm)에 explode의 ins 꼬리표를 직접 달고,
// 앱 좌표는 y만 뒤집는다(toApp — 원점 0 · 배율 1). INSERT 점(pos)은 일부러 멀리 둔다 — 실파일처럼 자리는 전개 도형에서만 읽는다.
import { test, expect } from 'vitest';
import { equipItems } from '../src/io/dxf/equipment.js';
import { insertBoxes, topOwner } from '../src/io/dxf/insertBoxes.js';
import { DXF_PARAMS } from '../src/io/dxf/params.js';
import { makeWall } from '../src/geom/walls.js';
import { createItem } from '../src/state/schema.js';
import { productById } from '../src/products/catalog.js';

const FAR = [-741000.5, 338000.25];
const toApp = p => [p[0], -p[1]];
const ins = (name, o = {}) => ({ name, pos: FAR, rot: 0, scale: [1, 1], layer: '급식기구', depth: 0, mirrored: false, block: '*Model_Space', ...o });
const seg = (a, b, k, layer = '급식기구') => ({ a, b, layer, src: 'LINE', ins: k });
const box = (k, x0, y0, x1, y1) => [seg([x0, y0], [x1, y0], k), seg([x1, y0], [x1, y1], k), seg([x1, y1], [x0, y1], k), seg([x0, y1], [x0, y0], k)];
const exOf = (inserts, segs, more = {}) => ({ inserts, segs, arcs: [], polyArcs: [], circles: [], texts: [], dims: [], hatches: [], ...more });
const one = (name, b, o = {}) => exOf([ins(name, o)], box(0, ...b));
const run = (ex, o = {}) => equipItems(ex, { roi: null, walls: [], columns: [], toApp, ...o });
const only = r => { expect(r.items).toHaveLength(1); return r.items[0]; };

// 재료 = 선분 끝 + ARC 양 끝점(insertBoxes.js 머리 주석 — 호 중심을 넣으면 냉장고 4도어가 4517×1073, 내곡 양변기가 1114×4001로 부풀었다).
test('인서트별 상자: 최상위 주인(자식 INSERT의 도형도 부모 몫) · 선분 끝 + 호 양 끝점 · 선분 없으면 원 범위', () => {
  const ex = exOf([ins('A'), ins('B', { parent: 0 }), ins('C')], [seg([0, 0], [100, 50], 0), seg([300, -20], [310, 400], 1)],
    { arcs: [{ c: [-50, 10], r: 300, a0: 0, a1: 90, ins: 0 }, { c: [150, -5000], r: 5050, a0: 89, a1: 91, ins: 0 }], circles: [{ c: [1000, 1000], r: 200, ins: 2 }] });
  expect(topOwner(ex.inserts)).toEqual([0, 0, 2]);
  const b = insertBoxes(ex).get(0);
  expect(b.box.map(Math.round)).toEqual([-50, -20, 310, 400]);   // (250, 10)·(−50, 310)은 이미 안 · 큰 호(중심 y −5000)는 끝점(y ≈ 49)만 — 상자를 키우지 않는다
  expect(b.n).toBe(2);
  expect(insertBoxes(ex).get(2).box).toEqual([800, 800, 1200, 1200]);   // 선분이 없는 인서트만 원·호의 범위
  expect(insertBoxes(ex).has(1)).toBe(false);
});

test('이름 치수 블록 → 제품 · 자리(상자 중심) · 크기(이름) · 이름은 도면 그대로 · 코드는 제품 코드', () => {
  const it = only(run(one('다단식선반 1500-750', [1000, 1000, 2500, 1750])));
  expect(it).toMatchObject({ productId: 'shelf-steel-4', code: 'ST-SH4', name: '다단식선반 1500-750', pos: [1750, -1375], size: [1500, 750, 1800], rot: 0, attach: 'floor', z: 0 });
});

// 사전 검토 I-3: 이름의 W-D 순서는 블록 로컬 축과 21 %가 반대다 — 이름 치수를 상자에 맞춰(긴 변끼리) 넣는다.
test('이름 순서와 상자 방향이 반대면 상자 방향으로 — 1500-750 · 상자 760×1490 → [750, 1500]', () => {
  expect(only(run(one('다단식선반 1500-750', [0, 0, 760, 1490]))).size).toEqual([750, 1500, 1800]);
});

test('이름 치수와 상자 긴 변이 20 % 넘게 다르면 상자 크기', () => {
  expect(only(run(one('냉장고 200L 555-585', [0, 0, 869, 555]))).size).toEqual([869, 555, 1800]);
});

test('이름의 높이(세 번째 수)가 어휘 높이를 이긴다', () => {
  const it = only(run(one('취반기(전기)선경인케이 150인용 570x600x1460', [0, 0, 570, 698])));
  expect(it).toMatchObject({ productId: 'ricecooker-gas', name: '취반기(전기) 150인용 570x600x1460', size: [570, 600, 1460], kind: 'equipment' });
});

test('어휘에 없는 이름 · 익명 블록 → 도면 기구(상자 크기 · 이름은 블록 이름)', () => {
  const r = run(exOf([ins('500인-'), ins('zw$5B59')], [...box(0, 0, 0, 1200, 800), ...box(1, 5000, 0, 7400, 1776)]));
  expect(r.items.map(i => [i.productId, i.code, i.name, i.size])).toEqual([
    ['equip-generic', 'DR-EQ', '500인', [1200, 800, 850]],
    ['equip-generic', 'DR-EQ', 'zw$5B59', [2400, 1776, 850]],
  ]);
  expect(r.stats).toMatchObject({ placed: 2, product: 0, generic: 2, anonymous: 1, named: 1 });
});

test('냉장고 4도어는 제외가 아니다(숫자 뒤의 도어 = 문짝 수)', () => {
  expect(only(run(one('냉장고 4도어 1100L 1260-850', [0, 0, 1260, 1073])))).toMatchObject({ productId: 'fridge-2door', size: [1260, 850, 1800] });
});

test('90° 회전 블록 — 축 정렬이면 rot 0 · 월드 상자 방향(w/d가 바뀐다)', () => {
  expect(only(run(one('고정식작업대 1500-750', [0, 0, 750, 1500], { rot: 90 })))).toMatchObject({ size: [750, 1500, 850], rot: 0 });
  expect(only(run(one('고정식작업대 1500-750', [0, 0, 1500, 750], { rot: 181.5 })))).toMatchObject({ size: [1500, 750, 850], rot: 0 });   // ±2° 안은 축 정렬
});

// 축 정렬이 아닌 인서트(이동식 카트·작업대 14개)는 로컬 상자 + 인서트 rot. 앱 y가 뒤집혀 앱 rot = −DXF rot(기둥과 같은 부호).
test('45° 회전 블록 — 로컬 상자 크기 · rot 315(= −45)', () => {
  const r = 45 * Math.PI / 180, u = [Math.cos(r), Math.sin(r)], v = [-Math.sin(r), Math.cos(r)], c = [5000, 5000];
  const P = (a, b) => [c[0] + a * u[0] + b * v[0], c[1] + a * u[1] + b * v[1]];
  const k = [P(-600, -375), P(600, -375), P(600, 375), P(-600, 375)];
  const ex = exOf([ins('이동식작업대1200-750', { rot: 45 })], k.map((p, i) => seg(p, k[(i + 1) % 4], 0)));
  const it = only(run(ex));
  expect(it).toMatchObject({ size: [1200, 750, 850], rot: 315 });
  expect(it.pos).toEqual([5000, -5000]);
  expect(run(ex).stats.offAxis).toBe(1);
});

test('거울 인서트도 자리는 전개 도형의 상자 중심', () => {
  expect(only(run(one('세정대 2조 1500-750', [3000, 2000, 4500, 2750], { mirrored: true, rot: 180 })))).toMatchObject({ productId: 'sink-double', pos: [3750, -2375], size: [1500, 750, 850] });
});

// Task 1 §3: 식탁 상자는 의자를 품는다(6인 1800×1326 · 4인 1200×1326 — 4인은 상자 긴 변이 의자 방향). 크기는 카탈로그, 방향은 블록 로컬 x(= 식탁 길이).
test('식탁은 카탈로그 크기 — 방향은 블록 로컬 x', () => {
  expect(only(run(one('식탁4인', [0, 0, 1200, 1326]))).size).toEqual([1200, 800, 750]);
  expect(only(run(one('식탁4인', [0, 0, 1326, 1200], { rot: 90 }))).size).toEqual([800, 1200, 750]);
  expect(only(run(one('식탁6인', [0, 0, 1800, 1326], { rot: 180 }))).size).toEqual([1800, 900, 750]);
});

test('제외 어휘 · 개구부 이름은 서지 않는다', () => {
  const names = ['육가', 'Z_DOT', '권-효성a3', '1f plan-1', '포켓도어800', 'DR-900'];
  const ex = exOf(names.map(n => ins(n)), names.flatMap((n, k) => box(k, k * 2000, 0, k * 2000 + 600, 600)));
  const r = run(ex);
  expect(r.items).toEqual([]);
  expect(r.stats.skipped).toMatchObject({ fixture: 1, symbol: 1, frame: 1, composite: 1 });
  expect(r.stats.placed).toBe(0);
});

test('크기 문턱: 긴 변 < equipMin은 small · > equipMax는 big(P로 바꿀 수 있다)', () => {
  const ex = exOf([ins('CT170C8P'), ins('동선표시'), ins('작업대 4000')], [...box(0, 0, 0, 100, 55), ...box(1, 0, 5000, 16010, 22555), ...box(2, 30000, 0, 34000, 750)]);
  expect(run(ex).stats.skipped).toMatchObject({ small: 1, big: 1 });
  expect(run(ex).items.map(i => i.name)).toEqual(['작업대 4000']);
  expect(run(ex, { P: { ...DXF_PARAMS, equipMax: 3000 } }).stats.skipped.big).toBe(2);
  expect([DXF_PARAMS.equipMin, DXF_PARAMS.equipMax, DXF_PARAMS.equipClash]).toEqual([150, 8000, 0.5]);
});

test('같은 이름이 중심 50 mm 안에 또 있으면 하나만', () => {
  const r = run(exOf([ins('식탁6인'), ins('식탁6인'), ins('식탁6인')], [...box(0, 0, 0, 1800, 1326), ...box(1, 20, 10, 1820, 1336), ...box(2, 5000, 0, 6800, 1326)]));
  expect(r.items).toHaveLength(2);
  expect(r.stats.skipped.dup).toBe(1);
});

test('영역(roi) 밖의 인서트는 후보가 아니다', () => {
  const ex = exOf([ins('세정대 2조 1500-750'), ins('세정대 2조 1500-750')], [...box(0, 1000, 1000, 2500, 1750), ...box(1, 21000, 1000, 22500, 1750)]);
  const r = run(ex, { roi: { x0: 0, y0: 0, x1: 10000, y1: 10000 } });
  expect(r.items.map(i => i.pos)).toEqual([[1750, -1375]]);
  expect(r.stats.placed).toBe(1);
});

test('역할표: symbol·other는 제외, equip은 이름이 문이어도 후보(제외 어휘는 그대로 이긴다)', () => {
  const ex = exOf([ins('커스텀기호'), ins('DR-900'), ins('육가')], [...box(0, 0, 0, 600, 600), ...box(1, 2000, 0, 2900, 600), ...box(2, 5000, 0, 5300, 300)]);
  expect(run(ex).items.map(i => i.name)).toEqual(['커스텀기호']);
  const blocks = new Map([['커스텀기호', { kind: 'symbol', width: null }], ['DR-900', { kind: 'equip', width: null }], ['육가', { kind: 'equip', width: null }]]);
  const r = run(ex, { roles: { blocks } });
  expect(r.items.map(i => [i.name, i.productId])).toEqual([['DR-900', 'equip-generic']]);
  expect(r.stats.skipped).toMatchObject({ symbol: 1, fixture: 1 });
  // JSON 꼴(평범한 객체)도 받는다
  expect(run(ex, { roles: { blocks: { 커스텀기호: { kind: 'other' } } } }).items).toEqual([]);
});

test('벽 부착 어휘(워터릴): 벽 면이 300 mm 안이면 벽에 붙인다(placeOnWall) — 아니면 바닥 그대로', () => {
  const W = makeWall({ a: [0, 0], b: [6000, 0], thickness: 200 });
  const near = only(run(one('워터릴', [2000, -400, 2550, -100]), { walls: [W] }));
  expect(near).toMatchObject({ attach: 'wall', wallId: W.id, side: 1, rot: 0, pos: [2275, 250], z: 1000, size: [550, 300, 550] });
  expect(near.t).toBeCloseTo(2275 / 6000, 6);
  const far = run(one('워터릴', [2000, -1200, 2550, -900]), { walls: [W] });
  expect(only(far)).toMatchObject({ attach: 'floor', wallId: null, pos: [2275, 1050], z: 1000 });
  expect(far.stats.wallMounted).toBe(0);
});

test('벽 방향 크기: 세로 벽에 붙는 온수기는 벽 방향 폭이 size[0]', () => {
  const W = makeWall({ a: [0, 0], b: [0, 6000], thickness: 200 });   // 앱 좌표 세로 벽
  const it = only(run(one('온수기 560-400', [100, -2560, 500, -2000]), { walls: [W] }));   // 앱 x 100~500 · y 2000~2560
  expect(it).toMatchObject({ attach: 'wall', wallId: W.id, size: [560, 400, 600], z: 1200 });
  expect(it.pos[0]).toBeCloseTo(300, 6);
});

test('모양으로 본 벽 부착: 짧은 변 ≤ 200이고 벽 겹침 ≥ 0.5 → 벽에 붙이고 겹침으로 세지 않는다', () => {
  const W = makeWall({ a: [0, 0], b: [6000, 0], thickness: 200 });
  const r = run(exOf([ins('zw$A460', { layer: '급식-기구NO' })], box(0, 3000, -75, 4760, 75)), { walls: [W] });
  expect(only(r)).toMatchObject({ attach: 'wall', wallId: W.id, size: [1760, 150, 850] });
  expect(r.stats).toMatchObject({ wallMounted: 1, clash: 0 });
});

test('벽 띠·기둥과 ≥ equipClash 겹치는 바닥 기구는 그래도 세우고 clash로 센다', () => {
  const W = makeWall({ a: [0, 0], b: [6000, 0], thickness: 200 });
  const col = createItem(productById('column-square'), { pos: [9000, 0], size: [600, 600, 3500] });
  const ex = exOf([ins('500인-'), ins('작업대 1000-600'), ins('세정대 1조 900-750')], [...box(0, 1000, -150, 2000, 150), ...box(1, 8700, -300, 9700, 300), ...box(2, 3000, -2000, 3900, -1250)]);
  const r = run(ex, { walls: [W], columns: [col] });
  expect(r.items).toHaveLength(3);
  expect(r.stats.clash).toBe(2);
  expect(r.items.every(i => i.attach === 'floor')).toBe(true);
});

test('아이템끼리 겹침(바닥 · AABB)은 overlap으로 센다 — 맞닿음은 아니다', () => {
  const ex = exOf([ins('작업대 1000-600'), ins('작업대 1000-600'), ins('작업대 1000-600')], [...box(0, 0, 0, 1000, 600), ...box(1, 500, 300, 1500, 900), ...box(2, 1500, 900, 2500, 1500)]);
  const r = run(ex);
  expect(r.stats).toMatchObject({ overlap: 2, overlapPairs: 1 });
});

test('후드 → hood-box(천장 · z = 층고 − 높이 · 풍량은 카탈로그 규칙) · 번호 1..n', () => {
  const r = run(exOf([ins('후드1500-1300'), ins('후드 1500-1000')], [...box(0, 0, 0, 1300, 1500), ...box(1, 5000, 0, 6500, 1000)]), { height: 3000 });
  const [a, b] = r.items;
  expect(a).toMatchObject({ productId: 'hood-box', code: 'VH-BX', kind: 'equipment', name: '후드1500-1300', size: [1300, 1500, 600], attach: 'ceiling', z: 2400 });
  expect(a.props).toMatchObject({ type: 'hood', no: 1, cmh: Math.round(1.3 * 1.5 * 0.5 * 3600) });
  expect(b.props.no).toBe(2);
  expect(r.stats).toMatchObject({ product: 2, clash: 0 });
});

// 사전 검토 3: 익명 블록 중 사각형 + 대각선 X(선 6개)는 후드 표기다(사동 8 · 신상 A 3).
test('익명 X-상자(사각형 + 대각선 둘, 짧은 변 ≥ 600) → hood-box · 아니면 일반 상자', () => {
  const xbox = (k, x0, y0, x1, y1) => [...box(k, x0, y0, x1, y1), seg([x0, y0], [x1, y1], k), seg([x0, y1], [x1, y0], k)];
  const bars = (k, x0, y0, x1, y1) => [...box(k, x0, y0, x1, y1), seg([x0 + 100, y0], [x0 + 100, y1], k), seg([x0 + 200, y0], [x0 + 200, y1], k)];
  const ex = exOf([ins('zw$E75B', { layer: '후드' }), ins('zw$AAAA'), ins('zw$BBBB')], [...xbox(0, 0, 0, 1500, 1800), ...bars(1, 5000, 0, 6500, 1800), ...xbox(2, 9000, 0, 9500, 500)]);
  const r = run(ex, { height: 3500 });
  expect(r.items.map(i => [i.name, i.productId])).toEqual([['zw$E75B', 'hood-box'], ['zw$AAAA', 'equip-generic'], ['zw$BBBB', 'equip-generic']]);
  expect(r.items[0]).toMatchObject({ size: [1500, 1800, 600], attach: 'ceiling', z: 2900 });
  expect(r.stats).toMatchObject({ anonymous: 3, product: 1 });
});

test('익명 블록: 기구·벽이 아닌 레이어 + 단서 없음 → 제외(layer) · 안쪽 글자 · 하나뿐인 어휘 자식으로 맞춘다', () => {
  const ex = exOf(
    [ins('zw$B4B3', { layer: '0' }), ins('zw$6F3E', { layer: 'AZ-LEAL' }), ins('zw$8EEB'), ins('싱크대-600X600', { parent: 2 })],
    [...box(0, 0, 0, 1600, 450), ...box(1, 3000, 0, 3580, 1200), ...box(3, 6000, 0, 6600, 550)],
    { texts: [{ p: [3200, 600], h: 100, text: '옷장', layer: 'AZ-LEAL', ins: 1 }, { p: [6300, 300], h: 100, text: '상부장', layer: '0', ins: 2 }] });
  const r = run(ex);
  expect(r.items.map(i => [i.name, i.productId])).toEqual([['zw$6F3E', 'locker-12'], ['zw$8EEB', 'sink-single']]);
  expect(r.stats.skipped.layer).toBe(1);
  // 레이어 역할을 넘기면 그것을 쓴다(검토 창의 역할 — 워커 rows)
  expect(run(ex, { layerRoles: new Map([['0', 'equip']]) }).items.map(i => i.name)).toContain('zw$B4B3');
});

test('익명 블록이 문이면 제외(opening): 큰 4분원 스윙 · 안쪽 글자가 문 기호(ASD 1,500)', () => {
  const ex = exOf([ins('adafdsaf', { layer: '건축' }), ins('A$C754401BD', { layer: '건축' })], [...box(0, 0, 0, 1206, 1249), ...box(1, 5000, 0, 5260, 2300)], {
    polyArcs: [{ c: [0, 0], r: 1091, a0: 0, a1: 90, ins: 0 }],
    texts: [{ p: [5100, 1000], h: 150, text: 'ASD 1,500', layer: '건축', ins: 1 }],
  });
  const r = run(ex);
  expect(r.items).toEqual([]);
  expect(r.stats.skipped.opening).toBe(2);
});

test('벽 레이어 위 큰 벽 조각 블록(선 ≥ 100 · 긴 변 > 4 m)은 wallPiece', () => {
  const segs = [...box(0, 0, 0, 5000, 300)];
  for (let i = 0; i < 100; i++) segs.push(seg([i * 50, 100], [i * 50 + 20, 200], 0, '벽'));
  const r = run(exOf([ins('A$C1234', { layer: '벽' })], segs));
  expect(r.items).toEqual([]);
  expect(r.stats.skipped.wallPiece).toBe(1);
});

test('위생 기구 묶음(긴 변 > 1,200)은 그 제품이 아니라 도면 기구로', () => {
  const r = run(exOf([ins('To양변기F(w)', { layer: '건축' }), ins('To세면기A', { layer: '건축' })], [...box(0, 0, 0, 2623, 1509), ...box(1, 5000, 0, 5492, 550)]));
  expect(r.items.map(i => [i.name, i.productId])).toEqual([['To양변기F(w)', 'equip-generic'], ['To세면기A', 'washbasin']]);
});

test('빈 입력', () => {
  expect(equipItems(null, { toApp })).toEqual({ items: [], stats: expect.objectContaining({ placed: 0 }) });
  expect(run(exOf([], [])).items).toEqual([]);
});
