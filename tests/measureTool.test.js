import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { createMeasureTool } from '../src/view2d/tools/measureTool.js';

test('a given opts object is used and exposed; snap: false leaves the point where it was clicked', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const opts = { snap: false };
  const t = createMeasureTool({ store, opts });
  expect(t.opts).toBe(opts);
  const labels = [];
  const view = { toScreen: p => p, COLORS: {}, label: (text, at) => labels.push([text, at]) };
  const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
  t.onPointerDown([5, 5]); t.onPointerDown([1005, 5]); // 스냅이 켜져 있었다면 (0,0)/(1000,0)으로 붙는다
  t.draw(ctx, view);
  expect(labels[0][0]).toBe('1000 mm'); expect(labels[0][1]).toEqual([505, 5]);
});
