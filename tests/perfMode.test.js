import { describe, test, expect } from 'vitest';
import { PERF_SETTINGS, perfSettings, perfPixelRatio, applyPerfMode } from '../src/view3d/perfMode.js';
import { DEFAULT_VIEW } from '../src/state/schema.js';

const stubRenderer = () => {
  const calls = [];
  return { calls, shadowMap: { enabled: true }, setPixelRatio: r => calls.push(r) };
};

describe('성능 모드', () => {
  test('두 모드의 설정이 §13.4대로 고정되어 있고 기본은 디스플레이 우선이다', () => {
    expect(PERF_SETTINGS.display).toEqual({ pixelRatio: null, shadows: true, labels: true, edges: true });
    expect(PERF_SETTINGS.performance).toEqual({ pixelRatio: 1, shadows: false, labels: false, edges: false });
    expect(DEFAULT_VIEW.perfMode).toBe('display');
    expect(perfSettings('performance').shadows).toBe(false);
    expect(perfSettings('없음')).toEqual(PERF_SETTINGS.display);   // 모르는 값은 디스플레이 우선
    expect(perfSettings()).toEqual(PERF_SETTINGS.display);
  });

  test('픽셀 비율: 디스플레이 우선은 dpr을 2까지, 성능 우선은 늘 1이다', () => {
    expect(perfPixelRatio('display', 3)).toBe(2);
    expect(perfPixelRatio('display', 1.5)).toBe(1.5);
    expect(perfPixelRatio('display', 1)).toBe(1);
    expect(perfPixelRatio('performance', 3)).toBe(1);
    expect(perfPixelRatio('performance', 1)).toBe(1);
  });

  test('applyPerfMode가 렌더러의 픽셀 비율·그림자와 햇빛의 castShadow를 바꾼다', () => {
    const renderer = stubRenderer();
    const sun = { castShadow: true };
    const s = applyPerfMode('performance', { renderer, sun, dpr: 3 });
    expect(renderer.calls).toEqual([1]);
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(sun.castShadow).toBe(false);
    expect(s).toEqual(PERF_SETTINGS.performance);
    applyPerfMode('display', { renderer, sun, dpr: 3 });
    expect(renderer.calls).toEqual([1, 2]);
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(sun.castShadow).toBe(true);
  });

  test('렌더러·햇빛이 없어도 던지지 않는다(테스트·헤드리스 경로)', () => {
    expect(() => applyPerfMode('performance')).not.toThrow();
    expect(applyPerfMode('performance', { renderer: {}, sun: null, dpr: 2 })).toEqual(PERF_SETTINGS.performance);
  });
});
