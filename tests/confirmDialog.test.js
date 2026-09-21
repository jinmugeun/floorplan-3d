// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { confirmDialog, CONFIRM_ROOM_DELETE } from '../src/ui/confirmDialog.js';

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
});
