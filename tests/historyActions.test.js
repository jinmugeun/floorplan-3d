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
  // §17.7 표의 첫 두 줄을 여기서 못 박는다(리뷰 m-3): setup이 깨졌을 때 엉뚱한 단정에서 실패하지 않게.
  expect(ctx.store.get().activeFloor).toBe(1);
  expect(posOf(ctx.store)).toEqual([1111, 2222]);
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

// 리뷰 I-1(§16.4 보증의 회귀): 층 내용을 하나도 바꾸지 않으면서 기록되는 **프로젝트 수준 단계**가
// 있다(프로젝트 이름 변경 · 배경 도면 삽입·제거). 그 단계의 되돌리기·다시 실행도 스냅숏의
// activeFloor로 화면을 옮기므로, 부를 "변경 층"이 없다고 조용히 넘어가면 §16.4가 막으려던
// "화면이 말없이 다른 층으로 넘어갔다"가 이 경로에서만 되살아난다 — 양쪽 다 도착한 층을 부른다.
test('프로젝트 수준 단계의 층 간 되돌리기·다시 실행도 도착한 층을 부른다(리뷰 I-1)', () => {
  const { store, toasts, h } = mk();
  addFloor(store, { name: '2층', copy: 'none' });             // 활성 층 = 1
  store.dispatch(d => { d.name = '강당중 조리실'; });           // main.js의 프로젝트 이름 변경과 같은 단계
  setActiveFloor(store, 0);                                    // 층 바에서 1층으로
  expect(h.undoAction()).toBe(true);
  expect(store.get().activeFloor).toBe(1);                     // 스냅숏이 화면을 2층으로 옮긴다
  expect(store.get().name).toBe('새 프로젝트');
  expect(toasts).toEqual(['다른 층(2층)의 변경을 되돌렸습니다']);
  toasts.length = 0;
  expect(h.redoAction()).toBe(true);
  expect(store.get().activeFloor).toBe(0);                     // 다시 실행의 스냅숏은 1층을 들고 있다
  expect(store.get().name).toBe('강당중 조리실');
  expect(toasts).toEqual(['다른 층(Floor 1)의 변경을 다시 실행했습니다']);
});

// 리뷰 I-2: 층을 가로지르는 다시 실행은 "스냅숏 설치 + 활성 층 이동"이 한 동작이다. 알림이 두 번
// 나가면 3D가 씬을 두 번 짓고(씬 서명에 activeFloor가 들어 있다) 그중 첫 번째는 사용자가 곧 떠날
// 층이라 순수 낭비다. 알림 수는 이 배선이 지켜야 할 계약이라 여기서 센다.
test('층 간 되돌리기·다시 실행은 구독자에게 정확히 한 번씩만 알린다(리뷰 I-2)', () => {
  const { store, h } = setup();
  let calls = 0;
  const off = store.subscribe(() => calls++);
  expect(h.undoAction()).toBe(true);
  expect(calls).toBe(1);
  expect(h.redoAction()).toBe(true);
  expect(calls).toBe(2);                                       // 활성 층 이동이 두 번째 알림을 내지 않는다
  expect(store.get().activeFloor).toBe(1);
  expect(posOf(store)).toEqual([1111, 2222]);
  off();
});

// 리뷰 m-4: 활성 층 덧쓰기가 기록이 아니라는 성질이 이 기능의 생명줄이다 — 기록이 되는 순간
// future가 비워져 두 번째 다시 실행이 죽는다. 층 간 단계 둘을 쌓아 왕복으로 못 박는다.
test('층 간 단계 둘을 되돌리고 둘 다 다시 실행한다(활성 층 이동이 스택을 지우지 않는다)', () => {
  const { store, toasts, h } = mk();
  addFloor(store, { name: '2층', copy: 'none' });
  const id = addItem(store, createItem(productById('hood-box'), { pos: [7650, 18800] }));
  updateItem(store, id, { pos: [1111, 2222] });
  updateItem(store, id, { pos: [3333, 4444] });
  setActiveFloor(store, 0);
  expect(h.undoAction()).toBe(true);
  expect(h.undoAction()).toBe(true);
  expect(posOf(store)).toEqual([7650, 18800]);
  toasts.length = 0;
  expect(h.redoAction()).toBe(true);
  expect(posOf(store)).toEqual([1111, 2222]);
  expect(h.redoAction()).toBe(true);                           // 층 이동이 future를 지웠다면 여기서 false다
  expect(posOf(store)).toEqual([3333, 4444]);
  expect(store.get().activeFloor).toBe(1);
  expect(store.canRedo()).toBe(false);
  expect(toasts).toEqual(['다른 층(2층)의 변경을 다시 실행했습니다']);
});
