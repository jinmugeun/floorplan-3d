import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { createSelectTool } from '../src/view2d/tools/selectTool.js';

const fakeView = { camera: { scale: 0.1 } };
function setup() {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  return { store, ui, t: createSelectTool({ store, ui, view: fakeView }) };
}

test('click on wall selects it, click on floor selects room, click outside clears', () => {
  const { store, ui, t } = setup();
  t.onPointerDown([2000, 0]); t.onPointerUp([2000, 0]);
  expect(ui.get().selection.type).toBe('wall');
  t.onPointerDown([2000, 1500]); t.onPointerUp([2000, 1500]);
  expect(ui.get().selection.type).toBe('room');
  t.onPointerDown([9000, 9000]); t.onPointerUp([9000, 9000]);
  expect(ui.get().selection).toBeNull();
});

test('dragging a wall moves it parallel in one undo step', () => {
  const { store, t } = setup();
  const top = activeFloor(store.get()).walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  t.onPointerDown([2000, 0]); t.onPointerMove([2000, -300]); t.onPointerMove([2000, -600]); t.onPointerUp([2000, -600]);
  const moved = activeFloor(store.get()).walls.find(w => w.id === top.id);
  expect(moved.a[1]).toBe(-600);
  store.undo();
  expect(activeFloor(store.get()).walls.find(w => w.id === top.id).a[1]).toBe(0);
});

test('dragging a selected wall vertex moves the corner', () => {
  const { store, ui, t } = setup();
  t.onPointerDown([2000, 0]); t.onPointerUp([2000, 0]);
  t.onPointerDown([0, 0]); t.onPointerMove([-500, -500]); t.onPointerUp([-500, -500]);
  const f = activeFloor(store.get());
  expect(f.walls.filter(w => (w.a[0] === -500 && w.a[1] === -500) || (w.b[0] === -500 && w.b[1] === -500))).toHaveLength(2);
  expect(f.rooms).toHaveLength(1);
});
