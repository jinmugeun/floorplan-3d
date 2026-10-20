// 계획 17 Task 1: 급식실 룩 측정의 순수 부분(tools/look/probeLib.mjs).
import { test, expect } from 'vitest';
import { median, p90, summarize, probeVerdict, FRAME_FLOOR_MS } from '../tools/look/probeLib.mjs';

test('중앙값·p90은 유한수만 본다', () => {
  expect(median([3, 1, 2])).toBe(2);
  expect(median([4, 1, 2, 3])).toBe(2.5);
  expect(median([NaN, 5])).toBe(5);
  expect(Number.isNaN(median([]))).toBe(true);
  expect(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(10);
});

test('회마다 잰 값을 중앙값으로 묶고 오류는 더한다', () => {
  const r = (g, e = []) => ({ firstMs: 400, firstDraws: 900, orbitGapMs: g, orbitP90Ms: g + 2, draws: 800, errors: e });
  expect(summarize([r(10), r(12), r(30, ['x'])])).toEqual({ firstMs: 400, firstDraws: 900, orbitGapMs: 12, orbitP90Ms: 14, draws: 800, errors: 1, runs: 3 });
});

test('게이트: 기준 × 1.5와 16.7 ms 중 큰 값까지 · 오류 0', () => {
  expect(probeVerdict({ orbitGapMs: 10 }, { orbitGapMs: 16, errors: 0 })).toMatchObject({ ok: true, limit: FRAME_FLOOR_MS });
  expect(probeVerdict({ orbitGapMs: 20 }, { orbitGapMs: 29, errors: 0 })).toMatchObject({ ok: true, limit: 30 });
  expect(probeVerdict({ orbitGapMs: 20 }, { orbitGapMs: 31, errors: 0 }).ok).toBe(false);
  expect(probeVerdict({ orbitGapMs: 10 }, { orbitGapMs: 9, errors: 2 }).problems).toEqual(['페이지 오류 2건']);
  expect(probeVerdict(null, { orbitGapMs: NaN, errors: 0 }).problems).toEqual(['궤도 값 없음']);
});
