// @vitest-environment jsdom
// §14.7: "그린 뒤 도구 유지"는 브라우저에만 남는다(프로젝트 파일은 바이트 하나도 늘지 않는다).
import { test, expect, beforeEach } from 'vitest';
import { STICKY_TOOLS_KEY, stickyTools, setStickyTools, DUCT_SYSTEM_KEY, lastDuctSystem, setLastDuctSystem } from '../src/ui/prefs.js';

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

// §17.9(1) · 감사 §15: 계통 칸이 빈 채로 그려져 풍량 표에 "미지정" 줄이 생겼다.
// 값은 브라우저에만 남는다(프로젝트 파일도, 되돌리기 스택도 건드리지 않는다).
test('kvp.ductSystem은 직전 계통을 기억하고 없으면 빈 문자열이다', () => {
  expect(DUCT_SYSTEM_KEY).toBe('kvp.ductSystem');
  expect(lastDuctSystem()).toBe('');
  setLastDuctSystem('EA-1');
  expect(localStorage.getItem(DUCT_SYSTEM_KEY)).toBe('EA-1');
  expect(lastDuctSystem()).toBe('EA-1');
  setLastDuctSystem(null);
  expect(lastDuctSystem()).toBe('');
  const set = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('막힘'); };
  try { expect(() => setLastDuctSystem('F-3')).not.toThrow(); } finally { localStorage.setItem = set; }
});

// 도구를 만들 때 채운다: 옵션 객체를 넘기지 않은 경우(새 도구)와 빈 계통 모두 같다.
test('덕트 도구는 직전 계통을 기본값으로 쓴다', async () => {
  const { createDuctTool, DUCT_TOOL_DEFAULTS } = await import('../src/view2d/tools/ductTool.js');
  const { createStore } = await import('../src/state/store.js');
  const { createUiState } = await import('../src/state/uistate.js');
  const { createEmptyProject } = await import('../src/state/schema.js');
  expect(DUCT_TOOL_DEFAULTS.system).toBe('');                    // 기본값 자체는 그대로다(저장 형식 무변경)
  setLastDuctSystem('EA-1');
  const store = createStore(createEmptyProject()), ui = createUiState();
  const t = createDuctTool({ store, ui, view: { camera: { scale: 0.1 } } });
  expect(t.opts.system).toBe('EA-1');
  // 사용자가 이미 고쳐 둔 값은 이긴다(세션 동안 유지되는 도구 옵션이 먼저다).
  const t2 = createDuctTool({ store, ui, view: { camera: { scale: 0.1 } }, opts: { ...DUCT_TOOL_DEFAULTS, system: 'SA-2' } });
  expect(t2.opts.system).toBe('SA-2');
});
