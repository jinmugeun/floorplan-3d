// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { openStartScreen } from '../src/ui/startScreen.js';

test('three cards route to their callbacks and the overlay closes', () => {
  localStorage.clear();                       // 사용자 템플릿이 카드 수에 끼어들지 않게
  const store = createStore(createEmptyProject());
  const calls = [];
  const s = openStartScreen({ store, onEmpty: () => calls.push('empty'), onUpload: () => calls.push('upload'), onSample: () => calls.push('sample') });
  const overlay = document.querySelector('#startScreen');
  expect(overlay).not.toBeNull();
  expect(overlay.querySelectorAll('.start-card:not(.tpl)')).toHaveLength(3); // 템플릿 카드는 .tpl로 구분한다
  expect(overlay.textContent).toContain('강당중 조리실');
  overlay.querySelector('[data-start="sample"]').click();
  expect(calls).toEqual(['sample']);
  expect(document.querySelector('#startScreen')).toBeNull();
  const again = openStartScreen({ store, onEmpty: () => calls.push('empty') });
  document.querySelector('[data-start="empty"]').click();
  expect(calls).toEqual(['sample', 'empty']);
  again.close(); // 이미 닫혔어도 안전하다
});

test('the sample card actually fills the store when wired to loadSample', async () => {
  const { loadSample } = await import('../src/samples/gangdang.js');
  const store = createStore(createEmptyProject());
  openStartScreen({ store, onSample: () => loadSample(store) });
  document.querySelector('[data-start="sample"]').click();
  expect(activeFloor(store.get()).rooms).toHaveLength(11);
});

test('Escape starts an empty project and the first card has focus', () => {
  document.body.innerHTML = '';
  const store = createStore(createEmptyProject());
  const calls = [];
  openStartScreen({ store, onEmpty: () => calls.push('empty') });
  const overlay = document.querySelector('#startScreen');
  expect(document.activeElement).toBe(overlay.querySelector('[data-start="empty"]'));
  expect(overlay.getAttribute('role')).toBe('dialog');
  overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('#startScreen')).toBeNull();
  expect(calls).toEqual(['empty']);
});

test('템플릿 카드 목록을 보여주고 고르면 onTemplate이 불린다', () => {
  localStorage.clear();
  const picked = [];
  openStartScreen({ store: createStore(createEmptyProject()), onTemplate: id => picked.push(id) });
  const root = document.getElementById('startScreen');
  const cards = [...root.querySelectorAll('[data-template]')];
  expect(cards.map(c => c.dataset.template)).toEqual(['builtin-studio']); // 빈 프로젝트·샘플은 위 카드가 담당한다
  expect(cards[0].classList.contains('tpl')).toBe(true);         // 위 카드 3개와 구분되는 클래스
  expect(root.querySelectorAll('.start-card:not(.tpl)')).toHaveLength(3);
  expect(root.textContent).toContain('템플릿');
  cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(picked).toEqual(['builtin-studio']);
  expect(document.getElementById('startScreen')).toBeNull();     // 고르면 닫힌다
});

test('자동 저장본이 있으면 "이어서 작업" 카드가 맨 앞에 뜨고 포커스를 받는다', () => {
  document.body.innerHTML = '';
  localStorage.clear();
  const store = createStore(createEmptyProject());
  const calls = [];
  openStartScreen({ store, restored: createEmptyProject('강당중 조리실'), onRestore: () => calls.push('restore'), onEmpty: () => calls.push('empty') });
  const root = document.getElementById('startScreen');
  const cards = [...root.querySelectorAll('.start-card:not(.tpl)')];
  expect(cards).toHaveLength(4);
  expect(cards[0].dataset.start).toBe('restore');
  expect(cards[0].classList.contains('restore')).toBe(true);
  expect(cards[0].textContent).toContain('강당중 조리실');
  expect(document.activeElement).toBe(cards[0]);
  cards[0].click();
  expect(calls).toEqual(['restore']);
  expect(document.getElementById('startScreen')).toBeNull();
});

test('어느 길로 닫혀도 onClose가 한 번 불린다', () => {
  document.body.innerHTML = '';
  localStorage.clear();
  const closed = [];
  const s = openStartScreen({ store: createStore(createEmptyProject()), onClose: () => closed.push(1) });
  document.querySelector('[data-start="empty"]').click();
  expect(closed).toEqual([1]);
  s.close();                                   // 이미 닫혔으므로 다시 부르지 않는다
  expect(closed).toEqual([1]);
  openStartScreen({ store: createStore(createEmptyProject()), onClose: () => closed.push(2) })
    .close();
  expect(closed).toEqual([1, 2]);
});

// §15.10(감사 §3): 마지막 카드에서 Tab을 누르면 뒤쪽 앱으로 나가 모달 뒤를 조작할 수 있었다.
test('시작 화면은 Tab을 안에 가두고 닫으면 포커스를 되돌린다', () => {
  const back = document.createElement('input'); document.body.appendChild(back);
  back.focus();
  const s = openStartScreen({ store: createStore(createEmptyProject()) });
  const root = document.getElementById('startScreen');
  const cards = [...root.querySelectorAll('button')];
  expect(document.activeElement).toBe(cards[0]);
  cards.at(-1).focus();
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  cards.at(-1).dispatchEvent(tab);
  expect(tab.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(cards[0]);      // 뒤쪽 앱으로 나가지 않는다
  s.close();
  expect(document.activeElement).toBe(back);
});

// §16.10: 저장한 템플릿을 시작 화면에서 지우고 이름을 바꾼다(감사 §18).
test('사용자 템플릿 카드에 [이름 변경]·[삭제]가 있다', async () => {
  localStorage.clear();
  document.body.innerHTML = '';
  const { saveTemplate, listTemplates } = await import('../src/templates/projectTemplates.js');
  saveTemplate('내 방 템플릿', createEmptyProject('내 방'));
  const store = createStore(createEmptyProject());
  openStartScreen({ store });
  const overlay = document.querySelector('#startScreen');
  const card = overlay.querySelector('.start-card.tpl.user');
  expect(card).not.toBeNull();
  expect(card.querySelector('[data-template]')).not.toBeNull();     // 카드 본문은 여전히 열기다
  // 이름 변경: promptDialog가 뜨고 확인하면 목록이 바뀐다.
  card.querySelector('[data-tpl-rename]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const prompt = document.querySelector('.modal.prompt');
  expect(prompt).not.toBeNull();
  prompt.querySelector('[name="text"]').value = '바꾼 이름';
  prompt.querySelector('[name="ok"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await vi.waitFor(() => expect(listTemplates()[0].name).toBe('바꾼 이름'));
  await vi.waitFor(() => expect(document.querySelector('#startScreen').textContent).toContain('바꾼 이름'));
  // 삭제: confirmDialog를 지나야 지워진다.
  document.querySelector('.start-card.tpl.user [data-tpl-delete]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const confirm = document.querySelector('.modal.confirm');
  expect(confirm.textContent).toContain('되돌릴 수 없습니다');
  confirm.querySelector('[name="ok"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await vi.waitFor(() => expect(listTemplates()).toHaveLength(0));
  await vi.waitFor(() => expect(document.querySelector('#startScreen').querySelector('.start-card.tpl.user')).toBeNull());
});

test('템플릿 카드에 96 px 축소 도면 캔버스가 있다(§16.12)', () => {
  localStorage.clear();
  document.body.innerHTML = '';
  openStartScreen({ store: createStore(createEmptyProject()) });
  const canvas = document.querySelector('.start-card.tpl canvas[data-tpl]');
  expect(canvas).not.toBeNull();
  expect(canvas.width).toBe(96);
});
