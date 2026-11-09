// 학교 구입목록 엑셀 → 구입 제품 원자료(계획 20 Task 3 · 명세 D6·D7·D8). 순수 함수 — 엑셀 읽기·파일 쓰기는 purchase-to-catalog.mjs.
// 구입목록이 그 학교 기구의 정본이다(사용자 2026-11-06: "구입목록에 S2B·G2B 정보가 들어 있으니 참고"). 카탈로그(식별번호 엑셀)와 다르면 구입목록을 따르되,
// 덮어쓰기는 OVERRIDES에 적은 것만이다(차이 표를 사람이 보고 더한다 — 이름 표기 차이 · 크기 변형은 덮어쓰지 않는다).
import { parseSpec, shapeOf, normSub, SUB_CHIP } from '../../src/products/kitchenRules.js';
import { shapeByName } from '../../src/products/shapeNames.js';

export const SCHOOL = '경산 신상중';
export const SHEET = '기구구입목록(전체)';
export const HEAD_ROWS = 4;   // 1~4행 = 제목 · 빈 줄 · 날짜 · 머리글
// 열(0부터): 번호 · 도면번호 · 급식기구명 · 규격 · 비고 · 수량 · 단위 · 단가 · 조달수수료 · 금액 · 계약방법 · 물품식별번호 · 구분 · 종류 · 업체 · 기구 배치 위치
export const COL = Object.freeze({ no: 0, dwg: 1, name: 2, spec: 3, qty: 5, price: 7, contract: 10, kid: 11, kind: 13, vendor: 14, loc: 15 });
// 카탈로그와 달라도 구입목록 값을 따를 식별번호(D7).
export const OVERRIDES = Object.freeze(['25255110']);   // 구입목록·S2B 사진 = 고정식 작업대 1500×750×850 · 카탈로그 = 다단식 선반 900×500×1900
// 규격 칸에 크기가 없는 행의 크기(mm [w, d, h])와 근거. 열쇠 = 물품식별번호, 식별번호가 없는 행(수의·재사용)은 'no:<번호>'.
export const SIZE_FILL = Object.freeze({
  202303206019265: Object.freeze({ size: Object.freeze([460, 220, 480]), why: '자동워터릴(코릴 TWA-1315W · 15 m) — 제조사 치수 미확인(2026-11-06 검색) · S2B 사진 비율로 추정' }),
  'no:41': Object.freeze({ size: Object.freeze([450, 255, 600]), why: '살균수 제조장치(재사용) — 규격 칸은 20L/min뿐 · 도면 블록 이름 "살균수제조 450-255"(W×D) · 높이 600은 도면 기구 상자 높이' }),
});
// 카탈로그에 없는 제품의 세부품명(형상·칩 규칙의 열쇠 — kitchenRules.SUB_CHIP·SUB_SHAPE). 위에서부터 처음 맞는 것이다.
// 튀김기 → 부침기: 엑셀에 튀김기 세부품명이 없고, 풍량 집계에서 가장 가까운 열 기구가 부침기(griddle)다.
// 김치 냉장고는 냉장고보다, 세탁건조기는 세탁기보다 먼저다.
export const NAME_SUB = Object.freeze([
  [/취반기/, '취반기'], [/교반기/, '상업용믹서기'], [/튀김기/, '부침기'], [/트롤리/, '다단식운반차'],
  [/식기소독기|미니 소독기/, '주방기구소독기'], [/손세정대/, '세면기'], [/워터릴/, '호스릴'], [/김치 ?냉장고/, '김치냉장고'], [/냉장고/, '냉장고'],
  [/상담용 테이블/, '회의용탁자'], [/캐비닛/, '캐비닛'], [/보조배식대/, '배식대'], [/운반카/, '카트'],
  [/잔반처리대/, '음식쓰레기처리대'], [/세정대|싱크대/, '상업용싱크대'], [/탈수기/, '자동야채세척기'], [/검수대|작업대/, '상업용조리대'],
  [/세탁건조기/, '세탁건조기'], [/세탁기/, '가정용세탁기'], [/식기자동투입장치/, ''],
  [/세미기/, '세미기'], [/믹서기/, '상업용믹서기'], [/절단기/, '식료품절단기'], [/살균수/, '살균수제조장치'], [/손소독기/, '손소독기'],
]);
export const FREE_CONTRACTS = Object.freeze(['수의', '재사용']);   // 단가 0원(D8 · 사용자 결정 2026-11-06 — 조달 공개 가격이 아니다)
export const CONTRACTS = Object.freeze(['S2B', 'G2B', ...FREE_CONTRACTS]);   // 남길 행의 계약방법 — 이 밖이면 던진다(D8 단가 규칙이 모르는 값을 지나치지 않게)

const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const num = v => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0; };
const bare = s => String(s ?? '').replace(/[\s()·,]/g, '');
const isNo = s => /^\d+$/.test(s);   // 번호·도면번호 칸이 숫자인가('예비번호' · '외1' · 빈칸은 아니다)

// 이름 → 세부품명. 모르는 이름이면 던진다(조용히 '기타'로 가지 않게).
export function subOf(name) {
  const hit = NAME_SUB.find(([re]) => re.test(name));
  if (!hit) throw new Error(`구입목록 제품 '${name}'의 세부품명을 모른다 — purchase-lib.mjs NAME_SUB에 더한다`);
  if (!(normSub(hit[1]) in SUB_CHIP)) throw new Error(`NAME_SUB의 세부품명이 표(kitchenRules.SUB_CHIP)에 없다: ${hit[1]}`);
  return hit[1];
}

// 엑셀 행 배열(머리 뒤) → 제품이 될 행 [{ no, dwg, name, spec, size, round, qty, price, contract, kid, vendor, loc }].
// 기구·가구만, 부품·옵션('옵션추가' 등) 제외. 규격에 크기가 없으면 SIZE_FILL, 거기도 없으면 던진다.
// 종류 칸이 빈 행도 계약이 수의·재사용이고 번호·도면번호가 숫자면 남긴다 — 다시 쓰거나 수의로 들이는 도면 기구(세미기 · 김치 냉장고 · 손소독기 …)다
// (사용자 결정 2026-11-06). 종류 빈칸이어도 미구입(후드 105~108)·예비번호(도면번호 칸이 글자)는 빠진다.
export function purchaseRows(rows, fill = SIZE_FILL) {
  const out = [];
  for (const r of rows) {
    const c = Object.fromEntries(Object.entries(COL).map(([k, i]) => [k, clean(r[i])]));
    const drawn = !c.kind && FREE_CONTRACTS.includes(c.contract) && isNo(c.no) && isNo(c.dwg);
    if (!['기구', '가구'].includes(c.kind) && !drawn) continue;
    if (/\(부품\)|부품\)|옵션추가|액세서리/.test(c.name)) continue;
    const f = fill[c.kid] ?? fill[`no:${c.no}`];
    const ps = parseSpec(c.spec) ?? (f ? { size: [...f.size], round: false } : null);
    if (!ps) throw new Error(`구입목록 ${c.no}번 ${c.name}: 규격에 크기가 없다(${c.spec}) — purchase-lib.mjs SIZE_FILL에 근거와 함께 더한다(열쇠 = 식별번호${c.kid ? ` ${c.kid}` : ''} · 식별번호가 없으면 'no:${c.no}')`);
    if (!CONTRACTS.includes(c.contract)) throw new Error(`구입목록 ${c.no}번 ${c.name}: 계약방법 '${c.contract}'을 모른다(${CONTRACTS.join(' · ')}만) — 단가 규칙(D8)을 정하고 purchase-lib.mjs CONTRACTS에 더한다`);
    out.push({ no: num(c.no), dwg: num(c.dwg), name: c.name, spec: c.spec, size: ps.size, round: ps.round, qty: num(c.qty) || 1, price: Math.round(num(c.price)),
      contract: c.contract, kid: c.kid, vendor: c.vendor, loc: c.loc });
  }
  return out;
}

// 구입목록 행 ↔ 카탈로그 행(kitchenData.rows의 한 행) 차이: 이름(띄어쓰기·괄호 무시) · 크기 · 형상(이름 규칙이 카탈로그 형상과 다를 때 — 정말 다른 제품의 신호).
export function diffOf(r, c, subs) {
  const what = [], size = [c[3], c[4], c[5]];
  if (bare(r.name) !== bare(c[1])) what.push('이름');
  if (r.size.join('×') !== size.join('×')) what.push(`크기 ${r.size.join('×')} ↔ ${size.join('×')}`);
  const mine = shapeByName(r.name), theirs = shapeOf(subs[c[2]] ?? '', c[1], size);
  if (mine && mine !== theirs) what.push(`형상 ${mine} ↔ ${theirs}`);
  return what;
}

// 행 → 제품 묶음. catalog = kitchenData({ rows, subs }). 돌려줌 { products, rows(각 행 + 제품 id), diffs }.
//  - 같은 식별번호 여러 행(위치·크기 변형)은 한 제품이고 수량을 더한다 — 아이템이 자기 크기를 든다. 제품의 크기는 첫 행이다.
//  - 식별번호 없는 행(수의·재사용)은 같은 이름(공백 무시)끼리 묶어 ss-<첫 번호>다.
//  - 카탈로그에 있고 덮어쓰기가 아니면 참조만(크기·단가 없음) — 카탈로그 제품 그대로 쓴다.
export function groupPurchase(rows, catalog, overrides = OVERRIDES) {
  const cat = new Map(catalog.rows.map(r => [r[0], r]));
  const firstNo = new Map(), products = new Map(), outRows = [], diffs = [];
  for (const r of rows) {
    const key = r.name.replace(/\s+/g, '');
    if (!r.kid && !firstNo.has(key)) firstNo.set(key, r.no);
    const id = r.kid ? `k-${r.kid}` : `ss-${firstNo.get(key)}`;
    outRows.push({ no: r.no, dwg: r.dwg, name: r.name, size: r.size, qty: r.qty, loc: r.loc, id });
    const prev = products.get(id);
    if (prev) { prev.qty += r.qty; prev.nos.push(r.no); continue; }
    const c = r.kid ? cat.get(r.kid) : null, override = !!c && overrides.includes(r.kid);
    const p = { id, kid: r.kid || null, no: r.no, nos: [r.no], name: r.name, qty: r.qty, inCatalog: !!c, override };
    if (!c || override) Object.assign(p, { size: r.size, round: r.round, price: FREE_CONTRACTS.includes(r.contract) ? 0 : r.price, contract: r.contract, vendor: r.vendor, sub: subOf(r.name) });
    if (c) { const what = diffOf(r, c, catalog.subs); if (what.length) diffs.push({ kid: r.kid, no: r.no, name: r.name, catalog: c[1], what, override }); }
    products.set(id, p);
  }
  for (const k of overrides) if (!diffs.some(d => d.kid === k && d.override)) diffs.push({ kid: k, warn: '덮어쓰기 목록에 있지만 구입목록에 없거나 카탈로그와 차이가 없다' });
  return { products: [...products.values()], rows: outRows, diffs };
}
