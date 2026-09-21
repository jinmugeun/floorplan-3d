import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { createPathArrayTool } from '../src/view2d/tools/pathArrayTool.js';

const fakeView = { camera: { scale: 0.1 }, requestRender: () => {} };
function setup() {
  const store = createStore(createEmptyProject()), ui = createUiState();
  addWalls(store, rectWalls([0, 0], [8000, 6000], 200));
  const id = addItem(store, createItem(productById('chair-dining'), { pos: [1000.5, 1000.25] }));
  const done = [];
  const t = createPathArrayTool({ store, ui, view: fakeView, ids: [id], onDone: p => done.push(p) });
  return { store, ui, id, t, done, floor: () => activeFloor(store.get()) };
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

  test('점이 하나뿐이면 [Enter]도 null을 넘긴다(배열할 경로가 아니다)', () => {
    const a = setup();
    a.t.onPointerDown([2000, 1000], {});
    key(a.t, 'Enter');
    expect(a.done).toEqual([null]);
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
