import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { createRoomTool } from '../src/view2d/tools/roomTool.js';

const key = k => ({ key: k, preventDefault() {} });

test('click-move-click creates a rectangle room', () => {
  const store = createStore(createEmptyProject());
  let done = 0; const t = createRoomTool({ store, onDone: () => done++ });
  t.onPointerDown([0, 0]); t.onPointerMove([4000, 3000]);
  expect(t.getPreview().w).toBe(4000);
  t.onPointerDown([4000, 3000]);
  const f = activeFloor(store.get());
  expect(f.walls).toHaveLength(4); expect(f.rooms).toHaveLength(1); expect(done).toBe(1);
});

test('typed dimensions override cursor', () => {
  const store = createStore(createEmptyProject());
  const t = createRoomTool({ store, onDone() {} });
  t.onPointerDown([1000, 1000]); t.onPointerMove([1500, 1500]);
  for (const c of '5000') t.onKey(key(c));
  t.onKey(key('Tab'));
  for (const c of '2500') t.onKey(key(c));
  expect(t.getPreview().w).toBe(5000); expect(t.getPreview().h).toBe(2500);
  t.onKey(key('Enter'));
  const f = activeFloor(store.get());
  const xs = f.walls.flatMap(w => [w.a[0], w.b[0]]), ys = f.walls.flatMap(w => [w.a[1], w.b[1]]);
  expect(Math.max(...xs)).toBe(6000); expect(Math.max(...ys)).toBe(3500);
});

test('escape cancels an active draw and is consumed only then', () => {
  const store = createStore(createEmptyProject());
  const t = createRoomTool({ store, onDone() {} });
  t.onPointerDown([0, 0]);
  expect(t.onKey(key('Escape'))).toBe(true);
  expect(t.getPreview()).toBeNull();
  expect(activeFloor(store.get()).walls).toHaveLength(0);
  expect(t.onKey(key('Escape'))).toBe(false); // 그리던 것이 없으면 앱이 선택 도구로 전환할 수 있어야 한다
});

test('second click snaps to existing endpoints', () => {
  const store = createStore(createEmptyProject());
  const t = createRoomTool({ store, onDone() {} });
  t.onPointerDown([0, 0]); t.onPointerDown([4000, 3000]);
  t.onPointerDown([4000, 0]); t.onPointerMove([7000, 2990]); t.onPointerDown([7000, 2990]);
  const f = activeFloor(store.get());
  expect(f.rooms).toHaveLength(2);
  expect(f.walls.some(w => w.a[1] === 3000 && w.b[1] === 3000 && Math.max(w.a[0], w.b[0]) === 7000)).toBe(true);
});

test('a given opts object is used and exposed so option edits persist across tool switches', () => {
  const store = createStore(createEmptyProject());
  const opts = { thickness: 100, snap: true };
  const t = createRoomTool({ store, opts, onDone() {} });
  expect(t.opts).toBe(opts);
  t.onPointerDown([0, 0]); t.onPointerMove([4000, 3000]); t.onPointerDown([4000, 3000]);
  expect(activeFloor(store.get()).walls.every(w => w.thickness === 100)).toBe(true);
});
