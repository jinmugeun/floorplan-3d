import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { createGuideTool } from '../src/view2d/tools/guideTool.js';
import { createRoomTool } from '../src/view2d/tools/roomTool.js';
import { snapPoint } from '../src/geom/snap.js';

const key = k => ({ key: k, preventDefault() {} });
const fakeView = { camera: { scale: 0.1 } };

test('snapPoint snaps to guides', () => {
  const r = snapPoint([1010, 500], { guides: [{ id: 'g1', type: 'v', pos: 1000 }], tol: 20 });
  expect(r.point).toEqual([1000, 500]); expect(r.hit).toBe('guide');
});
test('guide tool adds, retypes and removes guides', () => {
  const store = createStore(createEmptyProject());
  const t = createGuideTool({ store, view: fakeView });
  t.onPointerDown([1234, 0]);
  expect(activeFloor(store.get()).guides).toEqual([{ id: expect.any(String), type: 'v', pos: 1234 }]);
  for (const c of '1500') t.onKey(key(c)); t.onKey(key('Enter'));
  expect(activeFloor(store.get()).guides[0].pos).toBe(1500);
  t.onPointerDown([1520, 800]);
  expect(activeFloor(store.get()).guides).toHaveLength(0);
});
test('room tool snaps to a guide', () => {
  const store = createStore(createEmptyProject());
  createGuideTool({ store, view: fakeView }).onPointerDown([3000, 0]);
  const rt = createRoomTool({ store, onDone() {} });
  rt.onPointerDown([0, 0]); rt.onPointerMove([2950, 2000]);
  expect(rt.getPreview().w).toBe(3000);
});
