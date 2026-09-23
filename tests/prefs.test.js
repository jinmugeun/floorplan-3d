// @vitest-environment jsdom
// §14.7: "그린 뒤 도구 유지"는 브라우저에만 남는다(프로젝트 파일은 바이트 하나도 늘지 않는다).
import { test, expect, beforeEach } from 'vitest';
import { STICKY_TOOLS_KEY, stickyTools, setStickyTools, DUCT_SYSTEM_KEY, lastDuctSystem, setLastDuctSystem, LABEL_DENSITY_KEY, labelDensity, setLabelDensity } from '../src/ui/prefs.js';
import { DUCT_NO_SYSTEM } from '../src/ui/messages.js';

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

// 리뷰 I-1: finish() → setLastDuctSystem 경로는 여기서만 덮을 수 있다(tests/ductTool.test.js는
// node 환경이라 localStorage가 아예 없어 기록이 조용히 삼켜진다). 실제로 그려서 단정한다.
async function ductKit() {
  const { createDuctTool, DUCT_TOOL_DEFAULTS } = await import('../src/view2d/tools/ductTool.js');
  const { createStore } = await import('../src/state/store.js');
  const { createUiState } = await import('../src/state/uistate.js');
  const { createEmptyProject, activeFloor } = await import('../src/state/schema.js');
  const store = createStore(createEmptyProject()), ui = createUiState(), toasts = [];
  return {
    DUCT_TOOL_DEFAULTS, toasts,
    make: opts => createDuctTool({ store, ui, view: { camera: { scale: 0.1 } }, opts, toast: m => toasts.push(m) }),
    draw: t => { t.onPointerDown([500.5, 500.25]); t.onPointerDown([3500.5, 500.25]); },
    key: k => ({ key: k, preventDefault() {} }),
    ducts: () => activeFloor(store.get()).ducts,
  };
}

test('완성한 덕트의 계통을 기억하고 [Esc]로 버린 값은 남기지 않는다', async () => {
  const { make, draw, key, DUCT_TOOL_DEFAULTS, ducts } = await ductKit();
  const a = make({ ...DUCT_TOOL_DEFAULTS, system: 'EA-1' });
  draw(a); a.onKey(key('Enter'));
  expect(ducts()).toHaveLength(1);
  expect(localStorage.getItem(DUCT_SYSTEM_KEY)).toBe('EA-1');
  const b = make({ ...DUCT_TOOL_DEFAULTS, system: 'EA-9' });   // 버린 계통은 덮어쓰지 않는다
  draw(b); b.onKey(key('Escape'));
  expect(ducts()).toHaveLength(1);
  expect(localStorage.getItem(DUCT_SYSTEM_KEY)).toBe('EA-1');
  expect(lastDuctSystem()).toBe('EA-1');
});

// §17.9(1) 개정(리뷰 I-2): 기억은 마지막으로 **완성한** 덕트의 계통이다 — 빈 값도 포함한다.
// 그래야 일부러 비운 계통이 다음 활성화에서 조용히 되채워져 엉뚱한 계통으로 합산되지 않는다.
test('일부러 비운 계통은 빈 값으로 기억되고 다음 활성화에서 되채워지지 않는다', async () => {
  const { make, draw, key, toasts, DUCT_TOOL_DEFAULTS } = await ductKit();
  setLastDuctSystem('EA-1');
  const shared = { ...DUCT_TOOL_DEFAULTS };        // main.js의 toolOpts.duct처럼 세션 내내 같은 객체다
  const a = make(shared);
  expect(a.opts.system).toBe('EA-1');              // 활성화할 때 기억을 읽는다
  shared.system = '';                              // 옵션 바에서 계통 칸을 지운다
  draw(a); a.onKey(key('Enter'));
  expect(localStorage.getItem(DUCT_SYSTEM_KEY)).toBe('');
  expect(lastDuctSystem()).toBe('');
  expect(toasts.filter(m => m === DUCT_NO_SYSTEM)).toHaveLength(1);   // 경고는 완성 1회뿐이다
  const b = make(shared);                          // 같은 객체로 도구를 다시 켠다
  expect(b.opts.system).toBe('');
});

// §17.10(2): 라벨 밀도는 프로젝트가 아니라 브라우저에 남는다(저장 형식 무변경).
test('kvp.labelDensity의 기본값은 auto이고 세 값만 받는다', () => {
  expect(LABEL_DENSITY_KEY).toBe('kvp.labelDensity');
  expect(labelDensity()).toBe('auto');
  setLabelDensity('all');
  expect(localStorage.getItem(LABEL_DENSITY_KEY)).toBe('all');
  expect(labelDensity()).toBe('all');
  setLabelDensity('off');
  expect(labelDensity()).toBe('off');
  setLabelDensity('엉터리');                       // 모르는 값은 기본값으로 답한다
  expect(labelDensity()).toBe('auto');
  const get = localStorage.getItem;
  localStorage.getItem = () => { throw new Error('막힘'); };
  try { expect(labelDensity()).toBe('auto'); } finally { localStorage.getItem = get; }
});
