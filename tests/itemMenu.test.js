import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { itemMenuItems } from '../src/ui/itemMenu.js';
import { createSelectTool } from '../src/view2d/tools/selectTool.js';
import { addDuct } from '../src/state/ductOps.js';

function setup(defs = []) {
  const store = createStore(createEmptyProject()), ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const ids = defs.map(([id, patch]) => addItem(store, createItem(productById(id), patch)));
  return { store, ui, ids };
}
const labels = menu => menu.filter(m => m !== 'sep').map(m => m.label);

describe('아이템 컨텍스트 메뉴', () => {
  test('오늘의집과 같은 항목과 단축키 표기', () => {
    const { store, ui, ids } = setup([['sofa-3', { pos: [2000, 1500] }]]);
    const menu = itemMenuItems({ store, ui, ids, itemActions: {} });
    expect(labels(menu)).toEqual(['좌우 반전', '상하 반전', '제품 교체', '연결 덕트 선택', '상대이동', '직선 배열 복사', '원형 배열 복사', '회전 복사', '복사', '붙여넣기', '그룹화', '그룹 해제', '같은 제품 선택', '숨김', '잠금', '삭제']);
    const byLabel = l => menu.find(m => m !== 'sep' && m.label === l);
    expect(byLabel('좌우 반전').shortcut).toBe('Alt+H');
    expect(byLabel('상하 반전').shortcut).toBe('Alt+V');
    expect(byLabel('상대이동').shortcut).toBe('Alt+R');
    expect(byLabel('직선 배열 복사').shortcut).toBe('Alt+A');
    expect(byLabel('원형 배열 복사').shortcut).toBe('Alt+C');
    expect(byLabel('회전 복사').shortcut).toBe('Alt+X');
    expect(byLabel('복사').shortcut).toBe('Ctrl+C');
    expect(byLabel('붙여넣기').shortcut).toBe('Ctrl+V');
    expect(byLabel('숨김').shortcut).toBe('Ctrl+H');
    expect(byLabel('잠금').shortcut).toBe('Ctrl+L');
    expect(byLabel('삭제').danger).toBe(true);
    expect(menu.filter(m => m === 'sep').length).toBeGreaterThan(2);
  });

  test('"연결 덕트 선택"은 연결이 있을 때만 켜지고 그 꼭짓점을 고른다', () => {
    const { store, ui } = setup([['sofa-3', { pos: [2000, 1500] }]]);
    const hood = addItem(store, createItem(productById('hood-box'), { pos: [3000, 1500] }));
    const plain = activeFloor(store.get()).items.find(i => i.kind !== 'equipment').id;
    const off = itemMenuItems({ store, ui, ids: [plain], itemActions: {} });
    expect(off.find(m => m.label === '연결 덕트 선택').disabled).toBe(true);
    const ductId = addDuct(store, { points: [[3000, 1500], [6000, 1500]], segments: [{ w: 500, h: 300, z: 2400 }], connections: [{ point: 0, itemId: hood }] });
    const on = itemMenuItems({ store, ui, ids: [hood], itemActions: {} });
    const pickDuct = on.find(m => m.label === '연결 덕트 선택');
    expect(pickDuct.disabled).toBe(false);
    pickDuct.onSelect();
    expect(ui.get().selection).toEqual({ type: 'duct', id: ductId, segment: null, vertex: 0 });
  });

  test('상태에 따라 항목이 잠긴다', () => {
    const { store, ui, ids } = setup([['sofa-3', { pos: [2000, 1500] }], ['chair-dining', { pos: [1000, 1000] }]]);
    const one = itemMenuItems({ store, ui, ids: [ids[0]], itemActions: {} });
    const find = (menu, l) => menu.find(m => m !== 'sep' && m.label === l);
    expect(find(one, '붙여넣기').disabled).toBe(true);        // 클립보드가 비었다
    expect(find(one, '그룹화').disabled).toBe(true);          // 하나만 선택
    expect(find(one, '그룹 해제').disabled).toBe(true);
    ui.set({ clipboard: [{ id: 'x' }] });
    const two = itemMenuItems({ store, ui, ids, itemActions: {} });
    expect(find(two, '붙여넣기').disabled).toBe(false);
    expect(find(two, '그룹화').disabled).toBe(false);
    expect(find(two, '같은 제품 선택').disabled).toBe(true);  // 여러 개면 의미 없음
    store.dispatch(d => { activeFloor(d).groups.push({ id: 'g1', itemIds: ids }); });
    expect(find(itemMenuItems({ store, ui, ids, itemActions: {} }), '그룹 해제').disabled).toBe(false);
  });

  test('숨김·잠금 항목은 현재 상태에 따라 해제로 바뀐다', () => {
    const { store, ui, ids } = setup([['sofa-3', { pos: [2000, 1500], hidden: true, locked: true }]]);
    expect(labels(itemMenuItems({ store, ui, ids, itemActions: {} }))).toContain('숨김 해제');
    expect(labels(itemMenuItems({ store, ui, ids, itemActions: {} }))).toContain('잠금 해제');
  });

  test('항목을 고르면 itemActions를 부른다', () => {
    const { store, ui, ids } = setup([['sofa-3', { pos: [2000, 1500] }]]);
    const called = [];
    const itemActions = new Proxy({}, { get: (_, k) => (...args) => called.push([k, ...args]) });
    const menu = itemMenuItems({ store, ui, ids, itemActions });
    for (const m of menu) if (m !== 'sep' && !m.disabled) m.onSelect();
    expect(called.map(c => c[0])).toContain('mirror');
    expect(called).toContainEqual(['mirror', 'h']);
    expect(called).toContainEqual(['mirror', 'v']);
    expect(called).toContainEqual(['arrayCopy', 'linear']);
    expect(called).toContainEqual(['arrayCopy', 'circular']);
    expect(called).toContainEqual(['arrayCopy', 'rotate']);
    expect(called.map(c => c[0])).toContain('remove');
  });

  test('선택 도구는 아이템 위 우클릭에서 제품 메뉴를, 방 위에서는 2A의 방 메뉴를 준다', () => {
    const { store, ui, ids } = setup([['sofa-3', { pos: [2000, 1500] }]]);
    const t = createSelectTool({ store, ui, view: { camera: { scale: 0.1 }, fit: () => {} } });
    const menu = t.onContextMenu([2000, 1500], {});
    expect(Array.isArray(menu)).toBe(true);
    expect(labels(menu)).toContain('제품 교체');
    expect(ui.get().selection).toEqual({ type: 'item', id: ids[0] });
    const roomMenu = t.onContextMenu([500, 2000], {});
    expect(labels(roomMenu)).toContain('방 복사');   // 아이템이 없는 자리는 2A 분기로 내려간다
  });
});
