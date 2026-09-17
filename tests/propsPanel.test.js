// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls, addFloor, setActiveFloor } from '../src/state/floorOps.js';
import { rectWalls, makeWall } from '../src/geom/walls.js';
import { createPropsPanel } from '../src/ui/propsPanel.js';

test('wall panel edits thickness; room panel edits name', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const el = document.createElement('div'); createPropsPanel(el, store, ui);
  const f = activeFloor(store.get());
  ui.set({ selection: { type: 'wall', id: f.walls[0].id } });
  const th = el.querySelector('input[name="thickness"]');
  th.value = '150'; th.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).walls[0].thickness).toBe(150);
  ui.set({ selection: { type: 'room', id: f.rooms[0].id } });
  const name = el.querySelector('input[name="name"]');
  name.value = '식당'; name.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).rooms[0].name).toBe('식당');
  expect(el.textContent).toContain('m²');
});

test('numeric inputs reject empty values and clamp to their range', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const el = document.createElement('div'); createPropsPanel(el, store, ui);
  const wallId = activeFloor(store.get()).walls[0].id;
  ui.set({ selection: { type: 'wall', id: wallId } });
  let th = el.querySelector('input[name="thickness"]');
  th.value = ''; th.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).walls[0].thickness).toBe(200);
  expect(el.querySelector('input[name="thickness"]').value).toBe('200');
  th = el.querySelector('input[name="thickness"]');
  th.value = '5000'; th.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).walls[0].thickness).toBe(1000);
});

test('room name with quotes is escaped in the panel markup', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const el = document.createElement('div'); createPropsPanel(el, store, ui);
  const room = activeFloor(store.get()).rooms[0];
  ui.set({ selection: { type: 'room', id: room.id } });
  const name = el.querySelector('input[name="name"]');
  name.value = 'a" onfocus="x'; name.dispatchEvent(new Event('change', { bubbles: true }));
  const again = el.querySelector('input[name="name"]');
  expect(again.value).toBe('a" onfocus="x');
  expect(again.hasAttribute('onfocus')).toBe(false);
});

test('number fields render 0 for non-numeric values instead of raw text', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  store.dispatch(d => { activeFloor(d).height = 'abc'; });
  const el = document.createElement('div'); createPropsPanel(el, store, ui);
  expect(el.querySelector('input[name="floorHeight"]').value).toBe('0');
});

test('delete buttons delegate to the app-supplied deleteSelection', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const calls = [];
  const el = document.createElement('div'); createPropsPanel(el, store, ui, { deleteSelection: () => calls.push(ui.get().selection.type) });
  const f = activeFloor(store.get());
  ui.set({ selection: { type: 'wall', id: f.walls[0].id } });
  el.querySelector('button[name="delete"]').click();
  ui.set({ selection: { type: 'room', id: f.rooms[0].id } });
  el.querySelector('button[name="delete"]').click();
  expect(calls).toEqual(['wall', 'room']);
  expect(activeFloor(store.get()).walls).toHaveLength(4); // 패널 자체는 아무것도 지우지 않는다
});

test('in ftin mode length fields render and parse feet/inches', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200)); // 소수 좌표
  store.dispatch(d => { d.units = 'ftin'; }, { record: false });
  const el = document.createElement('div'); createPropsPanel(el, store, ui);
  const wall = activeFloor(store.get()).walls[0];
  ui.set({ selection: { type: 'wall', id: wall.id } });
  const th = el.querySelector('input[name="thickness"]');
  expect(th.type).toBe('text');
  expect(th.value).toBe(`7.9"`);
  th.value = `1' 0"`; th.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).walls.find(w => w.id === wall.id).thickness).toBe(305);
  const len = el.querySelector('input[name="length"]');
  expect(len.readOnly).toBe(true);
  expect(len.value).toBe(`13' 1.5"`); // 4000.5 mm → 반올림 4001 mm → 157.52"
});

test('the floor panel switches floors, edits slab and opacity and shows the total area', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  addFloor(store, { name: '2층', copy: 'none' });
  setActiveFloor(store, 0);
  const el = document.createElement('div'); createPropsPanel(el, store, ui);
  let select = el.querySelector('select[name="floorSelect"]');
  expect([...select.options].map(o => o.textContent)).toEqual(['Floor 1', '2층']);
  expect(select.value).toBe('0');
  select.value = '1'; select.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().activeFloor).toBe(1);
  select = el.querySelector('select[name="floorSelect"]'); // 패널이 다시 그려져 앞 노드는 떨어져 나갔다
  select.value = '0'; select.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().activeFloor).toBe(0);
  const slab = el.querySelector('input[name="slab"]');
  slab.value = '250'; slab.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).slab).toBe(250);
  const wo = el.querySelector('input[name="wallOpacity"]');
  wo.value = '0.4'; wo.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().view.wallOpacity).toBe(0.4);
  const fo = el.querySelector('input[name="floorOpacity"]');
  fo.value = '0.6'; fo.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().view.floorOpacity).toBe(0.6);
  expect(el.querySelector('output[name="totalArea"]').textContent).toBe('10.6 m²');
  const mode = el.querySelector('select[name="areaMode"]');
  mode.value = 'gross'; mode.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().areaMode).toBe('gross');
  expect(el.querySelector('output[name="totalArea"]').textContent).toBe('13.4 m²'); // 10.64 + 2.8
});

test('wall panel shows centreline length, an editable length, the wall area and two colours', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, [makeWall({ a: [0, 0], b: [4000, 0], thickness: 200, height: 2500 })]);
  const el = document.createElement('div'); createPropsPanel(el, store, ui);
  const w = activeFloor(store.get()).walls[0];
  ui.set({ selection: { type: 'wall', id: w.id } });
  expect(el.querySelector('input[name="length"]').readOnly).toBe(true);
  expect(el.querySelector('output[name="wallArea"]').textContent).toBe('10.0 m²'); // 4.0 x 2.5
  const len = el.querySelector('input[name="wallLength"]');
  len.value = '3000'; len.dispatchEvent(new Event('change', { bubbles: true }));
  const after = activeFloor(store.get()).walls.find(x => x.id === w.id);
  expect(after.b[0]).toBeCloseTo(3000, 6);
  const cin = el.querySelector('input[name="colorIn"]');
  expect(cin.type).toBe('color');
  cin.value = '#ff8800'; cin.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).walls.find(x => x.id === w.id).colorIn).toBe('#ff8800');
  const cout = el.querySelector('input[name="colorOut"]');
  cout.value = '#001122'; cout.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).walls.find(x => x.id === w.id).colorOut).toBe('#001122');
});

test('room panel edits seats, floor/ceiling colours, and 공간 높이 맞추기 drives the wall heights', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200)); // 소수 좌표
  const el = document.createElement('div'); createPropsPanel(el, store, ui);
  const room = activeFloor(store.get()).rooms[0];
  ui.set({ selection: { type: 'room', id: room.id } });
  const seats = el.querySelector('input[name="seats"]');
  seats.value = '24'; seats.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).rooms[0].seats).toBe(24);
  const fc = el.querySelector('input[name="floorColor"]');
  fc.value = '#102030'; fc.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).rooms[0].floorColor).toBe('#102030');
  const match = el.querySelector('input[name="matchWallHeight"]');
  match.checked = true; match.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).rooms[0].matchWallHeight).toBe(true);
  expect(activeFloor(store.get()).walls.every(w => w.height === 2300)).toBe(true);
  const h = el.querySelector('input[name="height"]');
  h.value = '2800'; h.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).rooms[0].height).toBe(2800);
  expect(activeFloor(store.get()).walls.every(w => w.height === 2800)).toBe(true); // 벽도 따라간다
  store.undo(); // 방 높이 + 벽 높이는 한 단계로 묶여야 한다
  expect(activeFloor(store.get()).rooms[0].height).toBe(2300);
  expect(activeFloor(store.get()).walls.every(w => w.height === 2300)).toBe(true);
  store.redo();
  expect(activeFloor(store.get()).walls.every(w => w.height === 2800)).toBe(true);
  const again = el.querySelector('input[name="matchWallHeight"]');
  again.checked = false; again.dispatchEvent(new Event('change', { bubbles: true }));
  const h2 = el.querySelector('input[name="height"]');
  h2.value = '2400'; h2.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).walls.every(w => w.height === 2800)).toBe(true); // 끄면 벽은 그대로
});

test('the delete button refuses to remove the last floor', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const el = document.createElement('div'); createPropsPanel(el, store, ui);
  el.querySelector('button[name="floorDelete"]').click();
  expect(store.get().floors).toHaveLength(1);
});

test('multi selection shows the count, edits height for all and delegates deletion', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const calls = [];
  const el = document.createElement('div'); createPropsPanel(el, store, ui, { deleteSelection: () => calls.push('del') });
  const ids = activeFloor(store.get()).walls.slice(0, 2).map(w => w.id);
  ui.set({ selection: { type: 'multi', kind: 'wall', ids } });
  expect(el.textContent).toContain('선택된 벽 2개');
  const h = el.querySelector('input[name="height"]');
  h.value = '2600'; h.dispatchEvent(new Event('change', { bubbles: true }));
  const f = activeFloor(store.get());
  for (const w of f.walls) expect(w.height).toBe(ids.includes(w.id) ? 2600 : 2300);
  store.undo(); // 여러 벽의 높이 변경은 한 단계다
  expect(activeFloor(store.get()).walls.every(w => w.height === 2300)).toBe(true);
  store.redo();
  expect(activeFloor(store.get()).walls.filter(w => w.height === 2600)).toHaveLength(2);
  el.querySelector('button[name="delete"]').click();
  expect(calls).toEqual(['del']);
});

test('focusField moves focus to that input exactly once', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200)); // 소수 좌표
  const el = document.createElement('div'); document.body.appendChild(el);
  createPropsPanel(el, store, ui);
  const w = activeFloor(store.get()).walls[0];
  ui.set({ selection: { type: 'wall', id: w.id }, focusField: 'colorOut' });
  expect(document.activeElement.name).toBe('colorOut');
  expect(ui.get().focusField).toBeNull();
});
