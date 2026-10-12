// 기구 배치 배선(2026-10-12 · 계획 13 Task 3): buildProject가 equipItems(Task 2 · io/dxf/equipment.js)를 개구부·기둥 **뒤에** 부르고,
// 워커 extract 옵션 equipment(기본 켬)가 그것을 켜고 끈다. 기구는 아이템이 늘 뿐이다 — 벽·방·개구부·기둥은 켜든 끄든 같아야 한다
// (계획 13 Global Constraints). equipItems가 받는 네 입력(도면 상자 roi · 레이어 역할 layerRoles · 앱 좌표 기둥 · 층고)도 여기서 못 박는다:
// Task 2 측정에서 layerRoles 없이 돌리면 내곡중이 11 → 7이었다(익명 블록이 이름 규칙으로 other 레이어가 되어 빠진다).
import { test, expect } from 'vitest';
import { buildProject } from '../src/io/dxf/toProject.js';
import { createItem } from '../src/state/schema.js';
import { productById } from '../src/products/catalog.js';
import { buildImportMeta, buildDxfFeedback } from '../src/io/dxfFeedback.js';
import { importDxf } from '../src/io/dxf/client.js';

// DXF 좌표(y 위쪽)의 사각형 중심선 넷.
const rect = (x0, y0, x1, y1, thickness = 200) => [
  { a: [x0, y0], b: [x1, y0], thickness }, { a: [x1, y0], b: [x1, y1], thickness },
  { a: [x1, y1], b: [x0, y1], thickness }, { a: [x0, y1], b: [x0, y0], thickness },
];
// 전개 도형에 explode의 ins 꼬리표를 직접 단다(tests/dxfEquipment.test.js와 같은 꼴). INSERT 점은 일부러 멀리 둔다 — 자리는 도형에서만 읽는다.
const ins = (name, layer = '급식기구') => ({ name, pos: [-741000.5, 338000.25], rot: 0, scale: [1, 1], layer, depth: 0, mirrored: false, block: '*Model_Space' });
const seg = (a, b, k, layer) => ({ a, b, layer, src: 'LINE', ins: k });
const box = (k, x0, y0, x1, y1, layer = '급식기구') => [seg([x0, y0], [x1, y0], k, layer), seg([x1, y0], [x1, y1], k, layer), seg([x1, y1], [x0, y1], k, layer), seg([x0, y1], [x0, y0], k, layer)];

// 9 m × 6 m 방(DXF 0~9000 × 0~6000) · 가운데 기둥 하나(800 각) · 기구 블록 다섯.
const RAW = rect(0, 0, 9000, 6000);
const COLUMNS = [{ c: [4500, 3000], w: 800, h: 800, u: [1, 0] }];
const EX = {
  inserts: [
    ins('세정대 2조 1500-750'),        // 0 → sink-double(제품)
    ins('후드1500-1300'),               // 1 → hood-box(천장 · z = 층고 − 600)
    ins('zw$AB12', 'X-ANON'),           // 2 → 익명 · 레이어 역할이 equip일 때만 선다(이름 규칙으로는 other)
    ins('고정식작업대 700-600'),        // 3 → 기둥 몸통 안 → clash
    ins('다단식선반 1500-750'),         // 4 → 도면 상자(roi) 밖 → 서지 않는다
  ],
  segs: [...box(0, 1000, 1000, 2500, 1750), ...box(1, 6500, 1000, 8000, 2300), ...box(2, 5600, 4000, 6600, 4800, 'X-ANON'),
    ...box(3, 4150, 2700, 4850, 3300), ...box(4, 20000, 20000, 21500, 20750)],
  arcs: [], polyArcs: [], circles: [], texts: [], dims: [], hatches: [],
};
const ROI = { x0: -500, y0: -500, x1: 9500, y1: 6500 };
const ROLES = new Map([['X-ANON', 'equip'], ['급식기구', 'equip']]);
const door = ({ walls }) => [createItem(productById('door-swing-900'), { attach: 'wall', wallId: walls[0].id, t: 0.5, pos: [0, 0], rot: 0 })];
const build = (o = {}) => buildProject(RAW, { height: 3500, columns: COLUMNS, openings: door, ex: EX, roi: ROI, layerRoles: ROLES, ...o });
const floorOf = r => r.project.floors[0];
const structural = it => ['door', 'window', 'opening', 'column'].includes(it.kind);
// id(uid = 시각 + 카운터)는 실행마다 다르다 → 처음 나온 차례(#0, #1 …)로 바꿔 놓고 글자 그대로 비교한다(같은 계산이면 같은 차례다).
const canon = v => { const ids = new Map(); return JSON.stringify(v, (k, x) => (typeof x === 'string' && /^[a-z]+_[0-9a-z]+$/.test(x) ? (ids.has(x) || ids.set(x, `#${ids.size}`), ids.get(x)) : x)); };
// stats.equipment의 꼴: 일곱 키(spec) · skipped는 equipItems의 이유별 표 그대로(이유 이름은 equipment.js 몫이라 여기서 못 박지 않는다).
const KEYS = ['placed', 'product', 'generic', 'anonymous', 'clash', 'overlap', 'skipped'];
const expectZero = e => {
  expect(Object.keys(e)).toEqual(KEYS);
  expect(Object.keys(e.skipped).length).toBeGreaterThan(0);
  expect([...KEYS.slice(0, 6).map(k => e[k]), ...Object.values(e.skipped)].every(v => v === 0)).toBe(true);
};

test('기구는 개구부·기둥 뒤에 붙고, 켜든 끄든 벽·방·개구부·기둥·나머지 통계는 글자 그대로 같다', () => {
  const on = build(), off = build({ equipment: false });
  expect(canon([floorOf(on).walls, floorOf(on).rooms, floorOf(on).items.filter(structural)]))
    .toBe(canon([floorOf(off).walls, floorOf(off).rooms, floorOf(off).items.filter(structural)]));
  const { equipment: e1, items: n1, ...s1 } = on.stats, { equipment: e0, items: n0, ...s0 } = off.stats;
  expect(canon(s1)).toBe(canon(s0));
  expect(floorOf(off).items.map(i => i.productId)).toEqual(['door-swing-900', 'column-square']);
  expect(floorOf(on).items.map(i => i.productId)).toEqual(['door-swing-900', 'column-square', 'sink-double', 'hood-box', 'equip-generic', 'worktable-1800']);
  expect([n0, n1]).toEqual([2, 6]);                                   // stats.items는 층의 아이템 전부(기구 포함)
  expectZero(e0);                                                     // 끄면 같은 모양의 0 통계
  expect(Object.keys(e1)).toEqual(KEYS);
  expect(Object.keys(e1.skipped)).toEqual(Object.keys(e0.skipped));
  expect(e1).toMatchObject({ placed: 4, product: 3, generic: 1, anonymous: 1, clash: 1, overlap: 0 });
  // 전개를 넘기지 않는 옛 호출자(테스트·도구)도 같은 모양의 0이다.
  expectZero(buildProject(RAW, { height: 3500 }).stats.equipment);
});

test('equipItems가 받는 입력: 도면 상자(roi) · 레이어 행의 역할(layerRoles) · 앱 좌표 기둥 아이템 · 층고', () => {
  const items = floorOf(build()).items;
  expect(items.find(i => i.productId === 'sink-double')).toMatchObject({ name: '세정대 2조 1500-750', pos: [-2750, 1625], size: [1500, 750, 850] });
  // 층고: 후드 z = 층고 − 높이(배치 도구의 천장 규칙)
  expect(items.find(i => i.productId === 'hood-box')).toMatchObject({ attach: 'ceiling', z: 2900 });
  expect(floorOf(build({ height: 3000 })).items.find(i => i.productId === 'hood-box').z).toBe(2400);
  // roi: 도면 상자 밖의 선반은 서지 않는다(신상중 A·B는 한 파일의 두 도면 — 사전 검토 C-1). roi가 없으면 선다.
  expect(items.some(i => i.name === '다단식선반 1500-750')).toBe(false);
  expect(build({ roi: null }).stats.equipment.placed).toBe(5);
  // layerRoles: 행이 X-ANON을 기구라 하면 익명 블록이 서고, 없으면 이름 규칙(other)으로 떨어져 단서 없는 익명은 기호로 빠진다.
  const bare = build({ layerRoles: null }).stats.equipment;
  expect([bare.placed, bare.anonymous, bare.skipped.layer]).toEqual([3, 0, 1]);
  // 기둥: 앱 좌표 기둥 아이템(colItems) 몸통 안의 작업대가 clash다 — 기둥이 없으면 0.
  expect(build({ columns: [] }).stats.equipment.clash).toBe(0);
  // 역할표(파싱 때의 roles.checkRoles 표 — Task 2 리뷰: 반드시 넘긴다): 블록 종류 symbol이면 빠지고, 레이어 칸은 행이 없을 때 이름 규칙보다 먼저다.
  const table = { layers: new Map([['X-ANON', 'equip']]), blocks: new Map([['세정대 2조 1500-750', { kind: 'symbol' }]]), texts: new Map() };
  const withTable = build({ roles: table, layerRoles: null });
  expect(floorOf(withTable).items.some(i => i.productId === 'sink-double')).toBe(false);
  expect(withTable.stats.equipment).toMatchObject({ placed: 3, anonymous: 1 });
  expect(withTable.stats.equipment.skipped.symbol).toBe(1);
});

// 2026-10-12 · 계획 13 Task 3 · 계획 12 Task 10: 교정 기록의 스냅숏은 층의 아이템 전부라 기구도 들어가고, 사람이 지운 기구는 itemsDeleted로 잡힌다.
test('교정 기록: 가져온 직후 스냅숏에 기구가 들고, 도면 기구 하나를 지우면 itemsDeleted 1(기둥 지움 0)', () => {
  const { project } = build();
  const meta = buildImportMeta({ project, fileName: '사동중.dxf', opts: { layers: ['WAL'], equipment: true }, stats: {} });
  expect(meta.options.equipment).toBe(true);
  expect(meta.snapshot.items.map(i => i.productId)).toEqual(['door-swing-900', 'column-square', 'sink-double', 'hood-box', 'equip-generic', 'worktable-1800']);
  const fl = project.floors[0], gone = fl.items.find(i => i.productId === 'equip-generic');
  const after = { ...project, floors: [{ ...fl, items: fl.items.filter(i => i !== gone) }], meta: { dxfImport: meta } };
  const fb = buildDxfFeedback(after);
  expect(fb.items.deleted).toEqual([gone.id]);
  expect(fb.summary).toMatchObject({ importedItems: 6, itemsDeleted: 1, columnsDeleted: 0, changes: 1 });
});

// 워커 전체(가짜 self): 이중선 방 하나 + 기구 블록 하나(세정대 2조 1500-750 · 레이어 급식기구). 옵션 equipment는 기본 켬이고 false면 끈다.
const BLOCK = '세정대 2조 1500-750';
const L = (layer, x, y, x2, y2) => ['0', 'LINE', '8', layer, '10', String(x), '20', String(y), '11', String(x2), '21', String(y2)];
const DXF = [
  '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1032', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '2',
  '0', 'LAYER', '2', 'WAL', '70', '0', '62', '3', '0', 'LAYER', '2', '급식기구', '70', '0', '62', '4', '0', 'ENDTAB', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '2', BLOCK, '8', '0', '10', '0', '20', '0', '70', '0',
  ...[[0, 0, 1500, 0], [1500, 0, 1500, 750], [1500, 750, 0, 750], [0, 750, 0, 0]].flatMap(([x, y, x2, y2]) => L('0', x, y, x2, y2)),
  '0', 'ENDBLK', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'ENTITIES',
  ...[[0, 0, 9000, 0], [9000, 0, 9000, 6000], [9000, 6000, 0, 6000], [0, 6000, 0, 0], [200, 200, 8800, 200], [8800, 200, 8800, 5800], [8800, 5800, 200, 5800], [200, 5800, 200, 200]]
    .flatMap(([x, y, x2, y2]) => L('WAL', x, y, x2, y2)),
  '0', 'INSERT', '2', BLOCK, '8', '급식기구', '10', '2000', '20', '2000', '41', '1', '42', '1', '50', '0',
  '0', 'ENDSEC', '0', 'EOF',
].join('\r\n');

test('워커 extract: equipment는 기본 켬(세정대 하나가 제품으로 선다)이고 false면 기구가 없다 — 벽·방은 같다', async () => {
  const posts = [];
  const had = 'self' in globalThis, prev = globalThis.self;
  globalThis.self = { postMessage: m => posts.push(m), onmessage: null };
  try {
    await import('../src/io/dxf/worker.js');
    const handle = data => { posts.length = 0; globalThis.self.onmessage({ data }); return posts.filter(m => m.type !== 'progress').at(-1); };
    const parsed = handle({ type: 'parse', buf: new TextEncoder().encode(DXF).buffer, fileName: 'eq.dxf' });
    expect(parsed.type).toBe('parsed');
    const base = { layers: parsed.summary.checked, trace: false };
    const on = handle({ type: 'extract', opts: base }), off = handle({ type: 'extract', opts: { ...base, equipment: false } });
    expect([on.type, off.type]).toEqual(['extracted', 'extracted']);
    expect(on.stats).toMatchObject({ walls: 4, rooms: 1, equipment: { placed: 1, product: 1, generic: 0, clash: 0 } });
    expectZero(off.stats.equipment);
    expect([off.stats.walls, off.stats.rooms, off.stats.areaM2]).toEqual([on.stats.walls, on.stats.rooms, on.stats.areaM2]);
    const eq = on.project.floors[0].items.filter(i => !structural(i));
    expect(eq.map(i => [i.productId, i.name, i.size])).toEqual([['sink-double', BLOCK, [1500, 750, 850]]]);
    expect(off.project.floors[0].items.filter(i => !structural(i))).toEqual([]);
  } finally { if (had) globalThis.self = prev; else delete globalThis.self; }
});

test('importDxf(편의 경로)도 equipment 옵션을 워커에 그대로 넘긴다', async () => {
  const posted = [];
  const w = { postMessage: msg => { posted.push(msg); queueMicrotask(() => w.onmessage({ data: msg.type === 'parse' ? { type: 'parsed', summary: { checked: ['WAL'] } } : { type: 'extracted', project: {}, stats: {} } })); }, terminate() {} };
  await importDxf({ name: 'a.dxf', arrayBuffer: async () => new ArrayBuffer(4) }, { workerFactory: () => w, equipment: false });
  expect(posted.find(m => m.type === 'extract').opts).toMatchObject({ layers: ['WAL'], equipment: false });
});
