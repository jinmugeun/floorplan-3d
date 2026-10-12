// 정규화 DXF 내보내기(2026-10-12 · 계획 12 Task 3). 계약은 "우리 가져오기가 같은 것을 다시 읽는다"다 — 내보낸 텍스트를 **앱과 같은 길**
// (io/dxf/worker.js: 디코드 → 파싱 → 전개 → 레이어 역할 → 벽 띠 → 방 → 개구부)로 다시 들여와 벽·두께·방 이름·문창 폭·기둥을 맞댄다.
// 워커는 node에 self가 없으므로 가짜 self를 심고 import한다(tests/dxfUnits.test.js · tools/dxf-corpus/lib.mjs의 관례).
import { test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exportDxf, buildDxf } from '../src/io/dxfExport.js';
import { EXPORT_LAYERS, PASS_LAYER } from '../src/io/dxfExportTemplate.js';
import { liningOracle } from '../src/io/dxfExportGeom.js';
import { decodeDxf } from '../src/io/dxf/decode.js';
import { classifyLayer } from '../src/io/dxf/classify.js';
import { blockKind, nominalWidth } from '../src/io/dxf/blockOpenings.js';
import { makeItem } from '../src/io/dxf/openingSeat.js';
import { createEmptyProject, createFloor, normalizeProject, createItem } from '../src/state/schema.js';
import { makeWall, rectWalls } from '../src/geom/walls.js';
import { normalizeWalls } from '../src/geom/normalize.js';
import { detectRooms, pointInPolygon } from '../src/geom/rooms.js';
import { buildProject } from '../src/io/dxf/toProject.js';
import { DXF_PARAMS } from '../src/io/dxf/params.js';
import { DXF_FEEDBACK_MENU, DXF_FEEDBACK_NONE } from '../src/ui/dxfMessages.js';
import { productById } from '../src/products/catalog.js';

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

test('핸들은 모두 고유하고 $HANDSEED보다 작으며, 주인(330)은 있는 핸들이다', () => {
  const ps = pairs(exportDxf(synthetic()));
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
  const ps = pairs(exportDxf(synthetic()));
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
  expect(['WALL', 'WALL-2', 'COLUMN', 'ROOM-TEXT', 'TITLE', PASS_LAYER, 'DIM', 'OPENING', 'ROOM', 'DIVIDER'].map(classifyLayer))
    .toEqual(['wall', 'wall', 'wall', 'text', 'text', 'opening', 'dim', 'other', 'other', 'rail']);
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
