// 기구 블록 → 아이템(src/io/dxf/equipment.js · 2026-10-12 계획 13 Task 2). 좌표: 전개 도형(DXF mm)에 explode의 ins 꼬리표를 직접 달고,
// 앱 좌표는 y만 뒤집는다(toApp — 원점 0 · 배율 1). INSERT 점(pos)은 일부러 멀리 둔다 — 실파일처럼 자리는 전개 도형에서만 읽는다.
import { test, expect } from 'vitest';
import { equipItems } from '../src/io/dxf/equipment.js';
import { insertBoxes, topOwner, groupOwner } from '../src/io/dxf/insertBoxes.js';
import { DXF_PARAMS } from '../src/io/dxf/params.js';
import { makeWall } from '../src/geom/walls.js';
import { createItem, createFloor, createEmptyProject, normalizeProject, migrate } from '../src/state/schema.js';
import { productById } from '../src/products/catalog.js';
import { kitchenFor } from '../src/products/catalogKitchen.js';
import { kitchenOr } from '../src/io/dxf/equipVocab.js';
// 2026-10-20 · 계획 17 Task 8(Fix 1): 어휘의 기존 id(legacy)로 엑셀 제품을 기구 크기·도면 이름에 맞춰 다시 고른다(kitchenFor — 그 어휘의 제품 갈래 안:
// 세부품명 → 열원 낱말 → 선택 수 → 이름 정규식 → 고정식/이동식). name = 아이템이 받는 도면 이름(정리본 — 익명 블록은 '').
const KF = (legacy, size, name = '') => kitchenFor(legacy, size, name);
import { setBlockTable } from '../src/io/dxf/blockOpenings.js';
import { explode, mat, apply } from '../src/io/dxf/explode.js';
import { buildImportMeta, buildDxfFeedback } from '../src/io/dxfFeedback.js';
import { trimToColumns } from '../src/io/dxf/equipTrim.js';
import { collidingIds } from '../src/geom/collide.js';

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

// 2026-10-12 · 계획 13 최종 리뷰 F-6(T4-1): `운반카 튀김 620`(사동 6 · 신상 A `운반차` 2)은 원 r310·280·100.6(동심) + 중심을 지나는 십자 720·820이다.
// 선분 끝만 재면 720×820으로 부풀어(정답 Ø620) 빨갛게 충돌했다. 좁은 규칙: 선분이 **전부** 가장 큰 원의 중심을 지나는 짧은 선(중점이 중심에서 5 mm 안 ·
// 길이 ≤ 4r)이고, 다른 원·호가 그 원 안이면 상자 = 그 원의 범위. 원 밖으로 나가는 다른 선이 있거나(손세정대 r185 원 · 세탁기) 원이 없으면 그대로다.
test('원 + 중심 십자 블록의 상자는 가장 큰 원의 범위 — 다른 선이 있거나 원이 없으면 그대로', () => {
  const c = [1179026, -971050];
  const cross = k => [seg([c[0], c[1] + 410], [c[0], c[1] - 410], k), seg([c[0] - 360, c[1]], [c[0] + 360, c[1]], k)];
  const rings = k => [310, 280, 100.6].map(r => ({ c, r, ins: k }));
  const cart = exOf([ins('운반카 튀김 620')], cross(0), { circles: rings(0) });
  expect(insertBoxes(cart).get(0)).toMatchObject({ box: [c[0] - 310, c[1] - 310, c[0] + 310, c[1] + 310], n: 2, circle: { r: 310 } });
  // 축이 아닌 인서트(30°)도 로컬 상자가 원의 범위다(선분 끝의 로컬 상자가 아니다).
  expect(only(run({ ...cart, inserts: [ins('운반카 튀김 620', { rot: 30 })] })).size.slice(0, 2)).toEqual([620, 620]);
  expect(only(run(cart)).size.slice(0, 2)).toEqual([620, 620]);              // 예전 720×820
  // 십자 + 원 밖으로 나가는 손잡이 선 하나 → 규칙 밖(선분 끝 상자 그대로).
  const handle = exOf([ins('운반카 튀김 620')], [...cross(0), seg([c[0] + 310, c[1] + 100], [c[0] + 600, c[1] + 100], 0)], { circles: rings(0) });
  expect(insertBoxes(handle).get(0).box).toEqual([c[0] - 360, c[1] - 410, c[0] + 600, c[1] + 410]);
  // 몸체 사각형 + 원(손세정대 보울) → 규칙 밖.
  const basin = exOf([ins('손세정대 500-370')], box(0, 0, 0, 500, 370), { circles: [{ c: [250, 185], r: 185, ins: 0 }] });
  expect(insertBoxes(basin).get(0).box).toEqual([0, 0, 500, 370]);
  // 원이 없는 십자 → 그대로. 원 밖에 걸친 호(중심은 같아도 반지름이 더 큼)가 있으면 → 그대로.
  expect(insertBoxes(exOf([ins('X')], cross(0))).get(0).box).toEqual([c[0] - 360, c[1] - 410, c[0] + 360, c[1] + 410]);
  const arcOut = exOf([ins('X')], cross(0), { circles: rings(0), arcs: [{ c, r: 500, a0: 80, a1: 100, ins: 0 }] });
  expect(insertBoxes(arcOut).get(0).box[3]).toBeGreaterThan(c[1] + 410);
});

test('이름 치수 블록 → 제품 · 자리(상자 중심) · 크기(이름) · 이름은 도면 그대로 · 코드는 제품 코드', () => {
  const it = only(run(one('다단식선반 1500-750', [1000, 1000, 2500, 1750])));
  const shelf = KF('shelf-steel-4', [1500, 750, 1800], '다단식선반 1500-750');
  expect(it).toMatchObject({ productId: shelf, code: productById(shelf).code, name: '다단식선반 1500-750', pos: [1750, -1375], size: [1500, 750, 1800], rot: 0, attach: 'floor', z: 0 });
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
  expect(it).toMatchObject({ productId: KF('ricecooker-gas', [570, 600, 1460], '취반기(전기) 150인용 570x600x1460'), name: '취반기(전기) 150인용 570x600x1460', size: [570, 600, 1460], kind: 'equipment' });
});

// 2026-10-12 수정 wave(Task 5 라벨 규칙): 이름 ≠ 제품명이면 라벨이 선다 — 익명 블록은 제품 이름(라벨 없음), 원 블록 이름은 dxfBlock에.
test('어휘에 없는 이름 → 도면 기구(정리한 도면 이름) · 익명 블록 → 도면 기구(제품 이름) · 원 이름은 모두 dxfBlock', () => {
  const r = run(exOf([ins('500인-'), ins('zw$5B59')], [...box(0, 0, 0, 1200, 800), ...box(1, 5000, 0, 7400, 1776)]));
  expect(r.items.map(i => [i.productId, i.code, i.name, i.dxfBlock, i.size])).toEqual([
    ['equip-generic', 'DR-EQ', '500인', '500인-', [1200, 800, 850]],
    ['equip-generic', 'DR-EQ', '도면 기구', 'zw$5B59', [2400, 1776, 850]],
  ]);
  expect(r.stats).toMatchObject({ placed: 2, product: 0, generic: 2, anonymous: 1, named: 1 });
  expect(only(run(one('세정대 2조 1500-750-', [0, 0, 1500, 750])))).toMatchObject({ name: '세정대 2조 1500-750', dxfBlock: '세정대 2조 1500-750-' });
});

// 2026-10-13 계획 14 Task D ②(연결은 컨트롤러): 쓰레기 이름 블록은 이름을 받지 않아 라벨이 서지 않지만, 익명이 아니라 이름 있는 일반 상자로 센다.
test('쓰레기 이름("66666"·"ccc") → 제품 이름(라벨 없음)이지만 named로 세고 dxfBlock에는 원 이름', () => {
  const r = run(exOf([ins('66666'), ins('ccc')], [...box(0, 0, 0, 1200, 800), ...box(1, 5000, 0, 6200, 800)]));
  expect(r.items.map(i => [i.name, i.dxfBlock])).toEqual([['도면 기구', '66666'], ['도면 기구', 'ccc']]);
  expect(r.stats).toMatchObject({ placed: 2, generic: 2, anonymous: 0, named: 2 });
});

test('dxfBlock은 저장·불러오기 왕복(normalizeProject → JSON → migrate)과 교정 기록 스냅숏을 지난다', () => {
  const r = run(exOf([ins('zw$E75B'), ins('워터릴')], [...box(0, 0, 0, 1500, 1800), seg([0, 0], [1500, 1800], 0), seg([0, 1800], [1500, 0], 0), ...box(1, 5000, 0, 5550, 420)]));
  const floor = { ...createFloor('1F'), items: r.items };
  const project = normalizeProject({ ...createEmptyProject(), floors: [floor] });
  const back = migrate(JSON.parse(JSON.stringify(project)));
  expect(back.floors[0].items.map(i => [i.name, i.dxfBlock])).toEqual([[productById(KF('hood-box', [1500, 1800, 600])).name, 'zw$E75B'], ['워터릴', '워터릴']]);
  const withMeta = { ...back, meta: { dxfImport: buildImportMeta({ project: back, fileName: 'a.dxf', opts: { layers: [] } }) } };
  const edited = { ...withMeta, floors: [{ ...withMeta.floors[0], items: withMeta.floors[0].items.slice(1) }] };
  const fb = buildDxfFeedback(edited);
  expect(fb.summary).toMatchObject({ importedItems: 2, itemsDeleted: 1 });
  expect(fb.items.deleted).toEqual([back.floors[0].items[0].id]);
});

test('냉장고 4도어는 제외가 아니다(숫자 뒤의 도어 = 문짝 수)', () => {
  const it = only(run(one('냉장고 4도어 1100L 1260-850', [0, 0, 1260, 1073])));
  expect(it).toMatchObject({ productId: KF('fridge-2door', [1260, 850, 1800], '냉장고 4도어 1100L 1260-850'), size: [1260, 850, 1800] });
  expect(productById(it.productId).name).toMatch(/4도어/);                    // 이름의 4도어가 대표 정규식(/2도어/)을 이긴다
});

// 2026-10-20 · 계획 17 Task 8 Fix 1(리뷰 2·3): 서는 제품은 어휘의 제품 갈래 안에서 고른다 — 같은 세부품명 전체(kitchenFit)에서 고르면 고정식작업대가
// 이동식·보조배식대로, 세탁 건조기가 세탁기로, 익명 X-상자 후드가 이중급배기후드로, (전기)·인덕션이 가스로 섰다. 도면 이름이 결과를 바꾸는 경우를 함께 본다.
test('기구 제품은 어휘의 제품 갈래 안 — 이름의 조 수·고정식/이동식·열원(전기·인덕션·가스)을 지키고, 익명 X-상자 후드는 배기후드', () => {
  const at = (name, b, o) => { const it = only(run(one(name, b, o))); return { it, p: productById(it.productId) }; };
  const sink = at('세정대 2조 1200-750', [0, 0, 1200, 750]).p;
  expect(sink.name).toMatch(/2조/);
  const fixed = at('고정식작업대 1500-750', [0, 0, 1500, 750]).p;
  expect([/고정식/.test(fixed.name), /이동식/.test(fixed.name)]).toEqual([true, false]);
  expect(productById(KF('worktable-1800', [1500, 750, 850])).name).toMatch(/이동식/);           // 이름이 없으면 크기가 딱 맞는 이동식 — 이름이 바꾼다
  const small = at('고정식작업대 700-600', [0, 0, 700, 600]).p;
  expect(small.name).toMatch(/작업대/);
  expect(small.name).not.toMatch(/보조배식대/);
  expect(at('이동식작업대1200-750', [0, 0, 1200, 750]).p.name).toMatch(/이동식/);
  expect(at('세탁 건조기 700-830', [0, 0, 700, 830]).p.name).toMatch(/건조기/);
  const rice = at('취반기(전기)선경인케이 150인용 570x600x1460', [0, 0, 570, 698]);
  expect(rice.p.equip.heat).toBe('electric');
  expect(productById(KF('ricecooker-gas', rice.it.size)).equip.heat).toBe('gas');              // 이름이 없으면 대표(가스) — 이름이 바꾼다
  const range = at('렌지 인덕션 3구 1500x750선경인케이', [0, 0, 1500, 750]).p;
  expect([range.equip.heat, /3구/.test(range.name)]).toEqual(['electric', true]);
  expect(at('회전국솥 선경인케이 300인(전기) 1520-1120-850', [0, 0, 1520, 1120]).p.equip.heat).toBe('electric');
  // 익명 X-상자(후드 레이어) — 이름이 없으니 어휘 대표 갈래(/^배기후드/) 안에서 크기 최근접.
  const xbox = [...box(0, 0, 0, 1500, 1800), seg([0, 0], [1500, 1800], 0), seg([0, 1800], [1500, 0], 0)].map(s => ({ ...s, layer: '후드' }));
  const hood = only(run(exOf([ins('zw$E75B', { layer: '후드' })], xbox)));
  expect(productById(hood.productId).name).toMatch(/^배기후드/);
  expect(hood.productId).toBe(KF('hood-box', [1500, 1800, 600]));
});

// Fix 2(2026-10-20 · 컨트롤러 결정): 이름 있는 블록은 표의 크기 대표 정규식(/2도어/ · /2조/ · /도어형/ · /손세정대/)을 쓰지 않고 이름의 제품 낱말로 거른다.
// Fix 1에서 정규식이 정확한 제품을 빼던 경우들 — 양문 1260 냉장고 → 2도어 640 · 보존식 소형 → 보냉고 2도어 · 담금 → 2조 · 컵자동세척기 → 도어형 · 멀티 3구 → 480.
test('이름 있는 블록은 크기 대표 정규식 없이 — 양문 1260은 4도어 1260 · 보존식은 소형냉장고 · 담금 · 컵 · 멀티 손세정 3인용', () => {
  const at = (name, b) => productById(only(run(one(name, b))).productId);
  const wide = at('보냉고 양문1260-800', [0, 0, 1260, 800]);
  expect([/4도어/.test(wide.name), wide.size[0]]).toEqual([true, 1260]);
  const keep = at('냉장고 보존식(1식) 605-570-954', [0, 0, 605, 570]);
  expect(keep.name).toMatch(/소형냉장고/);
  expect(keep.name).not.toMatch(/2도어/);
  expect(at('수류담금세척기 TR1500S', [0, 0, 1500, 750]).name).toMatch(/담금/);
  expect(at('컵자동세척기', [0, 0, 600, 570]).name).toMatch(/컵/);                       // 어휘 갈래(상업용식기세척기)에 컵자동세척기가 있다
  const multi = at('멀티손세정대3구 1800-550-1450', [0, 0, 1800, 550]);
  expect([/손세정/.test(multi.name), multi.size[0]]).toEqual([true, 1800]);
  expect(at('세탁기 삶기 450-540-809', [0, 0, 450, 540]).name).toMatch(/삶기용 세탁기/);
});

// Fix 3(2026-10-20 · 컨트롤러 결정): 이름 있는 블록에 제품 낱말이 안 걸리면 대표 제품과 같은 형상만(운반차가 배식대·세정대를 이기지 않게),
// 같은 거리면 표의 정규식에 맞는 후보(같은 크기 이중급배기후드보다 배기후드).
test('이름 있는 블록: 배분대·개수대·청소대는 운반차가 아니고, 이름 있는 후드는 배기후드', () => {
  const at = (name, b, o) => productById(only(run(one(name, b, o))).productId);
  const serve = at('수저식판배분대800-600', [0, 0, 800, 600]);
  expect([serve.shape === 'cart', /운반/.test(serve.name)]).toEqual([false, false]);
  for (const n of ['개수대-600X600', 'To청소대A(w)']) {
    const p = at(n, [0, 0, 600, 600], { layer: '급식기구' });
    expect([p.shape, /회수차/.test(p.name)], n).toEqual(['sink', false]);
  }
  expect(at('후드1500-1300', [0, 0, 1500, 1300]).name).toMatch(/^배기후드/);
  expect(at('후드1200-1200', [0, 0, 1200, 1200]).name).toMatch(/^배기후드/);
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

// 리뷰 M-6: 거울 테스트는 실제 전개(explode)로 — 도형을 base에서 떨어뜨린 블록을 같은 점·각도에 거울/비거울로 넣으면 상자 중심이 달라야 하고,
// 각 아이템은 제 전개 도형의 중심에 서야 한다. 축이 아닌 거울 인서트의 rot은 합성 행렬의 x축(rotOf — 30°에 x 거울이면 210°)에서 온다.
test('거울 인서트(실제 전개): 자리 = 제 전개 도형 중심(비거울과 다르다) · 축 아닌 거울의 rot = −rotOf(합성 행렬)', () => {
  const rect = [[100, 50], [1300, 50], [1300, 650], [100, 650]];
  const block = { base: [0, 0], entities: rect.map((p, i) => ({ type: 'LINE', layer: '0', x: p[0], y: p[1], x2: rect[(i + 1) % 4][0], y2: rect[(i + 1) % 4][1] })) };
  const insert = (x, xscale, a0) => ({ type: 'INSERT', name: '이동식작업대1200-600', layer: '급식기구', x, y: 0, xscale, yscale: 1, a0 });
  const doc = { entities: [insert(10000, 1, 30), insert(20000, -1, 30), insert(30000, 1, 0), insert(40000, -1, 0)], blocks: new Map([['이동식작업대1200-600', block]]) };
  const r = run(explode(doc));
  const centre = (x, xscale, a0) => apply(mat(x, 0, xscale, 1, a0), [700, 350]);
  const want = [[10000, 1, 30], [20000, -1, 30], [30000, 1, 0], [40000, -1, 0]].map(([x, s, a]) => toApp(centre(x, s, a)).map(v => Math.round(v) || 0));
  expect(r.items.map(i => i.pos)).toEqual(want);
  expect(r.items.map(i => i.rot)).toEqual([330, 150, 0, 0]);
  expect(r.items.map(i => i.size)).toEqual([[1200, 600, 850], [1200, 600, 850], [1200, 600, 850], [1200, 600, 850]]);
  // 거울이면 삽입점에서 본 중심이 반대쪽이다(거울을 무시하면 같았을 것이다)
  expect(want[3][0] - 40000).toBe(-(want[2][0] - 30000));
  expect(want[1][0] - 20000).not.toBe(want[0][0] - 10000);
});

test('거울 식탁(실제 전개): 길이 방향은 거울이어도 블록 로컬 x', () => {
  const rect = [[0, -263], [1200, -263], [1200, 1063], [0, 1063]];   // 식탁 1200(로컬 x) + 의자 → 1200×1326
  const block = { base: [0, 0], entities: rect.map((p, i) => ({ type: 'LINE', layer: '0', x: p[0], y: p[1], x2: rect[(i + 1) % 4][0], y2: rect[(i + 1) % 4][1] })) };
  const doc = { entities: [{ type: 'INSERT', name: '식탁4인', layer: '급식기구', x: 0, y: 0, xscale: -1, yscale: 1, a0: 90 }, { type: 'INSERT', name: '식탁4인', layer: '급식기구', x: 5000, y: 0, xscale: 1, yscale: -1, a0: 0 }], blocks: new Map([['식탁4인', block]]) };
  const t4 = productById(kitchenOr('dining-4')).size;
  expect(run(explode(doc)).items.map(i => i.size)).toEqual([[t4[1], t4[0], 750], [t4[0], t4[1], 750]]);
});

// Task 1 §3: 식탁 상자는 의자를 품는다(6인 1800×1326 · 4인 1200×1326 — 4인은 상자 긴 변이 의자 방향). 크기는 카탈로그, 방향은 블록 로컬 x(= 식탁 길이).
test('식탁은 카탈로그 크기 — 방향은 블록 로컬 x', () => {
  const t4 = productById(kitchenOr('dining-4')).size, t6 = productById(kitchenOr('dining-6')).size;   // 엑셀 식탁(4인용 · 6인용)
  expect(only(run(one('식탁4인', [0, 0, 1200, 1326]))).size).toEqual([t4[0], t4[1], 750]);
  expect(only(run(one('식탁4인', [0, 0, 1326, 1200], { rot: 90 }))).size).toEqual([t4[1], t4[0], 750]);
  expect(only(run(one('식탁6인', [0, 0, 1800, 1326], { rot: 180 }))).size).toEqual([t6[0], t6[1], 750]);
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

// 리뷰 M-2: 가장 가까운 중심선(끝에서 잘린 t)만 보면 끝 너머의 짧은 벽 토막 끝에 붙어 돌고 옆 벽 안으로 파고들었다(사동 zw$A96E).
// 중심의 투영이 벽 안에 드는 벽만 본다 — 토막이 더 가까워도 긴 벽(면 간격 300)에 붙고, 그것도 없으면 바닥(z 유지).
test('벽 부착은 중심 투영이 벽 안인 벽에만 — 끝 너머의 토막 벽 끝에 붙지 않는다', () => {
  const H = makeWall({ a: [0, 1000], b: [6000, 1000], thickness: 200 });      // 앱 좌표 가로 벽(면 y 900)
  const S = makeWall({ a: [3200, 800], b: [3200, 1000], thickness: 200 });    // 200 mm 토막(아래 끝 y 800)
  const reel = one('워터릴', [2600, -600, 3000, -200]);                        // 앱 x 2600~3000 · y 200~600 → 중심 (2800, 400)
  const it = only(run(reel, { walls: [H, S] }));
  expect(it).toMatchObject({ attach: 'wall', wallId: H.id, side: -1, pos: [2800, 700], rot: 180, z: 1000 });
  const far = only(run(one('워터릴', [2600, -550, 3000, -150]), { walls: [H, S] }));   // 면 간격 350 → 바닥
  expect(far).toMatchObject({ attach: 'floor', wallId: null, pos: [2800, 350], z: 1000 });
});

test('한 직선 벽이 T자 접합에서 조각으로 나뉘어도 조각 경계에 걸친 기구는 중심이 든 조각에 붙는다', () => {
  const A = makeWall({ a: [0, 1000], b: [3000, 1000], thickness: 200 }), B = makeWall({ a: [3000, 1000], b: [6000, 1000], thickness: 200 });
  const it = only(run(one('온수기 560-400', [2670, -900, 3230, -500]), { walls: [A, B] }));   // 앱 x 2670~3230(중심 2950) · y 500~900
  expect(it).toMatchObject({ attach: 'wall', wallId: A.id, size: [560, 400, 600] });
  expect(it.pos).toEqual([2950, 700]);
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
  const H = KF('hood-box', [1300, 1500, 600], '후드1500-1300');
  expect(a).toMatchObject({ productId: H, code: productById(H).code, kind: 'equipment', name: '후드1500-1300', size: [1300, 1500, 600], attach: 'ceiling', z: 2400 });
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
  const H = KF('hood-box', [1500, 1800, 600]);
  expect(r.items.map(i => [i.dxfBlock, i.productId])).toEqual([['zw$E75B', H], ['zw$AAAA', 'equip-generic'], ['zw$BBBB', 'equip-generic']]);
  expect(r.items[0]).toMatchObject({ name: productById(H).name, size: [1500, 1800, 600], attach: 'ceiling', z: 2900 });
  expect(r.stats).toMatchObject({ anonymous: 3, product: 1 });
});

// 리뷰 M-3: 벽·개구부·축선 레이어의 X는 샤프트·EV·개구부 표기다 — 후드(환기 집계)는 기구 레이어(또는 역할표 equip)의 X-상자만.
// 2026-10-12 · 계획 13 최종 리뷰 F-7(M2-1): `other`도 빼고 뒤집었다 — 레이어 0의 X는 한국 도면에서 개구부·샤프트·EV 표기로 흔하고, Task 7 뒤에는
// `*DIVIDER*` 레이어도 other다. 가짜 후드 하나가 실 배기에 4~5천 CMH를 더한다. 레이어 0의 단서 없는 익명 X-상자는 기호로 빠진다(layer).
test('X-상자 후드는 레이어 역할이 equip일 때만 — 벽 레이어는 일반 상자 · 레이어 0(other)은 후드가 아니다', () => {
  const xbox = (k, x0, y0, x1, y1, layer) => [...box(k, x0, y0, x1, y1).map(s => ({ ...s, layer })), seg([x0, y0], [x1, y1], k, layer), seg([x0, y1], [x1, y0], k, layer)];
  const ex = exOf([ins('zw$1111', { layer: '벽' }), ins('zw$2222', { layer: '0' }), ins('zw$3333', { layer: 'TOILET DIVIDER' }), ins('zw$4444', { layer: '후드' })],
    [...xbox(0, 0, 0, 1500, 1800, '벽'), ...xbox(1, 5000, 0, 6500, 1800, '0'), ...xbox(2, 9000, 0, 10500, 1800, 'TOILET DIVIDER'), ...xbox(3, 13000, 0, 14500, 1800, '후드')]);
  const r = run(ex);
  const H = KF('hood-box', [1500, 1800, 600]);
  expect(r.items.map(i => [i.dxfBlock, i.productId])).toEqual([['zw$1111', 'equip-generic'], ['zw$4444', H]]);
  expect(r.stats.skipped.layer).toBe(2);                                  // 레이어 0 · DIVIDER의 X-상자는 기호
  expect(r.items.filter(i => i.productId === H)).toHaveLength(1);
  // 역할표 equip이면(사람·도구가 기구라고 했다) 어느 레이어든 후드다.
  const forced = run(ex, { roles: { blocks: new Map([['zw$1111', { kind: 'equip', width: null }], ['zw$2222', { kind: 'equip', width: null }]]) } });
  expect(forced.items.filter(i => ['zw$1111', 'zw$2222'].includes(i.dxfBlock)).map(i => i.productId)).toEqual([H, H]);
});

// 리뷰 I-1(Task 1 §7 "레이어 역할 opening → opening"): 공개 코퍼스의 DBLK@WINDOW(760×760 문)·WBLK(900×200 창)가 '도면 기구'로 섰다.
test('개구부 레이어 위의 블록은 창·문 — 제외(opening) · 역할표 equip이면 선다', () => {
  const ex = exOf([ins('DBLK', { layer: 'WINDOW' }), ins('M_A2ZXL', { layer: 'A-FIX' })], [...box(0, 0, 0, 760, 760), ...box(1, 3000, 0, 3900, 200)]);
  const r = run(ex, { layerRoles: new Map([['A-FIX', 'opening'], ['WINDOW', 'opening']]) });
  expect(r.items).toEqual([]);
  expect(r.stats.skipped.opening).toBe(2);
  expect(run(ex).stats.skipped.opening).toBe(1);                 // 레이어 행이 없으면 이름 규칙(WINDOW → opening · A-FIX → other)
  const forced = run(ex, { roles: { blocks: new Map([['DBLK', { kind: 'equip', width: null }]]) }, layerRoles: new Map([['WINDOW', 'opening']]) });
  expect(forced.items.map(i => i.dxfBlock)).toEqual(['DBLK', 'M_A2ZXL']);
});

// 리뷰 M-1: 역할표를 넘기지 않아도 워커가 세운 블록 종류표(setBlockTable)의 창·문은 후보가 아니다(문과 기구 둘 다로 서지 않게).
test('워커의 블록 종류표가 문이라 한 블록은 roles 없이도 후보가 아니다', () => {
  const ex = one('출입구표시-A', [0, 0, 900, 300]);
  expect(run(ex).items).toHaveLength(1);
  setBlockTable(new Map([['출입구표시-A', { kind: 'door', width: 900 }]]));
  try { expect(run(ex).items).toEqual([]); } finally { setBlockTable(null); }
});

test('짧은 변 < 60 mm는 막대·선(thin)', () => {
  const r = run(exOf([ins('막대표시'), ins('작업대 1000-600')], [...box(0, 0, 0, 1703, 38), ...box(1, 3000, 0, 4000, 600)]));
  expect(r.items.map(i => i.name)).toEqual(['작업대 1000-600']);
  expect(r.stats.skipped.thin).toBe(1);
});

test('익명 블록: 기구·벽이 아닌 레이어 + 단서 없음 → 제외(layer) · 안쪽 글자 · 하나뿐인 어휘 자식으로 맞춘다', () => {
  const ex = exOf(
    [ins('zw$B4B3', { layer: '0' }), ins('zw$6F3E', { layer: 'AZ-LEAL' }), ins('zw$8EEB'), ins('싱크대-600X600', { parent: 2 })],
    [...box(0, 0, 0, 1600, 450), ...box(1, 3000, 0, 3580, 1200), ...box(3, 6000, 0, 6600, 550)],
    { texts: [{ p: [3200, 600], h: 100, text: '옷장', layer: 'AZ-LEAL', ins: 1 }, { p: [6300, 300], h: 100, text: '상부장', layer: '0', ins: 2 }] });
  const r = run(ex);
  const [locker, sink] = r.items;
  expect(r.items.map(i => i.dxfBlock)).toEqual(['zw$6F3E', 'zw$8EEB']);
  expect([locker.productId, sink.productId]).toEqual([KF('locker-12', locker.size), KF('sink-single', sink.size)]);
  expect([locker.name, sink.name]).toEqual([productById(locker.productId).name, productById(sink.productId).name]);   // 익명 블록 — 제품 이름(라벨 없음)
  expect(r.stats.skipped.layer).toBe(1);
  // 레이어 역할을 넘기면 그것을 쓴다(검토 창의 역할 — 워커 rows)
  expect(run(ex, { layerRoles: new Map([['0', 'equip']]) }).items.map(i => i.dxfBlock)).toContain('zw$B4B3');
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
  expect(r.items.map(i => [i.name, i.productId])).toEqual([['To양변기F(w)', 'equip-generic'], ['To세면기A', KF('washbasin', r.items[1].size, 'To세면기A')]]);
});

test('빈 입력', () => {
  expect(equipItems(null, { toApp })).toEqual({ items: [], stats: expect.objectContaining({ placed: 0, trimmed: 0 }) });
  expect(run(exOf([], [])).items).toEqual([]);
});

// ── 기둥 접촉 깎기(src/io/dxf/equipTrim.js · 2026-10-13 계획 14 Task A) ─────────────────────────────
// 사동중 기둥–기구 8쌍 중 7쌍이 기둥 면에 붙여 그린 작도 오차(4~47 mm)라 가져온 직후 배너 "충돌 28건"의 절반이 사람이 옮길 일이 아니었다.
// 겹침 깊이가 작은 축에서 ≤ equipTrim이면 그 축의 기둥 쪽 변만 깎는다 — 먼 변은 도면 자리 그대로, 자리를 옮기지 않는다(크기만).
// 기둥 x [700, 1300] · y [−300, 300](앱 좌표).
const colAt = (x, y, o = {}) => createItem(productById('column-square'), { pos: [x, y], size: [600, 600, 3500], ...o });
const gen = (pos, size, o = {}) => createItem(productById('equip-generic'), { pos, size: [...size, 850], dxfBlock: 'zw$TEST', dxfProduct: 'equip-generic', ...o });
const far = it => it.pos[0] - it.size[0] / 2;

test('기둥에 10 mm 들어간 바닥 기구 → 그쪽 변만 10 깎는다(폭 −10 · 중심 −5 · 먼 변 그대로) · 블록·제품 표지 유지 · 충돌이 사라진다', () => {
  const col = colAt(1000, 0), it = gen([210, 0], [1000, 600]);           // x [−290, 710] — 기둥에 10 · y는 600 전부 겹친다
  expect(collidingIds([col, it]).size).toBe(2);
  const r = trimToColumns([it], [col]);
  expect(r.trimmed).toBe(1);
  expect(r.items[0]).toMatchObject({ id: it.id, pos: [205, 0], size: [990, 600, 850], dxfBlock: 'zw$TEST', dxfProduct: 'equip-generic', rot: 0, attach: 'floor' });
  expect(far(r.items[0])).toBe(far(it));                                  // 먼 변(−290)은 도면 그대로
  expect(collidingIds([col, ...r.items]).size).toBe(0);
  // y 쪽 · 기둥이 아래(−y)에 있으면 아래 변: y [−200, 200]에 기둥 y [−780, −180] → 20 깎아 y [−180, 200]
  const low = trimToColumns([gen([1000, 0], [600, 400])], [colAt(1000, -480)]).items[0];
  expect(low).toMatchObject({ pos: [1000, 10], size: [600, 380, 850] });
});

test('90° 돈 기구는 월드 x가 깊이 칸이다 — 그 칸을 깎는다 · 소수 깊이는 올려 깎는다(크기는 mm 정수)', () => {
  const r = trimToColumns([gen([210, 0], [600, 1000], { rot: 90 })], [colAt(1000, 0)]);
  expect(r.items[0]).toMatchObject({ pos: [205, 0], size: [600, 990, 850], rot: 90 });
  const frac = trimToColumns([gen([210, 0], [1000, 600])], [colAt(1000.4, 0)]).items[0];   // 기둥 x [700.4, 1300.4] — 깊이 9.6 → 10
  expect(frac).toMatchObject({ pos: [205, 0], size: [990, 600, 850] });
});

test('80 mm 들어간 것은 진짜 겹침(그린 대로 두고 사람이 본다) · 1 mm는 맞닿음 — 둘 다 그대로', () => {
  const it = gen([280, 0], [1000, 600]);                                  // x [−220, 780] — 깊이 80
  const r = trimToColumns([it], [colAt(1000, 0)]);
  expect(r.trimmed).toBe(0);
  expect(r.items[0]).toEqual(it);
  // 1 mm 겹침은 맞닿음(collide.js tol 1 — 빨갛지 않다)이라 깎을 까닭이 없다
  const touch = gen([201, 0], [1000, 600]);                               // x [−299, 701]
  expect(collidingIds([colAt(1000, 0), touch]).size).toBe(0);
  expect(trimToColumns([touch], [colAt(1000, 0)]).items[0]).toEqual(touch);
});

// 2026-10-13 · 최종 리뷰 X-10(M-A1): 두 축 모두 ≤ equipTrim인 모서리 접촉은 **작은 축**만 깎는다(equipTrim.js — 겹침이 얕은 쪽이 작도 오차다).
// 이 단언이 없어 큰 축을 깎게 바꿔도 테스트가 모두 지났다. 기구 x [−290, 710] · y [270, 870] vs 기둥 x [700, 1300] · y [−300, 300] → x 10 · y 30.
test('모서리 접촉(두 축 모두 ≤ equipTrim)은 작은 축만 깎는다', () => {
  const r = trimToColumns([gen([210, 570], [1000, 600])], [colAt(1000, 0)]);
  expect(r.trimmed).toBe(1);
  expect(r.items[0]).toMatchObject({ pos: [205, 570], size: [990, 600, 850] });
  expect(collidingIds([colAt(1000, 0), ...r.items]).size).toBe(0);
});

test('두 기둥 사이에 낀 기구 → 양쪽 변을 다 깎는다', () => {
  const it = gen([5, 0], [1430, 600]);                                    // x [−710, 720] — 왼쪽 기둥 [−1300, −700]에 10 · 오른쪽 [700, 1300]에 20
  const r = trimToColumns([it], [colAt(-1000, 0), colAt(1000, 0)]);
  expect(r.trimmed).toBe(1);
  expect(r.items[0]).toMatchObject({ pos: [0, 0], size: [1400, 600, 850] });
  expect(collidingIds([colAt(-1000, 0), colAt(1000, 0), ...r.items]).size).toBe(0);
});

test('45° 돈 기구 · 벽 부착 · 천장 기구 · 축이 아닌 기둥은 그대로', () => {
  const col = colAt(1000, 0);
  // 모두 rot 0 바닥이었다면 10 mm 깎였을 자리다(첫 테스트와 같은 상자).
  const turned = gen([210, 0], [1000, 600], { rot: 45 });
  const onWall = gen([210, 0], [1000, 600], { attach: 'wall', z: 900 });
  const ceiling = gen([210, 0], [1000, 600], { attach: 'ceiling', z: 2900 });
  expect(collidingIds([col, turned]).size).toBe(2);                        // 돈 기구는 진짜로 기둥에 닿아 있다(그래도 "그쪽 변"이 없다)
  const r = trimToColumns([turned, onWall, ceiling], [col]);
  expect(r.trimmed).toBe(0);
  expect(r.items).toEqual([turned, onWall, ceiling]);
  // 3° 돈 기구 · 3° 돈 기둥(AABB x [684.7, 1315.3] — AABB로 재면 25 mm라 깎였을 것)도 그대로
  expect(trimToColumns([gen([210, 0], [1000, 600], { rot: 3 })], [col]).trimmed).toBe(0);
  expect(trimToColumns([gen([210, 0], [1000, 600])], [colAt(1000, 0, { rot: 3 })]).trimmed).toBe(0);
  // 축 정렬 판정은 90의 배수 둘레다 — 180° 기둥(사동 실도면)은 깎는다
  expect(trimToColumns([gen([210, 0], [1000, 600])], [colAt(1000, 0, { rot: 180 })]).trimmed).toBe(1);
});

test('깎은 변이 equipMin 아래가 되면 깎지 않는다(경계 = equipMin은 깎는다)', () => {
  expect(DXF_PARAMS.equipMin).toBe(150);
  const thin = gen([648, 0], [194, 400]);                                 // x [551, 745] — 깊이 45 → 149
  expect(trimToColumns([thin], [colAt(1000, 0)]).items[0]).toEqual(thin);
  const edge = trimToColumns([gen([648, 0], [196, 400])], [colAt(1000, 0)]).items[0];   // x [550, 746] — 깊이 46 → 150
  expect(edge).toMatchObject({ pos: [625, 0], size: [150, 400, 850] });
});

test('equipItems: 기둥에 닿은 바닥 기구를 깎고 stats.trimmed로 센다 — 이름 치수 상자도 · 크게 겹친 것은 그대로', () => {
  const col = createItem(productById('column-square'), { pos: [9000, 0], size: [600, 600, 3500] });   // x [8700, 9300]
  // 작업대: 앱 x [7710, 8710] — 기둥에 10 · 선반: x [9250, 10750] — 기둥에 50(= equipTrim, 깎는다) · 세정대: x [8800, 9700] · y [−950, −200] — 500 · 100(그대로)
  const ex = exOf([ins('작업대 1000-600'), ins('다단식선반 1500-750'), ins('세정대 1조 900-750')],
    [...box(0, 7710, -300, 8710, 300), ...box(1, 9250, -375, 10750, 375), ...box(2, 8800, 200, 9700, 950)]);
  const r = run(ex, { columns: [col] });
  expect(r.stats.trimmed).toBe(2);
  expect(r.items.map(i => [i.dxfBlock, i.pos, i.size.slice(0, 2)])).toEqual([
    ['작업대 1000-600', [8205, 0], [990, 600]],
    ['다단식선반 1500-750', [10025, 0], [1450, 750]],
    ['세정대 1조 900-750', [9250, -575], [900, 750]],
  ]);
  expect(r.items.every(i => i.dxfBlock && i.dxfProduct)).toBe(true);
  expect(DXF_PARAMS.equipTrim).toBe(50);
});

// ── 복합 블록 전개(insertBoxes.groupOwner · 2026-10-13 계획 14 Task F) ─────────────────────────────
// 사동 `1f plan-1`(건물 블록 — 어휘 자식 8: 샤워기 4 · 세면대 2 · 변기 2) · 내곡 `afadfasdfasfd` ×2(영유아거치대 · 세면대 평면) · 신상 A `zw$CEA1`(곡물받침대 ×2)은
// 그룹이라 세우지 않거나(제외 composite) 하나의 엉뚱한 상자(안쪽 글자 '폐식용유보관함'이 12칸 사물함으로 맞아 1400×900)로 섰다. 깊이 1 자식 중 어휘 자식이 ≥ 2이고 부모가 어휘가 아니면
// 그 어휘 자식만 제 전개 도형으로 세우고 부모는 세우지 않는다. 자리·회전은 실제 전개(explode — 내장 INSERT의 pos·rot은 이미 월드)로 확인한다.
const rectBlock = (w, d, more = []) => ({ base: [0, 0], entities: [...[[0, 0], [w, 0], [w, d], [0, d]].map((p, i, a) => ({ type: 'LINE', layer: '0', x: p[0], y: p[1], x2: a[(i + 1) % 4][0], y2: a[(i + 1) % 4][1] })), ...more] });
const sub = (name, x, y) => ({ type: 'INSERT', name, layer: '0', x, y, xscale: 1, yscale: 1, a0: 0 });
const groupDoc = (kids, inserts) => ({
  entities: inserts.map(([x, xscale, a0]) => ({ type: 'INSERT', name: '화장실묶음', layer: '급식기구', x, y: 0, xscale, yscale: 1, a0 })),
  blocks: new Map([['화장실묶음', rectBlock(4000, 2000, kids)], ['변기', rectBlock(580, 758)], ['손세정대 500-370', rectBlock(500, 370)], ['X1', rectBlock(300, 300)], ['의자', rectBlock(450, 450)],
    ['식탁6인', rectBlock(1800, 900, [sub('의자', 0, -300), sub('의자', 900, -300)])]]),
});
const KIDS = [sub('변기', 200, 200), sub('변기', 1200, 200), sub('손세정대 500-370', 2500, 1500), sub('X1', 3500, 200)];

test('groupOwner: 어휘 깊이 1 자식 ≥ 2이고 부모가 어휘가 아니면 그 자식(과 자손)이 제 주인 — 아니면 topOwner 그대로', () => {
  const vocab = n => ['변기', '세면대', '식탁6인', '의자'].includes(n);
  const I = (name, parent) => ({ name, ...(parent != null ? { parent } : {}) });
  const ins0 = [I('G'), I('변기', 0), I('세면대', 0), I('X', 0), I('Y', 1), I('변기', 4), I('H'), I('변기', 6), I('식탁6인'), I('의자', 8), I('의자', 8)];
  const { owner, groups } = groupOwner(ins0, vocab);
  expect(owner).toEqual([0, 1, 2, 0, 1, 1, 6, 6, 8, 8, 8]);   // 깊이 2의 변기(5)는 세지 않고 1을 따른다 · H는 어휘 자식 1 · 식탁6인은 부모가 어휘
  expect([...groups]).toEqual([[0, [1, 2]]]);
  expect(groupOwner(ins0, () => false).owner).toEqual(topOwner(ins0));
  expect(topOwner(ins0, new Set([3]))).toEqual([0, 0, 0, 3, 0, 0, 6, 6, 8, 8, 8]);
});

test('복합 블록(실제 전개): 어휘 자식 3 → 세 아이템이 제 전개 도형 중심에 · 그룹과 어휘 아닌 자식은 서지 않는다 · expanded 1', () => {
  const r = run(explode(groupDoc(KIDS, [[10000, 1, 0]])));
  expect(r.items.map(i => [i.dxfBlock, i.productId, i.pos, i.size])).toEqual([
    ['변기', 'toilet', [10490, -579], [580, 758, 800]],
    ['변기', 'toilet', [11490, -579], [580, 758, 800]],
    ['손세정대 500-370', KF('washbasin', [500, 370, 850], '손세정대 500-370'), [12750, -1685], [500, 370, 850]],
  ]);
  expect(r.stats).toMatchObject({ placed: 3, product: 3, expanded: 1 });
  expect(r.stats.skipped.composite).toBe(0);
});

// 2026-10-13 · 최종 리뷰 X-10(M-F3): 전개는 **깊이 1**만 본다(insertBoxes.groupOwner의 top(p) — 사전 검토 I-7: 건물 블록 안 묶음의 손자까지 올리면 사동이 236).
// 어휘가 아닌 깊이 1 자식(화장실묶음) 아래 어휘 손자가 둘 이상이어도 손자는 올라오지 않고, 바깥 묶음이 지금처럼 상자 하나다. 이 단언이 없어 top(p)를 지워도 지났다.
test('groupOwner: 깊이 1 제한 — 어휘 아닌 자식 아래 어휘 손자 둘은 올라오지 않는다', () => {
  const vocab = n => ['변기', '세면대'].includes(n);
  const I = (name, parent) => ({ name, ...(parent != null ? { parent } : {}) });
  const { owner, groups } = groupOwner([I('G'), I('Y', 0), I('변기', 1), I('세면대', 1)], vocab);
  expect(owner).toEqual([0, 0, 0, 0]);
  expect(groups.size).toBe(0);
});

test('복합 블록(실제 전개): 깊이 2의 어휘 손자는 서지 않는다 — 바깥 묶음 상자 하나 · expanded 0', () => {
  const doc = groupDoc(KIDS, []);
  doc.blocks.set('외곽', rectBlock(4500, 2500, [sub('화장실묶음', 200, 200)]));
  doc.entities = [{ type: 'INSERT', name: '외곽', layer: '급식기구', x: 10000, y: 0, xscale: 1, yscale: 1, a0: 0 }];
  const r = run(explode(doc));
  expect(r.items.map(i => [i.dxfBlock, i.productId, i.pos, i.size.slice(0, 2)])).toEqual([['외곽', 'equip-generic', [12250, -1250], [4500, 2500]]]);
  expect(r.stats).toMatchObject({ placed: 1, expanded: 0 });
});

// 2026-10-13 · 최종 리뷰 X-4(M-F1): 내곡 afadfasdfasfd ×2의 깊이 1 자식은 영유아거치대 · 세면대 평면 · 장애인화장실 대변기_평면(변기 한 벌 1089×857)이다.
// 마지막이 제외 목록(composite)에 있어 변기가 서지 않았다 — 이제 어휘 자식으로 세어 변기로 선다(내곡 equip 15 → 17 · 제품 6 → 8).
test('복합 블록(실제 전개): 내곡 묶음의 장애인화장실 대변기_평면은 어휘 자식이라 변기로 선다', () => {
  const kids = [sub('영유아거치대', 200, 200), sub('세면대 평면', 1200, 200), sub('장애인화장실 대변기_평면', 2500, 500)];
  const doc = {
    entities: [{ type: 'INSERT', name: 'afadfasdfasfd', layer: '급식기구', x: 10000, y: 0, xscale: 1, yscale: 1, a0: 0 }],
    blocks: new Map([['afadfasdfasfd', rectBlock(4000, 2000, kids)], ['영유아거치대', rectBlock(500, 400)], ['세면대 평면', rectBlock(600, 450)], ['장애인화장실 대변기_평면', rectBlock(1089, 857)]]),
  };
  const r = run(explode(doc));
  expect(r.items.map(i => [i.dxfBlock, i.productId, i.size.slice(0, 2)])).toEqual([
    ['영유아거치대', 'equip-generic', [500, 400]], ['세면대 평면', KF('washbasin', r.items[1].size, '세면대 평면'), [600, 450]], ['장애인화장실 대변기_평면', 'toilet', [1089, 857]]]);
  expect(r.stats).toMatchObject({ placed: 3, expanded: 1 });
  expect(r.stats.skipped.composite).toBe(0);
});

test('복합 블록: 어휘 자식이 하나뿐이면 지금처럼 그룹 하나(전개 상자) · 부모가 어휘(식탁6인 + 의자 2)면 전개하지 않는다', () => {
  const r = run(explode(groupDoc([KIDS[0], KIDS[3]], [[10000, 1, 0]])));
  expect(r.items.map(i => [i.dxfBlock, i.productId, i.pos, i.size.slice(0, 2)])).toEqual([['화장실묶음', 'equip-generic', [12000, -1000], [4000, 2000]]]);
  expect(r.stats.expanded).toBe(0);
  const doc = groupDoc([], []);
  doc.entities = [{ type: 'INSERT', name: '식탁6인', layer: '급식기구', x: 0, y: 0, xscale: 1, yscale: 1, a0: 0 }];
  const t = run(explode(doc));
  expect(t.items.map(i => [i.dxfBlock, i.productId])).toEqual([['식탁6인', KF('dining-6', t.items[0].size, '식탁6인')]]);
  expect(t.stats.expanded).toBe(0);
});

test('복합 블록(실제 전개): 회전·거울 그룹의 자식 자리 = 부모 행렬을 거친 제 도형 중심 · 축 아닌 거울 자식의 rot = −rotOf(합성 행렬)', () => {
  const at = [[20000, -1, 30], [40000, 1, 90]];
  const r = run(explode(groupDoc(KIDS, at)));
  const centre = ([x, s, a], kid) => toApp(apply(mat(x, 0, s, 1, a), kid)).map(v => Math.round(v) || 0);
  const local = [[490, 579], [1490, 579], [2750, 1685]];      // 자식 삽입점 + 제 도형 중심(블록 좌표)
  expect(r.items.map(i => i.pos)).toEqual(at.flatMap(g => local.map(c => centre(g, c))));
  expect(r.items.map(i => i.rot)).toEqual([150, 150, 150, 0, 0, 0]);   // 30° + x 거울 → 합성 x축 210° → 앱 150 · 90°는 축 정렬(월드 상자)
  expect(r.items.map(i => i.size.slice(0, 2))).toEqual([[580, 758], [580, 758], [500, 370], [758, 580], [758, 580], [370, 500]]);
  expect(r.stats.expanded).toBe(2);
  // 거울이면 삽입점에서 본 자식이 반대쪽이다(거울을 무시하면 x가 20000보다 컸을 것이다)
  expect(r.items[0].pos[0]).toBeLessThan(20000);
});
