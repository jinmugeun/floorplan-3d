// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls, addFloor, setActiveFloor } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
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

test('the delete button refuses to remove the last floor', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const el = document.createElement('div'); createPropsPanel(el, store, ui);
  el.querySelector('button[name="floorDelete"]').click();
  expect(store.get().floors).toHaveLength(1);
});
