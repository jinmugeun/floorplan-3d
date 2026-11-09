// 학교 구입목록 원자료(계획 20 Task 3 · 명세 D6·D7·D8): 엑셀 행 → 제품이 될 행 → 제품 묶음 · 카탈로그 차이 · 커밋된 purchaseData.js.
import { test, expect } from 'vitest';
import purchase from '../src/products/purchaseData.js';
import data from '../src/products/kitchenData.js';
import { purchaseRows, groupPurchase, subOf, SIZE_FILL, OVERRIDES, FREE_CONTRACTS, CONTRACTS, COL } from '../tools/products/purchase-lib.mjs';

const row = o => { const r = Array(16).fill(''); for (const [k, i] of Object.entries(COL)) if (o[k] !== undefined) r[i] = o[k]; return r; };

test('purchaseRows: 기구·가구만 · 부품·옵션 빼기 · 규격 크기(Φ는 원) · 크기 없는 칸은 SIZE_FILL · 그래도 없으면 던진다', () => {
  const rows = purchaseRows([
    row({ no: 1, dwg: 1, name: '전기 인덕션 취반기', spec: '150인용 \n(572×800×1500)', qty: 2, price: 7000000, contract: 'S2B', kid: 202606158754353, kind: '기구', vendor: '신성하인스', loc: '조리실2' }),
    row({ no: 2, name: '수저', spec: '10×10×10', kind: '기물' }),
    row({ name: '고정식 작업대 하부선반 옵션추가(1200)', spec: '1055×600×42', kind: '기구', kid: 24803673 }),
    row({ no: 91, dwg: 91, name: '상담용 테이블', spec: 'Φ800×720', qty: 1, price: 210000, contract: 'G2B', kid: 26361921, kind: '가구' }),
    row({ no: 74, dwg: 74, name: '자동워터릴', spec: '스텐15m/냉온수용', qty: 7, price: 440000, contract: 'S2B', kid: 202303206019265, kind: '기구' }),
  ]);
  expect(rows.map(r => [r.no, r.kid, r.size, r.round, r.qty])).toEqual([
    [1, '202606158754353', [572, 800, 1500], false, 2], [91, '26361921', [800, 800, 720], true, 1], [74, '202303206019265', [...SIZE_FILL['202303206019265'].size], false, 7]]);
  expect(rows[0]).toMatchObject({ dwg: 1, name: '전기 인덕션 취반기', price: 7000000, contract: 'S2B', vendor: '신성하인스', loc: '조리실2' });
  expect(() => purchaseRows([row({ no: 9, name: '무엇', spec: '모름', kind: '기구', kid: 1 })])).toThrow(/SIZE_FILL/);
});

test('purchaseRows: 종류 빈칸이라도 수의·재사용 + 번호·도면번호가 숫자면 도면 기구로 남긴다 · 미구입 · 도면번호 없음(예비번호) · 번호 없음은 뺀다', () => {
  const rows = purchaseRows([
    row({ no: 22, dwg: 22, name: '세미기', spec: '40Kg/회 (756×756×960)', contract: '재사용', loc: '전처리실1' }),
    row({ no: 51, dwg: 51, name: '고정식 작업대', spec: '600×600×850', price: 111000, contract: '수의', loc: '전처리실1' }),
    row({ no: 105, dwg: 105, name: '급배기후드(국솥,오븐)', spec: '1500×1300×600', contract: '미구입', loc: '조리실4' }),
    row({ no: 61, dwg: '예비번호', name: '세미기', spec: '756×756×960', contract: '재사용' }),
    row({ no: 62, name: '세미기', spec: '756×756×960', contract: '재사용' }),
    row({ dwg: 63, name: '세미기', spec: '756×756×960', contract: '수의' }),
  ]);
  expect(rows.map(r => [r.no, r.dwg, r.kid, r.size, r.contract, r.price, r.loc])).toEqual([
    [22, 22, '', [756, 756, 960], '재사용', 0, '전처리실1'], [51, 51, '', [600, 600, 850], '수의', 111000, '전처리실1']]);
});

test('purchaseRows: 남긴 행의 계약방법이 S2B·G2B·수의·재사용 밖이면 던진다(D8 단가 규칙이 모르는 값을 지나치지 않게)', () => {
  expect(CONTRACTS).toEqual(['S2B', 'G2B', '수의', '재사용']);
  const r = o => row({ no: 8, dwg: 8, name: '전기 부침기', spec: '1200×750×850', kind: '기구', kid: 24819816, ...o });
  expect(() => purchaseRows([r({ contract: 'S2B(입찰)' })])).toThrow(/계약방법.*S2B\(입찰\)/);
  expect(() => purchaseRows([r({ contract: '' })])).toThrow(/계약방법/);
  expect(purchaseRows([r({ contract: 'G2B' })])).toHaveLength(1);
});

test('purchaseRows: 식별번호 없는 행의 크기 없는 규격은 SIZE_FILL no:<번호> · 거기도 없으면 두 열쇠 꼴을 말하며 던진다', () => {
  expect(SIZE_FILL['no:41'].size).toEqual([450, 255, 600]);
  const [r] = purchaseRows([row({ no: 41, dwg: 41, name: '살균수 제조장치', spec: '20L/min ', contract: '재사용', loc: '전처리실1' })]);
  expect([r.no, r.kid, r.size, r.round]).toEqual([41, '', [450, 255, 600], false]);
  expect(() => purchaseRows([row({ no: 42, dwg: 42, name: '살균수 제조장치', spec: '20L/min', contract: '재사용' })])).toThrow(/SIZE_FILL.*식별번호.*no:42/);
});

test('groupPurchase: 같은 식별번호 = 한 제품(수량 합) · 식별번호 없는 행은 같은 이름끼리 ss-<첫 번호> · 카탈로그 제품은 크기·단가를 들지 않는다 · 수의 0원 · 덮어쓰기', () => {
  const base = { round: false, contract: 'G2B', vendor: '에이치케이' };
  const rows = [
    { ...base, no: 18, dwg: 18, name: '1조 세정대 (STS 배수구)', size: [900, 750, 850], qty: 1, price: 610000, kid: '23907340', loc: '세척실1' },
    { ...base, no: 20, dwg: 20, name: '1조 세정대 (STS 배수구)', size: [750, 750, 850], qty: 2, price: 610000, kid: '23907340', loc: '조리실2' },
    { ...base, no: 63, dwg: 63, name: '청소용 낮은 1조 세정대 (STS 배수구)', size: [600, 600, 550], qty: 2, price: 222000, contract: '수의', kid: '', vendor: '', loc: '외부2' },
    { ...base, no: 66, dwg: 66, name: '청소용 낮은 1조 세정대 (STS 배수구)', size: [600, 550, 550], qty: 1, price: 222000, contract: '수의', kid: '', vendor: '', loc: '식당청소실1' },
    { ...base, no: 53, dwg: 53, name: '고정식 작업대', size: [1500, 750, 850], qty: 2, price: 480000, kid: '25255110', loc: '조리실2' },
  ];
  const g = groupPurchase(rows, data);
  expect(g.rows.map(r => r.id)).toEqual(['k-23907340', 'k-23907340', 'ss-63', 'ss-63', 'k-25255110']);
  expect(g.rows[1]).toEqual({ no: 20, dwg: 20, name: '1조 세정대 (STS 배수구)', size: [750, 750, 850], qty: 2, loc: '조리실2', id: 'k-23907340' });
  const by = Object.fromEntries(g.products.map(p => [p.id, p]));
  expect(by['k-23907340']).toEqual({ id: 'k-23907340', kid: '23907340', no: 18, nos: [18, 20], name: '1조 세정대 (STS 배수구)', qty: 3, inCatalog: true, override: false });
  expect(by['ss-63']).toMatchObject({ kid: null, nos: [63, 66], qty: 3, inCatalog: false, override: false, price: 0, sub: '상업용싱크대', size: [600, 600, 550] });
  expect(by['k-25255110']).toMatchObject({ inCatalog: true, override: true, name: '고정식 작업대', size: [1500, 750, 850], price: 480000, sub: '상업용조리대', vendor: '에이치케이', contract: 'G2B' });
  const d = g.diffs.find(x => x.kid === '25255110');
  expect(d.override).toBe(true);
  expect(d.what.some(w => /^형상 worktable ↔ rack/.test(w))).toBe(true);
  expect(g.diffs.some(x => x.kid === '23907340')).toBe(false);         // 이름 표기(띄어쓰기·괄호)만 다르면 차이가 아니다
});

test('subOf: 이름 → 세부품명(손세정대는 세정대보다 먼저) · 모르는 이름은 던진다', () => {
  expect(['멀티 손세정대', '담금 세정대', '자동워터릴', '국보온 운반카', '식기자동투입장치', '미니 소독기(전처리실)', '전기 초음파튀김기'].map(subOf))
    .toEqual(['세면기', '상업용싱크대', '호스릴', '카트', '', '주방기구소독기', '부침기']);
  expect(() => subOf('무엇인지 모름')).toThrow(/NAME_SUB/);
});

test('subOf: 종류 빈칸 도면 기구의 이름 — 김치 냉장고는 냉장고보다 먼저 · 세탁기는 세탁건조기 뒤', () => {
  expect(['세미기', '김치 냉장고', '김치냉장고', '다용도 커터믹서기', '야채 절단기', '살균수 제조장치', '손소독기', '삶기용 세탁기', '세탁건조기', '소형냉장고'].map(subOf))
    .toEqual(['세미기', '김치냉장고', '김치냉장고', '상업용믹서기', '식료품절단기', '살균수제조장치', '손소독기', '가정용세탁기', '세탁건조기', '냉장고']);
});

test('커밋된 purchaseData: 신상중 구입목록(sha256 고정) · 행 101 · 제품 93 = 카탈로그 62 + 덮어쓰기 1 + 새 30(식별번호 12 · 없음 18) · 수의·재사용 0원', () => {
  expect(purchase).toMatchObject({ version: 1, school: '경산 신상중', sha256: 'b44bf25749445fb1cf9b23039102bffa9dc17e900552857c78bb5d477b9f1c26', overrides: [...OVERRIDES] });
  expect(purchase.rows).toHaveLength(101);
  expect(purchase.products).toHaveLength(93);
  const n = f => purchase.products.filter(f).length;
  expect([n(p => p.inCatalog && !p.override), n(p => p.override), n(p => !p.inCatalog && p.kid), n(p => !p.kid)]).toEqual([62, 1, 12, 18]);
  // 종류 빈칸 도면 기구 8행은 들고(사용자 결정 2026-11-06), 후드(미구입 105~108)·예비번호는 뺀다 · 51·101번 고정식 작업대(수의)는 한 제품.
  const nos = new Set(purchase.rows.map(r => r.no));
  expect([22, 27, 36, 37, 41, 51, 60, 84].filter(k => !nos.has(k))).toEqual([]);
  expect([61, 100, 105, 106, 107, 108, 109].filter(k => nos.has(k))).toEqual([]);
  expect(purchase.products.find(p => p.id === 'ss-51')).toMatchObject({ kid: null, nos: [51, 101], qty: 2, price: 0, sub: '상업용조리대', size: [600, 600, 850] });
  expect(purchase.products.some(p => p.id === 'ss-101')).toBe(false);
  for (const p of purchase.products.filter(q => !q.inCatalog || q.override)) {
    expect(p.size.every(v => v > 0), p.id).toBe(true);
    if (!p.kid) expect([p.id, p.price], p.id).toEqual([`ss-${p.no}`, 0]);
  }
  expect(purchase.rows.every(r => purchase.products.some(p => p.id === r.id))).toBe(true);
  expect(FREE_CONTRACTS).toEqual(['수의', '재사용']);
});
