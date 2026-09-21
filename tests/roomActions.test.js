// @vitest-environment jsdom
// 방 삭제 한 자리(ui/roomActions.js): 확인 → 재확인 → 같은 단계에서 벽·붙은 제품 삭제 → 결과 토스트.
import { test, expect, beforeEach } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { removeRoom } from '../src/ui/roomActions.js';

function setup() {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  const f = () => activeFloor(store.get());
  const seen = [];
  return { store, ui, f, seen, toast: m => seen.push(m) };
}
const ok = () => document.querySelector('.modal.confirm [name="ok"]').click();
const cancel = () => document.querySelector('.modal.confirm [name="cancel"]').click();
const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => { document.body.innerHTML = ''; });

test('방을 지우면 벽에 붙어 있던 제품도 함께 사라지고 한 번만 알린다', async () => {
  const a = setup();
  const room = a.f().rooms[0];
  const top = a.f().walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  const door = addItem(a.store, createItem(productById('door-swing-900'), { wallId: top.id, t: 0.37, pos: [1480.5, 0.25] }));
  const sofa = addItem(a.store, createItem(productById('sofa-3'), { pos: [2000, 1500] }));
  a.ui.set({ selection: { type: 'room', id: room.id } });

  const p = removeRoom(a.store, a.ui, room.id, a.toast);
  ok();
  expect(await p).toBe(true);
  expect(a.seen).toEqual(['벽 4개와 붙어 있던 제품 1개를 삭제했습니다 · 방 1개가 사라졌습니다']);
  expect(a.f().walls).toHaveLength(0);
  expect(a.f().items.map(i => i.id)).toEqual([sofa]);
  expect(a.ui.get().selection).toBeNull();

  a.store.undo();                                  // 한 단계로 벽·제품·방이 모두 돌아온다
  expect(a.f().walls).toHaveLength(4);
  expect(a.f().rooms).toHaveLength(1);
  expect(a.f().items.find(i => i.id === door).wallId).toBe(top.id);
});

test('붙어 있던 제품이 없으면 조용하다(방이 사라진 것은 확인창에서 이미 본 일이다)', async () => {
  const a = setup();
  const p = removeRoom(a.store, a.ui, a.f().rooms[0].id, a.toast);
  ok(); await p;
  expect(a.seen).toEqual([]);
  expect(a.f().walls).toHaveLength(0);
});

test('취소하면 벽·제품이 그대로 남고 토스트도 없다', async () => {
  const a = setup();
  const top = a.f().walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  addItem(a.store, createItem(productById('door-swing-900'), { wallId: top.id, t: 0.5, pos: [2000, 0] }));
  const p = removeRoom(a.store, a.ui, a.f().rooms[0].id, a.toast);
  cancel();
  expect(await p).toBe(false);
  expect(a.seen).toEqual([]);
  expect(a.f().walls).toHaveLength(4);
  expect(a.f().items).toHaveLength(1);
});

test('토스트를 넘기지 않으면 화면의 토스트로 알린다(방 우클릭 메뉴 경로)', async () => {
  const a = setup();
  const top = a.f().walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  addItem(a.store, createItem(productById('door-swing-900'), { wallId: top.id, t: 0.5, pos: [2000, 0] }));
  const p = removeRoom(a.store, a.ui, a.f().rooms[0].id);
  ok(); await p; await flush();
  expect(document.querySelector('#toasts .toast')?.textContent)
    .toBe('벽 4개와 붙어 있던 제품 1개를 삭제했습니다 · 방 1개가 사라졌습니다');
});
