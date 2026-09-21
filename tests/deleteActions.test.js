// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { createDeleteActions } from '../src/app/deleteActions.js';

function setup() {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  const tools = [];
  const a = createDeleteActions({ store, ui, view: { camera: { scale: 0.08 } }, toast: () => {}, setTool: n => tools.push(n) });
  const f = () => activeFloor(store.get());
  return { store, ui, ...a, f, tools };
}
const ok = () => document.querySelector('.modal.confirm [name="ok"]').click();
const cancel = () => document.querySelector('.modal.confirm [name="cancel"]').click();
const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => { document.body.innerHTML = ''; });

describe('삭제 배선', () => {
  test('벽·제품 삭제는 묻지 않는다', async () => {
    const a = setup();
    const id = addItem(a.store, createItem(productById('sofa-3'), { pos: [2000, 1500] }));
    a.ui.set({ selection: { type: 'item', id } });
    a.deleteSelection();
    expect(document.querySelector('.modal.confirm')).toBeNull();
    expect(a.f().items).toHaveLength(0);
    expect(a.ui.get().selection).toBeNull();

    const wallId = a.f().walls[0].id;
    a.ui.set({ selection: { type: 'wall', id: wallId } });
    a.deleteSelection();
    expect(a.f().walls.some(w => w.id === wallId)).toBe(false);
  });

  test('방 삭제는 확인을 받고, 취소하면 남는다', async () => {
    const a = setup();
    const roomId = a.f().rooms[0].id;
    a.ui.set({ selection: { type: 'room', id: roomId } });
    a.deleteSelection();
    cancel(); await flush();
    expect(a.f().rooms.some(r => r.id === roomId)).toBe(true);
    a.deleteSelection();
    ok(); await flush();
    expect(a.f().rooms.some(r => r.id === roomId)).toBe(false);
    expect(a.ui.get().selection).toBeNull();
  });

  test('삭제 도구는 벽을 바로 지운다', () => {
    const a = setup();
    const tool = a.createDeleteTool();
    expect(tool.name).toBe('delete');
    tool.onPointerDown([2000.5, 0]);          // 남쪽 벽 중심선 위(소수 좌표)
    expect(a.f().walls).toHaveLength(3);
    expect(document.querySelector('.modal.confirm')).toBeNull();
  });

  // 벽 하나를 지우면 고리가 끊겨 detectRooms가 방을 못 찾는다(측정: walls 4 rooms 1 → walls 3 rooms 0).
  // 그래서 "벽 삭제 → 같은 setup에서 방 바닥 클릭"은 대화상자를 열지 못한다 → 방 삭제는 새 setup에서 확인한다.
  test('삭제 도구로 방 바닥을 누르면 확인을 받는다', async () => {
    const a = setup();
    const tool = a.createDeleteTool();
    tool.onPointerDown([2000.5, 1500.25]);    // 방 안쪽 바닥(소수 좌표)
    expect(document.querySelector('.modal.confirm')).not.toBeNull();
    ok(); await flush();
    expect(a.f().rooms).toHaveLength(0);
  });

  test('선택이 없으면 삭제 키가 삭제 도구를 켠다', () => {
    const a = setup();
    a.deleteOrTool();
    expect(a.tools).toEqual(['delete']);
  });

  test('확인을 기다리는 동안 방이 사라지면 아무것도 지우지 않는다(undo 단계도 늘지 않는다)', async () => {
    const a = setup();
    const roomId = a.f().rooms[0].id;
    a.ui.set({ selection: { type: 'room', id: roomId } });
    a.deleteSelection();                        // 대화상자 열림(아직 아무것도 지우지 않았다)
    expect(document.querySelector('.modal.confirm')).not.toBeNull();
    a.store.undo();                             // 대화상자 뒤에서 방이 사라진다(벽 추가를 취소)
    expect(a.f().rooms).toHaveLength(0);
    const before = a.store.get();
    const canUndoBefore = a.store.canUndo();
    ok(); await flush();                         // 이제서야 확인 — removeRoom이 방을 다시 찾아본다
    expect(a.store.get()).toBe(before);          // 두 번째 dispatch가 없다(상태 참조가 그대로다)
    expect(a.store.canUndo()).toBe(canUndoBefore); // undo 단계도 늘지 않는다
  });
});
