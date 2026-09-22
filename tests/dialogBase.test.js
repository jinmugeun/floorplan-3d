// @vitest-environment jsdom
// focusTrap의 어려운 경우들(§15.10 · Task 10 리뷰 Important 1·중첩·Nit 1):
// ① 대화상자가 자기 안쪽을 다시 그려 포커스를 갖던 요소가 사라져도 트랩이 살아 있다,
// ② 모달 위에 confirm이 겹치면 안쪽 트랩이 [Tab]을 갖고 닫으면 바깥이 되살아난다,
// ③ 모달 밖(팝오버 등)에 포커스가 있으면 트랩이 끼어들지 않는다,
// ④ destroy()를 두 번 불러도 포커스를 다시 빼앗지 않는다.
import { test, expect, beforeEach } from 'vitest';
import { focusTrap } from '../src/ui/dialogBase.js';
import { confirmDialog } from '../src/ui/confirmDialog.js';
import { createKeyHandler } from '../src/ui/keymap.js';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject } from '../src/state/schema.js';

const tab = (target, shiftKey = false) => {
  const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev;
};
const esc = target => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

// 안쪽 그리드를 다시 그리는 대화상자(갤러리와 같은 구조).
function makeDialog(id = 'd1') {
  const root = document.createElement('div');
  root.className = `modal ${id}`;
  root.innerHTML = '<button name="close">✕</button><div data-part="grid"><button name="del">삭제</button></div>';
  document.body.appendChild(root);
  let escaped = 0;
  root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); escaped++; } });
  return { root, rerender: () => { root.querySelector('[data-part="grid"]').innerHTML = '<p>비었습니다</p>'; }, escapes: () => escaped };
}

beforeEach(() => { document.body.innerHTML = ''; });

test('재렌더로 포커스를 갖던 요소가 사라져도 [Tab]이 안에 갇힌다', () => {
  const { root, rerender } = makeDialog();
  const trap = focusTrap(root, { focus: '[name="del"]' });
  expect(document.activeElement).toBe(root.querySelector('[name="del"]'));
  rerender();                                        // 방금 누른 버튼이 사라진다
  expect(document.activeElement).toBe(document.body); // 포커스가 모달 밖(body)으로 떨어졌다
  const ev = tab(document.body);                      // 이 키는 root를 지나가지 않는다
  expect(ev.defaultPrevented).toBe(true);
  expect(root.contains(document.activeElement)).toBe(true);
  trap.destroy();
});

test('재렌더로 포커스가 사라진 뒤에도 첫 [Esc]가 대화상자에 닿는다', () => {
  const d = makeDialog();
  const trap = focusTrap(d.root, { focus: '[name="del"]' });
  d.rerender();
  expect(document.activeElement).toBe(document.body);
  esc(document.body);
  expect(d.escapes()).toBe(1);                        // root의 Escape 핸들러가 살아 있다
  expect(d.root.contains(document.activeElement)).toBe(true);   // 포커스도 안으로 되돌아왔다
  trap.destroy();
});

test('모달 밖(팝오버 등)에 포커스가 있으면 트랩이 [Tab]을 가로채지 않는다', () => {
  const { root } = makeDialog();
  const outside = document.createElement('div');
  outside.innerHTML = '<button id="p1">항목</button>';
  document.body.appendChild(outside);
  const trap = focusTrap(root, { focus: '[name="close"]' });
  const p1 = outside.querySelector('#p1');
  p1.focus();
  const ev = tab(p1);
  expect(ev.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(p1);            // 모달이 포커스를 빼앗지 않는다
  trap.destroy();
});

test('모달 위에 confirm이 겹치면 안쪽이 [Tab]을 갖고 닫으면 바깥이 되살아난다', async () => {
  const { root } = makeDialog();
  const trap = focusTrap(root, { focus: '[name="close"]' });
  const opener = root.querySelector('[name="close"]');
  const promise = confirmDialog({ title: '삭제', message: '지울까요?' });
  const confirm = document.querySelector('.modal.confirm');
  expect(confirm.contains(document.activeElement)).toBe(true);
  // 안쪽 트랩만 돈다(바깥 root의 버튼으로 새지 않는다).
  tab(document.activeElement);
  expect(confirm.contains(document.activeElement)).toBe(true);
  // 포커스가 body로 떨어져 두 트랩이 모두 "내 차례"인 상황에서도 안쪽이 이긴다.
  document.activeElement.blur();
  expect(document.activeElement).toBe(document.body);
  tab(document.body);
  expect(confirm.contains(document.activeElement)).toBe(true);
  expect(root.contains(document.activeElement)).toBe(false);
  // Esc로 안쪽을 닫으면 포커스가 바깥 모달로 돌아오고 바깥 트랩이 다시 [Tab]을 받는다.
  esc(document.activeElement);
  await expect(promise).resolves.toBe(false);
  expect(document.querySelector('.modal.confirm')).toBeNull();
  expect(document.activeElement).toBe(opener);
  const ev = tab(opener);
  expect(ev.defaultPrevented).toBe(true);
  expect(root.contains(document.activeElement)).toBe(true);
  trap.destroy();
});

test('destroy()를 두 번 불러도 이미 옮겨 간 포커스를 되빼앗지 않는다', () => {
  const opener = document.createElement('button'); document.body.appendChild(opener);
  const later = document.createElement('button'); document.body.appendChild(later);
  opener.focus();
  const { root } = makeDialog();
  const trap = focusTrap(root, { focus: '[name="close"]' });
  trap.destroy();
  expect(document.activeElement).toBe(opener);
  later.focus();
  trap.destroy();                                     // 두 번째 호출은 아무것도 하지 않는다
  expect(document.activeElement).toBe(later);
});

// 최종 리뷰 I-1: 대화상자들은 자기 root에서 Escape만 stopPropagation하므로 l·d·Delete·Shift+F10이
// window의 전역 단축키까지 새어 모달 뒤의 도면을 바꿨다(d·Delete는 선택한 제품을 조용히 지웠고
// Shift+F10은 컨텍스트 메뉴를 모달 위에 띄워 Tab 트랩까지 풀었다). 정한 것 32가 약속한 것을 지킨다.
test('모달이 열려 있는 동안 전역 단축키가 window까지 새지 않는다', () => {
  const d = makeDialog();
  const calls = { tool: [], del: 0, menu: 0 };
  const handler = createKeyHandler({
    store: createStore(createEmptyProject()), ui: createUiState(), view: { tool: null, requestRender: () => {} },
    setTool: n => calls.tool.push(n), setMode: () => {}, openBackground: () => {},
    deleteSelection: () => { calls.del += 1; }, deleteOrTool: () => calls.tool.push('delete'),
    contextMenu: () => { calls.menu += 1; return true; },
  });
  window.addEventListener('keydown', handler);
  try {
    const trap = focusTrap(d.root, { focus: '[name="close"]' });
    const focused = d.root.querySelector('[name="close"]');
    expect(document.activeElement).toBe(focused);
    for (const [key, extra] of [['l', {}], ['d', {}], ['Delete', {}], ['F10', { shiftKey: true }]]) {
      focused.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }));
    }
    expect(calls).toEqual({ tool: [], del: 0, menu: 0 });
    esc(focused);                                       // 대화상자 자신의 root 핸들러는 그대로 먼저 돈다
    expect(d.escapes()).toBe(1);
    trap.destroy();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true, cancelable: true }));
    expect(calls.tool).toEqual(['wall']);               // 트랩을 거두면 같은 키가 다시 전역으로 간다
  } finally { window.removeEventListener('keydown', handler); }
});

// 최종 리뷰 I-2: 재발송한 이벤트는 bubbles:true라 같은 캡처 리스너를 다시 지나간다 — 포커스를
// 되돌릴 자리가 없으면 영원히 재발송해 스택 오버플로(페이지 사망)가 났다.
test('포커스 가능한 요소가 없는 트랩은 키를 재발송하지 않는다', () => {
  const root = document.createElement('div');
  root.className = 'modal empty';
  root.innerHTML = '<p>포커스 가능한 요소가 없습니다</p>';
  document.body.appendChild(root);
  let seen = 0, global = 0;
  root.addEventListener('keydown', () => { seen += 1; });
  const onWindow = () => { global += 1; };
  window.addEventListener('keydown', onWindow);
  try {
    const trap = focusTrap(root);
    expect(document.activeElement).toBe(document.body);   // 되돌릴 자리가 없다
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(seen).toBe(0);                                 // 재발송이 없다(예전에는 여기서 무한 재귀였다)
    expect(global).toBe(0);                               // 그래도 키는 모달 뒤로 새지 않는다
    trap.destroy();
  } finally { window.removeEventListener('keydown', onWindow); }
});

test('떼어낸 root의 트랩은 남아 있어도 [Tab]을 가로채지 않는다', () => {
  const stale = makeDialog('stale');
  focusTrap(stale.root, { focus: '[name="close"]' });  // destroy를 놓친 트랩
  stale.root.remove();
  const live = makeDialog('live');
  const trap = focusTrap(live.root, { focus: '[name="close"]' });
  tab(document.body);
  expect(live.root.contains(document.activeElement)).toBe(true);
  trap.destroy();
});
