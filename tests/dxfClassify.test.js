// §18.2. 이 파일의 표는 조사 §1.4의 실측 레이어 목록이다 — 자동 판정이 그 표와 어긋나면
// 검토 화면의 기본 체크가 틀린다(그리고 이 도면에서는 벽이 0개가 된다).
import { test, expect } from 'vitest';
import { LAYER_RULES, ROLE_LABEL, classifyLayer, layerStats, defaultChecked, roleLayers, layerHeight, heightHint } from '../src/io/dxf/classify.js';
import { DXF_PARAMS, HEIGHT_RANGE } from '../src/io/dxf/params.js';

// 실파일의 레이어 이름 32개 ↔ 조사 §1.4가 적은 역할.
const TABLE = [
  ['WAL', 'wall'], ['WAL-2', 'wall'], ['기존', 'wall'], ['FIN', 'wall'], ['ST-PL', 'wall'], ['BLO', 'wall'], ['COL', 'wall'],
  ['04창호', 'opening'], ['WIN', 'opening'],
  ['CEN', 'grid'], ['A-GUIDE', 'grid'],
  ['A-SHE', 'text'], ['TEXT2', 'text'],
  ['AZ-LEAL', 'dim'], ['DIMENSION', 'dim'],
  ['급식기구', 'equip'], ['급식-재사용', 'equip'], ['급식-기구구입', 'equip'], ['급식-미구입', 'equip'], ['후드', 'equip'],
  ['전기', 'mep'], ['급배수', 'mep'], ['트렌치', 'mep'], ['el-line', 'mep'], ['ELLINE', 'mep'],
  ['HAT', 'hatch'],
  ['WID', 'other'], ['ETC', 'other'], ['목재', 'other'], ['AZ-TABL', 'other'], ['Layer 1', 'other'], ['0', 'other'],
];

// doc/ex를 손으로 만든다: layers는 parse.js가 내는 Map, ex는 explode.js가 내는 묶음이다.
const layerRec = (name, color = 7, flags = 0) => [name, { name, color, ltype: '', flags, lw: -3 }];
const seg = (layer, len) => ({ a: [0.5, 0.25], b: [0.5 + len, 0.25], layer, src: 'LINE', depth: 0, block: null });
const docOf = (...recs) => ({ layers: new Map(recs) });
const exOf = ({ segs = [], arcs = [], circles = [], texts = [], dims = [], inserts = [] } = {}) => ({ segs, arcs, circles, texts, dims, inserts });

test('LAYER_RULES와 ROLE_LABEL은 §18.2가 적은 표 그대로다(앞의 규칙이 이긴다)', () => {
  expect(LAYER_RULES.map(r => r.role)).toEqual(['dim', 'text', 'opening', 'equip', 'mep', 'grid', 'hatch', 'wall', 'rail']);
  expect(LAYER_RULES[0].keys).toEqual(['dim', '치수', 'az-leal', 'az-leat', 'az-cutl', 'tol']);
  expect(LAYER_RULES[7].keys).toContain('기존');
  expect(LAYER_RULES[7].keys).toContain('st-pl');
  // 2026-10-12 계획 12 Task 5(classify.js 주석) · 'divider'는 최종 리뷰 X-1(정규화 DXF의 DIVIDER 구획선을 다시 긋는다) — 계획 13 Task 7부터
  // 부분 문자열 키가 아니라 정확 이름(exact · 최종 재리뷰 R-3)
  expect(LAYER_RULES[8]).toEqual({ role: 'rail', keys: ['栏杆', '난간', 'rail', 'handrail', '阳台', 'baclony'], exact: ['divider'] });
  expect(ROLE_LABEL).toEqual({ wall: '벽', opening: '개구부', equip: '기구', mep: '설비', dim: '치수', text: '문자', grid: '축선', hatch: '해치', rail: '난간', other: '기타' });
});

test('실파일 레이어 32개의 역할이 조사 §1.4와 일치한다', () => {
  expect(TABLE.map(([n]) => [n, classifyLayer(n)])).toEqual(TABLE);
  expect(classifyLayer('A-WALL')).toBe('wall');       // 정의만 있고 비어 있는 표준 이름도 벽으로 읽는다
  expect(classifyLayer('SYM')).toBe('other');         // 키워드로는 잡히지 않는다(도형 신호가 뒤집는다)
});

// 사전 검토 C-3: 실파일에서 도형 신호 ③에 걸리는 행은 셋인데 **뒤집혀야 하는 것은 SYM뿐**이다.
test('실파일의 도형 신호 세 행 — 이름이 개구부·기구면 통계가 뒤집지 못한다', () => {
  const rowsOf = (name, n, medLen) => layerStats(docOf(layerRec(name, 3)), exOf({ segs: Array.from({ length: n }, () => seg(name, medLen)) }))[0];
  const open = rowsOf('04창호', 3069, 12.5);
  expect([open.keyRole, open.role]).toEqual(['opening', 'opening']);   // ③에 걸려도 이름이 이긴다
  const equip = rowsOf('급식기구', 16789, 7.1);
  expect([equip.keyRole, equip.role]).toEqual(['equip', 'equip']);
  const sym = rowsOf('SYM', 15772, 1.0);
  expect([sym.keyRole, sym.role]).toEqual(['other', 'hatch']);         // §18.2가 근거로 든 그 하나
  // 개구부 이름은 문자·치수 신호보다도 앞선다(문 번호가 붙은 창호 레이어가 text로 새지 않는다).
  const withText = layerStats(docOf(layerRec('04창호', 3)), exOf({ segs: [seg('04창호', 900.5)], texts: [{ layer: '04창호' }, { layer: '04창호' }] }))[0];
  expect(withText.role).toBe('opening');
});

test('도형 신호 셋만 키워드를 뒤집는다(해치·치수·문자)', () => {
  // ③ 선분 > 1000 ∧ 길이 중앙값 < 20 mm → hatch. SYM(15,772 선분 · 중앙값 3 mm)이 그 자리다.
  const sym = Array.from({ length: 1001 }, () => seg('SYM', 3.5));
  const rows = layerStats(docOf(layerRec('SYM')), exOf({ segs: sym }));
  expect(rows[0].keyRole).toBe('other');
  expect(rows[0].role).toBe('hatch');
  expect(rows[0].medianSeg).toBeCloseTo(3.5, 6);
  // 선분이 1000개 이하면 뒤집지 않는다(증거 없는 승격을 더하지 않는다).
  const few = layerStats(docOf(layerRec('SYM')), exOf({ segs: sym.slice(0, 1000) }));
  expect(few[0].role).toBe('other');
  // ① DIMENSION 엔티티가 있으면 dim. ② 문자 > 선분이면 text.
  const dim = layerStats(docOf(layerRec('WAL')), exOf({ segs: [seg('WAL', 900.5)], dims: [{ layer: 'WAL' }] }));
  expect(dim[0].role).toBe('dim');
  const txt = layerStats(docOf(layerRec('WAL')), exOf({ segs: [seg('WAL', 900.5)], texts: [{ layer: 'WAL' }, { layer: 'WAL' }] }));
  expect(txt[0].role).toBe('text');
});

test('꺼짐(62 < 0)과 동결(70 & 1)은 off이고 기본 체크에서 빠진다', () => {
  // BLO·목재·각재는 실파일에서 flags = 2(새 뷰포트 동결)다 — 비트 1만 동결이므로 기본 체크에 남아야 한다(Task 4 리뷰 I-1).
  const doc = docOf(layerRec('WAL', 3), layerRec('CEN', -1), layerRec('기존', 9, 1), layerRec('BLO', 7, 2));
  const rows = layerStats(doc, exOf({ segs: [seg('WAL', 900.5), seg('CEN', 900.5), seg('기존', 900.5), seg('BLO', 700.25)] }));
  const by = Object.fromEntries(rows.map(r => [r.name, r]));
  expect(by.CEN.off).toBe(true);
  expect(by.CEN.frozen).toBe(false);
  expect(by.기존.off).toBe(true);
  expect(by.기존.frozen).toBe(true);
  expect(by.WAL.off).toBe(false);
  expect(by.BLO.frozen).toBe(false);
  expect(by.BLO.off).toBe(false);
  expect([...defaultChecked(rows)].sort()).toEqual(['BLO', 'WAL']);
});

test('기본 체크는 실파일에서 정확히 일곱 레이어다', () => {
  const walls = [['WAL', 242], ['FIN', 256], ['BLO', 78], ['WAL-2', 334], ['기존', 1353], ['COL', 14], ['ST-PL', 163]];
  const others = [['급식기구', 16789], ['04창호', 3069], ['전기', 1103], ['AZ-LEAL', 779]];
  const recs = [...walls, ...others].map(([n]) => layerRec(n, 3));
  recs.push(layerRec('CEN', -1), layerRec('WALL', 3), layerRec('A-WALL', 3));   // 꺼진 축선 · 원호만 있는 벽 이름 · 완전히 빈 정의
  const segs = [...walls, ...others].flatMap(([n, k]) => Array.from({ length: Math.min(k, 30) }, () => seg(n, 1200.5)));
  segs.push(seg('CEN', 30000.5));
  const rows = layerStats(docOf(...recs), exOf({ segs, arcs: [{ layer: 'WALL' }] }));
  expect([...defaultChecked(rows)].sort()).toEqual(['BLO', 'COL', 'FIN', 'ST-PL', 'WAL', 'WAL-2', '기존'].sort());
  expect(defaultChecked(rows).size).toBe(7);            // WALL은 원호만 있고 선분이 0개라 빠진다
  // 사전 검토 I-4: 도형이 하나도 없는 정의는 행 자체가 없다(체크리스트가 빈 줄로 덮이지 않는다).
  expect(rows.map(r => r.name)).toContain('WALL');
  expect(rows.map(r => r.name)).not.toContain('A-WALL');
  expect(rows.every(r => r.segs || r.arcs || r.circles || r.texts || r.dims || r.inserts)).toBe(true);
});

test('layerStats는 선분 수 내림차순이고 연장·중앙값을 잰다', () => {
  const rows = layerStats(
    docOf(layerRec('WAL', 3), layerRec('FIN', 150)),
    exOf({
      segs: [seg('WAL', 1000.5), seg('WAL', 3000.5), seg('WAL', 2000.5), seg('FIN', 250.25)],
      arcs: [{ layer: 'WAL' }], circles: [{ layer: 'FIN' }], inserts: [{ layer: 'FIN' }],
    }),
  );
  expect(rows.map(r => r.name)).toEqual(['WAL', 'FIN']);
  expect(rows[0].segs).toBe(3);
  expect(rows[0].medianSeg).toBeCloseTo(2000.5, 6);     // 정렬된 [1000.5, 2000.5, 3000.5]의 가운데
  expect(rows[0].lenM).toBeCloseTo(6.0, 1);             // 6001.5 mm → 6.0 m
  expect(rows[0].arcs).toBe(1);
  expect(rows[1]).toMatchObject({ name: 'FIN', color: 150, circles: 1, inserts: 1 });
  // 레이어 테이블에 없는데 도형만 있는 이름도 행을 얻는다(블록 안에서 만들어진 레이어).
  const ghost = layerStats(docOf(), exOf({ segs: [seg('GHOST', 500.5)] }));
  expect(ghost.map(r => r.name)).toEqual(['GHOST']);
  expect(ghost[0].color).toBe(7);
});

test('roleLayers는 역할로 걸러 내고 체크와 교집합을 낸다', () => {
  const rows = layerStats(
    docOf(layerRec('WAL', 3), layerRec('04창호', 4), layerRec('WIN', 4)),
    exOf({ segs: [seg('WAL', 900.5), seg('04창호', 900.5), seg('WIN', 900.5)] }),
  );
  expect([...roleLayers(rows, 'opening')].sort()).toEqual(['04창호', 'WIN']);
  expect([...roleLayers(rows, 'opening', { checked: new Set(['WIN', 'WAL']) })]).toEqual(['WIN']);
  expect([...roleLayers(rows, 'wall')]).toEqual(['WAL']);
});

// 2026-09-29 벽 띠 스윕으로 바뀐 표(params.js 머리 주석이 값마다 근거를 적는다). 옛 쌍 매칭·스냅 값
// (tMax·minOverlap·mode*·consume·tieBand·mergeGap·snap·snapFinal·bridgeOffTol·roiCell)은 지웠다.
test('DXF_PARAMS는 벽 띠 스윕의 표와 글자 그대로 같고 동결되어 있다', () => {
  expect(DXF_PARAMS).toEqual({
    minSeg: 150, openFaceMin: 700, angTol: 0.75, offTol: 6, faceGap: 20,
    tMin: 90, cavityMin: 150, bandGap: 520, bandMax: 700, bandTol: 60, bandBreak: 1000, runJoin: 5, jogTol: 20, spanEdge: 10, spanOverlap: 0.25,
    latticeMin: 5, latticePitch: 600, latticeTol: 0.3,
    bridge: 3000, bridgeAngTol: 2.5, gapMin: 600,
    colMin: 300, colMax: 1200, colAspect: 2.5, colRatio: 2, colTol: 3,
    extend: 4000, bareReach: 1000, joinMargin: 50, passes: 3, spur: 1000,
    refOut: 200, refGrid: 3, refCore: 60,
    minWall: 250, minComp: 4, minCompLen: 3000, blockShare: 0.1, height: 3500, thickness: 200,
    // 2026-10-12 외미닫이 문 기호(신상중 A-DOOR 실측 — params.js 주석)
    doorLeaf: [700, 1300], slideOffset: 200, slideArrowLen: [400, 600],
    // 2026-10-12 난간 구획선(공개 코퍼스 실측 — params.js 주석)
    railMin: 600, railSnap: 150, railPair: 300,
    // 2026-10-12 이름 구획선(옵션 · 계획 12 Task 6 — params.js 주석)
    dividerMinArea: 2_000_000,
    // 2026-10-12 기구 블록(계획 13 Task 2 — params.js 주석)
    equipMin: 150, equipMax: 8000, equipClash: 0.5,
    // 2026-10-13 기둥 접촉 깎기(계획 14 Task A — params.js 주석)
    equipTrim: 50,
    // 2026-10-13 정규화 DXF 기구(EQ-)의 영역 여유(계획 14 Task E 리뷰 I-1 — params.js 주석)
    equipRegionPad: 1000,
  });
  expect(Object.isFrozen(DXF_PARAMS)).toBe(true);
  expect(Object.isFrozen(DXF_PARAMS.doorLeaf) && Object.isFrozen(DXF_PARAMS.slideArrowLen)).toBe(true);   // 범위 배열도 얼어 있다
  expect(Object.keys(DXF_PARAMS)).toHaveLength(52);
});

// ── 2026-10-02 다른 사무소 도면 둘(신상중 · 내곡중)에서 드러난 판정 오류 ──────────────────────────
// 이중선 방(벽 두께 t)의 선분들: 바깥 사각형 w × h와 안쪽 사각형.
const rectSegs = (layer, x0, y0, w, h, extra = {}) => [
  [[x0, y0], [x0 + w, y0]], [[x0 + w, y0], [x0 + w, y0 + h]], [[x0 + w, y0 + h], [x0, y0 + h]], [[x0, y0 + h], [x0, y0]],
].map(([a, b]) => ({ a, b, layer, src: 'LINE', depth: 0, block: null, ...extra }));
const room = (layer, x0 = 0.5, y0 = 0.25, w = 9000, h = 6000, t = 200, extra = {}) =>
  [...rectSegs(layer, x0, y0, w, h, extra), ...rectSegs(layer, x0 + t, y0 + t, w - 2 * t, h - 2 * t, extra)];

// 내곡중: 선 14,829개가 든 유일한 레이어 `건축`에 DIMENSION이 19개 있다는 이유로 레이어 전체가 "치수"가 됐다.
test('치수 엔티티가 선분보다 적은 레이어는 치수 레이어가 아니다', () => {
  const segs = Array.from({ length: 30 }, () => seg('WAL', 900.5));
  const few = layerStats(docOf(layerRec('WAL')), exOf({ segs, dims: [{ layer: 'WAL' }, { layer: 'WAL' }] }));
  expect(few[0].role).toBe('wall');
  // 치수가 선분 이상이면(치수 전용 레이어) 예전처럼 dim이다.
  const pure = layerStats(docOf(layerRec('A1')), exOf({ segs: [seg('A1', 900.5)], dims: [{ layer: 'A1' }, { layer: 'A1' }] }));
  expect(pure[0].role).toBe('dim');
});

// 내곡중: 벽 키워드 레이어가 하나도 없다(모든 선이 `건축`). 이름으로 못 찾으면 **내용**으로 고른다 —
// 이름이 아무것도 말하지 않는(other) 레이어 가운데 평행 짝과 나란히 가는 긴 선이 가장 많은 레이어.
test('벽 키워드 레이어가 없으면 평행 짝이 가장 많은 이름 없는 레이어가 벽이다', () => {
  const doc = docOf(layerRec('건축', 8), layerRec('kitchen', 8), layerRec('실명', 1), layerRec('메모', 7));
  const segs = [...room('건축'), ...room('kitchen', 2000.5, 2000.25, 1200, 800, 100), seg('메모', 5000.5)];
  const rows = layerStats(doc, exOf({ segs, texts: [{ layer: '실명' }], dims: [{ layer: '건축' }] }));
  const by = Object.fromEntries(rows.map(r => [r.name, r]));
  expect([by.건축.keyRole, by.건축.role, by.건축.guessed]).toEqual(['other', 'wall', true]);
  expect(by.kitchen.role).toBe('equip');                 // 이름이 기구인 레이어는 짝이 있어도 벽이 아니다
  expect(by.메모.role).toBe('other');                     // 짝 없는 외줄은 벽이 아니다
  expect([...defaultChecked(rows)]).toEqual(['건축']);
  // 평행 짝이 훨씬 적은 다른 이름 없는 레이어(가장 많은 것의 1/4 미만)는 함께 올리지 않는다.
  const two = layerStats(docOf(layerRec('A1'), layerRec('A2')), exOf({ segs: [...room('A1', 0.5, 0.25, 30000, 20000), ...room('A2', 40000.5, 0.25, 1500, 1200, 100)] }));
  expect(two.filter(r => r.role === 'wall').map(r => r.name)).toEqual(['A1']);
  // 벽 키워드 레이어가 하나라도 있으면 내용으로 올리지 않는다(이름이 이긴다).
  const named = layerStats(docOf(layerRec('WAL'), layerRec('A1')), exOf({ segs: [...room('WAL'), ...room('A1', 20000.5)] }));
  expect(named.find(r => r.name === 'A1').role).toBe('other');
  expect(named.find(r => r.name === 'A1').guessed).toBeUndefined();
  // 짝이 하나도 없으면 아무것도 올리지 않는다(walls.js의 도형 추정 폴백으로 간다).
  expect([...defaultChecked(layerStats(docOf(layerRec('A1')), exOf({ segs: [seg('A1', 5000.5)] })))]).toEqual([]);
});

// 신상중: 창이 `WID`(역할 기타)에 있어 벽이 창 자리에서 끊겼다. 두 도면의 창호 레이어 여섯이 모두 청록(ACI 4)이었다 —
// 이름이 아무것도 말하지 않고, 선이 대부분 청록이고, 평행 짝(창틀)이 있으면 창호다. 외줄(신상중 `4` — 데크 윤곽)은 아니다.
test('이름 없는 레이어가 청록이고 평행 짝이 있으면 창호다(선 색이 레이어 색을 이긴다)', () => {
  const frame = (layer, extra) => room(layer, 0.5, 0.25, 9000, 6000, 100, extra);
  const doc = docOf(layerRec('WAL', 2), layerRec('WID', 4), layerRec('4', 4), layerRec('X', 3), layerRec('Y', 4));
  const segs = [
    ...room('WAL', 20000.5), ...frame('WID'), seg('4', 9000.5), seg('4', 7000.5),
    ...frame('X', { color: 4 }),            // 레이어는 초록이지만 선마다 청록을 줬다
    ...frame('Y', { color: 9 }),            // 레이어는 청록이지만 선은 회색(사동중 WID: 문 블록 선)
  ];
  const by = Object.fromEntries(layerStats(doc, exOf({ segs })).map(r => [r.name, r]));
  expect([by.WID.role, by.WID.byColor]).toEqual(['opening', true]);
  expect(by.X.role).toBe('opening');
  expect(by.Y.role).toBe('other');
  expect(by['4'].role).toBe('other');
  expect(by.WAL.role).toBe('wall');
  expect(by.WID.cyan).toBe(8);
});

// 2026-10-12 계획 12 Task 4(사전 검토 반영): 공개 코퍼스(WeiyaChen/CAD_rule_checker)의 `DOTE`는 TArch 축선 레이어다 — 2suite (1) 선 65개 ·
// 길이 중앙값 3,000 mm · 6suite (6) 33개 · 18,266 mm, 둘 다 꺼짐. 이름이 아무것도 말하지 않던(other) 탓에 켜진 도면에서는 청록이면 창호로,
// 벽 레이어가 없으면 축선 격자가 벽으로 올라갈 수 있었다(축선은 건물 끝에서 끝까지 3~18 m라 평행 짝이 길다).
test('DOTE(TArch 축선)는 축선이다 — 청록 평행 짝이 있어도 창호·벽으로 올리지 않는다', () => {
  expect(classifyLayer('DOTE')).toBe('grid');
  const cyan = layerStats(docOf(layerRec('WAL'), layerRec('DOTE', 4)), exOf({ segs: [...room('WAL', 20000.5), ...room('DOTE', 0.5, 0.25, 9000, 6000, 100)] }));
  expect(cyan.find(r => r.name === 'DOTE').role).toBe('grid');
  // 벽 이름 레이어가 없는 도면: 평행 짝이 가장 긴 것이 축선이어도 벽 추정은 이름 없는 레이어(A1)에서만 고른다.
  const guess = layerStats(docOf(layerRec('DOTE'), layerRec('A1')), exOf({ segs: [...room('DOTE', 0.5, 0.25, 30000, 20000), ...room('A1', 40000.5, 0.25, 9000, 6000)] }));
  const by = Object.fromEntries(guess.map(r => [r.name, r]));
  expect([by.DOTE.role, by.DOTE.guessed]).toEqual(['grid', undefined]);
  expect([by.A1.role, by.A1.guessed]).toEqual(['wall', true]);
});

// 2026-10-12 계획 12 Task 5: 공개 코퍼스의 난간·발코니 레이어 이름(실측 — classify.js 주석). 난간은 rail이고 기본 체크가 아니며(벽으로 세우지
// 않는다), `con` 키로 이미 벽인 BALCONY 계열은 그대로 벽이다(rail 규칙이 wall 뒤 — 그 도면들의 발코니는 이미 닫힌다).
test('난간·발코니 레이어: 栏杆·阳台·4-BACLONY·RAIL은 난간(rail), BALCONY·Balcony(阳台)·BACONY는 벽 그대로', () => {
  const rail = ['栏杆', '0-栏杆', '阳台栏杆SHUTTER', 'P平面－栏杆栏杆', '屋顶轮廓阳台', '阳台', '阳台露台', '4-BACLONY', 'RAIL', 'HANDRAIL', 'A-난간'];
  expect(rail.map(n => [n, classifyLayer(n)])).toEqual(rail.map(n => [n, 'rail']));
  expect(['BALCONY', 'Balcony(阳台)', 'BACONY'].map(classifyLayer)).toEqual(['wall', 'wall', 'wall']);
  expect(classifyLayer('L-LANGAN')).toBe('other');          // 병음 표기(4suite (5) · 빈 변 1)는 키가 아니다
  // 난간 레이어는 기본 체크(벽)가 아니고, roleLayers(rows, 'rail')로 모인다. 내용으로 고치기(청록 창호·벽 추정)도 이름이 other인 것만 본다.
  const rows = layerStats(docOf(layerRec('WAL'), layerRec('栏杆', 4), layerRec('阳台', 4, 1)),
    exOf({ segs: [...room('WAL', 20000.5), ...room('栏杆', 0.5, 0.25, 9000, 6000, 100), ...room('阳台', 0.5, 9000.25, 9000, 6000, 100)] }));
  const by = Object.fromEntries(rows.map(r => [r.name, r]));
  expect([by['栏杆'].role, by['栏杆'].byColor, by['栏杆'].guessed]).toEqual(['rail', undefined, undefined]);
  expect([...defaultChecked(rows)]).toEqual(['WAL']);
  expect([...roleLayers(rows, 'rail')]).toEqual(['栏杆']);   // 꺼진(동결) 阳台는 빠진다
});

// 2026-10-12 계획 13 Task 7(계획 12 최종 재리뷰 R-3): `divider`는 우리 내보내기의 구획선 레이어 `DIVIDER` 하나만 난간으로 읽는다(대소문자 ·
// 앞뒤 공백 무시). 부분 문자열이면 "TOILET DIVIDER"(화장실 칸막이)·"ROOM DIVIDER" 같은 남의 레이어가 벽 두 곳에 닿을 때 구획선이 되어 헛방을
// 만든다 — 그런 이름은 예전처럼 나머지 규칙으로 간다. 다른 난간 키(栏杆·rail …)는 부분 문자열 그대로다.
test('divider는 정확 이름만: DIVIDER·divider·" Divider "는 난간, MY-DIVIDERS·TOILET DIVIDER·DIVIDER-PANEL은 아니다', () => {
  expect(['DIVIDER', 'divider', ' Divider '].map(classifyLayer)).toEqual(['rail', 'rail', 'rail']);
  expect(['MY-DIVIDERS', 'TOILET DIVIDER', 'ROOM DIVIDER', 'DIVIDER-PANEL'].map(classifyLayer)).toEqual(['other', 'other', 'other', 'other']);
  expect(['A-RAIL-DIVIDER', 'HANDRAIL-2'].map(classifyLayer)).toEqual(['rail', 'rail']);   // 부분 문자열 키(rail)는 그대로 — divider와 상관없이
});

// 2026-10-13 계획 16 Task A: 레이어 이름의 높이 꼬리(아키스케치 CAD 업로드의 `wall_2800` 규칙 · 조사 2026-10-13-research-rea-archisketch.md §1.1).
test('레이어 이름 끝 _높이(2000~8000)는 그 레이어 벽의 높이다 — 아키스케치 wall_2800 규칙과 같다', () => {
  expect(HEIGHT_RANGE).toEqual([2000, 8000]);
  expect(layerHeight('WALL_2800')).toBe(2800);
  expect(layerHeight('wall_2800')).toBe(2800);
  expect(layerHeight(' A-WALL_3500 ')).toBe(3500);           // 앞뒤 공백은 이름이 아니다
  expect(layerHeight('WALL-2')).toBeNull();                  // 우리 내보내기의 둘째 벽 레이어 — 꼬리가 아니다
  expect(layerHeight('WALL_280')).toBeNull();                // 세 자리라도 범위 밖
  expect(layerHeight('BLO_1000')).toBeNull();                // 범위 아래(도면 번호 꼴)
  expect(layerHeight('WALL_9000')).toBeNull();               // 범위 위
  expect(layerHeight('WALL_2800A')).toBeNull();              // 끝이 아니다
  expect(layerHeight(null)).toBeNull();
});

test('layerStats 행은 height를 갖고, heightHint는 체크된 벽 레이어 중 선분이 가장 많은 것의 높이를 고른다', () => {
  const doc = { layers: new Map([['WALL_2800', { color: 7, flags: 0 }], ['COL_3000', { color: 7, flags: 0 }], ['TEXT_2500', { color: 7, flags: 0 }]]) };
  const seg = (layer, n) => Array.from({ length: n }, (_, i) => ({ a: [i * 1000, 0], b: [i * 1000 + 900, 0], layer }));
  const ex = { segs: [...seg('WALL_2800', 5), ...seg('COL_3000', 2)], texts: Array.from({ length: 3 }, () => ({ layer: 'TEXT_2500' })) };
  const rows = layerStats(doc, ex);
  const by = Object.fromEntries(rows.map(r => [r.name, r]));
  expect(by.WALL_2800).toMatchObject({ role: 'wall', height: 2800 });
  expect(by.COL_3000).toMatchObject({ role: 'wall', height: 3000 });
  expect(by.TEXT_2500).toMatchObject({ role: 'text', height: 2500 });       // 행에는 달린다 — 쓰는 쪽이 벽만 본다
  expect(heightHint(rows, new Set(['WALL_2800', 'COL_3000']))).toEqual({ height: 2800, layer: 'WALL_2800' });
  expect(heightHint(rows, new Set(['COL_3000']))).toEqual({ height: 3000, layer: 'COL_3000' });
  expect(heightHint(rows, new Set(['TEXT_2500']))).toBeNull();            // 문자 레이어는 층고가 아니다
  expect(heightHint(rows, new Set())).toBeNull();
});
