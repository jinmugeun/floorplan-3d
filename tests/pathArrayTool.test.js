import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { createPathArrayTool } from '../src/view2d/tools/pathArrayTool.js';
import { tolMm } from '../src/geom/snap.js';

const fakeView = { camera: { scale: 0.1 }, requestRender: () => {} };
function setup() {
  const store = createStore(createEmptyProject()), ui = createUiState();
  addWalls(store, rectWalls([0, 0], [8000, 6000], 200));
  const id = addItem(store, createItem(productById('chair-dining'), { pos: [1000.5, 1000.25] }));
  const done = [];
  const toasts = [];
  const t = createPathArrayTool({ store, ui, view: fakeView, ids: [id], onDone: p => done.push(p), toast: m => toasts.push(m) });
  return { store, ui, id, t, done, toasts, floor: () => activeFloor(store.get()) };
}
const key = (t, k, extra = {}) => t.onKey({ key: k, preventDefault() {}, ...extra });

describe('경로 배열 도구', () => {
  test('클릭한 점이 차례로 쌓이고 [Enter]가 경로를 넘긴다(소수 좌표)', () => {
    const a = setup();
    expect(a.t.name).toBe('pathArray');
    expect(a.t.opts).toEqual({});                       // 옵션 바가 없다
    a.t.onPointerDown([2000.5, 1000.25], {});
    a.t.onPointerDown([5000.5, 1000.25], {});
    a.t.onPointerDown([5000.5, 4000.25], {});
    expect(a.t.getPreview().points).toHaveLength(3);
    expect(key(a.t, 'Enter')).toBe(true);
    expect(a.done).toHaveLength(1);
    expect(a.done[0]).toEqual([[2000.5, 1000.25], [5000.5, 1000.25], [5000.5, 4000.25]]);
    expect(a.t.getPreview().points).toEqual([]);        // 끝나면 비워진다
  });

  // §14.10 이월: 점 하나로 [Enter]를 누르면 도구를 끄지 않고 알려 준다(onDone 계약 불변).
  test('점이 하나뿐이면 [Enter]는 도구를 유지하고 알려 준다', () => {
    const a = setup();
    a.t.onPointerDown([2000, 1000], {});
    expect(key(a.t, 'Enter')).toBe(true);
    expect(a.done).toEqual([]);
    expect(a.toasts).toEqual(['점을 2개 이상 찍어 주세요']);
    expect(a.t.getPreview().points).toEqual([[2000, 1000]]);
  });

  test('[Esc]는 취소이고 선택은 건드리지 않는다', () => {
    const a = setup();
    a.ui.set({ selection: { type: 'item', id: a.id } });
    a.t.onPointerDown([2000, 1000], {});
    expect(key(a.t, 'Escape')).toBe(true);
    expect(a.done).toEqual([null]);
    expect(a.ui.get().selection).toEqual({ type: 'item', id: a.id });
    expect(a.floor().items).toHaveLength(1);            // 스토어를 건드리지 않는다
  });

  test('마지막 점을 다시 클릭하면(더블클릭) 완료다', () => {
    const a = setup();
    a.t.onPointerDown([2000, 1000], {});
    a.t.onPointerDown([5000, 1000], {});
    a.t.onPointerDown([5000, 1000], {});                // 같은 자리 두 번
    expect(a.done).toHaveLength(1);
    expect(a.done[0]).toEqual([[2000, 1000], [5000, 1000]]);
  });

  test('[Shift]를 누르고 움직이면 직교로 잠긴다', () => {
    const a = setup();
    a.t.onPointerDown([2000, 1000], {});
    a.t.onPointerMove([4900, 1200], { shiftKey: true });
    expect(a.t.getPreview().cursor).toEqual([4900, 1000]);   // y가 앞 점에 잠긴다
    a.t.onPointerMove([2100, 3000], { shiftKey: true });
    expect(a.t.getPreview().cursor).toEqual([2000, 3000]);   // 세로가 더 길면 x가 잠긴다
  });

  test('[Backspace]는 마지막 점을 되돌리고, 점이 없으면 소비하지 않는다', () => {
    const a = setup();
    expect(key(a.t, 'Backspace')).toBe(false);
    a.t.onPointerDown([2000, 1000], {});
    a.t.onPointerDown([5000, 1000], {});
    expect(key(a.t, 'Backspace')).toBe(true);
    expect(a.t.getPreview().points).toEqual([[2000, 1000]]);
  });

  test('안내 문구 클릭·우클릭·cancel은 모두 취소로 끝난다', () => {
    const a = setup();
    a.t.onPointerDown([2000, 1000], {});
    a.t.onHintClick();
    expect(a.done).toEqual([null]);
    a.t.onPointerDown([2000, 1000], {});
    expect(a.t.onContextMenu([0, 0], {})).toBeNull();
    expect(a.done).toEqual([null, null]);
    a.t.onPointerDown([2000, 1000], {});
    a.t.cancel();
    expect(a.t.getPreview().points).toEqual([]);
    expect(a.t.hint).toContain('[Esc]');
    expect(a.t.hint).toContain('[Enter]');
    expect(a.t.hint).toContain('[Shift]');
  });
});

// §16.6: 도구별 상수가 사라지고 화면 8 px 한 규칙이 됐다 — 이름도 그 사실을 말한다.
test('점 스냅 허용오차는 화면 8 px이다(§16.6)', () => {
  const a = setup();
  expect(tolMm(fakeView.camera.scale)).toBe(80);   // 이 파일의 fakeView는 scale 0.1이다(10행)
  a.t.onPointerDown([2000, 1000], {});
  a.t.onPointerMove([2000, 1120], {});                  // 120 mm 떨어진 자리: 예전에는 앞 점으로 붙었다
  expect(a.t.getPreview().cursor).toEqual([2000, 1120]);
  a.t.onPointerMove([2000, 1030], {});                  // 30 mm: 여전히 붙는다
  expect(a.t.getPreview().cursor).toEqual([2000, 1000]);
});

// 리뷰 I-4: getSnap()은 브리핑의 Produces 계약이자 마커가 읽는 표면이다(§16.6).
test('경로 배열 도구가 스냅 종류를 내놓는다(§16.6)', () => {
  const a = setup();                                   // 8000×6000 벽 · scale 0.1 → 허용 80 mm
  a.t.onPointerMove([60.5, 40.25], {});                // 아래쪽 벽면에서 40.25 mm
  expect(a.t.getSnap()).toEqual({ point: [60.5, 0], hit: 'wall' });
  a.t.onPointerDown([2000.5, 1000.25], {});
  a.t.onPointerMove([2000.5, 1030.25], {});            // 앞 점에서 30 mm
  expect(a.t.getSnap()).toEqual({ point: [2000.5, 1000.25], hit: 'point' });
  a.t.onPointerMove([4000.5, 3000.25], {});            // 방 한가운데
  expect(a.t.getSnap()).toBeNull();
});
