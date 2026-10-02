// 모형 공간의 도면 후보(src/io/dxf/regions.js · 2026-10-02). 실파일 신상중: 같은 건물의 두 안(168석 · 196석)이
// 같은 도면틀 안에 나란히 있었고, 급식기구 선이 많은 쪽이 **조용히** 골라졌다. 벽 선이 든 덩어리는 모두 후보다.
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { clusters, largestCluster } from '../src/io/dxf/faces.js';
import { planRegions } from '../src/io/dxf/regions.js';
import { extractWalls } from '../src/io/dxf/walls.js';
import { DXF_PARAMS as P } from '../src/io/dxf/params.js';

const seg = (x0, y0, x1, y1, layer = 'WAL') => ({ a: [x0, y0], b: [x1, y1], layer, src: 'LINE' });
const rect = (x0, y0, w, h, layer) => [seg(x0, y0, x0 + w, y0, layer), seg(x0 + w, y0, x0 + w, y0 + h, layer), seg(x0 + w, y0 + h, x0, y0 + h, layer), seg(x0, y0 + h, x0, y0, layer)];
// 이중선 방(벽 200) + 그 안을 채운 기구 선 n줄 + 바깥 도면틀(벽에서 3 m 떨어진 사각형, 레이어 TIT)
const plan = (x0, equip = 0) => [
  ...rect(x0, 0.25, 9000, 6000, 'WAL'), ...rect(x0 + 200, 200.25, 8600, 5600, 'WAL'),
  ...Array.from({ length: equip }, (_, i) => seg(x0 + 400, 600.25 + i * 300, x0 + 8600, 600.25 + i * 300, '급식기구')),
  ...rect(x0 - 3000, -2999.75, 15000, 12000, 'TIT'),
];
const text = (x, y, s, h = 400) => ({ p: [x, y], text: s, h, layer: 'A-CON' });
const WALL = new Set(['WAL']);

test('clusters는 모든 덩어리를 크기순으로 주고 선분마다 덩어리 번호를 단다', () => {
  const segs = [...rect(0.5, 0.25, 9000, 6000), seg(50000.5, 0.25, 51000.5, 0.25), seg(NaN, 0, 1, 1)];
  const { list, of } = clusters(segs);
  expect(list).toHaveLength(2);
  expect(list[0].len).toBeCloseTo(30000, 6);
  expect([...of]).toEqual([0, 0, 0, 0, 1, -1]);
  expect(largestCluster(segs)).toEqual(list[0]);
  expect(clusters([]).list).toEqual([]);
});

test('벽 선이 든 덩어리는 모두 도면 후보다 — 도면틀·기호 덩어리는 아니다', () => {
  const A = plan(0.5, 12), B = plan(40000.5, 0);            // A는 기구 선이 많다(선 길이 합이 크다)
  const symbol = rect(90000.5, 0.25, 600, 600, '급식기구');
  const texts = [text(4000.5, 3000.25, '식당 (196석)'), text(2000.5, 1000.25, '조리실'), text(44000.5, 3000.25, '식당 (168석)'), text(42000.5, 1000.25, '조리실'), text(44000.5, 5000.25, '작은 글자', 100)];
  const regions = planRegions([...A, ...B, ...symbol], WALL, texts);
  expect(regions).toHaveLength(2);
  // 차례는 선 길이 합 내림차순이다 — 첫 후보가 예전에 혼자 골라지던 "가장 큰 덩어리"다.
  expect([regions[0].x0, regions[0].x1]).toEqual([0.5, 9000.5]);
  expect([regions[1].x0, regions[1].x1]).toEqual([40000.5, 49000.5]);
  expect(regions[0].len).toBeGreaterThan(regions[1].len);
  expect(regions[0].wallLen).toBeCloseTo(regions[1].wallLen, 6);
  // 힌트 = 그 후보에만 있는 문자(큰 글자부터). 두 후보에 다 있는 "조리실"은 구별해 주지 못한다.
  expect(regions.map(r => r.hint)).toEqual(['식당 (196석)', '식당 (168석) · 작은 글자']);
});

test('도면이 하나면 후보도 하나이고, 벽 레이어를 모르면 가장 큰 덩어리 하나다', () => {
  const one = planRegions(plan(0.5, 3), WALL, []);
  expect(one).toHaveLength(1);
  expect(one[0].hint).toBe('');
  // 벽 선이 가장 많은 후보의 1/4 미만인 덩어리(상세도·범례의 벽 몇 줄)는 후보가 아니다.
  const detail = [...rect(60000.5, 0.25, 1500, 1000, 'WAL')];
  expect(planRegions([...plan(0.5), ...detail], WALL, [])).toHaveLength(1);
  // 벽 레이어를 모르면(추정 모드) 예전처럼 가장 큰 덩어리 하나다 — 그것이 도면틀이어도.
  const blind = planRegions([...plan(0.5, 3), ...plan(40000.5)], new Set(), []);
  expect(blind).toHaveLength(1);
  expect(blind[0].len).toBe(largestCluster([...plan(0.5, 3), ...plan(40000.5)]).len);
  expect(planRegions([], WALL, [])).toEqual([]);
});

test('extractWalls는 roi를 주면 그 도면에서만 벽을 세운다', () => {
  const segs = [...plan(0.5, 12), ...plan(40000.5, 0)];
  const ex = { segs, arcs: [], polyArcs: [], circles: [], texts: [], inserts: [], dims: [], hatches: [] };
  const [a, b] = planRegions(segs, WALL, []);
  const opts = { wallLayers: WALL, params: P, thickness: 200 };
  const ra = extractWalls(ex, { ...opts, roi: a }), rb = extractWalls(ex, { ...opts, roi: b });
  expect(ra.walls).toHaveLength(4);
  expect(rb.walls).toHaveLength(4);
  expect(Math.min(...rb.walls.flatMap(w => [w.a[0], w.b[0]]))).toBeGreaterThan(40000);
  expect(rb.roi).toBe(b);
  // roi를 안 주면 예전처럼 가장 큰 덩어리(여기서는 도면틀까지 이어지지 않은 A)다.
  expect(Math.max(...extractWalls(ex, opts).walls.flatMap(w => [w.a[0], w.b[0]]))).toBeLessThan(10000);
});

// 워커를 node에서 돌린다(tests/dxfClient.test.js의 관례: 가짜 self를 심고 import).
const dxfOf = (layers, lines, texts = []) => [
  '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1032', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(layers.length),
  ...layers.flatMap(([n, c]) => ['0', 'LAYER', '2', n, '70', '0', '62', String(c)]), '0', 'ENDTAB', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'ENTITIES',
  ...lines.flatMap(s => ['0', 'LINE', '8', s.layer, '10', String(s.a[0]), '20', String(s.a[1]), '11', String(s.b[0]), '21', String(s.b[1])]),
  ...texts.flatMap(t => ['0', 'TEXT', '8', t.layer, '10', String(t.p[0]), '20', String(t.p[1]), '40', String(t.h), '1', t.text]),
  '0', 'ENDSEC', '0', 'EOF', '',
].join('\r\n');
// 워커 모듈은 한 번만 평가된다(모듈 캐시) — 가짜 self를 파일 수명 동안 심어 두고 onmessage를 다시 쓴다.
const posts = [];
let onmessage = null;
async function withWorker(fn) {
  if (!onmessage) {
    globalThis.self = { postMessage: m => posts.push(m), onmessage: null };
    await import('../src/io/dxf/worker.js');
    onmessage = globalThis.self.onmessage;
  }
  return fn(data => { posts.length = 0; onmessage({ data }); return posts.at(-1); });
}
const bufOf = txt => new TextEncoder().encode(txt);

test('워커: 요약에 도면 후보가 실리고, region을 주면 그 도면을 추출한다', async () => {
  const txt = dxfOf([['WAL', 2], ['급식기구', 8], ['TIT', 7], ['A-CON', 2]], [...plan(0.5, 12), ...plan(40000.5, 0)],
    [text(4000.5, 3000.25, '식당 (196석)'), text(44000.5, 3000.25, '식당 (168석)'), { ...text(3000.5, 2000.25, '상부장', 900), layer: '급식기구' }]);
  await withWorker(handle => {
    const { summary } = handle({ type: 'parse', buf: bufOf(txt), fileName: '두 안.dxf' });
    expect(summary.regions).toHaveLength(2);
    // 힌트는 실명이 놓이는 레이어(문자·기타·벽 역할)의 문자만 쓴다 — 기구 라벨("상부장")은 글자가 커도 도면을 구별해 주지 않는다.
    expect(summary.regions.map(r => r.hint)).toEqual(['식당 (196석)', '식당 (168석)']);
    expect(summary.regions[0].size).toEqual([9000, 6000]);
    expect(summary.size).toEqual([9000, 6000]);
    const opts = { layers: summary.checked, trace: false };
    const first = handle({ type: 'extract', opts });
    const second = handle({ type: 'extract', opts: { ...opts, region: 1 } });
    expect(first.project.floors[0].rooms[0].name).toBe('식당 (196석)');
    expect(second.project.floors[0].rooms[0].name).toBe('식당 (168석)');
    // 없는 번호는 첫 후보다(던지지 않는다).
    expect(handle({ type: 'extract', opts: { ...opts, region: 7 } }).project.floors[0].rooms[0].name).toBe('식당 (196석)');
  });
});

// 2026-10-02 배포 사이트 실측(내곡중): 체크가 비어 도형 추정으로 떨어지면 검토 창은 추정 레이어를 "켜진 것"으로
// 보여 주는데 결과는 폴백(두께 상위 6종만)의 것이었다 — 벽 47개(표시) ≠ 135개(그 체크로 다시 돌린 값).
test('워커: 체크가 비어 추정으로 떨어져도 결과는 "돌려준 추정 레이어로 추출한 것"과 같다', async () => {
  // 이름이 기구인 레이어뿐이라 내용 추정(layerGuess)도 고르지 못한다 → walls.js의 도형 추정 폴백.
  // 두께가 200·205·…·235 여덟 가지라 폴백(상위 6종)은 두 방을 버린다.
  const rooms = Array.from({ length: 8 }, (_, k) => { const t = 200 + 5 * k, x = 0.5 + k * 9000; return [...rect(x, 0.25, 9000, 6000 + k * 300, 'kitchen'), ...rect(x + t, 0.25 + t, 9000 - 2 * t, 6000 + k * 300 - 2 * t, 'kitchen')]; }).flat();
  const txt = dxfOf([['kitchen', 8]], rooms);
  await withWorker(handle => {
    const { summary } = handle({ type: 'parse', buf: bufOf(txt), fileName: '한 레이어.dxf' });
    expect(summary.checked).toEqual([]);
    const guessed = handle({ type: 'extract', opts: { layers: [], trace: false } });
    expect(guessed.stats.guessed).toBe(true);
    expect(guessed.stats.guessedLayers).toEqual(['kitchen']);
    const explicit = handle({ type: 'extract', opts: { layers: ['kitchen'], trace: false } });
    expect(explicit.stats.guessed).toBe(false);
    expect(guessed.stats.walls).toBe(explicit.stats.walls);
    expect(guessed.stats.rooms).toBe(explicit.stats.rooms);
  });
});
