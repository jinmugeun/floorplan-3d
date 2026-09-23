import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
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
test('a given opts object is used and exposed', () => {
  const store = createStore(createEmptyProject());
  const opts = { direction: 'h' };
  const t = createGuideTool({ store, view: fakeView, opts });
  expect(t.opts).toBe(opts);
  t.onPointerDown([1234, 777]);
  expect(activeFloor(store.get()).guides[0]).toMatchObject({ type: 'h', pos: 777 });
});
test('a non-numeric typed position (e.g. "-") is discarded instead of writing NaN', () => {
  const store = createStore(createEmptyProject());
  const t = createGuideTool({ store, view: fakeView });
  t.onPointerDown([1234, 0]);
  t.onKey(key('-')); expect(t.onKey(key('Enter'))).toBe(true);
  expect(activeFloor(store.get()).guides[0].pos).toBe(1234);
});

// 리뷰 C-1: 지우기는 스냅 전 원좌표로 판정한다 — 스냅이 먼저 붙으면 히트 영역이 허용치만큼 커진다.
test('보조선을 지우는 범위는 스냅 허용치가 아니라 6 px이다', () => {
  const store = createStore(createEmptyProject());
  const t = createGuideTool({ store, view: { camera: { scale: 1 } } });   // px(6) = 6 mm · tolMm(1) = 20 mm
  t.onPointerDown([1000.5, 0.25]);
  expect(activeFloor(store.get()).guides).toEqual([{ id: expect.any(String), type: 'v', pos: 1001 }]);
  t.onPointerDown([1015.5, 0.25]);   // 14.5 mm: 스냅 허용치 안이지만 지우기 반경 밖 → 하나 더 놓인다
  expect(activeFloor(store.get()).guides).toHaveLength(2);
  t.onPointerDown([1004.5, 0.25]);   // 3.5 mm: 지우기
  expect(activeFloor(store.get()).guides).toHaveLength(1);
});

// 리뷰 I-1·I-4: getSnap()은 보조선이 실제로 놓이는 축의 스냅만 보고한다(§16.6 마커 계약).
test('보조선 도구의 마커는 자기 축의 스냅만 보고한다(§16.6)', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200));
  const t = createGuideTool({ store, view: fakeView });   // 수직 보조선 · scale 0.1 → 허용 80 mm
  t.onPointerMove([2000.5, 60.25]);    // 수평 벽면 근처: y만 당겨지고 보조선 위치(x)는 그대로다
  expect(t.getSnap()).toBeNull();
  t.onPointerDown([2000.5, 60.25]);
  expect(activeFloor(store.get()).guides[0].pos).toBe(2001);   // 실제로 x는 움직이지 않았다
  t.onPointerMove([60.25, 1500.5]);    // 수직 벽면 근처: x가 실제로 당겨진다
  expect(t.getSnap()).toEqual({ point: [0.5, 1500.5], hit: 'wall' });
  t.onPointerMove([2500.5, 1500.25]);  // 아무 대상도 없는 가운데
  expect(t.getSnap()).toBeNull();
});

test('보조선 도구의 치수 칸은 좌표 하나다(§16.7)', () => {
  const store = createStore(createEmptyProject());
  const t = createGuideTool({ store, view: fakeView });
  t.onPointerDown([1234.5, 0.25]);
  expect(t.dims().fields[0].key).toBe('pos');
  expect(t.dims().fields[0].text).toBe('1235');       // 놓인 보조선의 좌표(정수 mm)
  t.setDim('pos', '1500');
  expect(t.commitDims()).toBe(true);
  expect(activeFloor(store.get()).guides[0].pos).toBe(1500);
});
