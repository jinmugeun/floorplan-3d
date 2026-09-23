// §17.7(감사 §53): 층을 가로지르는 되돌리기·다시 실행의 배선. 예전에는 main.js 두 줄이라
// 소스 문자열로만 단정할 수 있었다(계획 8 이월) — 모듈로 내려 실제로 돌린다.
import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, createItem } from '../src/state/schema.js';
import { addFloor, setActiveFloor, addItem, updateItem } from '../src/state/floorOps.js';
import { productById } from '../src/products/catalog.js';
import { createHistoryActions } from '../src/app/historyActions.js';

const mk = () => {
  const toasts = [];
  const store = createStore(createEmptyProject());
  return { store, toasts, h: createHistoryActions({ store, toast: m => toasts.push(m) }) };
};

// 감사 §53의 표를 그대로 만든다: 2층 추가 → 2층에서 제품 이동 → 층 바에서 1층 전환.
function setup() {
  const ctx = mk();
  addFloor(ctx.store, { name: '2층', copy: 'none' });                 // 활성 층 = 1
  const id = addItem(ctx.store, createItem(productById('hood-box'), { pos: [7650, 18800] }));
  updateItem(ctx.store, id, { pos: [1111, 2222] });
  setActiveFloor(ctx.store, 0);                                        // 층 바 전환(기록하지 않는다)
  return { ...ctx, id };
}
const posOf = store => store.get().floors[1].items[0].pos;

test('되돌리기는 다른 층의 변경을 알리고 활성 층은 스냅숏이 옮긴다', () => {
  const { store, toasts, h } = setup();
  expect(store.get().activeFloor).toBe(0);
  expect(h.undoAction()).toBe(true);
  expect(store.get().activeFloor).toBe(1);
  expect(posOf(store)).toEqual([7650, 18800]);
  expect(toasts).toEqual(['다른 층(2층)의 변경을 되돌렸습니다']);
});

test('다시 실행은 변경이 있던 층으로 데려가고 그 층 이름을 부른다(감사 §53 표)', () => {
  const { store, toasts, h } = setup();
  h.undoAction();
  toasts.length = 0;
  expect(h.redoAction()).toBe(true);
  expect(store.get().activeFloor).toBe(1);                 // 1층으로 끌려가지 않는다(예전 결함)
  expect(posOf(store)).toEqual([1111, 2222]);
  expect(toasts).toEqual(['다른 층(2층)의 변경을 다시 실행했습니다']);
  // 활성 층 이동은 { record: false }라 되돌리기 스택에 단계를 더하지 않는다.
  expect(store.canUndo()).toBe(true);
  h.undoAction();
  expect(posOf(store)).toEqual([7650, 18800]);
});

test('같은 층 안의 변경에는 토스트가 없다', () => {
  const { store, toasts, h } = mk();
  const id = addItem(store, createItem(productById('hood-box'), { pos: [1000, 1000] }));
  updateItem(store, id, { pos: [2000.5, 1500.25] });
  expect(h.undoAction()).toBe(true);
  expect(h.redoAction()).toBe(true);
  expect(store.get().activeFloor).toBe(0);
  expect(toasts).toEqual([]);
});

test('층을 더하거나 지운 단계의 되돌리기·다시 실행은 층 간 변경이 아니다', () => {
  const { store, toasts, h } = mk();
  addFloor(store, { name: '2층', copy: 'none' });
  expect(h.undoAction()).toBe(true);
  expect(store.get().floors).toHaveLength(1);
  expect(h.redoAction()).toBe(true);
  expect(store.get().floors).toHaveLength(2);
  expect(store.get().activeFloor).toBe(1);
  expect(toasts).toEqual([]);
});

test('되돌릴 것이 없으면 false를 돌려주고 토스트도 없다', () => {
  const { toasts, h } = mk();
  expect(h.undoAction()).toBe(false);
  expect(h.redoAction()).toBe(false);
  expect(toasts).toEqual([]);
});
