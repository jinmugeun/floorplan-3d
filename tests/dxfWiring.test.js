// @vitest-environment jsdom
// §18.6의 끊긴 끝점 안내(배너 문장 + 2D 빨간 ✚ + [보기]). §18.7의 진입점 배선은 Task 14가
// 이 파일 끝에 덧붙인다.
import { test, expect, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, createFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { createOpenEnds, OPEN_END_COLOR, OPEN_END_PX } from '../src/view2d/openEnds2d.js';
import { createBanner } from '../src/ui/banner.js';
import { DXF_OPEN_ENDS, DXF_OPEN_ENDS_VIEW } from '../src/ui/messages.js';

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
