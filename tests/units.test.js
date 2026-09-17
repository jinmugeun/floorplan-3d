import { describe, test, expect } from 'vitest';
import { fmtLen, parseLen, fmtArea, M2_PER_PYEONG } from '../src/util/units.js';
import { esc } from '../src/util/html.js';

describe('fmtLen', () => {
  test('mm mode rounds and optionally appends the unit', () => {
    expect(fmtLen(3400)).toBe('3400');
    expect(fmtLen(3400, 'mm', { unit: true })).toBe('3400 mm');
    expect(fmtLen(3399.6, 'mm')).toBe('3400'); // 소수 좌표
    expect(fmtLen(-1250.4, 'mm')).toBe('-1250');
    expect(fmtLen('abc', 'mm')).toBe('0');
  });
  test('ftin mode prints feet and inches', () => {
    expect(fmtLen(3810, 'ftin')).toBe(`12' 6"`);
    expect(fmtLen(152.4, 'ftin')).toBe(`6"`);
    expect(fmtLen(3822.7, 'ftin')).toBe(`12' 6.5"`); // 소수 좌표
    expect(fmtLen(3657.6, 'ftin')).toBe(`12' 0"`);
    expect(fmtLen(-304.8, 'ftin')).toBe(`-1' 0"`);
  });
});

describe('parseLen', () => {
  test('mm mode accepts plain numbers, separators and the unit suffix', () => {
    expect(parseLen('3400')).toBe(3400);
    expect(parseLen('3,400 mm')).toBe(3400);
    expect(parseLen('  2500.5 ')).toBe(2500.5); // 소수 입력
    expect(parseLen('')).toBeNull();
    expect(parseLen('세로')).toBeNull();
  });
  test('ftin mode accepts feet, inches, both, and a bare number as inches', () => {
    expect(parseLen(`12' 6"`, 'ftin')).toBeCloseTo(3810, 6);
    expect(parseLen(`12'`, 'ftin')).toBeCloseTo(3657.6, 6);
    expect(parseLen(`6"`, 'ftin')).toBeCloseTo(152.4, 6);
    expect(parseLen('6', 'ftin')).toBeCloseTo(152.4, 6);
    expect(parseLen(`12' 6.5"`, 'ftin')).toBeCloseTo(3822.7, 6); // 소수 입력
    expect(parseLen(`-1' 0"`, 'ftin')).toBeCloseTo(-304.8, 6);
    expect(parseLen('세로', 'ftin')).toBeNull();
  });
  test('round trip through fmtLen keeps the value within a tenth of an inch', () => {
    for (const mm of [0, 1, 999.5, 3810, 12345.7]) {
      const back = parseLen(fmtLen(mm, 'ftin'), 'ftin');
      expect(Math.abs(back - mm)).toBeLessThan(2.55);
    }
  });
});

describe('fmtArea', () => {
  test('m² by default, 평 when asked, one decimal either way', () => {
    expect(fmtArea(12.34)).toBe('12.3 m²');
    expect(fmtArea(12.34, { unit: false })).toBe('12.3');
    expect(fmtArea(33.058, { pyeong: true })).toBe('10.0 평');
    expect(fmtArea(3.3058, { pyeong: true })).toBe('1.0 평');
    expect(fmtArea('x')).toBe('0.0 m²');
    expect(M2_PER_PYEONG).toBe(3.3058);
  });
});

test('esc escapes the characters that break HTML attributes and text', () => {
  expect(esc('<img src=x>')).toBe('&lt;img src=x&gt;');
  expect(esc('a" onfocus="y')).toBe('a&quot; onfocus=&quot;y');
  expect(esc('a & b')).toBe('a &amp; b');
  expect(esc(null)).toBe('');
  expect(esc(12.5)).toBe('12.5');
});
