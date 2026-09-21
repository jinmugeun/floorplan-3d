// @vitest-environment jsdom
// §15.9: 입력 중 [Esc]로 되돌리고 [Enter]로 확정한다. 숫자 칸은 단위별 step을 갖고,
// 소수 step(면풍속 0.05)은 값에 부동소수 먼지를 남기지 않는다(감사 §5 · §21).
import { test, expect } from 'vitest';
import { STEP, INCH_MM, stepMm, roundToStep, isTextField, numValue, readLen, lenField, rememberFieldValue, revertField, commitField, trackFields } from '../src/ui/fieldUtils.js';

const inputOf = html => { const d = document.createElement('div'); document.body.appendChild(d); d.innerHTML = html; return d.querySelector('input'); };

test('step은 mm 10 · ft·in 1/8이다', () => {
  expect(STEP).toEqual({ mm: 10, ftin: 1 / 8 });
  expect(INCH_MM).toBe(25.4);
  expect(stepMm('mm')).toBe(10);
  expect(stepMm('ftin')).toBeCloseTo(3.175, 6);
  expect(roundToStep(1.0499999999999998, 0.05)).toBeCloseTo(1.05, 10);
  expect(roundToStep(1234.5, 0)).toBe(1234.5);         // step이 없으면 그대로
  expect(roundToStep(1234.5, NaN)).toBe(1234.5);
});

test('mm 길이 칸은 step 10을 갖고 ft·in 칸은 data-step 1/8을 갖는다', () => {
  const mm = inputOf(lenField('두께', 'thickness', 200, 2, 1000));
  expect(mm.step).toBe('10');
  const ft = inputOf(lenField('두께', 'thickness', 305, 2, 1000, false, 'ftin'));
  expect(ft.dataset.step).toBe('0.125');
  expect(ft.type).toBe('text');
  // 정수 step은 화살표 간격일 뿐이다: 타이핑한 소수를 건드리지 않는다(위치 1234.5).
  const pos = inputOf(lenField('위치 X', 'posX', 0, -1e6, 1e6, false, 'mm', 1));
  pos.value = '1234.5';
  expect(numValue(pos)).toBe(1234.5);
  // ft·in은 1/8 인치 배수로 맞춘 뒤 mm 정수로 반올림한다(4 ft = 1219.2 → 1219).
  // 4 ft는 위 두께 칸의 max(1000)를 넘으므로 범위가 넓은 칸으로 읽는다.
  const ftLong = inputOf(lenField('길이', 'len', 305, 2, 100000, false, 'ftin'));
  ftLong.value = "4'";
  expect(readLen(ftLong, 'ftin')).toBe(1219);
  ftLong.value = "2' 0\"";
  expect(readLen(ftLong, 'ftin')).toBe(610);
});

test('소수 step 칸은 그 배수로 반올림한다(감사 §21)', () => {
  const el = inputOf('<input type="number" name="v" min="0.1" max="3" step="0.05" value="0.7">');
  el.value = '1.0499999999999998';
  expect(numValue(el)).toBeCloseTo(1.05, 10);
  el.value = '1.06';
  expect(numValue(el)).toBeCloseTo(1.05, 10);
  const clamps = [];
  el.value = '99';
  expect(numValue(el, { onClamp: (v, info) => clamps.push([v, info.max]) })).toBe(3);
  expect(clamps).toEqual([[3, 3]]);
  const any = inputOf('<input type="number" name="v" step="any" value="1">');
  any.value = '1.234';
  expect(numValue(any)).toBe(1.234);                   // step="any"는 반올림하지 않는다
});

test('[Esc]는 포커스 시점 값으로 되돌리고 blur하며 change를 내지 않는다', () => {
  const el = inputOf('<input type="number" name="thickness" value="200" step="10">');
  const changes = [];
  el.addEventListener('change', () => changes.push(el.value));
  el.focus();
  rememberFieldValue(el);
  el.value = '3200';
  expect(revertField(el)).toBe(true);
  expect(el.value).toBe('200');
  expect(document.activeElement).not.toBe(el);
  expect(changes).toEqual([]);
  // 체크박스·색·슬라이더는 이 규칙 밖이다.
  expect(isTextField(inputOf('<input type="checkbox">'))).toBe(false);
  expect(isTextField(inputOf('<input type="range">'))).toBe(false);
  expect(revertField(inputOf('<input type="checkbox">'))).toBe(false);
});

test('[Enter]는 확정(change)하고 blur하며 다음 [Esc]의 기준을 옮긴다', () => {
  const el = inputOf('<input type="text" name="q" value="a">');
  const changes = [];
  el.addEventListener('change', () => changes.push(el.value));
  el.focus();
  rememberFieldValue(el);
  el.value = 'b';
  expect(commitField(el)).toBe(true);
  expect(changes).toEqual(['b']);
  expect(document.activeElement).not.toBe(el);
  el.focus();
  el.value = 'c';
  revertField(el);
  expect(el.value).toBe('b');                          // Enter로 확정한 값이 기준이다
});

test('trackFields는 포커스가 들어올 때의 값을 기억한다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  root.innerHTML = '<input type="number" name="a" value="5" step="10">';
  const el = root.querySelector('input');
  const t = trackFields(root);
  el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  el.value = '9';
  revertField(el);
  expect(el.value).toBe('5');
  t.destroy();
  el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  el.value = '7';
  revertField(el);
  expect(el.value).toBe('5');                          // 떼어 낸 뒤에는 기준이 갱신되지 않는다
});
