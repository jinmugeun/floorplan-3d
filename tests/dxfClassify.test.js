// §18.2. 이 파일의 표는 조사 §1.4의 실측 레이어 목록이다 — 자동 판정이 그 표와 어긋나면
// 검토 화면의 기본 체크가 틀린다(그리고 이 도면에서는 벽이 0개가 된다).
import { test, expect } from 'vitest';
import { LAYER_RULES, ROLE_LABEL, classifyLayer, layerStats, defaultChecked, roleLayers } from '../src/io/dxf/classify.js';
import { DXF_PARAMS } from '../src/io/dxf/params.js';

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
  expect(LAYER_RULES.map(r => r.role)).toEqual(['dim', 'text', 'opening', 'equip', 'mep', 'grid', 'hatch', 'wall']);
  expect(LAYER_RULES[0].keys).toEqual(['dim', '치수', 'az-leal', 'az-leat', 'az-cutl', 'tol']);
  expect(LAYER_RULES[7].keys).toContain('기존');
  expect(LAYER_RULES[7].keys).toContain('st-pl');
  expect(ROLE_LABEL).toEqual({ wall: '벽', opening: '개구부', equip: '기구', mep: '설비', dim: '치수', text: '문자', grid: '축선', hatch: '해치', other: '기타' });
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
    tMin: 90, cavityMin: 150, bandGap: 520, bandMax: 700, bandTol: 60, bandBreak: 1000, runJoin: 5, jogTol: 20,
    latticeMin: 5, latticePitch: 600, latticeTol: 0.3,
    bridge: 3000, bridgeAngTol: 2.5, gapMin: 600,
    colMin: 300, colMax: 1200, colAspect: 2.5, colRatio: 2, colTol: 3,
    extend: 4000, bareReach: 1000, joinMargin: 50, passes: 3, spur: 1000,
    minWall: 250, minComp: 4, minCompLen: 3000, blockShare: 0.1, height: 3500, thickness: 200,
  });
  expect(Object.isFrozen(DXF_PARAMS)).toBe(true);
  expect(Object.keys(DXF_PARAMS)).toHaveLength(35);
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
