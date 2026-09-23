// @vitest-environment jsdom
// §18.6의 끊긴 끝점 안내(배너 문장 + 2D 빨간 ✚ + [보기]). §18.7의 진입점 배선은 Task 14가
// 이 파일 끝에 덧붙인다.
import { test, expect, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { createOpenEnds, OPEN_END_COLOR, OPEN_END_PX } from '../src/view2d/openEnds2d.js';
import { createBanner } from '../src/ui/banner.js';
import { DXF_OPEN_ENDS, DXF_OPEN_ENDS_VIEW } from '../src/ui/messages.js';

test('끊긴 끝점 오버레이가 빨간 ✚를 그리고 현재 점을 굵게 한다', () => {
  const ui = createUiState();
  const centerOn = vi.fn();
  const { overlay } = createOpenEnds(ui, { centerOn });
  const calls = [];
  const ctx = new Proxy({}, { get: (_t, k) => (...a) => calls.push([k, ...a]) });
  const api = { toScreen: p => [p[0] / 10, p[1] / 10] };
  overlay(ctx, api);
  expect(calls).toHaveLength(0);                 // 안내가 없으면 아무것도 그리지 않는다
  ui.set({ openEnds: { pts: [[0.5, 0.25], [1000.5, 2000.25]], index: 0 } });
  overlay(ctx, api);
  expect(calls.filter(c => c[0] === 'moveTo')).toHaveLength(4);   // 점 둘 × 가로·세로
  expect(calls.some(c => c[0] === 'stroke')).toBe(true);
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
