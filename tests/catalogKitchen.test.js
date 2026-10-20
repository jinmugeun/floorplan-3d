// 엑셀 급식기구 카탈로그(계획 17 Task 3): 원자료 → 제품 펼치기 · 칩 · 기존 id → 엑셀 제품 대응.
import { describe, test, expect } from 'vitest';
import data from '../src/products/kitchenData.js';
import { KITCHEN_PRODUCTS, KITCHEN_PRICES, KITCHEN_CATEGORIES, LEGACY_SUBS, LEGACY_TO_KITCHEN, kitchenFor, kitchenFit, __optionTokens } from '../src/products/catalogKitchen.js';
import { KITCHEN_CHIPS } from '../src/products/kitchenRules.js';
import { SHAPE_FAMILIES } from '../src/products/shapeNames.js';
import { productById, SYMBOL_NAMES } from '../src/products/catalog.js';
import { EQUIP_TYPES, APPLIANCE_KINDS } from '../src/vent/equipment.js';

describe('엑셀 제품 펼치기', () => {
  test('원자료 한 행이 제품 하나다 — id는 k-<식별번호>, 단가는 엑셀 단가', () => {
    expect(KITCHEN_PRODUCTS).toHaveLength(data.rows.length);
    expect(KITCHEN_PRODUCTS.length).toBeGreaterThanOrEqual(480);
    expect(KITCHEN_PRODUCTS.every(p => /^k-\d+$/.test(p.id))).toBe(true);
    expect(Object.keys(KITCHEN_PRICES)).toHaveLength(KITCHEN_PRODUCTS.length);
    const rice = productById('k-25279008');
    expect(rice).toMatchObject({ name: '전기 인덕션 취반기', code: 'SKK-CB2100', category: '조리', sub: '취반기', size: [570, 600, 1095], shape: 'ricecooker', price: 5500000, kind: 'equipment' });
    expect(rice.equip).toEqual({ type: 'appliance', kind: 'ricecooker', heat: 'electric' });
    expect(rice.extra).toMatchObject({ kid: '25279008', vendor: '선경인케이', model: 'SKK-CB2100' });
  });

  test('모든 엑셀 제품의 형상·심벌·칩·설비 씨앗이 규칙 안에 있다', () => {
    const kinds = APPLIANCE_KINDS.map(([k]) => k);
    for (const p of KITCHEN_PRODUCTS) {
      expect(SHAPE_FAMILIES, p.id).toContain(p.shape);
      expect(SYMBOL_NAMES, p.id).toContain(p.symbol);
      expect(KITCHEN_CHIPS, p.id).toContain(p.category);
      if (p.kind === 'equipment') {
        expect(EQUIP_TYPES, p.id).toContain(p.equip.type);
        if (p.equip.type === 'appliance') expect(kinds, p.id).toContain(p.equip.kind);
      } else expect(p.equip, p.id).toBeUndefined();
      if (p.shape === 'hood') expect(p.attach, p.id).toBe('ceiling');
    }
    expect(KITCHEN_PRODUCTS.filter(p => p.equip?.type === 'hood').length).toBe(KITCHEN_PRODUCTS.filter(p => p.sub === '상업용주방후드').length);
  });

  test('칩은 KITCHEN_CHIPS 순서이고 하위는 원자료에 처음 나온 순서다 — 비어 있는 칩이 없다', () => {
    expect(KITCHEN_CATEGORIES.map(c => c.name)).toEqual(KITCHEN_CHIPS);
    for (const c of KITCHEN_CATEGORIES) {
      expect(c.subs.length, c.name).toBeGreaterThan(0);
      const seen = [...new Set(KITCHEN_PRODUCTS.filter(p => p.category === c.name).map(p => p.sub))];
      expect(c.subs, c.name).toEqual(seen);
    }
  });
});

describe('기존 id → 엑셀 제품 대응', () => {
  test('대응 표의 모든 기존 id가 풀리고, 기존 id는 모두 카탈로그에 있다', () => {
    expect(Object.keys(LEGACY_TO_KITCHEN).sort()).toEqual(Object.keys(LEGACY_SUBS).sort());
    for (const [legacy, k] of Object.entries(LEGACY_TO_KITCHEN)) {
      expect(productById(legacy), legacy).toBeTruthy();
      const p = productById(k);
      expect(p, `${legacy} → ${k}`).toBeTruthy();
      expect(LEGACY_SUBS[legacy][0], legacy).toContain(p.sub);
    }
  });

  test('이름 정규식이 있으면 그 이름 안에서 고른다(2조 세정대 · 2도어 냉장고 · 이중 후드)', () => {
    expect(productById(LEGACY_TO_KITCHEN['sink-double']).name).toMatch(/2조/);
    expect(productById(LEGACY_TO_KITCHEN['sink-single']).name).toMatch(/1조/);
    expect(productById(LEGACY_TO_KITCHEN['fridge-2door']).name).toMatch(/2도어/);
    expect(productById(LEGACY_TO_KITCHEN['hood-box-filter']).name).toMatch(/이중/);
    expect(productById(LEGACY_TO_KITCHEN['hood-box']).name).toMatch(/^배기후드/);
    expect(productById(LEGACY_TO_KITCHEN['dining-6']).name).toMatch(/6인/);
  });

  test('kitchenFor는 크기가 가장 가까운 것을 고르고, 표에 없는 id는 null이다', () => {
    const wide = productById(kitchenFor('fridge-2door', [1260, 800, 1910]));
    expect(wide.name).toMatch(/2도어/);                                   // 이름 정규식이 먼저다(2도어 안에서 최근접)
    const any = productById(kitchenFor('locker-12', [400, 580, 1885]));
    expect(['사물함', '캐비닛']).toContain(any.sub);
    expect(kitchenFor('sofa-3', [2100, 900, 800])).toBeNull();
    expect(kitchenFor('없음', [100, 100, 100])).toBeNull();
  });

  test('kitchenFit: 엑셀 제품이면 같은 세부품명·형상 안에서 아이템 크기 최근접(폭 1260 냉장고는 4도어), 아니면 그대로', () => {
    const two = LEGACY_TO_KITCHEN['fridge-2door'];
    expect(productById(kitchenFit(two, [1260, 800, 1910])).name).toMatch(/4도어/);
    expect(kitchenFit(two, productById(two).size)).toBe(two);
    expect(kitchenFit('equip-generic', [1000, 600, 850])).toBe('equip-generic');
    expect(kitchenFit('sink-double', [1500, 750, 850])).toBe('sink-double');
    expect(kitchenFit(two, null)).toBe(two);
  });

  test('뜻이 맞는 대응 — 전기 콤비스티머는 전기 오븐, 드럼세탁기는 드럼 세탁기, 건조기는 건조기', () => {
    const steamer = productById(LEGACY_TO_KITCHEN['steamer-combi']);
    expect(steamer.equip.heat).toBe('electric');
    expect(steamer.name).toMatch(/전기/);
    expect(productById(LEGACY_TO_KITCHEN['washer-drum']).name).toMatch(/드럼/);
    expect(productById(LEGACY_TO_KITCHEN.dryer).name).toMatch(/건조기/);
  });

  test('kitchenFor: 표에 있는 id는 크기가 잘못돼도(세 개의 유한한 양수가 아니면) 기존 제품 자기 크기로 풀린다 — null은 "표에 없음"뿐', () => {
    const own = LEGACY_TO_KITCHEN['sink-double'];
    expect(kitchenFor('sink-double', [1800, 750])).toBe(own);
    expect(kitchenFor('sink-double', null)).toBe(own);
    expect(kitchenFor('sink-double', undefined)).toBe(own);
    expect(kitchenFor('sink-double', [1800, NaN, 850])).toBe(own);
    expect(kitchenFor('sink-double', [1800, 0, 850])).toBe(own);
    expect(kitchenFor('sink-double', [1800, 750, 850, 1])).toBe(own);
    expect(kitchenFor('sink-double', '1800x750x850')).toBe(own);
    for (const id of Object.keys(LEGACY_SUBS)) expect(kitchenFor(id, [1800, 750]), id).toBe(LEGACY_TO_KITCHEN[id]);
  });

  test('방향과 무관하다 — [w, d, h]와 [d, w, h]가 같은 제품으로 풀린다(kitchenFor · kitchenFit)', () => {
    for (const s of [[1260, 800, 1910], [1500, 750, 850], [1000, 900, 1800], [650, 700, 1350]]) {
      const r = [s[1], s[0], s[2]];
      for (const id of Object.keys(LEGACY_SUBS)) expect(kitchenFor(id, r), `${id} ${s}`).toBe(kitchenFor(id, s));
    }
    const two = LEGACY_TO_KITCHEN['fridge-2door'];
    expect(productById(kitchenFit(two, [800, 1260, 1910])).name).toMatch(/4도어/);
    for (const p of KITCHEN_PRODUCTS) expect(kitchenFit(p.id, [p.size[1], p.size[0], p.size[2]]), p.id).toBe(kitchenFit(p.id, p.size));
  });

  test('같은 거리면 원래 제품(kitchenFit), 그다음 원자료(엑셀 행) 순서의 앞이 이긴다', () => {
    const ids = KITCHEN_PRODUCTS.map(p => p.id);
    // 가스 회전식 국솥 k-24975705(앞)와 k-25449419(뒤)는 세부품명·형상·크기(1580×1040×870)가 같다 — 뒤의 것도 자기 자신으로 남는다.
    expect(productById('k-25449419').size).toEqual(productById('k-24975705').size);
    expect(ids.indexOf('k-24975705')).toBeLessThan(ids.indexOf('k-25449419'));
    expect(kitchenFit('k-25449419', [1580, 1040, 870])).toBe('k-25449419');
    expect(kitchenFit('k-25449419', [1040, 1580, 870])).toBe('k-25449419');
    // 다른 국솥 k-25962976(1590×1040×860)에서 그 크기를 주면 두 동점 중 앞(k-24975705)이 이긴다.
    expect(kitchenFit('k-25962976', [1580, 1040, 870])).toBe('k-24975705');
    expect(kitchenFit('k-25962976', [1040, 1580, 870])).toBe('k-24975705');
    // 식기세척기 전기(도어형) k-24157686(앞)과 k-22161686(뒤)은 크기(650×700×1350)가 같다 — kitchenFor도 앞을 고른다.
    expect(productById('k-22161686').size).toEqual(productById('k-24157686').size);
    expect(ids.indexOf('k-24157686')).toBeLessThan(ids.indexOf('k-22161686'));
    expect(kitchenFor('dishwasher', [650, 700, 1350])).toBe('k-24157686');
  });

  test('kitchenFit: 자기 크기면 자기 자신 — 같은 크기의 앞선 전기 오븐·낮은 인덕션렌지로 바뀌지 않는다', () => {
    for (const id of ['k-24960268', 'k-24960271', 'k-25170358']) {
      expect(productById(id).equip.heat, id).toBe('gas');
      expect(kitchenFit(id, productById(id).size), id).toBe(id);
    }
    const high3 = KITCHEN_PRODUCTS.find(p => p.name === '높은 인덕션렌지 3구');
    expect(high3).toBeTruthy();
    expect(kitchenFit(high3.id, high3.size)).toBe(high3.id);
    for (const p of KITCHEN_PRODUCTS) expect(kitchenFit(p.id, p.size), p.id).toBe(p.id);
  });

  test('kitchenFit: 열원(equip.heat)이 있으면 같은 열원 안에서만 고른다 — 가스는 가스, 전기는 전기', () => {
    const heated = KITCHEN_PRODUCTS.filter(p => p.equip?.heat);
    expect(heated.length).toBeGreaterThan(0);
    for (const p of heated) {
      expect(productById(kitchenFit(p.id, p.size)).equip.heat, p.id).toBe(p.equip.heat);
      expect(productById(kitchenFit(p.id, [p.size[0] * 1.2, p.size[1], p.size[2]])).equip.heat, `${p.id} 폭 1.2배`).toBe(p.equip.heat);
    }
  });

  test('kitchenFit(id, 크기, 도면 이름): 이름의 N조·N구·N도어·N단·N찬을 지킨다 — 크기가 딱 맞는 다른 조 수로 바뀌지 않는다', () => {
    const one = LEGACY_TO_KITCHEN['sink-single'], two = LEGACY_TO_KITCHEN['sink-double'], sink = [1500, 750, 850];
    expect(productById(kitchenFit(two, sink)).name).toMatch(/2조/);                                  // 이름 없이는 크기가 딱 맞는 2조 자신
    expect(productById(kitchenFit(two, sink, '세정대 1조 1500-750')).name).toMatch(/1조/);
    expect(productById(kitchenFit(one, sink, '세정대 1조 1500-750')).name).toMatch(/1조/);
    expect(productById(kitchenFit(one, sink)).name).toMatch(/1조/);                                  // 이름 없이는 1조 1500
    expect(productById(kitchenFit(one, sink, '세정대 2조 1500-750')).name).toMatch(/2조/);
    expect(productById(kitchenFit(two, sink, '세정대 2조 1500-750')).name).toMatch(/2조/);
    expect(productById(kitchenFit(one, sink, '세정대 2 조 1500-750')).name).toMatch(/2조/);           // 띄어 써도 같다
    expect(productById(kitchenFit(one, [750, 1500, 850], '세정대 2조')).name).toMatch(/2조/);         // 돌린 크기도
    const fridge = LEGACY_TO_KITCHEN['fridge-2door'];
    expect(productById(kitchenFit(fridge, [1260, 800, 1910], '냉장고 4도어 1100L 1260-850')).name).toMatch(/4도어/);
    expect(productById(kitchenFit(fridge, [1600, 800, 1910])).name).toMatch(/6도어/);                // 폭 1600은 6도어(1900)에 더 가깝다
    expect(productById(kitchenFit(fridge, [1600, 800, 1910], '냉장고 4도어 1600-800')).name).toMatch(/4도어/);
    const ind = LEGACY_TO_KITCHEN['range-induction'];
    expect(productById(kitchenFit(ind, [1500, 750, 970])).name).toMatch(/2구/);                      // 같은 크기 낮은 2구가 앞 행
    const ind3 = productById(kitchenFit(ind, [1500, 750, 970], '렌지 인덕션 3구 1500x750'));
    expect(ind3.name).toMatch(/3구/);
    expect(ind3.equip.heat).toBe('electric');
    const gas = productById(kitchenFit(LEGACY_TO_KITCHEN['range-gas-3'], [1500, 750, 800], '가스렌지 2구'));
    expect(gas.name).toMatch(/2구/);                                                                // 열원은 그대로 — 가스 2구
    expect(gas.equip.heat).toBe('gas');
  });

  test('kitchenFit: 이름의 선택 수를 다 가진 후보가 없거나(9조) 선택 수가 없으면 이름을 무시한다 — 이름 없는 호출과 같다', () => {
    const one = LEGACY_TO_KITCHEN['sink-single'], two = LEGACY_TO_KITCHEN['sink-double'];
    const fridge = LEGACY_TO_KITCHEN['fridge-2door'], ind = LEGACY_TO_KITCHEN['range-induction'];
    for (const [id, s, name] of [
      [one, [1500, 750, 850], '세정대 9조 1500-750'], [two, [1500, 750, 850], '세정대 9조'], [two, [1500, 750, 850], '세정대 1500-750'],
      [two, [1500, 750, 850], '세정대 1조 2조'], [fridge, [1260, 800, 1910], '냉장고 3도어 1260-800'], [fridge, [1600, 800, 1910], '냉장고 1100L'],
      [ind, [1500, 750, 970], '인덕션렌지 1500x750'], [ind, [1500, 750, 970], '렌지 3찬'], [one, [1500, 750, 850], ''], [one, [1500, 750, 850], null],
    ]) expect(kitchenFit(id, s, name), `${id} ${name}`).toBe(kitchenFit(id, s));
    expect(kitchenFit('equip-generic', [1000, 600, 850], '세정대 1조')).toBe('equip-generic');
    expect(kitchenFit(two, null, '세정대 1조')).toBe(two);
    for (const p of KITCHEN_PRODUCTS) expect(kitchenFit(p.id, p.size, p.name), p.id).toBe(p.id);   // 자기 크기·자기 이름이면 자기 자신
  });

  test('kitchenFit: 크기가 잘못됐으면(세 개의 유한한 양수가 아니면) 이름이 있든 없든 id 그대로 — 던지지 않는다', () => {
    const one = LEGACY_TO_KITCHEN['sink-single'], two = LEGACY_TO_KITCHEN['sink-double'];
    for (const [id, s, name] of [
      [two, [1500, 750], '세정대 1조'], [two, [1500, NaN, 850], '세정대 1조'], [two, [Infinity, 750, 850], '세정대 1조'], [two, [], '세정대 1조'],
      [one, [1500, 750], '세정대 2조'], [one, [1500, NaN, 850], '세정대 2조'], [one, [Infinity, 750, 850], '세정대 2조'], [one, [], '세정대 2조'],
      [two, '1500x750x850', ''], [two, '1500x750x850', '세정대 1조'], [one, '1500x750x850', undefined],
      [two, [1500, 0, 850], '세정대 1조'], [two, [1500, -750, 850], ''], [two, [1500, 750, 850, 1], '세정대 1조'], [two, undefined, '세정대 1조'],
    ]) {
      const label = `${id} ${String(s)} ${name}`;
      expect(() => kitchenFit(id, s, name), label).not.toThrow();
      expect(kitchenFit(id, s, name), label).toBe(id);
    }
    for (const s of [[1500, 750], [1500, NaN, 850], [Infinity, 750, 850], [], '1500x750x850']) expect(kitchenFit(two, s), String(s)).toBe(two);
  });

  test('선택 수 낱말: 한 자리 숫자(앞에 숫자 없음) + 띄어쓰기 한 칸까지 + 단위, 단위 뒤에 한글 음절이 붙으면 아니다', () => {
    const tokens = name => [...__optionTokens(name)];
    for (const [name, want] of [
      ['세정대 1조 1500-750', ['1조']], ['세정대 2 조', ['2조']], ['냉장고 4도어 1100L 1260-850', ['4도어']], ['보냉고 4도어(앞뒤양문형)', ['4도어']],
      ['가스 3단 취반기', ['3단']], ['반찬 배식대(5찬)', ['5찬']], ['렌지 인덕션 3구 1500x750', ['3구']],
    ]) expect(tokens(name), name).toEqual(want);
    for (const name of ['1500 조리대', '구이기 900', '단열 캐비닛', '찬장 1200', '세정대 1500 조', '세정대 12조', '', null]) expect(tokens(name), String(name)).toEqual([]);
  });

  // 2026-10-20 · 계획 17 Task 8 Fix 1·2: DXF 기구는 어휘의 기존 id(legacy) + 기구 크기 + 도면 이름으로 kitchenFor를 부른다(같은 세부품명 전체에서 고르던
  // kitchenFit은 고정식작업대 → 이동식·보조배식대, 세탁 건조기 → 세탁기, 취반기(전기) → 가스로 갔다). 이름 없는 호출(익명 블록·대표 대응)은 예전과 글자 그대로다.
  test('kitchenFor(id, 크기)는 이름 없이 예전 규칙 그대로다 — 세부품명 → 이름 정규식(없으면 물러섬) → 크기 최근접 · LEGACY_TO_KITCHEN 불변', () => {
    const fp = s => [Math.max(s[0], s[1]), Math.min(s[0], s[1]), s[2]];
    const gap = (a, b) => { const x = fp(a), y = fp(b); return [0, 1, 2].reduce((t, i) => t + Math.abs(Math.log(Math.max(1, x[i]) / Math.max(1, y[i]))), 0); };
    const before = (id, s) => {   // Task 3의 kitchenFor(이름 인자 전) — 기준 구현
      const [subs, re] = LEGACY_SUBS[id], inSub = KITCHEN_PRODUCTS.filter(p => subs.includes(p.sub)), named = re ? inSub.filter(p => re.test(p.name)) : inSub;
      let best = null, g = Infinity;
      for (const p of named.length ? named : inSub) { const d = gap(p.size, s); if (d < g) { best = p; g = d; } }
      return best?.id ?? null;
    };
    const legacySize = id => productById(id)?.size;
    for (const id of Object.keys(LEGACY_SUBS)) {
      expect(LEGACY_TO_KITCHEN[id], id).toBe(before(id, legacySize(id)));
      for (const s of [legacySize(id), [1260, 800, 1910], [1500, 750, 850], [700, 600, 850], [570, 600, 1460], [1500, 1800, 600], [450, 540, 809]]) {
        expect(kitchenFor(id, s), `${id} ${s}`).toBe(before(id, s));
        for (const name of ['', null, undefined, '   ']) expect(kitchenFor(id, s, name), `${id} ${s} ${name}`).toBe(before(id, s));
      }
    }
  });

  // Fix 2(2026-10-20 · 컨트롤러 결정): 표의 이름 정규식 상당수(/1조/ · /2조/ · /2도어/ …)는 갈래가 아니라 크기 대표다 — 이름이 있으면 쓰지 않는다.
  // 대신 이름의 낱말로 거른다: 열원 → 고정식/이동식 → 선택 수 → 제품 낱말(담금·컵·건조기·세탁기·작업대·배식대·선반·손세정 — 이름에 있는 것을 모두 가진 후보).
  test('kitchenFor(id, 크기, 도면 이름): 정규식 없이 열원 → 고정식/이동식 → 선택 수 → 제품 낱말 — 각 거르기는 후보가 남을 때만', () => {
    const name = (id, s, n) => productById(kitchenFor(id, s, n));
    // 열원: 전기·인덕션 → electric, 가스 → gas(열원이 있는 후보 안에서).
    const rice = name('ricecooker-gas', [570, 600, 1460], '취반기(전기) 150인용 570x600x1460');
    expect(rice.equip.heat).toBe('electric');
    expect(name('ricecooker-gas', [570, 600, 1460]).equip.heat).toBe('gas');                        // 이름 없이는 대표(가스) 정규식
    const ind = name('range-gas-6', [1500, 750, 850], '렌지 인덕션 3구 1500x750');
    expect([ind.equip.heat, /3구/.test(ind.name)]).toEqual(['electric', true]);
    expect(name('range-gas-6', [1500, 750, 850], '가스렌지 2구 1500').equip.heat).toBe('gas');
    expect(name('steamer-combi', [1270, 920, 1965], '오븐(가스) 40단').equip.heat).toBe('gas');
    expect(name('soup-kettle', [1520, 1120, 850], '회전국솥 300인(전기) 1520-1120-850').equip.heat).toBe('electric');
    expect(kitchenFor('worktable-1800', [1500, 750, 850], '전기 작업대')).toBe(kitchenFor('worktable-1800', [1500, 750, 850], '작업대'));   // 열원 없는 후보 — 건너뜀
    // 고정식/이동식: 이름에 있으면 후보 이름에도 있어야 한다.
    const fixed = name('worktable-1800', [1500, 750, 850], '고정식작업대 1500-750');
    expect([/고정식/.test(fixed.name), /이동식/.test(fixed.name)]).toEqual([true, false]);
    expect(name('worktable-1800', [1500, 750, 850]).name).toMatch(/이동식/);                        // 이름 없이는 크기가 딱 맞는 이동식
    expect(name('worktable-1800', [1200, 750, 850], '이동식작업대1200-750').name).toMatch(/이동식/);
    // 선택 수: 이름의 조·도어 수.
    expect(name('fridge-2door', [1260, 850, 1800], '냉장고 4도어 1100L 1260-850').name).toMatch(/4도어/);
    expect(name('sink-single', [1500, 750, 850], '세정대 2조 1500-750').name).toMatch(/2조/);
    expect(name('sink-double', [1200, 750, 850], '세정대 2조 1200-750').name).toMatch(/2조/);
    // 이름이 있으면 크기 대표 정규식을 쓰지 않는다: 양문 1260 냉장고는 4도어 1260 · 보존식 소형은 소형냉장고(이름 없이는 /2도어/ 대표 갈래).
    const wide = name('fridge-2door', [1260, 800, 1800], '보냉고 양문1260-800');
    expect([/4도어/.test(wide.name), wide.size[0]]).toEqual([true, 1260]);
    expect(name('fridge-2door', [1260, 800, 1800]).name).toMatch(/2도어/);
    const small = name('fridge-2door', [605, 570, 954], '냉장고 보존식(1식) 605-570-954');
    expect(small.name).toMatch(/소형냉장고/);
    expect(small.name).not.toMatch(/2도어/);
    // 제품 낱말: 이름에 있는 낱말을 모두 가진 후보.
    expect(name('worktable-1800', [700, 600, 850], '고정식작업대 700-600').name).toMatch(/작업대/);
    expect(name('worktable-1800', [700, 600, 850]).name).not.toMatch(/보조배식대/);
    expect(name('dryer', [700, 830, 1000], '세탁 건조기 700-830').name).toMatch(/건조기/);
    expect(name('dryer', [700, 830, 1890], '세탁기 건조기 직렬').name).toMatch(/세탁기\/건조기/);   // 낱말 둘 다
    expect(name('washer-drum', [450, 540, 809], '세탁기 삶기 450-540-809').name).toMatch(/세탁기/);
    expect(name('sink-double', [1500, 750, 850], '수류담금세척기 TR1500S').name).toMatch(/담금/);
    expect(name('dishwasher', [600, 570, 1500], '컵자동세척기').name).toMatch(/컵/);
    const multi = name('washbasin', [1800, 550, 1450], '멀티손세정대3구 1800-550-1450');
    expect([/손세정/.test(multi.name), multi.size[0]]).toEqual([true, 1800]);
    expect(name('hood-box', [1500, 1800, 600], '').name).toMatch(/^배기후드/);                     // 이름 없는 익명 후드는 대표 정규식
    // Fix 3: 제품 낱말이 하나도 안 걸리면 대표 제품(LEGACY_TO_KITCHEN)과 같은 형상만 — 배식대·싱크대 세부품명 안의 운반차(cart)가 이기지 않게.
    const serve = name('serve-counter', [800, 600, 850], '수저식판배분대800-600');
    expect([serve.shape, /운반/.test(serve.name)]).toEqual([productById(LEGACY_TO_KITCHEN['serve-counter']).shape, false]);
    expect(KITCHEN_PRODUCTS.some(p => LEGACY_SUBS['serve-counter'][0].includes(p.sub) && p.shape === 'cart')).toBe(true);   // 운반차가 같은 세부품명에 있다
    for (const n of ['개수대-600X600', 'To청소대A(w)']) {
      const p = name('sink-single', [600, 600, 850], n);
      expect([p.shape, /회수차/.test(p.name)], n).toEqual(['sink', false]);
    }
    expect(name('washer-drum', [450, 540, 809], '세탁기 삶기 450-540-809').name).toMatch(/삶기용/);   // 제품 낱말(세탁기)이 걸리면 형상 거르기 없음(삶기용은 machine)
    // Fix 3: 같은 거리면 표의 정규식(/^배기후드/)에 맞는 후보가 이긴다 — 같은 크기의 이중급배기후드가 원자료 순서상 앞이다.
    for (const [s, n] of [[[1500, 1300, 600], '후드1500-1300'], [[1200, 1200, 600], '후드1200-1200']]) {
      expect(KITCHEN_PRODUCTS.some(p => /^이중급배기후드/.test(p.name) && p.size[0] === s[0] && p.size[1] === s[1]), n).toBe(true);
      expect(name('hood-box', s, n).name, n).toMatch(/^배기후드/);
    }
    // 남는 후보가 없는 낱말은 무시한다(9조 · 전기 세정대 · 이동식 후드) — 거를 낱말이 없는 이름과 같다.
    for (const [id, s, n] of [['sink-double', [1500, 750, 850], '세정대 9조'], ['sink-single', [1200, 750, 850], '전기 세정대'], ['hood-box', [1500, 1300, 600], '이동식 후드']])
      expect(kitchenFor(id, s, n), n).toBe(kitchenFor(id, s, '도면 이름'));
    expect(kitchenFor('sofa-3', [2100, 900, 800], '고정식')).toBeNull();
  });

  test('kitchenFit: 이름에 조리대·단열 같은 낱말이 같이 있어도 진짜 선택 수가 이긴다', () => {
    const two = LEGACY_TO_KITCHEN['sink-double'], sink = [1500, 750, 850];
    expect(productById(kitchenFit(two, sink, '세정대 1조 조리대측 1500-750')).name).toMatch(/1조/);
    expect(productById(kitchenFit(two, sink, '세정대 1조 1500 조리대측')).name).toMatch(/1조/);       // 전: '1500조'가 섞여 이름 전체가 무시됐다
    const fridge = LEGACY_TO_KITCHEN['fridge-2door'];
    expect(productById(kitchenFit(fridge, [1600, 800, 1910], '냉장고 4도어 1600 단열')).name).toMatch(/4도어/);   // 전: '1600단' → 6도어
  });
});
