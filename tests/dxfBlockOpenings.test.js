// 창·문 블록 INSERT → 개구부(src/io/dxf/blockOpenings.js · 2026-09-30). 좌표는 앱 좌표(toApp = 그대로)이고
// 전개 도형에 explode의 ins 꼬리표를 직접 단다. INSERT 점(pos)은 일부러 멀리 둔다 — 블록 로컬 좌표가 base에서
// 수십만 mm 떨어진 실파일(DR-1800)처럼, 자리는 전개 도형에서만 읽어야 한다.
import { test, expect } from 'vitest';
import { blockOpenings, blockBoxes, blockKind, blockKindByName, nominalWidth, isDoorBlock, OPEN_BLOCK } from '../src/io/dxf/blockOpenings.js';
import { buildOpenings } from '../src/io/dxf/openings.js';
import { makeWall } from '../src/geom/walls.js';
import { blockTruth, TRUTH_NAME_FIT } from '../tools/dxf-corpus/lib.mjs';
import { NAME_FIT } from '../src/io/dxf/blockOpenings.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

// 2026-10-12 · 계획 13 Task 6(a): 신상중 A의 `포켓도어800`(×8)·`포켓도어900`(×3)을 이름 규칙이 몰라 문 6개에 그쳤다(손 역할표로는 16 —
// 차이 +10은 전부 이 두 블록, p13-preflight §2). "포켓 + 도어 + 폭"이면 포켓 미닫이이고 폭은 이름의 숫자다. 기구의 "4도어"(냉장고 문 수)는 아니다.
test('포켓도어 + 폭 블록은 포켓 미닫이(폭은 이름) — 냉장고 4도어는 아니다', () => {
  const names = ['포켓도어800', '포켓 도어 900', '냉장고 4도어', '냉장고 4도어 1100L 1260-850', '포켓도어'];
  expect(names.map(blockKindByName)).toEqual(['pocket', 'pocket', null, null, null]);
  expect(names.map(blockKind)).toEqual(['pocket', 'pocket', null, null, null]);
  expect(['포켓도어800', '포켓 도어 900'].map(nominalWidth)).toEqual([800, 900]);
  expect(OPEN_BLOCK.test('포켓도어900')).toBe(true);
  expect(isDoorBlock('포켓도어800')).toBe(true);           // 역할표(pocket)의 isDoorBlock과 같은 답 — 문 호를 문으로 읽는다
  expect(isDoorBlock('냉장고 4도어 1100L 1260-850')).toBe(false);
  // 벽 위에 앉히면 포켓 미닫이 제품(door-pocket-900 — 크기는 이름 폭 800). 문짝 없는 틀이면 로컬 x0 쪽 절반이 주머니다.
  const W = makeWall({ a: [0, 0], b: [8000, 0], thickness: 200 });
  const items = buildOpenings({ ex: exOf(one('포켓도어800'), frame(2000, 1600, 1)), walls: [W], openingLayers: new Set() });
  expect(items.map(i => [i.productId, i.size[0], Math.round(i.t * 8000)])).toEqual([['door-pocket-900', 800, 3200]]);
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

// 실파일 문_슬라이딩 포켓 900: 블록은 1800 폭(문 900 + 벽 속 주머니 900)이다. 문짝(벽과 나란한 긴 선)이 있는 쪽 절반이
// 주머니이고 개구부는 반대쪽 절반이다. 거울 INSERT(xscale −1 → rot 180)에서도 같다.
// 2026-10-06 최종 리뷰: 문짝을 로컬 x 0~930(실파일 그대로)에 두면 기대값이 "문짝 없음" 기본값(로컬 x0 쪽이 주머니)과 같아 문짝을
// 읽는지 시험하지 못했다 — 블록을 로컬 x 900에서 뒤집어 문짝(y ±50)을 로컬 870~1760, 가운데 선을 50~990에 둔다.
test('포켓 미닫이는 문짝이 없는 쪽 절반이 개구부다(거울 INSERT 포함)', () => {
  const X = 5900.5;   // 로컬 x → 월드 x = X − lx (rot 180)
  const inserts = [plan, { name: '문_슬라이딩 포켓 900', pos: [X, 0], rot: 180, scale: [-1, 1], mirrored: true, parent: 0 }];
  const segs = [seg(X - 870, -50, X - 1760, -50, 1, '04창호'), seg(X - 870, 50, X - 1760, 50, 1, '04창호'), seg(X - 50, 0, X - 990, 0, 1, '04창호'), seg(X - 1800, -30, X - 1800, 30, 1, '04창호'), seg(X, -30, X, 30, 1, '04창호')];
  const out = blockOpenings(exOf(inserts, segs), [A]);
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ kind: 'pocket', width: 900 });
  expect(out[0].t * 6000).toBeCloseTo(X - 450, 6);         // 주머니 = 문짝 쪽 로컬 900~1800 → 개구부 = 로컬 0~900 = 월드 5000.5~5900.5
  const items = buildOpenings({ ex: exOf(inserts, segs), walls: [A], toApp: p => p, openingLayers: new Set(['04창호']) });
  expect(items).toHaveLength(1);
  expect(items[0].productId).toBe('door-pocket-900');
  expect(items[0].size[0]).toBe(900);
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

// 2026-10-02 내곡중 남자휴게실 ↔ 화장실: 문은 하나인데 둘이 됐다. 블록 SD850은 다른 문 블록(SD1100…)과 달리 **로컬 y축이
// 벽 방향**으로 그려져 있었다 — 로컬 x(= 열린 문짝 방향)와 나란한 벽을 찾아, 문짝이 기대어 선 옆 벽에 문이 앉았다(진짜 자리는
// 벽 틈 경로가 따로 문을 앉혔다). 문틀은 벽 몸통을 가로질러(중심선 양쪽에) 놓이고, 기대어 선 문짝은 벽의 한쪽에만 있다:
// 로컬 x 쪽 벽에 도형이 한쪽에만 있고 수직 방향 벽에 양쪽으로 있으면 수직 방향이 벽 방향이다.
test('여닫이: 블록의 로컬 x가 벽 방향이 아니어도 문틀이 가로지르는 벽에 앉는다', () => {
  const C = makeWall({ a: [2990, 0], b: [2990, 1000], thickness: 200, height: 3500 });      // 열린 문짝이 기대어 선 옆 벽
  const s = (x0, y0, x1, y1) => seg(x0, y0, x1, y1, 1, '건축');
  const segs = [s(2000, -100, 2000, 100), s(2850, -100, 2850, 100), s(2030, -100, 2820, -100), s(2030, 100, 2820, 100),      // 문틀(벽 A 안)
    s(2855, 100, 2855, 950), s(2890, 100, 2890, 950), s(2855, 950, 2890, 950), s(2840, 600, 2855, 600), s(2890, 600, 2905, 600)];   // 문짝 + 손잡이(벽 C 옆)
  const inserts = [plan, { name: 'SD850', pos: FAR, rot: 90, scale: [1, 1], mirrored: false, parent: 0 }];
  const out = blockOpenings(exOf(inserts, segs), [A, B, C]);
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ kind: 'door', name: 'SD850', width: 850, wall: A });
  expect(out[0].t).toBeCloseTo(2452.5 / 6000, 6);           // 벽 방향 구간 2000~2905의 가운데(손잡이 끝까지)
  // 로컬 x가 벽 방향인 블록은 그대로다(문짝이 옆 벽에 기대어 있어도)
  const turned = [plan, { name: 'SD850', pos: FAR, rot: 0, scale: [1, 1], mirrored: false, parent: 0 }];
  expect(blockOpenings(exOf(turned, segs), [A, B, C])[0].wall).toBe(A);
});

// 2026-10-06: 창·문 INSERT 하나의 전개 도형 bbox(DXF 좌표)를 코퍼스 점수판(정답 자리)과 벽 구간화(창 도중 경계)가 같이 쓴다.
// 자식 INSERT(HANDLE)의 호 중심은 창틀 상자 밖(x 1950.5)에 두어, 자식 도형이 정말 상자에 드는지 본다.
test('blockBoxes는 안쪽(자기 이름이 창·문이면 자기) 창·문 INSERT마다 자식 도형까지 모은 bbox와 호칭 폭을 낸다', () => {
  const inserts = [plan, { name: 'win-900-3', pos: FAR, rot: 0, scale: [1, 1], mirrored: false, parent: 0 },
    { name: 'HANDLE', pos: FAR, rot: 0, scale: [1, 1], mirrored: false, parent: 1 }, { name: '식탁-4인', pos: FAR, rot: 0, scale: [1, 1], mirrored: false, parent: 0 }];
  const segs = [...winSegs(1000.5, 1), seg(1440.5, 0.5, 1460.5, 0.5, 2), seg(0, 0, 6000, 0, 0, 'WAL'), seg(0, 0, 100, 100, 3, 'FUR')];
  const boxes = blockBoxes(exOf(inserts, segs, [{ c: [1950.5, 10], r: 5, ins: 2 }]));
  expect(boxes).toEqual([{ k: 1, kind: 'window', name: 'win-900-3', width: 900, box: [1000.5, -67.5, 1950.5, 67.5] }]);
  expect(blockBoxes(exOf([], []))).toEqual([]);
});

// 2026-10-06: ins 꼬리표가 inserts 밖을 가리키면 주인이 undefined다 — `k < 0`만 보면 그대로 지나가 ins[undefined].name에서 던졌다.
// 두 함수 모두 그런 도형을 건너뛰고(던지지 않고, 상자·개구부를 만들지 않고) 나머지는 그대로 낸다.
test('inserts 밖을 가리키는 ins 꼬리표는 blockBoxes·blockOpenings 모두 건너뛴다', () => {
  const inserts = [plan, { name: 'win-900-3', pos: FAR, rot: 0, scale: [1, 1], mirrored: false, parent: 0 }];
  const ex = exOf(inserts, [...winSegs(1000.5, 1), seg(3000.5, 0.5, 3100.5, 0.5, 7)], [{ c: [3050.5, 10], r: 5, ins: 9 }]);
  expect(blockBoxes(ex)).toEqual([{ k: 1, kind: 'window', name: 'win-900-3', width: 900, box: [1000.5, -67.5, 1900.5, 67.5] }]);
  const out = blockOpenings(ex, [A, B]);
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ kind: 'window', name: 'win-900-3', width: 900, wall: A });
  expect(out[0].t * 6000).toBeCloseTo(1450.5, 6);
});

// 2026-10-06: 로컬 y가 벽 방향인 블록은 문만이 아니다(2026-10-02 내곡중 SD850 규칙을 창·포켓에도). 세로 벽 V에 앉은 창인데 블록
// 로컬 x가 세로 벽을 가로지르는 방향이라, 로컬 x로 앉히면 호스트가 없어 창이 통째로 빠질 수 있었다(합성 테스트 — 코퍼스 넷에는 없다).
test('창·포켓 블록도 로컬 x 쪽 호스트가 없으면 수직 방향 벽에 앉는다', () => {
  const V = makeWall({ a: [3000, 0], b: [3000, 6000], thickness: 200, height: 3500 });
  const inserts = [plan, { name: 'AW-900', pos: FAR, rot: 0, scale: [1, 1], mirrored: false, parent: 0 },
    { name: '문_슬라이딩 포켓 900', pos: FAR, rot: 0, scale: [1, 1], mirrored: false, parent: 0 }];
  // 창틀(x 2932.5~3067.5): 벽 V의 중심선(x 3000)을 가로지르는 선 + 유리선. 로컬 x = 월드 x(rot 0)인데 벽은 y 방향이다.
  const win = [seg(2932.5, 1000, 2932.5, 1900, 1), seg(3067.5, 1000, 3067.5, 1900, 1), seg(2932.5, 1000, 3067.5, 1000, 1), seg(2932.5, 1900, 3067.5, 1900, 1), seg(3000.5, 1070, 3000.5, 1830, 1)];
  // 포켓(y 3000~4800): 문틀(가로지름) + 문짝(벽과 나란한 긴 선)이 y 3870~4760 — 문짝 쪽 절반(3900~4800)이 주머니, 개구부는
  // 반대쪽 y 3000~3900이다. 문짝을 위쪽 절반에 두어 "문짝 없음" 기본값(아래쪽 x0 절반이 주머니 → 4350)과 기대값이 갈린다(최종 리뷰).
  const pocket = [seg(2950, 3000, 3050, 3000, 2, '04창호'), seg(2950, 4800, 3050, 4800, 2, '04창호'), seg(2950, 3000, 2950, 4800, 2, '04창호'), seg(3050, 3000, 3050, 4800, 2, '04창호'), seg(3000, 3870, 3000, 4760, 2, '04창호')];
  const out = blockOpenings(exOf(inserts, [...win, ...pocket]), [A, V]);
  expect(out).toHaveLength(2);
  const w = out.find(o => o.kind === 'window'), p = out.find(o => o.kind === 'pocket');
  expect(w.wall).toBe(V); expect(w.width).toBe(900); expect(w.t * 6000).toBeCloseTo(1450, 0);
  expect(p.wall).toBe(V); expect(p.width).toBe(900); expect(p.t * 6000).toBeCloseTo(3450, 0);   // 문짝(3870~4760) 반대쪽 절반 3000~3900
});

// 2026-10-06 최종 리뷰 재현: 호스트가 있지만 가로지르지 않는 창은 수직 방향으로 넘어가면 안 된다 — 두꺼운 외벽(400)의 실내 쪽에만
// 그린 창(창틀 y 50~185)은 외벽 중심선 한쪽에만 있어 across가 아니고, 창 가운데 x 1450에서 T자로 붙는 칸막이 V(100)의 몸통에
// 멀리언 두 선(x 1430 · 1470)이 양쪽으로 걸려 V가 "가로지르는" 호스트가 됐다(폭 135 개구부가 칸막이에 앉고 외벽의 창이 빠졌다).
// 창·포켓은 호칭 폭이 수직 구간 폭의 0.4~1.1배일 때만 넘어간다(문은 그대로 — 내곡중 SD850·방음문).
test('창: 호스트가 있지만 가로지르지 않는 창은 호칭 폭이 수직 구간에 맞지 않으면 제 벽에 남는다', () => {
  const W1 = makeWall({ a: [0, 0], b: [6000, 0], thickness: 400 });
  const V = makeWall({ a: [1450, 0], b: [1450, 3000], thickness: 100 });
  const inserts = [plan, { name: 'win-900-3', pos: FAR, rot: 0, scale: [1, 1], mirrored: false, parent: 0 }];
  const segs = [seg(1000, 50, 1900, 50, 1), seg(1000, 185, 1900, 185, 1), seg(1000, 50, 1000, 185, 1), seg(1900, 50, 1900, 185, 1),
    seg(1430, 50, 1430, 185, 1), seg(1470, 50, 1470, 185, 1)];
  const out = blockOpenings(exOf(inserts, segs), [W1, V]);
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ kind: 'window', name: 'win-900-3', width: 900, wall: W1 });
  expect(out[0].t * 6000).toBeCloseTo(1450, 6);
});

// 2026-10-12 · 계획 12 Task 7 — 사동중 win-4800-3 둘째(T자 칸막이): 창 도중 x 1176986에 355 칸막이가 T자로 붙어 normalizeWalls가
// 외벽을 두 조각으로 가르고, 블록 경로가 창을 호스트 조각(2834) 안으로 잘라 2700만 앉혔다. 호스트 끝점을 **같은 방향·같은 두께**의
// 벽이 공유하면 넘친 만큼을 그 조각에 둘째 아이템으로 앉힌다(같은 제품 · 같은 openingGroup). 공유 접점에서는 OPENING_EDGE를
// 면제한다(아니면 1950 + 1950) — 먼 끝의 여유는 그대로 지킨다.
const winSpan = (x0, x1, ins) => [seg(x0, -67.5, x1, -67.5, ins), seg(x0, 67.5, x1, 67.5, ins), seg(x0 + 70, 0.5, x1 - 70, 0.5, ins), seg(x0, -67.5, x0, 67.5, ins), seg(x1, -67.5, x1, 67.5, ins)];
const winIns = name => [plan, { name, pos: FAR, rot: 0, scale: [1, 1], mirrored: false, parent: 0 }];
const T = makeWall({ a: [4000, 0], b: [4000, 3000], thickness: 100 });          // x 4000에 T자로 붙는 칸막이(같은 선이 아니다)

test('T자로 갈린 벽: 블록 창이 접점을 넘으면 같은 선 위 이웃 조각에 나머지를 이어 앉힌다(접점 여유 면제 · 같은 openingGroup)', () => {
  const W1 = makeWall({ a: [0, 0], b: [4000, 0], thickness: 200 });
  for (const W2 of [makeWall({ a: [4000, 0], b: [8000, 0], thickness: 200 }), makeWall({ a: [8000, 0], b: [4000, 0], thickness: 230 })]) {   // 이웃이 거꾸로여도 · 두께 ±60 안
    const items = buildOpenings({ ex: exOf(winIns('win-4000-3'), winSpan(2000, 6000, 1)), walls: [W1, W2, T], openingLayers: new Set() });
    expect(items.map(i => [i.productId, i.size[0], i.wallId])).toEqual([['window-slide-1800', 2000, W1.id], ['window-slide-1800', 2000, W2.id]]);
    expect(items[0].pos[0]).toBeCloseTo(3000, 6);
    expect(items[1].pos[0]).toBeCloseTo(5000, 6);
    expect(items[0].openingGroup).toBeTruthy();
    expect(items[1].openingGroup).toBe(items[0].openingGroup);
  }
});

// 사동중 그 창의 꼴(앱 좌표를 호스트 a = 0으로 옮김): 창 x −0.13 ~ 4799.87, 호스트 조각 0 ~ 2834의 a 끝은 외벽 꺾임(같은 선 이웃 없음),
// 2834에 칸막이가 T자로 붙고 이웃 조각이 2834 ~ 9434. 꺾임 쪽은 여유 50을 지키되 나뉜 조각은 50 mm 단위로 내리지 않는다 → 2784 + 1966 = 4750.
test('T자로 갈린 벽: 바깥 끝(꺾임)은 여유 50 mm를 지키고, 나뉜 조각은 50 mm 단위로 내리지 않는다(사동중 win-4800-3 둘째의 꼴)', () => {
  const W1 = makeWall({ a: [0, 0], b: [2834, 0], thickness: 360 }), W2 = makeWall({ a: [2834, 0], b: [9434, 0], thickness: 360 });
  const jog = makeWall({ a: [0, -196], b: [0, 0], thickness: 230 }), part = makeWall({ a: [2834, 0], b: [2834, 2171], thickness: 355 });
  // 칸막이(355 — 호스트 360과 ±60 안)를 이웃보다 앞에 둔다: 두께로는 못 거르고 방향 검사만이 칸막이를 거른다(리뷰 m-1).
  const items = buildOpenings({ ex: exOf(winIns('win-4800-3'), winSpan(-0.13, 4799.87, 1)), walls: [W1, part, W2, jog], openingLayers: new Set() });
  expect(items.map(i => [i.productId, i.size[0], i.wallId])).toEqual([['window-slide-1800', 2784, W1.id], ['window-slide-1800', 1966, W2.id]]);
  expect(items[0].pos[0]).toBeCloseTo(50 + 2784 / 2, 6);               // 꺾임에서 50 · 접점까지
  expect(items[1].pos[0]).toBeCloseTo((2834 + 4799.87) / 2, 6);         // 접점 ~ 창 끝(다 들어간다)
  expect(items[1].openingGroup).toBe(items[0].openingGroup);
});

test('T자로 갈린 벽: 두께가 다른 이웃(±60 밖)이나 300 mm 미만의 나머지는 잇지 않는다 — 지금처럼 호스트 안으로 자른다', () => {
  const W1 = makeWall({ a: [0, 0], b: [4000, 0], thickness: 200 });
  const thick = makeWall({ a: [4000, 0], b: [8000, 0], thickness: 400 });
  const a = buildOpenings({ ex: exOf(winIns('win-4000-3'), winSpan(2000, 6000, 1)), walls: [W1, thick, T], openingLayers: new Set() });
  expect(a.map(i => [i.productId, i.size[0], i.wallId])).toEqual([['window-slide-1800', 1950, W1.id]]);
  expect(a[0].pos[0]).toBeCloseTo(2000 + 1950 / 2, 6);
  expect(a[0].openingGroup).toBeUndefined();
  const W2 = makeWall({ a: [4000, 0], b: [8000, 0], thickness: 200 });
  const b = buildOpenings({ ex: exOf(winIns('win-2200-3'), winSpan(2000, 4200, 1)), walls: [W1, W2, T], openingLayers: new Set() });
  expect(b.map(i => [i.size[0], i.wallId])).toEqual([[1950, W1.id]]);       // 나머지 200 < 300 → 접점 여유를 지켜 1950
  expect(b[0].openingGroup).toBeUndefined();
});

// 리뷰 m-1(2026-10-12): 방향 검사가 시험되지 않았다 — 같은 두께의 칸막이가 접점에 혼자 T자로 붙어도, 같은 선이지만 호스트 위로 되돌아오는
// 벽이 접점을 공유해도 잇지 않는다(지금처럼 1950).
test('T자로 갈린 벽: 접점을 공유해도 방향이 다른 벽(같은 두께 칸막이 · 되돌아오는 벽)으로는 잇지 않는다', () => {
  const W1 = makeWall({ a: [0, 0], b: [4000, 0], thickness: 200 });
  for (const other of [makeWall({ a: [4000, 0], b: [4000, 3000], thickness: 200 }), makeWall({ a: [4000, 0], b: [4000, -3000], thickness: 200 }), makeWall({ a: [4000, 0], b: [3000, 0], thickness: 200 })]) {
    const items = buildOpenings({ ex: exOf(winIns('win-4000-3'), winSpan(2000, 6000, 1)), walls: [W1, other], openingLayers: new Set() });
    expect(items.map(i => [i.size[0], i.wallId, i.openingGroup])).toEqual([[1950, W1.id, undefined]]);
  }
});

// 리뷰 m-1: 조각 셋 사슬 — 0~2000 / 2000~3000 / 3000~6000에 창 1000~5000 → 1000 + 1000 + 2000, 한 무리(폭 합 = 블록 폭 · 바깥 끝은 다 들어간다).
// 리뷰 m-2: 두께는 호스트와 잰다 — 200 → 250 → 300이면 250(호스트와 50)까지만 잇고 300(호스트와 100)에서 멈춘다(바깥 끝 여유 50 · 내리지 않음 → 950).
test('T자로 갈린 벽: 같은 선 조각 셋에도 이어 앉히고, 두께는 앞 조각이 아니라 호스트와 잰다', () => {
  const Wa = makeWall({ a: [0, 0], b: [2000, 0], thickness: 200 });
  const run = (tb, tc) => {
    const Wb = makeWall({ a: [2000, 0], b: [3000, 0], thickness: tb }), Wc = makeWall({ a: [3000, 0], b: [6000, 0], thickness: tc });
    const items = buildOpenings({ ex: exOf(winIns('win-4000-3'), winSpan(1000, 5000, 1)), walls: [Wa, Wb, Wc], openingLayers: new Set() });
    return { items, ids: [Wa.id, Wb.id, Wc.id] };
  };
  const same = run(200, 200);
  expect(same.items.map(i => [i.size[0], i.wallId])).toEqual([[1000, same.ids[0]], [1000, same.ids[1]], [2000, same.ids[2]]]);
  expect(same.items.map(i => i.pos[0])).toEqual([1500, 2500, 4000]);
  expect(new Set(same.items.map(i => i.openingGroup)).size).toBe(1);
  expect(same.items[0].openingGroup).toBeTruthy();
  const drift = run(250, 300);
  expect(drift.items.map(i => [i.size[0], i.wallId])).toEqual([[1000, drift.ids[0]], [950, drift.ids[1]]]);
  expect(drift.items[1].openingGroup).toBe(drift.items[0].openingGroup);
});

// 리뷰 m-3(2026-10-12): 잇는 것은 창·포켓뿐이다 — 여닫이 문 한가운데에 벽이 T자로 붙으면 칸막이가 문길을 막는다. 문은 지금처럼 호스트 안으로 자른다.
test('T자로 갈린 벽: 여닫이 문 블록은 접점을 넘어도 잇지 않는다(호스트 안으로 잘라 하나 · 표지 없음)', () => {
  const W1 = makeWall({ a: [0, 0], b: [3450, 0], thickness: 200 }), W2 = makeWall({ a: [3450, 0], b: [8000, 0], thickness: 200 });
  const part = makeWall({ a: [3450, 0], b: [3450, -3000], thickness: 100 });
  const door = [plan, { name: 'DR-900', pos: FAR, rot: 0, scale: [1, 1], mirrored: false, parent: 0 }];
  const items = buildOpenings({ ex: exOf(door, doorSegs(3000.5, 1)), walls: [W1, W2, part], openingLayers: new Set() });
  expect(items.map(i => [i.productId, i.size[0], i.wallId, i.openingGroup])).toEqual([['door-swing-900', 350, W1.id, undefined]]);   // 3000.5 ~ 3400 → 50 mm 내림
  // 같은 자리의 창 블록은 잇는다(창 900 x 3000~3900 → 450 + 450).
  const win = buildOpenings({ ex: exOf(winIns('win-900-3'), winSpan(3000, 3900, 1)), walls: [W1, W2, part], openingLayers: new Set() });
  expect(win.map(i => [i.size[0], i.wallId])).toEqual([[450, W1.id], [450, W2.id]]);
  expect(win[1].openingGroup).toBe(win[0].openingGroup);
});

// 2026-10-12 · 계획 12 Task 3 리뷰(concern 1·2): 정규화 DXF의 `SLIDING-폭-두께`(외미닫이)와 `PASS-폭-두께`(문 없는 통로) 블록.
// 틀 사각형(폭 × 두께)을 벽 몸통에 놓는다 — 내보내기(io/dxfExport.js)가 쓰는 꼴 그대로다.
const frame = (x0, w, ins, t = 200) => [seg(x0, -t / 2, x0 + w, -t / 2, ins, 'OPENING'), seg(x0 + w, -t / 2, x0 + w, t / 2, ins, 'OPENING'),
  seg(x0 + w, t / 2, x0, t / 2, ins, 'OPENING'), seg(x0, t / 2, x0, -t / 2, ins, 'OPENING')];
const one = name => [plan, { name, pos: FAR, rot: 0, scale: [1, 1], mirrored: false, parent: 0 }];

// 2026-10-12 · 계획 12 최종 리뷰 X-3(M7-2): 접점 이어 앉히기(spanPieces)는 **창만**이다. 포켓은 blockOpenings가 문짝 반쪽으로 줄여 놓은
// 개구부라 접점에서 나누면 door-pocket이 둘(2D/3D 문짝 둘 · 견적 두 줄)이 됐다. 미닫이(slide)·여닫이도 문짝 하나라 잇지 않는다.
test('T자로 갈린 벽: 포켓·미닫이 블록은 접점을 넘어도 하나로 잘라 앉힌다(나누지 않음 · 표지 없음) — 창만 잇는다', () => {
  const W1 = makeWall({ a: [0, 0], b: [2400, 0], thickness: 200 }), W2 = makeWall({ a: [2400, 0], b: [8000, 0], thickness: 200 });
  const part = makeWall({ a: [2400, 0], b: [2400, 3000], thickness: 100 });
  for (const [name, id] of [['POCKET-900-200', 'door-pocket-900'], ['SLIDING-900-200', 'door-slide-900']]) {
    const items = buildOpenings({ ex: exOf(one(name), frame(2000, 900, 1)), walls: [W1, W2, part], openingLayers: new Set() });
    expect(items.map(i => [i.productId, i.size[0], i.wallId, i.openingGroup])).toEqual([[id, 350, W1.id, undefined]]);   // 2000 ~ 2350(접점 여유 50)
  }
  // 같은 자리의 창 블록은 잇는다(400 + 500 · 한 무리).
  const win = buildOpenings({ ex: exOf(one('WIN-900-200'), frame(2000, 900, 1)), walls: [W1, W2, part], openingLayers: new Set() });
  expect(win.map(i => [i.size[0], i.wallId])).toEqual([[400, W1.id], [500, W2.id]]);
  expect(win[1].openingGroup).toBe(win[0].openingGroup);
});

test('SLIDING- 블록은 미닫이문(slide), POCKET-은 그대로 포켓, PASS-는 통로 종류다', () => {
  expect(['SLIDING-900-200', 'sliding 1500', 'POCKET-900-200', '문_슬라이딩 포켓 900', 'PASS-1200-200', 'pass_900', 'PASSAGE', 'PASS'].map(blockKind))
    .toEqual(['slide', 'slide', 'pocket', 'pocket', 'pass', 'pass', null, null]);
  for (const n of ['SLIDING-900-200', 'PASS-1200-200']) expect(OPEN_BLOCK.test(n)).toBe(true);
  // SLIDE_BLOCK은 내보내기 형식(`SLIDING-<폭>-<두께>` · 숫자가 바로 붙는 꼴)만이다(2026-10-12 · 최종 리뷰 X-3 · N3-5) — 예전 `^sliding`은
  // "SLIDING WINDOW 1800" 같은 미서기창 블록까지 미닫이**문**으로 읽었다.
  expect(['SLIDING WINDOW 1800', 'Sliding Window', 'SLIDINGDOOR', 'sliding_1200'].map(blockKind)).toEqual([null, null, null, 'slide']);
  expect(OPEN_BLOCK.test('SLIDING WINDOW 1800')).toBe(false);
  const W = makeWall({ a: [0, 0], b: [8000, 0], thickness: 200 });
  const slide = buildOpenings({ ex: exOf(one('SLIDING-900-200'), frame(2000, 900, 1)), walls: [W], openingLayers: new Set() });
  expect(slide.map(i => [i.productId, i.size[0], Math.round(i.t * 8000)])).toEqual([['door-slide-900', 900, 2450]]);
  const pocket = buildOpenings({ ex: exOf(one('POCKET-900-200'), frame(2000, 900, 1)), walls: [W], openingLayers: new Set() });
  expect(pocket.map(i => [i.productId, i.size[0], Math.round(i.t * 8000)])).toEqual([['door-pocket-900', 900, 2450]]);
});

test('PASS- 블록은 블록 폭의 통로 하나이고, 같은 자리의 벽 틈 통로와 겹쳐 놓지 않는다', () => {
  const W = makeWall({ a: [0, 0], b: [8000, 0], thickness: 200 });
  const ex = exOf(one('PASS-1200-200'), frame(3000, 1200, 1));
  const block = buildOpenings({ ex, walls: [W], openingLayers: new Set() });
  expect(block.map(i => [i.productId, i.size[0], Math.round(i.t * 8000)])).toEqual([['opening-pass', 1200, 3600]]);
  const both = buildOpenings({ ex, walls: [W], openingLayers: new Set(), gaps: [{ p: [3600, 0], width: 1200 }] });
  expect(both.map(i => [i.productId, i.size[0]])).toEqual([['opening-pass', 1200]]);
  // 블록 없이 틈만 있으면 예전처럼 틈 통로다.
  expect(buildOpenings({ ex: exOf([plan], []), walls: [W], openingLayers: new Set(), gaps: [{ p: [3600, 0], width: 1200 }] }).map(i => i.productId)).toEqual(['opening-pass']);
});

// 2026-10-12 · 계획 13 Task 6(b) — 내곡중 SD1100_폭150(소모품창고): 문틀이 곧 벽 조각이다(벽 1130 · 문 1100 · 양쪽 15 mm). 블록이 벽 **안**에
// 있는데도 벽 끝 여유(OPENING_EDGE 50)로 1030까지 깎고 50 단위로 내려 1000이 됐다. 여유는 블록이 벽 끝을 **넘는** 쪽에만 둔다.
test('벽 안에 든 블록 개구부는 벽 끝 여유로 깎지 않는다 — 벽 끝을 넘는 쪽만 여유를 두고 자른다', () => {
  const W = makeWall({ a: [0, 0], b: [1130, 0], thickness: 200 });
  const inside = buildOpenings({ ex: exOf(one('SD1100'), frame(15, 1100, 1)), walls: [W], openingLayers: new Set() });
  expect(inside.map(i => [i.productId, i.size[0], Math.round(i.t * 1130)])).toEqual([['door-swing-1000', 1100, 565]]);
  // 끝을 넘으면(−40 ~ 1060) 넘는 쪽만 여유 50으로 자르고(50 ~ 1060 → 1010 → 50 단위 1000) 반대쪽 문설주(1060)는 제자리다.
  const over = buildOpenings({ ex: exOf(one('SD1100'), frame(-40, 1100, 1)), walls: [W], openingLayers: new Set() });
  expect(over.map(i => [i.size[0], Math.round(i.t * 1130)])).toEqual([[1000, 560]]);
});

// 2026-10-12 · 계획 13 Task 6(b) — 내곡중 `미서기단창_5200`(도형 3900)·`미서기단창_7800`(도형 5200): 블록 정의가 이름보다 좁게 그려졌고(INSERT 배율 1)
// 벽 면선도 정확히 도형 폭에서 끊긴다(문설주 선 37832·41732 / 39878·45078). 이름이 블록 도형 **전체**(상자의 긴 변)보다 NAME_FIT 위끝(1.1배) 넘게
// 넓으면 정답 폭은 도형 폭이다 — 파이프라인(blockOpenings의 plausible)이 이미 그렇게 앉힌다. 그 밖은 이름 그대로(ASD1000 상자 2200 · 방음문 2460 · SD850).
test('코퍼스 정답 폭: 이름이 블록 도형 전체보다 넓으면 도형 폭, 아니면 이름(단위 배율 반영)', async () => {
  const one2 = (name, x0, w, h, k = 1) => exOf(one(name), [seg(x0, 0, x0 + w, 0, 1), seg(x0 + w, 0, x0 + w, h, 1), seg(x0, h, x0 + w, h, 1), seg(x0, 0, x0, h, 1)].map(s => ({ ...s, a: s.a.map(v => v / k), b: s.b.map(v => v / k) })));
  const widths = async (ex, k) => (await blockTruth(ex, k)).map(t => [t.name, t.width]);
  expect(await widths(one2('미서기단창_5200', 0, 3900, 325))).toEqual([['미서기단창_5200', 3900]]);
  expect(await widths(one2('미서기단창_7800', 0, 325, 5200))).toEqual([['미서기단창_7800', 5200]]);
  expect(await widths(one2('미서기단창_1300', 0, 1300, 325))).toEqual([['미서기단창_1300', 1300]]);
  expect(await widths(one2('ASD1000', 0, 250, 2200))).toEqual([['ASD1000', 1000]]);
  expect(await widths(one2('SD850', 0, 880, 937))).toEqual([['SD850', 850]]);
  expect(await widths(one2('POCKET-900-200', 0, 1800, 200))).toEqual([['POCKET-900-200', 900]]);
  expect(await widths(one2('POCKET-900-200', 0, 1500, 200))).toEqual([['POCKET-900-200', 900]]);     // 1.1배 안
  expect(await widths(one2('pocket 2000', 0, 1600, 200))).toEqual([['pocket 2000', 800]]);           // 포켓은 도형의 절반(파이프라인과 같다)
  // 미터 도면(배율 1000): 상자 0.9 × 1000 = 900 → 이름 그대로
  expect(await widths(one2('win-900-3', 0, 900, 100, 1000), 1000)).toEqual([['win-900-3', 900]]);
  expect(await widths(one2('win-900-3', 0, 600, 100, 1000), 1000)).toEqual([['win-900-3', 600]]);
});

// 2026-10-12 · 계획 13 최종 리뷰 F-12(Task 6 리뷰 m-1): 정답이 파이프라인 상수 NAME_FIT을 import하면 상수를 고칠 때 정답과 파이프라인이 함께 움직여
// 점수판이 그 변화를 볼 수 없다. 정답은 자기 리터럴(TRUTH_NAME_FIT)을 쓰고, 지금 두 값이 같다는 것만 여기서 못 박는다(다르게 바꾸려면 이 테스트를 함께 고친다).
test('코퍼스 정답의 이름 문턱은 자기 상수 TRUTH_NAME_FIT(1.1) — 파이프라인 NAME_FIT[1]과 지금 같고, lib.mjs는 NAME_FIT을 가져오지 않는다', () => {
  expect(TRUTH_NAME_FIT).toBe(1.1);
  expect(TRUTH_NAME_FIT).toBe(NAME_FIT[1]);
  const lib = readFileSync(fileURLToPath(new URL('../tools/dxf-corpus/lib.mjs', import.meta.url)), 'utf8');
  expect(lib).not.toMatch(/[{,]\s*NAME_FIT\s*[,}]/);                       // 구조 분해 import가 없다
});
