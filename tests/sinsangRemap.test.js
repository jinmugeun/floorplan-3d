// 신상중 템플릿 기구 ↔ 구입목록 짝(계획 20 Task 8 · 명세 D9·D10): 도면의 구입 번호 글자 → 가까운 기구(거리 + 크기 차 + 형상 − 이름 낱말) · 적용은 제품만 바꾼다.
import { test, expect } from 'vitest';
import * as THREE from 'three';
import { distToItem, matchLabels, applyMap, nameWords, sharesWord, nameBonus, NAME_BONUS, frontDir, fitItem, wallRay, FACE_MM } from '../tools/products/sinsang-remap.mjs';
import { isDrawnItem } from '../src/io/estimate.js';
import { readFileSync } from 'node:fs';
import { productById } from '../src/products/catalog.js';
import purchase from '../src/products/purchaseData.js';
import { itemMesh } from '../src/view3d/items3d.js';
import { placeOnWall, itemCorners } from '../src/geom/items.js';

const item = (id, productId, pos, size, extra = {}) => ({ id, kind: 'product', productId, name: id, code: 'X', pos, size, rot: 0, attach: 'floor', color: '#cfd4da', ...extra });

test('distToItem: 바닥 사각형 안이면 0 · 밖이면 가장자리까지 · 90° 돌면 가로·깊이가 바뀐다 · 비스듬하면(30°) 돌린 사각형을 감싸는 축 정렬 상자', () => {
  const it = item('a', 'k-1', [1000, 1000], [1200, 600, 850]);
  expect(distToItem([1000, 1000], it)).toBe(0);
  expect(distToItem([1000, 1500], it)).toBe(200);                       // 깊이 600의 반 = 300 → 500 − 300
  expect(distToItem([1000, 1500], { ...it, rot: 90 })).toBe(0);         // 돌면 깊이 쪽 반이 600
  // 30°: 반폭 = (1200·cos30 + 600·sin30)/2 ≈ 669.6 · 반깊이 = (1200·sin30 + 600·cos30)/2 ≈ 559.8
  const t30 = { ...it, rot: 30 };
  expect(distToItem([1700, 1000], t30)).toBeCloseTo(700 - (1200 * Math.cos(Math.PI / 6) + 300) / 2, 6);   // ≈ 30.4(안 돌리면 100)
  expect(distToItem([1000, 1550], t30)).toBe(0);                        // 반깊이 ≈ 559.8 > 550(안 돌리면 250)
  expect(distToItem([1700, 1000], { ...it, rot: 330 })).toBeCloseTo(distToItem([1700, 1000], t30), 9);   // −30°도 같은 상자
});

test('nameWords · sharesWord: 한글·영문 낱말(숫자·규격·단위·문장부호로 가르고 2자 이상 · 흔한 낱말 뺌) · 한쪽이 다른 쪽을 품으면 같은 낱말', () => {
  expect(nameWords('1조 세정대 (STS 배수구)')).toEqual(['세정대']);
  expect(nameWords('취반기(전기) 150인용 570x600x1460')).toEqual(['취반기']);
  expect(nameWords('음식물처리기 150KG 1350-830')).toEqual(['음식물처리기']);
  expect(nameWords('LED검수대')).toEqual(['LED', '검수대']);
  expect(nameWords('도면 기구')).toEqual([]);                            // 익명 도면 기구의 자리표 이름
  expect(sharesWord('전기 인덕션 취반기', '취반기(전기) 150인용 570x600x1460')).toBe(true);
  expect(sharesWord('1조 세정대 (STS 배수구)', '세정대 1조 900-750')).toBe(true);
  expect(sharesWord('고정식 작업대', '이동식작업대1500-750')).toBe(true);   // '작업대' ⊂ '이동식작업대'
  expect(sharesWord('냉장냉동고 4도어', '세정대 2조')).toBe(false);
  expect(sharesWord('전기 교반기', '전기오븐 코스티모24단1150-1140-1500')).toBe(false);   // '전기'는 흔한 낱말이라 빠진다
  expect(NAME_BONUS).toBe(0.6);
});

test('nameBonus: NAME_BONUS × 맞음 정도(짧은 낱말 길이 ÷ 긴 낱말 길이 · 가장 잘 맞는 쌍) — 온전히 같은 낱말 0.6 · 부분 낱말은 그만큼 작다', () => {
  const tr = '수류담금세척기 TR1500S';
  expect(nameBonus('1조 세정대 (STS 배수구)', '세정대 1조 900-750')).toBe(0.6);               // '세정대' ↔ '세정대'
  expect(nameBonus('수류담금세척기', tr)).toBe(0.6);
  expect(nameBonus('담금 세정대', tr)).toBeCloseTo(0.6 * 2 / 7, 9);                           // '담금' ⊂ '수류담금세척기'
  expect(nameBonus('담금 세정대', tr)).toBeLessThan(nameBonus('수류담금세척기', tr));
  expect(nameBonus('고정식 작업대', '이동식작업대1500-750')).toBeCloseTo(0.6 * 3 / 6, 9);       // '작업대' ⊂ '이동식작업대'
  expect(nameBonus('담금 세정대', '세정대 수류담금세척기')).toBe(0.6);                           // 여러 쌍이 맞으면 가장 잘 맞는 쌍(첫 쌍 2/7이 아니라 '세정대' 1)
  expect(nameBonus('냉장냉동고 4도어', '세정대 2조')).toBe(0);
});

test('matchLabels: 번호 → 가까운 기구 · 형상이 맞는 쪽이 이긴다 · 문·기둥·천장은 가장 좋은 후보여도 빠진다 · 약한 짝 · 행 없는 번호 · 못 찾은 번호 · 수량 차', () => {
  const shapes = { 'k-sink': 'sink', 'k-table': 'worktable', 'k-sink2': 'sink', 'k-rice2': 'ricecooker', 'k-mix2': 'mixer', 'k-sinkdoor': 'sink', 'k-sinkhood': 'sink', 'k-sinkcol': 'sink' };
  const shapeOf = id => shapes[id];
  const S = [900, 750, 850];
  // 문·천장 후드·기둥: 18번 글자 바로 위 · 크기·형상·이름이 18번 행과 같다 → 빠지지 않으면 점수가 가장 낮다(아래 대조로 확인)
  const blocked = [
    item('door1', 'k-sinkdoor', [600, 0], S, { kind: 'door', attach: 'wall', name: '세정대 문' }),
    item('hood1', 'k-sinkhood', [600, 0], S, { attach: 'ceiling', name: '세정대 후드' }),
    item('col1', 'k-sinkcol', [600, 0], S, { kind: 'column', name: '세정대 기둥' }),
  ];
  const items = [
    item('sink1', 'k-sink', [0, 0], S),
    item('table1', 'k-table', [1000, 0], S),
    item('gen1', 'equip-generic', [5000, 0], [600, 570, 1460]),
    item('mixer1', 'k-table', [8000, 0], S),
    ...blocked,
  ];
  const rows = [
    { no: 18, dwg: 18, name: '1조 세정대 (STS 배수구)', size: S, qty: 1, loc: '세척실1', id: 'k-sink2' },
    { no: 1, dwg: 1, name: '전기 인덕션 취반기', size: [572, 800, 1500], qty: 2, loc: '조리실2', id: 'k-rice2' },
    { no: 3, dwg: 3, name: '전기 교반기', size: [1500, 1120, 1360], qty: 1, loc: '조리실', id: 'k-mix2' },
  ];
  // 18번 글자는 작업대(table1)와 싱크(sink1) 사이 — 싱크가 조금 멀어도 형상이 맞아 이긴다 · 1번 첫 글자는 도면 기구(형상 없음) ·
  // 1번 둘째 글자 곁에는 형상·크기가 다른 작업대(mixer1)뿐 → 약한 짝 · 77번은 행이 없다 · 18번 둘째 글자는 2500 mm 안에 기구가 없다 · 3번은 글자가 없다
  const labels = [{ no: 18, p: [600, 0] }, { no: 1, p: [5000, 200] }, { no: 77, p: [0, 0] }, { no: 18, p: [90000, 0] }, { no: 1, p: [8000, 0] }];
  const r = matchLabels(labels, items, rows, shapeOf);
  expect(r.pairs.map(p => [p.no, p.itemId, p.productId, p.from])).toEqual([[1, 'gen1', 'k-rice2', 'equip-generic'], [1, 'mixer1', 'k-rice2', 'k-table'], [18, 'sink1', 'k-sink2', 'k-sink']]);
  expect(r.pairs.find(p => p.itemId === 'gen1')).toMatchObject({ dist: 0, weak: false });
  expect(r.pairs.find(p => p.itemId === 'mixer1')).toMatchObject({ dist: 0, weak: true });
  expect(r.pairs.find(p => p.itemId === 'mixer1').score).toBeGreaterThan(1.5);
  expect(r.noRow).toEqual([77]);
  expect(r.lost).toEqual([{ no: 18, p: [90000, 0] }]);
  expect(r.counts).toEqual([{ no: 3, name: '전기 교반기', qty: 1, got: 0 }]);
  // 대조: 하나씩 평범한 바닥 기구로 풀면 그것이 18번 글자를 가져간다 — 위에서 빠진 것은 제외 규칙 덕이다
  for (const b of blocked) {
    const freed = items.map(i => (i.id === b.id ? { ...i, kind: 'product', attach: 'floor' } : i));
    expect(matchLabels(labels, freed, rows, shapeOf).pairs.find(p => p.no === 18).itemId, b.id).toBe(b.id);
  }
});

test('matchLabels: 거리·형상·크기가 같은 두 후보는 이름 낱말이 가른다 · 점수는 0 아래로 내려가지 않는다', () => {
  const shapeOf = id => (id.startsWith('k-w') ? 'worktable' : undefined);
  const rows = [{ no: 51, dwg: 51, name: '고정식 작업대', size: [1200, 750, 850], qty: 1, loc: '전처리실', id: 'k-w3' }];
  const run = (nameL, nameR) => matchLabels([{ no: 51, p: [0, 0] }], [
    item('left', 'k-w1', [-1000, 0], [1200, 750, 850], { name: nameL }),
    item('right', 'k-w2', [1000, 0], [1200, 750, 850], { name: nameR }),
  ], rows, shapeOf).pairs;
  // 둘 다 가장자리까지 400 mm · 같은 형상·크기 — 이름이 없으면 앞의 것(left)
  expect(run('건조대이동식 1200-750', '선반 1200-750').map(p => p.itemId)).toEqual(['left']);
  // 붙여 쓴 '고정식작업대'는 부분 낱말(3/6) → 보너스 0.3 · 0.4 − 0.3 = 0.1이어도 이긴다
  expect(run('건조대이동식 1200-750', '고정식작업대1200-750')).toEqual([expect.objectContaining({ itemId: 'right', dist: 400, score: 0.1, weak: false })]);
  expect(run('고정식작업대1200-750', '건조대이동식 1200-750').map(p => p.itemId)).toEqual(['left']);
  // 띄어 쓴 '고정식 작업대'는 온전한 낱말 → 보너스 0.6 · 0.4 − 0.6 → 0으로 자른다
  expect(run('건조대이동식 1200-750', '고정식 작업대 1200-750')).toEqual([expect.objectContaining({ itemId: 'right', score: 0, weak: false })]);
});

test('matchLabels: 부분 낱말(15 담금 세정대 → 수류담금세척기)이 온전한 낱말(14 수류담금세척기)의 기구를 뺏지 않는다 — 신상중 14/15 축소판', () => {
  // 수류담금세척기 아이템의 지금 제품은 세정대 형상(remap-samples가 고른 엑셀 제품) → 14번 행과 형상이 달라 1.5를 받는다.
  // 이진 보너스(0.6)였다면 15↔수류 = 0.735 + 0.405 − 0.6 ≈ 0.54가 가장 낮아 15가 수류를 가져가고 14는 도면 기구로 밀렸다.
  // 맞음 정도로 나누면 15↔수류 ≈ 0.735 + 0.405 − 0.171 ≈ 0.97 > 15↔도면 기구 ≈ 0.91 → 15는 도면 기구 · 14는 수류(0.474 + 1.5 − 0.6 = 1.374).
  const shapes = { 'k-oldsink': 'sink', 'k-sink15': 'sink', 'k-dish14': 'dishwasher' };
  const rows = [
    { no: 14, dwg: 14, name: '수류담금세척기', size: [1500, 870, 850], qty: 1, loc: '세척실1', id: 'k-dish14' },
    { no: 15, dwg: 15, name: '담금 세정대', size: [1000, 870, 850], qty: 1, loc: '세척실1', id: 'k-sink15' },
  ];
  const items = [
    item('tr', 'k-oldsink', [0, 0], [870, 1500, 850], { name: '수류담금세척기 TR1500S' }),
    item('gen', 'equip-generic', [2000, 0], [897, 1000, 850], { name: '도면 기구' }),
  ];
  const r = matchLabels([{ no: 14, p: [909, 0] }, { no: 15, p: [1170, 0] }], items, rows, id => shapes[id]);
  expect(r.pairs.map(p => [p.no, p.itemId])).toEqual([[14, 'tr'], [15, 'gen']]);
  expect(r.pairs[0]).toMatchObject({ dist: 474, score: 1.374, weak: false });
});

test('matchLabels: 기구 하나는 한 번만 — 같은 번호 글자 둘이 한 기구를 다투면 가까운 글자가 갖고 나머지는 못 찾은 번호', () => {
  const rows = [{ no: 18, dwg: 18, name: '1조 세정대', size: [900, 750, 850], qty: 2, loc: '세척실1', id: 'k-sink2' }];
  const r = matchLabels([{ no: 18, p: [700, 0] }, { no: 18, p: [0, 0] }], [item('only', 'k-sink', [0, 0], [900, 750, 850])], rows, id => (id.startsWith('k-sink') ? 'sink' : undefined));
  expect(r.pairs.map(p => [p.itemId, p.dist])).toEqual([['only', 0]]);
  expect(r.lost).toEqual([{ no: 18, p: [700, 0] }]);
  expect(r.counts).toEqual([{ no: 18, name: '1조 세정대', qty: 2, got: 1 }]);
});

test('applyMap: 제품 id·코드·종류(+설비 씨앗)를 바꾸고 자리·이름·dxfBlock은 그대로 · 높이는 제품 값 · dxfProduct를 떼어 견적 대상이 된다 · 멱등', () => {
  const spec = { floors: [{ items: [
    { id: 'i1', kind: 'product', productId: 'equip-generic', name: '취반기(전기) 150인용', code: 'DRW', pos: [10, 20], size: [600, 570, 1460], rot: 90, attach: 'floor', color: '#cfd4da', dxfBlock: 'B1', dxfProduct: 'equip-generic' },
  ] }] };
  const map = { pairs: [{ itemId: 'i1', pos: [10, 20], name: '취반기(전기) 150인용', from: 'equip-generic', no: 1, productId: 'k-202606158754353' }] };
  const r = applyMap(spec, map);
  const it = r.spec.floors[0].items[0];
  expect(r.changed).toBe(1);
  // 제품 572 × 800 × 1500: 너비·깊이를 바꿔도 축별 Σ|ln| 차가 0.096 < SWAP_MARGIN이라 그대로 · 벽이 없어 rot 그대로 · 높이만 1460 → 1500
  expect(it).toMatchObject({ productId: 'k-202606158754353', code: 'K-202606158754353', kind: 'equipment', name: '취반기(전기) 150인용', pos: [10, 20], size: [600, 570, 1500], rot: 90, dxfBlock: 'B1' });
  expect(it).not.toHaveProperty('dxfProduct');                          // 사람이 고른 제품(itemOps.replaceProduct와 같은 규칙)
  expect(it.props).toMatchObject({ type: 'appliance', kind: 'ricecooker', heat: 'electric' });
  expect(isDrawnItem(it)).toBe(false);
  expect(spec.floors[0].items[0].productId).toBe('equip-generic');      // 입력은 그대로(복사본을 고친다)
  expect(applyMap(r.spec, map).changed).toBe(0);
  expect(() => applyMap(spec, { pairs: [{ itemId: 'zz', pos: [0, 0], name: 'x', productId: 'k-1' }] })).toThrow(/템플릿에 없는 아이템/);
});

test('applyMap: 이미 그 제품인 도면 기구(dxfProduct === productId)도 dxfProduct를 떼어 견적 대상이 된다 · 다시 돌리면 0', () => {
  // remap-samples가 엑셀 제품으로 바꾼 기구가 마침 구입 제품과 같으면(세정대·옷장 등 16개) 제품은 그대로 · 0원 표지만 뗀다
  const spec = { floors: [{ items: [
    { id: 'i2', kind: 'product', productId: 'k-202606158754353', name: '취반기 도면', code: 'K-202606158754353', pos: [0, 0], size: [572, 800, 1500], rot: 0, attach: 'floor', color: '#123456', dxfBlock: 'B2', dxfProduct: 'k-202606158754353' },
  ] }] };
  expect(isDrawnItem(spec.floors[0].items[0])).toBe(true);
  const map = { pairs: [{ itemId: 'i2', pos: [0, 0], name: '취반기 도면', from: 'k-202606158754353', no: 1, productId: 'k-202606158754353' }] };
  const r = applyMap(spec, map);
  const it = r.spec.floors[0].items[0];
  expect(r.changed).toBe(1);
  expect(it).not.toHaveProperty('dxfProduct');
  expect(it).toMatchObject({ productId: 'k-202606158754353', name: '취반기 도면', color: '#123456', dxfBlock: 'B2', pos: [0, 0], size: [572, 800, 1500] });
  expect(isDrawnItem(it)).toBe(false);
  expect(spec.floors[0].items[0].dxfProduct).toBe('k-202606158754353'); // 입력은 그대로
  expect(applyMap(r.spec, map).changed).toBe(0);
});

test('applyMap: id가 없으면 자리·이름으로 찾는다 · 기존 제품 색 그대로면 새 색(손으로 바꾼 색은 그대로) · 짝 표 검사(같은 아이템 두 번 · pos·name 없음 · 없는 제품)', () => {
  const cat = { 'p-old': { id: 'p-old', code: 'OLD', kind: 'product', color: '#111111' }, 'p-new': { id: 'p-new', code: 'NEW', kind: 'product', color: '#222222' } };
  const byId = id => cat[id];
  const spec = { floors: [{ items: [
    { id: 'a', kind: 'product', productId: 'p-old', name: '가', code: 'OLD', pos: [0, 0], size: [900, 600, 850], rot: 0, color: '#111111' },
    { id: 'b', kind: 'product', productId: 'p-old', name: '나', code: 'OLD', pos: [2000, 0], size: [900, 600, 850], rot: 0, color: '#abcdef' },
  ] }] };
  const pr = (itemId, pos, name, productId = 'p-new') => ({ itemId, pos, name, productId });
  // 다시 뽑은 템플릿(아이템 id가 바뀜)이면 'old-a'가 없다 → 자리 [0, 0] · 이름 '가'로 a를 찾는다
  const r = applyMap(spec, { pairs: [pr('old-a', [0, 0], '가'), pr('b', [2000, 0], '나')] }, byId);
  expect(r.changed).toBe(2);
  expect(r.spec.floors[0].items.map(i => [i.id, i.productId, i.code, i.color])).toEqual([['a', 'p-new', 'NEW', '#222222'], ['b', 'p-new', 'NEW', '#abcdef']]);
  expect(() => applyMap(spec, { pairs: [pr('a', [0, 0], '가', 'p-nope')] }, byId)).toThrow(/카탈로그에 없는 제품 — p-nope/);
  expect(() => applyMap(spec, { pairs: [pr('a', [0, 0], '가'), pr('a', [0, 0], '가')] }, byId)).toThrow(/짝 표에 같은 아이템이 두 번 — a/);
  expect(() => applyMap(spec, { pairs: [pr('old-a', [0, 0], '가'), pr('a', [0, 0], '가')] }, byId)).toThrow(/두 짝이 같은 아이템 — a/);   // id는 달라도 찾은 아이템이 같다
  expect(() => applyMap(spec, { pairs: [{ itemId: 'a', name: '가', productId: 'p-new' }] }, byId)).toThrow(/pos·name이 없는 짝 — a/);
  expect(() => applyMap(spec, { pairs: [{ itemId: 'a', pos: [0, 0], productId: 'p-new' }] }, byId)).toThrow(/pos·name이 없는 짝 — a/);
  expect(spec.floors[0].items.map(i => i.productId)).toEqual(['p-old', 'p-old']);   // 입력은 그대로
});

// ── 크기·회전 맞추기(fitItem · 2026-11-09 사용자 결정) ──
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
const sameFootprint = (a, b) => itemCorners(a).every(p => itemCorners(b).some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6));

test('앱 정면 규약: 정면 = 로컬 +y — 평면(y = 남쪽)에서 rot 0이면 +y · 90이면 −x · flipV면 반대 · 3D(items3d 모델 정면 +Z)와 벽 부착(placeOnWall 뒷면 = 벽)이 같다', () => {
  expect(near(frontDir(0), [0, 1])).toBe(true);
  expect(near(frontDir(90), [-1, 0])).toBe(true);
  expect(near(frontDir(180), [0, -1])).toBe(true);
  expect(near(frontDir(0, true), [0, -1])).toBe(true);
  for (const rot of [0, 90, 180, 270, 30]) {
    const m = itemMesh({ id: 'x', kind: 'product', productId: 'nope', pos: [0, 0], z: 0, size: [600, 400, 800], rot, attach: 'floor', color: '#cccccc' }, { assets: false, product: null });
    m.updateMatrixWorld(true);
    const v = new THREE.Vector3(0, 0, 1).transformDirection(m.matrixWorld);   // 모델·형상 정면 +Z(itemAssets 규약) → three (x, z) = 평면 (x, y)
    expect(near([v.x, v.z], frontDir(rot)), `rot ${rot}`).toBe(true);
  }
  const wall = { id: 'w', a: [0, 0], b: [4000, 0], thickness: 200 };
  for (const side of [1, -1]) {
    const r = placeOnWall(wall, 0.5, side, [600, 400, 800]), f = frontDir(r.rot);
    expect(Math.sign(f[1]), `side ${side}`).toBe(Math.sign(r.pos[1]));       // 벽(y 0)에서 아이템 쪽 = 정면
  }
});

const SINK = { id: 'p-sink', code: 'S', kind: 'product', color: '#cccccc', size: [1500, 750, 900] };
const fitCat = { 'p-sink': SINK, 'p-cart': { id: 'p-cart', code: 'C', kind: 'product', color: '#cccccc', size: [800, 500, 800] },
  'p-reel': { id: 'p-reel', code: 'R', kind: 'product', color: '#cccccc', size: [460, 220, 480], attach: 'wall' },
  'p-model': { id: 'p-model', code: 'M', kind: 'product', color: '#cccccc', size: [1500, 750, 900], asset: 'p-model' } };
const fitById = id => fitCat[id];
const vWall = x => ({ id: `wx${x}`, a: [x, -5000], b: [x, 5000], thickness: 200 });
const hWall = y => ({ id: `wy${y}`, a: [-5000, y], b: [5000, y], thickness: 200 });
const one = (walls, patch = {}, productId = 'p-sink') => ({ floors: [{ walls, items: [
  { id: 's', kind: 'product', productId, name: '세정대 2조 1500-750', code: 'S', pos: [0, 0], z: 0, size: [750, 1500, 850], rot: 0, attach: 'floor', color: '#cccccc', dxfBlock: 'B', ...patch },
] }] });
const pairOf = (productId = 'p-sink') => ({ pairs: [{ itemId: 's', pos: [0, 0], name: '세정대 2조 1500-750', productId }] });

test('fitItem: 돌려 그린 블록(rot 0 · 너비·깊이 바뀜)은 너비·깊이를 되돌리고 ±90° — 정면이 한쪽 벽을 등지는 부호 · 평면 발자국·자리·이름·dxfBlock 그대로 · 높이는 제품 값', () => {
  for (const [x, rot] of [[-600, 270], [600, 90]]) {          // 벽 면이 아이템 긴 변에서 125 mm
    const spec = one([vWall(x)]), r = applyMap(spec, pairOf(), fitById), it = r.spec.floors[0].items[0];
    expect(r).toMatchObject({ changed: 1, fitted: 1, extra: 0 });
    expect(it).toMatchObject({ size: [1500, 750, 900], rot, pos: [0, 0], name: '세정대 2조 1500-750', dxfBlock: 'B' });
    expect(Math.sign(frontDir(it.rot)[0]), `벽 x ${x}`).toBe(-Math.sign(x));   // 정면이 벽 반대쪽
    expect(sameFootprint(it, spec.floors[0].items[0])).toBe(true);
    expect(applyMap(r.spec, pairOf(), fitById).changed).toBe(0);                 // 멱등: 되바꾸면 나쁘고 정면은 이미 벽을 등진다
  }
});

test('fitItem: 벽이 FACE_MM 안에 없으면(섬 기구) 회전 값이 0에 가까운 쪽(같으면 rot + 90) · 다시 돌려도 그대로', () => {
  const far = [vWall(-10000), vWall(10000)];
  const a = applyMap(one(far), pairOf(), fitById);
  expect(a.spec.floors[0].items[0]).toMatchObject({ size: [1500, 750, 900], rot: 90 });            // 90 · 270(−90) 같음 → rot + 90
  const b = applyMap(one(far, { size: [500, 800, 900], rot: 85 }, 'p-cart'), pairOf('p-cart'), fitById), it = b.spec.floors[0].items[0];
  expect(it.size).toEqual([800, 500, 800]);
  expect(it.rot).toBeCloseTo(355, 9);                                                              // 175 · 355(−5) → 355
  expect(sameFootprint(it, { pos: [0, 0], size: [500, 800], rot: 85 })).toBe(true);
  expect(applyMap(b.spec, pairOf('p-cart'), fitById).changed).toBe(0);
  expect(wallRay(far, [0, 0], [1, 0]) - 750 / 2).toBeGreaterThan(FACE_MM);
});

test('fitItem: 이미 제품과 같은 방향이면 바꾸지 않는다 — 정면이 벽을 등지면 높이만 · 정면이 벽을 보면 180° 돌린다(발자국 그대로) · 멱등', () => {
  const back = applyMap(one([hWall(-600)], { size: [1500, 750, 850] }), pairOf(), fitById), b = back.spec.floors[0].items[0];
  expect(b).toMatchObject({ size: [1500, 750, 900], rot: 0 });                                     // 뒤(−y)가 벽 — 그대로
  const front = applyMap(one([hWall(600)], { size: [1500, 750, 850] }), pairOf(), fitById), f = front.spec.floors[0].items[0];
  expect(f).toMatchObject({ size: [1500, 750, 900], rot: 180 });                                   // 정면(+y)이 벽 → 180°
  expect(applyMap(front.spec, pairOf(), fitById).changed).toBe(0);
  const same = one([hWall(-600)], { size: [1500, 750, 900] });
  expect(applyMap(same, pairOf(), fitById).changed).toBe(0);                                       // 제품 · 크기 · 방향 모두 같음 → 0
});

test('fitItem: 벽 부착 기구는 돌리지 않고 깊이·높이를 제품 값으로 해 placeOnWall로 다시 앉힌다(뒷면 = 벽 · 너비 그대로) · 문·기둥·천장·크기 모르는 제품은 건드리지 않는다', () => {
  const wall = { id: 'w1', a: [0, 0], b: [4000, 0], thickness: 200 }, at = placeOnWall(wall, 0.5, 1, [423, 540, 550]);
  const spec = one([wall], { attach: 'wall', wallId: 'w1', t: 0.5, side: 1, size: [423, 540, 550], pos: at.pos, rot: at.rot, z: 1000 }, 'p-reel');
  const r = applyMap(spec, pairOf('p-reel'), fitById), it = r.spec.floors[0].items[0], want = placeOnWall(wall, 0.5, 1, [423, 220, 480]);
  expect(it).toMatchObject({ size: [423, 220, 480], rot: at.rot, pos: want.pos.map(Math.round), z: 1000, wallId: 'w1', t: 0.5 });
  expect(Math.abs(it.pos[1])).toBe(100 + 110);                                                     // 벽 두께 반 + 제품 깊이 반
  expect(applyMap(r.spec, pairOf('p-reel'), fitById).changed).toBe(0);
  for (const patch of [{ kind: 'door' }, { kind: 'column' }, { attach: 'ceiling' }]) {
    const x = { ...one([]).floors[0].items[0], ...patch };
    expect(fitItem(x, SINK, []), JSON.stringify(patch)).toBe(false);
    expect(x.size).toEqual([750, 1500, 850]);
  }
  expect(fitItem({ ...one([]).floors[0].items[0] }, { size: [1500, 750] }, [])).toBe(false);       // 높이 모름
});

test('applyMap: 짝 표 밖이라도 모델(asset)이 서는 기구는 같은 규칙으로 맞춘다(extra) · 모델 없는 짝 밖 기구는 그대로', () => {
  const spec = { floors: [{ walls: [], items: [
    { id: 'm', kind: 'product', productId: 'p-model', name: 'm', code: 'M', pos: [0, 0], z: 0, size: [750, 1500, 850], rot: 0, attach: 'floor', color: '#cccccc' },
    { id: 'n', kind: 'product', productId: 'p-sink', name: 'n', code: 'S', pos: [5000, 0], z: 0, size: [750, 1500, 850], rot: 0, attach: 'floor', color: '#cccccc' },
  ] }] };
  const r = applyMap(spec, { pairs: [] }, fitById);
  expect(r).toMatchObject({ changed: 1, fitted: 1, extra: 1 });
  expect(r.spec.floors[0].items.map(i => [i.id, i.size, i.rot])).toEqual([['m', [1500, 750, 900], 90], ['n', [750, 1500, 850], 0]]);
});

const json = rel => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));

test('커밋된 짝 표는 템플릿에 이미 적용돼 있다(멱등) · 짝의 제품은 모두 구입목록 제품 · 모든 기구의 제품이 풀린다 · 짝지은 기구는 견적 대상 · 모델이 축별로 2배 넘게 늘어나지 않는다', () => {
  const spec = json('src/samples/sinsang.json'), map = json('tools/products/sinsang-map.json');
  expect(applyMap(spec, map)).toMatchObject({ changed: 0, extra: 0 });     // 짝 표 밖 모델 기구 없음(2026-11-09)
  // 모델 기구마다 축별 배율(아이템 크기 ÷ 제품 크기 — itemAssets.fitClone이 축별로 늘린다) 최대 ÷ 최소 < 2(고치기 전 44대 중 20대가 2 이상)
  const models = spec.floors[0].items.filter(it => productById(it.productId)?.asset);
  expect(models.length).toBeGreaterThan(40);
  for (const it of models) {
    const s = productById(it.productId).size, k = it.size.map((v, i) => v / s[i]);
    expect(Math.max(...k) / Math.min(...k), `${it.id} ${it.productId} ${it.size} / ${s}`).toBeLessThan(2);
  }
  const ids = new Set(purchase.products.map(p => p.id));
  for (const p of map.pairs) expect(ids.has(p.productId), `${p.no} ${p.productId}`).toBe(true);
  const items = spec.floors[0].items;
  for (const it of items) expect(productById(it.productId), `${it.id} ${it.productId}`).toBeTruthy();
  for (const p of map.pairs) {
    const it = items.find(i => i.id === p.itemId);
    expect(it?.productId, p.itemId).toBe(p.productId);
    expect(isDrawnItem(it), p.itemId).toBe(false);
  }
});
