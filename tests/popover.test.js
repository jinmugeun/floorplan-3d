// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createPopover } from '../src/ui/popover.js';

function anchorAt(left = 100, top = 400) {
  const b = document.createElement('button'); document.body.appendChild(b);
  b.getBoundingClientRect = () => ({ left, top, right: left + 80, bottom: top + 24, width: 80, height: 24 });
  return b;
}

test('open shows content, close empties it, Escape and outside clicks close it', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const pop = createPopover(root);
  expect(pop.isOpen()).toBe(false);
  pop.open(anchorAt(), '<label><input type="checkbox" data-v2="grid"> 격자</label>');
  expect(pop.isOpen()).toBe(true);
  expect(pop.el.textContent).toContain('격자');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(pop.isOpen()).toBe(false);
  expect(pop.el.innerHTML).toBe('');
  pop.open(anchorAt(), '<b>x</b>');
  document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  expect(pop.isOpen()).toBe(false);
  pop.destroy();
});

test('changes inside the popover reach the handler, and it is clamped to the viewport', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const pop = createPopover(root);
  const onChange = vi.fn();
  pop.open(anchorAt(window.innerWidth + 500, 10), '<input type="checkbox" data-v2="grid">', { onChange });
  const cb = pop.el.querySelector('input');
  cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(parseFloat(pop.el.style.left)).toBeLessThanOrEqual(window.innerWidth);
  expect(parseFloat(pop.el.style.top)).toBeGreaterThanOrEqual(8);
  pop.destroy();
});

test('the outside click that closes the popover does not reach the canvas underneath', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const canvas = document.createElement('canvas'); document.body.appendChild(canvas);
  const hits = vi.fn(); canvas.addEventListener('pointerdown', hits);
  const pop = createPopover(root);
  pop.open(anchorAt(), '<b>x</b>');
  canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 700.5, clientY: 400.25 }));
  expect(pop.isOpen()).toBe(false);
  expect(hits).not.toHaveBeenCalled();
  // 닫힌 뒤의 클릭은 그대로 캔버스에 닿는다
  canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
  expect(hits).toHaveBeenCalledTimes(1);
  pop.destroy();
});

test('the closing click keeps its default action outside the canvas, so an input still focuses', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const wrap = document.createElement('main'); wrap.id = 'canvasWrap'; document.body.appendChild(wrap);
  const canvas = document.createElement('canvas'); wrap.appendChild(canvas);
  const input = document.createElement('input'); document.body.appendChild(input);
  const pop = createPopover(root);

  pop.open(anchorAt(), '<b>x</b>');
  const onInput = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
  input.dispatchEvent(onInput);
  expect(pop.isOpen()).toBe(false);
  expect(onInput.defaultPrevented).toBe(false); // 기본 동작이 살아 있어야 입력란이 포커스를 받는다
  input.focus();
  expect(document.activeElement).toBe(input);

  pop.open(anchorAt(), '<b>x</b>');
  const onCanvas = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
  canvas.dispatchEvent(onCanvas);
  expect(pop.isOpen()).toBe(false);
  expect(onCanvas.defaultPrevented).toBe(true); // 캔버스 위에서는 클릭이 도면에 닿지 않게 막는다
  pop.destroy();
  wrap.remove(); input.remove();
});

// §15.3(감사 §1): 팝오버가 열려도 포커스가 들어가지 않아 Tab이 뒤쪽 상단 바로 새어 나갔다.
test('열리면 첫 항목으로 포커스가 들어가고 Tab은 안에서 돈다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const outside = document.createElement('button'); document.body.appendChild(outside);
  const pop = createPopover(root);
  const anchor = anchorAt();
  anchor.focus();
  pop.open(anchor, '<h4>보기 모드</h4><label><input type="checkbox" data-v2="grid"> 격자</label><select aria-label="성능 모드"><option>a</option></select>');
  const [cb, sel] = pop.focusables();
  expect(document.activeElement).toBe(cb);
  expect(pop.el.getAttribute('role')).toBe('dialog');
  expect(pop.el.getAttribute('aria-modal')).toBe('false');
  expect(pop.el.getAttribute('aria-labelledby')).toBe(pop.el.querySelector('h4').id);
  // 마지막 항목에서 Tab을 누르면 첫 항목으로 돌아온다(뒤쪽 앱으로 새지 않는다).
  sel.focus();
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(tab);
  expect(tab.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(cb);
  // Shift+Tab은 거꾸로 돈다.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(sel);
  pop.destroy();
});

test('[Esc]로 닫으면 호출 버튼으로 포커스가 돌아온다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const pop = createPopover(root);
  const anchor = anchorAt();
  pop.open(anchor, '<button type="button">첫 항목</button>');
  expect(document.activeElement).toBe(pop.el.querySelector('button'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(pop.isOpen()).toBe(false);
  expect(document.activeElement).toBe(anchor);
  pop.destroy();
});

// 보기 옵션을 키보드로 토글하면 셸이 refreshPopover()로 같은 팝오버를 다시 그린다:
// 그때 포커스를 첫 항목으로 되돌리면 두 번째 체크박스를 켤 수 없다.
test('열린 채 다시 그려도 포커스를 옮기지 않는다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const outside = document.createElement('button'); document.body.appendChild(outside);
  const pop = createPopover(root);
  const anchor = anchorAt();
  pop.open(anchor, '<input type="checkbox" data-v2="grid"><input type="checkbox" data-v2="guides">');
  expect(document.activeElement).toBe(pop.focusables()[0]);   // 처음 열 때는 첫 항목
  outside.focus();
  pop.open(anchor, '<input type="checkbox" data-v2="grid" checked><input type="checkbox" data-v2="guides">');
  expect(document.activeElement).toBe(outside);               // 다시 그리기는 포커스를 건드리지 않는다
  expect(pop.isOpen()).toBe(true);
  pop.destroy();
});

// 브라우저에서는 넘치는 .popover(max-height: 70vh; overflow: auto) 안에서 Tab이 감싸 돌 때
// 브라우저가 팝오버를 스크롤한다: 캡처 스크롤 리스너가 그것을 "페이지 스크롤"로 보고 닫으면
// 키보드로는 마지막 항목에 닿을 수 없다.
test('팝오버 안에서 난 스크롤은 닫지 않고, 페이지 스크롤은 닫는다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const pop = createPopover(root);
  pop.open(anchorAt(), '<label><input type="checkbox" data-v2="grid"> 격자</label>');
  pop.el.dispatchEvent(new Event('scroll', { bubbles: true }));
  expect(pop.isOpen()).toBe(true);
  pop.el.querySelector('input').dispatchEvent(new Event('scroll', { bubbles: true }));
  expect(pop.isOpen()).toBe(true);                 // 안쪽 요소에서 난 스크롤도 내부 스크롤이다
  document.dispatchEvent(new Event('scroll', { bubbles: true }));
  expect(pop.isOpen()).toBe(false);                // 페이지가 스크롤되면 앵커에서 떨어지므로 닫는다
  pop.destroy();
});

test('[Tab]은 포커스가 팝오버 밖에 있어도 안으로 데려온다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const outside = document.createElement('button'); document.body.appendChild(outside);
  const pop = createPopover(root);
  const anchor = anchorAt();
  pop.open(anchor, '<button type="button">첫</button><button type="button">둘</button>');
  outside.focus();
  const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(pop.focusables()[0]);
  expect(pop.isOpen()).toBe(true);
  pop.destroy();
  outside.remove();
});

// I3: 다른 팝오버 버튼을 누르면(셸은 닫지 않고 새 앵커로 다시 연다) Esc는 **새** 앵커로 돌아간다.
test('앵커가 바뀌면 [Esc]는 새 앵커로 포커스를 돌린다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const pop = createPopover(root);
  const first = anchorAt(100, 400), second = anchorAt(300, 400);
  pop.open(first, '<button type="button">a</button>');
  pop.open(second, '<button type="button">b</button>');   // 닫지 않고 앵커만 바꿔 연다
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(pop.isOpen()).toBe(false);
  expect(document.activeElement).toBe(second);
  pop.destroy();
});

// §16.12(M-10): 열려 있는 동안 글자 단축키가 window까지 새면 읽는 중에 도구가 바뀐다.
// 다만 팝오버 안의 입력 칸에서 누른 키는 그대로 지나가야 한다(keymap.js의 INPUT 가드가 받는다).
test('열려 있는 동안 글자 키는 window로 새지 않고, Ctrl 조합과 입력 칸은 통과한다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const pop = createPopover(root);
  pop.open(anchorAt(), '<label><input type="number" name="thickness" value="200"> 두께</label>');
  const seen = [];
  const onWin = ev => seen.push(ev.key);
  window.addEventListener('keydown', onWin);
  try {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    // 팝오버 안의 숫자 칸에서 누른 [Enter]는 막지 않는다(캡처에서 끊으면 INPUT 가드까지 막힌다).
    pop.el.querySelector('[name="thickness"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  } finally { window.removeEventListener('keydown', onWin); pop.destroy(); }
  expect(seen).toEqual(['z', 'Enter']);
});
