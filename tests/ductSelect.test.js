import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { addDuct, ductById } from '../src/state/ductOps.js';
import { productById } from '../src/products/catalog.js';
import { rectWalls } from '../src/geom/walls.js';
import { createSelectTool } from '../src/view2d/tools/selectTool.js';
import { createDuctSelect, deleteSelectedDuct } from '../src/view2d/tools/ductSelect.js';
import { pickAt } from '../src/view2d/tools/pick.js';
import { ductMenuItems } from '../src/ui/ductMenu.js';

const fakeView = { camera: { scale: 0.05 }, fit: () => {} };
const pickItem = (items, label) => items.find(x => x !== 'sep' && x.label === label);

// §14.6: 히트 판정은 pick.pickAt 한 곳에만 있다. ductSelect는 그 결과를 받아 선택·드래그·메뉴로
// 바꾸는 쪽이므로, 예전의 ds.onDown(p)·ds.menuItems(p)(자체 피커) 대신 캔버스와 같은 순서로 부른다.
const hitAt = (store, ui, p) => pickAt(store, ui, p, { scale: fakeView.camera.scale });
const down = (store, ui, ds, p) => { const h = hitAt(store, ui, p); return h?.type === 'duct' ? ds.begin(h, p) : false; };
const menuAt = (store, ui, ds, p) => { const h = hitAt(store, ui, p); return h?.type === 'duct' ? ds.menuFor(h) : null; };

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
  const ds = createDuctSelect({ store, ui, toast: m => toasts.push(m) });
  return { store, ui, id, hood, toasts, ds, floor: () => activeFloor(store.get()),
    down: p => down(store, ui, ds, p),
    menu: p => menuAt(store, ui, ds, p),
    st: createSelectTool({ store, ui, view: fakeView, toast: m => toasts.push(m) }) };
}

describe('덕트 선택과 편집', () => {
  test('구간을 누르면 덕트가, 꼭짓점을 누르면 그 점이 선택된다', () => {
    const { ui, ds, down, id } = setup();
    down([5000, 1500]);
    expect(ui.get().selection).toEqual({ type: 'duct', id, segment: 0, vertex: null });
    ds.finish();
    down([8000, 1500]);
    expect(ui.get().selection).toEqual({ type: 'duct', id, segment: null, vertex: 1 });
    ds.finish();
  });

  test('꼭짓점 드래그는 한 단계, 구간 드래그는 폴리라인 전체 평행 이동이다', () => {
    const { store, ds, down, id, floor } = setup();
    down([8000, 1500]);
    ds.apply([8500.5, 1200.25]);
    ds.apply([9000, 1000]);
    ds.finish();
    expect(ductById(floor(), id).points[1]).toEqual([9000, 1000]);
    store.undo();
    expect(ductById(floor(), id).points[1]).toEqual([8000, 1500]);
    down([5000, 1500]);
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
    const { store, ui, ds, down, id, toasts, floor } = setup();
    store.dispatch(s => { activeFloor(s).ducts[0].locked = true; });
    down([5000, 1500]);
    ds.apply([6000, 3000]);
    ds.finish();
    expect(ui.get().selection.id).toBe(id);
    expect(ductById(floor(), id).points[0]).toEqual([2000, 1500]);
    expect(toasts).toContain('잠긴 덕트는 움직일 수 없습니다');
  });

  test('Delete는 꼭짓점을 골랐으면 점 하나, 아니면 덕트 전체를 지운다', () => {
    const { store, ui, id, floor } = setup();
    ui.set({ selection: { type: 'duct', id, segment: null, vertex: 1 } });
    expect(deleteSelectedDuct({ store, ui })).toBe(true);
    expect(ductById(floor(), id).points).toHaveLength(2);
    expect(ui.get().selection).toEqual({ type: 'duct', id, segment: null, vertex: null });
    expect(deleteSelectedDuct({ store, ui })).toBe(true);   // 점이 2개면 덕트를 지운다
    expect(floor().ducts).toHaveLength(0);
    expect(ui.get().selection).toBeNull();
    expect(deleteSelectedDuct({ store, ui })).toBe(false);  // 고른 덕트가 없으면 처리하지 않는다
  });

  test('우클릭 메뉴 항목이 상황에 따라 켜지고 꺼진다', () => {
    const { store, ui, menu, id, floor } = setup();
    const onSeg = menu([5000, 1500]);
    expect(pickItem(onSeg, '점 삽입').disabled).toBe(false);
    expect(pickItem(onSeg, '댐퍼 추가').disabled).toBe(false);
    expect(pickItem(onSeg, '점 삭제').disabled).toBe(true);
    expect(pickItem(onSeg, '급기로 전환')).toBeTruthy();
    pickItem(onSeg, '댐퍼 추가').onSelect();
    expect(ductById(floor(), id).dampers[0]).toMatchObject({ segment: 0, type: 'VD', w: 750, h: 400 });
    const onVtx = menu([2000, 1500]);
    expect(pickItem(onVtx, '점 삭제').disabled).toBe(false);
    expect(pickItem(onVtx, '설비 연결 해제').disabled).toBe(false);
    pickItem(onVtx, '설비 연결 해제').onSelect();
    expect(ductById(floor(), id).connections).toEqual([]);
    expect(menu([9999, 9999])).toBeNull();
    pickItem(menu([5000, 1500]), '잠금').onSelect();
    expect(ductById(floor(), id).locked).toBe(true);
    expect(ductMenuItems({ store, ui, sel: { type: 'duct', id: '없음' } })).toBeNull();
  });

  test('연결된 꼭짓점을 설비에서 떼어 놓으면 연결이 끊긴다(한 단계로 되돌아간다)', () => {
    const { store, ds, down, id, hood, floor } = setup();
    down([2000, 1500]);                       // 후드에 연결된 0번 점
    ds.apply([3000.5, 3000.25]);                   // 풋프린트(1600×1200) 밖 + 접속점에서 300 mm 넘게
    ds.finish();
    expect(ductById(floor(), id).points[0]).toEqual([3001, 3000]);
    expect(ductById(floor(), id).connections).toEqual([]);
    store.undo();                                  // 드래그 + 연결 해제가 한 단계다
    expect(ductById(floor(), id).points[0]).toEqual([2000, 1500]);
    expect(ductById(floor(), id).connections).toEqual([{ point: 0, itemId: hood }]);
  });

  test('연결된 꼭짓점을 설비 안에서 조금만 옮기면 연결이 남는다', () => {
    const { ds, down, id, hood, floor } = setup();
    down([2000, 1500]);
    ds.apply([2200.5, 1600.25]);                   // 아직 후드 풋프린트 안
    ds.finish();
    expect(ductById(floor(), id).connections).toEqual([{ point: 0, itemId: hood }]);
  });

  test('연결된 꼭짓점을 다른 설비에 떨어뜨리면 그 설비로 옮겨 붙는다', () => {
    const { store, ds, down, id, hood, floor } = setup();
    const other = addItem(store, createItem(productById('hood-box'), { pos: [7000.5, 5000.25], z: 1700 }));
    down([2000, 1500]);
    ds.apply([7000.5, 5000.25]);
    ds.finish();
    const conns = ductById(floor(), id).connections;
    expect(conns).toEqual([{ point: 0, itemId: other }]);
    expect(conns[0].itemId).not.toBe(hood);
  });

  test('점 삽입은 클릭이 구간에서 벗어나도 중심선 위에 점을 넣는다', () => {
    const { store, ui, menu, id, floor } = setup();
    // 구간 0은 [2000,1500]→[8000,1500], 폭 750이라 중심선에서 375 mm 벗어난 클릭도 같은 구간으로 잡힌다.
    pickItem(menu([5100.5, 1700.25]), '점 삽입').onSelect();
    const pts = ductById(floor(), id).points;
    expect(pts).toHaveLength(4);
    expect(pts[1]).toEqual([5100.5, 1500]);
    const cross = (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[1][1] - pts[0][1]) * (pts[2][0] - pts[0][0]);
    expect(cross).toBeCloseTo(0, 6);               // 세 점이 여전히 일직선
    // 메뉴를 직접 부르는 다른 경로(3D 면 피커·키보드)도 같은 투영을 지난다
    store.undo();
    const sel = { type: 'duct', id, segment: 0, vertex: null };
    pickItem(ductMenuItems({ store, ui, sel, at: [4000.25, 900.5] }), '점 삽입').onSelect();
    expect(ductById(floor(), id).points[1]).toEqual([4000.25, 1500]);
  });

  test('고른 덕트의 꼭짓점 핸들은 설비보다 먼저 잡힌다 — 자동 연결 해제에 닿는 유일한 경로', () => {
    const { store, ui, st, id, hood, floor } = setup();
    // 아무것도 고르지 않았어도 덕트 꼭짓점이 아이템보다 먼저다(§14.6). 후드를 고르려면
    // 꼭짓점 핸들 반경(화면 8 px) 밖의 몸통을 누른다.
    st.onPointerDown([2600.5, 1900.25]); st.onPointerUp([2600.5, 1900.25]);
    expect(ui.get().selection.type).toBe('item');
    // 구간을 눌러 덕트를 먼저 고르면(1단계) 그 덕트의 꼭짓점 핸들이 아이템보다 먼저다(2단계).
    st.onPointerDown([5000.5, 1500.25]); st.onPointerUp([5000.5, 1500.25]);
    expect(ui.get().selection).toEqual({ type: 'duct', id, segment: 0, vertex: null });
    st.onPointerDown([2000.5, 1500.25]);
    expect(ui.get().selection).toEqual({ type: 'duct', id, segment: null, vertex: 0 });
    expect(st.getDrag()).toMatchObject({ kind: 'vertex', id, index: 0 });   // 아이템 드래그가 아니다
    st.onPointerMove([4000.75, 1500.25]);                                  // 2 m 밖 = 풋프린트·스냅 허용치 밖
    st.onPointerUp([4000.75, 1500.25]);
    expect(ductById(floor(), id).points[0]).toEqual([4000, 1500]);
    expect(ductById(floor(), id).connections).toEqual([]);                  // 자동 연결 해제
    store.undo();                                                          // 이동 + 해제가 한 단계
    expect(ductById(floor(), id).points[0]).toEqual([2000, 1500]);
    expect(ductById(floor(), id).connections).toEqual([{ point: 0, itemId: hood }]);
  });

  test('고른 덕트의 꼭짓점 우클릭은 아이템 메뉴가 아니라 덕트 메뉴를 준다', () => {
    const { ui, st, id, floor } = setup();
    ui.set({ selection: { type: 'duct', id, segment: 0, vertex: null } });
    const menu = st.onContextMenu([2000.5, 1500.25]);
    expect(ui.get().selection).toEqual({ type: 'duct', id, segment: null, vertex: 0 });
    expect(pickItem(menu, '설비 연결 해제').disabled).toBe(false);
    pickItem(menu, '설비 연결 해제').onSelect();
    expect(ductById(floor(), id).connections).toEqual([]);
    // 고른 덕트가 없어도 꼭짓점 위 우클릭은 덕트 메뉴다(§14.6). 후드 몸통 쪽은 그대로 제품 메뉴다.
    ui.set({ selection: null });
    expect(pickItem(st.onContextMenu([2000.5, 1500.25]), '설비 연결 해제')).toBeTruthy();
    ui.set({ selection: null });
    expect(pickItem(st.onContextMenu([2600.5, 1900.25]), '설비 연결 해제')).toBeUndefined();
    expect(ui.get().selection.type).toBe('item');
  });

  test('선택 도구는 덕트를 아이템보다 먼저, 벽보다 먼저 잡는다(§14.6)', () => {
    const { ui, st, id } = setup();
    // 후드 중심 = 덕트 0번 꼭짓점: 이제 덕트가 이긴다(예전에는 후드가 이겼다).
    st.onPointerDown([2000, 1500]); st.onPointerUp([2000, 1500]);
    expect(ui.get().selection).toEqual({ type: 'duct', id, segment: null, vertex: 0 });
    // 꼭짓점 밖의 후드 몸통은 후드다.
    st.onPointerDown([2600, 1900]); st.onPointerUp([2600, 1900]);
    expect(ui.get().selection.type).toBe('item');
    st.onPointerDown([5000, 1500]); st.onPointerUp([5000, 1500]);
    expect(ui.get().selection).toEqual({ type: 'duct', id, segment: 0, vertex: null });
    st.onPointerDown([5000, 0]); st.onPointerUp([5000, 0]);             // 덕트가 없는 벽 위
    expect(ui.get().selection.type).toBe('wall');
  });
});
