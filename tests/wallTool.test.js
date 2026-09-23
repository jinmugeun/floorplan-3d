import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { createWallTool } from '../src/view2d/tools/wallTool.js';

const key = k => ({ key: k, preventDefault() {} });

test('clicking points adds walls and closing the loop makes a room', () => {
  const store = createStore(createEmptyProject());
  let done = 0; const t = createWallTool({ store, onDone: () => done++ });
  t.onPointerDown([0, 0]); t.onPointerDown([4000, 0]); t.onPointerDown([4000, 3000]); t.onPointerDown([0, 3000]);
  expect(activeFloor(store.get()).walls).toHaveLength(3);
  t.onPointerDown([20, -30]);
  const f = activeFloor(store.get());
  expect(f.walls).toHaveLength(4); expect(f.rooms).toHaveLength(1); expect(done).toBe(1);
});

test('ortho snaps the cursor to an axis', () => {
  const store = createStore(createEmptyProject());
  const t = createWallTool({ store, onDone() {} });
  t.onPointerDown([0, 0]); t.onPointerMove([3000, 200]);
  expect(t.getPreview().cursor).toEqual([3000, 0]);
  t.opts.ortho = false; t.onPointerMove([3000, 200]);
  expect(t.getPreview().cursor).toEqual([3000, 200]);
});

test('typed length adds a wall along current direction', () => {
  const store = createStore(createEmptyProject());
  const t = createWallTool({ store, onDone() {} });
  t.onPointerDown([0, 0]); t.onPointerMove([1000, 0]);
  for (const c of '2500') t.onKey(key(c));
  t.onKey(key('Enter'));
  const w = activeFloor(store.get()).walls[0];
  expect(w.b).toEqual([2500, 0]);
});

test('typed length in ftin units parses feet/inches', () => {
  const store = createStore(createEmptyProject());
  store.dispatch(d => { d.units = 'ftin'; }, { record: false });
  const t = createWallTool({ store, onDone() {} });
  t.onPointerDown([0, 0]); t.onPointerMove([1000, 0]);
  for (const c of "10'") t.onKey(key(c));
  t.onKey(key('Enter'));
  const w = activeFloor(store.get()).walls[0];
  const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  expect(len).toBeCloseTo(3048, 1);
});

test('typed length in mm commits fractional values', () => {
  const store = createStore(createEmptyProject());
  const t = createWallTool({ store, onDone() {} });
  t.onPointerDown([0, 0]); t.onPointerMove([1000, 0]);
  for (const c of '3400.5') t.onKey(key(c));
  t.onKey(key('Enter'));
  const w = activeFloor(store.get()).walls[0];
  expect(w.b[0]).toBeCloseTo(3400.5, 1);
});

test('each wall is one undo step', () => {
  const store = createStore(createEmptyProject());
  const t = createWallTool({ store, onDone() {} });
  t.onPointerDown([0, 0]); t.onPointerDown([1000, 0]); t.onPointerDown([1000, 1000]);
  store.undo();
  expect(activeFloor(store.get()).walls).toHaveLength(1);
});

test('escape finishes an active chain and is consumed only then', () => {
  const store = createStore(createEmptyProject());
  let done = 0; const t = createWallTool({ store, onDone: () => done++ });
  expect(t.onKey(key('Escape'))).toBe(false);
  t.onPointerDown([0, 0]); t.onPointerDown([1000, 0]);
  expect(t.onKey(key('Escape'))).toBe(true);
  expect(done).toBe(1);
  expect(t.getPreview().points).toEqual([]);
});

test('reference inner/outer offsets the centerline by half the thickness', () => {
  const store = createStore(createEmptyProject());
  const t = createWallTool({ store, onDone() {} });
  t.opts.reference = 'inner';
  t.onPointerDown([0, 0]); t.onPointerDown([4000, 0]);
  let w = activeFloor(store.get()).walls[0];
  expect(w.a).toEqual([0, 100]); expect(w.b).toEqual([4000, 100]);
  t.onKey(key('Escape'));
  t.opts.reference = 'outer';
  t.onPointerDown([0, 2000]); t.onPointerDown([4000, 2000]);
  w = activeFloor(store.get()).walls[1];
  expect(w.a).toEqual([0, 1900]); expect(w.b).toEqual([4000, 1900]);
});

test('a typed length under 10mm adds neither a wall nor a chain point', () => {
  const store = createStore(createEmptyProject());
  const t = createWallTool({ store, onDone() {} });
  t.onPointerDown([0, 0]); t.onPointerMove([1000, 0]);
  t.onKey(key('0')); t.onKey(key('Enter'));
  expect(activeFloor(store.get()).walls).toHaveLength(0);
  expect(t.getPreview().points).toEqual([[0, 0]]);
});

test('a given opts object is used and exposed', () => {
  const store = createStore(createEmptyProject());
  const opts = { reference: 'center', thickness: 120, snap: true, ortho: false };
  const t = createWallTool({ store, opts, onDone() {} });
  expect(t.opts).toBe(opts);
  t.onPointerDown([0, 0]); t.onPointerMove([3000, 200]);
  expect(t.getPreview().cursor).toEqual([3000, 200]); // ortho: false 가 적용됐다
  t.onPointerDown([3000, 200]);
  expect(activeFloor(store.get()).walls[0].thickness).toBe(120);
});

test('in mm mode feet/inch characters are ignored while typing a length', () => {
  const store = createStore(createEmptyProject());
  const t = createWallTool({ store, onDone() {} });
  t.onPointerDown([0, 0]);
  expect(t.onKey(key("'"))).toBe(false);
  expect(t.onKey(key('"'))).toBe(false);
  for (const c of '2500') t.onKey(key(c));
  expect(t.getPreview().typed).toBe('2500');
  store.dispatch(d => { d.units = 'ftin'; }, { record: false });
  expect(t.onKey(key("'"))).toBe(true);
  expect(t.getPreview().typed).toBe("2500'");
});

// §14.7
test('벽 도구는 단계에 따라 안내가 바뀐다', () => {
  const store = createStore(createEmptyProject());
  const t = createWallTool({ store, onDone() {} });
  expect(t.hint).toBe('첫 점을 클릭하세요 (1/2)');
  t.onPointerDown([0.5, 0.25]);
  expect(t.hint).toBe('다음 점을 클릭 · 길이를 타이핑하고 [Enter] · [Enter] 완료 · [Esc] 취소');   // §16.7: 타이핑 안내 한 줄
  t.onKey({ key: 'Escape', preventDefault() {} });
  expect(t.hint).toBe('첫 점을 클릭하세요 (1/2)');
  // 그리는 중의 첫 [Esc]는 도구가 소비하고(체인만 지운다), 체인이 없으면 소비하지 않는다 → 키맵이 선택으로(결정 19b).
  expect(t.onKey({ key: 'Escape', preventDefault() {} })).toBe(false);   // 체인이 없으면 소비하지 않는다(키맵이 선택으로)
});

// §16.6: hit을 버리지 않는다 — 커서 옆 마커가 그것을 그린다.
test('벽 도구가 스냅 종류를 내놓고 허용치는 화면 배율을 따른다', () => {
  const store = createStore(createEmptyProject());
  const view = { camera: { scale: 0.1 } };                  // 8 px = 80 mm
  const t = createWallTool({ store, view, onDone() {} });
  t.onPointerDown([0.5, 0.25]); t.onPointerDown([4000.5, 0.25]);
  const t2 = createWallTool({ store, view, onDone() {} });
  t2.onPointerMove([40, 40]);                               // 끝점 [0.5, 0.25]에서 56 mm → 80 mm 안
  expect(t2.getSnap()).toEqual({ point: [0.5, 0.25], hit: 'point' });
  // 확대하면(배율 1) 허용치가 20 mm로 좁아져 같은 자리가 더는 물리지 않는다.
  const t3 = createWallTool({ store, view: { camera: { scale: 1 } }, onDone() {} });
  t3.onPointerMove([40, 40]);
  expect(t3.getSnap()?.hit).not.toBe('point');
});

// §16.7: 보이지 않던 typed 버퍼가 옵션 바의 칸이 된다 — 도구는 그 칸의 모델을 내놓는다.
test('벽 도구의 치수 칸은 길이 하나이고 타이핑·확정이 캔버스와 같은 경로다', () => {
  const store = createStore(createEmptyProject());
  const t = createWallTool({ store, onDone() {} });
  expect(t.dims()).toBeNull();                       // 그리기 전에는 칸이 없다
  t.onPointerDown([0.5, 0.25]);
  t.onPointerMove([3000.5, 0.25]);
  expect(t.dims()).toEqual({ fields: [{ key: 'len', text: '3000', mm: 3000, active: true }] });
  const sig = t.dimSig();
  expect(t.setDim('len', '4500')).toBe(true);
  expect(t.dims().fields[0].text).toBe('4500');
  expect(t.dimSig()).not.toBe(sig);                  // 뷰가 이 서명으로 옵션 바를 다시 맞춘다
  expect(t.commitDims()).toBe(true);
  const w = activeFloor(store.get()).walls;
  expect(w).toHaveLength(1);
  expect(Math.round(Math.hypot(w[0].b[0] - w[0].a[0], w[0].b[1] - w[0].a[1]))).toBe(4500);
  expect(t.setDim('nope', '1')).toBe(false);
});
