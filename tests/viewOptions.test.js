import { test, expect } from 'vitest';
import { V2_OPTIONS, V3_OPTIONS, DISPLAY_MODES, PERF_MODES, viewPopoverHtml } from '../src/ui/viewOptions.js';
import { DEFAULT_VIEW } from '../src/state/schema.js';

test('option lists cover every schema flag with Korean labels', () => {
  expect(V2_OPTIONS.map(o => o[0]).sort()).toEqual(Object.keys(DEFAULT_VIEW.v2).sort());
  expect(V3_OPTIONS.map(o => o[0]).sort()).toEqual(Object.keys(DEFAULT_VIEW.v3).sort());
  expect(V2_OPTIONS.find(o => o[0] === 'grid')[1]).toBe('격자');
  expect(V3_OPTIONS.find(o => o[0] === 'outerWalls')[1]).toBe('외벽 보기');
  expect(DISPLAY_MODES).toEqual([['normal', '일반'], ['white', '화이트 단색'], ['transparent', '투명']]);
  expect(PERF_MODES).toEqual([['display', '디스플레이 우선'], ['performance', '성능 우선']]);
});

test('2D popover lists v2 flags only; 3D popover adds display, hidden line and performance', () => {
  const two = viewPopoverHtml(DEFAULT_VIEW, '2d');
  expect(two).toContain('data-v2="grid"');
  expect(two).toContain('checked');
  expect(two).not.toContain('data-v3=');
  expect(two).not.toContain('디스플레이 모드');
  const three = viewPopoverHtml(DEFAULT_VIEW, 'iso');
  expect(three).toContain('data-v3="outerWalls"');
  expect(three).toContain('data-view="cutaway"');
  expect(three).toContain('디스플레이 모드');
  expect(three).toContain('data-view="display"');
  expect(three).toContain('data-view="hiddenLine"');
  expect(three).toContain('data-view="perfMode"');
});

test('unchecked flags render without the checked attribute', () => {
  const html = viewPopoverHtml({ ...DEFAULT_VIEW, v2: { ...DEFAULT_VIEW.v2, grid: false } }, '2d');
  expect(html).toContain('<input type="checkbox" data-v2="grid" >');
});
