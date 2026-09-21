// @vitest-environment jsdom
// §15.9: 입력 중 [Esc]로 되돌리고 [Enter]로 확정한다. 숫자 칸은 단위별 step을 갖고,
// 소수 step(면풍속 0.05)은 값에 부동소수 먼지를 남기지 않는다(감사 §5 · §21).
import { test, expect } from 'vitest';
import { STEP, INCH_MM, stepMm, roundToStep, isTextField, numValue, readLen, lenField, rememberFieldValue, revertField, commitField, trackFields } from '../src/ui/fieldUtils.js';
import { fmtLen } from '../src/util/units.js';

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
  // ft·in은 mm 정수로만 반올림한다(4 ft = 1219.2 → 1219).
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

// 리뷰 H-1: readLen이 1/8"(3.175 mm) 격자로 스냅하면 표기(0.1" 해상도)와 격자가 어긋나
// ft·in 왕복 오차가 1 mm → 2 mm로 커졌다(103 → 105, 109 → 108). 스냅은 빠졌고 1/8"는
// 화살표 간격의 뜻으로만 data-step에 남는다.
test('ft·in 왕복은 mm 정수 반올림만 해서 오차가 1 mm를 넘지 않는다', () => {
  const el = inputOf(lenField('길이', 'len', 0, 0, 1e6, false, 'ftin'));
  const rt = mm => { el.value = fmtLen(mm, 'ftin'); return readLen(el, 'ftin'); };
  expect(rt(103)).toBe(104);                           // 스냅이 있으면 105였다
  expect(rt(109)).toBe(109);                           // 스냅이 있으면 108이었다
  // 리뷰 표의 3898·3118은 "오차 0 mm인 값의 개수"였다(mm 값이 아니다) — 0.1" 표기에서
  // 개별 값의 왕복 오차 하한은 1 mm이고, 2 mm로 벌어지는 값이 없어야 한다.
  expect(rt(3898)).toBe(3899);
  expect(rt(3118)).toBe(3119);
  let worst = 0, exact = 0;
  for (let mm = 1; mm <= 10000; mm++) { const d = Math.abs(rt(mm) - mm); if (d > worst) worst = d; if (d === 0) exact++; }
  expect(worst).toBe(1);                               // 스냅이 있으면 2였다(2204개)
  expect(exact).toBeGreaterThan(3900);                 // 스냅이 있으면 3149개로 줄었다
});

// 리뷰 M-2: HTML의 step 격자 기준점(step base)은 min이다 → min 2 · step 10인 두께 칸에서
// 화살표가 200 → 202를 만들고 값이 :invalid가 됐다. 그런 칸은 min을 data-min으로 옮긴다.
test('min이 step 배수가 아닌 칸은 min을 data-min으로 옮겨 화살표 격자를 맞춘다', () => {
  const th = inputOf(lenField('두께', 'thickness', 200, 2, 1000));
  expect(th.step).toBe('10');
  expect(th.min).toBe('');
  expect(th.dataset.min).toBe('2');
  expect(th.validity.stepMismatch).toBe(false);
  th.stepUp(); expect(th.value).toBe('210');           // 예전에는 202였다
  // min에 있는 값에서는 min 기준 격자와 똑같이 움직인다: 2 → 12 → 22
  const atMin = inputOf(lenField('두께', 'thickness', 2, 2, 1000));
  atMin.stepUp(); expect(atMin.value).toBe('12');
  atMin.stepUp(); expect(atMin.value).toBe('22');
  const wl = inputOf(lenField('벽 길이', 'wallLength', 3000, 1, 999999));
  wl.stepUp(); expect(wl.value).toBe('3010');           // 예전에는 3001이었다
  // 클램프는 numValue가 data-min을 읽어 그대로 한다(계획 6 토스트 경로 그대로).
  const clamps = [];
  th.value = '1';
  expect(numValue(th, { onClamp: (v, info) => clamps.push([v, info.min]) })).toBe(2);
  expect(clamps).toEqual([[2, 2]]);
  // min이 step 배수인 칸은 HTML min을 그대로 쓴다.
  const z = inputOf(lenField('높이', 'z', 0, -1000, 8000));
  expect(z.min).toBe('-1000');
  expect(z.dataset.min).toBeUndefined();
});

// 리뷰 M-3: 검색 칸은 타이핑마다 목록을 걸러 낸다 → Esc가 글자만 되돌리면 빈 검색창 +
// 걸러진 목록으로 어긋난다. 되돌린 값으로 input을 한 번 쏜다(숫자 칸은 그대로 조용하다).
test('검색 칸의 [Esc]는 글자를 되돌리고 input을 한 번 쏜다', () => {
  const q = inputOf('<input type="search" name="q" value="">');
  const events = [];
  q.addEventListener('input', () => events.push(['input', q.value]));
  q.addEventListener('change', () => events.push(['change', q.value]));
  q.focus(); rememberFieldValue(q);
  q.value = '침대';
  expect(revertField(q)).toBe(true);
  expect(q.value).toBe('');
  expect(events).toEqual([['input', '']]);              // change는 없다
  // 기준값이 없는 검색 칸은 관례대로 지운다.
  const q2 = inputOf('<input type="search" name="q" value="소파">');
  const seen = [];
  q2.addEventListener('input', () => seen.push(q2.value));
  expect(revertField(q2)).toBe(true);
  expect(q2.value).toBe('');
  expect(seen).toEqual(['']);
  // 숫자 칸은 input도 내지 않는다(되돌리기는 "없던 일"이다).
  const n = inputOf('<input type="number" name="thickness" value="200" step="10">');
  const quiet = [];
  n.addEventListener('input', () => quiet.push(1));
  n.focus(); rememberFieldValue(n); n.value = '900';
  revertField(n);
  expect(quiet).toEqual([]);
});
