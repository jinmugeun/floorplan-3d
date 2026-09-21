import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { createSelectTool } from '../src/view2d/tools/selectTool.js';

const fakeView = { camera: { scale: 0.1 }, fit: () => {} };
function setup() {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  return { store, ui, t: createSelectTool({ store, ui, view: fakeView }) };
}
const pick = (items, label) => items.find(x => x !== 'sep' && x.label === label);
function setupAdjacent() {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  addWalls(store, rectWalls([4000, 0], [5500, 2000], 200));
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

test('dragging a room with an attached neighbour locks to the dominant (x) axis', () => {
  const { store, t } = setupAdjacent();
  const top = activeFloor(store.get()).walls.find(w => w.a[1] === 0 && w.b[1] === 0 && w.a[0] === 0);
  t.onPointerDown([1000, 1500]); t.onPointerMove([1300, 1200]); t.onPointerUp([1300, 1200]);
  const f = activeFloor(store.get());
  for (const w of f.walls) expect(Math.abs(w.a[0] - w.b[0]) < 1 || Math.abs(w.a[1] - w.b[1]) < 1).toBe(true);
  expect(f.rooms).toHaveLength(2);
  for (const r of f.rooms) expect(r.area).toBeGreaterThan(0);
  const moved = f.walls.find(w => w.id === top.id);
  expect(moved.a[1]).toBe(0);
  expect(moved.b[1]).toBe(0);
  expect([moved.a[0], moved.b[0]].sort((a, b) => a - b)).toEqual([300, 4300]);
});

test('dragging a room with an attached neighbour locks to the dominant (y) axis', () => {
  const { store, t } = setupAdjacent();
  const top = activeFloor(store.get()).walls.find(w => w.a[1] === 0 && w.b[1] === 0 && w.a[0] === 0);
  const left = activeFloor(store.get()).walls.find(w => w.a[0] === 0 && w.b[0] === 0 && (w.a[1] === 0 || w.b[1] === 0));
  t.onPointerDown([1000, 1500]); t.onPointerMove([1200, 1000]); t.onPointerUp([1200, 1000]);
  const f = activeFloor(store.get());
  const movedTop = f.walls.find(w => w.id === top.id);
  const movedLeft = f.walls.find(w => w.id === left.id);
  expect(movedTop.a[1]).toBe(-500);
  expect(movedTop.b[1]).toBe(-500);
  expect(movedLeft.a[0]).toBe(0);
  expect(movedLeft.b[0]).toBe(0);
});

test('dragging an independent room moves freely on both axes', () => {
  const { store, t } = setup();
  t.onPointerDown([1000, 1500]); t.onPointerMove([1300, 1200]); t.onPointerUp([1300, 1200]);
  const f = activeFloor(store.get());
  expect(f.walls).toHaveLength(4);
  const top = f.walls.find(w => w.b[1] - w.a[1] === 0 && w.a[1] === -300);
  expect(top).toBeTruthy();
  const left = f.walls.find(w => w.a[0] === 300 && w.b[0] === 300);
  expect(left).toBeTruthy();
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

test('with the plan locked, clicks still select but drags and vertex edits do nothing', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200)); // 소수 좌표
  let locked = 0;
  const t = createSelectTool({ store, ui, view: fakeView, onLocked: () => { locked++; } });
  store.dispatch(d => { d.view.lockPlan = true; }, { record: false });
  const top = activeFloor(store.get()).walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  t.onPointerDown([2000, 0]); t.onPointerMove([2000, -600]); t.onPointerUp([2000, -600]);
  expect(ui.get().selection).toEqual({ type: 'wall', id: top.id }); // 선택은 된다
  expect(activeFloor(store.get()).walls.find(w => w.id === top.id).a[1]).toBe(0);
  expect(locked).toBe(1);
  t.onPointerDown([0, 0]); t.onPointerMove([-500, -500]); t.onPointerUp([-500, -500]); // 꼭짓점
  expect(activeFloor(store.get()).walls.find(w => w.id === top.id).a[0]).toBe(0);
  expect(locked).toBe(2);
  t.onPointerDown([1000, 1500]); t.onPointerMove([1300, 1500]); t.onPointerUp([1300, 1500]); // 방
  expect(activeFloor(store.get()).walls).toHaveLength(4);
  // 다중 선택 드래그도 잠금에 막힌다
  const left = activeFloor(store.get()).walls.find(w => w.a[0] === 0 && w.b[0] === 0);
  ui.set({ selection: { type: 'multi', kind: 'wall', ids: [top.id, left.id] } });
  t.onPointerDown([2000, 0], {}); t.onPointerMove([2000, -700], {}); t.onPointerUp([2000, -700], {});
  expect(activeFloor(store.get()).walls.find(w => w.id === top.id).a[1]).toBe(0);
  expect(locked).toBeGreaterThanOrEqual(3);
  expect(store.canUndo()).toBe(true);
  store.undo();
  expect(activeFloor(store.get()).walls).toHaveLength(0); // 남은 기록은 벽 생성 하나뿐
});

const shift = { shiftKey: true };

test('shift+click toggles walls into a multi selection', () => {
  const { store, ui, t } = setup();
  const f = activeFloor(store.get());
  const top = f.walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  const left = f.walls.find(w => w.a[0] === 0 && w.b[0] === 0);
  t.onPointerDown([2000, 0]); t.onPointerUp([2000, 0]);
  expect(ui.get().selection).toEqual({ type: 'wall', id: top.id });
  t.onPointerDown([0, 1500], shift); t.onPointerUp([0, 1500], shift);
  expect(ui.get().selection).toEqual({ type: 'multi', kind: 'wall', ids: [top.id, left.id] });
  t.onPointerDown([0, 1500], shift); t.onPointerUp([0, 1500], shift); // 다시 누르면 빠진다
  expect(ui.get().selection).toEqual({ type: 'multi', kind: 'wall', ids: [top.id] });
});

test('shift+drag on empty canvas selects walls fully inside the box', () => {
  const { store, ui, t } = setup();
  const f = activeFloor(store.get());
  const top = f.walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  t.onPointerDown([-500, -500], shift);
  t.onPointerMove([4500, 500], shift);
  t.onPointerUp([4500, 500], shift);
  expect(ui.get().selection).toEqual({ type: 'multi', kind: 'wall', ids: [top.id] }); // 위쪽 벽만 완전히 들어온다
  t.onPointerDown([-500, -500], shift); t.onPointerMove([5000, 4000], shift); t.onPointerUp([5000, 4000], shift);
  expect(ui.get().selection.ids).toHaveLength(4);
});

test('a multi selection moves together in one undo step and axis-locks next to an attached room', () => {
  const { store, ui, t } = setupAdjacent();
  const f = activeFloor(store.get());
  const top = f.walls.find(w => w.a[1] === 0 && w.b[1] === 0 && w.a[0] === 0);
  const left = f.walls.find(w => w.a[0] === 0 && w.b[0] === 0);
  ui.set({ selection: { type: 'multi', kind: 'wall', ids: [top.id, left.id] } });
  t.onPointerDown([2000, 0]); t.onPointerMove([2300, -200]); t.onPointerUp([2300, -200]);
  const g = activeFloor(store.get());
  for (const w of g.walls) expect(Math.abs(w.a[0] - w.b[0]) < 1 || Math.abs(w.a[1] - w.b[1]) < 1).toBe(true); // 축 고정으로 기울지 않는다
  expect(g.walls.find(w => w.id === top.id).a[0]).toBe(300);
  store.undo();
  expect(activeFloor(store.get()).walls.find(w => w.id === top.id).a[0]).toBe(0);
});

test('a multi drag with fractional coordinates moves every selected node', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200)); // 소수 좌표, 붙은 이웃 없음
  const t = createSelectTool({ store, ui, view: fakeView });
  const f = activeFloor(store.get());
  ui.set({ selection: { type: 'multi', kind: 'wall', ids: f.walls.map(w => w.id) } });
  t.onPointerDown([2000, 0.25]); t.onPointerMove([2100.75, 100.5]); t.onPointerUp([2100.75, 100.5]);
  const g = activeFloor(store.get());
  expect(Math.min(...g.walls.map(w => w.a[0]))).toBeCloseTo(101.25, 6);
  expect(Math.min(...g.walls.map(w => w.a[1]))).toBeCloseTo(100.5, 6);
});

test('context menu items depend on what is under the cursor', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const calls = [];
  const t = createSelectTool({ store, ui, view: fakeView, surfaceActions: { replaceMaterial: target => calls.push(target) } });
  const f = activeFloor(store.get());
  const wallItems = t.onContextMenu([2000, 0], { shiftKey: false });
  expect(ui.get().selection).toEqual({ type: 'wall', id: f.walls.find(w => w.a[1] === 0 && w.b[1] === 0).id }); // 우클릭이 먼저 선택한다
  expect(wallItems.map(i => (i === 'sep' ? 'sep' : i.label)))
    .toEqual(['벽 나누기', '곡선벽 전환', '재질 교체', '타일 배치', '마감재 복사', '마감재 방 전체 벽에 적용', '마감재 편집기로 이동', 'sep', '삭제']);
  expect(pick(wallItems, '곡선벽 전환').disabled).toBe(true);
  expect(pick(wallItems, '곡선벽 전환').title).toBe('미지원');
  pick(wallItems, '벽 나누기').onSelect();
  expect(ui.get().splitWall).toBe(true);
  // '재질 교체'는 이제 focusField가 아니라 surfaceActions.replaceMaterial을 부른다(재질 교체 패널이 담당).
  pick(wallItems, '재질 교체').onSelect();
  expect(calls).toEqual([{ kind: 'wall', id: f.walls.find(w => w.a[1] === 0 && w.b[1] === 0).id, side: 'in' }]);

  const roomItems = t.onContextMenu([2000, 1500], {});
  expect(ui.get().selection).toEqual({ type: 'room', id: f.rooms[0].id }); // 방도 우클릭 즉시 선택된다
  expect(roomItems.map(i => (i === 'sep' ? 'sep' : i.label)))
    .toEqual(['템플릿 적용하기', '방 복사', '마감재 복사', '재질 교체', '단일 공간 모드', 'sep', '삭제']);
  expect(pick(roomItems, '방 복사').shortcut).toBeUndefined(); // M-10: Ctrl+C는 방 복사에 묶여 있지 않다
  expect(pick(roomItems, '마감재 복사').disabled).toBe(true);  // 바닥 재질이 없으면 복사할 것이 없다
  expect(pick(roomItems, '템플릿 적용하기').disabled).toBe(true); // surfaceActions.applyTemplate이 아직 없다(Task 9에서 켜진다)
  pick(roomItems, '방 복사').onSelect();
  expect(activeFloor(store.get()).rooms).toHaveLength(2);
  pick(roomItems, '단일 공간 모드').onSelect();
  expect(ui.get().soloRoom).toBe(f.rooms[0].id);

  const emptyItems = t.onContextMenu([-9000, -9000], {});
  expect(emptyItems.map(i => i.label)).toEqual(['전체 선택', '화면 맞추기']);
  emptyItems[0].onSelect();
  expect(ui.get().selection.type).toBe('multi');
  expect(ui.get().selection.ids).toHaveLength(activeFloor(store.get()).walls.length);

  // §15.3: 키보드로 연 메뉴는 좌표를 다시 픽하지 않고 지금 선택의 메뉴를 준다(선택도 바뀌지 않는다).
  ui.set({ selection: { type: 'room', id: f.rooms[0].id } });
  const keyItems = t.onContextMenu([-9000, -9000], { key: true });
  expect(keyItems.map(i => (i === 'sep' ? 'sep' : i.label))).toEqual(roomItems.map(i => (i === 'sep' ? 'sep' : i.label)));
  expect(ui.get().selection).toEqual({ type: 'room', id: f.rooms[0].id });
});

test('an unlocked background moves with an empty-canvas drag; a locked one does not', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  store.dispatch(d => { d.background = { src: 'data:,', width: 100, height: 80, scale: 10, offset: [0, 0], opacity: 0.5, visible: true, locked: true }; }, { record: false });
  const t = createSelectTool({ store, ui, view: fakeView });
  t.onPointerDown([500, 500]); t.onPointerMove([1500.5, 900.25]); t.onPointerUp([1500.5, 900.25]); // 소수 좌표
  expect(store.get().background.offset).toEqual([0, 0]);
  store.dispatch(d => { d.background.locked = false; }, { record: false });
  t.onPointerDown([500, 500]); t.onPointerMove([1500.5, 900.25]); t.onPointerUp([1500.5, 900.25]);
  expect(store.get().background.offset[0]).toBeCloseTo(1000.5, 6);
  expect(store.get().background.offset[1]).toBeCloseTo(400.25, 6);
  store.undo();
  expect(store.get().background.offset).toEqual([0, 0]); // 드래그는 한 단계
});

test('the plan lock also freezes an unlocked background', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  store.dispatch(d => {
    d.background = { src: 'data:,', width: 100, height: 80, scale: 10, offset: [0.5, 0.25], opacity: 0.5, visible: true, locked: false };
    d.view.lockPlan = true;
  }, { record: false });
  let locked = 0;
  const t = createSelectTool({ store, ui, view: fakeView, onLocked: () => { locked++; } });
  t.onPointerDown([500, 500]); t.onPointerMove([1500.5, 900.25]); t.onPointerUp([1500.5, 900.25]); // 소수 좌표
  expect(store.get().background.offset).toEqual([0.5, 0.25]); // 도면 잠금이 이긴다
  expect(locked).toBe(1);
  expect(store.canUndo()).toBe(false);
});

test('a drag outside the unlocked background rect does not move it and clears the selection', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  store.dispatch(d => { d.background = { src: 'data:,', width: 100, height: 80, scale: 10, offset: [0, 0], opacity: 0.5, visible: true, locked: false }; }, { record: false });
  ui.set({ selection: { type: 'wall', id: 'x' } });
  const t = createSelectTool({ store, ui, view: fakeView });
  t.onPointerDown([1500.5, 900.25]); t.onPointerMove([2000, 1200]); t.onPointerUp([2000, 1200]); // 배경(1000x800) 바깥
  expect(store.get().background.offset).toEqual([0, 0]);
  expect(ui.get().selection).toBeNull();
  expect(store.canUndo()).toBe(false);
});

test('the selected wall length label is left to the view when 치수 is on', () => {
  const { store, ui, t } = setup();
  const wall = activeFloor(store.get()).walls[0];
  ui.set({ selection: { type: 'wall', id: wall.id } });
  const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
  const labels = [];
  const v = { toScreen: p => p, COLORS: {}, units: 'mm', showUnit: false, label: text => labels.push(text) };
  t.draw(ctx, v);
  expect(labels).toEqual([]); // v2.dims 기본값이 true → 뷰가 이미 라벨을 그린다
  store.dispatch(d => { d.view.v2.dims = false; }, { record: false });
  t.draw(ctx, v);
  expect(labels.length).toBeGreaterThan(0);
});

// §14.10: 2D에서 벽을 클릭하면 내벽·외벽 두 면에 동시에 발리는데 알려 주는 표시가 없었다(감사 #16).
test('2D 재질 적용은 내·외벽 모두 적용임을 토스트로 알린다', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  const toasts = [];
  const t = createSelectTool({ store, ui, view: fakeView, toast: m => toasts.push(m) });
  ui.set({ matPick: { assignment: { id: 'tile-white-300', offset: [0, 0], angle: 0 } } });
  t.onPointerDown([2000, 0.25], {});
  const w = activeFloor(store.get()).walls.find(x => x.a[1] === 0 && x.b[1] === 0);   // 위쪽 벽
  expect(w.matIn.id).toBe('tile-white-300');
  expect(w.matOut.id).toBe('tile-white-300');
  expect(toasts).toEqual(['내·외벽 모두 적용']);
  expect(store.canUndo()).toBe(true);          // 두 면이 한 단계다
});
