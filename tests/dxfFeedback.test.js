// @vitest-environment jsdom
// 교정 기록(2026-10-12 · 계획 12 Task 10): DXF로 가져온 직후의 선택·결과 스냅숏을 프로젝트 안(meta.dxfImport)에 남기고,
// 내보낼 때 지금 프로젝트와의 차이(지운·그린·옮긴 벽 · 구획선 · 방 이름 · 지운·옮긴 개구부)를 JSON으로 낸다 — 학습 데이터의 씨앗.
// 자동 전송은 없다(서버 없음 · 동의 문제): 사용자가 파일을 내보내 손으로 보낸다.
import { test, expect, vi, beforeEach } from 'vitest';
import { buildImportMeta, buildDxfFeedback, importSnapshot, MOVE_TOL, AREA_TOL, AREA_TOL_MIN } from '../src/io/dxfFeedback.js';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, normalizeProject, activeFloor } from '../src/state/schema.js';
import { serializeProject, parseProject } from '../src/io/file.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { createDxfActions } from '../src/app/dxfActions.js';
import { createProjectActions } from '../src/app/projectActions.js';
import { DXF_FEEDBACK_EXPORTED, DXF_FEEDBACK_NONE, DXF_FEEDBACK_MENU } from '../src/ui/messages.js';

const AT = new Date('2026-10-12T03:04:05.000Z'), NOW = new Date('2026-10-13T00:00:00.000Z');
const W = (id, a, b, thickness = 200, extra = {}) => ({ id, a, b, thickness, height: 3000, colorIn: '#ffffff', ...extra });
const R = (id, name, areaCenter) => ({ id, name, type: 'none', area: areaCenter - 0.4, areaCenter, points: [[0, 0]], wallIds: ['w1'] });
const I = (id, kind, productId, wallId, t, size = [900, 40, 2100]) => ({ id, kind, productId, wallId, t, size, attach: wallId ? 'wall' : 'floor', pos: [1, 2], name: 'x' });
// 가져온 직후의 층: 벽 넷 + 구획선 둘(v0 · v1) · 방 셋 · 문 · 창 · 기둥.
const imported = () => ({
  id: 'f1', name: '1F',
  walls: [W('w1', [0, 0], [6000, 0]), W('w2', [6000, 0], [6000, 4000]), W('w3', [6000, 4000], [0, 4000]), W('w4', [0, 4000], [0, 0]),
    W('v0', [1000, 0], [1000, 4000], 20, { virtual: true }), W('v1', [3000, 0], [3000, 4000], 20, { virtual: true })],
  rooms: [R('r1', '교실', 12), R('r2', '준비실', 12.5), R('r3', '창고', 5)],
  items: [I('d1', 'door', 'door-swing-900', 'w1', 0.25), I('n1', 'window', 'window-slide-1200', 'w3', 0.5, [1200, 40, 1200]), I('c1', 'column', 'column-square', null, 0, [400, 400, 2300])],
});
const OPTS = { layers: ['WAL', 'FIN'], region: 1, thickness: 200, height: 3500, scale: 1, useOpeningFaces: true, autoNames: true, dividerByNames: true, openings: true, trace: false };
const withMeta = (floor, src = imported()) => ({
  name: '사동중', floors: [floor], activeFloor: 0,
  meta: { dxfImport: buildImportMeta({ project: { floors: [src], activeFloor: 0 }, fileName: '사동중.dxf', opts: OPTS, stats: { guessed: false }, at: AT }) },
});

beforeEach(() => {
  document.body.innerHTML = ''; localStorage.clear();
  global.URL.createObjectURL = () => 'blob:x';
  global.URL.revokeObjectURL = () => {};
});

test('가져오기 기록은 시각·파일 이름·체크한 레이어·옵션·스냅숏(정해진 필드만, id 그대로)이다', () => {
  const meta = buildImportMeta({ project: { floors: [imported()] }, fileName: '평면도.dxf', opts: OPTS, stats: { guessed: true }, at: AT });
  expect(Object.keys(meta)).toEqual(['at', 'fileName', 'checked', 'options', 'snapshot']);
  expect(meta.at).toBe('2026-10-12T03:04:05.000Z');
  expect(meta.fileName).toBe('평면도.dxf');
  expect(meta.checked).toEqual(['WAL', 'FIN']);
  // 역할표는 표 자체가 아니라 "받았는지"만 남긴다(rolesGiven). layersGuessed = 벽 레이어를 내용으로 추정했는지(stats.guessed).
  expect(meta.options).toEqual({ region: 1, thickness: 200, height: 3500, scale: 1, useOpeningFaces: true, autoNames: true, dividerByNames: true, openings: true, trace: false, rolesGiven: false, layersGuessed: true });
  expect(buildImportMeta({ project: { floors: [imported()] }, opts: OPTS, roles: { layers: {} }, at: AT }).options.rolesGiven).toBe(true);
  const s = meta.snapshot;
  expect(Object.keys(s)).toEqual(['walls', 'rooms', 'items']);
  expect(s.walls.map(w => Object.keys(w))).toEqual(Array(6).fill(['id', 'a', 'b', 'thickness', 'virtual']));
  expect(s.walls[4]).toEqual({ id: 'v0', a: [1000, 0], b: [1000, 4000], thickness: 20, virtual: true });
  // 방 면적은 도면 기준(areaCenter, m²) — 도면의 면적 표기와 같은 기준이다.
  expect(s.rooms).toEqual([{ id: 'r1', name: '교실', area: 12 }, { id: 'r2', name: '준비실', area: 12.5 }, { id: 'r3', name: '창고', area: 5 }]);
  expect(s.items[0]).toEqual({ id: 'd1', productId: 'door-swing-900', wallId: 'w1', t: 0.25, size: [900, 40, 2100] });
  expect(s.items[2].wallId).toBe(null);
  // 좌표는 0.1 mm로 반올림해 둔다(크기 절약 — 문턱 1 mm보다 한참 작다).
  expect(importSnapshot({ walls: [W('x', [0.04, 1.26], [10.55, 3], 199.96)] }).walls[0]).toEqual({ id: 'x', a: [0, 1.3], b: [10.6, 3], thickness: 200, virtual: false });
  expect(importSnapshot(undefined)).toEqual({ walls: [], rooms: [], items: [] });
});

test('고친 것이 없으면 목록은 모두 비고 요약은 0이다', () => {
  const fb = buildDxfFeedback(withMeta(imported()), { now: NOW });
  expect(fb.version).toBe(1);
  expect(fb.exportedAt).toBe('2026-10-13T00:00:00.000Z');
  expect(fb.import).toEqual({ at: '2026-10-12T03:04:05.000Z', fileName: '사동중.dxf', checked: ['WAL', 'FIN'], options: expect.objectContaining({ region: 1, dividerByNames: true, rolesGiven: false }) });
  expect(fb.walls).toEqual({ deleted: [], added: [], moved: [] });
  expect(fb.rooms).toEqual({ renamed: [], added: [], deleted: [] });
  expect(fb.items).toEqual({ deleted: [], moved: [], resized: [], retyped: [], added: [] });
  expect(fb.summary).toEqual({
    importedWalls: 6, importedRooms: 3, importedItems: 3,
    wallsDeleted: 0, wallsAdded: 0, wallsMoved: 0, dividersDeleted: 0, dividersAdded: 0,
    roomsRenamed: 0, roomsAdded: 0, roomsDeleted: 0, itemsDeleted: 0, itemsMoved: 0, itemsResized: 0, itemsRetyped: 0, itemsAdded: 0, changes: 0,
  });
  // 받는 쪽이 지운 id를 풀 수 있게 가져온 직후의 스냅숏을 함께 싣는다(id는 uid라 다시 가져와도 같은 값이 나오지 않는다).
  expect(fb.snapshot).toEqual(withMeta(imported()).meta.dxfImport.snapshot);
});

test('지운·그린·옮긴 벽 · 구획선 · 방 이름 · 지운·옮긴 개구부를 차이로 낸다', () => {
  const f = imported();
  const wall = id => f.walls.find(w => w.id === id);
  f.walls = f.walls.filter(w => w.id !== 'w2' && w.id !== 'v0');                       // 벽 하나 · 구획선 하나를 지웠다
  wall('w1').b = [6000.5, 0];                                                          // 0.5 mm — 옮긴 것이 아니다(문턱 1 mm)
  wall('w3').a = [6000, 4002];                                                         // 2 mm — 옮겼다
  [wall('w4').a, wall('w4').b] = [wall('w4').b, wall('w4').a];                         // 끝점 순서만 뒤집었다 — 옮긴 것이 아니다
  wall('v1').thickness = 50;                                                           // 두께가 30 mm 바뀌었다 — 옮겼다
  f.walls.push(W('w5', [6000, 0], [6000, 4100], 250), W('v2', [4500, 0], [4500, 4000], 20, { virtual: true }));
  f.rooms = [
    R('r1', '1학년 1반', 13),                                                           // 같은 id · 이름을 바꿨다
    R('r9', '준비실', 12.55),                                                           // id가 바뀐 방: 면적 차 0.05(1 % 안) · 같은 이름 → 짝(변경 없음)
    R('r8', '교무실', 30),                                                              // 새 방
  ];                                                                                   // r3(창고 5 m²)은 짝이 없다 → 지움
  f.items = [
    I('d1', 'door', 'door-swing-900', 'w1', 0.3),                                       // 6 m 벽에서 t 0.05 = 300 mm → 옮김
    I('c1', 'column', 'column-square', null, 0, [500, 500, 2300]),                       // 크기만 바뀌었다
    I('d2', 'door', 'door-swing-1000', 'w5', 0.5, [1000, 40, 2100]),                     // 새 문
    I('s1', 'product', 'sofa-3', null, 0, [2000, 900, 800]),                            // 가구는 교정이 아니다 — 싣지 않는다
  ];                                                                                   // n1(창)은 지웠다
  const fb = buildDxfFeedback(withMeta(f), { now: NOW });
  expect(fb.walls.deleted).toEqual(['w2', 'v0']);
  expect(fb.walls.added).toEqual([
    { id: 'w5', a: [6000, 0], b: [6000, 4100], thickness: 250, virtual: false },
    { id: 'v2', a: [4500, 0], b: [4500, 4000], thickness: 20, virtual: true },
  ]);
  expect(fb.walls.moved).toEqual([
    { id: 'w3', from: { a: [6000, 4000], b: [0, 4000], thickness: 200 }, to: { a: [6000, 4002], b: [0, 4000], thickness: 200 } },
    { id: 'v1', from: { a: [3000, 0], b: [3000, 4000], thickness: 20 }, to: { a: [3000, 0], b: [3000, 4000], thickness: 50 } },
  ]);
  expect(fb.rooms.renamed).toEqual([{ id: 'r1', from: '교실', to: '1학년 1반' }]);
  expect(fb.rooms.added).toEqual([{ id: 'r8', name: '교무실', area: 30 }]);
  expect(fb.rooms.deleted).toEqual(['r3']);
  expect(fb.items.deleted).toEqual(['n1']);
  expect(fb.items.moved).toEqual([{ id: 'd1', from: { wallId: 'w1', t: 0.25 }, to: { wallId: 'w1', t: 0.3 } }]);
  expect(fb.items.resized).toEqual([{ id: 'c1', from: [400, 400, 2300], to: [500, 500, 2300] }]);
  expect(fb.items.added).toEqual([{ id: 'd2', productId: 'door-swing-1000', wallId: 'w5', t: 0.5, size: [1000, 40, 2100] }]);
  expect(fb.items.retyped).toEqual([]);                                                // 제품을 바꾼 것은 없다
  expect(fb.summary).toMatchObject({
    wallsDeleted: 2, wallsAdded: 2, wallsMoved: 2, dividersDeleted: 1, dividersAdded: 1,
    roomsRenamed: 1, roomsAdded: 1, roomsDeleted: 1, itemsDeleted: 1, itemsMoved: 1, itemsResized: 1, itemsAdded: 1, changes: 13,
  });
  expect(MOVE_TOL).toBe(1);
});

// 수정 wave(Task 10 리뷰 M-1): 검사기의 "제품 교체"(itemOps.replaceProduct)는 아이템 id를 지킨 채 productId·kind를 바꾼다 — 잘못 읽은
// 개구부를 고치는 가장 흔한 방법인데, 예전에는 같은 크기면 아무것도 남지 않고 "가져온 뒤 고친 것이 없습니다"라고 알렸다.
test('제품을 바꾼 개구부는 retyped로 낸다 — 같은 크기면 그것 하나, 크기도 바뀌면 resized에도 함께', () => {
  const f = imported();
  f.items = f.items.map(it => (it.id === 'd1' ? { ...it, productId: 'door-slide-900' } : it));                  // 여닫이 → 미닫이(같은 크기)
  let fb = buildDxfFeedback(withMeta(f), { now: NOW });
  expect(fb.items.retyped).toEqual([{ id: 'd1', from: 'door-swing-900', to: 'door-slide-900', kind: 'door' }]);
  expect([fb.items.resized, fb.items.moved, fb.items.deleted, fb.items.added]).toEqual([[], [], [], []]);
  expect([fb.summary.itemsRetyped, fb.summary.changes]).toEqual([1, 1]);
  expect(DXF_FEEDBACK_EXPORTED(fb.summary)).toContain('종류 1');                                                 // "고친 것이 없습니다"가 아니다
  // 창 → 통로(개구부): 크기도 달라졌다 — 두 목록에 함께 나온다(종류와 폭은 따로 쓰이는 라벨이다).
  f.items = f.items.map(it => (it.id === 'n1' ? { ...it, kind: 'opening', productId: 'opening-pass', size: [900, 40, 2100] } : it));
  fb = buildDxfFeedback(withMeta(f), { now: NOW });
  expect(fb.items.retyped).toEqual([
    { id: 'd1', from: 'door-swing-900', to: 'door-slide-900', kind: 'door' },
    { id: 'n1', from: 'window-slide-1200', to: 'opening-pass', kind: 'opening' },
  ]);
  expect(fb.items.resized).toEqual([{ id: 'n1', from: [1200, 40, 1200], to: [900, 40, 2100] }]);
  expect([fb.summary.itemsRetyped, fb.summary.itemsResized, fb.summary.changes]).toEqual([2, 1, 3]);
});

test('id가 바뀐 방은 도면 기준 면적이 가까운 짝으로 맞춘다 — 이름이 같은 짝이 먼저, 문턱 밖이면 지움 + 새 방', () => {
  const src = imported();
  src.rooms = [R('r1', '교실', 12), R('r2', '준비실', 12.1), R('r3', '창고', 5), R('r4', '자료실', 20)];
  const f = imported();
  // 벽을 지우고 다시 그려 detectRooms가 새 id를 준 방들. r11 '교실' 12.08은 r1(차 0.08 · 같은 이름)과 r2(차 0.02 · 다른 이름) 둘 다의
  // 문턱(1 % · 최소 0.05 m²) 안이다 — 이름이 같은 짝을 먼저 잡으므로 r1과 짝이고 r2는 지운 방이다. r13 '창고' 5.2는 r3과 차 0.2 > 0.052(문턱 밖).
  f.rooms = [R('r11', '교실', 12.08), R('r13', '창고', 5.2), R('r14', '회의실', 20.1)];
  const fb = buildDxfFeedback(withMeta(f, src), { now: NOW });
  expect(fb.rooms.renamed).toEqual([{ id: 'r14', was: 'r4', from: '자료실', to: '회의실' }]);   // 짝은 면적으로 · 이름은 바뀌었다
  expect(fb.rooms.added).toEqual([{ id: 'r13', name: '창고', area: 5.2 }]);
  expect(fb.rooms.deleted).toEqual(['r2', 'r3']);
  expect([AREA_TOL, AREA_TOL_MIN]).toEqual([0.01, 0.05]);
});

test('DXF로 가져온 프로젝트가 아니면(meta 없음 · 스냅숏 없음 · 이상한 값) null이다', () => {
  expect(buildDxfFeedback(createEmptyProject())).toBe(null);
  expect(buildDxfFeedback({ ...createEmptyProject(), meta: 5 })).toBe(null);
  expect(buildDxfFeedback({ ...createEmptyProject(), meta: { dxfImport: { at: 'x' } } })).toBe(null);
  expect(buildDxfFeedback(null)).toBe(null);
});

test('저장 형식: meta.dxfImport는 저장·불러오기 왕복에서 그대로 남고, meta 없는 옛 파일은 그대로 열린다', () => {
  const store = createStore(createEmptyProject('왕복'));
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  const meta = buildImportMeta({ project: store.get(), fileName: 'a.dxf', opts: { layers: ['WAL'], region: 0 }, at: AT });
  const p = { ...store.get(), meta: { dxfImport: meta, other: { keep: 1 } } };
  const back = parseProject(serializeProject(p));
  expect(back.meta).toEqual(p.meta);                                    // 모르는 meta 필드도 그대로다(normalizeProject의 ...src)
  expect(buildDxfFeedback(back, { now: NOW }).summary.changes).toBe(0);  // 방 id도 다시 계산(detectRooms) 뒤 그대로다
  const old = JSON.parse(serializeProject(store.get()));
  expect('meta' in old).toBe(false);
  const loaded = normalizeProject(old);
  expect('meta' in loaded).toBe(false);                                 // 옛 파일에 빈 meta를 만들어 넣지 않는다
  expect(serializeProject(normalizeProject(loaded))).toBe(serializeProject(loaded));
});

const readBlob = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsText(b); });

test('가져오기 배선부터 내보내기까지: 교체한 프로젝트가 기록을 갖고, 고친 뒤 내보내면 그 차이가 파일로 나온다', async () => {
  const store = createStore(createEmptyProject()), ui = createUiState(), toasts = [];
  let hooks = null;
  const dxf = createDxfActions({ store, ui, view: { fit: vi.fn() }, toast: m => toasts.push(m), openDialog: o => { hooks = o; } });
  dxf.open();
  // 검토 창이 넘기는 모양 그대로(대화상자가 meta를 붙여 onImported에 넘긴다 — tests/dxfDialog.test.js).
  const project = normalizeProject({ name: '사동중', floors: [{ ...imported(), rooms: [], items: [] }] });
  project.meta = { dxfImport: buildImportMeta({ project, fileName: '사동중.dxf', opts: OPTS, at: AT }) };
  expect(await hooks.onImported({ project, stats: { walls: 6, rooms: 0 } })).toBe(true);
  expect(store.get().meta.dxfImport.fileName).toBe('사동중.dxf');
  // 사용자가 벽 하나를 지운다.
  store.dispatch(d => { d.floors[0].walls = d.floors[0].walls.filter(w => w.id !== 'w2'); });
  const blobs = [], names = [];
  global.URL.createObjectURL = b => { blobs.push(b); return 'blob:x'; };
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { names.push(this.download); });
  const pa = createProjectActions({ store, ui, view: { fit: vi.fn() }, toast: m => toasts.push(m) });
  pa.actions.exportDxfFeedback();
  click.mockRestore();
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/^사동중_\d{8}-\d{4}-dxf-feedback\.json$/);
  expect(blobs[0].type).toBe('application/json');
  const fb = JSON.parse(await readBlob(blobs[0]));
  expect(fb.walls.deleted).toEqual(['w2']);
  expect(fb.summary.changes).toBe(1);
  expect(toasts.at(-1)).toBe(DXF_FEEDBACK_EXPORTED(fb.summary));
  expect(activeFloor(store.get()).walls).toHaveLength(5);              // 내보내기는 프로젝트를 건드리지 않는다
});

test('교정 기록 문구', () => {
  expect(DXF_FEEDBACK_MENU).toBe('교정 기록 내보내기');
  expect(DXF_FEEDBACK_NONE).toBe('DXF로 가져온 프로젝트가 아닙니다');
  const zero = { wallsDeleted: 0, wallsAdded: 0, wallsMoved: 0, roomsRenamed: 0, itemsDeleted: 0, itemsMoved: 0, itemsRetyped: 0, changes: 0 };
  expect(DXF_FEEDBACK_EXPORTED(zero)).toBe('교정 기록을 내보냈습니다 — 가져온 뒤 고친 것이 없습니다');
  expect(DXF_FEEDBACK_EXPORTED({ ...zero, wallsDeleted: 2, wallsAdded: 1, wallsMoved: 3, roomsRenamed: 4, itemsDeleted: 5, itemsMoved: 6, itemsRetyped: 7, changes: 28 }))
    .toBe('교정 기록을 내보냈습니다 — 벽 지움 2 · 그림 1 · 옮김 3 · 방 이름 4 · 문·창 지움 5 · 옮김 6 · 종류 7');
});
