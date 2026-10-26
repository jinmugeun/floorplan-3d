// 이름 → 형상·옵션 규칙(계획 17 Task 2). 엑셀 규칙(src/products/kitchenRules.js)과 DXF '도면 기구'(equip-generic)가 같은 표를 쓴다 —
// 생성기는 세부품명으로 먼저 고르고 이름 규칙은 덮어쓰기에만 쓰며, 도면 기구는 이름 규칙만 쓴다(세부품명이 없다).
// 순수 모듈: three·스토어·DOM을 쓰지 않는다(카탈로그가 import한다 — UI 테스트가 three를 끌고 오지 않게 parts.js를 부르지 않는다).
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const SHAPE_FAMILIES = ['worktable', 'sink', 'range', 'kettle', 'ricecooker', 'oven', 'griddle', 'dishwasher', 'cabinet', 'hood',
  'rack', 'cart', 'counter', 'table', 'chair', 'machine', 'wallunit', 'panel', 'enclosure'];   // enclosure = 공기질 함체(2026-10-26 · 카탈로그 직접 지정)

// 앞 항목이 이긴다: 손소독기(벽부착)가 소독(캐비닛)보다, 야채세척기(기계)가 세척기(식기세척기)보다, 운반카가 배식대보다 먼저다.
export const NAME_SHAPES = [
  [/손세정|손세척|세정대|싱크|개수대|세면|잔반\s*처리대/, 'sink'],
  [/에어커튼|손소독기|워터릴|호스릴|배전함|분전함|스위치|소화기|살균수|벽걸이/, 'wallunit'],
  [/야채|구근|탈피|절단|믹서|슬라이싱|탈수|처리기|온수기|물끓이기|청소기|세단기|세탁기|세미기/, 'machine'],
  [/운반차|운반카|카트(?!리지)|돌리|트롤리|플랫폼|L형|회수차/, 'cart'], // '수저카트리지(소독기)'는 카트가 아니다
  [/후드/, 'hood'],
  [/식기세척기|컵.*세척기|세척기/, 'dishwasher'],
  [/렌지|레인지|인덕션\s*렌지/, 'range'],
  [/국솥|만능솥|회전솥/, 'kettle'],
  [/취반/, 'ricecooker'],
  [/오븐|스티머|발효기/, 'oven'],
  [/부침|그리들/, 'griddle'],
  [/배식대|배분대|디스펜서/, 'counter'],
  [/선반|건조대|랙/, 'rack'],
  [/냉장|냉동|보냉|보온|온장|소독|보관고|캐비닛|사물함|신발장|옷장|서랍/, 'cabinet'],
  [/작업대|검수대|조리대|받침대|파렛트|테이블겸용/, 'worktable'],
  [/식탁|테이블|책상|탁자/, 'table'],
  [/의자|스툴/, 'chair'],
  [/매트|발판|칸막이|가림판/, 'panel'],
];

export function shapeByName(name) {
  const s = String(name ?? '');
  for (const [re, shape] of NAME_SHAPES) if (re.test(s)) return shape;
  return null;
}

// 아주 얇은 물건은 판이다(책상 가림판 1600×15 · 칸막이 1200×45 · 발판소독기 높이 30). size = [w, d, h] mm.
export const isThin = ([w, d, h]) => Math.min(w, d) < 60 || h < 60;

// 이름에서 형상 옵션을 읽는다. size = [w, d, h] mm(이름에 수가 없을 때의 기본값 계산용). round = 규격이 Φ였다.
export function shapeOpts(shape, name, [w, d, h], { round = false } = {}) {
  const s = String(name ?? '');
  const n = (re, def) => { const m = re.exec(s); return m ? Number(m[1]) : def; };
  const o = {};
  if (shape === 'range') { o.burners = clamp(n(/(\d)\s*구/, Math.max(1, Math.round(w / 750))), 1, 6); if (/인덕션|전기/.test(s)) o.gas = false; }
  else if (shape === 'sink') { o.bowls = clamp(n(/(\d)\s*조/, n(/(\d)\s*인용/, n(/(\d)\s*구/, 1))), 1, 4); if (/담금/.test(s)) o.deep = true; }
  else if (shape === 'cabinet') {
    o.doors = clamp(n(/(\d)\s*도어/, w >= 1100 ? (h >= 1500 ? 4 : 2) : w >= 600 ? 2 : 1), 1, 6);
    if (/유리/.test(s)) o.glass = true;
    if (/이동/.test(s)) o.casters = true;
    if (/냉장|냉동|보냉|보온|온장|소독|보관고/.test(s)) o.panel = true;
  } else if (shape === 'ricecooker') o.tiers = clamp(n(/(\d)\s*단/, h > 1500 ? 4 : h > 1200 ? 3 : 2), 1, 6);
  else if (shape === 'rack') { o.tiers = clamp(n(/(\d)\s*단/, Math.max(2, Math.round(h / 450))), 2, 8); if (/이동|운반/.test(s)) o.casters = true; }
  else if (shape === 'counter') o.wells = clamp(n(/(\d)\s*찬/, n(/(\d)\s*구/, Math.max(1, Math.round(w / 450)))), 1, 8);
  else if (shape === 'kettle') { if (/회전/.test(s)) o.tilt = true; if (/사각/.test(s)) o.square = true; }
  else if (shape === 'griddle') { if (/후드형/.test(s)) o.hooded = true; }
  else if (shape === 'dishwasher') { if (/컨베이어|랙/.test(s) || w > 1800) o.conveyor = true; }
  else if (shape === 'table') { if (/식탁|스툴/.test(s)) o.stools = true; }
  else if (shape === 'worktable') { if (!/이동|보조|받침대|파렛트/.test(s)) o.splash = true; if (/찬장|하부도어/.test(s)) o.cabinet = true; }
  if (round && (shape === 'cart' || shape === 'machine')) o.round = true;
  return o;
}

// DXF '도면 기구'(equip-generic)의 형상: 이름 규칙 → 얇으면 판 → 그 밖은 기계. 크기는 아이템 크기.
export function genericSpec(item) {
  const size = item?.size ?? [600, 600, 600];
  const shape = isThin(size) ? 'panel' : shapeByName(item?.name) ?? 'machine';
  return { shape, opts: shapeOpts(shape, item?.name, size) };
}
