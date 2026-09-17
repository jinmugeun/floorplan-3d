// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { openFloorDialog } from '../src/ui/floorDialog.js';

test('the add dialog creates a floor with the chosen name and copy option', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  openFloorDialog({ store, mode: 'add' });
  const modal = document.querySelector('.modal');
  modal.querySelector('[name="floorName"]').value = '2층';
  modal.querySelector('[name="copy"][value="plan"]').checked = true;
  modal.querySelector('[name="submit"]').click();
  expect(document.querySelector('.modal')).toBeNull();
  expect(store.get().floors).toHaveLength(2);
  expect(store.get().floors[1].name).toBe('2층');
  expect(activeFloor(store.get()).walls).toHaveLength(4);
});

test('the rename dialog hides the copy options and renames in place', () => {
  const store = createStore(createEmptyProject());
  openFloorDialog({ store, mode: 'rename', index: 0 });
  const modal = document.querySelector('.modal');
  expect(modal.querySelector('[name="copy"]')).toBeNull();
  expect(modal.querySelector('[name="floorName"]').value).toBe('Floor 1');
  modal.querySelector('[name="floorName"]').value = '1층';
  modal.querySelector('[name="submit"]').click();
  expect(store.get().floors[0].name).toBe('1층');
  expect(store.get().floors).toHaveLength(1);
});

test('an empty name is rejected and close leaves the project alone', () => {
  const store = createStore(createEmptyProject());
  const dlg = openFloorDialog({ store, mode: 'add' });
  const modal = document.querySelector('.modal');
  modal.querySelector('[name="floorName"]').value = '   ';
  modal.querySelector('[name="submit"]').click();
  expect(document.querySelector('.modal')).not.toBeNull();
  expect(modal.querySelector('[name="error"]').hidden).toBe(false);
  dlg.close();
  expect(store.get().floors).toHaveLength(1);
});

test('Enter submits and Escape closes the dialog without changes', () => {
  const store = createStore(createEmptyProject());
  openFloorDialog({ store, mode: 'add' });
  let modal = document.querySelector('.modal');
  modal.querySelector('[name="floorName"]').value = '지하';
  modal.querySelector('[name="floorName"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(document.querySelector('.modal')).toBeNull();
  expect(store.get().floors.map(f => f.name)).toEqual(['Floor 1', '지하']);
  openFloorDialog({ store, mode: 'add' });
  modal = document.querySelector('.modal');
  modal.querySelector('[name="floorName"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('.modal')).toBeNull();
  expect(store.get().floors).toHaveLength(2);
});
