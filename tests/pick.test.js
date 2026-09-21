// §14.6: 2D에서 덕트를 클릭으로 고를 수 없었다. 덕트 구간 정중앙을 눌러도 근처 디퓨저가 잡히고,
// 같은 자리 우클릭은 제품 메뉴를 줬다(좌클릭 경로와 우클릭 경로가 서로 다른 히트 코드를 갖고 있었다).
// 이제 pickAt 하나가 순서를 정한다: 고른 덕트의 핸들 → 덕트 꼭짓점 → 덕트 구간 → 아이템 → 벽 → 방.
import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { addDuct } from '../src/state/ductOps.js';
import { rectWalls, makeWall } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { pickAt, PICK_TOL_PX } from '../src/view2d/tools/pick.js';
import { createSelectTool } from '../src/view2d/tools/selectTool.js';

const fakeView = { camera: { scale: 0.05 }, fit: () => {} };
const at = { scale: 0.05 };
const menuLabel = (items, label) => (items ?? []).find(x => x !== 'sep' && x.label === label);

function setup() {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [10000, 8000], 200));
  addWalls(store, [makeWall({ a: [0, 8000], b: [3464.1016, 6000], thickness: 200, height: 2300 })]);  // 30° 벽
  const hood = addItem(store, createItem(productById('hood-box'), { pos: [2000, 1500], z: 1700 }));
  const diffuser = addItem(store, createItem(productById('diffuser-650'), { pos: [6000, 3100], z: 2200 }));
  const range = addItem(store, createItem(productById('range-gas-high'), { pos: [4000, 4000] }));
  const lamp = addItem(store, createItem(productById('diffuser-500-350'), { pos: [4000, 4000], z: 2200 }));
  const locked = addItem(store, createItem(productById('sofa-3'), { pos: [8000, 6000], locked: true }));
  const duct = addDuct(store, {
    id: 'dk1', points: [[2000, 1500], [6000, 1500], [6000, 5000]],
    segments: [{ w: 750, h: 400, z: 2650 }], connections: [{ point: 0, itemId: hood }],
  });
  return { store, ui, hood, diffuser, range, lamp, locked, duct, floor: () => activeFloor(store.get()) };
}

describe('2D 히트 순서(pickAt)', () => {
  test('덕트 구간이 같은 자리의 천장 설비보다 먼저 잡힌다(감사 #20)', () => {
    const { store, ui, duct } = setup();
    const hit = pickAt(store, ui, [6000, 3100], at);
    expect(hit).toMatchObject({ type: 'duct', ductId: duct, segment: 1, handle: false });
    expect(hit.vertex).toBeNull();
    // 덕트 꼭짓점은 구간보다 먼저다(같은 폴리라인 위라도 점이 이긴다).
    expect(pickAt(store, ui, [6000, 1500], at)).toMatchObject({ type: 'duct', ductId: duct, vertex: 1 });
    // 덕트를 보기에서 끄면 그 아래 디퓨저가 잡힌다.
    store.dispatch(d => { d.view.v2.ducts = false; }, { record: false });
    expect(pickAt(store, ui, [6000, 3100], at).type).toBe('item');
  });

  test('고른 덕트의 꼭짓점 핸들은 설비 중심이어도 먼저 잡힌다(계획 3 규칙 유지)', () => {
    const { store, ui, duct, hood } = setup();
    ui.set({ selection: { type: 'duct', id: duct, segment: 0, vertex: null } });
    const hit = pickAt(store, ui, [2000.5, 1500.25], at);
    expect(hit).toMatchObject({ type: 'duct', ductId: duct, vertex: 0, handle: true });
    // 후드 몸통의 다른 자리는 여전히 후드다(핸들 반경은 화면 8 px = 여기서 160 mm).
    expect(pickAt(store, ui, [2600.5, 1900.25], at)).toMatchObject({ type: 'item' });
    expect(pickAt(store, ui, [2600.5, 1900.25], at).item.id).toBe(hood);
  });

  test('아이템 → 벽 → 방 순서와 소수 좌표·30° 벽', () => {
    const { store, ui, hood } = setup();
    expect(pickAt(store, ui, [2600.5, 1900.25], at).item.id).toBe(hood);
    expect(pickAt(store, ui, [5000.5, 0.25], at)).toMatchObject({ type: 'wall' });
    expect(pickAt(store, ui, [1732.05, 7000.0], at)).toMatchObject({ type: 'wall' });   // 30° 벽 위
    expect(pickAt(store, ui, [8000.5, 6000.25], at)).toMatchObject({ type: 'room' });   // 잠긴 소파는 건너뛴다
    expect(pickAt(store, ui, [20000, 20000], at)).toBeNull();
    expect(PICK_TOL_PX).toEqual({ wall: 6, item: 2, duct: 8, handle: 8 });
  });

  test('겹친 아이템은 위에 그린 것(천장 부착)이 먼저다', () => {
    const { store, ui, lamp } = setup();
    expect(pickAt(store, ui, [4000, 4000], at).item.id).toBe(lamp);
    store.dispatch(d => { d.view.v2.ceilingItems = false; }, { record: false });
    expect(pickAt(store, ui, [4000, 4000], at).item.kind).toBe('equipment');            // 그 아래 조리기구
    expect(pickAt(store, ui, [4000, 4000], at).item.productId).toBe('range-gas-high');
  });

  test('선택 도구의 우클릭 대상 = 좌클릭 대상', () => {
    const { store, ui, duct } = setup();
    const t = createSelectTool({ store, ui, view: fakeView });
    t.onPointerDown([6000, 3100], {}); t.onPointerUp([6000, 3100], {});
    expect(ui.get().selection).toMatchObject({ type: 'duct', id: duct, segment: 1 });
    ui.set({ selection: null });
    const menu = t.onContextMenu([6000, 3100], {});
    expect(ui.get().selection).toMatchObject({ type: 'duct', id: duct, segment: 1 });
    expect(menuLabel(menu, '점 삽입')).toBeTruthy();                                     // 제품 메뉴가 아니다
    expect(menuLabel(menu, '좌우 반전')).toBeUndefined();
    // 벽·방도 좌우가 같은 대상을 고른다.
    t.onPointerDown([5000, 0], {}); t.onPointerUp([5000, 0], {});
    const wallId = ui.get().selection.id;
    ui.set({ selection: null });
    expect(menuLabel(t.onContextMenu([5000, 0], {}), '벽 나누기')).toBeTruthy();
    expect(ui.get().selection).toEqual({ type: 'wall', id: wallId });
  });

  test('다중 선택된 벽 묶음은 그 벽에 붙은 제품보다 먼저다(결정 37)', () => {
    const { store, ui } = setup();
    const f = activeFloor(store.get());
    const wall = f.walls.find(w => w.a[1] === 0 && w.b[1] === 0);
    const mirror = addItem(store, createItem(productById('hood-wall'), { wallId: wall.id, t: 0.5, pos: [5000, 150], side: 1 }));
    const t = createSelectTool({ store, ui, view: fakeView });
    // 묶음이 없으면 제품이 잡힌다.
    t.onPointerDown([5000, 150], {}); t.onPointerUp([5000, 150], {});
    expect(ui.get().selection).toMatchObject({ type: 'item', id: mirror });
    // 묶음을 고른 뒤 같은 자리를 누르면 묶음 드래그다.
    ui.set({ selection: { type: 'multi', kind: 'wall', ids: [wall.id] } });
    t.onPointerDown([5000, 150], {});
    expect(t.getDrag()).toMatchObject({ kind: 'multi' });
    t.cancel();
  });
});
