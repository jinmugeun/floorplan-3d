// 엑셀 급식기구 → 제품 규칙(계획 17 Task 2). 순수 모듈 — 엑셀 읽기·파일 쓰기는 tools/products/excel-to-catalog.mjs, 펼치기 호출은 catalogKitchen.js.
// 생성 파일(kitchenData.js)에는 엑셀 원자료만 담고 형상·칩·심벌·설비 씨앗은 여기서 계산한다 — 규칙을 고쳐도 데이터를 다시 뽑지 않아도 된다.
// 형상 이름 규칙·옵션은 shapeNames.js(도면 기구와 공용).
import { shapeByName, shapeOpts, isThin } from './shapeNames.js';

export const normSub = s => String(s ?? '').replace(/\s+/g, '');

// 라이브러리 칩 9개(엑셀) — 앱 카탈로그가 끝에 '건축 요소'를 더한다.
export const KITCHEN_CHIPS = ['조리', '세척·소독', '냉장·냉동', '싱크·조리대', '배식', '후드·환기', '운반·보관', '가구·사무', '위생·기타'];
// 세부품명(공백 제거) → 칩. 엑셀 64종 전부 + 빈칸. 없는 세부품명이 나오면 생성기가 멈춘다(tools/products/excel-to-catalog.mjs).
export const SUB_CHIP = {
  상업용오븐: '조리', 국솥: '조리', 부침기: '조리', 취반기: '조리', 상업용가스레인지: '조리', 상업용전기레인지: '조리', 식품발효기: '조리', 상업용믹서기: '조리',
  상업용식기세척기: '세척·소독', 주방기구소독기: '세척·소독', 식기건조대: '세척·소독', 자동야채세척기: '세척·소독', 세미기: '세척·소독', 탈피기: '세척·소독', 수저회수차: '세척·소독',
  냉장고: '냉장·냉동', 상업용냉동고: '냉장·냉동', 김치냉장고: '냉장·냉동',
  상업용싱크대: '싱크·조리대', 상업용조리대: '싱크·조리대', 주방기기용받침대: '싱크·조리대', 실험실용싱크대: '싱크·조리대', 음식쓰레기처리대: '싱크·조리대',
  배식대: '배식', 식판배분대: '배식', 상업용식품온장고: '배식', 이동식스툴테이블: '배식',
  상업용주방후드: '후드·환기', 에어커튼: '후드·환기', 공기살균기: '후드·환기',
  카트: '운반·보관', 돌리: '운반·보관', 플랫폼트럭: '운반·보관', 다단식운반차: '운반·보관', 캐비닛: '운반·보관', 사물함: '운반·보관', 청소도구함: '운반·보관', 신발장: '운반·보관',
  책상: '가구·사무', 회의용탁자: '가구·사무', 접이식의자: '가구·사무', 작업용의자: '가구·사무', 이동형파일서랍: '가구·사무', 사무실칸막이: '가구·사무', 문서세단기: '가구·사무',
  세면기: '위생·기타', 손소독기: '위생·기타', 신발건조기: '위생·기타', 세탁건조기: '위생·기타', 가정용세탁기: '위생·기타', 대걸레탈수건조기: '위생·기타', 현관매트: '위생·기타',
  온수제조기: '위생·기타', 살균수제조장치: '위생·기타', 일반용음식물쓰레기처리기: '위생·기타', 음식물쓰레기처리통: '위생·기타', 식료품절단기: '위생·기타', 음식물슬라이싱기: '위생·기타',
  청소기: '위생·기타', 건습식진공청소기: '위생·기타', 호스릴: '위생·기타', DB관리시스템소프트웨어: '위생·기타', '': '위생·기타',
};
// 세부품명 → 형상(이름 규칙보다 먼저 — 단 NAME_WINS의 형상은 이름이 이긴다 · 세부품명이 rack이면 언제나 세부품명).
export const SUB_SHAPE = {
  상업용조리대: 'worktable', 주방기기용받침대: 'worktable',
  상업용싱크대: 'sink', 세면기: 'sink', 실험실용싱크대: 'sink', 음식쓰레기처리대: 'sink',
  상업용가스레인지: 'range', 상업용전기레인지: 'range', 국솥: 'kettle', 세미기: 'machine', 취반기: 'ricecooker', 상업용오븐: 'oven', 식품발효기: 'oven', 부침기: 'griddle',
  상업용식기세척기: 'dishwasher',
  주방기구소독기: 'cabinet', 냉장고: 'cabinet', 상업용냉동고: 'cabinet', 김치냉장고: 'cabinet', 상업용식품온장고: 'cabinet', 캐비닛: 'cabinet', 사물함: 'cabinet',
  신발건조기: 'cabinet', 청소도구함: 'cabinet', 신발장: 'cabinet', 세탁건조기: 'cabinet', 이동형파일서랍: 'cabinet',
  상업용주방후드: 'hood', 식기건조대: 'rack', 다단식운반차: 'rack', 카트: 'cart', 돌리: 'cart', 플랫폼트럭: 'cart', 수저회수차: 'cart',
  배식대: 'counter', 식판배분대: 'counter', 이동식스툴테이블: 'table', 책상: 'table', 회의용탁자: 'table', 접이식의자: 'chair', 작업용의자: 'chair',
  자동야채세척기: 'machine', 식료품절단기: 'machine', 탈피기: 'machine', 상업용믹서기: 'machine', 음식물슬라이싱기: 'machine', 온수제조기: 'machine', 살균수제조장치: 'wallunit',
  일반용음식물쓰레기처리기: 'machine', 음식물쓰레기처리통: 'machine', 청소기: 'machine', 건습식진공청소기: 'machine', 문서세단기: 'machine', 가정용세탁기: 'machine',
  대걸레탈수건조기: 'machine', 공기살균기: 'machine', 에어커튼: 'wallunit', 손소독기: 'wallunit', 호스릴: 'wallunit', 현관매트: 'panel', 사무실칸막이: 'panel',
};
// 세부품명 안에서도 이름이 이기는 형상: 배식대의 '양념운반카'(cart) · 손소독기의 '손세정,소독,건조기'(sink) · 공기살균기 '벽걸이형'(wallunit).
const NAME_WINS = new Set(['cart', 'wallunit', 'sink']);
// 형상 → 2D 심벌(src/products/symbols.js의 이름 — SYMBOL_NAMES 안).
export const SHAPE_SYMBOL = { worktable: 'table', sink: 'sink', range: 'range', kettle: 'appliance', ricecooker: 'appliance', oven: 'appliance', griddle: 'appliance', dishwasher: 'appliance',
  cabinet: 'fridge', hood: 'hood', rack: 'box', cart: 'box', counter: 'table', table: 'table', chair: 'chair', machine: 'box', wallunit: 'box', panel: 'box', enclosure: 'box' };
// 풍량 집계에 드는 조리기구: 세부품명 → appliance kind(src/vent/equipment.js APPLIANCE_KINDS).
export const APPLIANCE_KIND = { 상업용오븐: 'steamer', 식품발효기: 'steamer', 국솥: 'soupkettle', 부침기: 'griddle', 취반기: 'ricecooker', 상업용가스레인지: 'range', 상업용전기레인지: 'range', 상업용식기세척기: 'dishwasher' };
// 벽부착(wallunit)의 아랫면 높이(mm). 목록에 없는 wallunit은 바닥에 선다(살균수 제조장치처럼 작은 기계).
export const WALL_Z = [[/에어커튼/, 2200], [/손소독기/, 1100], [/호스릴|워터릴/, 1000], [/살균수/, 1200], [/벽걸이/, 2000]];

// 규격 → { size: [w, d, h] mm, round } | null. 숫자 셋(× x X * ＊)을 찾고, 범위 a~b는 큰 값(바운딩 상자), Φd×h는 [d, d, h].
// 예: '100인용(570×600×1095mm)' · '900*500*1900mm 잔넬형' · '1800×750×628~1278mm' · 'DUAL-900 (890×222×215mm)' · '20Kg(Φ470×960mm)'.
const NUM = '(\\d+(?:\\.\\d+)?)(?:\\s*~\\s*(\\d+(?:\\.\\d+)?))?';
const SEP = '\\s*[×xX*＊]\\s*';
const RE3 = new RegExp(NUM + SEP + NUM + SEP + NUM);
const REPHI = new RegExp('[Φφø∅Ø]\\s*' + NUM + SEP + NUM);
const okMm = v => v >= 10 && v <= 20000;
export function parseSpec(spec) {
  const s = String(spec ?? '').replace(/(\d),(?=\d{3}\b)/g, '$1');
  const val = (a, b) => Math.round(Number(b ?? a));
  let m = RE3.exec(s);
  if (m) { const size = [val(m[1], m[2]), val(m[3], m[4]), val(m[5], m[6])]; return size.every(okMm) ? { size, round: false } : null; }
  m = REPHI.exec(s);
  if (m) { const dia = val(m[1], m[2]), h = val(m[3], m[4]); return okMm(dia) && okMm(h) ? { size: [dia, dia, h], round: true } : null; }
  return null;
}

// 숫자 칸(단가·kW·가스): 'LNG:48\nLPG:57' → 48 · 빈칸·글자뿐 → 0.
export function numOf(v) { const m = /(\d+(?:\.\d+)?)/.exec(String(v ?? '')); return m ? Number(m[1]) : 0; }

// 급배수 칸(O/P/Q 냉수·온수·배수)은 배관 규격('15A' · '20 A' · '50A')일 때만 배관이다 — 냉수 칸의 메모('김흥수이사' · '고급형' · '(디판)')는 배관이 아니다.
export const isPipe = v => /^\d+(?:\.\d+)?\s*A$/i.test(String(v ?? '').trim());

// 이 행을 제품에서 뺄 이유(없으면 null). row = { kind, sub, name, spec }.
export function skipReason(row) {
  if (!['기구', '가구'].includes(String(row.kind ?? '').trim())) return '종류';
  if (normSub(row.sub) === 'DB관리시스템소프트웨어') return 'S/W';
  if (/\(부품\)|부품\)|옵션추가|액세서리/.test(String(row.name ?? ''))) return '부품·옵션';
  if (!parseSpec(row.spec)) return '규격';
  return null;
}

export function shapeOf(sub, name, size) {
  if (isThin(size)) return 'panel';
  const byName = shapeByName(name), bySub = SUB_SHAPE[normSub(sub)];
  if (bySub === 'rack') return bySub; // '다단식 운반차'는 바퀴 달린 선반이다(이름의 '운반차'(cart)보다 세부품명이 이긴다 · 바퀴는 shapeOpts가 '운반'으로 켠다).
  if (byName && NAME_WINS.has(byName)) return byName;
  return bySub ?? byName ?? 'machine';
}

// 원자료 행 → 제품. rec = [kid, name, subIdx, w, d, h, round, price, vendorIdx, model, contract, util?] · util = [물bits, 1P, 3P, 4P, 가스].
export function expandRow(rec, { vendors, subs }) {
  const [kid, name, si, w, d, h, round, price, vi, model, contract, util = [0, 0, 0, 0, 0]] = rec;
  const sub = subs[si] ?? '', size = [w, d, h];
  const shape = shapeOf(sub, name, size), opts = shapeOpts(shape, name, size, { round: !!round });
  const wallZ = shape === 'wallunit' ? WALL_Z.find(([re]) => re.test(name)) : null;
  const attach = shape === 'hood' ? 'ceiling' : wallZ ? 'wall' : 'floor';
  const vendor = vendors[vi] ?? '', gas = util[4] ?? 0;
  const p = {
    id: `k-${kid}`, name, code: model || `K-${kid}`, category: SUB_CHIP[sub] ?? '위생·기타', sub: sub || '기타',
    size, attach, symbol: SHAPE_SYMBOL[shape], zDefault: wallZ ? wallZ[1] : 0, color: '#cfd4da', kind: 'product',
    tags: `${name} ${model} ${vendor} ${sub}`.trim(), price, shape, shapeOpts: opts,
    extra: { kid, vendor, model, contract, util: { water: [1, 2, 4].map(b => !!(util[0] & b)), elec: [util[1], util[2], util[3]], gas } },
  };
  if (sub === '상업용주방후드') { p.kind = 'equipment'; p.equip = { type: 'hood', ...(/필터/.test(name) ? { filter: true } : {}) }; }
  else if (APPLIANCE_KIND[sub]) { p.kind = 'equipment'; p.equip = { type: 'appliance', kind: APPLIANCE_KIND[sub], heat: gas > 0 || /가스/.test(name) ? 'gas' : 'electric' }; }
  return p;
}
