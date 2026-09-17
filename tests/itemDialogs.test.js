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
