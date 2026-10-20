// 엑셀 급식기구 카탈로그(계획 17 Task 3). 원자료(kitchenData.js — tools/products/excel-to-catalog.mjs가 만든다)를 규칙(kitchenRules.js)으로
// 펼쳐 제품이 된다. 앱 시작 때 한 번(495행 · 수 ms). 카탈로그(catalog.js)가 [남는 기존 제품 · 이것 · 숨김 단종]으로 합친다.
// 기존 제품 → 엑셀 제품 대응(LEGACY_TO_KITCHEN · kitchenFor · kitchenFit)도 여기 있다: 템플릿·샘플·DXF 어휘가 "옛 id 대신 어느 엑셀 제품인가"를 묻는다.
// 대응 규칙: 후보 = 세부품명이 맞고(이름 정규식이 있으면 이름도) → 크기가 가장 가까운 것. 거리 = Σ|ln(a/b)|(정렬한 긴 변·짧은 변·높이) — 비율이라 큰 기구와 작은 기구에 공평하고, 회전된 아이템 크기에도 같다.
// 같은 거리면 원자료 순서(엑셀 행 순서)의 앞이 이긴다 — 결과가 실행마다 같다. kitchenFit은 같은 열원 안에서만 고르고, 같은 거리면 원래 제품이 이긴다.
import data from './kitchenData.js';
import { expandRow, KITCHEN_CHIPS } from './kitchenRules.js';
import { LEGACY_PRODUCTS } from './catalogLegacy.js';

export const KITCHEN_PRODUCTS = data.rows.map(rec => expandRow(rec, data));
export const KITCHEN_PRICES = Object.fromEntries(KITCHEN_PRODUCTS.map(p => [p.id, p.price]));

// 칩(카테고리) 순서는 KITCHEN_CHIPS, 칩 안의 하위(세부품명)는 원자료에 처음 나온 순서.
export const KITCHEN_CATEGORIES = KITCHEN_CHIPS.map(name => ({ name, subs: [...new Set(KITCHEN_PRODUCTS.filter(p => p.category === name).map(p => p.sub))] }));

// 기존 id → [엑셀 세부품명 후보, 이름 정규식 | null]. 이름 정규식으로 거른 후보가 없으면 세부품명 후보 전부로 물러선다.
export const LEGACY_SUBS = {
  'sink-double': [['상업용싱크대'], /2조/], 'sink-single': [['상업용싱크대'], /1조/], washbasin: [['세면기'], /손세정대/],
  'range-gas-6': [['상업용가스레인지', '상업용전기레인지'], null], 'range-gas-3': [['상업용가스레인지', '상업용전기레인지'], null],
  'range-gas-high': [['상업용가스레인지'], /높은/], 'range-induction': [['상업용전기레인지'], null],
  'fridge-2door': [['냉장고'], /2도어/], 'fridge-kimchi': [['김치냉장고'], null], 'warmer-cabinet': [['상업용식품온장고'], null],
  dishwasher: [['상업용식기세척기'], /도어형/], 'dishwasher-conveyor': [['상업용식기세척기'], /컨베이어/],
  'ricecooker-gas': [['취반기'], /가스/], 'soup-kettle': [['국솥'], /회전/], 'wok-kettle': [['국솥'], /만능/],
  'griddle-electric': [['부침기'], /전기/], 'steamer-combi': [['상업용오븐'], /전기/], 'oven-built': [['상업용오븐'], null],
  'hood-box': [['상업용주방후드'], /^배기후드/], 'hood-box-filter': [['상업용주방후드'], /이중/], 'hood-wall': [['상업용주방후드'], null],
  'worktable-1800': [['상업용조리대'], /작업대/], 'serve-counter': [['배식대'], /반찬|배식대/], 'shelf-steel-4': [['식기건조대'], /선반/],
  'locker-12': [['사물함', '캐비닛'], null], 'cabinet-lower': [['캐비닛'], /낮은/], 'cabinet-upper': [['캐비닛'], null], bookshelf: [['캐비닛'], null],
  'dining-6': [['이동식스툴테이블'], /6인/], 'dining-4': [['이동식스툴테이블'], /4인/], 'desk-1400': [['책상'], null], 'meeting-table-2400': [['회의용탁자'], null],
  'chair-office': [['작업용의자', '접이식의자'], null], 'chair-dining': [['접이식의자'], null],
  'washer-drum': [['세탁건조기', '가정용세탁기'], /드럼/], dryer: [['세탁건조기'], /건조기/],
};

// 바닥 발자국은 방향과 무관하게 잰다: DXF·샘플 아이템은 회전된 채 [750, 1500, 850]처럼 크기를 든다(Task 8·9 계약 — 정렬한 [긴 변, 짧은 변, 높이]끼리).
const footprint = s => [Math.max(s[0], s[1]), Math.min(s[0], s[1]), s[2]];
const sizeGap = (a, b) => { const x = footprint(a), y = footprint(b); return [0, 1, 2].reduce((s, i) => s + Math.abs(Math.log(Math.max(1, x[i]) / Math.max(1, y[i]))), 0); };
// 후보 중 크기 최근접(같으면 앞). 후보가 없으면 null. start가 있으면 그것과 그 거리에서 시작해 더 가까운 것만 바꾼다(같으면 start).
function nearest(list, sizeMm, start = null) {
  let best = start, gap = start ? sizeGap(start.size, sizeMm) : Infinity;
  for (const p of list) { const g = sizeGap(p.size, sizeMm); if (g < gap) { best = p; gap = g; } }
  return best;
}

const byId = new Map(KITCHEN_PRODUCTS.map(p => [p.id, p]));
const legacyById = new Map(LEGACY_PRODUCTS.map(p => [p.id, p]));

// 크기로 쓸 수 있는가: 유한한 양수 세 개([w, d, h] mm).
const validSize = s => Array.isArray(s) && s.length === 3 && s.every(v => Number.isFinite(v) && v > 0);

// 기존 id + 크기 → 엑셀 제품 id | null(대응 표에 없는 id — 침대·소파·조명 등). 표에 있는 id는 언제나 풀린다:
// 크기가 잘못됐으면(null · 길이 2 · NaN · 0) 기존 제품 자기 크기로 고른다.
export function kitchenFor(legacyId, sizeMm) {
  const rule = LEGACY_SUBS[legacyId];
  if (!rule) return null;
  const [subs, re] = rule;
  const inSub = KITCHEN_PRODUCTS.filter(p => subs.includes(p.sub));
  const named = re ? inSub.filter(p => re.test(p.name)) : inSub;
  const own = legacyById.get(legacyId)?.size;
  const size = validSize(sizeMm) ? sizeMm : validSize(own) ? own : [900, 600, 850];
  return nearest(named.length ? named : inSub, size)?.id ?? null;
}

// 대표 대응(기존 제품 자기 크기 기준) — DXF 어휘·방 템플릿이 쓴다. 표의 모든 id가 풀려야 한다(tests/catalogKitchen.test.js).
export const LEGACY_TO_KITCHEN = Object.fromEntries(Object.keys(LEGACY_SUBS).map(id => [id, kitchenFor(id, legacyById.get(id)?.size)]).filter(([, v]) => v));

// 엑셀 제품 id + 아이템 크기 → 같은 세부품명·같은 형상(열원 equip.heat가 있으면 같은 열원 — 가스는 가스로 남는다) 안에서
// 크기가 가장 가까운 엑셀 제품 id(폭 1260 냉장고에 2도어가 아니라 4도어). 같은 거리면 원래 제품이 이긴다(자기 크기면 자기 자신).
// 엑셀 제품이 아니면 그대로 돌려준다(문·창·기둥·도면 기구·숨김 단종).
export function kitchenFit(productId, sizeMm) {
  const p = byId.get(productId);
  if (!p || !sizeMm) return productId;
  const heat = p.equip?.heat;
  return nearest(KITCHEN_PRODUCTS.filter(x => x.sub === p.sub && x.shape === p.shape && (!heat || x.equip?.heat === heat)), sizeMm, p).id;
}
