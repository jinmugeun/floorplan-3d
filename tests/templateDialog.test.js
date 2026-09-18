// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { openRoomTemplateDialog, placementMessage } from '../src/ui/templateDialog.js';
import { updateRoom } from '../src/state/floorOps.js';

function setup() {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [6000.5, 4000.25], 200));
  const roomId = activeFloor(store.get()).rooms[0].id;
  updateRoom(store, roomId, { type: 'cook' });
  const dlg = openRoomTemplateDialog({ store, roomId });
  const root = document.querySelector('.modal.templates');
  return { store, roomId, dlg, root, floor: () => activeFloor(store.get()) };
}
const click = (root, sel) => root.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const set = (root, sel, v) => { const el = root.querySelector(sel); el.value = String(v); el.dispatchEvent(new Event('change', { bubbles: true })); };

beforeEach(() => { document.body.innerHTML = ''; });

describe('템플릿 대화상자', () => {
  test('방 타입을 기본 필터로 쓰고 카드에 면적·제품 수를 보여준다', () => {
    const a = setup();
    expect(a.root.querySelector('[name="roomType"]').value).toBe('cook');
    const cards = [...a.root.querySelectorAll('[data-template]')];
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(cards[0].textContent).toContain('m²');
    expect(cards[0].textContent).toContain('개');
    expect(cards[0].textContent).toContain('가열조리실');   // 용도만이 아니라 공간 타입도 보여 준다
    expect(cards[0].textContent).toContain('예산 기준');
  });

  test('필터를 바꾸면 카드가 줄고, 맞는 것이 없으면 안내가 나온다', () => {
    const a = setup();
    set(a.root, '[name="roomType"]', 'office');
    expect([...a.root.querySelectorAll('[data-template]')].length).toBeGreaterThanOrEqual(2);
    set(a.root, '[name="budget"]', '1');
    expect(a.root.querySelectorAll('[data-template]')).toHaveLength(0);
    expect(a.root.textContent).toContain('조건에 맞는 템플릿이 없습니다');
  });

  test('[적용]은 기존 가구를 대체하고 닫힌다', () => {
    const a = setup();
    const old = addItem(a.store, createItem(productById('sofa-3'), { pos: [3000, 2000] }));
    click(a.root, '[data-template="cook-basic"] [name="apply"]');
    expect(a.floor().items.some(i => i.id === old)).toBe(false);
    expect(a.floor().items.length).toBeGreaterThanOrEqual(3);
    expect(document.querySelector('.modal.templates')).toBeNull();
    expect(document.querySelector('.toast').textContent).toContain('개 배치');   // 배치 개수를 알린다
  });

  test('자리가 모자라면 생략 개수를, 하나도 못 놓으면 그 사실을 문구로 알린다', () => {
    expect(placementMessage(5, 0)).toBe('5개 배치');
    expect(placementMessage(3, 2)).toBe('3개 배치, 2개 생략(공간 부족)');
    expect(placementMessage(0, 4)).toBe('배치할 공간이 없습니다');
  });

  test('좁은 방에 적용하면 생략 개수가 토스트에 나온다', () => {
    const store = createStore(createEmptyProject());
    addWalls(store, rectWalls([0, 0], [1600.5, 1200.25], 200));
    const roomId = activeFloor(store.get()).rooms[0].id;
    openRoomTemplateDialog({ store, roomId });
    click(document.querySelector('.modal.templates'), `[data-template="cook-basic"] [name="apply"]`);
    expect(document.querySelector('.toast').textContent).toContain('생략(공간 부족)');
  });

  test('[기존 제품 유지하고 추가]는 지우지 않는다', () => {
    const a = setup();
    const old = addItem(a.store, createItem(productById('sofa-3'), { pos: [3000, 2000] }));
    click(a.root, '[data-template="cook-basic"] [name="add"]');
    expect(a.floor().items.some(i => i.id === old)).toBe(true);
  });

  test('Esc로 닫고 아무것도 바꾸지 않는다', () => {
    const a = setup();
    a.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.modal.templates')).toBeNull();
    expect(a.floor().items).toHaveLength(0);
  });
});
