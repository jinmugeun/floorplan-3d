// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem, updateRoom } from '../src/state/floorOps.js';
import { productById } from '../src/products/catalog.js';
import { rectWalls } from '../src/geom/walls.js';
import { addDuct } from '../src/state/ductOps.js';
import { createAirflowPanel } from '../src/ui/airflowPanel.js';
import { createPropsPanel } from '../src/ui/propsPanel.js';

function setup() {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [6000.5, 5000.25], 200));
  const room = activeFloor(store.get()).rooms[0].id;
  updateRoom(store, room, { name: '가열조리실', design: { EA: 5000, SA: 4000 } });
  addItem(store, createItem(productById('hood-box'), { pos: [2000, 2000], size: [1800, 1100, 600], props: { type: 'hood', no: 1, faceVelocity: 0.7, system: 'F-4' } }));
  addDuct(store, { system: 'F-4', points: [[2000, 2000], [5000, 2000]], segments: [{ w: 800, h: 500, z: 2600 }] });
  const el = document.createElement('div');
  document.body.appendChild(el);
  const panel = createAirflowPanel(el, { store, ui });
  return { store, ui, el, panel, room };
}

describe('풍량 패널', () => {
  test('실별 표와 계통별 표를 그리고 합계를 적는다', () => {
    const { el } = setup();
    expect(el.textContent).toContain('실별 풍량');
    expect(el.textContent).toContain('가열조리실');
    expect(el.textContent).toContain('4,990');
    expect(el.textContent).toContain('계통별 풍량');
    expect(el.textContent).toContain('F-4');
    expect(el.textContent).toContain('합계 배기 4,990');
  });

  test('설계와 5% 이상 차이 나는 칸에 warn 클래스가 붙는다', () => {
    const { store, el, room } = setup();
    expect(el.querySelectorAll('td.warn').length).toBeGreaterThan(0);   // 4990 vs 설계 5000은 0.2% → SA(0 vs 4000)가 걸린다
    updateRoom(store, room, { design: { EA: 4990, SA: 0 } });
    expect(el.querySelectorAll('td.warn')).toHaveLength(0);
  });

  test('스토어가 바뀌면 바로 다시 센다', () => {
    const { store, el } = setup();
    addItem(store, createItem(productById('diffuser-650'), { pos: [4000, 3000], props: { type: 'diffuser', symbol: '가', flow: 'supply', a: 650, b: 650, cmh: 3200 } }));
    expect(el.textContent).toContain('3,200');
    expect(el.textContent).toContain('합계 배기 4,990 · 급기 3,200');
  });

  test('실별 표의 줄을 누르면 그 방이 선택된다', () => {
    const { ui, el, room } = setup();
    el.querySelector(`tr[data-room="${room}"] td`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(ui.get().selection).toEqual({ type: 'room', id: room });
  });


  test('실별 표는 4열이고 설계값은 실측값 아래 작은 글씨로 들어간다', () => {
    const { el } = setup();
    const first = el.querySelectorAll('table')[0];
    const th = [...first.querySelectorAll('thead th')];
    expect(th).toHaveLength(4);                                   // 240 px 레일에 들어가야 한다
    expect(th.map(t => t.textContent)).toEqual(['공간', 'EA', 'SA', '급기율']);
    const row = el.querySelector('tr[data-room]');
    expect(row.children).toHaveLength(4);
    expect(row.children[1].querySelector('small').textContent).toBe('설계 5,000');
    expect(row.children[2].querySelector('small').textContent).toBe('설계 4,000');
    expect(el.querySelectorAll('.air-wrap')).toHaveLength(2);     // 두 표 모두 가로 스크롤 감싸개 안에
  });

  test('어느 공간에도 들지 않는 설비는 "미배치" 줄로 보이고 클릭 대상이 아니다', () => {
    const { store, el } = setup();
    addItem(store, createItem(productById('diffuser-650'), { pos: [50000, 50000], props: { type: 'diffuser', symbol: '가', flow: 'supply', a: 650, b: 650, cmh: 3200 } }));
    const row = [...el.querySelectorAll('tbody tr')].find(r => r.textContent.includes('미배치'));
    expect(row).toBeTruthy();
    expect(row.dataset.room).toBeUndefined();                     // 선택할 방이 없다
    expect(row.textContent).toContain('설계 -');
    expect(el.textContent).toContain('합계 배기 4,990 · 급기 3,200');
  });

  test('destroy가 구독을 끊고 비운다', () => {
    const { store, el, panel } = setup();
    panel.destroy();
    expect(el.innerHTML).toBe('');
    addItem(store, createItem(productById('diffuser-650'), { pos: [4000, 3000] }));
    expect(el.innerHTML).toBe('');
  });

  test('방 속성 패널이 현재 합계와 급기율을 함께 보여 준다', () => {
    const { store, ui, room } = setup();
    const el = document.createElement('div');
    document.body.appendChild(el);
    createPropsPanel(el, store, ui);
    ui.set({ selection: { type: 'room', id: room } });
    expect(el.querySelector('output[name="nowEA"]').textContent).toBe('4,990');
    expect(el.querySelector('output[name="nowSA"]').textContent).toBe('0');
    expect(el.querySelector('output[name="nowRatio"]').textContent).toBe('0.0%');
  });
});

// §17.12 이월(감사 §19): "값이 없다"와 "값이 0이다"를 가른다 — 설계값이 없는 방을 붉게 칠하지 않는다.
// 이 파일의 setup()은 설계값이 있는 방을 만든다(EA 5000 · SA 4000) → 없는 방을 따로 만든다.
test('설계값이 없는 방은 "설계 -"로 찍고 붉게 칠하지 않는다', () => {
  const store = createStore(createEmptyProject()), ui = createUiState();
  addWalls(store, rectWalls([0.5, 0.25], [6000.5, 5000.25], 200));
  const room = activeFloor(store.get()).rooms[0].id;
  updateRoom(store, room, { name: '비가열조리실' });                       // design은 0이 기본이다
  addItem(store, createItem(productById('hood-box'), { pos: [2000.5, 2000.25], props: { type: 'hood', no: 1, faceVelocity: 0.7, system: 'F-4' } }));
  const el = document.createElement('div');
  document.body.appendChild(el);
  createAirflowPanel(el, { store, ui });
  expect(el.innerHTML).toContain('설계 -');
  expect(el.innerHTML).not.toContain('설계 0');
  expect(el.querySelectorAll('td.warn')).toHaveLength(0);                 // 견줄 값이 없으면 붉게 칠하지 않는다
  // 설계값이 있는 방은 예전 그대로다(기존 setup의 방).
  const a = setup();
  expect(a.el.innerHTML).toContain('설계 5,000');
});
