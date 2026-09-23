import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
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

test('typed dimensions in ftin units parse feet/inches', () => {
  const store = createStore(createEmptyProject());
  store.dispatch(d => { d.units = 'ftin'; }, { record: false });
  const t = createRoomTool({ store, onDone() {} });
  t.onPointerDown([0, 0]); t.onPointerMove([1000, 1000]);
  for (const c of "12' 6\"") t.onKey(key(c));
  t.onKey(key('Tab'));
  for (const c of "8'") t.onKey(key(c));
  t.onKey(key('Enter'));
  const f = activeFloor(store.get());
  const xs = f.walls.flatMap(w => [w.a[0], w.b[0]]), ys = f.walls.flatMap(w => [w.a[1], w.b[1]]);
  expect(Math.max(...xs)).toBeCloseTo(3810, 1);
  expect(Math.max(...ys)).toBeCloseTo(2438.4, 1);
});

test('a given opts object is used and exposed so option edits persist across tool switches', () => {
  const store = createStore(createEmptyProject());
  const opts = { thickness: 100, snap: true };
  const t = createRoomTool({ store, opts, onDone() {} });
  expect(t.opts).toBe(opts);
  t.onPointerDown([0, 0]); t.onPointerMove([4000, 3000]); t.onPointerDown([4000, 3000]);
  expect(activeFloor(store.get()).walls.every(w => w.thickness === 100)).toBe(true);
});

test('in mm mode feet/inch characters are ignored while typing dimensions', () => {
  const store = createStore(createEmptyProject());
  const t = createRoomTool({ store, onDone() {} });
  t.onPointerDown([0, 0]);
  expect(t.onKey(key("'"))).toBe(false);
  expect(t.onKey(key('"'))).toBe(false);
  expect(t.onKey(key(' '))).toBe(false);
  for (const c of '1500') t.onKey(key(c));
  expect(t.getPreview().typed.w).toBe('1500');
  store.dispatch(d => { d.units = 'ftin'; }, { record: false });
  expect(t.onKey(key("'"))).toBe(true); // ft·in에서는 받는다
  expect(t.getPreview().typed.w).toBe("1500'");
});

// §14.7: 도구가 켜졌는데 배너가 비어 있어 "무엇을 클릭해야 하는지" 알 수 없었다.
test('방 도구는 단계에 따라 안내가 바뀐다', () => {
  const store = createStore(createEmptyProject());
  const t = createRoomTool({ store, onDone() {} });
  expect(t.hint).toBe('첫 모서리를 클릭 (1/2)');
  t.onPointerDown([0.5, 0.25]);
  expect(t.hint).toBe('맞은편 모서리를 클릭 (2/2) · 길이를 타이핑하고 [Enter]');   // §16.7: 타이핑 안내 한 줄
  t.onPointerDown([4000.5, 3000.25]);
  expect(t.hint).toBe('첫 모서리를 클릭 (1/2)');   // 커밋하면 다시 1단계다(도구는 켜진 채)
});

test('방 도구도 스냅 종류를 내놓는다(§16.6)', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200));
  const t = createRoomTool({ store, view: { camera: { scale: 0.1 } }, onDone() {} });
  t.onPointerDown([0.5, 0.25]);
  t.onPointerMove([4000.5, 3000.25]);
  expect(t.getSnap()).toEqual({ point: [4000.5, 3000.25], hit: 'point' });
});

// 리뷰 I-2: 첫 모서리(1/2) 단계에서도 스냅 종류가 계산되고 마커가 그려진다.
test('방 도구는 첫 클릭 전에도 스냅 종류를 내놓는다(§16.6)', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200));
  const t = createRoomTool({ store, view: { camera: { scale: 0.1 } }, onDone() {} });
  t.onPointerMove([40.5, 40.25]);                  // 끝점에서 약 56 mm — 허용 80 mm 안
  expect(t.getSnap()).toEqual({ point: [0.5, 0.25], hit: 'point' });
  expect(t.getPreview()).toBeNull();               // 그래도 아직 사각형은 없다
  const drawn = [];
  const base = { measureText: x => ({ width: x.length * 7 }) };   // 마커가 라벨 폭을 잰다
  const ctx = new Proxy(base, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
  t.draw(ctx, { toScreen: p => p, COLORS: {}, label: () => {}, poly: () => drawn.push('poly') });
  expect(drawn).toEqual([]);                       // 1단계에서는 사각형을 그리지 않는다(마커만)
  t.onPointerMove([2000.5, 1500.25]);              // 아무 대상도 없는 가운데
  expect(t.getSnap()).toBeNull();
});

test('방 도구의 치수 칸은 W·H 두 개이고 활성 칸이 표시된다(§16.7)', () => {
  const store = createStore(createEmptyProject());
  const t = createRoomTool({ store, onDone() {} });
  expect(t.dims()).toBeNull();
  t.onPointerDown([1000.5, 1000.25]);
  t.onPointerMove([1500.5, 1200.25]);
  expect(t.dims().fields.map(f => f.key)).toEqual(['w', 'h']);
  expect(t.dims().fields[0].active).toBe(true);
  expect(t.dims().fields[0].text).toBe('500');
  t.focusDim('h');
  expect(t.dims().fields[1].active).toBe(true);
  t.setDim('h', '2500');
  expect(t.getPreview().h).toBe(2500);               // 캔버스 프리뷰가 같은 값을 쓴다
  t.setDim('w', '5000');
  expect(t.commitDims()).toBe(true);
  expect(activeFloor(store.get()).walls).toHaveLength(4);
});

// 전역 제약(빈 단계 금지 · 최종 리뷰 I-3a): §16.6이 허용치를 화면 8 px로 바꿔 커서가 기존 끝점으로
// 더 잘 끌려오므로 "기존 벽 위에 같은 사각형을 다시 확정"이 쉽게 일어난다. addWalls가 벽 전부를
// 중복으로 버리면 dispatch도 없어야 한다.
test('같은 사각형을 다시 확정해도 빈 되돌림 단계가 생기지 않는다', () => {
  const store = createStore(createEmptyProject());
  const t = createRoomTool({ store, onDone() {} });
  t.onPointerDown([0.5, 0.25]); t.onPointerMove([4000.5, 3000.25]); t.onPointerDown([4000.5, 3000.25]);
  expect(activeFloor(store.get()).walls).toHaveLength(4);
  const before = store.get(), undoable = store.canUndo();
  const t2 = createRoomTool({ store, onDone() {} });
  t2.onPointerDown([0.5, 0.25]); t2.onPointerMove([4000.5, 3000.25]);
  expect(t2.commitDims()).toBe(true);                  // 칸 경로도 같은 구간을 확정한다
  expect(store.get()).toBe(before);                    // 그러나 더한 것이 없으므로 dispatch는 없다
  expect(store.canUndo()).toBe(undoable);
  expect(activeFloor(store.get()).walls).toHaveLength(4);
});
