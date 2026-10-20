// 계획 17 Task 2: 엑셀 급식기구 규칙(kitchenRules.js)·이름 규칙(shapeNames.js)·생성 데이터(kitchenData.js).
import { describe, test, expect } from 'vitest';
import { parseSpec, numOf, isPipe, skipReason, shapeOf, expandRow, normSub, SUB_CHIP, SUB_SHAPE, SHAPE_SYMBOL, KITCHEN_CHIPS, APPLIANCE_KIND, WALL_Z } from '../src/products/kitchenRules.js';
import { SHAPE_FAMILIES, shapeByName, shapeOpts, isThin, genericSpec } from '../src/products/shapeNames.js';
import data from '../src/products/kitchenData.js';
import { SYMBOL_NAMES } from '../src/products/catalog.js';
import { APPLIANCE_KINDS } from '../src/vent/equipment.js';

describe('규격 파싱(parseSpec)', () => {
  test.each([
    ['1200×750×1950mm', [1200, 750, 1950], false],
    ['100인용(570×600×1095mm)', [570, 600, 1095], false],
    ['900*500*1900mm 잔넬형, STS 304/40각파이프', [900, 500, 1900], false],
    ['1800×750×628~1278mm', [1800, 750, 1278], false],
    ['DUAL-900 (890×222×215mm)', [890, 222, 215], false],
    ['199kg/d (1500×780×1310mm)', [1500, 780, 1310], false],
    ['20Kg(Φ470×960mm)', [470, 470, 960], true],
    ['Φ630×730mm', [630, 630, 730], true],
    ['1725×900×870', [1725, 900, 870], false],
    ['750×750×970mm, 화구높이 600', [750, 750, 970], false],
    ['약10kg/회 600×600×800mm', [600, 600, 800], false],
    ['1,200×750×850', [1200, 750, 850], false],
  ])('%s', (s, size, round) => { expect(parseSpec(s)).toEqual({ size, round }); });
  test.each(['스텐15m/냉온수용', '', 'SmartHaccp ver1.1 /S/W+태블릿PC+메뉴보드55"', '5×5×5'])('못 읽음: %s', s => { expect(parseSpec(s)).toBeNull(); });
});

test('숫자 칸(numOf)', () => {
  expect(numOf('LNG:48\nLPG:57')).toBe(48);
  expect(numOf('')).toBe(0);
  expect(numOf(6.2)).toBe(6.2);
  expect(numOf('42')).toBe(42);
});

describe('급배수 칸은 배관 규격일 때만 배관(isPipe)', () => {
  test.each(['15A', '20 A', '32A', '50A', '75a', ' 15A '])('배관: %s', v => { expect(isPipe(v)).toBe(true); });
  test.each(['', null, undefined, '김흥수이사', '고급형', '(디판)', '일반', '한세트', 'A', '15'])('배관 아님: %s', v => { expect(isPipe(v)).toBe(false); });
});

test('제외 사유(skipReason)', () => {
  const ok = { kind: '기구', sub: '상업용싱크대', name: '2조 세정대', spec: '1500×750×850mm' };
  expect(skipReason(ok)).toBeNull();
  expect(skipReason({ ...ok, kind: '가구' })).toBeNull();
  expect(skipReason({ ...ok, kind: '부품' })).toBe('종류');
  expect(skipReason({ ...ok, kind: '' })).toBe('종류');
  expect(skipReason({ ...ok, sub: 'DB관리시스템 소프트웨어' })).toBe('S/W');
  expect(skipReason({ ...ok, name: '(부품)슬라이딩도어' })).toBe('부품·옵션');
  expect(skipReason({ ...ok, name: '고정식 작업대 하부선반옵션추가(900)' })).toBe('부품·옵션');
  expect(skipReason({ ...ok, name: '액세서리(트롤리)' })).toBe('부품·옵션');
  expect(skipReason({ ...ok, name: '자동워터릴', spec: '스텐15m/냉온수용' })).toBe('규격');
});

describe('형상 고르기', () => {
  test.each([
    ['상업용싱크대', '2조 세정대', [1500, 750, 850], 'sink'],
    ['배식대', '양념운반카', [530, 800, 1080], 'cart'],
    ['손소독기', '3인용손세정,소독,건조기', [1800, 550, 1450], 'sink'],
    ['공기살균기', '공기살균기(벽걸이형)', [360, 220, 84], 'wallunit'],
    ['책상', '책상(영양관리실) 가림판', [1600, 15, 605], 'panel'],
    ['주방기구소독기', '식기 소독기', [1200, 750, 1950], 'cabinet'],
    ['자동야채세척기', '초음파야채세척기(50kg/회)', [1000, 700, 850], 'machine'],
    ['상업용식기세척기', '식기세척기 전기(도어형)', [650, 700, 1350], 'dishwasher'],
    ['', '식품탈수기', [600, 600, 800], 'machine'],
    ['상업용주방후드', '이중급배기후드(국솥)', [1800, 1500, 600], 'hood'],
    ['주방기구소독기', '수저카트리지(소독기)', [650, 300, 825], 'cabinet'],
    ['다단식운반차', '다단식 운반차', [800, 500, 800], 'rack'],
  ])('%s · %s → %s', (sub, name, size, shape) => { expect(shapeOf(sub, name, size)).toBe(shape); });

  test('이름 규칙: 손소독기는 벽부착, 야채세척기는 기계, 운반카는 운반차', () => {
    expect(shapeByName('손소독기')).toBe('wallunit');
    expect(shapeByName('초음파야채세척기')).toBe('machine');
    expect(shapeByName('양념운반카')).toBe('cart');
    expect(shapeByName('무엇인지 모를 기구')).toBeNull();
    expect(shapeByName('수저카트리지(소독기)')).not.toBe('cart');
    expect(isThin([1200, 45, 1160])).toBe(true);
    expect(isThin([600, 530, 30])).toBe(true);
    expect(isThin([600, 600, 600])).toBe(false);
  });

  test.each([
    ['range', '높은 인덕션렌지 3구', [1500, 750, 970], {}, { burners: 3, gas: false }],
    ['range', '낮은 가스렌지 2구', [1500, 750, 600], {}, { burners: 2 }],
    ['sink', '3조 세정대(STS 배수구)', [2100, 750, 850], {}, { bowls: 3 }],
    ['sink', '담금세정대', [1500, 900, 850], {}, { bowls: 1, deep: true }],
    ['cabinet', '보냉고 4도어(앞뒤양문형) 유리도어', [1260, 850, 1910], {}, { doors: 4, glass: true, panel: true }],
    ['cabinet', '캐비닛', [800, 400, 1885], {}, { doors: 2 }],
    ['ricecooker', '가스 3단 취반기', [708, 706, 1330], {}, { tiers: 3 }],
    ['counter', '반찬 배식대(5찬)', [1980, 750, 810], {}, { wells: 5 }],
    ['kettle', '가스 회전식 국솥', [1480, 920, 840], {}, { tilt: true }],
    ['kettle', '전기 사각 만능솥', [1725, 900, 870], {}, { square: true }],
    ['dishwasher', '식기세척기 전기(컨베이어) 1탱크', [2700, 730, 1680], {}, { conveyor: true }],
    ['table', '식탁(6인용)', [1800, 750, 730], {}, { stools: true }],
    ['worktable', '이동식 작업대', [900, 750, 850], {}, {}],
    ['worktable', '고정식작업대(하부찬장형)', [1200, 750, 800], {}, { splash: true, cabinet: true }],
    ['cart', '소쿠리 운반차(돌리)', [630, 630, 730], { round: true }, { round: true }],
    ['rack', '다단식 운반차', [800, 500, 800], {}, { tiers: 2, casters: true }],
  ])('옵션 %s · %s', (shape, name, size, flags, opts) => { expect(shapeOpts(shape, name, size, flags)).toEqual(opts); });

  test('도면 기구(equip-generic)의 형상은 이름 규칙 → 얇으면 판 → 기계', () => {
    expect(genericSpec({ name: '세정대 2조 1500-750', size: [1500, 750, 850] })).toEqual({ shape: 'sink', opts: { bowls: 2 } });
    expect(genericSpec({ name: '에어커튼 890-222', size: [890, 222, 250] }).shape).toBe('wallunit');
    expect(genericSpec({ name: '도면 기구', size: [900, 600, 850] }).shape).toBe('machine');
    expect(genericSpec({ name: '세정대', size: [1200, 40, 900] }).shape).toBe('panel');
  });
});

describe('원자료 행 → 제품(expandRow)', () => {
  test('전기 취반기: 조리 칩 · 설비(전기) · 전기 kW', () => {
    const p = expandRow(['25279008', '전기 인덕션 취반기', 0, 570, 600, 1095, 0, 5500000, 0, 'SKK-CB2100', 'G2B', [0, 0, 0, 7, 0]], { vendors: ['선경인케이'], subs: ['취반기'] });
    expect(p).toMatchObject({ id: 'k-25279008', name: '전기 인덕션 취반기', code: 'SKK-CB2100', category: '조리', sub: '취반기', size: [570, 600, 1095], attach: 'floor',
      symbol: 'appliance', zDefault: 0, color: '#cfd4da', kind: 'equipment', price: 5500000, shape: 'ricecooker', shapeOpts: { tiers: 2 },
      equip: { type: 'appliance', kind: 'ricecooker', heat: 'electric' } });
    expect(p.extra).toEqual({ kid: '25279008', vendor: '선경인케이', model: 'SKK-CB2100', contract: 'G2B', util: { water: [false, false, false], elec: [0, 0, 7], gas: 0 } });
    expect(p.tags).toContain('선경인케이');
  });
  test('후드는 천장 · 설비(hood) · 모델명이 없으면 K-식별번호', () => {
    const p = expandRow(['22158417', '배기후드(렌지)', 0, 3200, 900, 600, 0, 1268000, 0, '', 'G2B'], { vendors: ['A'], subs: ['상업용주방후드'] });
    expect(p).toMatchObject({ attach: 'ceiling', kind: 'equipment', equip: { type: 'hood' }, code: 'K-22158417', category: '후드·환기', symbol: 'hood' });
  });
  test('가스 소비량이 있으면 가스 · 회전식 국솥', () => {
    const p = expandRow(['1', '가스 회전식 국솥', 0, 1480, 920, 840, 0, 4300000, 0, 'M', 'G2B', [0, 0, 0, 0, 30]], { vendors: ['A'], subs: ['국솥'] });
    expect(p.equip).toEqual({ type: 'appliance', kind: 'soupkettle', heat: 'gas' });
    expect(p.shapeOpts).toEqual({ tilt: true });
    expect(p.extra.util.gas).toBe(30);
  });
  test('에어커튼은 벽 2200 · 급배수 비트', () => {
    const p = expandRow(['2', '에어커튼', 0, 890, 222, 215, 0, 431000, 0, 'DUAL-900', 'G2B', [5, 0.3, 0, 0, 0]], { vendors: ['A'], subs: ['에어커튼'] });
    expect(p).toMatchObject({ attach: 'wall', zDefault: 2200, shape: 'wallunit', kind: 'product' });
    expect(p.extra.util.water).toEqual([true, false, true]);
  });
});

describe('표의 일관성', () => {
  test('형상·심벌·칩·조리기구 종류가 앱의 이름 안에 있다', () => {
    expect(Object.keys(SHAPE_SYMBOL).sort()).toEqual([...SHAPE_FAMILIES].sort());
    for (const s of Object.values(SHAPE_SYMBOL)) expect(SYMBOL_NAMES).toContain(s);
    for (const s of Object.values(SUB_SHAPE)) expect(SHAPE_FAMILIES).toContain(s);
    for (const c of Object.values(SUB_CHIP)) expect(KITCHEN_CHIPS).toContain(c);
    const kinds = APPLIANCE_KINDS.map(([k]) => k);
    for (const k of Object.values(APPLIANCE_KIND)) expect(kinds).toContain(k);
    for (const [re, z] of WALL_Z) { expect(re).toBeInstanceOf(RegExp); expect(z).toBeGreaterThan(0); }
  });
  test('세부품명 비교는 공백을 지운다', () => { expect(normSub(' 상업용 오븐 ')).toBe('상업용오븐'); });
});

describe('생성 데이터(kitchenData.js)', () => {
  const products = data.rows.map(r => expandRow(r, data));
  test('머리 정보와 크기', () => {
    expect(data.version).toBe(1);
    expect(data.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(data.rows.length).toBeGreaterThanOrEqual(400);
  });
  test('세부품명이 모두 표에 있고 모든 행이 펼쳐진다', () => {
    for (const s of data.subs) expect(s in SUB_CHIP).toBe(true);
    expect(new Set(products.map(p => p.id)).size).toBe(products.length);
    for (const p of products) {
      expect(SHAPE_FAMILIES).toContain(p.shape);
      expect(p.size.every(v => v >= 10 && v <= 20000)).toBe(true);
      expect(p.price).toBeGreaterThanOrEqual(0);
    }
  });
  test('후드 28 · 조리기구 설비 100 · 벽부착 6(실측 2026-10-20 엑셀)', () => {
    expect(products.filter(p => p.equip?.type === 'hood').length).toBe(28);
    expect(products.filter(p => p.equip?.type === 'appliance').length).toBe(100);
    expect(products.filter(p => p.attach === 'wall').length).toBe(6);
  });
  test('식탁·의자·판에는 급수가 없다(냉수 칸의 메모는 배관이 아니다 · 발판소독기만 배수 50A)', () => {
    const memo = ['24397194', '24397200', '24987398', '24987393', '25040984', '25040985', '23089100'];
    for (const p of products.filter(q => memo.includes(q.extra.kid))) expect(p.extra.util.water).toEqual([false, false, false]);
    for (const p of products.filter(q => ['table', 'chair', 'panel'].includes(q.shape))) {
      const [cold, hot, drain] = p.extra.util.water;
      expect([p.name, cold || hot || (drain && !/발판소독기/.test(p.name))]).toEqual([p.name, false]);
    }
  });
});
