// 역할표(2026-10-12 · 계획 12 Task 9): 레이어·블록·문자 역할을 규칙 대신 정하는 표가 **파싱 옵션**으로 들어온다.
// 표에 있는 이름은 표가 이기고(키워드·도형 추정을 덮는다 — 행에 byTable), 표에 없는 이름은 규칙 그대로다.
// 블록 종류표는 파이프라인(blockKind)만 바꾸고, 코퍼스 정답(blockBoxes byName)은 이름 정규식만 쓴다.
import { test, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkRoles, LAYER_ROLES, BLOCK_KINDS, TEXT_ROLES } from '../src/io/dxf/roles.js';
import { layerStats, defaultChecked, ROLE_LABEL } from '../src/io/dxf/classify.js';
import { setBlockTable, blockKind, blockKindByName, blockWidth, isOpenBlock, isDoorBlock, blockBoxes, blockOpenings, OPEN_BLOCK, DOOR_BLOCK } from '../src/io/dxf/blockOpenings.js';
import { buildProject } from '../src/io/dxf/toProject.js';
import { makeWall } from '../src/geom/walls.js';
import { rolesOption, kindOk } from '../tools/dxf-corpus/lib.mjs';
import { parseArgs, tableFromResponse, buildRequest, RESPONSE_SCHEMA } from '../tools/dxf-corpus/llm-roles.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
afterEach(() => setBlockTable(null));      // 모듈 수준 표가 다음 테스트로 새지 않게

// ── 표 형식 ──────────────────────────────────────────────────────────────
test('checkRoles: 알려진 역할만 받고 잘못된 칸은 버리며 이유를 적는다', () => {
  expect(LAYER_ROLES).toEqual(Object.keys(ROLE_LABEL));
  expect(BLOCK_KINDS).toEqual(['door', 'window', 'pocket', 'slide', 'pass', 'equip', 'symbol', 'column', 'other']);
  expect(TEXT_ROLES).toEqual(['room', 'area', 'title', 'label', 'axis', 'other']);
  const { table, errors } = checkRoles({
    layers: { 건축: 'wall', WID: 'opening', X: 'door' },
    blocks: { 'BLK-A': { kind: 'window', width: 1200 }, B: { kind: 'equip', width: null }, C: { kind: 'gate' }, D: { kind: 'door', width: -5 } },
    texts: { ' 식당 ': 'room', '(15.4m²)': 'area', 문: 'exit' },
    meta: { model: 'dry-run' },
  });
  expect([...table.layers]).toEqual([['건축', 'wall'], ['WID', 'opening']]);
  expect([...table.blocks]).toEqual([['BLK-A', { kind: 'window', width: 1200 }], ['B', { kind: 'equip', width: null }]]);
  expect([...table.texts]).toEqual([['식당', 'room'], ['(15.4m²)', 'area']]);      // 문자 키는 앞뒤 공백을 뗀다
  expect(errors).toHaveLength(4);
  expect(checkRoles(null)).toEqual({ table: null, errors: ['역할표가 객체가 아니다'] });
  expect(checkRoles({ layers: [] }).errors).toEqual(['layers는 객체여야 한다']);
});

// ── 레이어 ───────────────────────────────────────────────────────────────
const layerRec = (name, color = 7) => [name, { name, color, ltype: '', flags: 0, lw: -3 }];
const docOf = (...recs) => ({ layers: new Map(recs) });
const exOf = ({ segs = [], texts = [], dims = [], inserts = [] } = {}) => ({ segs, arcs: [], circles: [], texts, dims, inserts });
const rectSegs = (layer, x0, y0, w, h, extra = {}) => [
  [[x0, y0], [x0 + w, y0]], [[x0 + w, y0], [x0 + w, y0 + h]], [[x0 + w, y0 + h], [x0, y0 + h]], [[x0, y0 + h], [x0, y0]],
].map(([a, b]) => ({ a, b, layer, src: 'LINE', depth: 0, block: null, ...extra }));
const room = (layer, x0 = 0.5, y0 = 0.25, w = 9000, h = 6000, t = 200, extra = {}) =>
  [...rectSegs(layer, x0, y0, w, h, extra), ...rectSegs(layer, x0 + t, y0 + t, w - 2 * t, h - 2 * t, extra)];
const rolesOf = raw => checkRoles(raw).table;

test('표의 레이어 역할이 키워드 역할을 덮는다 — byTable, 표에 없는 레이어는 규칙 그대로', () => {
  const doc = docOf(layerRec('A-WALL'), layerRec('WAL'), layerRec('DIM'));
  const ex = exOf({ segs: [...room('A-WALL'), ...room('WAL', 20000.5), ...rectSegs('DIM', 0.5, 0.25, 100, 100)] });
  const plain = Object.fromEntries(layerStats(doc, ex).map(r => [r.name, r]));
  const by = Object.fromEntries(layerStats(doc, ex, { roles: rolesOf({ layers: { 'A-WALL': 'other', 없는레이어: 'wall' } }) }).map(r => [r.name, r]));
  expect([by['A-WALL'].keyRole, by['A-WALL'].role, by['A-WALL'].byTable]).toEqual(['wall', 'other', true]);
  // 표에 없는 레이어: 행이 규칙 그대로다(byTable 없음).
  expect(by.WAL).toEqual(plain.WAL);
  expect(by.DIM).toEqual(plain.DIM);
  expect(by.WAL.byTable).toBeUndefined();
  expect([...defaultChecked(Object.values(by))]).toEqual(['WAL']);
  // 표가 없으면(null·빈 표) 예전 그대로다.
  expect(layerStats(doc, ex, { roles: null })).toEqual(layerStats(doc, ex));
  expect(layerStats(doc, ex, { roles: rolesOf({}) })).toEqual(layerStats(doc, ex));
});

test('표가 도형 추정(벽 추정 guessed · 청록 창호 byColor)을 덮는다 — 그 행에서 guessed·byColor를 지운다', () => {
  // 내곡중 꼴: 벽 키워드 레이어가 없어 평행 짝이 긴 `건축`·`A2`·`A3`이 벽으로 추정된다. FUR은 이름이 기구다.
  const doc = docOf(layerRec('건축', 8), layerRec('A2', 8), layerRec('A3', 8), layerRec('WID', 4), layerRec('FUR', 2));
  const segs = [...room('건축', 0.5, 0.25, 30000, 20000), ...room('A2', 40000.5, 0.25, 20000, 15000), ...room('A3', 70000.5, 20000.25, 20000, 15000),
    ...room('WID', 70000.5, 0.25, 9000, 6000, 100), ...rectSegs('FUR', 100000.5, 0.25, 1200, 800)];
  const rowsWith = layers => Object.fromEntries(layerStats(doc, exOf({ segs }), { roles: layers && rolesOf({ layers }) }).map(r => [r.name, r]));
  const plain = rowsWith(null);
  expect([plain.건축.guessed, plain.A2.guessed, plain.A3.guessed, plain.WID.byColor, plain.FUR.role]).toEqual([true, true, true, true, 'equip']);
  const by = rowsWith({ 건축: 'wall', WID: 'equip' });
  expect([by.건축.role, by.건축.byTable, by.건축.guessed]).toEqual(['wall', true, undefined]);
  // 청록 창틀이어도 표가 기구라면 기구다.
  expect([by.WID.role, by.WID.byTable, by.WID.byColor]).toEqual(['equip', true, undefined]);
  // 리뷰 M-1: 표에 없는 레이어는 규칙 그대로 — 표가 벽을 하나 정했다고 A2·A3의 추정 벽이 사라지지 않는다(행이 표 없을 때와 같다).
  expect([by.A2, by.A3, by.FUR]).toEqual([plain.A2, plain.A3, plain.FUR]);
  // 무관한 레이어 하나만 벽이라고 한 표도 추정 벽 셋을 지우지 않는다.
  const fur = rowsWith({ FUR: 'wall' });
  expect([fur.FUR.role, fur.FUR.byTable]).toEqual(['wall', true]);
  expect([fur.건축, fur.A2, fur.A3, fur.WID]).toEqual([plain.건축, plain.A2, plain.A3, plain.WID]);
  // 표가 추정 레이어 하나를 벽이 아니라고 하면 그 행만 바뀐다(남은 추정 벽은 그대로).
  const only = rowsWith({ 건축: 'other' });
  expect([only.건축.role, only.건축.guessed, only.A2, only.A3]).toEqual(['other', undefined, plain.A2, plain.A3]);
});

test('표가 벽을 하나도 남기지 않으면(유일한 벽 레이어를 other로) 표에 없는 레이어끼리 벽 추정을 한 번 더 한다', () => {
  const doc = docOf(layerRec('WAL'), layerRec('A1', 8), layerRec('A2', 8), layerRec('A3', 8));
  const segs = [...room('WAL'), ...room('A1', 20000.5, 0.25, 30000, 20000), ...room('A2', 60000.5, 0.25, 20000, 15000), ...room('A3', 90000.5, 0.25, 20000, 15000)];
  const rowsWith = layers => Object.fromEntries(layerStats(doc, exOf({ segs }), { roles: layers && rolesOf({ layers }) }).map(r => [r.name, r]));
  // 규칙만: 이름이 벽인 WAL이 있으니 추정하지 않는다.
  const plain = rowsWith(null);
  expect(['WAL', 'A1', 'A2', 'A3'].map(n => [plain[n].role, plain[n].guessed])).toEqual([['wall', undefined], ['other', undefined], ['other', undefined], ['other', undefined]]);
  // 표가 WAL을 other로 → 벽이 없다 → 표에 없는 A1~A3끼리 추정한다(표가 정한 WAL은 추정 대상이 아니다).
  const none = rowsWith({ WAL: 'other' });
  expect(['WAL', 'A1', 'A2', 'A3'].map(n => [none[n].role, none[n].guessed])).toEqual([['other', undefined], ['wall', true], ['wall', true], ['wall', true]]);
  expect([...defaultChecked(Object.values(none))].sort()).toEqual(['A1', 'A2', 'A3']);
  // 두 번째 추정도 표가 다른 역할을 준 레이어는 건너뛴다.
  const skip = rowsWith({ WAL: 'other', A2: 'equip' });
  expect(['A1', 'A2', 'A3'].map(n => [skip[n].role, skip[n].guessed])).toEqual([['wall', true], ['equip', undefined], ['wall', true]]);
});

// ── 블록 ─────────────────────────────────────────────────────────────────
const W = makeWall({ a: [0, 0], b: [6000, 0], thickness: 200, height: 3500 });
const bseg = (x0, y0, x1, y1, ins, layer = 'X') => ({ a: [x0, y0], b: [x1, y1], layer, src: 'LINE', ins, block: ins === 1 ? 'BLK-A' : null });
const plan = { name: '1f plan-1', pos: [0, 0], rot: 0, scale: [1, 1], mirrored: false };
const blkEx = () => ({
  inserts: [plan, { name: 'BLK-A', pos: [1000.5, 0], rot: 0, scale: [1, 1], mirrored: false, parent: 0 }],
  segs: [bseg(1000.5, -67.5, 2200.5, -67.5, 1), bseg(1000.5, 67.5, 2200.5, 67.5, 1), bseg(1000.5, -67.5, 1000.5, 67.5, 1), bseg(2200.5, -67.5, 2200.5, 67.5, 1), bseg(0, 0, 6000, 0, 0, 'WAL')],
  arcs: [], polyArcs: [], circles: [], texts: [], dims: [], hatches: [],
});

test('블록 종류표: 이름이 아무것도 말하지 않는 블록이 창(표의 폭)이 되고, 정답 쪽(blockBoxes byName)은 그 표를 보지 않는다', () => {
  expect(blockKind('BLK-A')).toBeNull();
  expect(blockOpenings(blkEx(), [W])).toEqual([]);
  setBlockTable(rolesOf({ blocks: { 'BLK-A': { kind: 'window', width: 1200 }, 'DR-900': { kind: 'equip' }, '미서기단창_1300': { kind: 'window', width: null } } }).blocks);
  expect([blockKind('BLK-A'), blockKindByName('BLK-A'), blockWidth('BLK-A')]).toEqual(['window', null, 1200]);
  const out = blockOpenings(blkEx(), [W]);
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ kind: 'window', name: 'BLK-A', width: 1200, wall: W });
  expect(out[0].t * 6000).toBeCloseTo(1600.5, 6);
  // 파이프라인 쪽 상자(벽 구간화 spans)는 표를 따르고, 정답 쪽 상자는 이름 정규식만 본다.
  expect(blockBoxes(blkEx())).toEqual([{ k: 1, kind: 'window', name: 'BLK-A', width: 1200, box: [1000.5, -67.5, 2200.5, 67.5] }]);
  expect(blockBoxes(blkEx(), { byName: true })).toEqual([]);
  // 표가 이름 규칙을 뒤집는다: DR-900이 기구면 문·창 블록이 아니다(evidence·walls·openings의 판정 모두).
  expect([blockKind('DR-900'), isOpenBlock('DR-900'), isDoorBlock('DR-900'), blockKindByName('DR-900')]).toEqual([null, false, false, 'door']);
  expect([isOpenBlock('BLK-A'), isDoorBlock('BLK-A')]).toEqual([true, false]);
  // 표의 폭이 null이면 이름의 숫자다.
  expect([blockKind('미서기단창_1300'), blockWidth('미서기단창_1300')]).toEqual(['window', 1300]);
  // 표에 없는 이름은 규칙 그대로다.
  expect([blockKind('win-900-3'), blockWidth('win-900-3'), isOpenBlock('win-900-3'), isDoorBlock('dr-1850')]).toEqual(['window', 900, true, true]);
});

test('표가 없으면 isOpenBlock·isDoorBlock은 OPEN_BLOCK·DOOR_BLOCK 정규식과 같다', () => {
  const names = ['DR-900', 'dr-1850', 'win-900-3', '문_슬라이딩 포켓 900', '미서기단창_1300', '보냉고 양문1260-800', '식탁-4인', '', 'SD850', 'AW-1200'];
  expect(names.map(isOpenBlock)).toEqual(names.map(n => OPEN_BLOCK.test(n)));
  expect(names.map(isDoorBlock)).toEqual(names.map(n => DOOR_BLOCK.test(n)));
  expect(names.map(blockKind)).toEqual(names.map(blockKindByName));
  expect(names.map(blockWidth)).toEqual([900, 1850, 900, 900, 1300, 1260, 0, 0, 850, 1200]);
});

// ── 워커: 파싱 옵션 · 파싱마다 비운다 ─────────────────────────────────────────
test('워커는 parse의 roles로 레이어 행을 덮고 블록 표를 세우며, 다음 parse마다(실패해도) 표를 비운다', async () => {
  const posts = [];
  const had = 'self' in globalThis, prev = globalThis.self;
  globalThis.self = { postMessage: m => posts.push(m), onmessage: null };
  try {
    await import('../src/io/dxf/worker.js');
    const handle = data => { posts.length = 0; globalThis.self.onmessage({ data }); return posts.filter(m => m.type !== 'progress').at(-1); };
    const buf = () => { const b = readFileSync(fileURLToPath(new URL('./fixtures/plan-1f-corner.dxf', import.meta.url))); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
    const roles = { layers: { SYM: 'equip' }, blocks: { 'BLK-A': { kind: 'window', width: 1200 } } };
    const a = handle({ type: 'parse', buf: buf(), fileName: 'A.dxf', roles });
    expect(a.type).toBe('parsed');
    const sym = a.summary.layers.find(r => r.name === 'SYM');
    expect([sym.role, sym.byTable]).toEqual(['equip', true]);
    expect(blockKind('BLK-A')).toBe('window');
    expect(handle({ type: 'extract', opts: { layers: a.summary.checked, trace: false } }).type).toBe('extracted');
    // 표 없이 다시 파싱 — 앞 파일의 표가 새지 않는다.
    const b = handle({ type: 'parse', buf: buf(), fileName: 'B.dxf' });
    expect(b.summary.layers.find(r => r.name === 'SYM').byTable).toBeUndefined();
    expect(blockKind('BLK-A')).toBeNull();
    // 표가 있는 파싱 뒤 실패한 파싱도 표를 비운다.
    handle({ type: 'parse', buf: buf(), fileName: 'C.dxf', roles });
    const dwg = new Uint8Array(32);
    [...'AC1032'].forEach((c, i) => { dwg[i] = c.charCodeAt(0); });
    expect(handle({ type: 'parse', buf: dwg.buffer, fileName: 'D.dwg', roles: null })).toMatchObject({ type: 'error', code: 'dwg' });
    expect(blockKind('BLK-A')).toBeNull();
  } finally {
    if (had) globalThis.self = prev; else delete globalThis.self;
  }
});

// ── 문자 ─────────────────────────────────────────────────────────────────
const rect = (x0, y0, x1, y1, thickness = 200) => [
  { a: [x0, y0], b: [x1, y0], thickness }, { a: [x1, y0], b: [x1, y1], thickness }, { a: [x1, y1], b: [x0, y1], thickness }, { a: [x0, y1], b: [x0, y0], thickness },
];
const lay = (x, y, h, text, layer) => ({ p: [x, y], h, text, layer, depth: 0, block: null });
const ROLES = new Map([['TEXT', 'text'], ['급식-재사용', 'equip']]);

test('문자 표: room은 규칙이 버릴 글자도 실명, area는 면적 표기, 다른 역할은 이름이 아니다', () => {
  const box = rect(100.5, 200.25, 6100.5, 4200.25);
  // 기구 레이어의 글자(층 0) · 축선 기호 꼴(X12) · 작은 글자(h 120)는 규칙이 버린다.
  const skipped = [lay(3100.5, 2200.25, 270, '세척실', '급식-재사용'), lay(2000.5, 3000.25, 120, '전처리', 'TEXT')];
  expect(buildProject(box, { texts: skipped, nameRoles: ROLES }).project.floors[0].rooms[0].name).toBe('');
  const tagged = buildProject(box, { texts: skipped, nameRoles: ROLES, roles: rolesOf({ texts: { 세척실: 'room' } }) });
  expect(tagged.project.floors[0].rooms[0].name).toBe('세척실');
  // 실명 둘 + 표가 면적이라고 한 글자(m² 없음): 규칙은 숫자뿐인 글자를 버려 중심에 가까운 조리실을 고르지만, 표의 area는 면적 라벨이라
  // 그 바로 위의 식당이 "면적이 붙은 실명"으로 이긴다(nameRooms ④).
  const two = [lay(1500.5, 3500.25, 300, '식당', 'TEXT'), lay(1500.5, 2900.25, 250, '41.3', 'TEXT'), lay(3300.5, 2300.25, 300, '조리실', 'TEXT')];
  expect(buildProject(box, { texts: two, nameRoles: ROLES }).project.floors[0].rooms[0].name).toBe('조리실');
  const withArea = buildProject(box, { texts: two, nameRoles: ROLES, roles: rolesOf({ texts: { '41.3': 'area' } }) });
  expect(withArea.project.floors[0].rooms[0].name).toBe('식당');
  // label·title·axis·other는 규칙이 받았을 글자라도 이름이 아니다.
  const label = buildProject(box, { texts: [lay(3100.5, 2200.25, 300, '식품창고', 'TEXT')], nameRoles: ROLES, roles: rolesOf({ texts: { 식품창고: 'label' } }) });
  expect(label.project.floors[0].rooms[0].name).toBe('');
  expect(label.stats.unmatchedNames).toEqual([]);
  // 표에 없는 글자는 규칙 그대로(표가 있어도).
  const rule = buildProject(box, { texts: [lay(3100.5, 2200.25, 300, '식품창고', 'TEXT')], nameRoles: ROLES, roles: rolesOf({ texts: { 다른글자: 'room' } }) });
  expect(rule.project.floors[0].rooms[0].name).toBe('식품창고');
});

// ── 코퍼스 도구 인자 ────────────────────────────────────────────────────────
test('--roles 인자: 값이 없거나 --update와 함께면 오류(종료 코드 2의 근거)', () => {
  expect(rolesOption([])).toEqual({ dir: null, error: null });
  expect(rolesOption(['--roles', '../dxf-roles'])).toEqual({ dir: '../dxf-roles', error: null });
  expect(rolesOption(['--roles']).error).toMatch(/값/);
  expect(rolesOption(['--roles', '--update']).error).toMatch(/값/);
  expect(rolesOption(['--roles', 'x', '--update']).error).toMatch(/--update/);
});

test('score.mjs·public.mjs: --roles와 --update를 함께 주면 종료 코드 2', () => {
  for (const tool of ['tools/dxf-corpus/score.mjs', 'tools/dxf-corpus/public.mjs']) {
    const r = spawnSync(process.execPath, [tool, '--roles', 'nowhere', '--update'], { cwd: APP, encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stdout).toMatch(/--update/);
  }
});

// 2026-10-12 · 계획 13 Task 7: 드라이런 역할표 9장(계획 12 Task 9 — 사람이 손으로 쓴 표)이 저장소에 있다(tools/dxf-corpus/roles · README "역할표").
// 그 표로 잰 수치(실파일 sadong 문 18 · sinsang-A 문 16 · 공개 Σ 방 1216 · 정답 없는 방 231 · 문 1336)가 저장소만으로 재현되려면 표의 칸이 하나도
// 버려지면 안 된다 — 버린 칸은 조용히 규칙으로 가서 수치가 바뀐다. 표에는 이름과 역할만 있다(파일 경로·좌표 없음).
test('저장소 역할표 9장: 모두 checkRoles를 오류 없이 지나고 버려지는 칸이 없다', () => {
  const dir = join(APP, 'tools/dxf-corpus/roles');
  const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  expect(files).toEqual(['2suite (1).json', '4suite (10).json', '4suite (9).json', '6suite (6).json', '6suite (8).json',
    'naegok.json', 'sadong.json', 'sinsang-A.json', 'sinsang-B.json']);
  for (const f of files) {
    const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const { table, errors } = checkRoles(raw);
    expect([f, errors]).toEqual([f, []]);
    const n = k => Object.keys(raw[k] ?? {}).length;
    expect([f, table.layers.size, table.blocks.size, table.texts.size]).toEqual([f, n('layers'), n('blocks'), n('texts')]);   // 문자 키 trim 겹침도 없다
    expect([f, Object.keys(raw).filter(k => !['layers', 'blocks', 'texts'].includes(k))]).toEqual([f, []]);
  }
});

// ── llm-roles.mjs (API는 부르지 않는다 — 인자·검사 경로만) ────────────────────────
test('llm-roles: --model이 없으면 2, 키가 없으면 2 "키 필요", --validate는 표 형식만 검사한다', () => {
  expect(parseArgs(['--in', 'a.json', '--out', 'b.json']).error).toMatch(/--model/);
  expect(parseArgs(['--model', 'claude-haiku-4-5', '--in', 'a.json']).error).toMatch(/--out/);
  expect(parseArgs(['--model', 'claude-haiku-4-5', '--in', 'a.json', '--out', 'b.json'])).toMatchObject({ model: 'claude-haiku-4-5', inPath: 'a.json', outPath: 'b.json', error: null });
  const dir = mkdtempSync(join(tmpdir(), 'llm-roles-'));
  try {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const run = (...args) => spawnSync(process.execPath, ['tools/dxf-corpus/llm-roles.mjs', ...args], { cwd: APP, encoding: 'utf8', env });
    expect(run('--in', 'a.json', '--out', 'b.json').status).toBe(2);
    const noKey = run('--model', 'claude-haiku-4-5', '--in', 'a.json', '--out', 'b.json');
    expect(noKey.status).toBe(2);
    expect(noKey.stdout + noKey.stderr).toMatch(/키 필요/);
    const good = join(dir, 'good.json'), bad = join(dir, 'bad.json');
    writeFileSync(good, JSON.stringify({ layers: { WAL: 'wall' }, blocks: { 'DR-900': { kind: 'door', width: 900 } }, texts: { 식당: 'room' } }));
    writeFileSync(bad, JSON.stringify({ layers: { WAL: 'walls' } }));
    expect(run('--validate', good).status).toBe(0);
    expect(run('--validate', bad).status).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// 2026-10-12 · 계획 12 최종 리뷰 X-3(N3-6): 블록 종류 어휘는 한 벌이다 — aa2b710이 slide·pass를 더한 뒤 점수판 kindOk(door·pocket·window만)·
// llm-roles 프롬프트(pass 정의 없음)·README 형식 줄(pass 없음)이 뒤처졌다. 셋 다 BLOCK_KINDS를 따라야 한다.
test('블록 종류 어휘는 한 벌이다 — 점수판 kindOk · llm-roles 프롬프트 · README가 BLOCK_KINDS를 모두 안다', () => {
  const product = { door: 'door-swing-900', pocket: 'door-pocket-900', slide: 'door-slide-900', window: 'window-slide-1200', pass: 'opening-pass' };
  for (const k of Object.keys(product)) expect([k, kindOk(k, product[k])]).toEqual([k, true]);
  expect([kindOk('pass', 'door-swing-900'), kindOk('slide', 'window-slide-1200'), kindOk('window', 'opening-pass'), kindOk('door', 'opening-pass')]).toEqual([false, false, false, false]);
  const system = buildRequest({ layers: [], blocks: [], texts: [] }, 'm').system;
  const kindsLine = system.split('\n').find(l => l.startsWith('Block kinds:'));
  for (const k of BLOCK_KINDS) expect([k, new RegExp(`\\b${k}\\b`).test(kindsLine)]).toEqual([k, true]);
  expect(system).toMatch(/width: the nominal opening width in mm for door\/window\/pocket\/slide\/pass/);
  const readme = readFileSync(join(APP, 'tools/dxf-corpus/README.md'), 'utf8');
  expect(readme).toContain(`"kind": "${BLOCK_KINDS.join('|')}"`);
  expect(readme).toContain('`door`·`window`·`pocket`·`slide`·`pass`만 창·문');
});

// 2026-10-12 · 계획 12 최종 리뷰 M9-7: few-shot 예시가 사동중·내곡중·신상중의 정답을 담는다 — ⓓ 비교 규칙(공개 5장으로만 · 실파일은 참고(누수))이
// 도구 머리 주석과 README에 남아 있어야 한다. 예시를 바꾸면 이 문서도 함께 고친다.
test('llm-roles few-shot 누수: 머리 주석과 README가 ⓓ 비교를 공개 5장으로 한정하고 실파일 수치를 "참고(누수)"로 적는다', () => {
  const src = readFileSync(join(APP, 'tools/dxf-corpus/llm-roles.mjs'), 'utf8'), readme = readFileSync(join(APP, 'tools/dxf-corpus/README.md'), 'utf8');
  for (const doc of [src, readme]) {
    expect(doc).toContain('공개 5장');
    expect(doc).toContain('참고(누수)');
    for (const n of ['2suite (1)', '4suite (9)', '4suite (10)', '6suite (6)', '6suite (8)']) expect(doc).toContain(n);
  }
  const system = buildRequest({ layers: [], blocks: [], texts: [] }, 'm').system;
  for (const n of ['사동중', '내곡중', '신상중', 'DOTE']) expect(system).toContain(n);         // 그래서 누수다
});

test('llm-roles: 응답(배열 꼴) → 역할표(사전 꼴), 요청은 명시한 모델·JSON 스키마 출력이다', () => {
  const table = tableFromResponse({
    layers: [{ name: 'WAL', role: 'wall' }, { name: 'WID', role: 'opening' }],
    blocks: [{ name: 'DR-900', kind: 'door', width: 900 }, { name: '보냉고 양문1260-800', kind: 'equip', width: null }],
    texts: [{ text: '식당', role: 'room' }],
  });
  expect(table).toEqual({ layers: { WAL: 'wall', WID: 'opening' }, blocks: { 'DR-900': { kind: 'door', width: 900 }, '보냉고 양문1260-800': { kind: 'equip', width: null } }, texts: { 식당: 'room' } });
  expect(checkRoles(table).errors).toEqual([]);
  const body = buildRequest({ meta: { file: 'x.dxf' }, layers: [], blocks: [], texts: [] }, 'claude-haiku-4-5');
  expect(body.model).toBe('claude-haiku-4-5');
  expect(body.output_config.format).toEqual({ type: 'json_schema', schema: RESPONSE_SCHEMA });
  expect(RESPONSE_SCHEMA.additionalProperties).toBe(false);
});
