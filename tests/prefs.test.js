// @vitest-environment jsdom
// §14.7: "그린 뒤 도구 유지"는 브라우저에만 남는다(프로젝트 파일은 바이트 하나도 늘지 않는다).
import { test, expect, beforeEach } from 'vitest';
import { STICKY_TOOLS_KEY, stickyTools, setStickyTools } from '../src/ui/prefs.js';

beforeEach(() => localStorage.clear());

test('기본값은 켜짐이고 끈 값만 저장된다', () => {
  expect(STICKY_TOOLS_KEY).toBe('kvp.stickyTools');
  expect(stickyTools()).toBe(true);
  setStickyTools(false);
  expect(localStorage.getItem(STICKY_TOOLS_KEY)).toBe('0');
  expect(stickyTools()).toBe(false);
  setStickyTools(true);
  expect(stickyTools()).toBe(true);
});

test('저장이 막힌 브라우저에서도 던지지 않고 기본값으로 답한다', () => {
  const get = localStorage.getItem, set = localStorage.setItem;
  localStorage.getItem = () => { throw new Error('막힘'); };
  localStorage.setItem = () => { throw new Error('막힘'); };
  try {
    expect(stickyTools()).toBe(true);
    expect(() => setStickyTools(false)).not.toThrow();
  } finally { localStorage.getItem = get; localStorage.setItem = set; }
});
