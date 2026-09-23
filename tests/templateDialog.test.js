// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { openRoomTemplateDialog, placementMessage } from '../src/ui/templateDialog.js';
import { updateRoom } from '../src/state/floorOps.js';
import { createUiState } from '../src/state/uistate.js';

// items를 주면 대화상자를 열기 **전에** 방 안쪽(중심선 6000.5×4000.25의 가운데)에 놓는다:
// killCount()가 세는 대상이라 경고 줄("기존 제품 N개를 지웁니다")이 렌더에 나타난다.
// 기본값은 빈 배열이다 — 기존 테스트(`Esc로 닫고 아무것도 바꾸지 않는다`)가 items 0을 단정한다.
function setup({ items = [] } = {}) {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [6000.5, 4000.25], 200));
  const roomId = activeFloor(store.get()).rooms[0].id;
  updateRoom(store, roomId, { type: 'cook' });
  const placed = items.map(id => addItem(store, createItem(productById(id), { pos: [2000.5, 1500.25] })));
  const dlg = openRoomTemplateDialog({ store, ui, roomId });
  const root = document.querySelector('.modal.templates');
  return { store, ui, roomId, dlg, root, placed, floor: () => activeFloor(store.get()) };
}
const click = (root, sel) => root.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const set = (root, sel, v) => { const el = root.querySelector(sel); el.value = String(v); el.dispatchEvent(new Event('change', { bubbles: true })); };

beforeEach(() => { document.body.innerHTML = ''; });

describe('템플릿 대화상자', () => {
  test('방 타입을 기본 필터로 쓰고 카드에 면적·제품 수를 보여준다', () => {
    const a = setup();
    expect(a.root.querySelector('[name="roomType"]').value).toBe('cook');
    const cards = [...a.root.querySelectorAll('[data-template]')];
    expect(cards.length).toBe(1);        // 기본 면적 필터가 22 m²를 담는 cook-basic 한 장만 남긴다(§16.10)
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
    expect(placementMessage(5, 0)).toBe('5개 배치 · 0개 위치 조정 · 0개 건너뜀');
    expect(placementMessage(3, 2)).toBe('3개 배치 · 0개 위치 조정 · 2개 건너뜀');
    expect(placementMessage(3, 2, 1)).toBe('3개 배치 · 1개 위치 조정 · 2개 건너뜀');
    expect(placementMessage(0, 4)).toBe('배치할 공간이 없습니다');
  });

  test('좁은 방에 적용하면 생략 개수가 토스트에 나온다', () => {
    const store = createStore(createEmptyProject());
    addWalls(store, rectWalls([0, 0], [1600.5, 1200.25], 200));
    const roomId = activeFloor(store.get()).rooms[0].id;
    openRoomTemplateDialog({ store, roomId });
    const root = document.querySelector('.modal.templates');
    // 실면적 1.4 m²라 기본 면적 필터가 cook-basic(8~30 m²)도 걸러 낸다: 먼저 필터를 푼다(§16.10).
    click(root, '[name="filterReset"]');
    click(root, `[data-template="cook-basic"] [name="apply"]`);
    expect(document.querySelector('.toast').textContent).toContain('개 건너뜀');
  });

  test('[기존 제품 유지하고 추가]는 지우지 않는다', () => {
    const a = setup();
    const old = addItem(a.store, createItem(productById('sofa-3'), { pos: [3000, 2000] }));
    click(a.root, '[data-template="cook-basic"] [name="add"]');
    expect(a.floor().items.some(i => i.id === old)).toBe(true);
  });

  test('카드에 96 px 미리보기 캔버스와 [취소]가 있다(§16.10 · 감사 §14)', () => {
    const a = setup();
    const card = a.root.querySelector('[data-template]');
    const canvas = card.querySelector('canvas[data-tpl]');
    expect(canvas).not.toBeNull();
    expect(canvas.width).toBe(96);
    expect(a.root.querySelector('[name="cancel"]').textContent).toBe('취소');
  });

  test('파괴적 [적용]은 보조 색이고 지워질 개수를 말한다(감사 §15)', () => {
    const a = setup({ items: ['sofa-3'] });               // 방 안에 지워질 제품 하나 → killCount() = 1
    const card = a.root.querySelector('[data-template]');
    const apply = card.querySelector('[name="apply"]');
    expect(apply.classList.contains('primary')).toBe(false);
    expect(card.querySelector('[name="add"]').classList.contains('primary')).toBe(true);
    expect(card.textContent).toContain('기존 제품 1개를 지웁니다');
  });

  test('방 면적·타입이 기본 필터이고 [필터 초기화]가 그것을 푼다(감사 §16)', () => {
    const a = setup();
    const min = a.root.querySelector('[name="minArea"]'), max = a.root.querySelector('[name="maxArea"]');
    // 방 면적이 두 칸의 기본값이다 → 그 면적을 담는 템플릿만 남는다.
    const area = Number(min.value);
    expect(area).toBeGreaterThan(0);
    expect(Number(max.value)).toBe(area);
    const narrowed = a.root.querySelectorAll('[data-template]').length;
    a.root.querySelector('[name="filterReset"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(min.value).toBe('');
    expect(max.value).toBe('');
    expect(a.root.querySelector('[name="roomType"]').value).toBe('');
    expect(a.root.querySelectorAll('[data-template]').length).toBeGreaterThanOrEqual(narrowed);
  });

  test('적용하면 그 방이 선택되고 포커스가 속성 패널로 간다(감사 §17)', () => {
    const props = document.createElement('div');
    props.id = 'props';
    props.innerHTML = '<button type="button" name="delete">방 삭제</button>';
    document.body.appendChild(props);
    const a = setup();
    a.root.querySelector('[data-template] [name="add"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(a.ui.get().selection).toEqual({ type: 'room', id: a.roomId });
    expect(document.activeElement).toBe(props.querySelector('[name="delete"]'));
    props.remove();
  });

  test('Esc로 닫고 아무것도 바꾸지 않는다', () => {
    const a = setup();
    a.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.modal.templates')).toBeNull();
    expect(a.floor().items).toHaveLength(0);
  });
});

// §14.9: 템플릿이 공간 타입의 기준이다 — 적용하면 "미지정"이 채워진다.
// setup()은 방 타입을 미리 'cook'으로 정해 두므로(11~19행) 여기서는 타입 없는 방을 직접 만든다.
test('적용 뒤 공간 타입이 템플릿의 roomType으로 채워진다', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [6000.5, 4000.25], 200));
  const roomId = activeFloor(store.get()).rooms[0].id;
  const before = activeFloor(store.get()).rooms[0].type;
  expect(before === 'none' || !before).toBe(true);        // 적용 전에는 미지정이다
  const dlg = openRoomTemplateDialog({ store, roomId });
  const card = document.querySelector('[data-template="cook-basic"]');
  card.querySelector('[name="apply"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(activeFloor(store.get()).rooms[0].type).toBe('cook');
  dlg.close();
});
