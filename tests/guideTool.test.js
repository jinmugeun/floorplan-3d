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
  t.onPointerDown([1015.5, 0.25]);   // 14.5 mm: 지우기 반경 밖 → 지워지지 않는다(스냅으로 1001에 붙어 겹치지도 않는다)
  expect(activeFloor(store.get()).guides.map(g => g.pos)).toEqual([1001]);
  t.onPointerDown([1050.5, 0.25]);   // 49.5 mm: 허용치(20 mm) 밖 → 다른 자리에 하나 더
  expect(activeFloor(store.get()).guides.map(g => g.pos)).toEqual([1001, 1051]);
  t.onPointerDown([1004.5, 0.25]);   // 3.5 mm: 지우기
  expect(activeFloor(store.get()).guides.map(g => g.pos)).toEqual([1051]);
});

// 리뷰 N-1: 허용치 안에서 스냅이 기존 보조선에 붙으면 겹쳐 놓지 않고 그 보조선을 집는다(되돌림 단계도 생기지 않는다).
test('허용치 안의 기존 보조선 위에는 겹쳐 놓지 않고 그 보조선을 집는다', () => {
  const store = createStore(createEmptyProject());
  const t = createGuideTool({ store, view: { camera: { scale: 1 } } });   // px(6) = 6 mm · tolMm(1) = 20 mm
  t.onPointerDown([1000.5, 0.25]);
  const placedId = activeFloor(store.get()).guides[0].id;
  const before = store.get();
  t.onPointerDown([1015.5, 0.25]);   // 14.5 mm: 지우기 밖·허용치 안 → 스냅이 1001에 붙는다
  expect(store.get()).toBe(before);                                   // dispatch 없음 = 되돌림 단계가 쌓이지 않는다
  expect(activeFloor(store.get()).guides.map(g => g.pos)).toEqual([1001]);   // 겹치지 않는다
  expect(t.dims().fields[0].mm).toBe(1001);                           // lastId가 유령이 아니라 기존 보조선을 가리킨다
  t.setDim('pos', '1500');
  expect(t.commitDims()).toBe(true);
  expect(activeFloor(store.get()).guides).toEqual([{ id: placedId, type: 'v', pos: 1500 }]);   // 그 보조선이 움직인다
  expect(store.undo()).toBe(true);
  expect(activeFloor(store.get()).guides.map(g => g.pos)).toEqual([1001]);
  expect(store.undo()).toBe(true);
  expect(activeFloor(store.get()).guides).toEqual([]);                // 되돌림 두 번이면 처음으로 — 빈 단계가 없다
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

// 리뷰 I-3: 보조선을 놓기 전에도 칸이 뜨는데 [Enter]가 아무 일도 하지 않는 죽은 입구였다.
// 이제 그 좌표에 보조선을 놓는다(한 동작 = 한 되돌림 단계).
test('보조선을 놓기 전에 좌표를 타이핑하면 그 자리에 놓인다(리뷰 I-3)', () => {
  const store = createStore(createEmptyProject());
  const t = createGuideTool({ store, view: fakeView });
  t.onPointerMove([800.5, 0.25]);                    // 칸은 커서 좌표를 보여 준다
  expect(t.dims().fields[0].text).toBe('801');
  expect(t.setDim('pos', '1500')).toBe(true);
  expect(t.commitDims()).toBe(true);
  expect(activeFloor(store.get()).guides).toEqual([{ id: expect.any(String), type: 'v', pos: 1500 }]);
  expect(store.undo()).toBe(true);
  expect(activeFloor(store.get()).guides).toEqual([]);   // 빈 단계가 아니라 그 한 단계다
});

test('놓기 전에 확정한 좌표가 이미 있는 보조선과 겹치면 겹쳐 놓지 않는다(리뷰 I-3·N-1)', () => {
  const store = createStore(createEmptyProject());
  const t = createGuideTool({ store, view: fakeView });
  t.setDim('pos', '1500'); t.commitDims();
  const before = store.get();
  const t2 = createGuideTool({ store, view: fakeView });
  t2.setDim('pos', '1500');
  expect(t2.commitDims()).toBe(true);
  expect(store.get()).toBe(before);                  // dispatch 없음 = 되돌림 단계가 쌓이지 않는다
  expect(activeFloor(store.get()).guides).toHaveLength(1);
  t2.setDim('pos', '1800');                          // 집어 둔 그 보조선을 이어서 옮긴다
  t2.commitDims();
  expect(activeFloor(store.get()).guides.map(g => g.pos)).toEqual([1800]);
});

// 리뷰 I-4: 라벨은 `좌표 (ft·in)`인데 값만 mm 정수였고, 그 라벨을 믿고 넣은 `4'`는 NaN으로 사라졌다.
test('보조선 좌표 칸은 현재 단위로 말하고 읽는다(리뷰 I-4)', () => {
  const store = createStore(createEmptyProject());
  const t = createGuideTool({ store, view: fakeView });
  t.onPointerDown([1219.5, 0.25]);
  expect(t.dims().fields[0].text).toBe('1220');      // mm 모드: 정수 mm 그대로
  store.dispatch(d => { d.units = 'ftin'; }, { record: false });
  expect(t.dims().fields[0].text).toBe(`4' 0"`);     // 1220 mm → fmtLen의 ft·in 표기(라벨과 같은 말을 한다)
  t.setDim('pos', `4'`);
  expect(t.commitDims()).toBe(true);
  expect(activeFloor(store.get()).guides[0].pos).toBe(1219);   // 4피트 = 1219.2 mm → 반올림
  // ft·in 화면에서는 `'`·`"`도 타이핑할 수 있는 글자다(캔버스 입구도 같은 규칙).
  for (const c of `5'`) expect(t.onKey(key(c))).toBe(true);
  expect(t.onKey(key('Enter'))).toBe(true);
  expect(activeFloor(store.get()).guides[0].pos).toBe(1524);
  // 읽을 수 없는 입력은 버린다(값은 그대로).
  for (const c of '엉') t.onKey(key(c));
  t.setDim('pos', '엉터리');
  expect(t.commitDims()).toBe(true);
  expect(activeFloor(store.get()).guides[0].pos).toBe(1524);
});
