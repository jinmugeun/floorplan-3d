import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
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

test('a finished measurement is stored on the floor and clicking it again removes it', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const t = createMeasureTool({ store, opts: { snap: false } });
  t.onPointerDown([500.5, 1500.25]); t.onPointerDown([3500.5, 1500.25]); // 소수 좌표
  const m = activeFloor(store.get()).measures;
  expect(m).toHaveLength(1);
  expect(m[0]).toMatchObject({ a: [500.5, 1500.25], b: [3500.5, 1500.25] });
  t.onPointerDown([9000, 9000]); // 새 측정 시작 지점(빈 곳)
  t.cancel();
  t.onPointerDown([2000, 1500.25]); // 기존 측정선 위 클릭 → 삭제
  expect(activeFloor(store.get()).measures).toHaveLength(0);
});
