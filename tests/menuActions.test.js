// §15.3: 선택이 있으면 [Shift+F10]·[ContextMenu] 키로 그 대상의 메뉴를 선택 중심에 연다.
// DOM은 필요 없다(메뉴·캔버스는 가짜를 넣는다).
import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { addDuct } from '../src/state/ductOps.js';
import { rectWalls, makeWall } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { selectionCenter, createMenuActions } from '../src/app/menuActions.js';

function setup() {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [10000, 8000], 200));
  addWalls(store, [makeWall({ a: [0, 8000], b: [3464.1016, 6000], thickness: 200, height: 2300 })]);  // 30° 벽
  const sofa = addItem(store, createItem(productById('sofa-3'), { pos: [2000.5, 1500.25] }));
  const duct = addDuct(store, { id: 'dk1', points: [[2000, 3000], [6000, 3000]], segments: [{ w: 500, h: 300, z: 2700 }] });
  const opened = [];
  const menu = { open: (x, y, items) => opened.push({ x, y, items }) };
  const view = {
    tool: { onContextMenu: () => [{ label: '삭제', onSelect: () => {} }] },
    toScreen: ([x, y]) => [x / 100, y / 100],
  };
  const canvas = { getBoundingClientRect: () => ({ left: 10, top: 20 }) };
  return { store, ui, sofa, duct, opened, actions: createMenuActions({ store, ui, view, menu, canvas }), view, floor: () => activeFloor(store.get()) };
}

describe('선택 중심', () => {
  test('아이템·다중·벽·방·덕트의 중심을 돌려준다(소수 좌표·30° 벽)', () => {
    const a = setup();
    expect(selectionCenter(a.store, a.ui)).toBeNull();                       // 선택이 없으면 null
    a.ui.set({ selection: { type: 'item', id: a.sofa } });
    expect(selectionCenter(a.store, a.ui)).toEqual([2000.5, 1500.25]);
    // rectWalls의 위쪽 벽도 y === 8000이라 y로 찾으면 직사각 벽을 먼저 집는다: 30° 벽의
    // 고유한 끝점 x(3464.1016)로 찾고 기대값을 숫자로 못 박는다(전역 규칙: 벽 테스트는 30° 벽).
    const w = a.floor().walls.find(x => Math.abs(x.b[0] - 3464.1016) < 1e-6 || Math.abs(x.a[0] - 3464.1016) < 1e-6);
    a.ui.set({ selection: { type: 'wall', id: w.id } });
    expect(selectionCenter(a.store, a.ui)[0]).toBeCloseTo(1732.0508, 6);
    expect(selectionCenter(a.store, a.ui)[1]).toBeCloseTo(7000, 6);
    a.ui.set({ selection: { type: 'room', id: a.floor().rooms[0].id } });
    const c = selectionCenter(a.store, a.ui);
    expect(c[0]).toBeGreaterThan(0);
    a.ui.set({ selection: { type: 'duct', id: a.duct, segment: 0, vertex: null } });
    expect(selectionCenter(a.store, a.ui)).toEqual([4000, 3000]);
    a.ui.set({ selection: { type: 'duct', id: a.duct, segment: null, vertex: 1 } });
    expect(selectionCenter(a.store, a.ui)).toEqual([6000, 3000]);
    a.ui.set({ selection: { type: 'item', id: '사라진id' } });
    expect(selectionCenter(a.store, a.ui)).toBeNull();
  });
});

describe('openSelectionMenu', () => {
  test('선택 중심의 화면 좌표에 메뉴를 연다', () => {
    const a = setup();
    expect(a.actions.openSelectionMenu()).toBe(false);                        // 선택이 없으면 열지 않는다
    a.ui.set({ selection: { type: 'item', id: a.sofa } });
    const before = a.ui.get().selection;
    expect(a.actions.openSelectionMenu()).toBe(true);
    expect(a.ui.get().selection).toEqual(before);   // 키보드 메뉴는 선택을 옮기지 않는다(§15.3)
    expect(a.opened).toHaveLength(1);
    expect(a.opened[0].x).toBeCloseTo(10 + 20.005, 6);                        // 캔버스 왼쪽 + toScreen
    expect(a.opened[0].y).toBeCloseTo(20 + 15.0025, 6);
    expect(a.opened[0].items[0].label).toBe('삭제');
  });

  test('2D가 아니거나 도구가 메뉴를 주지 않으면 열지 않는다', () => {
    const a = setup();
    a.ui.set({ selection: { type: 'item', id: a.sofa }, mode: 'iso' });
    expect(a.actions.openSelectionMenu()).toBe(false);
    a.ui.set({ mode: '2d' });
    a.view.tool = { onContextMenu: () => [] };
    expect(a.actions.openSelectionMenu()).toBe(false);
    a.view.tool = {};
    expect(a.actions.openSelectionMenu()).toBe(false);
    expect(a.opened).toEqual([]);
  });
});
