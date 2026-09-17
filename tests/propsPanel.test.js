// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls, addFloor, setActiveFloor } from '../src/state/floorOps.js';
import { rectWalls, makeWall } from '../src/geom/walls.js';
import { createPropsPanel, applyNumber, lenField, withUnit, readLen } from '../src/ui/propsPanel.js';

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
  expect(el.textContent).toContain('선택된 제품 2개');
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
