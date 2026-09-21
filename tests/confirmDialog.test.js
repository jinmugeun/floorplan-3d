// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { confirmDialog, CONFIRM_ROOM_DELETE } from '../src/ui/confirmDialog.js';
import { focusTrap } from '../src/ui/dialogBase.js';

const card = () => document.querySelector('.modal.confirm');
const key = (k, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }));

beforeEach(() => { document.body.innerHTML = ''; });

describe('인앱 확인 대화상자', () => {
  test('확인 버튼을 누르면 true, 취소는 false이고 대화상자가 사라진다', async () => {
    const p = confirmDialog({ title: '방 삭제', message: '지울까요?', ok: '삭제', danger: true });
    expect(card()).not.toBeNull();
    expect(card().textContent).toContain('지울까요?');
    expect(card().querySelector('[name="ok"]').textContent).toBe('삭제');
    expect(card().querySelector('[name="ok"]').classList.contains('danger')).toBe(true);
    expect(document.activeElement).toBe(card().querySelector('[name="ok"]'));
    card().querySelector('[name="ok"]').click();
    await expect(p).resolves.toBe(true);
    expect(card()).toBeNull();

    const q = confirmDialog({ message: '지울까요?' });
    card().querySelector('[name="cancel"]').click();
    await expect(q).resolves.toBe(false);
    expect(card()).toBeNull();
  });

  test('[Enter]는 확인, [Esc]는 취소이고 페이지 단축키로 새지 않는다', async () => {
    const leaked = [];
    window.addEventListener('keydown', ev => leaked.push(ev.key));
    const p = confirmDialog({ message: '지울까요?' });
    key('Enter');
    await expect(p).resolves.toBe(true);
    const q = confirmDialog({ message: '지울까요?' });
    key('Escape');
    await expect(q).resolves.toBe(false);
    expect(leaked).toEqual([]);            // 캡처 단계에서 stopPropagation 한다
  });

  test('[Tab]은 두 버튼 사이만 돈다', async () => {
    const p = confirmDialog({ message: '지울까요?' });
    const [cancel, ok] = [card().querySelector('[name="cancel"]'), card().querySelector('[name="ok"]')];
    expect(document.activeElement).toBe(ok);
    key('Tab');
    expect(document.activeElement).toBe(cancel);
    key('Tab');
    expect(document.activeElement).toBe(ok);
    key('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(cancel);
    card().querySelector('[name="cancel"]').click();
    await expect(p).resolves.toBe(false);
  });

  test('문구는 HTML로 해석되지 않고, 한 번 닫힌 뒤 다시 눌러도 한 번만 resolve한다', async () => {
    const p = confirmDialog({ title: '<img src=x>', message: '<b>굵게</b>', ok: '<i>ok</i>' });
    expect(card().querySelector('img')).toBeNull();
    expect(card().querySelector('b')).toBeNull();
    expect(card().textContent).toContain('<b>굵게</b>');
    const ok = card().querySelector('[name="ok"]');
    ok.click(); ok.click();               // 두 번 눌러도 안전하다(이미 떼어 냈다)
    await expect(p).resolves.toBe(true);
  });

  test('방 삭제 문구는 상수 한 곳에서 온다', () => {
    expect(CONFIRM_ROOM_DELETE).toEqual({ title: '방 삭제', message: '방과 그 벽을 모두 삭제할까요?', ok: '삭제', danger: true });
  });

  test('열려 있는 동안은 Esc·Enter·Tab이 아닌 키도 전역 단축키로 새지 않는다', async () => {
    const leaked = [];
    window.addEventListener('keydown', ev => leaked.push(ev.key));
    const p = confirmDialog({ message: '지울까요?' });
    key('z', { ctrlKey: true });   // Ctrl+Z(undo)
    key('s', { ctrlKey: true });   // Ctrl+S(저장)
    key('d');                      // 도구 전환 글자
    key('Delete');                 // 선택 삭제 단축키
    expect(leaked).toEqual([]);    // 창까지 내려간 키가 하나도 없다
    key('Enter');
    await expect(p).resolves.toBe(true);
    expect(leaked).toEqual([]);
  });

  test('열려 있는 동안 두 번째 호출은 새 모달을 만들지 않고 같은 Promise를 돌려준다', async () => {
    const p = confirmDialog({ message: '지울까요?' });
    const q = confirmDialog({ message: '다른 문구' }); // 열려 있으므로 이 인자는 무시된다
    expect(q).toBe(p);
    expect(document.querySelectorAll('.modal.confirm').length).toBe(1);
    expect(card().textContent).toContain('지울까요?'); // 첫 번째 문구가 그대로 유지된다
    expect(document.activeElement).toBe(card().querySelector('[name="ok"]')); // 다시 ok에 포커스
    key('Enter');
    await expect(Promise.all([p, q])).resolves.toEqual([true, true]);
    expect(card()).toBeNull();

    // 닫힌 뒤에는 다시 새 대화상자를 열 수 있다.
    const r = confirmDialog({ message: '지울까요?' });
    expect(card()).not.toBeNull();
    card().querySelector('[name="cancel"]').click();
    await expect(r).resolves.toBe(false);
  });
});

// §15.10: 자기 DOM을 직접 만드는 대화상자들도 openModal과 같은 포커스 규칙을 쓴다.
test('focusTrap은 포커스를 안으로 넣고 Tab을 가두고 닫을 때 되돌린다', () => {
  const opener = document.createElement('button'); document.body.appendChild(opener);
  opener.focus();
  const root = document.createElement('div');
  root.innerHTML = '<button name="close">✕</button><input type="text" name="a"><button name="ok">적용</button><button hidden name="gone">숨김</button>';
  document.body.appendChild(root);
  const trap = focusTrap(root, { focus: '[name="ok"]' });
  expect(document.activeElement).toBe(root.querySelector('[name="ok"]'));
  // 마지막 항목에서 Tab → 첫 항목(숨긴 버튼은 순환에 들지 않는다).
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  root.querySelector('[name="ok"]').dispatchEvent(tab);
  expect(tab.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(root.querySelector('[name="close"]'));
  root.querySelector('[name="close"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(root.querySelector('[name="ok"]'));
  trap.destroy();
  expect(document.activeElement).toBe(opener);
  // focus 선택자를 주지 않으면 첫 항목이다.
  const t2 = focusTrap(root);
  expect(document.activeElement).toBe(root.querySelector('[name="close"]'));
  t2.destroy();
});
