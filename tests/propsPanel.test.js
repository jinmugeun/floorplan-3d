// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addFloor, setActiveFloor, addItem } from '../src/state/floorOps.js';
import { deleteFloor } from '../src/state/floorMgmt.js';
import { productById } from '../src/products/catalog.js';
import { rectWalls, makeWall } from '../src/geom/walls.js';
import { createPropsPanel, applyNumber, lenField, withUnit, readLen } from '../src/ui/propsPanel.js';
import { getKeepRatio, setKeepRatio } from '../src/ui/propsApply.js';
import { applyMaterial, assignmentOf } from '../src/state/materialOps.js';
import { fmtLen } from '../src/util/units.js';
import { nextFocusName } from '../src/ui/fieldUtils.js';
import { createKeyHandler } from '../src/ui/keymap.js';

// 소수 좌표 도면 하나에 패널을 붙인다(기존 테스트들이 인라인으로 되풀이하던 모양 그대로).
function setupPanel() {
  const store = createStore(createEmptyProject()), ui = createUiState();
  addWalls(store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200));
  const el = document.createElement('div');
  document.body.appendChild(el);
  createPropsPanel(el, store, ui);
  return { store, ui, el };
}

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

test('the background block toggles lock without adding undo steps', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  store.dispatch(d => { d.background = { src: 'data:,', width: 100, height: 80, scale: 10, offset: [0.5, 0.25], opacity: 0.5, visible: true, locked: true }; }, { record: false });
  const el = document.createElement('div'); createPropsPanel(el, store, ui);
  const lock = el.querySelector('input[name="bgLocked"]');
  expect(lock.checked).toBe(true);
  lock.checked = false; lock.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().background.locked).toBe(false);
  const op = el.querySelector('input[name="bgOpacity"]'); // 패널이 다시 그려졌으므로 다시 찾는다
  op.value = '0.2'; op.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().background.opacity).toBe(0.2);
  const vis = el.querySelector('input[name="bgVisible"]');
  vis.checked = false; vis.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().background.visible).toBe(false);
  expect(store.canUndo()).toBe(false); // 투명도·표시·잠금은 모두 record: false
  el.querySelector('button[name="bgRemove"]').click();
  expect(store.get().background).toBeNull();
  expect(store.canUndo()).toBe(true); // 배경 제거만 되돌릴 수 있다
});

test('a colour picker drag is one undo step and does not re-render the panel mid-drag', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const el = document.createElement('div'); document.body.appendChild(el);
  createPropsPanel(el, store, ui);
  const wall = activeFloor(store.get()).walls[0];
  ui.set({ selection: { type: 'wall', id: wall.id } });
  const before = activeFloor(store.get()).walls.find(w => w.id === wall.id).colorOut;
  const node = el.querySelector('input[name="colorOut"]');
  node.focus();
  for (const v of ['#111111', '#222222', '#333333']) { node.value = v; node.dispatchEvent(new Event('input', { bubbles: true })); }
  expect(activeFloor(store.get()).walls.find(w => w.id === wall.id).colorOut).toBe('#333333'); // 미리보기는 즉시
  expect(el.querySelector('input[name="colorOut"]')).toBe(node); // 드래그 중에는 패널을 다시 그리지 않는다
  node.dispatchEvent(new Event('change', { bubbles: true }));
  node.blur();
  store.undo();
  expect(activeFloor(store.get()).walls.find(w => w.id === wall.id).colorOut).toBe(before); // 한 단계로 되돌아간다
  store.redo();
  expect(activeFloor(store.get()).walls.find(w => w.id === wall.id).colorOut).toBe('#333333');
});

test('the 상세 설정 details keeps its open state across re-renders', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const el = document.createElement('div'); document.body.appendChild(el);
  createPropsPanel(el, store, ui);
  const details = el.querySelector('details');
  expect(details.open).toBe(true);
  details.open = false; details.dispatchEvent(new Event('toggle'));
  store.dispatch(d => { d.name = 'x'; }, { record: false }); // 패널을 다시 그린다
  expect(el.querySelector('details').open).toBe(false);
  const again = el.querySelector('details');
  again.open = true; again.dispatchEvent(new Event('toggle'));
  store.dispatch(d => { d.name = 'y'; }, { record: false });
  expect(el.querySelector('details').open).toBe(true);
});

// 2B의 아이템 패널이 같은 도우미를 쓰도록 export되어 있는지.
test('applyNumber, lenField, withUnit and readLen work standalone', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const wall = activeFloor(store.get()).walls[0];
  applyNumber(store, { type: 'wall', id: wall.id }, 'thickness', 150);
  expect(activeFloor(store.get()).walls.find(w => w.id === wall.id).thickness).toBe(150);
  applyNumber(store, null, 'floorHeight', 2600);
  expect(activeFloor(store.get()).height).toBe(2600);
  expect(withUnit('두께', 'mm', false)).toBe('두께');
  expect(withUnit('두께', 'mm', true)).toBe('두께 (mm)');
  expect(withUnit('두께', 'ftin', true)).toBe('두께 (ft·in)');
  const host = document.createElement('div');
  host.innerHTML = lenField('두께', 'thickness', 305, 2, 1000, false, 'ftin');
  const input = host.querySelector('input[name="thickness"]');
  expect(input.type).toBe('text');
  expect(input.value).toBe(`1' 0"`);
  input.value = `2' 0"`;
  expect(readLen(input, 'ftin')).toBe(610);
  input.value = 'nope';
  expect(readLen(input, 'ftin')).toBeNull();
});

test('a colour drag abandoned without change closes its transaction on focusout', () => {
  document.body.innerHTML = '';
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  const el = document.createElement('div'); document.body.appendChild(el); createPropsPanel(el, store, ui);
  const w = activeFloor(store.get()).walls[0];
  ui.set({ selection: { type: 'wall', id: w.id } });
  const input = el.querySelector('input[name="colorOut"]');
  input.focus();
  input.value = '#123456'; input.dispatchEvent(new Event('input', { bubbles: true }));
  input.blur(); input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  expect(activeFloor(store.get()).walls[0].colorOut).toBe('#123456');
  store.undo(); // 트랜잭션이 focusout에서 닫혔으므로 한 번의 undo로 되돌아간다
  expect(activeFloor(store.get()).walls[0].colorOut).toBe(w.colorOut);
});

test('item panel edits size, height, angle and position', async () => {
  const { createItem } = await import('../src/state/schema.js');
  const { productById } = await import('../src/products/catalog.js');
  const { addItem } = await import('../src/state/floorOps.js');
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const id = addItem(store, createItem(productById('dining-4'), { pos: [2000, 1500] }));
  const el = document.createElement('div'); createPropsPanel(el, store, ui);
  ui.set({ selection: { type: 'item', id } });
  expect(el.textContent).toContain('제품 상세 정보');
  expect(el.textContent).toContain('4인 식탁');
  expect(el.textContent).toContain('TB-D04');
  expect(el.textContent).toContain('바닥에 서있는 제품');
  const it = () => activeFloor(store.get()).items[0];
  const set = (name, value) => { const f = el.querySelector(`[name="${name}"]`); f.value = value; f.dispatchEvent(new Event('change', { bubbles: true })); };
  set('w', '1500');
  expect(it().size).toEqual([1500, 800, 750]);
  set('w', '99999');                                  // 범위 밖은 5000으로 잘린다
  expect(it().size[0]).toBe(5000);
  set('w', '1200');
  // 체크박스는 다시 그려질 때 새 엘리먼트가 되므로 그때그때 다시 찾는다
  const check = v => { const c = el.querySelector('input[name="keepRatio"]'); c.checked = v; c.dispatchEvent(new Event('change', { bubbles: true })); };
  check(true);
  set('w', '2400');
  expect(it().size).toEqual([2400, 1600, 1500]);       // 비율 유지: 모든 축 × 2
  check(false);
  el.querySelector('button[name="resetSize"]').click();
  expect(it().size).toEqual([1200, 800, 750]);
  set('z', '900');
  expect(it().z).toBe(900);
  set('rot', '90');
  expect(it().rot).toBe(90);
  set('posX', '1234.5');
  expect(it().pos[0]).toBe(1234.5);
});

test('item panel reads ft·in lengths through readLen', async () => {
  const { createItem } = await import('../src/state/schema.js');
  const { productById } = await import('../src/products/catalog.js');
  const { addItem } = await import('../src/state/floorOps.js');
  const store = createStore(createEmptyProject()); const ui = createUiState();
  store.dispatch(d => { d.units = 'ftin'; }, { record: false });
  const id = addItem(store, createItem(productById('dining-4'), { pos: [2000, 1500] }));
  const el = document.createElement('div'); createPropsPanel(el, store, ui);
  ui.set({ selection: { type: 'item', id } });
  const w = el.querySelector('input[name="w"]');
  expect(w.type).toBe('text');              // ft·in 모드는 텍스트 입력
  expect(w.dataset.len).toBe('1');
  w.value = "4'"; w.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).items[0].size[0]).toBe(1219);   // 4 ft = 1219.2mm → 반올림
});

test('wall item keeps sitting on its wall when resized', async () => {
  const { createItem } = await import('../src/state/schema.js');
  const { productById } = await import('../src/products/catalog.js');
  const { addItem } = await import('../src/state/floorOps.js');
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const f = activeFloor(store.get());
  const top = f.walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  const id = addItem(store, createItem(productById('hood-wall'), { wallId: top.id, t: 0.5, side: 1, pos: [2000, 350] }));
  const el = document.createElement('div'); createPropsPanel(el, store, ui);
  ui.set({ selection: { type: 'item', id } });
  const d = el.querySelector('input[name="d"]');
  d.value = '700'; d.dispatchEvent(new Event('change', { bubbles: true }));
  const it = activeFloor(store.get()).items[0];
  expect(it.size[1]).toBe(700);
  expect(it.pos).toEqual([2000, 450]); // 벽 두께 절반 100 + 깊이 절반 350
});

test('a multi-item selection shows a count panel and never routes edits to walls', async () => {
  const { addItem } = await import('../src/state/floorOps.js');
  const { createItem } = await import('../src/state/schema.js');
  const { productById } = await import('../src/products/catalog.js');
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const a = addItem(store, createItem(productById('sofa-3'), { pos: [1000.5, 1000.25] }));
  const b = addItem(store, createItem(productById('sofa-3'), { pos: [2500, 1000] }));
  const el = document.createElement('div'); createPropsPanel(el, store, ui);
  ui.set({ selection: { type: 'item', id: a } });
  expect(el.querySelector('input[name="w"]')).not.toBeNull();
  ui.set({ selection: { type: 'multi', kind: 'item', ids: [a, b] } });
  // Task 12가 스텁을 정렬·그룹 패널로 바꾸며 문구도 "제품 N개 선택"으로 맞췄다(브리프 Step 6의 실제 패널 마크업과 통일).
  expect(el.textContent).toContain('제품 2개 선택');
  expect(el.querySelector('input[name="w"]')).toBeNull(); // 이전 아이템 패널이 남지 않는다
  const undoBefore = store.canUndo();
  const { applyNumber } = await import('../src/ui/propsPanel.js');
  applyNumber(store, ui.get().selection, 'w', 1500); // 벽 일괄 편집으로 흘러가지 않는다
  expect(store.canUndo()).toBe(undoBefore);
});

test('a wall-attached item ignores 각도 edits and keeps its wall direction', async () => {
  const { addItem } = await import('../src/state/floorOps.js');
  const { createItem } = await import('../src/state/schema.js');
  const { productById } = await import('../src/products/catalog.js');
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const top = activeFloor(store.get()).walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  const id = addItem(store, createItem(productById('hood-wall'), { wallId: top.id, t: 0.5, pos: [2000, 450.5], rot: 0 }));
  const { applyNumber } = await import('../src/ui/propsPanel.js');
  applyNumber(store, { type: 'item', id }, 'rot', 90);
  expect(activeFloor(store.get()).items.find(i => i.id === id).rot).toBe(0);
});

test('multi selection panel aligns, groups and deletes', async () => {
  const { createItem } = await import('../src/state/schema.js');
  const { productById } = await import('../src/products/catalog.js');
  const { addItem } = await import('../src/state/floorOps.js');
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const a = addItem(store, createItem(productById('chair-dining'), { pos: [1000, 1000] }));
  const b = addItem(store, createItem(productById('chair-dining'), { pos: [2000, 1500] }));
  const calls = [];
  const itemActions = new Proxy({}, { get: (_, k) => (...args) => calls.push([k, ...args]) });
  const el = document.createElement('div'); createPropsPanel(el, store, ui, { itemActions });
  ui.set({ selection: { type: 'multi', kind: 'item', ids: [a, b] } });
  expect(el.textContent).toContain('제품 2개 선택');
  el.querySelector('button[name="alignVStart"]').click();
  el.querySelector('button[name="alignHCenter"]').click();
  el.querySelector('button[name="group"]').click();
  el.querySelector('button[name="ungroup"]').click();
  expect(calls).toEqual([['align', 'v', 'start'], ['align', 'h', 'center'], ['group'], ['ungroup']]);
});

// 최종 리뷰 I-3·I-4: 잠긴 제품은 패널 수치 입력으로도 움직이지 않고, 벽 부착 제품의 위치는 (wallId, t)가 정한다.
test('applyNumber는 잠긴 제품을 건드리지 않고 벽 부착 제품의 위치 X/Y를 무시한다', async () => {
  const { createItem } = await import('../src/state/schema.js');
  const { addItem, updateItem } = await import('../src/state/floorOps.js');
  const { productById } = await import('../src/products/catalog.js');
  const { placeOnWall } = await import('../src/geom/items.js');
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const sofa = addItem(store, createItem(productById('sofa-3'), { pos: [1000.5, 1200.25], rot: 30 }));
  updateItem(store, sofa, { locked: true });
  const before = activeFloor(store.get()).items.find(i => i.id === sofa);
  for (const [name, v] of [['posX', 2000], ['posY', 2000], ['rot', 90], ['z', 300], ['w', 1500]]) applyNumber(store, { type: 'item', id: sofa }, name, v);
  const after = activeFloor(store.get()).items.find(i => i.id === sofa);
  expect([after.pos, after.rot, after.z, after.size]).toEqual([before.pos, before.rot, before.z, before.size]);
  expect(document.body.textContent).toContain('잠긴 제품은 편집할 수 없습니다');
  const w = activeFloor(store.get()).walls[0];
  const seat = placeOnWall(w, 0.25, 1, [900, 40, 2100], { embed: true });
  const door = addItem(store, createItem(productById('door-swing-900'), { wallId: w.id, t: 0.25, side: 1, pos: [Math.round(seat.pos[0]), Math.round(seat.pos[1])], rot: seat.rot }));
  const dBefore = activeFloor(store.get()).items.find(i => i.id === door);
  applyNumber(store, { type: 'item', id: door }, 'posX', 3333);
  applyNumber(store, { type: 'item', id: door }, 'posY', 777);
  const dAfter = activeFloor(store.get()).items.find(i => i.id === door);
  expect(dAfter.pos).toEqual(dBefore.pos);
  expect(dAfter.t).toBe(0.25);
  // 패널의 위치 입력란은 읽기 전용으로 그려진다
  const root = document.createElement('div'); document.body.appendChild(root);
  const ui = createUiState();
  createPropsPanel(root, store, ui, {});
  ui.set({ selection: { type: 'item', id: door } });
  expect(root.querySelector('[name="posX"]').readOnly).toBe(true);
  ui.set({ selection: { type: 'item', id: sofa } });
  expect(root.querySelector('[name="posX"]').readOnly).toBe(false);
});

// 아래 마감재 관련 테스트들은 p2c-task-7-review.md B-2가 "브리프 받아쓰기"라고 지적한 자리를
// 실제 DOM 동작을 관찰해 다시 설계한 것이다(소수 좌표 사용, 브리프의 픽스처·문구를 그대로 쓰지 않음).

test('벽 패널: 외벽 [교체]는 surfaceActions.replaceMaterial을 {kind:"wall", id, side:"out"}으로, 정확히 그 모양으로 부른다', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0.5, 0.25], [3600.75, 2400.5], 160));
  const calls = [];
  const el = document.createElement('div');
  createPropsPanel(el, store, ui, { surfaceActions: { replaceMaterial: t => calls.push(t) } });
  const wallId = activeFloor(store.get()).walls[0].id;
  ui.set({ selection: { type: 'wall', id: wallId } });
  el.querySelector('[name="matReplace"][data-side="out"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual({ kind: 'wall', id: wallId, side: 'out' });
  expect(Object.keys(calls[0]).sort()).toEqual(['id', 'kind', 'side']); // 여분의 필드가 없다
});

test('벽 패널: [마감재 편집기]는 side를 그대로 넘기고, [교체]와 서로 섞이지 않는다', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const calls = [];
  const el = document.createElement('div');
  createPropsPanel(el, store, ui, { surfaceActions: { openEditor: (id, side) => calls.push([id, side]) } });
  const wallId = activeFloor(store.get()).walls[0].id;
  ui.set({ selection: { type: 'wall', id: wallId } });
  el.querySelector('[name="matEditor"][data-side="in"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(calls).toEqual([[wallId, 'in']]);
});

test('벽 패널: 재질이 지정된 면은 색 입력이 사라지고, 미지정인 면은 색 입력이 남는다', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const el = document.createElement('div');
  createPropsPanel(el, store, ui, {});
  const wallId = activeFloor(store.get()).walls[0].id;
  ui.set({ selection: { type: 'wall', id: wallId } });
  expect(el.querySelector('input[name="colorIn"]')).not.toBeNull();
  expect(el.querySelector('input[name="colorOut"]')).not.toBeNull();
  applyMaterial(store, { kind: 'wall', id: wallId, side: 'in' }, { id: 'marble-black', offset: [0, 0], angle: 0 });
  expect(el.querySelector('input[name="colorIn"]')).toBeNull();       // 재질이 색을 대신한다
  expect(el.querySelector('input[name="colorOut"]')).not.toBeNull(); // 외벽은 아직 미지정 — 색 입력이 남는다
});

test('벽 패널: change 이벤트로 들어온 오프셋·각도도 normalizeAssignment의 클램프·순환 정규화를 그대로 통과한다', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const el = document.createElement('div');
  createPropsPanel(el, store, ui, {});
  const wallId = activeFloor(store.get()).walls[0].id;
  applyMaterial(store, { kind: 'wall', id: wallId, side: 'in' }, { id: 'wood-ash', offset: [0, 0], angle: 0 });
  applyMaterial(store, { kind: 'wall', id: wallId, side: 'out' }, { id: 'wood-ash', offset: [0, 0], angle: 0 });
  ui.set({ selection: { type: 'wall', id: wallId } });
  const u = el.querySelector('[name="matU-in"]');
  u.value = '1500'; u.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).walls[0].matIn.offset[0]).toBe(1000); // MAT_RANGE.offset의 최댓값으로 잘린다
  const ang = el.querySelector('[name="matA-out"]');
  ang.value = '400'; ang.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).walls[0].matOut.angle).toBe(40); // deg360 순환 정규화
});

// 리뷰 I-1: 한 화면이 두 말을 하지 않는다 — 마감재 행이 '미지정'인 면에서만 색 선택기가 뜬다.
// 레거시 폴백을 조회 한 곳에만 넣었을 때는 행이 "무광 화이트 페인트"를 보여 주는데 바로 아래
// 색 칸도 함께 떴다("재질이 없을 때만 색을 고른다"가 그 줄의 뜻이다).
test('벽 패널: 레거시 문자열만 있는 면은 마감재 행도 색 선택기도 미지정으로 일치한다', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const el = document.createElement('div');
  createPropsPanel(el, store, ui, {});
  const wallId = activeFloor(store.get()).walls[0].id;
  ui.set({ selection: { type: 'wall', id: wallId } });
  expect(el.querySelector('[data-mat-row="in"]').textContent).toContain('미지정');
  expect(el.querySelector('[data-mat-row="out"]').textContent).toContain('미지정');
  expect(el.querySelector('input[name="colorIn"]')).not.toBeNull();
  expect(el.querySelector('input[name="colorOut"]')).not.toBeNull();
  // 명시 지정을 바르면 그 면의 색 칸만 사라진다(3D도 그때부터 무늬를 바른다).
  applyMaterial(store, { kind: 'wall', id: wallId, side: 'in' }, { id: 'brick-terra', offset: [0, 0], angle: 0 });
  expect(el.querySelector('[data-mat-row="in"]').textContent).not.toContain('미지정');
  expect(el.querySelector('input[name="colorIn"]')).toBeNull();
  expect(el.querySelector('input[name="colorOut"]')).not.toBeNull();
});

test('방 패널: 바닥·천장 행은 {kind:"floor"|"ceiling", id}로 지정을 읽고 색 입력 유무로 반영한다', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const el = document.createElement('div');
  createPropsPanel(el, store, ui, {});
  const roomId = activeFloor(store.get()).rooms[0].id;
  ui.set({ selection: { type: 'room', id: roomId } });
  expect(el.textContent).toContain('바닥 재질');
  expect(el.textContent).toContain('천장 재질');
  applyMaterial(store, { kind: 'ceiling', id: roomId }, { id: 'paint-ivory', offset: [0, 0], angle: 0 });
  expect(el.querySelector('input[name="ceilingColor"]')).toBeNull();
  expect(el.querySelector('input[name="floorColor"]')).not.toBeNull();
  expect(assignmentOf(activeFloor(store.get()), { kind: 'ceiling', id: roomId }).id).toBe('paint-ivory');
  // §17.4(1): 바닥에는 새 형식이 들어가지 않았다 — 조회는 레거시 floorMaterial('wood-oak')로 떨어진다.
  expect(activeFloor(store.get()).rooms.find(r => r.id === roomId).floorMat).toBeNull();
  expect(assignmentOf(activeFloor(store.get()), { kind: 'floor', id: roomId }).id).toBe('wood-oak');
});

test('propsPanel.js는 applyNumber·lenField·withUnit·readLen을 여전히 내보낸다(fieldUtils.js 분리 이후에도)', () => {
  expect(typeof applyNumber).toBe('function');
  expect(typeof lenField).toBe('function');
  expect(typeof withUnit).toBe('function');
  expect(typeof readLen).toBe('function');
});

test('선택이 바뀌면 크기 비율 유지가 꺼지고, 잠긴 제품은 편집되지 않는다', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const a = addItem(store, createItem(productById('sofa-3'), { pos: [1000, 1000] }));
  const b = addItem(store, createItem(productById('bed-queen'), { pos: [2500, 1000], locked: true }));
  const el = document.createElement('div'); createPropsPanel(el, store, ui, {});
  ui.set({ selection: { type: 'item', id: a } });
  const keep = el.querySelector('[name="keepRatio"]');
  keep.checked = true; keep.dispatchEvent(new Event('change', { bubbles: true }));
  ui.set({ selection: { type: 'item', id: b } });
  expect(el.querySelector('[name="keepRatio"]').checked).toBe(false);   // 다른 제품으로 옮기면 꺼진다
  const w = el.querySelector('[name="w"]');
  w.value = '1000'; w.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).items.find(i => i.id === b).size[0]).toBe(1500); // 잠긴 제품은 그대로
  expect(document.querySelector('#toasts').textContent).toContain('잠긴');
});

test('층 삭제는 인앱 확인을 받고 취소하면 남는다', async () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addFloor(store, { name: '2층', copy: 'none' });   // 마지막 층은 지울 수 없으므로 두 층으로 만든다
  const el = document.createElement('div'); createPropsPanel(el, store, ui);
  el.querySelector('button[name="floorDelete"]').click();
  expect(document.querySelector('.modal.confirm').textContent).toContain('층을 삭제할까요?');
  document.querySelector('.modal.confirm [name="cancel"]').click();
  await new Promise(r => setTimeout(r, 0));
  expect(store.get().floors).toHaveLength(2);
  el.querySelector('button[name="floorDelete"]').click();
  document.querySelector('.modal.confirm [name="ok"]').click();
  await new Promise(r => setTimeout(r, 0));
  expect(store.get().floors).toHaveLength(1);
});

// 결정 19: 확인 뒤에 대상을 **다시 찾는다**. 인덱스를 들고 가면 대화상자가 열려 있는 동안 앞 층이
// 사라졌을 때(undo·다른 경로) 같은 인덱스가 다른 층을 가리켜 엉뚱한 층이 지워진다.
test('층 삭제는 확인 뒤에 대상을 id로 다시 찾는다(앞 층이 사라져도 그 층만 지운다)', async () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addFloor(store, { name: '2층', copy: 'none' });
  addFloor(store, { name: '3층', copy: 'none' });
  setActiveFloor(store, 1);                          // 지울 대상은 '2층'(인덱스 1)
  const el = document.createElement('div'); createPropsPanel(el, store, ui);
  el.querySelector('button[name="floorDelete"]').click();
  expect(document.querySelector('.modal.confirm').textContent).toContain('"2층" 층을 삭제할까요?');
  deleteFloor(store, 0);                             // 확인을 기다리는 동안 맨 앞 층이 사라진다 → '2층'은 인덱스 0
  document.querySelector('.modal.confirm [name="ok"]').click();
  await new Promise(r => setTimeout(r, 0));
  expect(store.get().floors.map(f => f.name)).toEqual(['3층']);   // 인덱스를 그대로 썼다면 '3층'이 지워진다
});

// §14.8: 고른 제품이 겹쳐 있으면 속성 패널 상단에 한 줄로 알린다.
test('충돌 중인 제품을 고르면 속성 패널이 한 줄로 알린다', () => {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  const a = addItem(store, createItem(productById('sofa-3'), { pos: [1000.5, 1000.25] }));
  addItem(store, createItem(productById('sofa-3'), { pos: [1200.5, 1000.25] }));
  const el = document.createElement('div'); document.body.appendChild(el);
  createPropsPanel(el, store, ui);
  ui.set({ selection: { type: 'item', id: a } });
  expect(el.textContent).toContain('다른 제품과 겹칩니다');
  store.dispatch(d => { d.floors[0].items[1].pos = [6000, 6000]; });
  expect(el.textContent).not.toContain('다른 제품과 겹칩니다');
});

// §14.8의 분리: applyNumber는 propsApply.js로 옮겼고 propsPanel이 다시 내보낸다(호출자 불변).
test('비율 유지 체크박스와 applyNumber가 같은 칸을 본다', () => {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  const id = addItem(store, createItem(productById('sofa-3'), { pos: [1000, 1000] }));
  const el = document.createElement('div'); document.body.appendChild(el);
  createPropsPanel(el, store, ui);
  ui.set({ selection: { type: 'item', id } });
  const cb = el.querySelector('[name="keepRatio"]');
  expect(cb.checked).toBe(false);
  cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
  expect(getKeepRatio()).toBe(true);
  applyNumber(store, { type: 'item', id }, 'w', 1050);      // 2100 → 1050, 비율 유지로 깊이·높이도 절반
  const it = activeFloor(store.get()).items.find(i => i.id === id);
  expect(it.size[0]).toBe(1050);
  expect(it.size[1]).toBe(450);
  setKeepRatio(false);
});

// §14.10: 벽 높이에 23003을 치면 말없이 8000이 됐다(감사 #7).
test('범위를 벗어난 입력은 잘린 사실을 토스트로 알린다', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const ui = createUiState();
  const wall = activeFloor(store.get()).walls[0];
  const el = document.createElement('div'); document.body.appendChild(el);
  createPropsPanel(el, store, ui);
  ui.set({ selection: { type: 'wall', id: wall.id } });
  const h = el.querySelector('[name="height"]');
  h.value = '23003'; h.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).walls.find(w => w.id === wall.id).height).toBe(8000);
  // 이 파일에는 beforeEach가 없어 앞 테스트의 토스트가 남아 있다: 목록에 들어 있는지만 본다.
  expect([...document.querySelectorAll('.toast')].map(t => t.textContent)).toContain('최대 8000 mm까지');
});

// m-6: ft·in 모드의 길이 칸에서도 "최대 8000 mm까지"가 떴다 — 화면에 mm는 하나도 없는데.
test('ft·in 모드의 클램프 문구는 ft·in 표기로 말한다', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  store.dispatch(d => { d.units = 'ftin'; }, { record: false });
  const ui = createUiState();
  const wall = activeFloor(store.get()).walls[0];
  const el = document.createElement('div'); document.body.appendChild(el);
  createPropsPanel(el, store, ui);
  ui.set({ selection: { type: 'wall', id: wall.id } });
  const h = el.querySelector('[name="height"]');
  expect(h.dataset.len).toBe('1');                       // ft·in 길이 칸은 텍스트 입력이다
  h.value = '80\''; h.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).walls.find(w => w.id === wall.id).height).toBe(8000);
  const texts = [...document.querySelectorAll('.toast')].map(t => t.textContent);
  expect(texts).toContain(`최대 ${fmtLen(8000, 'ftin')}까지`);   // 예: 최대 26' 3"까지
  expect(texts.at(-1)).not.toContain('mm');
});

// §14.10: 층이 하나뿐인데도 빨간 "층 삭제"가 활성이었다(감사 #8).
test('층이 하나면 층 삭제 버튼이 disabled + title이다', () => {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  const el = document.createElement('div'); document.body.appendChild(el);
  createPropsPanel(el, store, ui);
  const btn = el.querySelector('[name="floorDelete"]');
  expect(btn.disabled).toBe(true);
  expect(btn.title).toBe('층이 하나뿐입니다');
  store.dispatch(d => { d.floors.push(structuredClone(d.floors[0])); });
  expect(el.querySelector('[name="floorDelete"]').disabled).toBe(false);
});

// §15.14: 슬라이더에 수치가 없어 얼마나 투명한지 알 수 없었다.
test('벽·바닥 투명도에 % 수치가 붙는다', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const el = document.createElement('div'); document.body.appendChild(el);
  createPropsPanel(el, store, ui);
  const out = el.querySelector('output[name="wallOpacityOut"]');
  expect(out.textContent).toBe('100%');
  const slider = el.querySelector('[name="wallOpacity"]');
  slider.value = '0.4';
  slider.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().view.wallOpacity).toBeCloseTo(0.4, 6);
  expect(el.querySelector('output[name="wallOpacityOut"]').textContent).toBe('40%');
  expect(el.querySelector('output[name="floorOpacityOut"]').textContent).toBe('100%');
});

// §16.4(감사 §29): 무엇을 고르든 층 전환 수단은 화면에 남는다.
test('#floorBar는 선택이 있어도 속성 패널 맨 위에 남는다', () => {
  const { store, ui, el } = setupPanel();
  // copy: 'plan' — 새 층에도 벽이 있어야 "고른 채로" 층 바를 볼 수 있다(copy: 'none'이면 새 층이 비어
  // 고를 벽이 없다). 다른 층의 대상을 가리키는 선택은 아래 테스트가 따로 본다.
  addFloor(store, { name: 'Floor 2', copy: 'plan' });
  const wall = activeFloor(store.get()).walls[0];
  if (wall) ui.set({ selection: { type: 'wall', id: wall.id } });
  const bar = el.querySelector('#floorBar');
  expect(bar).not.toBeNull();
  expect(el.firstElementChild.id).toBe('floorBar');     // 맨 위다
  expect(bar.querySelector('[name="floorSelect"]').options).toHaveLength(2);
  expect(bar.querySelector('[name="floorAdd"]')).not.toBeNull();
  // 상세(투명도·삭제)는 선택이 있는 동안에는 없다.
  expect(el.querySelector('[name="wallOpacity"]')).toBeNull();
});

// 리뷰 I-2(MUST-CHECK N-2): 무동작·클램프 확정의 render()는 container.innerHTML을 통째로 갈아
// 포커스를 <body>로 떨어뜨렸다. 패널이 이미 가진 ui.focusField로 같은 칸을 다시 잡는다.
// 두께를 최대(1000)까지 올려 둔다: 그다음 확정은 클램프로 같은 값이 되어 dispatch가 없다
// (= 패널이 render()로 직접 글자를 되맞추는 갈래).
function atClampedMax() {
  const ctx = setupPanel();
  ui2commit(ctx, '1000');
  return ctx;
}
function ui2commit({ store, ui, el }, value) {
  ui.set({ selection: { type: 'wall', id: activeFloor(store.get()).walls[0].id } });
  const t = el.querySelector('[name="thickness"]');
  t.value = value;
  t.dispatchEvent(new Event('change', { bubbles: true }));
}

test('클램프된 무동작 확정 뒤에도 포커스가 그 칸에 남는다', () => {
  const { store, ui, el } = atClampedMax();
  expect(activeFloor(store.get()).walls[0].thickness).toBe(1000);
  const t = el.querySelector('[name="thickness"]');
  t.focus();
  expect(document.activeElement).toBe(t);
  t.value = '50099';                                     // 최대 1000으로 잘려 지금 값과 같다 → dispatch 없음
  t.dispatchEvent(new Event('change', { bubbles: true }));
  expect(el.querySelector('[name="thickness"]').value).toBe('1000');   // 글자는 모델 값으로
  expect(document.activeElement.name).toBe('thickness');               // 예전에는 body였다
  expect(el.contains(document.activeElement)).toBe(true);
  expect(ui.get().focusField).toBeNull();                              // 한 번만 쓰고 비운다
});

test('포커스가 이미 떠난 칸은 무동작 확정에서도 다시 잡지 않는다', () => {
  const { ui, el } = atClampedMax();
  const away = document.createElement('input');          // [Tab]으로 패널 밖으로 나간 자리
  document.body.appendChild(away);
  away.focus();
  const t = el.querySelector('[name="thickness"]');
  t.value = '50099';
  t.dispatchEvent(new Event('change', { bubbles: true }));
  expect(el.querySelector('[name="thickness"]').value).toBe('1000');   // 글자는 그대로 되맞춘다
  expect(document.activeElement).toBe(away);                           // 되끌어오지 않는다
  expect(ui.get().focusField).toBeNull();
  away.remove();
});

// §16.4(감사 §32): 다른 층의 대상을 가리키는 선택은 풀고 층 정보를 보인다(빈 패널 방어).
test('다른 층의 대상이 선택된 채 층을 바꾸면 선택이 풀리고 층 정보가 보인다', () => {
  const { store, ui, el } = setupPanel();
  const wall = activeFloor(store.get()).walls[0];
  ui.set({ selection: { type: 'wall', id: wall.id } });
  addFloor(store, { name: 'Floor 2', copy: 'none' });    // 새 층에는 그 벽이 없다
  expect(ui.get().selection).toBeNull();
  expect(el.querySelector('#floorBar')).not.toBeNull();
  expect(el.textContent).toContain('층 관리');
  expect(el.innerHTML.length).toBeGreaterThan(0);        // 예전에는 innerHTML 길이가 0이었다
});

// §17.5(3) · 감사 §6: 벽 부착 제품은 3D에서 기즈모가 조용히 사라졌다 — 사실과 대체 조작을 적는다.
test('벽 부착 제품 행에 벽 슬라이드 안내가 한 줄 붙는다', async () => {
  const { WALL_ITEM_SLIDE_HINT } = await import('../src/ui/messages.js');
  const { nearestWallPlacement, WALL_ATTACH_DIST } = await import('../src/geom/items.js');
  const { store, ui, el } = setupPanel();
  const f = activeFloor(store.get());
  const size = [900, 200, 2100];
  const seat = nearestWallPlacement(f.walls, [1500.5, 200.25], size, WALL_ATTACH_DIST);
  const id = addItem(store, createItem(productById('hood-wall'), { pos: seat.pos, wallId: seat.wallId, t: seat.t, side: seat.side, rot: seat.rot }));
  ui.set({ selection: { type: 'item', id } });
  expect(el.textContent).toContain(WALL_ITEM_SLIDE_HINT);
  expect(el.querySelector('[name="posX"]').readOnly).toBe(true);     // pos는 (wallId, t)의 결과다
  // 바닥에 서는 제품에는 그 줄이 없다.
  const hood = addItem(store, createItem(productById('hood-box'), { pos: [2000.5, 1500.25] }));
  ui.set({ selection: { type: 'item', id: hood } });
  expect(el.textContent).not.toContain(WALL_ITEM_SLIDE_HINT);
});

// §17.6(4) · §(d)의 §16.1(감사 §30): 값과 되돌리기는 맞는데 포커스가 BODY로 떨어져,
// 칸을 연달아 채우려면 매번 마우스로 돌아와야 했다.
test('[Tab]으로 확정하면 포커스가 다음 칸으로 간다', () => {
  const { store, ui, el } = setupPanel();
  const id = activeFloor(store.get()).walls[0].id;
  ui.set({ selection: { type: 'wall', id } });
  const th = el.querySelector('[name="thickness"]');
  const after = nextFocusName(el, th);
  expect(after).not.toBeNull();
  th.focus();
  th.value = '220';
  th.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));   // 진짜 [Tab]만 다음 칸을 연다(리뷰 C-2)
  th.blur();                                                  // 실브라우저의 [Tab]: blur 뒤에 change가 온다
  th.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).walls.find(w => w.id === id).thickness).toBe(220);
  expect(document.activeElement.tagName).not.toBe('BODY');
  expect(document.activeElement.name).toBe(after);
  // 제자리 규칙은 그대로다: 포커스가 칸에 남아 있으면 그 칸으로 돌아온다(클램프 화살표).
  const th2 = el.querySelector('[name="thickness"]');
  th2.focus();
  th2.value = '230';
  th2.dispatchEvent(new Event('change', { bubbles: true }));
  expect(document.activeElement.name).toBe('thickness');
});

// 리뷰 C-2: "캔버스 클릭으로 확정"도 change 순간의 activeElement가 <body>라 [Tab]으로 오인됐다.
// 포커스가 속성 패널의 다음 칸에 앉으면 keymap.js의 INPUT 가드가 Esc·Enter만 통과시키고
// 도구 전환 키·Delete·Ctrl+Z를 전부 삼킨다 — 다음 클릭까지 앱이 키에 반응하지 않는 것처럼 보였다.
test('캔버스 클릭으로 확정하면 포커스를 패널로 되끌어오지 않는다(단축키가 산다)', () => {
  const { store, ui, el } = setupPanel();
  const id = activeFloor(store.get()).walls[0].id;
  ui.set({ selection: { type: 'wall', id } });
  const canvas = document.createElement('canvas');      // 2D 캔버스에는 tabindex가 없다 → 포커스를 받지 못한다
  document.body.appendChild(canvas);
  const th = el.querySelector('[name="thickness"]');
  th.focus();
  th.value = '220';
  canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));   // [Tab] 키는 없다
  th.blur();                                            // 포커스를 받을 수 없는 곳을 클릭 → <body>
  th.dispatchEvent(new Event('change', { bubbles: true }));
  expect(activeFloor(store.get()).walls.find(w => w.id === id).thickness).toBe(220);   // 값은 확정된다
  expect(el.contains(document.activeElement)).toBe(false);               // 되끌어오지 않는다
  expect(document.activeElement.tagName).toBe('BODY');
  // 그래서 keymap의 INPUT 가드에 걸리지 않는다: 도구 전환 키가 그대로 산다.
  const calls = [];
  const view = { tool: null, requestRender: () => {} };
  const h = createKeyHandler({ store, ui, view, setTool: n => calls.push(n), setMode: () => {}, openBackground: () => {}, deleteSelection: () => {} });
  const ev = new KeyboardEvent('keydown', { key: 'l', bubbles: true });
  document.activeElement.dispatchEvent(ev);
  expect(['INPUT', 'SELECT', 'TEXTAREA']).not.toContain(ev.target.tagName);   // keymap.js의 가드
  h(ev);
  expect(calls).toEqual(['wall']);
  canvas.remove();
});
