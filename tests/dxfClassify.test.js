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

test('DXF_PARAMS는 §18.3의 표와 글자 그대로 같고 동결되어 있다', () => {
  expect(DXF_PARAMS).toEqual({
    roiCell: 5000, minSeg: 150, openFaceMin: 700, angTol: 0.75, offTol: 6, faceGap: 5200,
    tMin: 90, tMax: 500, minOverlap: 1000, modeBin: 5, modeTop: 6, modeSnapTop: 8, modeBoost: 2.5,
    modeSnap: 15, consume: 0.4, tieBand: 0.1, mergeGap: 5200, snap: 250, snapFinal: 30,
    extend: 4000, bridge: 3000, bridgeOffTol: 90, bridgeAngTol: 2.5, passes: 3,
    minWall: 250, minComp: 4, height: 3500, thickness: 200,
  });
  expect(Object.isFrozen(DXF_PARAMS)).toBe(true);
  expect(Object.keys(DXF_PARAMS)).toHaveLength(28);
});
