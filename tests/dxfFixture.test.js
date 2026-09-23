// §18.11: 실파일에서 깎아 낸 축소 픽스처. 기대값은 사람이 적지 않고 같은 파이프라인이 낸
// 실측치다(회귀 스냅숏) — 지어내지 않는 최소 보증만 여기 상수로 못 박는다.
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeDxf } from '../src/io/dxf/decode.js';
import { parseDxf, headerNum } from '../src/io/dxf/parse.js';
import { explode } from '../src/io/dxf/explode.js';
import { layerStats, defaultChecked, roleLayers } from '../src/io/dxf/classify.js';
import { extractWalls } from '../src/io/dxf/walls.js';
import { buildProject } from '../src/io/dxf/toProject.js';
import { buildOpenings } from '../src/io/dxf/openings.js';
import { normalizeProject } from '../src/state/schema.js';

const path = n => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));
const raw = readFileSync(path('plan-1f-corner.dxf'));
const expected = JSON.parse(readFileSync(path('plan-1f-corner.expected.json'), 'utf8'));

// 한 번만 돌리고 모든 테스트가 나눠 쓴다(파싱 시간을 재는 테스트는 자기 계측을 따로 한다).
const dec = decodeDxf(raw);
const doc = parseDxf(dec.txt);
const ex = explode(doc, { arcSteps: 12 });
const rows = layerStats(doc, ex);
const checked = defaultChecked(rows);
const openRole = roleLayers(rows, 'opening');
const live = new Set(rows.filter(r => !r.off).map(r => r.name));
const titleLayers = new Set(rows.filter(r => r.role === 'text' || r.role === 'other').map(r => r.name));
const extracted = extractWalls(ex, { wallLayers: checked, openFaceLayers: openRole, liveLayers: live, thickness: 200 });
const built = buildProject(extracted.walls, { height: 3500, texts: ex.texts, fileName: 'plan-1f-corner.dxf', titleLayers });

test('픽스처는 저장소에 들어갈 크기다', () => {
  expect(raw.length).toBeLessThanOrEqual(200 * 1024);
  expect(readFileSync(path('plan-1f-corner.expected.json')).length).toBeLessThanOrEqual(2 * 1024);
});

// Task 8 리뷰 I-1: 헤더 스냅숏도 읽는다 — 인코딩 규칙(AC1021 경계)이 뒤집히면 여기서 잡힌다.
test('헤더(버전·코드페이지·인코딩·단위)가 기대값과 같다', () => {
  expect({ ver: dec.ver, codepage: dec.codepage, encoding: dec.encoding, insunits: headerNum(doc.header, '$INSUNITS', 70, 0) }).toEqual(expected.header);
  expect(expected.header.insunits).toBe(4);   // 이 도면은 mm다(§18.5)
});

test('디코딩·파싱이 300 ms 안에 끝나고 미참조 블록의 엔티티는 0개다', () => {
  const t0 = performance.now();
  const d = parseDxf(decodeDxf(raw).txt);
  const ms = performance.now() - t0;
  expect(ms).toBeLessThan(300);
  expect(d.blocks.get('UNUSED-EQUIP').entities).toEqual([]);
  expect(d.blocks.get('1f plan-1').entities.length).toBeGreaterThan(0);
  expect(d.blocks.get('FIXTURE-OPENING').entities.length).toBeGreaterThan(0);
  expect(d.counts.blocks).toBe(3);
  expect(d.counts.blocksUsed).toBe(2);              // 1f plan-1 + 중첩 FIXTURE-OPENING
  expect(d.counts).toEqual(expected.counts);
  // 미참조 블록의 선분은 전개 결과 어디에도 없다.
  expect(ex.segs.some(s => s.block === 'UNUSED-EQUIP')).toBe(false);
});

test('레이어 판정과 기본 체크가 기대값과 같고 꺼진 레이어 둘은 빠진다', () => {
  expect(rows.map(r => [r.name, r.role, r.segs, r.off])).toEqual(expected.layers);
  expect([...checked].sort()).toEqual(expected.checked);
  expect(rows.filter(r => r.off).map(r => r.name).sort()).toEqual(['CEN', 'TEXT2']);
  expect(checked.has('CEN')).toBe(false);
  expect(checked.has('TEXT2')).toBe(false);
  expect(checked.size).toBeGreaterThanOrEqual(3);
  // 사전 검토 C-3: 04창호는 선분 중앙값이 20 mm 아래여도 개구부로 남는다(문·창의 재료다).
  expect(rows.find(r => r.name === '04창호').role).toBe('opening');
  // 사전 검토 I-4: 도형이 하나도 없는 레이어 정의는 행이 없다.
  expect(rows.every(r => r.segs || r.arcs || r.circles || r.texts || r.dims || r.inserts)).toBe(true);
});

test('벽 추출 결과가 기대값과 같고 최소 보증을 넘는다', () => {
  expect({ faces: extracted.faces.length, pairs: extracted.pairs.length, accepted: extracted.accepted.length, gaps: extracted.gaps.length, guessed: extracted.guessed })
    .toEqual(expected.extract);
  const { stats } = built;
  expect({ walls: stats.walls, rooms: stats.rooms, areaM2: stats.areaM2, openEnds: stats.openEnds.length, thickness: stats.thickness, size: stats.size })
    .toEqual(expected.project);
  // 지어내지 않는 최소 보증(§18.11)
  expect(stats.walls).toBeGreaterThanOrEqual(8);
  expect(stats.rooms).toBeGreaterThanOrEqual(2);
  expect(extracted.guessed).toBe(false);
  // 사전 검토 C-2: 문 자리는 원호가 아니라 면선 쌍의 틈이 알려 준다(Task 9가 이것을 앉힌다).
  expect(extracted.gaps.length).toBeGreaterThanOrEqual(8);   // 하한은 여유를 둔다(실측 10 · Task 8 리뷰 I-2)
  expect(extracted.gaps.every(g => g.width >= 600 && g.width <= 1500)).toBe(true);
});

test('만들어진 프로젝트가 normalizeProject를 통과하고 한글 실명이 방 이름으로 들어간다', () => {
  const { project } = built;
  expect(project).toEqual(normalizeProject(project));
  expect(project.floors[0].height).toBe(3500);
  expect(project.floors[0].walls.every(w => w.height === 3500)).toBe(true);
  expect(project.name).toBe('경산 사동중');                       // 높이 980 mm 제목 문자(레이어 TEXT2)
  const named = project.floors[0].rooms.filter(r => /[가-힣]/.test(r.name));
  expect(named.length + built.stats.unmatchedNames.length).toBeGreaterThanOrEqual(2);
});

// 사전 검토 C-2: 이 도면에 스윙 호가 0개이므로 개구부는 **벽 틈**에서 나온다.
// expected.json은 건드리지 않는다(Task 8의 스냅숏은 벽까지다) — 여기서는 하한만 본다.
test('픽스처의 개구부는 벽 틈에서 나오고 전부 벽에 붙는다', () => {
  const items = buildOpenings({ ex, walls: built.walls, toApp: built.toApp, openingLayers: openRole, gaps: extracted.gaps });
  expect(items.filter(i => i.productId === 'opening-pass').length).toBeGreaterThanOrEqual(10);
  expect(items.every(i => i.attach === 'wall' && typeof i.wallId === 'string')).toBe(true);
  expect(items.every(i => built.walls.some(w => w.id === i.wallId))).toBe(true);
  expect(items.filter(i => i.kind === 'door')).toHaveLength(0);     // 스윙 호가 없다
});
