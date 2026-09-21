// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { promptDialog } from '../src/ui/promptDialog.js';
import { confirmDialog } from '../src/ui/confirmDialog.js';
import { openDialogKey, trapTab } from '../src/ui/dialogBase.js';

const card = () => document.querySelector('.modal.prompt');
const input = () => card().querySelector('[name="text"]');
const err = () => card().querySelector('[data-part="error"]').textContent;
const key = (k, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }));

beforeEach(() => { document.body.innerHTML = ''; });

describe('이름 입력 대화상자', () => {
  test('기본값이 채워지고 입력란에 포커스가 오며 [Enter]가 문자열을 돌려준다', async () => {
    const p = promptDialog({ title: '템플릿으로 저장', label: '템플릿 이름', value: '강당중', ok: '저장' });
    expect(card()).not.toBeNull();
    expect(card().textContent).toContain('템플릿 이름');
    expect(card().querySelector('[name="ok"]').textContent).toBe('저장');
    expect(input().value).toBe('강당중');
    expect(document.activeElement).toBe(input());
    input().value = '강당중 조리실';
    key('Enter');
    await expect(p).resolves.toBe('강당중 조리실');
    expect(card()).toBeNull();
  });

  test('[Esc]와 [취소]는 null이고 어떤 키도 전역 단축키로 새지 않는다', async () => {
    const leaked = [];
    const off = ev => leaked.push(ev.key);
    window.addEventListener('keydown', off);
    const p = promptDialog({ value: 'a' });
    key('d'); key('Delete'); key('s', { ctrlKey: true });
    expect(leaked).toEqual([]);
    key('Escape');
    await expect(p).resolves.toBeNull();
    const q = promptDialog({ value: 'a' });
    card().querySelector('[name="cancel"]').click();
    await expect(q).resolves.toBeNull();
    expect(leaked).toEqual([]);
    window.removeEventListener('keydown', off);     // 뒤 테스트가 이 리스너에 물들지 않게 뗀다
  });

  test('validate가 문구를 돌려주면 빨간 글씨로 보이고 확인이 막힌다', async () => {
    const taken = new Set(['강당중']);
    const p = promptDialog({ value: '강당중', validate: t => (!t.trim() ? '이름을 입력해주세요' : taken.has(t.trim()) ? '같은 이름의 템플릿이 있습니다' : null) });
    card().querySelector('[name="ok"]').click();
    expect(err()).toBe('같은 이름의 템플릿이 있습니다');
    expect(card()).not.toBeNull();                 // 닫히지 않는다
    input().value = '   ';
    key('Enter');
    expect(err()).toBe('이름을 입력해주세요');
    expect(card()).not.toBeNull();
    input().value = '새 이름';
    key('Enter');
    await expect(p).resolves.toBe('새 이름');
  });

  // M-1: 한글 조합 중의 확정 [Enter]는 isComposing으로 한 번 먼저 온다(그 키로 닫으면 한 박자 이르다).
  test('조합 중인 [Enter]는 대화상자를 닫지 않고 다음 [Enter]가 확정한다', async () => {
    const p = promptDialog({ value: '강당중' });
    key('Enter', { isComposing: true });
    expect(card()).not.toBeNull();
    key('Escape', { keyCode: 229 });                // keyCode 229(조합 중)도 같이 막는다
    expect(card()).not.toBeNull();
    key('Enter');
    await expect(p).resolves.toBe('강당중');
  });

  test('[Tab]은 입력란과 두 버튼 사이만 돈다', async () => {
    const p = promptDialog({ value: 'a' });
    const [text, cancel, ok] = [input(), card().querySelector('[name="cancel"]'), card().querySelector('[name="ok"]')];
    expect(document.activeElement).toBe(text);
    key('Tab'); expect(document.activeElement).toBe(cancel);
    key('Tab'); expect(document.activeElement).toBe(ok);
    key('Tab'); expect(document.activeElement).toBe(text);
    key('Tab', { shiftKey: true }); expect(document.activeElement).toBe(ok);
    cancel.click();
    await expect(p).resolves.toBeNull();
  });

  test('제목·라벨·기본값은 HTML로 해석되지 않는다', () => {
    promptDialog({ title: '<img src=x>', label: '<b>이름</b>', value: '"><i>bad</i>' });
    expect(card().querySelector('img')).toBeNull();
    expect(card().querySelector('b')).toBeNull();
    expect(card().querySelector('i')).toBeNull();
    expect(input().value).toBe('"><i>bad</i>');
    card().querySelector('[name="cancel"]').click();
  });

  test('모달은 앱 전체에 하나뿐이다: 열려 있는 동안의 두 번째 호출은 같은 Promise다', async () => {
    const p = promptDialog({ value: 'a' });
    expect(openDialogKey()).toBe('prompt');
    const q = promptDialog({ value: 'b' });
    expect(q).toBe(p);
    expect(document.querySelectorAll('.modal.prompt')).toHaveLength(1);
    expect(input().value).toBe('a');
    const c = confirmDialog({ message: '겹치지 않는다' });
    expect(c).toBe(p);
    expect(document.querySelector('.modal.confirm')).toBeNull();
    key('Escape');
    await expect(p).resolves.toBeNull();
    expect(openDialogKey()).toBeNull();
  });
});

describe('대화상자 뼈대', () => {
  test('trapTab은 목록 안에서만 돌고 Tab이 아니면 손대지 않는다', () => {
    const list = [document.createElement('button'), document.createElement('button')];
    list.forEach(b => document.body.appendChild(b));
    let prevented = 0;
    const ev = (k, shift = false) => ({ key: k, shiftKey: shift, preventDefault: () => { prevented += 1; } });
    expect(trapTab(ev('Enter'), list)).toBe(false);
    expect(prevented).toBe(0);
    expect(trapTab(ev('Tab'), list)).toBe(true);   // 포커스가 목록 밖(body)이면 첫 번째로
    expect(document.activeElement).toBe(list[0]);
    trapTab(ev('Tab'), list);
    expect(document.activeElement).toBe(list[1]);
    trapTab(ev('Tab'), list);
    expect(document.activeElement).toBe(list[0]);
    trapTab(ev('Tab', true), list);
    expect(document.activeElement).toBe(list[1]);
    expect(prevented).toBe(4);
  });
});
