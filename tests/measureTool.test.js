import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { createMeasureTool } from '../src/view2d/tools/measureTool.js';

const ctxProxy = () => new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });

test('a given opts object is used and exposed; snap: false leaves the point where it was clicked', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const opts = { snap: false };
  const t = createMeasureTool({ store, opts });
  expect(t.opts).toBe(opts);
  const labels = [];
  const view = { toScreen: p => p, COLORS: {}, label: (text, at) => labels.push([text, at]) };
  t.onPointerDown([5, 5]); t.onPointerMove([1005, 5]); // 스냅이 켜져 있었다면 (0,0)/(1000,0)으로 붙는다
  t.draw(ctxProxy(), view);
  expect(labels[0][0]).toBe('1000 mm'); expect(labels[0][1]).toEqual([505, 5]);
  t.onPointerDown([1005, 5]);
  expect(activeFloor(store.get()).measures[0]).toMatchObject({ a: [5, 5], b: [1005, 5] });
});

test('a finished measurement is stored on the floor and clicking it again removes it', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const t = createMeasureTool({ store, opts: { snap: false } });
  t.onPointerDown([500.5, 1500.25]); t.onPointerDown([3500.5, 1500.25]); // 소수 좌표
  const m = activeFloor(store.get()).measures;
  expect(m).toHaveLength(1);
  expect(m[0]).toMatchObject({ a: [500.5, 1500.25], b: [3500.5, 1500.25] });
  const labels = [];
  t.draw(ctxProxy(), { toScreen: p => p, COLORS: {}, label: (text, at) => labels.push([text, at]) });
  expect(labels).toEqual([]); // 확정된 측정선은 뷰가 그린다(도구는 진행 중인 것만 그린다)
  t.onPointerDown([2000, 1500.25]); // 바로 다음 클릭이 기존 측정선 위 → 삭제
  expect(activeFloor(store.get()).measures).toHaveLength(0);
});

test('a new measurement starts right after the previous one is stored', () => {
  const store = createStore(createEmptyProject());
  const t = createMeasureTool({ store, opts: { snap: false } });
  t.onPointerDown([0, 0]); t.onPointerDown([1000, 0]);
  t.onPointerDown([0, 2000]); t.onPointerDown([1000, 2000]); // 빈 곳에서 다시 두 번
  expect(activeFloor(store.get()).measures).toHaveLength(2);
});
