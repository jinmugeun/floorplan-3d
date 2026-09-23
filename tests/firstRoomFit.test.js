// 첫 방 자동 fit은 한 프로젝트 세션에 한 번이다(§16.12 · 감사 §49 · 리뷰 I-1). 활성 층의 방 수만
// 보던 예전 배선은 0 → 1이 될 때마다 다시 튀어(undo → redo · 방 전체 삭제 후 재작도 · 빈 층을
// 더했다가 돌아오기) 사용자가 잡아 둔 확대·팬을 말없이 날렸다.
import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addFloor, setActiveFloor } from '../src/state/floorOps.js';
import { createFirstRoomFit } from '../src/app/firstRoomFit.js';

const ROOM = { id: 'r1', name: '방', points: [[0, 0], [3000, 0], [3000, 3000], [0, 3000]] };
// 방은 벽에서 파생되지만 이 래치는 "방 수"만 본다: 검출을 거치지 않고 직접 넣어 한 단계로 기록한다.
const drawRoom = store => store.dispatch(d => { activeFloor(d).rooms = [structuredClone(ROOM)]; });
const setup = (project = createEmptyProject()) => {
  const store = createStore(project);
  const ui = createUiState();
  let fits = 0;
  const latch = createFirstRoomFit({ store, ui, view: { fit: () => { fits += 1; } } });
  return { store, ui, latch, fits: () => fits };
};

test('첫 방 하나에 한 번 맞추고 첫 방 유도도 그 자리에서 끈다', () => {
  const { store, ui, fits } = setup();
  ui.set({ firstRoomHint: true });
  expect(fits()).toBe(0);
  drawRoom(store);
  expect(fits()).toBe(1);
  expect(ui.get().firstRoomHint).toBe(false);   // 새로 더한 빈 층에서 안내가 되살아나지 않게(m-1)
  store.dispatch(d => { activeFloor(d).rooms.push({ ...structuredClone(ROOM), id: 'r2' }); });
  expect(fits()).toBe(1);                       // 두 번째 방은 맞추지 않는다
});

test('undo → redo는 다시 맞추지 않는다', () => {
  const { store, fits } = setup();
  drawRoom(store);
  expect(fits()).toBe(1);
  expect(store.undo()).toBe(true);
  expect(activeFloor(store.get()).rooms).toHaveLength(0);
  expect(store.redo()).toBe(true);
  expect(activeFloor(store.get()).rooms).toHaveLength(1);
  expect(fits()).toBe(1);
});

test('빈 층을 더했다가 방이 있는 층으로 돌아와도 다시 맞추지 않는다', () => {
  const { store, fits } = setup();
  drawRoom(store);
  expect(fits()).toBe(1);
  addFloor(store, { copy: 'none' });            // 활성 층이 빈 층이 된다(방 0)
  expect(activeFloor(store.get()).rooms).toHaveLength(0);
  setActiveFloor(store, 0);                     // 방이 있는 층으로 복귀
  expect(activeFloor(store.get()).rooms).toHaveLength(1);
  expect(fits()).toBe(1);
});

test('방이 있는 프로젝트로 시작하면 아예 맞추지 않는다', () => {
  const p = createEmptyProject();
  p.floors[0].rooms = [structuredClone(ROOM)];
  const { store, fits } = setup(p);
  store.dispatch(d => { d.name = '이름만 바꾼다'; });
  expect(fits()).toBe(0);
});

test('rearm()은 새 프로젝트에서 래치를 다시 무장한다(불러온 도면은 그대로 잠긴다)', () => {
  const { store, latch, fits } = setup();
  drawRoom(store);
  expect(fits()).toBe(1);
  store.replace(createEmptyProject());          // 새로 만들기(그 경로가 스스로 fit을 부른다)
  latch.rearm();
  drawRoom(store);
  expect(fits()).toBe(2);                       // 새 프로젝트의 첫 방도 한 번은 맞춘다
  const loaded = createEmptyProject();
  loaded.floors[0].rooms = [structuredClone(ROOM)];
  store.replace(loaded);
  latch.rearm();
  store.dispatch(d => { activeFloor(d).rooms.push({ ...structuredClone(ROOM), id: 'r3' }); });
  expect(fits()).toBe(2);                       // 방이 있는 도면을 불러오면 다시 튀지 않는다
});

test('destroy 뒤에는 구독하지 않는다', () => {
  const { store, latch, fits } = setup();
  latch.destroy();
  drawRoom(store);
  expect(fits()).toBe(0);
});
