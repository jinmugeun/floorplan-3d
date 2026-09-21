// §15.12: 2D·3D 라벨이 같은 글자폭 규칙을 쓴다(정본은 geom/textWidth.js — 예전에는 labels2d에만 있었다).
import { test, expect } from 'vitest';
import { textWidth, CHAR_EM, WIDE_CHAR } from '../src/geom/textWidth.js';
import { textWidth as from2d, CHAR_EM as em2d } from '../src/view2d/labels2d.js';

test('한글·CJK·원문자는 1 em, ASCII는 0.62 em이다', () => {
  expect(CHAR_EM).toEqual({ wide: 1, narrow: 0.62 });
  expect(WIDE_CHAR.test('가')).toBe(true);
  expect(WIDE_CHAR.test('③')).toBe(true);
  expect(WIDE_CHAR.test('×')).toBe(false);            // 곱셈 기호는 반각이다
  expect(WIDE_CHAR.test('7')).toBe(false);
  expect(textWidth('가나', 10)).toBeCloseTo(20, 6);
  expect(textWidth('750×400', 10)).toBeCloseTo(7 * 6.2, 6);
  expect(textWidth('조리실 ③', 10)).toBeCloseTo(3 * 10 + 6.2 + 10, 6);
  expect(textWidth('', 12)).toBe(0);
  expect(textWidth(750.5, 10)).toBeCloseTo(5 * 6.2, 6);   // 숫자도 문자열로 본다
});

test('labels2d는 같은 함수를 다시 내보낸다(두 벌로 갈라지지 않는다)', () => {
  expect(from2d).toBe(textWidth);
  expect(em2d).toBe(CHAR_EM);
});
