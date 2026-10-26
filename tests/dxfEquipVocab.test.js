// 기구 블록 이름 어휘표(src/io/dxf/equipVocab.js · 2026-10-12 계획 13 Task 2). 대표 이름은 세 도면(사동중·신상중·내곡중)의 실제 블록 이름이다
// (Task 1 진단 p13-task-1-report.md §6·§7 · 사전 검토 p13-preflight.md §3).
import { test, expect } from 'vitest';
import { EQUIP_VOCAB, EQUIP_SKIP, matchEquip, isSkipped, skipReason, cleanName, sizeInName, isAnonymous, isJunkName } from '../src/io/dxf/equipVocab.js';
import { productById } from '../src/products/catalog.js';
import { kitchenOr } from '../src/io/dxf/equipVocab.js';
import { LEGACY_TO_KITCHEN } from '../src/products/catalogKitchen.js';
// 2026-10-20 · 계획 17 Task 8: 어휘는 기존 이름으로 적고 엑셀 급식기구를 가리킨다(짝이 없으면 숨김 단종 id 그대로).
const K = kitchenOr;

test('어휘표의 모든 제품 id가 카탈로그에 있다', () => {
  expect(EQUIP_VOCAB.length).toBeGreaterThanOrEqual(40);
  for (const v of EQUIP_VOCAB) {
    expect(productById(v.productId), v.productId).toBeTruthy();
    expect(['floor', 'wall', 'ceiling'], String(v.keys)).toContain(v.attach);
    expect(v.height, String(v.keys)).toBeGreaterThan(0);
  }
  expect(EQUIP_SKIP.length).toBeGreaterThanOrEqual(5);
});

test('어휘의 대상: 엑셀에 짝이 있으면 엑셀 급식기구(k-), 없으면 숨김 단종 id 그대로(계획 17 Task 8 — 점수판 equipProd가 줄지 않게)', () => {
  expect(K('sink-double')).toBe(LEGACY_TO_KITCHEN['sink-double']);
  expect(K('sink-double')).toMatch(/^k-/);
  for (const id of ['tv-55', 'mirror-wall', 'toilet', 'aircon-stand', 'bench-1200']) expect(K(id), id).toBe(id);
  const ids = new Set(EQUIP_VOCAB.map(v => v.productId));
  for (const legacy of ['sink-double', 'sink-single', 'hood-box', 'fridge-2door', 'worktable-1800', 'shelf-steel-4', 'dining-6']) expect(ids.has(legacy), legacy).toBe(false);
  // Fix 1(2026-10-20): 엑셀을 가리키는 칸은 기존 id를 legacy로 함께 든다 — equipment.js가 kitchenFor(legacy, 크기, 이름)로 그 갈래 안에서 다시 고른다.
  // 일반 상자·짝 없는 숨김 id 칸은 legacy가 없다.
  for (const v of EQUIP_VOCAB) {
    if (v.productId.startsWith('k-')) expect(K(v.legacy), String(v.keys)).toBe(v.productId);
    else expect(v.legacy, String(v.keys)).toBeUndefined();
  }
  expect(matchEquip('고정식작업대 1500-750')).toMatchObject({ productId: K('worktable-1800'), legacy: 'worktable-1800' });
  expect(matchEquip('To양변기F(w)').legacy).toBeUndefined();
});

test('공기질 센서 함체: 외형도의 평면 블록(AQ_BOX_PLAN)과 한글 이름만 함체 — 입면 블록(정면·측면…)은 아니다', () => {
  for (const n of ['AQ_BOX_PLAN', '공기질 센서함체', '공기질함체-510']) expect(matchEquip(n), n).toEqual({ productId: 'aq-enclosure', height: 310, attach: 'wall', z: 1200 });
  for (const n of ['AQ_BOX_FRONT', 'AQ_BOX_SIDE_R', 'AQ_BOX_BACK', 'AQ_BOX_BOTTOM']) expect(matchEquip(n), n).toBeNull();
});

test('대표 이름이 기대 제품으로 간다(앞 항목이 이긴다)', () => {
  const want = {
    '세정대 2조 1500-750': K('sink-double'), '세정대 1조 900-750': K('sink-single'), '세정대 담금 1500-800': K('sink-double'), '수류담금세척기 TR1500S': K('sink-double'),
    'TR1800S': K('sink-double'), '개수대-600X600': K('sink-single'), 'To청소대A(w)': K('sink-single'),
    '냉장고 4도어 1100L 1260-850': K('fridge-2door'), '냉장고  6도어 1600L1900-850': K('fridge-2door'), '보냉고 양문1260-800': K('fridge-2door'),
    '냉장고 김치 LG 750-801-1797 402L': K('fridge-kimchi'), '보온고 양문1260-800': K('warmer-cabinet'), '소독기 단문 1200-750': K('warmer-cabinet'),
    '후드1500-1300': K('hood-box'), '후드 1500-1000': K('hood-box'),
    '취반기(전기)선경인케이 150인용 570x600x1460': K('ricecooker-gas'), '회전국솥 선경인케이 300인(전기) 1520-1120-850': K('soup-kettle'),
    '그리들 1500x750x970 선경인케이': K('griddle-electric'), '렌지 인덕션 3구 1500x750선경인케이': K('range-gas-6'), '오븐디판40단 1270-920-1965': K('steamer-combi'),
    '다단식선반 1500-750': K('shelf-steel-4'), '건조대이동식 1200-750': K('shelf-steel-4'), '고정식작업대 1500-750': K('worktable-1800'), '검수대1200': K('worktable-1800'),
    '수저식판배분대800-600': K('serve-counter'), '식탁6인': K('dining-6'), '식탁4인': K('dining-4'), '회의용테이블3인': K('meeting-table-2400'),
    'xref-전체평면도$0$책상L형1812': K('desk-1400'), '손세정대 500-370': K('washbasin'), 'To세면기A': K('washbasin'), 'To양변기F(w)': 'toilet',
    '청소도구보관함 700-800': K('locker-12'), '신발장소독620-450-1900': K('locker-12'), '컵자동세척기': K('dishwasher'),
    '세탁 건조기 700-830LG트롬': K('dryer'), '세탁기 삶기 450-540-809': K('washer-drum'),
    '워터릴': 'equip-generic', '에어커튼 890-222': 'equip-generic', '온수기 560-400': 'equip-generic', '운반차 소쿠리670': 'equip-generic', 'To소변기H(w)': 'equip-generic',
  };
  const got = Object.fromEntries(Object.keys(want).map(n => [n, matchEquip(n)?.productId ?? null]));
  expect(got).toEqual(want);
});

test('부착면·높이·z: 어휘가 제품의 부착을 이긴다(손세정대는 바닥, 세면기는 벽)', () => {
  expect(matchEquip('손세정대 500-370')).toMatchObject({ productId: K('washbasin'), attach: 'floor', height: 850, z: 0 });
  expect(matchEquip('To세면기A')).toMatchObject({ productId: K('washbasin'), attach: 'wall', z: 800 });
  expect(matchEquip('워터릴')).toMatchObject({ attach: 'wall', height: 550, z: 1000 });
  expect(matchEquip('후드1500-1300')).toMatchObject({ productId: K('hood-box'), attach: 'ceiling', height: 600 });
  expect(matchEquip('식탁6인')).toMatchObject({ productId: K('dining-6'), size: 'product' });
  expect(matchEquip('다단식선반 1500-750')).toMatchObject({ attach: 'floor', height: 1800, z: 0 });
});

test('이름이 없거나 어휘에 없으면 null — 익명 블록은 어휘로 맞추지 않는다', () => {
  for (const n of ['500인-', 'zw$E75B', '*U266', 'A$C7BD14E8B', '', null]) expect(matchEquip(n), String(n)).toBeNull();
});

test('제외 어휘: 바닥 붙박이·기호·도면틀·개구부·복합 블록', () => {
  const want = {
    '육가': 'fixture', '그레이팅 600x600': 'fixture', '그레이팅600x1200-': 'fixture', '발판소독_매립형_HKMHP-900': 'fixture', '배수구1': 'fixture', '점자블럭': 'fixture', '중심선': 'fixture',
    'Z_DOT': 'symbol', '신발250': 'symbol', '넘버-1': 'symbol', 'key-6': 'symbol', '탑차': 'symbol', 'sssssssssssdfdfsa': 'symbol', '*B1206': 'symbol',
    '권-효성a3': 'frame', 'S-S3': 'frame',
    '포켓도어800': 'opening', '포켓도어900': 'opening',
    '1f plan-1': 'composite', 'afadfasdfasfd': 'composite',
    '1층_방풍실_식당': 'wallPiece',
  };
  expect(Object.fromEntries(Object.keys(want).map(n => [n, skipReason(n)]))).toEqual(want);
  for (const n of Object.keys(want)) expect(isSkipped(n), n).toBe(true);
});

// 2026-10-13 · 계획 14 최종 리뷰 X-4(M-F1): 내곡 `장애인화장실 대변기_평면`은 묶음이 아니라 변기 한 벌(1089×857 · 선 501개 · 내장 INSERT 없음 · 역할표도 equip)이다.
// 제외(composite)에서 빼면 afadfasdfasfd 묶음의 어휘 자식으로 세어져 변기로 선다(내곡 equip 15 → 17 · 제품 6 → 8 · 위생 10 → 12).
test('장애인화장실 대변기_평면은 제외가 아니고 변기다', () => {
  expect(skipReason('장애인화장실 대변기_평면')).toBeNull();
  expect(isSkipped('장애인화장실 대변기_평면')).toBe(false);
  expect(matchEquip('장애인화장실 대변기_평면')).toMatchObject({ productId: 'toilet', attach: 'floor', maxLong: 1200 });
});

// 사전 검토 3: "도어" 제외는 숫자 바로 뒤의 도어(문짝 수)를 보지 않는다 — 냉장고 4도어·6도어는 기구다.
test('냉장고 4도어·신발장은 제외가 아니다', () => {
  for (const n of ['냉장고 4도어 1100L 1260-850', '냉장고  6도어 1600L1900-850', '신발장소독620-450-1900', '세정대 2조 1500-750', 'zw$E75B']) {
    expect(isSkipped(n), n).toBe(false);
    expect(skipReason(n), n).toBeNull();
  }
});

test('이름 정리: _ → 공백, 끝의 -, 회사명(선경인케이·선경산업·선경·HK·LG·원더텍), xref 접두 — 치수 꼬리는 남긴다', () => {
  const want = {
    '세정대 2조 1500-750-': '세정대 2조 1500-750',
    '취반기(전기)선경인케이 150인용 570x600x1460': '취반기(전기) 150인용 570x600x1460',
    '곡물받침대hk 900-700': '곡물받침대 900-700',
    '곡물받침대 HK 900-700': '곡물받침대 900-700',
    '식기소독기_단문1500-750': '식기소독기 단문1500-750',
    '세탁 건조기 700-830LG트롬': '세탁 건조기 700-830',
    '냉장고 김치 LG 750-801-1797 402L': '냉장고 김치 750-801-1797 402L',
    '음식물처리기(원더텍)150KG 1350-830': '음식물처리기 150KG 1350-830',
    '소독기 550x600x1900 복합-선경산업': '소독기 550x600x1900 복합',
    '청소 소독기 700-600 선경': '청소 소독기 700-600',
    'xref-전체평면도$0$책상L형1812': '책상L형1812',
    '500인-': '500인',
    'HK-1200': '1200',                       // 앞의 회사명을 뺀 뒤 남는 앞머리 `-`도 뺀다(리뷰 Nit)
    'zw$E75B': 'zw$E75B',
  };
  expect(Object.fromEntries(Object.keys(want).map(n => [n, cleanName(n)]))).toEqual(want);
});

test('이름의 치수: W-D(-H)·WxDxH — 낱말에 붙은 수(4도어·200L·150인용·20kg)는 치수가 아니다', () => {
  expect(sizeInName('다단식선반 1500-750')).toEqual([1500, 750]);
  expect(sizeInName('취반기(전기)선경인케이 150인용 570x600x1460')).toEqual([570, 600, 1460]);
  expect(sizeInName('냉장고 4도어 1100L 1260-850')).toEqual([1260, 850]);
  expect(sizeInName('냉장고  6도어 1600L1900-850')).toEqual([1900, 850]);
  expect(sizeInName('그리들 1500x750x970 선경인케이')).toEqual([1500, 750, 970]);
  expect(sizeInName('개수대-600X600')).toEqual([600, 600]);
  expect(sizeInName('냉장고 200L 555-585')).toEqual([555, 585]);
  expect(sizeInName('구근탈피기 20kg 450-700')).toEqual([450, 700]);
  expect(sizeInName('음식물처리기(원더텍)150KG 1350-830')).toEqual([1350, 830]);
  expect(sizeInName('회전국솥 선경인케이 300인(전기) 1520-1120-850')).toEqual([1520, 1120, 850]);
  expect(sizeInName('후드 1500 x 1000')).toEqual([1500, 1000]);
  expect(sizeInName('냉장고 555-585L')).toBeNull();          // 깊이 자리의 수가 용량(L)이면 치수가 아니다
  expect(sizeInName('보냉고 1260-800-120인')).toEqual([1260, 800]);   // 높이 자리의 수가 인원이면 높이를 버린다
  for (const n of ['운반차 소쿠리670', 'HKMHP-1200-2', 'TR1800S', '12345-678', 'xref-전체평면도$0$책상L형1812', '', null]) expect(sizeInName(n), String(n)).toBeNull();
});

test('익명 블록 이름: zw$·A$C·*U·*B·$…와 자판 이름', () => {
  for (const n of ['zw$E75B', 'A$C754401BD', '*U513', '*B1206', '$0$zw$B716', 'sssssssssssdfdfsa', 'afadfasdfasfd', 'ffffffffffffff3f3f']) expect(isAnonymous(n), n).toBe(true);
  for (const n of ['식탁6인', 'TR1800S', 'S-S3', '워터릴', 'To세면기A']) expect(isAnonymous(n), n).toBe(false);
});

// 2026-10-13 · 계획 14 Task D(근거: 계획 13 최종 리뷰 F-11 — 공개 코퍼스 이름 라벨 803개 중 "1" ×16 · "66666" ×8 · "ccc" ×9 · "dwaddddd" ×7):
// 아무것도 말하지 않는 이름은 라벨을 달지 않는다(익명 블록처럼 제품 이름 그대로 · dxfBlock은 남는다).
test('쓰레기 이름(isJunkName): 글자 없음(숫자만·기호만) · 한 글자 · 같은 글자 3번 이상 · *로 시작', () => {
  const junk = ['1', '66666', '007', '1-2', '-', '...', '#', '(  )', 'ccc', 'CCC', 'ssssss', '가가가', 'dwaddddd', 'sssssssssssdfdfsa', 'ffffffffffffff3f3f',
    'A', 'q', 'ㅁ', '*U266', '*B1206', '*식탁', '', '   ', null, undefined];
  for (const n of junk) expect(isJunkName(n), String(n)).toBe(true);
  // 진짜 이름 — 치수의 0 셋(1000)은 반복이 아니다(글자 반복은 라틴 글자만 본다). 익명 블록(A$C·zw$)은 isAnonymous의 몫이다.
  // 리뷰 m-2: 여러 단어 이름은 라틴 3연속 규칙을 보지 않는다("Type III" · "AAA battery" — 공백을 지우면 단어가 이어져 III·AAA가 됐다).
  // 리뷰 m-3: 한자 하나·한글 음절 하나는 그 자체로 낱말이다(공개 코퍼스 "炉"(레인지) ×2 — 716 → 718). 자모(ㅁ)·라틴 한 글자는 그대로 쓰레기.
  const real = ['식탁6인', '세정대 2조 1500-750', '배식대 1000-700', '냉장고 4도어 1100L 1260-850', 'A$C754401BD', 'zw$E75B', 'TR1800S', 'S-S3', 'To세면기A',
    'toilet', 'INDEX1', 'LIFTD', '双人床', 'DT@STAIR', 'TYPE-III', 'cc', '6인', 'TV',
    'Type III', 'SINK TYPE III', 'AAA battery', '炉', '床', '솥', '가'];
  for (const n of real) expect(isJunkName(n), n).toBe(false);
});
