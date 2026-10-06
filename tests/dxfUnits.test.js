// 단위 변환은 추출 **전**이다(2026-10-06 · 계획 10 이월): DXF_PARAMS는 전부 mm라 m·cm·inch 도면의 원 좌표로 추출하면
// 벽이 0개다(2026-09-29 리뷰 재현). 워커는 $INSUNITS(또는 크기 추정)로 전개 결과를 mm로 바꾼 뒤 통계·후보·추출을 한다.
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { explode, scaleExplode } from '../src/io/dxf/explode.js';
import { decodeDxf } from '../src/io/dxf/decode.js';
import { parseDxf } from '../src/io/dxf/parse.js';
import { layerStats, defaultChecked, roleLayers } from '../src/io/dxf/classify.js';
import { extractWalls } from '../src/io/dxf/walls.js';
import { buildProject } from '../src/io/dxf/toProject.js';

const seg = (a, b, extra = {}) => ({ a, b, layer: 'WAL', src: 'LINE', ...extra });
const EX = {
  segs: [seg([0.5, 0.25], [9.5, 0.25], { ins: 0 })], arcs: [{ c: [1, 2], r: 0.9, layer: 'WID' }], polyArcs: [{ c: [3, 4], r: 0.45, layer: 'WID' }],
  circles: [{ c: [5, 6], r: 0.1, layer: 'SYM' }], inserts: [{ name: 'DR-900', pos: [7, 8], rot: 90, scale: [1, 1], mirrored: false, parent: null }],
  texts: [{ p: [1.5, 1.5], h: 0.3, text: '조리실', layer: 'T' }], dims: [{ p1: [0, 0], p2: [9, 0], axis: 'x', layer: 'DIM' }, { layer: 'DIM' }],
  hatches: [], others: new Map([['SPLINE', 2]]), skipped: new Map(),
};

test('scaleExplode는 길이만 k배 하고 각·배율·꼬리표·개수는 그대로 둔다', () => {
  const out = scaleExplode(EX, 1000);
  expect(out.segs[0]).toMatchObject({ a: [500, 250], b: [9500, 250], layer: 'WAL', src: 'LINE', ins: 0 });
  expect(out.arcs[0]).toMatchObject({ c: [1000, 2000], r: 900 });
  expect(out.polyArcs[0]).toMatchObject({ c: [3000, 4000], r: 450 });
  expect(out.circles[0]).toMatchObject({ c: [5000, 6000], r: 100 });
  expect(out.inserts[0]).toMatchObject({ pos: [7000, 8000], rot: 90, scale: [1, 1] });     // 회전·블록 배율은 길이가 아니다
  expect(out.texts[0]).toMatchObject({ p: [1500, 1500], h: 300, text: '조리실' });
  expect(out.dims[0]).toMatchObject({ p1: [0, 0], p2: [9000, 0], axis: 'x' });
  expect(out.dims[1]).toEqual({ layer: 'DIM' });                                           // 측정점 없는 치수는 그대로
  expect(out.others.get('SPLINE')).toBe(2);
  expect(EX.segs[0].a).toEqual([0.5, 0.25]);                                               // 원본은 건드리지 않는다
  expect(scaleExplode(EX, 1)).toBe(EX);                                                    // 1배는 복사도 하지 않는다
  expect(scaleExplode(EX, 0)).toBe(EX);
});

// 픽스처(mm · $INSUNITS 4)를 m 문서로 바꾼다: 엔티티·블록 안 엔티티·블록 기준점의 길이 필드를 1/1000. bulge·배율·각은 그대로.
function toMetres(doc) {
  const k = 1 / 1000;
  const conv = e => {
    const o = { ...e };
    for (const f of ['x', 'y', 'x2', 'y2', 'x3', 'y3', 'x4', 'y4']) if (Number.isFinite(o[f])) o[f] = o[f] * k;
    if (o.pts) o.pts = o.pts.map(p => [p[0] * k, p[1] * k]);
    if (['ARC', 'CIRCLE', 'TEXT', 'MTEXT'].includes(o.type) && Number.isFinite(o.r)) o.r = o.r * k;
    return o;
  };
  const blocks = new Map([...doc.blocks].map(([n, b]) => [n, { ...b, base: [b.base[0] * k, b.base[1] * k], entities: b.entities.map(conv) }]));
  return { ...doc, header: { ...doc.header, $INSUNITS: { 70: '6' } }, blocks, entities: doc.entities.map(conv) };
}
const path = fileURLToPath(new URL('./fixtures/plan-1f-corner.dxf', import.meta.url));
const docMm = parseDxf(decodeDxf(readFileSync(path)).txt);
const run = ex => {
  const rows = layerStats(docMm, ex);
  const checked = defaultChecked(rows), openRole = roleLayers(rows, 'opening');
  const live = new Set(rows.filter(r => !r.off).map(r => r.name));
  const r = extractWalls(ex, { wallLayers: checked, openFaceLayers: openRole, liveLayers: live, thickness: 200 });
  return buildProject(r.walls, { height: 3500, texts: ex.texts, columns: r.columns, nameRoles: new Map(rows.map(x => [x.name, x.role])) }).stats;
};

test('m 문서를 전개 뒤 1000배 하면 mm 픽스처와 같은 벽·방·넓이가 나온다', () => {
  const mm = run(explode(docMm, { arcSteps: 12 }));
  const m = run(scaleExplode(explode(toMetres(docMm), { arcSteps: 12 }), 1000));
  expect(mm.walls).toBeGreaterThanOrEqual(8);
  expect(m.walls).toBe(mm.walls);
  expect(m.rooms).toBe(mm.rooms);
  expect(Math.abs(m.areaM2 - mm.areaM2)).toBeLessThanOrEqual(0.1);
  expect(Math.abs(m.size[0] - mm.size[0])).toBeLessThanOrEqual(1);
  expect(Math.abs(m.size[1] - mm.size[1])).toBeLessThanOrEqual(1);
});

// 9 m × 6 m 이중선 방(벽 0.2 m) · $INSUNITS 6(m). 워커가 mm로 바꾸지 않으면 선분이 minSeg 150에 걸려 'no-walls'다.
const M_DXF = [
  '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1032', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '1', '0', 'LAYER', '2', 'WAL', '70', '0', '62', '3', '0', 'ENDTAB', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'ENTITIES',
  ...[[0, 0, 9, 0], [9, 0, 9, 6], [9, 6, 0, 6], [0, 6, 0, 0], [0.2, 0.2, 8.8, 0.2], [8.8, 0.2, 8.8, 5.8], [8.8, 5.8, 0.2, 5.8], [0.2, 5.8, 0.2, 0.2]]
    .flatMap(([x, y, x2, y2]) => ['0', 'LINE', '8', 'WAL', '10', String(x), '20', String(y), '11', String(x2), '21', String(y2)]),
  '0', 'ENDSEC', '0', 'EOF',
].join('\r\n');

test('워커는 m 도면을 mm로 바꾼 뒤 추출한다 — 벽 4 · 방 1 · 요약 단위 1000', async () => {
  const posts = [];
  const had = 'self' in globalThis, prev = globalThis.self;
  globalThis.self = { postMessage: m => posts.push(m), onmessage: null };
  try {
    await import('../src/io/dxf/worker.js');
    const handle = data => { posts.length = 0; globalThis.self.onmessage({ data }); return posts.filter(m => m.type !== 'progress').at(-1); };
    const parsed = handle({ type: 'parse', buf: new TextEncoder().encode(M_DXF).buffer, fileName: 'm.dxf' });
    expect(parsed.type).toBe('parsed');
    expect(parsed.summary).toMatchObject({ insunits: 6, unitScale: 1000, unitsGuessed: false });
    expect(parsed.summary.size[0]).toBeGreaterThan(8000);                        // 요약 크기는 mm다
    const ex = handle({ type: 'extract', opts: { layers: parsed.summary.checked, trace: false } });
    expect(ex.type).toBe('extracted');
    expect(ex.stats).toMatchObject({ walls: 4, rooms: 1, scale: 1, unitScale: 1000 });
    expect(ex.stats.areaM2).toBeGreaterThan(50); expect(ex.stats.areaM2).toBeLessThan(55);
    // 사람이 단위를 바꾸면(§18.5 사람이 이긴다) 같은 길로 다시 간다: cm라고 하면 90 × 60 cm = 0.9 × 0.6 m → 벽이 안 선다(minWall 250).
    const cm = handle({ type: 'extract', opts: { layers: parsed.summary.checked, scale: 10, trace: false } });
    expect(cm.type).toBe('error'); expect(cm.code).toBe('no-walls');
    // 다시 m으로 돌리면 원래대로다 — 전개 원본(ex0)을 보존하기 때문이다.
    expect(handle({ type: 'extract', opts: { layers: parsed.summary.checked, scale: 1000, trace: false } }).stats.walls).toBe(4);
  } finally { if (had) globalThis.self = prev; else delete globalThis.self; }
});
