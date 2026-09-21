// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem, updateRoom } from '../src/state/floorOps.js';
import { productById } from '../src/products/catalog.js';
import { rectWalls } from '../src/geom/walls.js';
import { createPropsPanel } from '../src/ui/propsPanel.js';
import { equipRowsHtml, roomDesignRowsHtml, applyVentField, EQUIP_SECTION_TITLE } from '../src/ui/equipRows.js';
import { addDuct } from '../src/state/ductOps.js';

function setup(productId, patch = {}) {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [8000, 6000], 200));
  const id = addItem(store, createItem(productById(productId), { pos: [2000.5, 1500.25], ...patch }));
  const el = document.createElement('div');
  document.body.appendChild(el);
  createPropsPanel(el, store, ui);
  ui.set({ selection: { type: 'item', id } });
  const item = () => activeFloor(store.get()).items.find(x => x.id === id);
  const change = (name, value, kind = 'value') => {
    const input = el.querySelector(`[name="${name}"]`);
    if (kind === 'checked') input.checked = value; else input.value = String(value);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  return { store, ui, el, id, item, change };
}

describe('설비 속성 섹션', () => {
  test('설비 패널의 "연결된 덕트" 행을 누르면 그 꼭짓점이 선택된다', () => {
    const a = setup('hood-box');
    expect(a.el.textContent).toContain('연결된 덕트가 없습니다');
    const ductId = addDuct(a.store, { kind: 'exhaust', system: 'F-3', points: [[2000.5, 1500.25], [5000, 1500.25]], segments: [{ w: 750, h: 400, z: 2650 }], connections: [{ point: 0, itemId: a.id }] });
    const row = a.el.querySelector('[name="ventDuctSelect"]');
    expect(row).not.toBeNull();
    expect(a.el.textContent).toContain('배기 · F-3 · 1번 점');
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(a.ui.get().selection).toEqual({ type: 'duct', id: ductId, segment: null, vertex: 0 });
  });

  test('후드: 번호·필터·면풍속을 고치면 풍량이 따라 바뀐다(읽기 전용)', () => {
    const { el, item, change } = setup('hood-box');
    expect(el.textContent).toContain(`${EQUIP_SECTION_TITLE} · 후드`);
    expect(el.querySelector('output[name="eqCmh"]').textContent).toBe('3,456');
    expect(el.querySelector('input[name="eqCmh"]')).toBeNull();     // 사용자 입력 칸이 아니다
    change('eqNo', 3);
    expect(item().props.no).toBe(3);
    change('eqFilter', true, 'checked');
    expect(item().props.filter).toBe(true);
    change('eqFaceVelocity', 0.7);
    expect(item().props.faceVelocity).toBe(0.7);
    expect(item().props.cmh).toBe(4838);
    expect(el.querySelector('output[name="eqCmh"]').textContent).toBe('4,838');
    change('eqSystem', ' F-3 ');
    expect(item().props.system).toBe('F-3');
  });

  test('디퓨저: 심벌·급배기·A×B·개당 풍량. A×B는 아이템 크기도 바꾼다', () => {
    const { item, change } = setup('diffuser-650');
    change('eqSymbol', '나');
    expect(item().props.symbol).toBe('나');
    change('eqFlow', 'exhaust');
    expect(item().props.flow).toBe('exhaust');
    change('eqA', 500);
    change('eqB', 350);
    expect(item().props.a).toBe(500);
    expect(item().props.b).toBe(350);
    expect(item().size).toEqual([500, 350, 100]);
    change('eqCmhIn', 1000);
    expect(item().props.cmh).toBe(1000);
  });

  test('팬: 번호·급배기·챔버 W×D×H(아이템 크기와 같이 간다)·풍량', () => {
    const { store, item, change } = setup('fan-exhaust-700');
    change('eqFanId', 'F-3');
    expect(item().props.fanId).toBe('F-3');
    change('eqChamberW', 900);
    change('eqChamberH', 800);
    expect(item().props.chamber).toEqual([900, 700, 800]);
    expect(item().size).toEqual([900, 700, 800]);
    // props와 size를 한 트랜잭션으로 함께 바꾸므로 되돌림은 칸마다 한 단계다(C8의 resizeItem 경로).
    store.undo();
    expect(item().props.chamber).toEqual([900, 700, 700]);
    expect(item().size).toEqual([900, 700, 700]);
    change('eqCmhIn', 24062);
    expect(item().props.cmh).toBe(24062);
  });

  test('환기캡 지름은 100/150만, 조리기구는 상단 후드를 고른다', () => {
    const cap = setup('ventcap-150');
    cap.change('eqDia', 100);
    expect(cap.item().props.dia).toBe(100);
    expect(cap.item().size).toEqual([100, 100, 100]);   // 지름은 정육면체 변과 같이 간다(정한 것 4)

    const store = createStore(createEmptyProject());
    const ui = createUiState();
    addWalls(store, rectWalls([0, 0], [8000, 6000], 200));
    const hood = addItem(store, createItem(productById('hood-box'), { pos: [2000, 1500], props: { type: 'hood', no: 4 } }));
    const range = addItem(store, createItem(productById('range-gas-high'), { pos: [2000, 1500] }));
    const el = document.createElement('div'); document.body.appendChild(el);
    createPropsPanel(el, store, ui);
    ui.set({ selection: { type: 'item', id: range } });
    const opts = [...el.querySelectorAll('select[name="eqHoodId"] option')].map(o => [o.value, o.textContent]);
    expect(opts).toEqual([['', '없음'], [hood, '후드 ④']]);      // 번호 대신 원문자(중복 번호를 눈으로 구별한다)
    updateRoom(store, activeFloor(store.get()).rooms[0].id, { name: '가열조리실' });
    const named = [...el.querySelectorAll('select[name="eqHoodId"] option')].map(o => o.textContent);
    expect(named).toEqual(['없음', '후드 ④ · 가열조리실']);      // 방 이름 병기(§12.5)
    const s = el.querySelector('select[name="eqHoodId"]');
    s.value = hood; s.dispatchEvent(new Event('change', { bubbles: true }));
    expect(activeFloor(store.get()).items.find(i => i.id === range).props.hoodId).toBe(hood);
  });

  test('잠긴 설비는 편집되지 않고, 설비가 아닌 제품에는 섹션이 없다', () => {
    const { store, item, change } = setup('hood-box', { locked: true });
    change('eqNo', 9);
    expect(item().props.no).toBe(1);
    expect(equipRowsHtml(createItem(productById('sofa-3'), {}), {})).toBe('');
  });

  test('편집 한 칸이 되돌림 한 단계다', () => {
    const { store, item, change } = setup('hood-box');
    change('eqFaceVelocity', 0.7);
    store.undo();
    expect(item().props.faceVelocity).toBe(0.5);
    expect(item().props.cmh).toBe(3456);
  });
});

describe('방의 설계 풍량', () => {
  test('두 칸을 고치면 room.design이 바뀐다', () => {
    const store = createStore(createEmptyProject());
    const ui = createUiState();
    addWalls(store, rectWalls([0, 0], [8000.5, 6000.25], 200));
    const room = activeFloor(store.get()).rooms[0];
    updateRoom(store, room.id, { name: '가열조리실' });
    const el = document.createElement('div'); document.body.appendChild(el);
    createPropsPanel(el, store, ui);
    ui.set({ selection: { type: 'room', id: room.id } });
    expect(el.textContent).toContain('설계 풍량');
    const ea = el.querySelector('input[name="designEA"]');
    ea.value = '32641'; ea.dispatchEvent(new Event('change', { bubbles: true }));
    const sa = el.querySelector('input[name="designSA"]');
    sa.value = '24000'; sa.dispatchEvent(new Event('change', { bubbles: true }));
    expect(activeFloor(store.get()).rooms[0].design).toEqual({ EA: 32641, SA: 24000 });
    store.undo();
    expect(activeFloor(store.get()).rooms[0].design).toEqual({ EA: 32641, SA: 0 });
  });

  test('roomDesignRowsHtml은 요약을 주면 함께 찍는다', () => {
    const html = roomDesignRowsHtml({ design: { EA: 100, SA: 50 } }, { EA: 90, SA: 60, ratio: 66.7 });
    expect(html).toContain('설계 풍량');
    expect(html).toContain('90');
    expect(html).toContain('66.7');
    expect(roomDesignRowsHtml({ design: { EA: 0, SA: 0 } })).not.toContain('현재');
  });

  test('applyVentField는 자기 필드가 아니면 false를 돌려준다', () => {
    const store = createStore(createEmptyProject());
    const ui = createUiState();
    expect(applyVentField(store, ui, null, { name: 'thickness' })).toBe(false);
    expect(applyVentField(store, ui, null, { name: 'eqNo' })).toBe(true);
  });
});
