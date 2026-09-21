// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { openRelativeMoveDialog, openArrayDialog } from '../src/ui/itemDialogs.js';

const q = s => document.querySelector(s);
const set = (name, v) => { const el = q(`[name="${name}"]`); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };

// 대화상자는 document.body에 붙는다. 앞 테스트가 남긴 것이 querySelector에 먼저 걸리지 않게 비운다.
beforeEach(() => { document.body.innerHTML = ''; });

describe('아이템 대화상자', () => {
  test('상대이동은 dx·dy·복사 여부를 돌려준다', () => {
    const got = [];
    openRelativeMoveDialog({ onApply: v => got.push(v) });
    expect(document.body.textContent).toContain('상대이동');
    set('dx', '300'); set('dy', '-200.5');
    const copy = q('[name="copy"]'); copy.checked = true; copy.dispatchEvent(new Event('change', { bubbles: true }));
    q('[name="apply"]').click();
    expect(got).toEqual([{ dx: 300, dy: -200.5, copy: true }]);
    expect(q('.modal')).toBeNull(); // 적용하면 닫힌다
  });

  test('직선 배열은 간격과 개수를 받는다', () => {
    const got = [];
    openArrayDialog('linear', { onApply: v => got.push(v) });
    expect(document.body.textContent).toContain('직선 배열 복사');
    set('dx', '600'); set('dy', '0'); set('count', '4');
    q('[name="apply"]').click();
    expect(got).toEqual([{ dx: 600, dy: 0, count: 4 }]);
  });

  test('원형·회전 배열은 각도와 개수를 받고 취소하면 아무 일도 없다', () => {
    const got = [];
    openArrayDialog('circular', { onApply: v => got.push(v) });
    expect(document.body.textContent).toContain('원형 배열 복사');
    set('angle', '45'); set('count', '7');
    q('[name="apply"]').click();
    expect(got).toEqual([{ angle: 45, count: 7 }]);
    openArrayDialog('rotate', { onApply: v => got.push(v) });
    expect(document.body.textContent).toContain('회전 복사');
    q('[name="close"]').click();
    expect(got).toHaveLength(1);
    expect(q('.modal')).toBeNull();
  });

  test('개수는 1~100, 각도는 1~180으로 잘린다', () => {
    const got = [];
    openArrayDialog('circular', { onApply: v => got.push(v) });
    set('angle', '999'); set('count', '999');
    q('[name="apply"]').click();
    expect(got).toEqual([{ angle: 180, count: 100 }]);
  });
});

test('Enter는 적용, Esc는 취소다', () => {
  const got = [];
  openRelativeMoveDialog({ onApply: v => got.push(v) });
  set('dx', '120.5');
  q('[name="dx"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(got).toHaveLength(1);
  expect(got[0].dx).toBe(120.5);
  expect(q('.modal')).toBeNull();
  openRelativeMoveDialog({ onApply: v => got.push(v) });
  q('[name="dx"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(q('.modal')).toBeNull();
  expect(got).toHaveLength(1);
});

// I-1: 간격 하한 10 mm · 개수 상한 500. 대화상자가 스스로 허용하는 최소값이 1 mm였다.
test('경로 배열 간격은 10 mm 아래로 못 내려가고 개수는 500에서 잘린다', () => {
  const got = [];
  openArrayDialog('path', { length: 450.5, onApply: v => got.push(v) });
  const root = document.querySelector('.modal');
  expect(root.querySelector('[name="spacing"]').min).toBe('10');
  expect(root.querySelector('[name="spacing"]').step).toBe('10');
  expect(root.querySelector('[name="count"]').max).toBe('500');
  expect(root.querySelector('[name="spacing"]').value).toBe('451');  // 긴 변을 mm 정수로 반올림
  root.querySelector('[name="spacing"]').value = '1';
  root.querySelector('[name="count"]').value = '9999';
  root.querySelector('[name="apply"]').click();
  expect(got).toEqual([{ spacing: 10, count: 500, follow: true }]);

  openArrayDialog('path', { length: 450.5, onApply: v => got.push(v) });
  const r2 = document.querySelector('.modal');
  r2.querySelector('[name="spacing"]').value = '';                   // 빈 값은 기본값으로 돌아간다
  r2.querySelector('[name="count"]').value = '-5';                   // 음수 개수는 "간격으로 채우기"다
  r2.querySelector('[name="apply"]').click();
  expect(got[1]).toEqual({ spacing: 451, count: null, follow: true });
});

// §13.1: 경로 배열 복사 대화상자. 간격 기본값은 호출자가 넘기는 아이템의 긴 변이다.
test('경로 배열 대화상자는 간격·개수·회전 체크를 모으고 개수 0은 null이 된다', () => {
  const got = [];
  const d = openArrayDialog('path', { length: 450, onApply: v => got.push(v) });
  const root = document.querySelector('.modal');
  expect(root.textContent).toContain('경로 배열 복사');
  expect(root.querySelector('[name="spacing"]').value).toBe('450');
  expect(root.querySelector('[name="count"]').value).toBe('0');
  expect(root.querySelector('[name="follow"]').checked).toBe(true);
  root.querySelector('[name="apply"]').click();
  expect(got).toEqual([{ spacing: 450, count: null, follow: true }]);
  d.close();

  openArrayDialog('path', { length: 600, onApply: v => got.push(v) });
  const r2 = document.querySelector('.modal');
  r2.querySelector('[name="spacing"]').value = '1200';
  r2.querySelector('[name="count"]').value = '5';
  r2.querySelector('[name="follow"]').checked = false;
  r2.querySelector('[name="apply"]').click();
  expect(got[1]).toEqual({ spacing: 1200, count: 5, follow: false });
});
