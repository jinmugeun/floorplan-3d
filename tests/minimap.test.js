// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { createMinimap } from '../src/view2d/minimap.js';

function makeCanvas(calls) {
  const c = document.createElement('canvas');
  c.width = 300; c.height = 200;
  Object.defineProperty(c, 'clientWidth', { value: 300 });
  Object.defineProperty(c, 'clientHeight', { value: 200 });
  c.getContext = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...args) => calls.push([k, ...args])), set: (t, k, v) => { t[k] = v; return true; } });
  c.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 200 });
  return c;
}
const frame = () => new Promise(r => requestAnimationFrame(() => r()));

test('in 2D the minimap outlines the 2D viewport and clicks recenter the 2D view', async () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0.5, 0.25], [8000.5, 6000.25], 200)); // 소수 좌표
  const calls = [];
  const view2d = { viewportRect: () => [[1000.5, 800.25], [5000.5, 3800.25]], centerOn: vi.fn() };
  const view3d = { getCameraInfo: vi.fn(() => ({ pos: [0, 0], target: [0, 0], heading: 0 })), setTarget: vi.fn() };
  const canvas = makeCanvas(calls);
  const mm = createMinimap(canvas, store, ui, { view2d, view3d });
  await frame(); await frame();
  expect(calls.some(c => c[0] === 'strokeRect')).toBe(true);
  expect(view3d.getCameraInfo).not.toHaveBeenCalled();
  canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 150, clientY: 100, button: 0, bubbles: true }));
  expect(view2d.centerOn).toHaveBeenCalledTimes(1);
  const [p] = view2d.centerOn.mock.calls[0];
  expect(p[0]).toBeCloseTo(mm.camera.cx, 6);
  mm.destroy();
});

test('in 3D the minimap draws the camera triangle and clicks move the 3D target', async () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [8000, 6000], 200));
  const calls = [];
  const view2d = { viewportRect: vi.fn(() => [[0, 0], [1, 1]]), centerOn: vi.fn() };
  const view3d = { getCameraInfo: () => ({ pos: [4000, 9000], target: [4000, 3000], heading: 0 }), setTarget: vi.fn() };
  const canvas = makeCanvas(calls);
  const mm = createMinimap(canvas, store, ui, { view2d, view3d });
  ui.set({ mode: 'iso' });
  await frame(); await frame();
  expect(calls.filter(c => c[0] === 'lineTo').length).toBeGreaterThanOrEqual(2);
  expect(calls.some(c => c[0] === 'fill')).toBe(true);
  expect(view2d.viewportRect).not.toHaveBeenCalled();
  canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, clientY: 10, button: 0, bubbles: true }));
  expect(view3d.setTarget).toHaveBeenCalledTimes(1);
  mm.destroy();
});

test('a 2D camera move repaints the minimap overlay', async () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0.5, 0.25], [8000.5, 6000.25], 200)); // 소수 좌표
  const calls = [];
  let rect = [[1000.5, 800.25], [5000.5, 3800.25]];
  const view2d = { viewportRect: () => rect, centerOn: vi.fn() };
  const view3d = { getCameraInfo: vi.fn(() => ({ pos: [0, 0], target: [0, 0], heading: 0 })), setTarget: vi.fn() };
  const canvas = makeCanvas(calls);
  const mm = createMinimap(canvas, store, ui, { view2d, view3d });
  await frame(); await frame();
  const before = calls.filter(c => c[0] === 'strokeRect').length;
  expect(before).toBeGreaterThan(0);
  rect = [[2000.5, 1800.25], [6000.5, 4800.25]]; // 2D 카메라가 움직였다
  mm.requestRender();                            // main.js 의 onCameraChange 가 부르는 것과 같은 호출
  await frame(); await frame();
  expect(calls.filter(c => c[0] === 'strokeRect').length).toBeGreaterThan(before);
  mm.destroy();
});
