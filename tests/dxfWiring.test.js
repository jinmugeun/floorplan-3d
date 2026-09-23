// @vitest-environment jsdom
// §18.6의 끊긴 끝점 안내(배너 문장 + 2D 빨간 ✚ + [보기]). §18.7의 진입점 배선은 Task 14가
// 이 파일 끝에 덧붙인다.
import { test, expect, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, createFloor, activeFloor } from '../src/state/schema.js';
import { createDxfActions } from '../src/app/dxfActions.js';
import { openStartScreen } from '../src/ui/startScreen.js';
import { createFileActions } from '../src/app/fileActions.js';
import { shellHtml } from '../src/ui/shellHtml.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { createOpenEnds, OPEN_END_COLOR, OPEN_END_PX } from '../src/view2d/openEnds2d.js';
import { createBanner } from '../src/ui/banner.js';
import { DXF_OPEN_ENDS, DXF_OPEN_ENDS_VIEW, DXF_IMPORTED, DXF_CARD_TITLE, DXF_CARD_DESC, CONFIRM_LOAD } from '../src/ui/messages.js';

// 기록용 2D 컨텍스트: 메서드는 호출을 그때의 strokeStyle·lineWidth와 함께 쌓고, 두 상태는
// 평범한 속성이다(Proxy는 대입을 기록하지 못해 색·굵기를 검사할 수 없다 — 리뷰 I-2).
function recCtx() {
  const calls = [];
  const ctx = { calls, strokeStyle: null, lineWidth: 0 };
  for (const op of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'stroke']) {
    ctx[op] = (...args) => calls.push({ op, args, strokeStyle: ctx.strokeStyle, lineWidth: ctx.lineWidth });
  }
  return ctx;
}

test('끊긴 끝점 오버레이가 빨간 ✚를 그리고 현재 점을 굵게 한다', () => {
  const ui = createUiState();
  const { overlay } = createOpenEnds(ui, { centerOn: vi.fn() });
  const toScreen = p => [p[0] / 10, p[1] / 10];
  const api = { toScreen };
  const ctx = recCtx();
  overlay(ctx, api);
  expect(ctx.calls).toHaveLength(0);              // 안내가 없으면 아무것도 그리지 않는다
  const pts = [[0.5, 0.25], [1000.5, 2000.25], [3000.5, 4000.75]];
  ui.set({ openEnds: { pts, index: 2 } });        // [보기]를 두 번 누른 상태 → 현재 점은 pts[1]
  overlay(ctx, api);
  const hi = OPEN_END_PX * 1.6;
  expect(hi).toBe(14.4);
  // 십자 하나: 중심은 toScreen(월드 소수 좌표)이고 팔 길이는 화면 px다(줌과 무관).
  const cross = (pt, r, lineWidth) => {
    const [x, y] = toScreen(pt);
    return [
      { op: 'beginPath', args: [], lineWidth },
      { op: 'moveTo', args: [x - r, y], lineWidth },
      { op: 'lineTo', args: [x + r, y], lineWidth },
      { op: 'moveTo', args: [x, y - r], lineWidth },
      { op: 'lineTo', args: [x, y + r], lineWidth },
      { op: 'stroke', args: [], lineWidth },
    ];
  };
  expect(ctx.calls[0].op).toBe('save');                          // save/restore가 그리기를 감싼다
  expect(ctx.calls[ctx.calls.length - 1].op).toBe('restore');
  const drawn = ctx.calls.filter(c => c.op !== 'save' && c.op !== 'restore');
  expect(drawn.map(({ op, args, lineWidth }) => ({ op, args, lineWidth }))).toEqual([
    ...cross(pts[0], OPEN_END_PX, 2),
    ...cross(pts[1], hi, 3),                       // 현재 점만 반지름 14.4 · lineWidth 3
    ...cross(pts[2], OPEN_END_PX, 2),
  ]);
  expect(ctx.strokeStyle).toBe(OPEN_END_COLOR);                  // 빨간색이 그리기 경로에서 대입된다
  expect(drawn.every(c => c.strokeStyle === OPEN_END_COLOR)).toBe(true);
  expect(OPEN_END_COLOR).toBe('#dc2626');
  expect(OPEN_END_PX).toBe(9);
});

test('[보기]가 올린 index를 오버레이 모듈이 카메라 이동으로 옮긴다', () => {
  const ui = createUiState();
  const centerOn = vi.fn();
  createOpenEnds(ui, { centerOn });
  const pts = [[0.5, 0.25], [1000.5, 2000.25], [3000.5, 4000.75]];
  ui.set({ openEnds: { pts, index: 0 } });
  expect(centerOn).not.toHaveBeenCalled();       // 켜는 것만으로는 카메라가 움직이지 않는다
  for (let i = 1; i <= 4; i++) ui.set({ openEnds: { pts, index: i } });
  expect(centerOn.mock.calls.map(c => c[0])).toEqual([pts[0], pts[1], pts[2], pts[0]]);  // 돌아간다
});

test('벽을 고치면 낡은 안내가 사라진다', () => {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  createOpenEnds(ui, { store });
  ui.set({ openEnds: { pts: [[0.5, 0.25]], index: 0 } });
  addWalls(store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200));
  expect(ui.get().openEnds).toBe(null);
});

test('벽과 무관한 편집·{ record: false } 쓰기·층 왕복은 안내를 지우지 않는다', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200));
  store.dispatch(d => { d.floors.push(createFloor('Floor 2')); });
  const ui = createUiState();
  createOpenEnds(ui, { store });
  const oe = { pts: [[0.5, 0.25], [1.5, 2.5]], index: 0 };
  ui.set({ openEnds: oe });                                            // 여기서 기준 서명을 잡는다
  store.dispatch(d => { d.name = '이름만 고침'; });                     // 벽과 무관한 dispatch
  store.dispatch(d => { d.floors[0].rooms = []; }, { record: false }); // 되돌리기에 남지 않는 쓰기
  expect(ui.get().openEnds).toBe(oe);                                  // structuredClone에 속지 않는다
  store.dispatch(d => { d.activeFloor = 1; }, { record: false });      // 다른 층으로 갔다가
  store.dispatch(d => { d.floors[1].walls.push(...rectWalls([0.5, 0.25], [1000.5, 1000.25], 100)); });
  store.dispatch(d => { d.activeFloor = 0; }, { record: false });      // 돌아온다
  expect(ui.get().openEnds).toBe(oe);                                  // 기준 층의 벽은 그대로다
  store.dispatch(d => { d.floors[0].walls[0].thickness = 250.5; });    // 기준 층의 두께가 바뀌면
  expect(ui.get().openEnds).toBe(null);                                // 그때 지운다
});

test('되돌리기로 벽이 사라져도 낡은 안내는 지워진다', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200));
  const ui = createUiState();
  createOpenEnds(ui, { store });
  ui.set({ openEnds: { pts: [[0.5, 0.25]], index: 0 } });
  store.undo();                                  // 벽 넷이 되돌아 사라진다 → 안내가 낡았다
  expect(ui.get().openEnds).toBe(null);
});

test('안내는 store.swap 뒤에 켜야 살아남는다(배선 순서) · destroy()는 두 번 불러도 안전하다', () => {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  const guide = createOpenEnds(ui, { store });
  const imported = createEmptyProject('가져온 도면');
  imported.floors[0].walls = rectWalls([0.5, 0.25], [4000.5, 3000.25], 200);
  store.swap(imported);                          // 1) 프로젝트를 먼저 앉히고
  const oe = { pts: [[0.5, 0.25], [4000.5, 3000.25]], index: 0 };
  ui.set({ openEnds: oe });                      // 2) 그 다음에 안내를 켠다(Task 14의 순서)
  expect(ui.get().openEnds).toBe(oe);            // swap 알림은 이미 지나갔으므로 살아 있다
  store.dispatch(d => { d.name = '이름만 고침'; });
  expect(ui.get().openEnds).toBe(oe);
  addWalls(store, rectWalls([10.5, 10.25], [500.5, 500.25], 100));  // 진짜 벽 편집에서만
  expect(ui.get().openEnds).toBe(null);                             // 사라진다
  // 순서를 어기면(먼저 켜고 나중에 swap) 안내는 조용히 사라진다 — 위 계약이 실재한다는 증거다.
  ui.set({ openEnds: { pts: [[0.5, 0.25]], index: 0 } });
  store.swap(createEmptyProject());
  expect(ui.get().openEnds).toBe(null);
  guide.destroy();
  guide.destroy();                               // 두 번째 호출은 무시된다(정리는 만든 쪽 main.js 몫)
  ui.set({ openEnds: { pts: [[0.5, 0.25]], index: 0 } });
  addWalls(store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200));
  expect(ui.get().openEnds).not.toBe(null);      // 파괴된 뒤에는 더 이상 관여하지 않는다
});

test('배너가 끊긴 끝점을 말하고 [보기]가 index를 올린다', () => {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  const el = document.createElement('div');
  document.body.appendChild(el);
  const banner = createBanner({ store, ui, el });
  ui.set({ openEnds: { pts: [[0.5, 0.25], [1.5, 2.5]], index: 0 } });
  banner.render(ui.get());
  expect(el.hidden).toBe(false);
  expect(el.textContent).toContain(DXF_OPEN_ENDS(2));
  const btn = el.querySelector('#btnOpenEnds');
  expect(btn.textContent).toBe(DXF_OPEN_ENDS_VIEW);
  btn.click();
  expect(ui.get().openEnds.index).toBe(1);
  btn.click();
  expect(ui.get().openEnds.index).toBe(2);
  ui.set({ openEnds: null });
  banner.render(ui.get());
  expect(el.hidden).toBe(true);
  banner.destroy();
});

// onImported가 받는 인자 그대로: { project, stats }. 수치는 2026-09-23 실파일 실측이다.
const imported = (walls = 213, rooms = 52) => {
  const project = createEmptyProject('경산 사동중');
  project.floors[0].walls = rectWalls([-3000, -2000], [3000, 2000], 200, 3500);
  return { project, stats: { walls, rooms, areaM2: 249.7, openEnds: [[0.5, 0.25], [1000.5, 2000.25]], thickness: [[200, 4]], unmatchedNames: [], items: 128, size: [6000, 4000] } };
};
function actions(opts = {}) {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  const view = { fit: vi.fn(), centerOn: vi.fn(), requestRender: vi.fn() };
  const toasts = [], marks = [];
  let dialogOpts = null;
  const dxf = createDxfActions({
    store, ui, view, toast: m => toasts.push(m),
    markSaved: k => marks.push(k), saveNow: vi.fn(), onProjectSwap: vi.fn(),
    openDialog: o => { dialogOpts = o; return { close: vi.fn() }; },
    ...opts,
  });
  return { store, ui, view, toasts, marks, dxf, opened: () => dialogOpts };
}

test('가져오기는 swap 한 번으로 끝나고 되돌릴 단계를 남기지 않는다', async () => {
  const { store, ui, view, toasts, marks, dxf, opened } = actions();
  dxf.open();
  expect(opened()).toBeTruthy();
  const payload = imported();
  const stats = payload.stats;
  const ok = await opened().onImported(payload);
  expect(ok).toBe(true);
  expect(activeFloor(store.get()).walls).toHaveLength(4);
  expect(store.canUndo()).toBe(false);
  expect(store.canRedo()).toBe(false);
  expect(view.fit).toHaveBeenCalledTimes(1);
  expect(marks).toEqual(['none']);
  expect(toasts).toEqual([DXF_IMPORTED(213, 52)]);
  // Task 13 재검토 I-4: 안내는 **가져온 층의 것**이라 층 id가 함께 들어간다.
  expect(ui.get().openEnds).toEqual({ pts: stats.openEnds, index: 0, floor: activeFloor(store.get()).id });
});

test('작업 중이면 CONFIRM_LOAD가 먼저이고, 취소하면 도면이 그대로다', async () => {
  const confirm = vi.fn(async () => false);
  const saveNow = vi.fn();
  const { store, dxf, opened } = actions({ confirm, saveNow, isDirty: () => true });
  addWalls(store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200));
  const before = store.get();
  dxf.open();
  expect(await opened().onImported(imported())).toBe(false);
  expect(confirm).toHaveBeenCalledWith(CONFIRM_LOAD);
  expect(saveNow).not.toHaveBeenCalled();
  expect(store.get()).toBe(before);              // 한 글자도 바뀌지 않는다
  // 확인하면 자동 저장본을 먼저 남기고 교체한다(fileActions.loadFile과 같은 순서).
  const yes = actions({ confirm: async () => true, saveNow, isDirty: () => true });
  addWalls(yes.store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200));
  yes.dxf.open();
  expect(await yes.opened().onImported(imported())).toBe(true);
  expect(saveNow).toHaveBeenCalledTimes(1);
  expect(yes.store.canUndo()).toBe(false);
});

test('onDxfFile은 떨어뜨린 파일을 그대로 대화상자에 넘긴다', () => {
  const { dxf, opened } = actions();
  const f = { name: '평면도.dxf' };
  dxf.onDxfFile(f);
  expect(opened().file).toBe(f);
});

test('시작 화면에 DXF 카드가 네 번째 동작 카드로 들어간다', () => {
  document.body.innerHTML = ''; localStorage.clear();
  const calls = [];
  openStartScreen({ store: createStore(createEmptyProject()), onDxf: () => calls.push('dxf') });
  const cards = [...document.querySelectorAll('.start-card:not(.tpl)')];
  expect(cards.map(c => c.dataset.start)).toEqual(['empty', 'upload', 'dxf', 'sample']);
  const card = document.querySelector('[data-start="dxf"]');
  expect(card.textContent).toContain(DXF_CARD_TITLE);
  expect(card.textContent).toContain(DXF_CARD_DESC);
  expect(card.querySelector('canvas')).not.toBeNull();     // 다른 동작 카드와 같은 높이
  card.click();
  expect(calls).toEqual(['dxf']);
  expect(document.querySelector('#startScreen')).toBeNull();
});

test('캔버스에 떨어뜨린 .dxf는 onDxfFile로 가고 [불러오기]가 둘 다 받는다', async () => {
  const onDxfFile = vi.fn();
  const store = createStore(createEmptyProject());
  const acts = createFileActions({ store, ui: createUiState(), view: { fit: vi.fn() }, view3d: { capture: () => 'data:,' }, onDxfFile });
  const el = document.createElement('div');
  document.body.appendChild(el);
  acts.wireDrop(el);
  const drop = files => { const ev = new Event('drop', { bubbles: true, cancelable: true }); ev.dataTransfer = { files }; el.dispatchEvent(ev); };
  const dxfFile = { name: '평면도.DXF', type: '', text: async () => '' };
  drop([dxfFile]);
  expect(onDxfFile).toHaveBeenCalledWith(dxfFile);          // 확장자는 대소문자를 가리지 않는다
  // JSON 경로는 그대로다.
  drop([{ name: 'a.json', type: 'application/json', text: async () => '{}' }]);
  await new Promise(r => setTimeout(r, 0));
  expect(onDxfFile).toHaveBeenCalledTimes(1);
  // 같은 [불러오기] 버튼이 둘 다 받는다.
  const created = [];
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(tag => { const e = realCreate(tag); if (tag === 'input') { e.click = () => {}; created.push(e); } return e; });
  acts.openFileDialog();
  expect(created[0].accept).toBe('.json,.dxf,application/json');
  // 선택창의 .dxf 갈래도 onDxfFile로 간다 — accept만 보면 onchange를 옛 형태로 되돌려도 통과한다(Task 14 리뷰 I-1).
  Object.defineProperty(created[0], 'files', { value: [dxfFile] });
  created[0].onchange();
  expect(onDxfFile).toHaveBeenCalledTimes(2);
  expect(onDxfFile).toHaveBeenLastCalledWith(dxfFile);
  document.createElement.mockRestore();
});

test('셸 마크업과 main.js가 세 진입점을 배선한다', async () => {
  expect(shellHtml()).toContain('data-action="dxf"');
  // 사전 검토 C-6: 이 파일은 **jsdom 환경**이라 `new URL(…, import.meta.url)`이
  // `http://localhost:3000/src/main.js`가 되고 `fileURLToPath`가 던진다(Vite가 그 패턴을
  // 에셋 URL로 바꾼다). vitest의 cwd가 `app/`이므로 경로 문자열로 읽는다.
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const main = readFileSync(resolve(process.cwd(), 'src/main.js'), 'utf8');
  expect(main).toContain("createDxfActions({");
  expect(main).toContain("[data-action=\"dxf\"]");
  expect(main).toContain('createOpenEnds(ui,');
  expect(main).toContain('onDxfFile:');
  expect(main).toContain('onDxf:');
  expect(main).toContain('overlay: openEnds.overlay');
});

// Task 13 재검토 I-4: 안내는 **가져온 그 층**의 것이다. 다른 층으로 가면 배너도 빨간 ✚도 감추고
// (지우지는 않는다), 돌아오면 다시 보인다 — 다른 층의 벽을 가리키는 빨간 십자는 거짓말이다.
test('안내는 가져온 층에서만 보인다(다른 층에서는 배너도 마커도 없다)', () => {
  document.body.innerHTML = '';
  const store = createStore(createEmptyProject());
  store.dispatch(d => { d.floors.push(createFloor('Floor 2')); });
  const ui = createUiState();
  const el = document.createElement('div');
  document.body.appendChild(el);
  const banner = createBanner({ store, ui, el });
  const { overlay } = createOpenEnds(ui, { store });
  const floor = activeFloor(store.get()).id;
  const draws = () => { const ctx = recCtx(); overlay(ctx, { toScreen: p => p }); return ctx.calls.length; };
  ui.set({ openEnds: { pts: [[0.5, 0.25], [1000.5, 2000.25]], index: 0, floor } });
  banner.render(ui.get());
  expect(el.hidden).toBe(false);
  expect(draws()).toBeGreaterThan(0);
  store.dispatch(d => { d.activeFloor = 1; }, { record: false });   // 다른 층으로 간다
  banner.render(ui.get());
  expect(el.hidden).toBe(true);
  expect(draws()).toBe(0);
  expect(ui.get().openEnds.floor).toBe(floor);                      // 안내 자체는 살아 있다
  store.dispatch(d => { d.activeFloor = 0; }, { record: false });   // 돌아오면
  banner.render(ui.get());
  expect(el.hidden).toBe(false);                                    // 다시 보인다
  expect(draws()).toBeGreaterThan(0);
  banner.destroy();
});

// m-8: 층은 **번호가 아니라 id**로 가린다 — 앞 층을 지우면 번호가 밀린다.
test('가져온 층보다 앞의 층을 지워도 안내는 살아남는다', () => {
  const store = createStore(createEmptyProject());
  store.dispatch(d => { d.floors.unshift(createFloor('지하 1층')); d.activeFloor = 1; });
  const ui = createUiState();
  const { overlay } = createOpenEnds(ui, { store });
  const oe = { pts: [[0.5, 0.25]], index: 0, floor: activeFloor(store.get()).id };
  ui.set({ openEnds: oe });
  store.dispatch(d => { d.floors.splice(0, 1); d.activeFloor = 0; });   // 앞 층이 사라져 번호가 밀린다
  expect(ui.get().openEnds).toBe(oe);
  const ctx = recCtx();
  overlay(ctx, { toScreen: p => p });
  expect(ctx.calls.length).toBeGreaterThan(0);                          // 여전히 그린다
});
