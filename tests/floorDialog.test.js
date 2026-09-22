// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { productById } from '../src/products/catalog.js';
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

// M-1: 한글 조합 중의 Enter는 "글자 확정"이지 "추가"가 아니다.
test('a composing Enter does not submit the floor dialog', () => {
  const store = createStore(createEmptyProject());
  openFloorDialog({ store, mode: 'add' });
  const modal = document.querySelector('.modal');
  const input = modal.querySelector('[name="floorName"]');
  input.value = '지하';
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }));
  expect(document.querySelector('.modal')).not.toBeNull();
  expect(store.get().floors).toHaveLength(1);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(document.querySelector('.modal')).toBeNull();
  expect(store.get().floors.map(f => f.name)).toEqual(['Floor 1', '지하']);
});

test('층 추가는 결과를 토스트로 알린다(§16.4)', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  addItem(store, createItem(productById('sofa-3'), { pos: [2000.5, 1500.25] }));
  openFloorDialog({ store, mode: 'add' });
  const root = document.querySelector('.modal');
  root.querySelector('[name="copy"][value="all"]').checked = true;
  root.querySelector('[name="floorName"]').value = 'Floor 2';
  root.querySelector('[name="submit"]').click();
  expect(document.body.textContent).toContain('Floor 2 추가 · 제품 1개 복사');
});
