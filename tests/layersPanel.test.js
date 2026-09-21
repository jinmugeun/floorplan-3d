// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem, updateRoom } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { createLayersPanel, ductRoomId } from '../src/ui/layersPanel.js';
import { addDuct } from '../src/state/ductOps.js';

function setup() {
  const store = createStore(createEmptyProject()), ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  updateRoom(store, activeFloor(store.get()).rooms[0].id, { name: '가열조리실' });
  const inRoom = addItem(store, createItem(productById('sofa-3'), { pos: [2000, 1500] }));
  const outside = addItem(store, createItem(productById('chair-dining'), { pos: [9000, 9000] }));
  const el = document.createElement('div'); document.body.appendChild(el);
  const panel = createLayersPanel(el, { store, ui });
  return { store, ui, el, panel, inRoom, outside };
}
const click = (el, sel) => el.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const item = (store, id) => activeFloor(store.get()).items.find(i => i.id === id);

describe('레이어 패널', () => {
  test('방별로 묶고 방 밖 제품은 미지정으로 모은다', () => {
    const { el } = setup();
    const rooms = [...el.querySelectorAll('.layer-room')];
    expect(rooms).toHaveLength(2);
    expect(rooms[0].textContent).toContain('가열조리실');
    expect(rooms[0].textContent).toContain('m²');
    expect(rooms[0].querySelectorAll('.layer-item')).toHaveLength(1);
    expect(rooms[1].textContent).toContain('미지정');
    expect(rooms[1].textContent).toContain('식탁 의자');
  });

  test('이름을 클릭하면 캔버스에서 선택된다', () => {
    const { ui, el, inRoom } = setup();
    click(el, `[data-select="${inRoom}"]`);
    expect(ui.get().selection).toEqual({ type: 'item', id: inRoom });
  });

  test('눈과 자물쇠 버튼이 숨김·잠금을 토글한다', () => {
    const { store, el, inRoom } = setup();
    click(el, `[data-hide="${inRoom}"]`);
    expect(item(store, inRoom).hidden).toBe(true);
    click(el, `[data-hide="${inRoom}"]`);
    expect(item(store, inRoom).hidden).toBe(false);
    click(el, `[data-lock="${inRoom}"]`);
    expect(item(store, inRoom).locked).toBe(true);
  });

  test('✎로 이름을 바꾼다', () => {
    const { store, el, inRoom } = setup();
    click(el, `[data-rename="${inRoom}"]`);
    const input = el.querySelector(`input[data-name="${inRoom}"]`);
    expect(input).not.toBeNull();
    input.value = '거실 소파';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(item(store, inRoom).name).toBe('거실 소파');
    expect(el.textContent).toContain('거실 소파');
  });

  test('이름 변경은 한 단계만 기록한다(undo 한 번에 되돌아간다)', () => {
    const { store, el, inRoom } = setup();
    const before = item(store, inRoom).name;
    click(el, `[data-rename="${inRoom}"]`);
    const input = el.querySelector(`input[data-name="${inRoom}"]`);
    input.value = '거실 소파';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); // Enter 뒤 포커스가 빠져도 다시 커밋하지 않는다
    expect(item(store, inRoom).name).toBe('거실 소파');
    store.undo();
    expect(item(store, inRoom).name).toBe(before);
  });

  test('모두 보기 체크박스가 전체 숨김·보이기를 한다', () => {
    const { store, el } = setup();
    const all = () => el.querySelector('input[name="showAll"]');
    expect(all().checked).toBe(true);
    all().checked = false; all().dispatchEvent(new Event('change', { bubbles: true }));
    expect(activeFloor(store.get()).items.every(i => i.hidden)).toBe(true);
    const again = el.querySelector('input[name="showAll"]');
    expect(again.checked).toBe(false);
    again.checked = true; again.dispatchEvent(new Event('change', { bubbles: true }));
    expect(activeFloor(store.get()).items.every(i => !i.hidden)).toBe(true);
  });

  test('숨긴 항목 보기를 끄면 숨긴 제품이 목록에서 빠진다', () => {
    const { el, inRoom } = setup();
    expect(el.textContent).toContain('숨긴 항목 보기');   // 제품과 덕트를 함께 거른다
    click(el, `[data-hide="${inRoom}"]`);
    expect(el.querySelectorAll('.layer-item')).toHaveLength(2);
    const f = el.querySelector('input[name="showHidden"]');
    f.checked = false; f.dispatchEvent(new Event('change', { bubbles: true }));
    expect(el.querySelectorAll('.layer-item')).toHaveLength(1);
  });

  test('숨긴 제품은 목록에서 흐리게 표시된다', () => {
    const { el, inRoom } = setup();
    click(el, `[data-hide="${inRoom}"]`);
    expect(el.querySelector(`.layer-item[data-id="${inRoom}"]`).classList.contains('off')).toBe(true);
  });

  test('destroy 후에는 스토어 변경에 반응하지 않는다', () => {
    const { store, el, panel } = setup();
    panel.destroy();
    addItem(store, createItem(productById('bed-queen'), { pos: [1000, 1000] }));
    expect(el.querySelectorAll('.layer-item')).toHaveLength(0);
  });

  test('덕트가 첫 점이 든 방 아래에 뜨고 보기·잠금이 동작한다', () => {
    const { store, ui, el } = setup();
    addDuct(store, { id: 'd1', kind: 'supply', system: 'OA', points: [[2000, 1500], [3000, 1500]], segments: [{ w: 500, h: 300, z: 2700 }] });
    addDuct(store, { id: 'd2', kind: 'exhaust', points: [[9000, 9000], [9000, 10000]] });   // 방 밖 → 미지정
    const f0 = activeFloor(store.get());
    expect(ductRoomId(f0, f0.ducts[0])).toBe(f0.rooms[0].id);
    expect(ductRoomId(f0, f0.ducts[1])).toBeNull();
    const rooms = [...el.querySelectorAll('.layer-room')];
    expect(rooms[0].textContent).toContain('덕트 급기 · OA');
    expect(rooms[0].textContent).toContain('1000');                       // 총 길이 1000 mm
    expect(rooms.at(-1).textContent).toContain('덕트 배기');
    el.querySelector('[data-duct-hide="d1"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(activeFloor(store.get()).ducts.find(d => d.id === 'd1').hidden).toBe(true);
    el.querySelector('[data-duct-lock="d1"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(activeFloor(store.get()).ducts.find(d => d.id === 'd1').locked).toBe(true);
    el.querySelector('[data-duct-select="d1"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(ui.get().selection).toEqual({ type: 'duct', id: 'd1', segment: null, vertex: null });
  });

  test('"모두 보기"가 제품과 덕트를 한 단계로 함께 켜고 끈다', () => {
    const { store, el } = setup();
    addDuct(store, { id: 'd1', points: [[2000, 1500], [3000, 1500]], hidden: true });
    const box = el.querySelector('input[name="showAll"]');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    const f = activeFloor(store.get());
    expect(f.items.every(i => !i.hidden)).toBe(true);
    expect(f.ducts.every(d => !d.hidden)).toBe(true);
    store.undo();
    expect(activeFloor(store.get()).ducts[0].hidden).toBe(true);          // 되돌림 한 단계
  });
});
