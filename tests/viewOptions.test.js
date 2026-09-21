import { test, expect } from 'vitest';
import { V2_OPTIONS, V3_OPTIONS, DISPLAY_MODES, PERF_MODES, viewPopoverHtml, cameraPopoverHtml, sunPopoverHtml } from '../src/ui/viewOptions.js';
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

test('camera popover has a projection select, three sliders and min/default/max buttons', () => {
  const html = cameraPopoverHtml(DEFAULT_VIEW);
  expect(html).toContain('data-view="projection"');
  expect(html).toContain('원근'); expect(html).toContain('직교');
  for (const [path, min, def, max] of [['cameraPreset.elevation', 0, 35, 89], ['cameraPreset.azimuth', 0, 47, 359], ['cameraPreset.fov', 15, 60, 120]]) {
    expect(html).toContain(`data-view="${path}"`);
    expect(html).toContain(`data-preset="${path}:${min}"`);
    expect(html).toContain(`data-preset="${path}:${def}"`);
    expect(html).toContain(`data-preset="${path}:${max}"`);
  }
  expect(html).toContain('카메라 고도'); expect(html).toContain('방위각'); expect(html).toContain('시야각');
});

test('sun popover exposes month, hour, intensity, azimuth and ambient', () => {
  const html = sunPopoverHtml(DEFAULT_VIEW);
  for (const k of ['sun.month', 'sun.hour', 'sun.intensity', 'sun.azimuth', 'sun.ambient']) expect(html).toContain(`data-view="${k}"`);
  expect(html).toContain('월'); expect(html).toContain('시간'); expect(html).toContain('강도'); expect(html).toContain('환경광');
  expect(html).toContain('value="6"'); // 기본 월
});

// §13.4: 성능 모드가 무엇을 끄는지 한 줄로 알려 준다.
test('3D 보기 팝오버의 성능 모드에 설명 한 줄이 붙는다', () => {
  const html = viewPopoverHtml(DEFAULT_VIEW, 'iso');
  expect(html).toContain('그림자·윤곽선·라벨을 끄고 픽셀 비율을 1로');
  expect(viewPopoverHtml(DEFAULT_VIEW, '2d')).not.toContain('픽셀 비율');
  expect(V2_OPTIONS.find(o => o[0] === 'collisionLive')[1]).toBe('실시간 충돌 감지');
  expect(V3_OPTIONS.some(o => o[0] === 'collisionLive')).toBe(false);
});
