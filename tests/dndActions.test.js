// §14.11 드래그 배치 배선. main.js가 300줄을 넘지 않게 app/dndActions.js로 뺐고, 덕분에 배선 규칙
// (드롭 한 번 = undo 한 단계 · 놓을 자리가 없으면 아무 일도 없음 · 드래그가 클릭 배치를 건드리지 않음)을
// 여기서 직접 검사한다. view·도구 구성은 main.js와 같은 모양의 가짜다(place 도구는 진짜를 쓴다).
import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { createPlaceTool } from '../src/view2d/tools/placeTool.js';
import { createDndActions } from '../src/app/dndActions.js';

function setup() {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [6000.5, 4000.25], 200));
  const ui = createUiState();
  let pendingProduct = null, tool = null, renders = 0;
  const view = { camera: { scale: 0.1 }, requestRender: () => { renders += 1; }, get tool() { return tool; }, setTool(t) { tool = t; } };
  const setTool = name => {
    tool = name === 'place'
      ? createPlaceTool({ store, ui, view, product: pendingProduct, onDone: () => setTool('select') })
      : { name, onPointerMove() {}, onPointerDown() {}, draw() {} };
    ui.set({ tool: name });
  };
  const startPlace = p => { pendingProduct = p; setTool('place'); };
  const dnd = createDndActions({ ui, view, startPlace, pending: () => pendingProduct, setTool });
  setTool('select');
  return { store, ui, dnd, view, setTool, startPlace, pending: () => pendingProduct, renders: () => renders };
}

describe('드래그 배치 배선', () => {
  test('dragover가 고스트를 띄우고 drop 한 번이 한 개를 놓는다(undo 한 단계)', () => {
    const { store, ui, dnd, view } = setup();
    const before = store.get();                                 // 드롭 직전 상태(undo 한 단계면 이것으로 정확히 돌아온다)
    ui.set({ dragProduct: 'hood-wall' });
    dnd.onDragOver([3000.5, 120.25]);
    expect(ui.get().tool).toBe('place');
    expect(view.tool.getGhost().item.wallId).toBeTruthy();      // 드롭 전에 벽에 붙은 미리보기가 보인다
    dnd.onDrop([3000.5, 120.25]);
    const items = activeFloor(store.get()).items;
    expect(items).toHaveLength(1);
    expect(items[0].wallId).toBeTruthy();
    expect(ui.get().selection).toEqual({ type: 'item', id: items[0].id });
    expect(ui.get().tool).toBe('select');                       // 배치 도구가 놓고 선택 도구로 돌아갔다
    expect(ui.get().dragProduct).toBeNull();
    expect(store.canUndo()).toBe(true);
    store.undo();
    expect(activeFloor(store.get()).items).toHaveLength(0);
    expect(store.get()).toBe(before);                           // 되돌림 한 번에 드롭 직전 상태 그대로다(한 단계였다)
  });

  test('놓을 자리가 없으면(벽 부착 제품이 벽에서 멀면) 아무것도 놓지 않고 스토어를 건드리지 않는다', () => {
    const { store, ui, dnd, view } = setup();
    let dispatches = 0;
    store.subscribe(() => { dispatches += 1; });
    const before = store.get();
    ui.set({ dragProduct: 'hood-wall' });
    dnd.onDragOver([3000.5, 2000.25]);                          // 방 가운데 — 어느 벽에서도 300 mm 밖이다
    dnd.onDrop([3000.5, 2000.25]);
    expect(activeFloor(store.get()).items).toHaveLength(0);
    expect(store.get()).toBe(before);
    expect(dispatches).toBe(0);                                 // 스토어에 아무것도 보내지 않았다(되돌릴 단계도 없다)
    expect(ui.get().tool).toBe('select');                       // 고스트도 남지 않는다
    expect(view.tool.name).toBe('select');
    expect(ui.get().dragProduct).toBeNull();
  });

  test('바닥 제품은 방 가운데에도 놓인다', () => {
    const { store, ui, dnd } = setup();
    ui.set({ dragProduct: 'sofa-3' });
    dnd.onDragOver([3000.5, 2000.25]);
    dnd.onDrop([3000.5, 2000.25]);
    expect(activeFloor(store.get()).items).toHaveLength(1);
    expect(activeFloor(store.get()).items[0].productId).toBe('sofa-3');
  });

  test('dragleave·dragend는 고스트를 지우고 대기 중인 클릭 배치를 건드리지 않는다', () => {
    const { store, ui, dnd, view, startPlace, pending } = setup();
    startPlace(productById('sofa-3'));                          // 타일을 클릭해 둔 상태(클릭 배치 대기)
    ui.set({ dragProduct: 'hood-wall' });
    dnd.onDragOver([3000.5, 120.25]);
    expect(view.tool.product.id).toBe('hood-wall');
    dnd.onDragLeave();
    expect(ui.get().tool).toBe('place');
    expect(pending().id).toBe('sofa-3');                        // 끌던 제품이 대기 제품을 덮어쓰지 않았다
    expect(view.tool.product.id).toBe('sofa-3');
    const ghostPos = view.tool.getGhost().item.pos;             // 새 도구의 고스트는 원점 근처다(끌던 자리를 따라오지 않는다)
    expect(Math.hypot(ghostPos[0] - 3000.5, ghostPos[1] - 120.25)).toBeGreaterThan(1000);
    expect(activeFloor(store.get()).items).toHaveLength(0);

    // 클릭 배치가 대기 중이 아니었다면 드래그가 끝나면 선택 도구로 돌아간다.
    const b = setup();
    b.ui.set({ dragProduct: 'sofa-3' });
    b.dnd.onDragOver([3000.5, 2000.25]);
    expect(b.ui.get().tool).toBe('place');
    b.dnd.onDragEnd();
    expect(b.ui.get().tool).toBe('select');
    expect(b.view.tool.name).toBe('select');
  });

  test('DnD가 없는 환경(끌고 있는 제품이 없음)에서는 아무 일도 하지 않는다', () => {
    const { store, ui, dnd, view } = setup();
    dnd.onDragOver([3000.5, 120.25]);
    dnd.onDrop([3000.5, 120.25]);
    dnd.onDragLeave();
    expect(ui.get().tool).toBe('select');
    expect(view.tool.name).toBe('select');
    expect(activeFloor(store.get()).items).toHaveLength(0);
  });
});
