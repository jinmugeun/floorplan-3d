import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { addDuct, ductById } from '../src/state/ductOps.js';
import { productById } from '../src/products/catalog.js';
import { rectWalls } from '../src/geom/walls.js';
import { createSelectTool } from '../src/view2d/tools/selectTool.js';
import { createDuctSelect, deleteDuctSelection } from '../src/view2d/tools/ductSelect.js';
import { ductMenuItems } from '../src/ui/ductMenu.js';

const fakeView = { camera: { scale: 0.05 }, fit: () => {} };
const pickItem = (items, label) => items.find(x => x !== 'sep' && x.label === label);

function setup() {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [10000, 8000], 200));
  const hood = addItem(store, createItem(productById('hood-box'), { pos: [2000, 1500], z: 1700 }));
  const id = addDuct(store, {
    id: 'd1', points: [[2000, 1500], [8000, 1500], [8000, 6000]],
    segments: [{ w: 750, h: 400, z: 2650 }], connections: [{ point: 0, itemId: hood }],
  });
  const toasts = [];
  return { store, ui, id, hood, toasts, floor: () => activeFloor(store.get()),
    ds: createDuctSelect({ store, ui, view: fakeView, toast: m => toasts.push(m) }),
    st: createSelectTool({ store, ui, view: fakeView, toast: m => toasts.push(m) }) };
}

describe('덕트 선택과 편집', () => {
  test('구간을 누르면 덕트가, 꼭짓점을 누르면 그 점이 선택된다', () => {
    const { ui, ds, id } = setup();
    ds.onDown([5000, 1500]);
    expect(ui.get().selection).toEqual({ type: 'duct', id, segment: 0, vertex: null });
    ds.finish();
    ds.onDown([8000, 1500]);
    expect(ui.get().selection).toEqual({ type: 'duct', id, segment: null, vertex: 1 });
    ds.finish();
  });

  test('꼭짓점 드래그는 한 단계, 구간 드래그는 폴리라인 전체 평행 이동이다', () => {
    const { store, ds, id, floor } = setup();
    ds.onDown([8000, 1500]);
    ds.apply([8500.5, 1200.25]);
    ds.apply([9000, 1000]);
    ds.finish();
    expect(ductById(floor(), id).points[1]).toEqual([9000, 1000]);
    store.undo();
    expect(ductById(floor(), id).points[1]).toEqual([8000, 1500]);
    ds.onDown([5000, 1500]);
    ds.apply([5100.5, 1700.25]);
    ds.finish();
    expect(ductById(floor(), id).points).toEqual([[2101, 1700], [8101, 1700], [8101, 6200]]);
    // 연결된 설비는 따라오지 않고 연결만 남는다(아키텍처 §11.3)
    expect(floor().items[0].pos).toEqual([2000, 1500]);
    expect(ductById(floor(), id).connections).toEqual([{ point: 0, itemId: floor().items[0].id }]);
    store.undo();
    expect(ductById(floor(), id).points[0]).toEqual([2000, 1500]);
  });

  test('잠긴 덕트는 골라도 움직이지 않고 토스트로 알린다', () => {
    const { store, ui, ds, id, toasts, floor } = setup();
    store.dispatch(s => { activeFloor(s).ducts[0].locked = true; });
    ds.onDown([5000, 1500]);
    ds.apply([6000, 3000]);
    ds.finish();
    expect(ui.get().selection.id).toBe(id);
    expect(ductById(floor(), id).points[0]).toEqual([2000, 1500]);
    expect(toasts).toContain('잠긴 덕트는 움직일 수 없습니다');
  });

  test('Delete는 꼭짓점을 골랐으면 점 하나, 아니면 덕트 전체를 지운다', () => {
    const { store, ui, id, floor } = setup();
    ui.set({ selection: { type: 'duct', id, segment: null, vertex: 1 } });
    expect(deleteDuctSelection({ store, ui })).toBe(true);
    expect(ductById(floor(), id).points).toHaveLength(2);
    expect(ui.get().selection).toEqual({ type: 'duct', id, segment: null, vertex: null });
    expect(deleteDuctSelection({ store, ui })).toBe(true);   // 점이 2개면 덕트를 지운다
    expect(floor().ducts).toHaveLength(0);
    expect(ui.get().selection).toBeNull();
    expect(deleteDuctSelection({ store, ui })).toBe(false);  // 고른 덕트가 없으면 처리하지 않는다
  });

  test('우클릭 메뉴 항목이 상황에 따라 켜지고 꺼진다', () => {
    const { store, ui, ds, id, floor } = setup();
    const onSeg = ds.menuItems([5000, 1500]);
    expect(pickItem(onSeg, '점 삽입').disabled).toBe(false);
    expect(pickItem(onSeg, '댐퍼 추가').disabled).toBe(false);
    expect(pickItem(onSeg, '점 삭제').disabled).toBe(true);
    expect(pickItem(onSeg, '급기로 전환')).toBeTruthy();
    pickItem(onSeg, '댐퍼 추가').onSelect();
    expect(ductById(floor(), id).dampers[0]).toMatchObject({ segment: 0, type: 'VD', w: 750, h: 400 });
    const onVtx = ds.menuItems([2000, 1500]);
    expect(pickItem(onVtx, '점 삭제').disabled).toBe(false);
    expect(pickItem(onVtx, '설비 연결 해제').disabled).toBe(false);
    pickItem(onVtx, '설비 연결 해제').onSelect();
    expect(ductById(floor(), id).connections).toEqual([]);
    expect(ds.menuItems([9999, 9999])).toBeNull();
    pickItem(ds.menuItems([5000, 1500]), '잠금').onSelect();
    expect(ductById(floor(), id).locked).toBe(true);
    expect(ductMenuItems({ store, ui, sel: { type: 'duct', id: '없음' } })).toBeNull();
  });

  test('선택 도구는 아이템 다음·벽 앞에서 덕트를 잡는다', () => {
    const { ui, st, id } = setup();
    st.onPointerDown([5000, 1500]); st.onPointerUp([5000, 1500]);
    expect(ui.get().selection).toEqual({ type: 'duct', id, segment: 0, vertex: null });
    st.onPointerDown([2000, 1500]); st.onPointerUp([2000, 1500]);       // 후드가 덕트보다 먼저
    expect(ui.get().selection.type).toBe('item');
    st.onPointerDown([5000, 0]); st.onPointerUp([5000, 0]);             // 덕트가 없는 벽 위
    expect(ui.get().selection.type).toBe('wall');
  });
});
