// 정규화 DXF 내보내기(2026-10-12 · 계획 12 Task 3). 계약은 "우리 가져오기가 같은 것을 다시 읽는다"다 — 내보낸 텍스트를 **앱과 같은 길**
// (io/dxf/worker.js: 디코드 → 파싱 → 전개 → 레이어 역할 → 벽 띠 → 방 → 개구부)로 다시 들여와 벽·두께·방 이름·문창 폭·기둥을 맞댄다.
// 워커는 node에 self가 없으므로 가짜 self를 심고 import한다(tests/dxfUnits.test.js · tools/dxf-corpus/lib.mjs의 관례).
import { test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exportDxf, buildDxf } from '../src/io/dxfExport.js';
import { EXPORT_LAYERS, PASS_LAYER } from '../src/io/dxfExportTemplate.js';
import { liningOracle } from '../src/io/dxfExportGeom.js';
import { JOINT_GAP } from '../src/io/dxfExportJoints.js';
import { decodeDxf } from '../src/io/dxf/decode.js';
import { classifyLayer } from '../src/io/dxf/classify.js';
import { blockKind, nominalWidth } from '../src/io/dxf/blockOpenings.js';
import { makeItem } from '../src/io/dxf/openingSeat.js';
import { createEmptyProject, createFloor, normalizeProject, createItem } from '../src/state/schema.js';
import { makeWall, rectWalls } from '../src/geom/walls.js';
import { normalizeWalls } from '../src/geom/normalize.js';
import { detectRooms, pointInPolygon } from '../src/geom/rooms.js';
import { buildProject } from '../src/io/dxf/toProject.js';
import { DXF_PARAMS, HEIGHT_RANGE } from '../src/io/dxf/params.js';
import { DXF_FEEDBACK_MENU, DXF_FEEDBACK_NONE, DXF_EQUIPMENT_OPT, DXF_EQUIPMENT, DXF_EXPORT_AS_MENU } from '../src/ui/dxfMessages.js';
import { matchEquip, sizeInName, skipReason, kitchenOr } from '../src/io/dxf/equipVocab.js';
import { importSnapshot } from '../src/io/dxfFeedback.js';
import { DRAWING_PRICE_NOTE } from '../src/io/estimateTable.js';
import { ITEM_RANGE } from '../src/state/schema.js';
import { productById, PRODUCTS } from '../src/products/catalog.js';
import { equipExport, isExportEquip, EQUIP_TEXT_H } from '../src/io/dxfExportEquip.js';
import { eqBlockName, parseEqBlock, eqPlacement, eqWalls, eqSafe, EQ_LAYER } from '../src/io/dxf/equipName.js';
import { isDrawnItem, productRows } from '../src/io/estimate.js';
import { blockKindByName } from '../src/io/dxf/blockOpenings.js';
import { placeOnWall, wallAxis } from '../src/geom/items.js';
import { sameItemIds } from '../src/state/itemOps.js';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { itemMenuItems } from '../src/ui/itemMenu.js';
import { SELECT_SAME_NAME } from '../src/ui/messages.js';
import { PROFILES, profileOf, ARCHI_LAYERS, archiWallLayer } from '../src/io/dxfExportProfile.js';
import { createHash } from 'node:crypto';

let handle;
beforeAll(async () => {
  const posts = [];
  globalThis.self = { postMessage: m => posts.push(m), onmessage: null };
  await import('../src/io/dxf/worker.js');
  const on = globalThis.self.onmessage;
  handle = data => { posts.length = 0; on({ data }); return posts.filter(m => m.type !== 'progress').at(-1); };
});

const importBuf = (buf, fileName) => {
  const parsed = handle({ type: 'parse', buf, fileName });
  expect(parsed.type).toBe('parsed');
  const ex = handle({ type: 'extract', opts: { layers: parsed.summary.checked, trace: false } });
  expect(ex.type).toBe('extracted');
  // 다시 들여온 앱 좌표 → 내보낸(원래) 앱 좌표: 가져오기는 벽 상자 가운데를 0으로 잡는다(stats.origin · y 뒤집기).
  const o = ex.stats.origin, back = p => [p[0] + o[0], p[1] - o[1]];
  return { summary: parsed.summary, project: ex.project, stats: ex.stats, back };
};
const importText = txt => importBuf(new TextEncoder().encode(txt).buffer, '정규화.dxf');
const fixture = () => {
  const raw = readFileSync(fileURLToPath(new URL('./fixtures/plan-1f-corner.dxf', import.meta.url)));
  return importBuf(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), 'plan-1f-corner.dxf');
};

const cat = id => (/^door-/.test(id) ? 'door' : /^window-/.test(id) ? 'window' : id === 'opening-pass' ? 'pass' : null);
const near = (p, q, tol) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol;
// 한 결과의 요약(좌표는 back으로 원래 앱 좌표에 맞춘다).
function digest(r, back = p => p) {
  const f = r.project.floors[0];
  return {
    walls: f.walls.filter(w => !w.virtual).map(w => ({ a: back(w.a), b: back(w.b), t: w.thickness })),
    rooms: f.rooms.map(x => x.name ?? '').sort(),
    areas: new Map(f.rooms.filter(x => x.name).map(x => [x.name, x.areaCenter])),
    opens: f.items.filter(i => cat(i.productId)).map(i => ({ kind: cat(i.productId), id: i.productId, w: i.size[0], p: back(i.pos) })),
    columns: f.items.filter(i => i.kind === 'column').map(i => ({ p: back(i.pos), s: i.size.slice(0, 2) })),
  };
}
// 벽: 수·두께 분포가 같고, 원래 벽마다 끝점이 tol 안에서 같은 벽이 있다.
function sameWalls(A, B, tol = 2) {
  expect(B.walls.length).toBe(A.walls.length);
  expect(B.walls.map(w => w.t).sort((x, y) => x - y)).toEqual(A.walls.map(w => w.t).sort((x, y) => x - y));
  const miss = A.walls.filter(w => !B.walls.some(v => (near(v.a, w.a, tol) && near(v.b, w.b, tol)) || (near(v.a, w.b, tol) && near(v.b, w.a, tol))));
  expect(miss).toEqual([]);
}
// 개구부: 같은 종류가 300 mm 안에 있고 폭이 ±50.
const matchOpen = (o, list) => list.find(x => x.kind === o.kind && near(x.p, o.p, 300) && Math.abs(x.w - o.w) <= 50);

// 합성 평면(손으로 만든 프로젝트): 8 × 6 m, 위쪽 벽 600(bandGap 520보다 두껍다), 가운데 칸막이 120, 문·창·포켓·미닫이·통로·기둥, 실명 둘.
function synthetic() {
  const walls = normalizeWalls([
    ...rectWalls([-4000, -3000], [4000, 3000], 200, 3500).map((w, i) => (i === 2 ? { ...w, thickness: 600 } : w)),
    makeWall({ a: [0, -3000], b: [0, 3000], thickness: 120, height: 3500 }),
  ]);
  const on = (x, y) => walls.find(w => Math.min(w.a[0], w.b[0]) - 1 <= x && x <= Math.max(w.a[0], w.b[0]) + 1 && Math.min(w.a[1], w.b[1]) - 1 <= y && y <= Math.max(w.a[1], w.b[1]) + 1);
  const put = (id, width, x, y) => {
    const w = on(x, y), d = [w.b[0] - w.a[0], w.b[1] - w.a[1]];
    return makeItem(id, width, w, ((x - w.a[0]) * d[0] + (y - w.a[1]) * d[1]) / (d[0] ** 2 + d[1] ** 2));
  };
  const items = [
    put('door-swing-900', 900, 0, -1500), put('window-slide-1200', 1200, 4000, 1000), put('door-pocket-900', 900, -2000, -3000),
    put('opening-pass', 1000, -4000, 1000), put('window-slide-1800', 1800, 2000, 3000), put('door-slide-900', 900, 2000, -3000),
    createItem(productById('column-square'), { pos: [4000, -1500], rot: 0, size: [400, 400, 3500] }),
  ];
  const rooms = detectRooms(walls);
  for (const r of rooms) r.name = pointInPolygon([-2000, 0], r.points) ? '사무실' : '창고';
  return normalizeProject({ ...createEmptyProject('합성 평면'), areaMode: 'center', floors: [{ ...createFloor('1F'), height: 3500, walls, rooms, items }] });
}

// 기구 픽스처(2026-10-13 · 계획 14 Task E): 합성 평면 + 기구 일곱 — 도면의 일반 상자(운반차) · 90° 돈 세정대(도면) · 사람이 놓은 벽걸이 상부장(서쪽 벽 면,
// z를 1200으로 고침) · 천장 후드(z = 층고 3500 − 600) · 좌우 뒤집은 냉장고 · 도면의 익명 상자를 벽에 붙인 판넬(벽 z 900 — 왕복하면 바닥 z 900) ·
// 서쪽 벽 **바깥 면**의 STS 환기캡 Ø150(중심이 벽 상자 밖 75 mm — 리뷰 I-1). 벽 선 끝점에서 500 mm(ROI_LINK) 넘게 떨어져야 도면 덩어리에
// 묶이지 않아 상자 밖이다(동쪽은 기둥이, 모서리 가까이는 방 윤곽 꼭짓점이 상자를 넓혀 시험이 안 된다 — y −1000).
// 층고 3500 = 가져오기 기본 층고(DXF_PARAMS.height)라 천장 z를 맞댈 수 있다. seatOn: x = 세로 벽의 x, east = 벽의 동쪽(+x) 면에 붙인다.
const seatOn = (f, x, y, size, east) => {
  const w = f.walls.find(q => !q.virtual && Math.abs(q.a[0] - x) < 1 && Math.abs(q.b[0] - x) < 1), t = Math.abs(y - w.a[1]) / wallAxis(w).len;
  const s = [1, -1].map(side => ({ side, ...placeOnWall(w, t, side, size) })).find(q => (q.pos[0] > x) === east);
  return { pos: s.pos, rot: s.rot, wallId: w.id, t, side: s.side };
};
function equipFixture() {
  const p = synthetic(), f = p.floors[0];
  const it = (id, patch) => createItem(productById(id), patch);
  f.items.push(
    it('equip-generic', { pos: [2000, 1000], size: [1200, 600, 900], name: '운반차', dxfBlock: '운반차', dxfProduct: 'equip-generic' }),
    it('sink-double', { pos: [-2500, -1000], rot: 90, size: [1500, 750, 850], name: '세정대 2조 1500-750', dxfBlock: '세정대 2조 1500-750', dxfProduct: 'sink-double' }),
    it('cabinet-upper', { ...seatOn(f, -4000, -1500, productById('cabinet-upper').size, true), z: 1200 }),
    it('hood-box', { pos: [-2000, 1500], z: DXF_PARAMS.height - 600 }),
    it('fridge-2door', { pos: [2500, -1500], flipH: true }),
    it('equip-generic', { ...seatOn(f, 4000, -2400, [800, 150, 1000], false), size: [800, 150, 1000], attach: 'wall', z: 900, dxfBlock: 'zw$A460', dxfProduct: 'equip-generic' }),
    it('ventcap-150', { ...seatOn(f, -4000, -1000, productById('ventcap-150').size, false) }),
  );
  return p;
}

// DXF 텍스트 → (코드, 값) 쌍(코드 줄은 짝수 번째).
const pairs = txt => { const L = txt.split('\n'), out = []; for (let i = 0; i + 1 < L.length; i += 2) out.push([L[i].trim(), L[i + 1]]); return out; };
// 종류 type인 엔티티마다 { 코드: 첫 값 }.
const ents = (ps, type) => ps.flatMap(([c, v], i) => {
  if (c !== '0' || v !== type) return [];
  const r = {};
  for (let j = i + 1; j < ps.length && ps[j][0] !== '0'; j++) r[ps[j][0]] ??= ps[j][1];
  return [r];
});

test('머리는 AC1021(UTF-8) · 단위 mm · 섹션 차례 · EOF — 우리 디코더가 UTF-8로 읽는다', () => {
  const txt = exportDxf(synthetic());
  expect(txt.startsWith('0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1021\n')).toBe(true);
  expect(txt).toContain('9\n$INSUNITS\n70\n4\n');
  expect(txt.trimEnd().endsWith('0\nEOF')).toBe(true);
  const secs = pairs(txt).map((p, i, a) => (p[0] === '0' && p[1] === 'SECTION' ? a[i + 1][1] : null)).filter(Boolean);
  expect(secs).toEqual(['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']);
  const dec = decodeDxf(new TextEncoder().encode(txt));
  expect([dec.ver, dec.encoding]).toEqual(['AC1021', 'utf-8']);
  expect(dec.txt).toContain('사무실');
});

test('핸들은 모두 고유하고 $HANDSEED보다 작으며, 주인(330)은 있는 핸들이다(기구 블록 포함)', () => {
  const ps = pairs(exportDxf(equipFixture()));
  const handles = ps.filter(([c]) => c === '5' || c === '105').map(([, v]) => v);
  const seedAt = ps.findIndex(([c, v]) => c === '9' && v === '$HANDSEED');
  const seed = parseInt(ps[seedAt + 1][1], 16);
  const own = handles.filter((_, i) => i > 0);       // 첫 '5'는 $HANDSEED 값이다
  expect(new Set(own).size).toBe(own.length);
  expect(Math.max(...own.map(h => parseInt(h, 16)))).toBeLessThan(seed);
  const known = new Set(own);
  expect(ps.filter(([c]) => c === '330').map(([, v]) => v).filter(v => v !== '0' && !known.has(v))).toEqual([]);
});

test('엔티티가 쓰는 레이어는 모두 LAYER 표에 있고, 레이어 이름이 가져오기의 역할을 정한다', () => {
  const ps = pairs(exportDxf(equipFixture()));
  const table = new Set(), used = new Set();
  let inLayer = false, section = null;
  ps.forEach(([c, v], i) => {
    if (c === '0' && v === 'SECTION') section = ps[i + 1][1];
    if (c === '0' && v === 'TABLE') inLayer = ps[i + 1][1] === 'LAYER';
    if (c === '0' && v === 'ENDTAB') inLayer = false;
    if (c === '2' && inLayer && ps[i - 1]?.[1] !== 'TABLE') table.add(v);
    if (c === '8' && (section === 'ENTITIES' || section === 'BLOCKS')) used.add(v);
  });
  expect([...used].filter(l => !table.has(l))).toEqual([]);
  expect(EXPORT_LAYERS.map(l => l.name).every(n => table.has(n))).toBe(true);
  // 역할(io/dxf/classify.js): 벽·기둥은 벽, 문자는 문자, 통로 표시는 개구부, 치수는 치수, 구획선은 난간(구획선으로만 다시 긋는다),
  // 나머지는 기타(기본 체크 밖). DIVIDER → rail은 2026-10-12 최종 리뷰 X-1(왕복에서 난간 구획선이 사라져 발코니가 다시 열렸다).
  // EQUIP(2026-10-13 · 계획 14 Task E)은 기구 — 벽·개구부 판정 밖이고 기본 체크도 아니다(classify 'equip' 키).
  expect(['WALL', 'WALL-2', 'COLUMN', 'ROOM-TEXT', 'TITLE', PASS_LAYER, 'DIM', 'OPENING', 'ROOM', 'DIVIDER', EQ_LAYER].map(classifyLayer))
    .toEqual(['wall', 'wall', 'wall', 'text', 'text', 'opening', 'dim', 'other', 'other', 'rail', 'equip']);
  expect(EXPORT_LAYERS.some(l => l.name === EQ_LAYER && l.color !== 4)).toBe(true);     // 청록(4)이면 내용으로 창호가 될 수 있다(layerGuess)
});

// 2026-10-12 · 최종 리뷰 X-1: 내보내기는 구획선(virtual)을 DIVIDER에 쓰는데 가져오기가 그 레이어를 '기타'로 버려, 난간으로 닫은 발코니가
// 왕복 한 번에 다시 열렸다(방 2 → 1 · 끊긴 끝 0 → 2). DIVIDER는 난간 역할이라 railDividers가 같은 구획선을 다시 긋는다.
test('난간으로 닫은 발코니(구획선)는 정규화 DXF 왕복 뒤에도 닫혀 있다 — 방 수·끊긴 끝이 그대로다', () => {
  const W = (a, b) => ({ a, b, thickness: 200 }), L = (a, b) => ({ a, b });
  const raw = [W([-2000, 1600], [8000, 1600]), W([-2000, 1600], [-2000, 6000]), W([8000, 1600], [8000, 6000]), W([-2000, 6000], [8000, 6000]),
    W([0, 1600], [0, 0]), W([6000, 1600], [6000, 0])];
  const built = buildProject(raw, { rails: [L([100, 50], [5900, 50]), L([100, -50], [5900, -50])] });
  expect([built.stats.rooms, built.stats.railDividers, built.stats.openEnds.length]).toEqual([2, 1, 0]);
  const txt = exportDxf(built.project);
  const r = importText(txt);
  expect(r.summary.layers.find(l => l.name === 'DIVIDER').role).toBe('rail');
  expect(r.summary.checked).not.toContain('DIVIDER');                       // 벽으로 체크하지 않는다(구획선으로만)
  expect([r.stats.rooms, r.stats.railDividers, r.stats.openEnds.length]).toEqual([2, 1, 0]);
  expect(r.project.floors[0].walls.filter(w => !w.virtual)).toHaveLength(built.project.floors[0].walls.filter(w => !w.virtual).length);
});

// 2026-10-12 · 최종 재리뷰 R-1: DIVIDER가 난간 경로로 돌아온 뒤로, 벽을 일직선으로 이어 낸 면적 표기 구획선이 기준선(axisShift)을 잃었다 —
// 사동중 왕복에서 실명 방 넓이 14/14 → 12/14(구획선 둘 axisShift −16 → 0 · 식당 386.12 → 385.86). 사동중 꼴: 3 m 벽(250 · 기준선 50)을 이어 17 m
// 구획선이 16 × 20 m 방을 가른다. 다시 들여온 구획선은 이어진 벽의 기준선을 부호까지 맞게 받고, 두 방의 도면 기준 넓이(161.00 · 159.00)가 그대로다.
test('벽을 일직선으로 이어 낸 구획선(기준선 있음)은 왕복 뒤에도 그 벽의 기준선을 받는다 — 방 넓이가 그대로다', () => {
  const stub = { ...makeWall({ a: [8000, 0], b: [8000, 3000], thickness: 250, height: 3000 }), axisShift: 50 };
  const div = { ...makeWall({ a: [8000, 3000], b: [8000, 20000], thickness: 20, height: 3000 }), virtual: true, axisShift: 50 };
  const walls = normalizeWalls([...rectWalls([0, 0], [16000, 20000], 200, 3000), stub, div]);
  const rooms = detectRooms(walls);
  rooms.forEach(r => { r.name = pointInPolygon([4000, 10000], r.points) ? '서실' : '동실'; });
  const P0 = normalizeProject({ ...createEmptyProject('기준선'), areaMode: 'center', floors: [{ ...createFloor('1F'), height: 3000, walls, rooms, items: [] }] });
  const A = digest({ project: P0 });
  expect([...A.areas.values()].map(v => Math.round(v * 100) / 100).sort()).toEqual([159, 161]);
  const r = importText(exportDxf(P0)), B = digest(r, r.back), f = r.project.floors[0];
  const onX = w => Math.abs(r.back(w.a)[0] - 8000) < 2 && Math.abs(r.back(w.b)[0] - 8000) < 2;
  const [v] = f.walls.filter(w => w.virtual && onX(w)), [s] = f.walls.filter(w => !w.virtual && onX(w));
  const dir = w => Math.sign(w.b[1] - w.a[1]);
  expect(Math.abs(s.axisShift)).toBe(50);                                                 // 이어진 벽은 치수(DIM)로 기준선을 되찾는다
  expect(v.axisShift).toBe(dir(v) === dir(s) ? s.axisShift : -s.axisShift);              // 같은 방향이면 그대로 · 거꾸로면 부호를 뒤집는다
  for (const [n, a] of A.areas) expect([n, Math.abs(B.areas.get(n) - a) <= 0.05]).toEqual([n, true]);
});

// 2026-10-12 · 최종 리뷰 X-2(N3-1 · M3-5 · M10-6): 배포 안내(public/dxf-guide.html)가 내보내기와 어긋났다 — 모든 벽에 중심선이 있다고 했고,
// WALL-2·TITLE이 표에 없었고, DIVIDER는 "쓰지 않음"이라 했고, 교정 기록 파일에 대해 아무 말이 없었다. 안내의 핵심 문장을 코드 값으로 고정한다
// (내보내기·가져오기가 바뀌어 안내와 다시 어긋나면 여기서 실패한다).
test('입력 도면 안내는 내보내기와 맞는다 — 중심선 조건 · 내보내는 레이어 모두 · DIVIDER는 구획선으로 다시 긋는다 · 교정 기록', () => {
  const html = readFileSync(fileURLToPath(new URL('../public/dxf-guide.html', import.meta.url)), 'utf8');
  const row = name => html.match(new RegExp(`<tr><td><code>${name}</code></td>(.*?)</tr>`, 's'))?.[1] ?? '';
  // 중심선은 bandGap보다 두꺼운 벽만(dxfExportGeom) — "면선 두 줄 + 중심선" 같은 모든 벽 문장은 없다.
  expect(row('WALL')).toContain(`두께 ${DXF_PARAMS.bandGap} mm보다 두꺼운 벽만 중심선`);
  expect(html).not.toMatch(/면선 두 줄 \+ 중심선|면선\(두 줄\)과 중심선/);
  // 내보내는 레이어는 모두 표의 한 줄이다(WALL-2의 교대 규칙 · TITLE 포함).
  expect(EXPORT_LAYERS.filter(l => !row(l.name))).toEqual([]);
  expect(row('WALL-2')).toContain('번갈아');
  // DIVIDER는 난간 역할 — 구획선으로 다시 긋는다(railMin 이상 · 벽 두 곳).
  expect(classifyLayer('DIVIDER')).toBe('rail');
  expect(row('DIVIDER')).not.toContain('쓰지 않음');
  expect(row('DIVIDER')).toContain(`${DXF_PARAMS.railMin / 1000} m 이상`);
  // 교정 기록: 메뉴 이름 · 담기는 것 · 자동 전송 없음 · CAD 고리 전에 먼저 · 이메일 주소는 적지 않는다.
  expect(html).toContain(DXF_FEEDBACK_MENU);
  expect(html).toContain(DXF_FEEDBACK_NONE);
  expect(html).toContain('-dxf-feedback.json');
  expect(html).toContain('자동으로 보내지 않습니다');
  expect(html).toContain('CAD에서 고치기 전에 교정 기록을 먼저 내보내 주세요');
  expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
});

// 2026-10-12 · 계획 13 최종 리뷰 F-4: 안내가 기구 배치와 반대로 "기구·가구를 빼 주세요"라 했고(검토 창이 링크하고 설계 사무소에 보내는 페이지다),
// 정규화 DXF에 기구가 빠진다는 말 · 교정 기록에 기구가 든다는 말 · 기구의 한계가 없었다. 기구 문장을 코드 값으로 고정한다.
test('입력 도면 안내의 기구 문장은 코드와 맞는다 — 블록 남기기 · 이름 관례 · 끄는 체크 · 정규화 DXF의 EQUIP 블록 · 교정 기록 · 한계', () => {
  const html = readFileSync(fileURLToPath(new URL('../public/dxf-guide.html', import.meta.url)), 'utf8');
  const card = cls => html.match(new RegExp(`<div class="card ${cls}">(.*?)</div>`, 's'))?.[1] ?? '';
  const row = name => html.match(new RegExp(`<tr><td><code>${name}</code></td>(.*?)</tr>`, 's'))?.[1] ?? '';
  // §1: 기구는 남길 것(블록 그대로 · 품명 + W-D) — 안내의 예시 이름이 실제로 제품 + 치수로 읽힌다. 빼 달라는 카드에는 기구가 없다.
  const EXAMPLE = '세정대 2조 1500-750';
  expect(card('keep')).toContain(`<code>${EXAMPLE}</code>`);
  expect(card('keep')).toContain('기구 블록');
  expect(matchEquip(EXAMPLE)).toMatchObject({ productId: kitchenOr('sink-double') });   // 어휘 → 엑셀 세정대(2026-10-20 · 계획 17 Task 8)
  expect(sizeInName(EXAMPLE)).toEqual([1500, 750]);
  expect(card('drop')).not.toMatch(/기구|급식/);
  expect(html).toContain(DXF_EQUIPMENT_OPT);                                     // 검토 창의 체크 이름 그대로
  // 바닥 기호는 세우지 않는다(제외 어휘).
  for (const w of ['육가', '그레이팅', '점자블럭']) { expect(html).toContain(w); expect(skipReason(w)).toBe('fixture'); }
  // §3: 정규화 DXF에는 기구도 들어간다(2026-10-13 · 계획 14 Task E — 계획 13까지는 "들어가지 않습니다"). EQUIP 줄의 예시 블록 이름이 내보내기 그대로다.
  expect(html).toContain('정규화 DXF에는 기구도 들어갑니다');
  expect(html).not.toContain('정규화 DXF에는 기구가 들어가지 않습니다');
  const p = normalizeProject({ ...createEmptyProject('기구'), floors: [{ ...createFloor('1F'), height: 3000, walls: rectWalls([0, 0], [4000, 3000], 200, 3000), rooms: [],
    items: [createItem(productById('sink-double'), { pos: [2000, 1500], size: [1500, 750, 850], name: EXAMPLE, dxfBlock: EXAMPLE, dxfProduct: 'sink-double' })] }] });
  const block = eqBlockName(EXAMPLE, [1500, 750, 850], 'sink-double');
  expect(block).toBe('EQ-세정대_2조_1500-750-1500x750x850@sink-double');
  expect(exportDxf(p)).toContain(`\n${block}\n`);
  expect(row(EQ_LAYER)).toContain(`<code>${block}</code>`);
  expect(html).toContain('<code>EQ-이름-폭x깊이x높이@제품</code>');
  // 가격 표지(리뷰 I-2): 도면 기구는 0원 그대로 · 직접 고른 제품은 꼬리 `!` — 같은 세정대를 손으로 놓으면 `!`가 붙는다.
  expect(html).toContain('도면에서 가져온 기구는 0원 그대로이고, 직접 고른 제품(블록 이름 끝 <code>!</code>)은 그 가격으로 돌아옵니다');
  expect(row(EQ_LAYER)).toContain('직접 고른 제품은 끝에 <code>!</code>');
  expect(eqBlockName(EXAMPLE, [1500, 750, 850], 'sink-double', { priced: true })).toBe(`${block}!`);
  // §5(리뷰 I-1 · m-2): 상자 밖 1 m(equipRegionPad) · 숨김·잠금·설비 설정은 돌아오지 않는다 · 숨긴 제품은 보이게 돌아와 견적에 든다.
  expect(html).toContain(`벽 선 전체를 감싸는 상자 밖으로 ${DXF_PARAMS.equipRegionPad / 1000} m보다 멀리 나간 기구는 다시 가져오지 않습니다`);
  expect(html).toContain('숨김·잠금 표시와 설비 설정(후드 면풍속·필터·번호 등)은');
  expect(html).toContain('숨겨 둔 기구도 보이게 돌아오고, 직접 고른 제품이면 견적에 다시 들어갑니다');
  // §5(2026-10-13 · 최종 리뷰 X-3): 기둥 면 깎기(equipTrim · 계획 14 Task A)를 적고 검토 창 알림의 그 칸 이름을 쓴다 — "크기는 도면대로"에는 이 예외를 단다.
  expect(html).toContain(`기둥 안으로 ${DXF_PARAMS.equipTrim} mm 이하 들어간 바닥 기구는 그 변을 기둥 면까지 줄입니다`);
  expect(DXF_EQUIPMENT(1, 0, 1, 0, 0, 1)).toMatch(/ · 기둥 면에 맞춰 줄임 1$/);
  expect(html).toContain('“기둥 면에 맞춰 줄임 n”');
  expect(html).not.toMatch(/크기는 도면대로[,)]/);
  // §3 · §4 · §5(2026-10-13 · 최종 리뷰 X-11): 왕복에서 바닥으로 오는 익명 벽 상자 · 벽걸이 재착석, 왕복 뒤 교정 기록의 블록 이름은 EQ- 이름,
  // 같은 이름 한꺼번에 바꾸기(계획 14 목표 3 — 메뉴 문구 그대로).
  const flat = html.replace(/\s+/g, ' ');
  expect(flat).toContain('이름 없는 벽 판넬·익명 벽걸이 상자는 벽 부착을 잃고 바닥으로 돌아오고(사동중 기구 234개 중 3개)');
  expect(flat).toContain('벽걸이 기구는 300 mm 안의 같은 방향 벽 면에 다시 앉아 자리가 조금 바뀔 수 있습니다');
  expect(html).toContain('정규화 DXF를 다시 가져온 뒤에는 <code>EQ-…</code> 블록 이름');
  expect(html).toContain(`“${SELECT_SAME_NAME(2).replace('2', 'n')}” → 제품 교체`);
  // §4: 교정 기록에는 기구와 원 블록 이름(dxfBlock)이 든다.
  expect(html).toContain('기구(제품·자리·크기와 원 블록 이름 — ');
  expect(importSnapshot(p.floors[0]).items[0]).toMatchObject({ dxfBlock: EXAMPLE, kind: 'product' });
  // §5: 한계 — 견적 0원 문구 그대로 · 이름 없는 블록은 '도면 기구' 상자 · 기구끼리 겹침은 도면 그대로 · 크기 상한.
  expect(html).toContain(DRAWING_PRICE_NOTE);
  expect(html).toContain(`'${productById('equip-generic').name}' 상자`);
  expect(html).toContain('기구끼리 겹친 자리는 도면 그대로');
  expect(html).toContain(`긴 변이 ${DXF_PARAMS.equipMax / 1000} m를 넘는 블록은 세우지 않고, ${ITEM_RANGE.size[1] / 1000} m를 넘는 기구는 ${ITEM_RANGE.size[1] / 1000} m로 잘립니다`);
});

// 2026-10-13 · 계획 16 Task C: 아키스케치 호환 넷(레이어 높이 꼬리 · HATCH 자가 점검 · 아키스케치용 내보내기 · 그 파일의 왕복 한계)을 설계 사무소에 보내는
// 안내에 적는다. 범위(HEIGHT_RANGE) · 메뉴 이름(DXF_EXPORT_AS_MENU) · 레이어 이름(ARCHI_LAYERS) · 중심선 문턱(bandGap)을 코드 값으로 고정한다.
test('안내 페이지의 아키스케치 호환 문장: 높이 꼬리 · HATCH 점검 · 아키스케치용 내보내기(메뉴 · 레이어 넷 · 빠지는 것 · 끊지 못한 통로 · 왕복 한계)', () => {
  const html = readFileSync(fileURLToPath(new URL('../public/dxf-guide.html', import.meta.url)), 'utf8');
  expect(html).toContain('<code>WALL_2800</code>');
  expect(html).toContain(`${HEIGHT_RANGE[0]}~${HEIGHT_RANGE[1]}`);
  expect(html).toMatch(/HATCH/);
  expect(html).toContain('한 번에 채워지면');
  expect(html).toContain(DXF_EXPORT_AS_MENU);
  expect(html).toContain('<code>wall_층고</code>');
  for (const n of [ARCHI_LAYERS.door, ARCHI_LAYERS.window, ARCHI_LAYERS.column]) expect(html).toContain(`<code>${n}</code>`);
  expect(html).toContain('-archisketch.dxf');
  expect(html).toContain('중심선은 쓰지 않');
  expect(html).toContain('벽을 끊지 못한 통로');
  expect(html).toContain(`${DXF_PARAMS.bandGap} mm보다 두꺼운 벽은 벽으로 읽히지 않고`);   // §5 줄에만 있는 문구(WALL 행 · 벽 그리기 줄의 520은 따로)
  expect(html).toContain('정규화 DXF를 쓰세요');
  // 최종 리뷰 F-4: 아키스케치 절은 정규화 DXF 전용 "CAD에서 고칠 때" 목록 뒤 · 4절 앞이다. F-9: 그 목록은 이음 틈(JOINT_GAP)을 메우지 말라고 한다.
  const at = s => html.indexOf(s);
  expect([at('<h3>CAD에서 고칠 때</h3>') < at('<h3>아키스케치(오늘의집 3D)에 올릴 때</h3>'), at('<h3>아키스케치(오늘의집 3D)에 올릴 때</h3>') < at('<h2>4.')]).toEqual([true, true]);
  expect(html).toContain(`이음의 ${JOINT_GAP} mm 틈은 일부러 둔 것`);
});

// 가져오기는 레이어가 겹치지 않는 두 면선 사이 틈(≥ cavityMin 150)에서만 붙은 두 벽을 가른다 — 한 레이어면 두 벽이 550 띠 하나가 된다(내곡중).
// (두 방은 옆으로 1 m 비껴 놓는다 — 옆벽이 한 직선이면 가져오기가 150 틈 너머 같은 띠를 문 자리처럼 다리로 잇는다(bands.chainRuns ·
// bridge 3000). 가져오기 쪽 일이라 이 테스트는 그 꼴을 피한다.)
test('나란히 붙은 두 벽(틈 150)은 다른 벽 레이어에 그려 다시 들여와도 두 벽·두 방이다', () => {
  const walls = [...rectWalls([0, 0], [4000, 3000], 200, 3000), ...rectWalls([1000, 3350], [5000, 6350], 200, 3000)];
  const rooms = detectRooms(walls);
  rooms.forEach((r, i) => { r.name = i ? '북실' : '남실'; });
  const p = normalizeProject({ ...createEmptyProject('겹벽'), areaMode: 'center', floors: [{ ...createFloor('1F'), height: 3000, walls, rooms, items: [] }] });
  const txt = exportDxf(p);
  const layersAt = y => ents(pairs(txt), 'LINE').filter(r => /^WALL/.test(r[8]) && +r[20] === y && +r[21] === y).map(r => r[8]);
  expect(new Set([...layersAt(-3000), ...layersAt(-3100)]).size).toBe(1);
  expect(layersAt(-3100)[0]).not.toBe(layersAt(-3250)[0]);        // 남실 윗벽 면 | 틈 150 | 북실 아랫벽 면
  const r = importText(txt), B = digest(r, r.back);
  sameWalls(digest({ project: p }), B, 1);
  expect(B.rooms).toEqual(['남실', '북실']);
});

test('y는 뒤집히고 원점은 그대로다 · 구획선(virtual)은 DIVIDER 레이어의 선 하나다', () => {
  const p = synthetic();
  const f = p.floors[0];
  f.walls.push({ ...makeWall({ a: [-4000, 0], b: [0, 0], thickness: 20, height: 3500 }), virtual: true });
  const lines = ents(pairs(exportDxf(p)), 'LINE').map(r => ({ layer: r[8], ltype: r[6], a: [+r[10], +r[20]], b: [+r[11], +r[21]] }));
  // 앱 y = 3000인 600 벽의 중심선은 DXF y = −3000에 있고, 그 벽의 면선은 −3300·−2700이다(+3300은 없다).
  expect(lines.some(l => l.layer === 'WALL' && l.ltype === 'CENTER' && l.a[1] === -3000 && l.b[1] === -3000)).toBe(true);
  expect(lines.some(l => l.layer === 'WALL' && l.a[1] === -3300 && l.b[1] === -3300)).toBe(true);
  expect(lines.some(l => l.layer === 'WALL' && l.a[1] === 3300)).toBe(false);
  expect(lines.filter(l => l.layer === 'DIVIDER').map(l => [l.a, l.b])).toEqual([[[-4000, 0], [0, 0]]]);
  // 중심선은 bandGap(520)보다 두꺼운 벽만이다(리뷰 M-1) — 200·120 벽에는 없다(앱 y −3000의 200 벽 → DXF y 3000).
  expect(lines.some(l => l.ltype === 'CENTER' && l.a[1] === 3000 && l.b[1] === 3000)).toBe(false);
  expect(lines.filter(l => l.ltype === 'CENTER').every(l => l.a[1] === -3000 && l.b[1] === -3000)).toBe(true);
});

test('문·창·통로는 가져오기가 읽는 이름의 블록 INSERT다(DR · WIN · POCKET · SLIDING · PASS — 폭-두께)', () => {
  const names = ents(pairs(exportDxf(synthetic())), 'INSERT').map(r => r[2]);
  expect(names.sort()).toEqual(['DR-900-120', 'PASS-1000-200', 'POCKET-900-200', 'SLIDING-900-200', 'WIN-1200-200', 'WIN-1800-600']);
  expect(names.map(blockKind)).toEqual(['door', 'pass', 'pocket', 'slide', 'window', 'window']);
  expect(names.map(nominalWidth)).toEqual([900, 1000, 900, 900, 1200, 1800]);
});

// 2026-10-12 · Task 3 리뷰 M-1: 내보내기가 새로 그린 선(가운데 run · 중심선)을 가져오기가 기둥 마감선으로 먹어 기둥이 왕복마다 컸다
// (사동중 790×855 → 971 → 1086). 사동중 꼴: 호환 아닌 꺾임(405 | 230)의 얇은 쪽에 790×855 기둥 — 첫 후보 가운데 run 선(160 mm)이 기둥 면
// 밖 115 mm라 먹힌다. 내곡중 꼴: 짧은 190 벽 끝에 660×611 기둥. 두 번 왕복해도 기둥 크기·벽이 그대로여야 한다.
test('기둥 곁 꺾임·벽 끝: 내보낸 벽 선은 기둥 마감선이 아니고, 두 번 왕복해도 기둥 크기·벽이 그대로다', () => {
  const W = (a, b, t) => makeWall({ a, b, thickness: t, height: 3000 });
  const walls = normalizeWalls([W([0, 0], [5000, 0], 405), W([5000, 0], [5000, 217], 230), W([5000, 217], [10000, 217], 230),
    W([10000, 217], [10000, 6000], 200), W([10000, 6000], [0, 6000], 200), W([0, 6000], [0, 0], 200), W([1575, 6000], [1575, 4500], 190)]);
  const col = (pos, size) => createItem(productById('column-square'), { pos, rot: 0, size: [...size, 3000] });
  const P0 = normalizeProject({ ...createEmptyProject('기둥'), areaMode: 'center', floors: [{ ...createFloor('1F'), height: 3000, walls, rooms: detectRooms(walls), items: [col([5300, 532.5], [790, 855]), col([2000, 4700], [660, 611])] }] });
  // 첫 후보(160 mm · e 10)는 먹히는 선이다 — 내보내기는 먹히지 않는 길이를 고른다.
  const cols = [{ c: [5300, -532.5], u: [1, 0], w: 790, h: 855 }, { c: [2000, -4700], u: [1, 0], w: 660, h: 611 }];
  expect(liningOracle(cols)([[5030, 10], [5190, 10]])).toBe(true);
  const txt = exportDxf(P0);
  const lines = ents(pairs(txt), 'LINE').filter(r => /^WALL/.test(r[8])).map(r => [[+r[10], +r[20]], [+r[11], +r[21]]]);
  expect(lines.filter(liningOracle(cols))).toEqual([]);
  const size = d => d.columns.map(c => c.s.map(Math.round).join('x')).sort();
  const A = digest({ project: P0 }), r1 = importText(txt), B = digest(r1, r1.back);
  const r2 = importText(exportDxf(r1.project)), C = digest(r2, p => r1.back(r2.back(p)));
  expect(size(B)).toEqual(['660x611', '790x855']);
  expect(size(C)).toEqual(size(B));
  sameWalls(A, B, 1);
  sameWalls(B, C, 1);
});

test('합성 평면 왕복: 벽·두께·방 이름·도면 기준 넓이·문창 종류와 폭·기둥이 그대로다(두 번째 왕복도 같다)', () => {
  const P0 = synthetic(), A = digest({ project: P0 });
  const r1 = importText(exportDxf(P0)), B = digest(r1, r1.back);
  sameWalls(A, B, 1);
  expect(B.rooms).toEqual(['사무실', '창고']);
  for (const [n, v] of A.areas) expect(Math.abs(B.areas.get(n) - v)).toBeLessThanOrEqual(0.05);
  expect(A.opens.filter(o => !matchOpen(o, B.opens))).toEqual([]);
  expect(B.opens).toHaveLength(A.opens.length);
  // 미닫이문(door-slide)은 `SLIDING-` 블록 → 가져오기의 'slide' 종류로 미닫이문 그대로 돌아온다(2026-10-12 리뷰 concern 1).
  expect(B.opens.map(o => o.id).sort()).toEqual(['door-pocket-900', 'door-slide-900', 'door-swing-900', 'opening-pass', 'window-slide-1200', 'window-slide-1800']);
  expect(B.columns.map(c => [c.p.map(Math.round), c.s.map(Math.round)])).toEqual([[[4000, -1500], [400, 400]]]);
  expect(r1.project.name).toBe('합성 평면');
  const r2 = importText(exportDxf(r1.project)), C = digest(r2, p => r1.back(r2.back(p)));
  sameWalls(B, C, 1);
  expect(C.opens.map(o => [o.id, o.w]).sort()).toEqual(B.opens.map(o => [o.id, o.w]).sort());
});

test('픽스처 왕복: 벽 11개가 끝점까지 같고 방·기둥·창·통로 넷이 같다 — 틈을 그 자리·폭으로 못 읽는 셋은 벽을 잇고 PASS 블록으로 돌아온다', () => {
  const r0 = fixture(), A = digest(r0);
  const built = buildDxf(r0.project);
  const r1 = importText(built.text), B = digest(r1, r1.back);
  sameWalls(A, B, 2);
  expect(B.rooms).toEqual(A.rooms);
  expect(B.columns.length).toBe(A.columns.length);
  for (const c of A.columns) expect(B.columns.some(d => near(d.p, c.p, 5) && Math.abs(d.s[0] - c.s[0]) <= 5 && Math.abs(d.s[1] - c.s[1]) <= 5)).toBe(true);
  const nonPass = o => o.kind !== 'pass';
  expect(A.opens.filter(nonPass).filter(o => !matchOpen(o, B.opens))).toEqual([]);
  expect(B.opens.filter(nonPass)).toHaveLength(A.opens.filter(nonPass).length);
  // 통로 넷 중 셋은 벽 끝과의 토막이 minSeg(150)보다 짧아(동쪽 벽 끝 50·80 mm · 꺾임 앞 50 mm) 가져오기가 그 틈을 그 자리·폭으로 읽지
  // 못한다 — 벽을 끊지 않는다(끊으면 동쪽 벽 끝 1.7 m가 사라지고, 꺾임 앞 통로는 왕복마다 50 mm씩 밀린다). 2026-10-12 리뷰 concern 2부터
  // 통로는 모두 `PASS-폭-두께` 블록이라 넷 다 돌아오고(사라지는 통로 0), 끊은 하나의 틈 통로와 블록 통로는 하나로 앉는다.
  const passes = A.opens.filter(o => o.kind === 'pass');
  expect([passes.length, built.uncutPasses]).toEqual([4, 3]);
  expect('skippedPasses' in built).toBe(false);                    // 늘 0이던 죽은 값은 지웠다(2026-10-12 · 최종 리뷰 X-6 · N3-3)
  expect(B.opens.filter(o => o.kind === 'pass')).toHaveLength(4);
  expect(passes.filter(o => !matchOpen(o, B.opens))).toEqual([]);
});

test('픽스처 두 번째 왕복은 바뀌는 것이 없다(정규화 DXF는 고정점이다)', () => {
  const r1 = importText(exportDxf(fixture().project)), B = digest(r1);
  const r2 = importText(exportDxf(r1.project)), C = digest(r2, r2.back);
  sameWalls(B, C, 1);
  expect(C.rooms).toEqual(B.rooms);
  expect(C.opens.map(o => [o.id, o.w]).sort()).toEqual(B.opens.map(o => [o.id, o.w]).sort());
  expect(C.columns).toHaveLength(B.columns.length);
});

test('실명·면적은 따로 적는다(문자 레이어 · 높이 200~600 · "24.00㎡") — 다시 들여오면 방 이름이 같다', () => {
  const texts = ents(pairs(exportDxf(synthetic())), 'MTEXT').map(r => [r[8], r[1], +r[40]]);
  const room = texts.filter(t => t[0] === 'ROOM-TEXT');
  expect(room.map(t => t[1]).sort()).toEqual(['24.00㎡', '24.00㎡', '사무실', '창고']);
  expect(room.every(t => t[2] >= 200 && t[2] <= 600)).toBe(true);
  expect(texts.find(t => t[0] === 'TITLE')).toEqual(['TITLE', '합성 평면', 1000]);
});

// 2026-10-12 · 최종 리뷰 X-6(M3-1): 면적 글자가 화면의 면적 표시 방식(project.areaMode)을 따라, 손으로 그린 프로젝트(기본 'net')는 안목 넓이를
// 적었다 — 다시 들여오면 가져오기는 면적 표기를 도면 기준(중심선) 넓이로 읽는다(reconcile · AREA_TOL 5 %). 내보내기는 늘 중심선 넓이다.
test('면적 글자는 표시 방식과 상관없이 벽 중심선 넓이다 — 다시 들여온 도면 기준 넓이가 같다', () => {
  const label = p => ents(pairs(exportDxf(p)), 'MTEXT').filter(r => r[8] === 'ROOM-TEXT' && /㎡$/.test(r[1])).map(r => r[1]).sort();
  const net = synthetic();
  net.areaMode = 'net';
  expect(label(net)).toEqual(label(synthetic()));
  expect(label(net)).toEqual(['24.00㎡', '24.00㎡']);
  const A = digest({ project: net }), r = importText(exportDxf(net)), B = digest(r, r.back);
  for (const [n, v] of A.areas) expect(Math.abs(B.areas.get(n) - v)).toBeLessThanOrEqual(0.05);
});

// ── 기구(2026-10-13 · 계획 14 Task E): 정규화 DXF에 기구를 EQUIP 레이어의 `EQ-이름-WxDxH@제품` 블록 INSERT로 쓰고, 다시 들여오면 그대로 선다.
// 계획 13까지는 기구를 빼고 써서 CAD 왕복 고리가 기구에서 끊겼다(안내 §3). 형식의 정본은 src/io/dxf/equipName.js다.

test('기구는 EQUIP 레이어의 EQ- 블록 INSERT다 — 자리(y 뒤집기) · 높이(z) · 회전(−rot) · 거울(배율 −1) · 가격 표지 ! · 전체 이름이 같으면 블록 하나', () => {
  const p = equipFixture(), f = p.floors[0];
  // 같은 도면 블록·크기 하나 더(블록을 나눠 쓴다) + 같은 이름·다른 크기(블록이 따로 — 사전 검토 I-6: 이름만으로 나누면 둘째가 첫 크기로 돌아온다)
  const cart = { name: '운반차', dxfBlock: '운반차', dxfProduct: 'equip-generic' };
  f.items.push(createItem(productById('equip-generic'), { ...cart, pos: [3000, 1000], size: [1200, 600, 900] }),
    createItem(productById('equip-generic'), { ...cart, pos: [3000, -500], size: [1000, 600, 900] }));
  const ps = pairs(exportDxf(p)), eqItems = f.items.filter(isExportEquip);
  expect(eqItems).toHaveLength(9);                                           // 문·창·통로 여섯과 기둥 하나는 기구가 아니다
  const ins = ents(ps, 'INSERT').filter(r => r[8] === EQ_LAYER);
  // `!` = 사람이 고른 제품(isDrawnItem이 아닌 것 — 리뷰 I-2): 상부장·후드·냉장고·환기캡. 도면 기구(운반차·세정대·판넬)는 표지 없음.
  expect(ins.map(r => r[2])).toEqual(['EQ-운반차-1200x600x900@equip-generic', 'EQ-세정대_2조_1500-750-1500x750x850@sink-double',
    'EQ-상부장-900x350x700@cabinet-upper!', 'EQ-천장형_배기_후드(박스형)-1600x1200x600@hood-box!', 'EQ-2도어_냉장고-900x750x1800@fridge-2door!',
    'EQ-도면_기구-800x150x1000@equip-generic', 'EQ-STS_환기캡_Ø150-150x150x150@ventcap-150!',
    'EQ-운반차-1200x600x900@equip-generic', 'EQ-운반차-1000x600x900@equip-generic']);
  eqItems.forEach((it, i) => {
    const r = ins[i];
    expect(+r[10]).toBeCloseTo(it.pos[0], 3);
    expect(+r[20]).toBeCloseTo(-it.pos[1], 3);
    expect(+r[30]).toBe(it.z);                                                // 삽입점 높이 = 아이템 z(상부장 1200 · 후드 2900 · 판넬 900)
    expect(+r[50]).toBeCloseTo((360 - it.rot) % 360, 3);                     // 앱 rot 90(세정대) → DXF 270 · 벽걸이는 벽 방향
    expect([+r[41], +r[42]]).toEqual([it.flipH ? -1 : 1, 1]);                // 좌우 뒤집은 냉장고만 x 배율 −1
  });
  expect([+ins[1][50], +ins[2][30]]).toEqual([270, 1200]);
  expect(ents(ps, 'INSERT').filter(r => r[8] === 'OPENING')).toHaveLength(6);   // 문·창·통로 블록은 그대로
  // 블록: 전체 이름마다 하나(8종) · 도형 = 원점이 가운데인 W × D 닫힌 사각형(레이어 0 — INSERT의 EQUIP을 물려받는다) + 가운데 이름 MTEXT(높이 150 < 실명 200)
  const eq = equipExport(f);
  expect([eq.count, eq.blocks.length]).toEqual([9, 8]);
  expect(eq.blocks.map(b => b.name)).toEqual([...new Set(ins.map(r => r[2]))]);
  const sink = eq.blocks.find(b => b.name.startsWith('EQ-세정대'));
  const [poly, text] = sink.entities, val = (e, c) => e.body.filter(([k]) => k === c).map(([, v]) => +v);
  expect([poly.type, poly.layer, val(poly, 70)[0], val(poly, 10), val(poly, 20)]).toEqual(['LWPOLYLINE', '0', 1, [-750, 750, 750, -750], [-375, -375, 375, 375]]);
  expect([text.type, text.layer, val(text, 40)[0], val(text, 71)[0], text.body.find(([k]) => k === 1)[1]]).toEqual(['MTEXT', '0', EQUIP_TEXT_H, 5, '세정대 2조 1500-750']);
  expect(EQUIP_TEXT_H).toBeLessThan(200);
  // BLOCK_RECORD(이름은 6번째 쌍)와 BLOCK 정의(7번째 쌍)가 블록마다 하나씩 있다(dxfDocument — 핸들·$HANDSEED는 위 핸들 테스트가 본다).
  const named = (type, k) => ps.flatMap(([c, v], i) => (c === '0' && v === type ? [ps[i + k][1]] : [])).filter(v => v.startsWith('EQ-'));
  expect(named('BLOCK_RECORD', 5)).toEqual(eq.blocks.map(b => b.name));
  expect(named('BLOCK', 6)).toEqual(eq.blocks.map(b => b.name));
  // 끄면 예전처럼 기구 없이 쓴다.
  const off = buildDxf(p, { equipment: false });
  expect([off.equipment, off.text.includes('EQ-'), buildDxf(p).equipment]).toEqual([0, false, 9]);
});

test('EQ- 블록 이름은 오른쪽부터 읽는다 — 금지 글자·공백 치환 · 본체의 - 숫자 @ · 창·문 이름 꼴은 끊는다', () => {
  expect(parseEqBlock('EQ-세정대_2조_1500-750-1500x750x850@sink-double')).toMatchObject({ name: '세정대 2조 1500-750', size: [1500, 750, 850], productId: 'sink-double' });
  // 블록 이름에 쓸 수 없는 글자(< > / \ " : ; ? * | , = `)와 공백: `*`·`×`는 x, 나머지는 _ (사동 이름 `600*600` — 사전 검토 I-6). 크기는 mm 정수.
  const n = eqBlockName('선반 600*600 <A/B>; "x", =`|?\\', [600.4, 600, 1800.6], 'shelf-steel-4');
  expect(n).toBe('EQ-선반_600x600_A_B_x-600x600x1801@shelf-steel-4');
  expect(n).not.toMatch(/[<>/\\":;?*|,=`\s]/);
  expect(parseEqBlock(n)).toMatchObject({ name: '선반 600x600 A B x', size: [600, 600, 1801], productId: 'shelf-steel-4' });
  // 본체에 `@`·`-WxDxH` 꼴이 있어도 오른쪽 꼬리만 크기·제품이다.
  expect(parseEqBlock(eqBlockName('랙@2-100x200x300', [10, 20, 30], 'equip-generic'))).toMatchObject({ name: '랙@2-100x200x300', size: [10, 20, 30], productId: 'equip-generic' });
  // 형식이 아니면 null — 실도면의 `EQ-` 이름(44장에 0개)·보통 블록은 어휘 경로 그대로다.
  for (const x of ['EQ-1', 'EQ-세정대', 'EQ-a-100x200@b', 'EQ-a-1x2x3@b!!', '세정대 2조 1500-750', '']) expect(parseEqBlock(x)).toBeNull();
  // 가격 표지 `!`(리뷰 I-2): 사람이 고른 제품 — 꼬리 맨 끝 하나. 없으면(예전 파일 포함) 도면 기구.
  expect(parseEqBlock('EQ-1조_싱크대-1200x750x850@sink-single!')).toMatchObject({ name: '1조 싱크대', productId: 'sink-single', priced: true });
  expect(parseEqBlock('EQ-1조_싱크대-1200x750x850@sink-single')).toMatchObject({ productId: 'sink-single', priced: false });
  // 앞머리가 아닌 창·문 이름 꼴('유리문'·'미서기창')은 다시 들여올 때 문·창으로도 서므로 끊는다 — 끊지 않으면 문이다. 끊는 글자 `~`는 eqSafe가
  // 내지 않는 글자라 읽을 때 지운다 — 이름이 그대로 돌아온다(리뷰 m-5).
  expect(blockKindByName('EQ-유리문_쇼케이스-1200x600x1800@equip-generic')).toBe('door');
  const glass = eqBlockName('유리문 쇼케이스', [1200, 600, 1800], 'equip-generic'), sash = eqBlockName('미서기창 선반', [900, 300, 600], 'equip-generic', { priced: true });
  expect([glass, blockKindByName(glass), blockKindByName(sash)]).toEqual(['EQ-유~리문_쇼케이스-1200x600x1800@equip-generic', null, null]);
  expect([parseEqBlock(glass).name, parseEqBlock(sash).name, eqSafe('a~b')]).toEqual(['유리문 쇼케이스', '미서기창 선반', 'a_b']);
  // 카탈로그 제품은 하나도 끊기지 않고, 다시 읽으면 제품·이름(정리 전 제품명 그대로 — `650×650`의 ×)·크기·부착·z가 제품 값이다.
  // 어휘가 다른 제품을 가리키는 이름('벽걸이 후드' → 어휘 '후드' = 천장 후드 · '인덕션 3구' → 레인지)은 제품의 부착·z를 쓴다.
  for (const pr of PRODUCTS.filter(isExportEquip)) {
    const name = eqBlockName(pr.name, pr.size, pr.id), got = eqPlacement({ name, pos: [0, 0], rot: 0, scale: [1, 1] }, []);
    expect(blockKindByName(name)).toBeNull();
    const z = got.patch.attach === 'wall' ? got.v.z : got.patch.z;           // 벽 z는 equipment.js가 벽 자리와 함께 v.z로 준다 · 천장 z는 층고 − 높이
    expect([pr.id, got.pid, got.patch.name, got.patch.size, got.patch.attach, z])
      .toEqual([pr.id, pr.id, pr.name, pr.size.map(Math.round), pr.attach, ['wall', 'floorLay'].includes(pr.attach) ? pr.zDefault : 0]);
  }
});

test('EQ- 인서트 → 아이템 자리: 회전·거울은 배율 부호로 되돌리고, 부착·z는 이름 어휘가 그 제품(또는 일반 상자)일 때만 어휘다', () => {
  const rect = (c, w, d, deg) => {
    const a = deg * Math.PI / 180, u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]];
    const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [c[0] + u[0] * w / 2 * i + v[0] * d / 2 * j, c[1] + u[1] * w / 2 * i + v[1] * d / 2 * j]);
    return P.map((p, i) => ({ a: p, b: P[(i + 1) % 4] }));
  };
  // DXF rot 270(앱 rot 90) · x 배율 −1: explode의 rot은 180을 더한 90이다 — 사각형은 인서트 축으로 재서 W·D가 바뀌지 않는다.
  const got = eqPlacement({ name: 'EQ-2도어_냉장고-900x750x1800@fridge-2door', pos: [100, 200], rot: 90, scale: [-1, 1] }, rect([100, 200], 900, 750, 270), { toApp: p => [p[0], -p[1]] });
  expect(got.patch).toMatchObject({ name: '2도어 냉장고', pos: [100, -200], rot: 90, size: [900, 750, 1800], flipH: true, flipV: false, attach: 'floor', dxfProduct: 'fridge-2door', dxfBlock: 'EQ-2도어_냉장고-900x750x1800@fridge-2door' });
  // 일반 상자 + 어휘 벽(워터릴 — 처음 가져올 때처럼 벽 z 1000) · 위생 묶음(maxLong 초과 → 바닥) · 모르는 제품 id → 일반 상자.
  const one = (name, w = 600, d = 300) => eqPlacement({ name, pos: [0, 0], rot: 0, scale: [1, 1] }, rect([0, 0], w, d, 0));
  expect(one('EQ-워터릴-600x300x550@equip-generic').v).toMatchObject({ attach: 'wall', z: 1000 });
  expect(one('EQ-세면기_묶음-2600x1500x200@equip-generic', 2600, 1500).v).toMatchObject({ attach: 'floor', z: 0 });
  expect(one('EQ-무엇-600x300x500@no-such-product')).toMatchObject({ pid: 'equip-generic', patch: { dxfProduct: 'equip-generic', name: '무엇' } });
  expect(one('EQ-벽걸이_후드-900x500x600@hood-wall').v).toMatchObject({ attach: 'wall', z: 1500 });
  expect(one('EQ-1')).toBeNull();
  // 높이(리뷰 m-1): 삽입점 z(explode inserts.z)가 벽(v.z — equipment.js가 벽 자리와 함께 쓴다)·올려놓기·바닥의 z다. 천장은 0(층고 − 높이는 equipment.js).
  // 바닥 기구는 z가 있어도 바닥이다 — 벽 후보로 옮기지 않는다(자동 이동 금지).
  const at = (name, z, w = 600, d = 300) => eqPlacement({ name, pos: [0, 0], z, rot: 0, scale: [1, 1] }, rect([0, 0], w, d, 0));
  expect(at('EQ-상부장-900x350x700@cabinet-upper!', 1200, 900, 350).v).toMatchObject({ attach: 'wall', z: 1200 });
  expect(at('EQ-인덕션_3구-750x520x60@range-induction!', 900, 750, 520).patch).toMatchObject({ attach: 'floorLay', z: 900 });
  expect(at('EQ-도면_기구-800x150x1000@equip-generic', 1100, 800, 150).patch).toMatchObject({ attach: 'floor', z: 1100 });
  expect(at('EQ-천장형_배기_후드(박스형)-1600x1200x600@hood-box!', 2900, 1600, 1200).patch).toMatchObject({ attach: 'ceiling', z: 0 });
  // 가격 표지: `!`면 dxfProduct를 두지 않는다(그 제품 가격) · 없으면 dxfProduct = 제품(0원 '도면 기구').
  // dxfBlock은 표지 없는 것(도면에서 가져온 기구)만 EQ- 이름이다 — `!`는 사람이 놓은 제품이라 두지 않는다(2026-10-13 · 최종 리뷰 X-1).
  const priced = at('EQ-1조_싱크대-1200x750x850@sink-single!', 0, 1200, 750).patch, drawn = at('EQ-1조_싱크대-1200x750x850@sink-single', 0, 1200, 750).patch;
  expect(['dxfProduct' in priced, 'dxfBlock' in priced, drawn.dxfBlock, drawn.dxfProduct]).toEqual([false, false, 'EQ-1조_싱크대-1200x750x850@sink-single', 'sink-single']);
  // 다시 앉을 벽은 기구 방향과 나란한 것뿐이다(eqWalls) — 구석의 벽걸이 기구를 직각 벽이 가로채지 않게(2026-10-13 실측: 사동 에어커튼 90° · 95 mm).
  const H = makeWall({ a: [0, 0], b: [4000, 0], thickness: 200, height: 3000 }), V = makeWall({ a: [4000, 0], b: [4000, 3000], thickness: 200, height: 3000 });
  expect([eqWalls([H, V], 270), eqWalls([H, V], 180.5), eqWalls([H, V], 45)]).toEqual([[V], [H], []]);
});

test('기구 왕복: 수·중심(≤ 10 mm)·크기·이름·제품·부착·z·회전·거울·가격이 그대로 돌아오고, 기구 선은 벽·방·개구부를 바꾸지 않는다', () => {
  const P0 = equipFixture(), A = P0.floors[0].items.filter(isExportEquip);
  const r1 = importText(exportDxf(P0));
  // 돌아온 기구 = 제품·설비 아이템 전부(문·창·통로·기둥 빼고) — 사람이 고른 제품(`!`)은 dxfBlock이 없으니 블록 이름으로 거르지 않는다(최종 리뷰 X-1).
  const got = r => r.project.floors[0].items.filter(isExportEquip);
  // 벽 판넬(익명 상자를 벽에 붙인 것)은 부착을 잃고 바닥으로 온다(이름에 없다 — 자리·z 900은 그대로 · 바닥 기구를 벽으로 옮기는 규칙은 두지 않는다).
  const attachOf = a => (a.dxfBlock === 'zw$A460' ? 'floor' : a.attach);
  const same = (A, B, back) => {
    expect(B).toHaveLength(A.length);
    for (const a of A) {
      const b = B.find(x => x.productId === a.productId && near(back(x.pos), a.pos, 10));
      expect([a.name, Boolean(b)]).toEqual([a.name, true]);
      expect([b.name, b.size, b.attach, Math.round(b.z), b.rot, b.flipH, b.flipV, isDrawnItem(b)]).toEqual([a.name, a.size, attachOf(a), Math.round(a.z), a.rot, a.flipH, a.flipV, isDrawnItem(a)]);
    }
  };
  same(A, got(r1), r1.back);
  expect(r1.stats.equipment).toMatchObject({ placed: 7, generic: 2, anonymous: 0 });
  expect(['floor', 'wall', 'ceiling'].map(a => got(r1).filter(i => i.attach === a).length)).toEqual([4, 2, 1]);
  // 벽 부착은 다시 들여온 벽에 앉는다(wallId) — 서쪽 벽 바깥 면의 환기캡도(벽 상자 밖 75 mm · equipRegionPad · 리뷰 I-1). 고친 z 1200도 그대로.
  const cab = got(r1).find(i => i.productId === 'cabinet-upper'), cap = got(r1).find(i => i.productId === 'ventcap-150');
  expect([Boolean(cab.wallId), cab.z, Boolean(cap.wallId), cap.attach]).toEqual([true, 1200, true, 'wall']);
  expect(r1.back(cap.pos)[0]).toBeLessThan(-4100);
  // 견적(리뷰 I-2): 사람이 고른 제품은 그 가격 그대로(꼬리 `!` → dxfProduct 없음), 도면 기구는 0원 그대로.
  const total = items => productRows(items).reduce((s, r) => s + r.total, 0);
  expect(total(got(r1))).toBe(total(A));
  expect(total(A)).toBeGreaterThan(0);
  expect(got(r1).filter(isDrawnItem).map(i => i.productId).sort()).toEqual(['equip-generic', 'equip-generic', 'sink-double']);
  // 도면 기구만 EQ- 블록 이름을 dxfBlock에 둔다 — 사람이 고른 제품(`!`)은 dxfBlock도 dxfProduct도 없다(최종 리뷰 X-1).
  const tag = i => `${i.productId}:${String(i.dxfBlock ?? '-').slice(0, 3)}:${i.dxfProduct ?? '-'}`;
  expect(got(r1).map(tag).sort()).toEqual(['cabinet-upper:-:-', 'equip-generic:EQ-:equip-generic', 'equip-generic:EQ-:equip-generic', 'fridge-2door:-:-',
    'hood-box:-:-', 'sink-double:EQ-:sink-double', 'ventcap-150:-:-']);
  // 기구 선(EQUIP 레이어)은 벽 판정에 끼지 않는다 — 기구를 빼고 내보낸 것과 벽·방·개구부·기둥이 같다.
  const r0 = importText(exportDxf(P0, { equipment: false })), W0 = digest(r0, r0.back), W1 = digest(r1, r1.back);
  sameWalls(W0, W1, 0.5);
  expect([W1.rooms, W1.opens.map(o => o.id).sort(), W1.columns.length]).toEqual([W0.rooms, W0.opens.map(o => o.id).sort(), W0.columns.length]);
  // 두 번째 왕복도 같다(고정점 — r2.back은 r1의 앱 좌표로 되돌린다).
  const r2 = importText(exportDxf(r1.project));
  same(got(r1), got(r2), r2.back);
});

// 2026-10-13 · 최종 리뷰 X-1(M-E5/N-2): 손으로 놓은 같은 제품 둘(폭 900 · 1000 냉장고)을 왕복하면 예전에는 둘 다 dxfBlock(크기가 든 EQ- 이름)을 얻어
// itemOps.sameItemIds가 "가져온 기구"로 보고 블록끼리만 묶었다 — 메뉴가 "같은 이름 1개"로 꺼졌다(실측 네 도면 모두 n = 1).
// 사람이 놓은 제품(`!`)은 왕복 뒤에도 사람이 놓은 아이템이다: dxfBlock 없음 → 같은 productId 전부 · 메뉴 "같은 제품 선택"이 켜진다.
test('왕복한 가격 아이템은 사용자의 것 — dxfBlock 없음 · "같은 제품 선택"이 같은 제품 전부를 고른다', () => {
  const P0 = equipFixture(), f0 = P0.floors[0], fridge = productById('fridge-2door');
  f0.items.push(createItem(fridge, { pos: [-1200, -2000], size: [1000, fridge.size[1], fridge.size[2]] }));   // 폭이 다른 둘째 — 블록 이름이 다르다
  const before = f0.items.filter(i => i.productId === 'fridge-2door');
  expect(before.map(i => sameItemIds(f0, i).length)).toEqual([2, 2]);
  const r = importText(exportDxf(P0)), f = r.project.floors[0];
  const back = f.items.filter(i => i.productId === 'fridge-2door');
  expect(back.map(i => i.size[0]).sort()).toEqual([1000, 900]);
  expect(back.map(i => [i.dxfBlock ?? null, i.dxfProduct ?? null, isDrawnItem(i)])).toEqual([[null, null, false], [null, null, false]]);
  for (const it of back) expect(sameItemIds(f, it).sort()).toEqual(back.map(i => i.id).sort());
  const menu = itemMenuItems({ store: createStore(r.project), ui: createUiState(), ids: [back[0].id], itemActions: {} });
  expect(menu.filter(m => m?.label === '같은 제품 선택').map(m => m.disabled)).toEqual([false]);
  // 도면에서 가져온 기구는 그대로 EQ- 꼬리표다 — 같은 이름·같은 블록 묶음(계획 14 Task D)은 바뀌지 않는다.
  expect(f.items.find(i => i.productId === 'sink-double').dxfBlock).toMatch(/^EQ-세정대/);
});

// 2026-10-13 계획 16 Task A: 벽 레이어 이름의 높이 꼬리(아키스케치 wall_2800 규칙)는 파싱 요약에 층고 후보로 실린다 — 검토 창이 층고 칸에 미리 넣는다.
test('워커 요약은 체크된 벽 레이어의 높이 꼬리를 layerHeight로 싣는다(WALL_2800 → { 2800, WALL_2800 }) · 없으면 null', () => {
  const txt = exportDxf(synthetic()).replace(/\nWALL\n/g, '\nWALL_2800\n');       // 레이어 표의 2 WALL · 엔티티의 8 WALL 둘 다(WALL-2는 그대로)
  const r = importText(txt);
  expect(r.summary.layerHeight).toEqual({ height: 2800, layer: 'WALL_2800' });
  expect(r.summary.layers.find(l => l.name === 'WALL_2800')).toMatchObject({ role: 'wall', height: 2800 });
  expect(importText(exportDxf(synthetic())).summary.layerHeight).toBeNull();
});

// ── 아키스케치용 프로필(2026-10-13 · 계획 16 Task B · dxfExportProfile.js): 아키스케치(오늘의집 3D) CAD 업로드가 읽는 레이어 넷만 쓴다.
// 레이어 표(LAYER TABLE의 이름들)와 ENTITIES 구역의 엔티티 레이어(위 '엔티티가 쓰는 레이어는 모두 LAYER 표에 있고' 테스트와 같은 규칙).
function layersOf(ps) {
  const table = [], used = new Set();
  let inLayer = false, section = null;
  ps.forEach(([c, v], i) => {
    if (c === '0' && v === 'SECTION') section = ps[i + 1][1];
    if (c === '0' && v === 'TABLE') inLayer = ps[i + 1][1] === 'LAYER';
    if (c === '0' && v === 'ENDTAB') inLayer = false;
    if (c === '2' && inLayer && ps[i - 1]?.[1] !== 'TABLE') table.push(v);
    if (c === '8' && (section === 'ENTITIES' || section === 'BLOCKS')) used.add(v);
  });
  return { table, used };
}
// ENTITIES 구역의 엔티티만(블록 정의 안의 틀 사각형은 레이어 0이라 뺀다 — 사전 검토 3).
function modelEnts(ps, type) {
  let section = null; const out = [];
  for (let i = 0; i < ps.length; i++) {
    const [c, v] = ps[i];
    if (c === '0' && v === 'SECTION') section = ps[i + 1][1];
    if (section !== 'ENTITIES' || c !== '0' || v !== type) continue;
    const r = {}; for (let j = i + 1; j < ps.length && ps[j][0] !== '0'; j++) r[ps[j][0]] = ps[j][1];
    out.push(r);
  }
  return out;
}

test('아키스케치 프로필: 레이어는 0·wall_층고·door·window·column뿐 — 면선만(중심선·extra run 없음) · 문 블록은 door · 창은 window · 통로 블록·X·방·치수·제목·기구·구획선은 없다', () => {
  // 합성 평면(문·창·통로·기둥·600 벽 중심선·실명) + 기구 일곱(equipFixture) + 구획선 하나 — 정규화 DXF에는 기구·DIVIDER가 있는 평면이다(대조).
  const p = equipFixture(); p.floors[0].height = 2800;
  p.floors[0].walls.push({ ...makeWall({ a: [-4000, 0], b: [0, 0], thickness: 20, height: 3500 }), virtual: true });
  expect([buildDxf(p).equipment, modelEnts(pairs(exportDxf(p)), 'LINE').some(l => l[8] === 'DIVIDER')]).toEqual([7, true]);
  const r = buildDxf(p, { profile: 'archisketch' });
  expect(r.profile).toBe('archisketch');
  expect(r.equipment).toBe(0);
  const ps = pairs(r.text), { table, used } = layersOf(ps);
  expect(table).toEqual(['0', 'wall_2800', ARCHI_LAYERS.door, ARCHI_LAYERS.window, ARCHI_LAYERS.column]);
  expect([...used].filter(l => !table.includes(l))).toEqual([]);
  expect(archiWallLayer(2800)).toBe('wall_2800');
  const lines = modelEnts(ps, 'LINE');
  expect(lines.length).toBeGreaterThan(0);
  expect(lines.every(l => l[8] === 'wall_2800')).toBe(true);
  expect(lines.some(l => l[6] === 'CENTER')).toBe(false);
  const inserts = modelEnts(ps, 'INSERT').map(i => [i[2], i[8]]);
  // 있음 먼저(최종 리뷰 F-8 · B-m5): 픽스처가 바뀌어 문·창·기둥이 없어지면 아래 every가 소리 없이 공허해진다.
  expect(inserts.filter(([n]) => /^(DR|POCKET|SLIDING)-/.test(n)).length).toBeGreaterThanOrEqual(1);
  expect(inserts.filter(([n]) => /^WIN-/.test(n)).length).toBeGreaterThanOrEqual(1);
  expect(modelEnts(ps, 'LWPOLYLINE').length).toBeGreaterThanOrEqual(1);                    // 기둥 사각형(아래 every가 레이어 column을 본다)
  expect(inserts.filter(([n]) => /^(DR|POCKET|SLIDING)-/.test(n)).every(([, l]) => l === ARCHI_LAYERS.door)).toBe(true);
  expect(inserts.filter(([n]) => /^WIN-/.test(n)).every(([, l]) => l === ARCHI_LAYERS.window)).toBe(true);
  expect(inserts.some(([n]) => /^PASS-|^EQ-/.test(n))).toBe(false);
  expect(modelEnts(ps, 'LWPOLYLINE').every(e => e[8] === ARCHI_LAYERS.column)).toBe(true);       // ROOM 윤곽 없음(모형 공간)
  expect(modelEnts(ps, 'MTEXT')).toEqual([]);
  expect(modelEnts(ps, 'DIMENSION')).toEqual([]);
  expect(r.text).toMatch(/\n\$INSUNITS\n\s*70\n\s*4\n/);
  // 우리 가져오기의 역할: wall_2800·column → 벽, door·window → 개구부(블록은 이름으로 읽는다).
  expect(['wall_2800', ARCHI_LAYERS.door, ARCHI_LAYERS.window, ARCHI_LAYERS.column].map(classifyLayer)).toEqual(['wall', 'opening', 'opening', 'wall']);
});

// 2026-10-13 · 계획 16 최종 리뷰 I-1(F-1): 정규화 DXF는 두께가 바뀌는 이음에서 얇은 벽 면선을 이음 앞 JOINT_GAP(30 mm)에서 끊고 그 틈을 비워 둔다 —
// 우리 가져오기가 두께 구간을 가르는 표시다(dxfExportJoints.js). 아키스케치용 파일은 그 틈을 두지 않는다: 아키스케치는 맞닿은 면선을 벽으로 읽고, 안내 §2의
// HATCH 점검도 닫힌 윤곽을 요구한다(틈이 있으면 방 안·벽 몸통·바깥이 30 mm로 이어진다 — 실측 열린 끝점 사동중 53 · 내곡중 50).
// 픽스처: 윗벽 200 | 400 일직선 이음 + 아랫벽 405 → 230 꺾임(Z자 · 두 띠가 호환이 아니어서 정규화 DXF에는 가운데 run이 선다).
test('아키스케치 프로필: 두께가 바뀌는 이음에서도 벽 면선이 닫혀 있다(열린 끝점 0) — 정규화 DXF는 이음의 30 mm 틈을 그대로 둔다', () => {
  const W = (a, b, t) => makeWall({ a, b, thickness: t, height: 3000 });
  const walls = normalizeWalls([W([0, 0], [5000, 0], 405), W([5000, 0], [5000, 217], 230), W([5000, 217], [10000, 217], 230),
    W([10000, 217], [10000, 6000], 200), W([10000, 6000], [5000, 6000], 200), W([5000, 6000], [0, 6000], 400), W([0, 6000], [0, 0], 200)]);
  const p = normalizeProject({ ...createEmptyProject('이음'), areaMode: 'center', floors: [{ ...createFloor('1F'), height: 3000, walls, rooms: detectRooms(walls), items: [] }] });
  const wallLines = (txt, re) => modelEnts(pairs(txt), 'LINE').filter(l => re.test(l[8]) && l[6] !== 'CENTER').map(l => [[+l[10], +l[20]], [+l[11], +l[21]]]);
  const onLine = (q, [a, b]) => { const d = [b[0] - a[0], b[1] - a[1]], t = ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1]) / (d[0] ** 2 + d[1] ** 2); return t >= 0 && t <= 1 && near(q, [a[0] + t * d[0], a[1] + t * d[1]], 1); };
  // 열린 끝점: 다른 벽 선의 끝점(1 mm 안)에도, 다른 벽 선 위에도 닿지 않는 끝점.
  const openEnds = lines => lines.flatMap((s, i) => s.filter(q => !lines.some((o, j) => j !== i && (near(q, o[0], 1) || near(q, o[1], 1) || onLine(q, o)))));
  const archi = wallLines(buildDxf(p, { profile: 'archisketch' }).text, /^wall_/);
  expect(archi.length).toBeGreaterThan(0);
  expect(openEnds(archi)).toEqual([]);
  // 대조: 정규화 DXF는 이음마다 얇은 벽 면선 끝이 JOINT_GAP만큼 떠 있다 — 200 | 400 이음(DXF y −6000 · X = 5000)의 얇은 벽 면선은 x 5030에서 끝난다.
  const oursLines = wallLines(exportDxf(p), /^WALL/), ours = openEnds(oursLines), ends = oursLines.flat();
  expect(ours).toEqual(expect.arrayContaining([[5000 + JOINT_GAP, -6100], [5000 + JOINT_GAP, -5900]]));
  expect(ours.every(q => ends.some(e => Math.abs(Math.hypot(q[0] - e[0], q[1] - e[1]) - JOINT_GAP) <= 1.5))).toBe(true);   // 열린 끝은 모두 이음 틈이다
});

test('기본(정규화) 프로필은 바이트 단위로 그대로다 — 프로필 분기가 기본 출력을 건드리면 이 해시가 바뀐다', () => {
  // 2026-10-13 사전 검토 8: equipFixture() 내보내기의 sha256. 기본 출력을 **일부러** 바꾸는 계획은 이 값을 사유와 함께 갱신한다.
  expect(createHash('sha256').update(exportDxf(equipFixture())).digest('hex')).toBe('88c26aa83b9675941de864d937e872d8e594fd91f2f9dd02476e4c26ac206b96');
  expect(buildDxf(equipFixture()).profile).toBe('ours');
  expect(layersOf(pairs(exportDxf(equipFixture()))).table).toEqual(['0', ...EXPORT_LAYERS.map(l => l.name)]);
  expect(profileOf('없는-프로필')).toBe(PROFILES.ours);                                    // 모르는 이름은 정규화 DXF로 쓴다
  // 상속 키(toString · __proto__ …)도 모르는 이름이다 — 예전에는 함수·Object.prototype을 돌려줘 buildDxf가 던졌다(최종 리뷰 F-5 · B-m4).
  for (const k of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) expect(profileOf(k)).toBe(PROFILES.ours);
});

test('아키스케치용 DXF를 우리 앱에 다시 가져오면 불러와지고 층고 힌트가 wall_층고의 값이다 — 벽이 모두 520 이하·두께가 바뀌는 이음·구획선 없는 도면이면 벽·방도 정규화 왕복과 같다', () => {
  const p = synthetic(); p.floors[0].height = 2800;
  for (const w of p.floors[0].walls) w.thickness = Math.min(w.thickness, 500);            // 윗벽 600은 중심선 없이 한 띠로 서지 못해 빠진다(7→5 · 최종 리뷰 F-3) · 500이면 7=7·2=2
  const ours = importText(exportDxf(p)), archi = importText(buildDxf(p, { profile: 'archisketch' }).text);
  expect(archi.summary.layerHeight).toEqual({ height: 2800, layer: 'wall_2800' });
  expect(archi.project.floors[0].walls.length).toBe(ours.project.floors[0].walls.length);
  expect(archi.project.floors[0].rooms.length).toBe(ours.project.floors[0].rooms.length);
  const kinds = fl => fl.items.filter(it => /^(door-|window-)/.test(it.productId)).map(it => [it.productId.replace(/-.*/, ''), it.size?.[0]]).sort();
  expect(kinds(archi.project.floors[0])).toEqual(kinds(ours.project.floors[0]));           // 사전 검토 4: door/window 레이어 블록은 문·창을 바꾸지 않는다
  // 두꺼운 벽(600)이 있는 원래 synthetic은 벽이 빠진다(7→5) — 안내 §5의 한계("벽으로 읽히지 않고 빠질 수 있고")의 방향을 고정한다(최종 리뷰 F-3).
  const thick = synthetic(); thick.floors[0].height = 2800;
  expect(importText(buildDxf(thick, { profile: 'archisketch' }).text).project.floors[0].walls.length).toBeLessThan(importText(exportDxf(thick)).project.floors[0].walls.length);
});
