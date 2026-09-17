// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject } from '../src/state/schema.js';
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
