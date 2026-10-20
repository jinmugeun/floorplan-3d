// @vitest-environment jsdom
// 속성 패널의 제품 정보 행(계획 17 Task 4): 엑셀 급식기구의 업체·모델명·식별번호·전기·가스·급배수(읽기 전용) · 단종/도면 기구 안내 + [제품 교체].
import { test, expect, afterEach } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, createItem, activeFloor } from '../src/state/schema.js';
import { addItem } from '../src/state/floorOps.js';
import { productById, PRODUCTS } from '../src/products/catalog.js';
import { createPropsPanel } from '../src/ui/propsPanel.js';
import { productRowsHtml, elecText, waterText } from '../src/ui/productRows.js';
import { PRODUCT_LEGACY_NOTE, PRODUCT_DRAWN_NOTE, PRODUCT_REPLACE } from '../src/ui/messages.js';

const RICE = 'k-25279008';    // 전기 인덕션 취반기 · 선경인케이 · SKK-CB2100 · 4P 380V 7 kW
// document.body에 붙인 속성 패널은 테스트가 실패해도 떼어 낸다(다음 테스트로 구독·노드가 새지 않게).
const cleanups = [];
afterEach(() => { while (cleanups.length) cleanups.pop()(); });

test('전기·급배수 글자는 0·없음을 빼고 잇는다', () => {
  expect(elecText([0, 6.2, 0])).toBe('3P 380V 6.2 kW');
  expect(elecText([1.5, 0, 24])).toBe('1P 220V 1.5 kW · 4P 380V 24 kW');
  expect(elecText([0, 0, 0])).toBe('');
  expect(waterText([true, false, true])).toBe('냉수 · 배수');
  expect(waterText([])).toBe('');
});

test('엑셀 제품은 업체·모델명·식별번호·전기 행을 내고 값 없는 행(가스·급배수)은 내지 않는다', () => {
  const html = productRowsHtml(productById(RICE));
  for (const s of ['업체', '선경인케이', '모델명', 'SKK-CB2100', '식별번호', '25279008', '전기', '4P 380V 7 kW']) expect(html).toContain(s);
  expect(html).not.toContain('가스');
  expect(html).not.toContain('급배수');
  expect(html).not.toContain('productReplace');
});

// 행을 [이름, 값] 쌍으로 읽는다(field() 마크업에 묶이지 않게 DOM으로 푼다).
const rowsOf = html => { const d = document.createElement('div'); d.innerHTML = html; return [...d.querySelectorAll('label.field')].map(l => [l.querySelector('span').textContent, l.querySelector('output').textContent]); };

test('가스 kW와 급배수(냉수·온수·배수) 행은 값이 있을 때만 그 글자로 나온다', () => {
  const p = { id: 'x-gas', extra: { vendor: '가업체', model: 'G-1', kid: '123', util: { elec: [0, 0, 0], gas: 12.5, water: [true, false, true] } } };
  expect(rowsOf(productRowsHtml(p))).toEqual([['업체', '가업체'], ['모델명', 'G-1'], ['식별번호', '123'], ['가스', '12.5 kW'], ['급배수', '냉수 · 배수']]);
  // 카탈로그의 실제 가스·급배수 제품(엑셀이 바뀌어도 따라오게 처음 것을 고른다).
  const real = PRODUCTS.find(x => !x.hidden && Number(x.extra?.util?.gas) > 0 && x.extra.util.water?.some(Boolean));
  const rows = new Map(rowsOf(productRowsHtml(real)));
  expect(rows.get('가스')).toBe(`${Number(real.extra.util.gas)} kW`);
  expect(rows.get('급배수')).toBe(waterText(real.extra.util.water));
  expect(rows.get('급배수')).not.toBe('');
});

test('숨김 단종 제품과 도면 기구는 안내 한 줄과 [제품 교체] 버튼이다 · 남는 기존 제품은 아무것도 내지 않는다', () => {
  const legacy = productRowsHtml(productById('sink-double'));
  expect(legacy).toContain(PRODUCT_LEGACY_NOTE);
  expect(legacy).toContain('name="productReplace"');
  expect(legacy).toContain(PRODUCT_REPLACE);
  const drawn = productRowsHtml(productById('equip-generic'));
  expect(drawn).toContain(PRODUCT_DRAWN_NOTE);
  expect(drawn).toContain('name="productReplace"');
  expect(productRowsHtml(productById('door-swing-900'))).toBe('');
  expect(productRowsHtml(null)).toBe('');
});

test('속성 패널: 엑셀 제품을 고르면 행이 보이고, 단종 제품의 [제품 교체]는 itemActions.replace를 부른다', () => {
  const store = createStore(createEmptyProject()), ui = createUiState(), calls = [];
  const el = document.createElement('div'); document.body.appendChild(el);
  const panel = createPropsPanel(el, store, ui, { itemActions: { replace: () => calls.push('replace') } });
  cleanups.push(() => { panel.destroy(); el.remove(); });
  addItem(store, createItem(productById(RICE), { pos: [1000, 1000] }));
  addItem(store, createItem(productById('sink-double'), { pos: [3000, 1000] }));
  const [rice, sink] = activeFloor(store.get()).items;
  ui.set({ selection: { type: 'item', id: rice.id } });
  expect(el.textContent).toContain('선경인케이');
  expect(el.querySelector('button[name="productReplace"]')).toBeNull();
  ui.set({ selection: { type: 'item', id: sink.id } });
  expect(el.textContent).toContain(PRODUCT_LEGACY_NOTE);
  el.querySelector('button[name="productReplace"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(calls).toEqual(['replace']);
});
