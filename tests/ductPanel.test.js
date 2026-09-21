// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { addDuct, ductById } from '../src/state/ductOps.js';
import { productById } from '../src/products/catalog.js';
import { rectWalls } from '../src/geom/walls.js';
import { createPropsPanel } from '../src/ui/propsPanel.js';
import { ductPanelHtml, applyDuctField } from '../src/ui/ductPanel.js';

function setup() {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [10000, 8000], 200));
  const hood = addItem(store, createItem(productById('hood-box'), { pos: [2000, 1500], z: 2300, props: { type: 'hood', no: 5 } }));
  const id = addDuct(store, {
    id: 'd1', kind: 'exhaust', system: 'F-3', points: [[2000, 1500], [8000.5, 1500], [8000.5, 6000]],
    segments: [{ w: 1000, h: 450, z: 2625 }, { w: 800, h: 450, z: 2625 }],
    connections: [{ point: 0, itemId: hood }], dampers: [{ segment: 1, t: 0.5, type: 'VD', w: 550, h: 450 }],
  });
  const el = document.createElement('div');
  document.body.appendChild(el);
  createPropsPanel(el, store, ui);
  ui.set({ selection: { type: 'duct', id, segment: 0, vertex: null } });
  const duct = () => ductById(activeFloor(store.get()), id);
  const change = (name, value, kind = 'value') => {
    const input = el.querySelector(`[name="${name}"]`);
    if (kind === 'checked') input.checked = value; else input.value = String(value);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const click = selector => el.querySelector(selector).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return { store, ui, el, id, hood, duct, change, click };
}

describe('덕트 패널', () => {
  test('종류·계통·총 길이·구간 목록·댐퍼·연결을 보여 준다', () => {
    const { el } = setup();
    expect(el.textContent).toContain('덕트 상세 정보');
    expect(el.querySelector('select[name="ductKind"]').value).toBe('exhaust');
    expect(el.querySelector('input[name="ductSystem"]').value).toBe('F-3');
    expect(el.querySelector('output[name="ductLength"]').textContent).toContain('10501');  // 6000.5 + 4500 → 10501 mm(반올림)
    expect(el.querySelectorAll('.duct-segs li')).toHaveLength(2);
    expect(el.querySelector('.duct-segs li').classList.contains('on')).toBe(true);
    expect(el.textContent).toContain('VD · 2구간 50%');                 // 종류·구간·위치는 글자로
    expect(el.querySelector('input[name="damperW"]').value).toBe('550'); // 크기는 입력 칸으로(DT-06)
    expect(el.querySelector('input[name="damperH"]').value).toBe('450');
    // 연결 줄은 "{제품 이름} {라벨}"이다: hood-box의 이름은 '천장형 배기 후드(박스형)'이고 라벨은 '⑤'다.
    expect(el.textContent).toContain('천장형 배기 후드(박스형) ⑤');
    expect(el.querySelector(`[name="ductDisconnect"]`).dataset.p).toBe('0');
    expect(el.querySelector('[name="ductDisconnect"]').closest('li').textContent).toContain('1번 점');
  });

  test('선택 구간의 W·H·Z를 고치고, "모든 구간에 적용"이 나머지에도 퍼뜨린다(DT-04)', () => {
    const { duct, change, click } = setup();
    change('segW', 900);
    change('segH', 500);
    change('segZ', 2500);
    expect(duct().segments[0]).toEqual({ w: 900, h: 500, z: 2500 });
    expect(duct().segments[1]).toEqual({ w: 800, h: 450, z: 2625 });
    click('[name="segAll"]');
    expect(duct().segments[1]).toEqual({ w: 900, h: 500, z: 2500 });
  });

  test('구간 버튼이 선택 구간을 바꾼다', () => {
    const { ui, el, click } = setup();
    click('.duct-segs li:nth-child(2) [name="ductSeg"]');
    expect(ui.get().selection).toEqual({ type: 'duct', id: 'd1', segment: 1, vertex: null });
    expect(el.querySelector('input[name="segW"]').value).toBe('800');
  });

  test('댐퍼 종류 전환·크기 편집·삭제, 연결 해제, 덕트 삭제', () => {
    const { ui, duct, change, click } = setup();
    click('[name="damperType"]');
    expect(duct().dampers[0].type).toBe('FVD');
    change('damperW', 600);
    expect(duct().dampers[0].w).toBe(600);
    change('damperH', 500);
    expect(duct().dampers[0].h).toBe(500);
    click('[name="ductDisconnect"]');
    expect(duct().connections).toEqual([]);
    click('[name="damperDelete"]');
    expect(duct().dampers).toEqual([]);
    click('[name="ductDelete"]');
    expect(duct()).toBeNull();
    expect(ui.get().selection).toBeNull();
  });

  test('급기/배기 전환과 잠금·숨김 체크박스', () => {
    const { duct, change } = setup();
    change('ductKind', 'supply');
    expect(duct().kind).toBe('supply');
    change('ductHidden', true, 'checked');
    expect(duct().hidden).toBe(true);
    change('ductLocked', true, 'checked');
    expect(duct().locked).toBe(true);
    change('segW', 600);
    expect(duct().segments[0].w).toBe(1000);                  // 잠긴 덕트는 편집되지 않는다
    change('damperW', 600);
    expect(duct().dampers[0].w).toBe(550);                    // 댐퍼 크기도 잠금에 막힌다
  });

  test('"댐퍼 추가"가 고른 구간 가운데에 댐퍼를 하나 더한다(DT-06)', () => {
    const { ui, duct, click } = setup();
    click('[name="damperAdd"]');
    expect(duct().dampers).toHaveLength(2);
    const added = duct().dampers.find(x => x.segment === 0);
    expect(added).toMatchObject({ segment: 0, t: 0.5, type: 'VD', w: 1000, h: 450 });  // 고른 구간의 단면을 물려받는다
    ui.set({ selection: { type: 'duct', id: 'd1', segment: 1, vertex: null } });
    click('[name="damperAdd"]');
    expect(duct().dampers.filter(x => x.segment === 1)).toHaveLength(2);
  });

  test('ductPanelHtml은 없는 덕트에 빈 문자열, applyDuctField는 남의 필드에 false', () => {
    const { store, duct } = setup();
    expect(ductPanelHtml(activeFloor(store.get()), { type: 'duct', id: '없음' })).toBe('');
    expect(ductPanelHtml(activeFloor(store.get()), null)).toBe('');
    expect(applyDuctField(store, { type: 'duct', id: duct().id }, { name: 'thickness' })).toBe(false);
  });
});

// §15.14(감사 §20): 댐퍼 추가·삭제에 피드백이 전혀 없고, 행에 위치(거리)도 없었다.
test('댐퍼 추가·삭제가 토스트를 띄우고 행이 위치를 보여 준다', () => {
  const a = setup();
  a.click('[name="damperAdd"]');                        // 고른 구간은 0번 → "1구간"
  let texts = [...document.querySelectorAll('.toast')].map(t => t.textContent);
  expect(texts.at(-1)).toBe('1구간에 댐퍼를 추가했습니다');
  // setup()이 이미 2구간 댐퍼 하나를 갖고 있으므로 방금 붙은 줄을 글자로 찾는다.
  const rows = [...a.el.querySelectorAll('.duct-dampers li')].map(li => li.textContent);
  expect(rows.some(t => t.includes('1구간') && /50%/.test(t) && /3000/.test(t))).toBe(true);
  a.click('[name="damperDelete"]');
  texts = [...document.querySelectorAll('.toast')].map(t => t.textContent);
  expect(texts.at(-1)).toBe('댐퍼를 삭제했습니다');
});
