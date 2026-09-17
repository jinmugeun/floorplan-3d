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

test('a finished drag survives the next plain click and stays one undo step', () => {
  const { store, t } = setup();
  const top = activeFloor(store.get()).walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  t.onPointerDown([2000, 0]); t.onPointerMove([2000, -600]); t.onPointerUp([2000, -600]);
  t.onPointerDown([2000, 1500]); t.onPointerUp([2000, 1500]); // 방 클릭(이동 없음)
  expect(activeFloor(store.get()).walls.find(w => w.id === top.id).a[1]).toBe(-600);
  expect(store.canUndo()).toBe(true);
  store.undo();
  expect(activeFloor(store.get()).walls.find(w => w.id === top.id).a[1]).toBe(0);
  // 드래그는 정확히 한 단계였다: 남은 건 setup()이 만든 벽 생성 기록뿐이다.
  expect(store.canUndo()).toBe(true);
  store.undo();
  expect(activeFloor(store.get()).walls).toHaveLength(0);
  expect(store.canUndo()).toBe(false);
});

test('ctrl+z during a drag cancels the drag instead of undoing history', () => {
  const { store, t } = setup();
  const top = activeFloor(store.get()).walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  t.onPointerDown([2000, 0]); t.onPointerMove([2000, -600]);
  expect(t.onKey({ key: 'z', ctrlKey: true })).toBe(true);
  t.onPointerUp([2000, -600]);
  expect(activeFloor(store.get()).walls.find(w => w.id === top.id).a[1]).toBe(0);
  expect(activeFloor(store.get()).walls).toHaveLength(4); // setup()의 벽은 그대로
  expect(t.onKey({ key: 'z', ctrlKey: true })).toBe(false); // 드래그가 없으면 소비하지 않는다
});

test('escape during a drag reverts the movement', () => {
  const { store, t } = setup();
  const top = activeFloor(store.get()).walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  t.onPointerDown([2000, 0]); t.onPointerMove([2000, -600]);
  expect(t.onKey({ key: 'Escape' })).toBe(true);
  t.onPointerUp([2000, -600]);
  expect(activeFloor(store.get()).walls.find(w => w.id === top.id).a[1]).toBe(0);
  // 취소된 드래그는 아무 기록도 남기지 않는다: 남은 건 setup()의 벽 생성 기록뿐이다.
  expect(store.canUndo()).toBe(true);
  store.undo();
  expect(activeFloor(store.get()).walls).toHaveLength(0);
  expect(store.canUndo()).toBe(false);
});

test('a plain click after undo keeps the redo stack', () => {
  const { store, t } = setup();
  const top = activeFloor(store.get()).walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  t.onPointerDown([2000, 0]); t.onPointerMove([2000, -600]); t.onPointerUp([2000, -600]);
  store.undo();
  expect(store.canRedo()).toBe(true);
  t.onPointerDown([2000, 0]); t.onPointerUp([2000, 0]); // 이동 없는 클릭(선택만)
  expect(store.canRedo()).toBe(true);
  store.redo();
  expect(activeFloor(store.get()).walls.find(w => w.id === top.id).a[1]).toBe(-600);
});
