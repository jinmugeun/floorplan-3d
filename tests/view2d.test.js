// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { createView2D } from '../src/view2d/view2d.js';

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = 800; c.height = 600;
  Object.defineProperty(c, 'clientWidth', { value: 800 });
  Object.defineProperty(c, 'clientHeight', { value: 600 });
  c.getContext = () => new Proxy({}, { get: () => () => {} });
  return c;
}

test('toScreen/toWorld round trip and fit', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const v = createView2D(makeCanvas(), store, createUiState());
  v.fit(0);
  const c = v.toScreen([2000, 1500]);
  expect(c[0]).toBeCloseTo(400); expect(c[1]).toBeCloseTo(300);
  const w = v.toWorld(c);
  expect(w[0]).toBeCloseTo(2000); expect(w[1]).toBeCloseTo(1500);
});

test('zoomAt keeps the point under the cursor fixed', () => {
  const store = createStore(createEmptyProject());
  const v = createView2D(makeCanvas(), store, createUiState());
  const before = v.toWorld([100, 100]);
  v.zoomAt([100, 100], 2);
  const after = v.toWorld([100, 100]);
  expect(after[0]).toBeCloseTo(before[0]); expect(after[1]).toBeCloseTo(before[1]);
});

test('pointer events are delegated to the tool in world coords', () => {
  const store = createStore(createEmptyProject());
  const canvas = makeCanvas();
  const v = createView2D(canvas, store, createUiState());
  const tool = { name: 't', opts: {}, onPointerDown: vi.fn(), onPointerMove: vi.fn(), onPointerUp: vi.fn(), onKey: () => false, draw() {}, cancel() {} };
  v.setTool(tool);
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, clientY: 300, button: 0, bubbles: true }));
  expect(tool.onPointerDown).toHaveBeenCalled();
  const [pt] = tool.onPointerDown.mock.calls[0];
  expect(pt[0]).toBeCloseTo(v.camera.cx); expect(pt[1]).toBeCloseTo(v.camera.cy);
});

test('readonly view ignores wheel and pointer input, and destroy stops store updates', () => {
  const store = createStore(createEmptyProject());
  const canvas = makeCanvas();
  const v = createView2D(canvas, store, createUiState(), { readonly: true });
  const before = { ...v.camera };
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 100, clientY: 100, bubbles: true, cancelable: true }));
  canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 100, button: 0, bubbles: true }));
  canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 300, bubbles: true }));
  expect(v.camera).toEqual(before);
  v.destroy();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200)); // readonly 뷰가 살아 있었다면 fit()으로 카메라가 바뀐다
  expect(v.camera).toEqual(before);
});

test('room fills become translucent while a background image is showing', async () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const alphas = [];
  const c = makeCanvas();
  c.getContext = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { if (k === 'globalAlpha') alphas.push(v); t[k] = v; return true; } });
  const v = createView2D(c, store, createUiState());
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  await frame(); await frame();
  expect(alphas.length).toBeGreaterThan(0);
  expect(alphas.every(a => a === 1)).toBe(true); // 배경이 없으면 바닥은 불투명
  alphas.length = 0;
  store.dispatch(d => { d.background = { src: 'data:,', width: 10, height: 10, scale: 1, offset: [0, 0], opacity: 0.5, visible: true, locked: true }; });
  await frame(); await frame();
  expect(alphas).toContain(0.35); // 배경이 보이면 바닥은 35%
  v.destroy();
});

test('pointercancel ends the drag like pointerup', () => {
  const store = createStore(createEmptyProject());
  const canvas = makeCanvas();
  const v = createView2D(canvas, store, createUiState());
  const tool = { name: 't', opts: {}, onPointerDown: vi.fn(), onPointerMove: vi.fn(), onPointerUp: vi.fn(), onKey: () => false, draw() {}, cancel() {} };
  v.setTool(tool);
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, clientY: 300, button: 0, bubbles: true }));
  canvas.dispatchEvent(new MouseEvent('pointercancel', { clientX: 400, clientY: 300, bubbles: true })); // 캔버스 밖에서 놓거나 브라우저가 포인터를 가져간 경우
  expect(tool.onPointerUp).toHaveBeenCalledTimes(1);
  v.destroy();
  canvas.dispatchEvent(new MouseEvent('pointercancel', { clientX: 400, clientY: 300, bubbles: true }));
  expect(tool.onPointerUp).toHaveBeenCalledTimes(1); // destroy 후에는 듣지 않는다
});

test('v2 flags decide what the 2D canvas draws', async () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  store.dispatch(d => { activeFloor(d).rooms[0].name = '가열조리실'; activeFloor(d).measures.push({ id: 'm1', a: [0, 0], b: [4000.5, 0] }); }, { record: false });
  const texts = [];
  const c = makeCanvas();
  c.getContext = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'fillText' ? (s => texts.push(s)) : (k in t ? t[k] : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
  const v = createView2D(c, store, createUiState());
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  await frame(); await frame();
  expect(texts).toContain('가열조리실');
  expect(texts.some(s => s.includes('m²'))).toBe(true);
  expect(texts).toContain('4001'); // 측정선 라벨(소수 길이 반올림)
  texts.length = 0;
  store.dispatch(d => { d.view.v2.roomName = false; d.view.v2.roomArea = false; d.view.v2.measures = false; d.view.v2.dims = false; }, { record: false });
  await frame(); await frame();
  expect(texts).toEqual([]);
  v.destroy();
});

test('zoomBy, centerOn and viewportRect work on the camera', () => {
  const store = createStore(createEmptyProject());
  const v = createView2D(makeCanvas(), store, createUiState());
  const before = v.camera.scale;
  v.zoomBy(2);
  expect(v.camera.scale).toBeCloseTo(before * 2, 9);
  v.centerOn([1234.5, -678.25]); // 소수 좌표
  expect(v.camera.cx).toBeCloseTo(1234.5, 9); expect(v.camera.cy).toBeCloseTo(-678.25, 9);
  const [[x0, y0], [x1, y1]] = v.viewportRect();
  expect(x1 - x0).toBeCloseTo(800 / v.camera.scale, 6);
  expect(y1 - y0).toBeCloseTo(600 / v.camera.scale, 6);
  expect((x0 + x1) / 2).toBeCloseTo(1234.5, 6);
});

test('a readonly view draws the overlay and reports picks in world coords', async () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const canvas = makeCanvas();
  const picks = []; let overlayCalls = 0;
  const v = createView2D(canvas, store, createUiState(), { readonly: true, overlay: () => { overlayCalls++; }, onPick: p => picks.push(p) });
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  await frame(); await frame();
  expect(overlayCalls).toBeGreaterThan(0);
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, clientY: 300, button: 0, bubbles: true }));
  canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 500, clientY: 300, bubbles: true }));
  canvas.dispatchEvent(new MouseEvent('pointerup', { clientX: 500, clientY: 300, bubbles: true }));
  expect(picks).toHaveLength(2);
  expect(picks[0][0]).toBeCloseTo(v.camera.cx, 6);
  canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 600, clientY: 300, bubbles: true }));
  expect(picks).toHaveLength(2); // 버튼을 놓은 뒤에는 따라오지 않는다
  v.destroy();
});

test('onCameraChange fires for zoom, centerOn, fit and panning', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200)); // 소수 좌표
  const canvas = makeCanvas();
  let moves = 0;
  const v = createView2D(canvas, store, createUiState(), { onCameraChange: () => { moves++; } });
  v.zoomBy(2);
  expect(moves).toBe(1);
  v.centerOn([1234.5, -678.25]);
  expect(moves).toBe(2);
  v.fit();
  expect(moves).toBe(3);
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, clientY: 300, button: 1, bubbles: true })); // 가운데 버튼 = 패닝
  canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 460, clientY: 320, bubbles: true }));
  expect(moves).toBe(4);
  canvas.dispatchEvent(new MouseEvent('pointerup', { clientX: 460, clientY: 320, bubbles: true }));
  v.destroy();
});

test('right click asks the tool for items and opens the given menu', () => {
  const store = createStore(createEmptyProject());
  const canvas = makeCanvas();
  const opened = [];
  const menu = { open: (x, y, items) => opened.push({ x, y, items }), close() {}, isOpen: () => false };
  const v = createView2D(canvas, store, createUiState(), { menu });
  const items = [{ label: 'A', onSelect() {} }];
  v.setTool({ name: 't', opts: {}, onPointerDown() {}, onPointerMove() {}, onPointerUp() {}, onKey: () => false, draw() {}, cancel() {}, onContextMenu: () => items });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  canvas.dispatchEvent(new MouseEvent('contextmenu', { clientX: 120, clientY: 90, bubbles: true, cancelable: true }));
  expect(opened).toHaveLength(1);
  expect(opened[0].items).toBe(items);
  v.setTool({ name: 'u', opts: {}, onPointerDown() {}, onPointerMove() {}, onPointerUp() {}, onKey: () => false, draw() {}, cancel() {} });
  canvas.dispatchEvent(new MouseEvent('contextmenu', { clientX: 120, clientY: 90, bubbles: true, cancelable: true }));
  expect(opened).toHaveLength(1); // onContextMenu가 없는 도구는 메뉴를 열지 않는다
  v.destroy();
});

test('right click does not start panning when the tool has a context menu', () => {
  const store = createStore(createEmptyProject());
  const canvas = makeCanvas();
  const v = createView2D(canvas, store, createUiState(), { menu: { open() {}, close() {}, isOpen: () => false } });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  const base = { name: 't', opts: {}, onPointerDown() {}, onPointerMove() {}, onPointerUp() {}, onKey: () => false, draw() {}, cancel() {} };
  v.setTool({ ...base, onContextMenu: () => [{ label: 'A', onSelect() {} }] });
  const before = { ...v.camera };
  canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, clientY: 300, button: 2, bubbles: true }));
  canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 500, clientY: 360, bubbles: true }));
  expect(v.camera).toEqual(before); // 우클릭은 메뉴 전용
  canvas.dispatchEvent(new MouseEvent('pointerup', { clientX: 500, clientY: 360, bubbles: true }));
  v.setTool({ ...base }); // 우클릭 메뉴가 없는 도구는 예전처럼 패닝한다
  canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, clientY: 300, button: 2, bubbles: true }));
  canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 500, clientY: 360, bubbles: true }));
  expect(v.camera.cx).not.toBe(before.cx);
  v.destroy();
});

test('items are drawn after walls and follow the v2 toggles', async () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const { createItem } = await import('../src/state/schema.js');
  const { productById } = await import('../src/products/catalog.js');
  const { addItem } = await import('../src/state/floorOps.js');
  addItem(store, createItem(productById('sofa-3'), { pos: [2000, 1500] }));
  const calls = [];
  const c = document.createElement('canvas');
  Object.defineProperty(c, 'clientWidth', { value: 800 }); Object.defineProperty(c, 'clientHeight', { value: 600 });
  c.getContext = () => new Proxy({}, {
    get: (t, k) => (k === 'canvas' ? c : k === 'measureText' ? () => ({ width: 10 }) : (...args) => { calls.push([k, ...args]); }),
    set: () => true,
  });
  const v = createView2D(c, store, createUiState());
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  await frame(); await frame();
  const firstRotate = calls.findIndex(x => x[0] === 'rotate');
  const firstFill = calls.findIndex(x => x[0] === 'fill');
  expect(firstRotate).toBeGreaterThan(-1);
  expect(firstFill).toBeGreaterThan(-1);
  expect(firstFill).toBeLessThan(firstRotate); // 방·벽 채우기가 아이템보다 먼저다
  calls.length = 0;
  store.dispatch(d => { d.view.v2 = { ...(d.view.v2 ?? {}), floorItems: false }; }, { record: false });
  await frame(); await frame();
  expect(calls.some(x => x[0] === 'rotate')).toBe(false);
  v.destroy();
});
