// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
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
