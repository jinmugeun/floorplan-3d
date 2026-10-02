// 창·문 블록 INSERT → 개구부(src/io/dxf/blockOpenings.js · 2026-09-30). 좌표는 앱 좌표(toApp = 그대로)이고
// 전개 도형에 explode의 ins 꼬리표를 직접 단다. INSERT 점(pos)은 일부러 멀리 둔다 — 블록 로컬 좌표가 base에서
// 수십만 mm 떨어진 실파일(DR-1800)처럼, 자리는 전개 도형에서만 읽어야 한다.
import { test, expect } from 'vitest';
import { blockOpenings, blockKind, OPEN_BLOCK } from '../src/io/dxf/blockOpenings.js';
import { buildOpenings } from '../src/io/dxf/openings.js';
import { makeWall } from '../src/geom/walls.js';

const A = makeWall({ a: [0, 0], b: [6000, 0], thickness: 200, height: 3500 });
const B = makeWall({ a: [0, 1000], b: [6000, 1000], thickness: 200, height: 3500 });   // 문짝이 닿는 평행 벽
const FAR = [-741000.5, 338000.25];
const seg = (x0, y0, x1, y1, ins, layer = 'WIN') => ({ a: [x0, y0], b: [x1, y1], layer, src: 'LINE', ins });
const exOf = (inserts, segs, arcs = []) => ({ inserts, segs, arcs, polyArcs: [], circles: [], texts: [], dims: [], hatches: [] });
const plan = { name: '1f plan-1', pos: [0, 0], rot: 0, scale: [1, 1], mirrored: false };

// 창 900: 창틀 선이 벽 몸통(y −67~67) 안에 있다.
const winSegs = (x0, ins) => [seg(x0, -67.5, x0 + 900, -67.5, ins), seg(x0, 67.5, x0 + 900, 67.5, ins), seg(x0 + 70, 0.5, x0 + 830, 0.5, ins), seg(x0, -67.5, x0, 67.5, ins), seg(x0 + 900, -67.5, x0 + 900, 67.5, ins)];
// 여닫이 900: 문틀은 벽 몸통, 문짝(열린 채 그린 선)은 벽 밖 +y로 1105까지 — 평행 벽 B의 몸통에 끝이 닿는다.
const doorSegs = (x0, ins) => [seg(x0, -100, x0, 100, ins, 'WID'), seg(x0 + 900, -100, x0 + 900, 100, ins, 'WID'), seg(x0 + 30, -100, x0 + 870, -100, ins, 'WID'),
  seg(x0 + 30, 100, x0 + 870, 100, ins, 'WID'), seg(x0 + 30, 100, x0 + 30, 940, ins, 'WID'), seg(x0 + 65, 100, x0 + 65, 940, ins, 'WID')];

test('블록 이름으로 종류를 가린다 — 포켓 미닫이·여닫이·창, 뒤에 "문"이 붙는 기구는 아니다', () => {
  expect(['문_슬라이딩 포켓 900', 'DR-1800', 'dr-1850', '문_여닫이 900', 'win-900-3', 'WIN-2400-2', '창_고정 600', '보냉고 양문1260-800', '식탁-4인'].map(blockKind))
    .toEqual(['pocket', 'door', 'door', 'door', 'window', 'window', 'window', null, null]);
  expect(OPEN_BLOCK.test('문_슬라이딩 포켓 800')).toBe(true);
  expect(OPEN_BLOCK.test('소독기 단문 1200-750')).toBe(false);
});

// 2026-10-02 내곡중: 창·문이 이름 있는 블록인데 한국 창호 표기라 하나도 읽지 못했다(개구부 0개).
// 창호 일람표의 기호(SD·FSD·SSD·ASD·WD·AD·PD + 폭 / AW·PW·SW·WW + 폭)와 우리말 이름(미서기단창_1300 · 방음문_2400)을 읽는다.
// 기구 이름의 "양문·단문"(보냉고 양문1260-800)은 문 블록이 아니다 — 문 종류를 가리키는 겹낱말(방화문·칸막이문…)만 본다.
test('한국 창호 표기의 블록 이름도 창·문으로 읽는다', () => {
  const kinds = names => names.map(blockKind);
  expect(kinds(['SD1100', 'FSD800', 'SSD1100', 'ASD1000', 'SD1100_폭150', 'WD-900', 'AD 1200', '방음문(시창형)_2400', '화장실칸막이문600', '방화문 1000', '자동문_1800']))
    .toEqual(Array(11).fill('door'));
  expect(kinds(['미서기단창_1300', '미서기단창_1300_화장실', '미서기단창_7800', '고정창 900', '프로젝트창_600', 'AW-1200', 'PW1500', '픽스창1800']))
    .toEqual(Array(8).fill('window'));
  expect(kinds(['미서기문_1800', '미닫이문 900'])).toEqual(['door', 'door']);
  // 아닌 것: 기구의 문 수(양문·단문) · 창고 · 뜻 없는 이름 · 폭 없는 영문 기호
  expect(kinds(['보냉고 양문1260-800', '소독기 단문 1200-750', '식품창고', '1층_방풍실_식당', 'A$C754401BD', 'SD', 'SDCARD', 'ADAPTER-100', '세면대 평면']))
    .toEqual(Array(9).fill(null));
});

test('INSERT 하나가 개구부 하나 — 자리는 전개 도형의 벽 방향 구간 가운데, 폭은 이름의 숫자다', () => {
  const inserts = [plan, { name: 'win-900-3', pos: FAR, rot: 0, scale: [1, 1], mirrored: false, parent: 0 },
    { name: 'HANDLE', pos: FAR, rot: 0, scale: [1, 1], mirrored: false, parent: 1 }];
  const segs = [...winSegs(1000.5, 1), seg(1440.5, 0.5, 1460.5, 0.5, 2), seg(0, 0, 6000, 0, 0, 'WAL')];
  const out = blockOpenings(exOf(inserts, segs), [A, B]);
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ kind: 'window', name: 'win-900-3', width: 900, wall: A });
  expect(out[0].t * 6000).toBeCloseTo(1450.5, 6);
});

test('여닫이는 문틀이 든 벽에 앉는다 — 열린 문짝이 닿는 평행 벽이 아니다', () => {
  const inserts = [plan, { name: 'DR-900', pos: FAR, rot: 0, scale: [1, 1], mirrored: false, parent: 0 }];
  const out = blockOpenings(exOf(inserts, doorSegs(3000.5, 1)), [B, A]);
  expect(out).toHaveLength(1);
  expect(out[0].wall).toBe(A);
  expect(out[0].t * 6000).toBeCloseTo(3450.5, 6);
});

// 실파일 문_슬라이딩 포켓 900: 블록은 1800 폭(문 900 + 벽 속 주머니 900)이고 문짝(벽과 나란한 긴 선)이 로컬 x 0~930에
// 있다. 거울 INSERT(xscale −1 → rot 180)에서도 문짝이 없는 쪽 절반이 개구부다.
test('포켓 미닫이는 문짝이 없는 쪽 절반이 개구부다(거울 INSERT 포함)', () => {
  const X = 5900.5;   // 로컬 x → 월드 x = X − lx (rot 180)
  const inserts = [plan, { name: '문_슬라이딩 포켓 900', pos: [X, 0], rot: 180, scale: [-1, 1], mirrored: true, parent: 0 }];
  const segs = [seg(X - 40, -50, X - 930, -50, 1, '04창호'), seg(X - 40, 50, X - 930, 50, 1, '04창호'), seg(X - 810, 0, X - 1750, 0, 1, '04창호'), seg(X - 1800, -30, X - 1800, 30, 1, '04창호'), seg(X, -30, X, 30, 1, '04창호')];
  const out = blockOpenings(exOf(inserts, segs), [A]);
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ kind: 'pocket', width: 900 });
  expect(out[0].t * 6000).toBeCloseTo(X - 1350, 6);        // 개구부 = 로컬 900~1800 = 월드 4100.5~5000.5
});

test('buildOpenings는 블록 개구부를 먼저 앉히고(종류별 제품 · 블록 폭), 같은 자리의 문 원호는 겹쳐 놓지 않는다', () => {
  const inserts = [plan, { name: 'win-900-3', pos: FAR, rot: 0, scale: [1, 1], mirrored: false, parent: 0 },
    { name: 'DR-900', pos: FAR, rot: 0, scale: [1, 1], mirrored: false, parent: 0 }, { name: 'win-4800-3', pos: FAR, rot: 0, scale: [1, 1], mirrored: false, parent: 0 }];
  const W = makeWall({ a: [0, 0], b: [12000, 0], thickness: 200, height: 3500 });
  const hinge = { c: [3030.5, 100], r: 870, a0: 0, a1: 90, layer: 'WID', block: 'DR-900', ins: 2 };
  const segs = [...winSegs(1000.5, 1), ...doorSegs(3000.5, 2), ...winSegs(5000.5, 3).map(s => ({ ...s, a: [s.a[0] === 5900.5 ? 9800.5 : s.a[0], s.a[1]], b: [s.b[0] === 5900.5 ? 9800.5 : s.b[0] === 5830.5 ? 9730.5 : s.b[0], s.b[1]] }))];
  const items = buildOpenings({ ex: exOf(inserts, segs, [hinge]), walls: [W], openingLayers: new Set(['WIN']) });
  expect(items.map(i => [i.productId, i.size[0]])).toEqual([['window-slide-1200', 900], ['door-swing-900', 900], ['window-slide-1800', 4800]]);
  [1450.5, 3450.5, 7400.5].forEach((c, k) => expect(items[k].t * 12000).toBeCloseTo(c, 3));
});

// 벽이 개구부 도중에 끝나면(꺾임·접합) 정확한 자리의 블록 개구부를 **옮기지 않고** 벽 안으로 자른다 — 옮기면 한쪽
// 문설주가 치수에서 어긋나고 이웃 개구부와 겹쳐 통째로 빠졌다(실파일 북쪽 외벽의 4800 창).
test('벽 끝을 넘는 블록 개구부는 옮기지 않고 벽 안(끝 여유 50 mm)으로 자른다', () => {
  const inserts = [plan, { name: 'win-900-3', pos: FAR, rot: 0, scale: [1, 1], mirrored: false, parent: 0 }];
  const W = makeWall({ a: [0, 0], b: [1700, 0], thickness: 200, height: 3500 });
  const items = buildOpenings({ ex: exOf(inserts, winSegs(1000.5, 1)), walls: [W], openingLayers: new Set() });
  expect(items).toHaveLength(1);
  expect(items[0].size[0]).toBe(600);                      // 1000.5 ~ 1650 → 50 mm 단위 내림
  expect(items[0].t * 1700).toBeCloseTo(1000.5 + 300, 0);   // 왼쪽 문설주는 제자리다
});
