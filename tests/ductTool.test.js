import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addItem, addWalls } from '../src/state/floorOps.js';
import { productById } from '../src/products/catalog.js';
import { rectWalls } from '../src/geom/walls.js';
import { createDuctTool, DUCT_TOOL_DEFAULTS } from '../src/view2d/tools/ductTool.js';
import { KEYMAP, TABLE } from '../src/ui/keymap.js';
import { RESERVED_KEYS } from '../src/ui/keyBindings.js';

const key = k => ({ key: k, preventDefault() {} });
const fakeView = { camera: { scale: 0.1 }, units: 'mm', COLORS: { guide: '#e8b100', dim: '#1b2430', wallSel: '#14b8c4' }, toScreen: p => [p[0] * 0.1, p[1] * 0.1], label() {} };

// 토스트는 주입으로 받는다(§17.9): 이 파일은 node 환경이라 document가 없다 — ui/toast.js를
// 직접 부르면 그리기 테스트 전부가 던진다(placeTool·structTool과 같은 주입 규칙이다).
function setup(opts = {}) {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [8000, 6000], 200));
  const hood = addItem(store, createItem(productById('hood-box'), { pos: [2000, 1500], z: 1700 }));
  let done = 0;
  const toasts = [];
  const t = createDuctTool({ store, ui, view: fakeView, opts: { ...DUCT_TOOL_DEFAULTS, ...opts }, onDone: () => { done += 1; }, toast: m => toasts.push(m) });
  return { store, ui, t, hood, toasts, done: () => done, floor: () => activeFloor(store.get()) };
}

describe('덕트 그리기 도구(DT-01~03)', () => {
  test('점을 찍고 Enter로 끝내면 덕트 하나가 한 단계로 생긴다', () => {
    const { store, ui, t, done, floor } = setup();
    t.opts.w = 750; t.opts.h = 400; t.opts.z = 2650; t.opts.system = ' F-2 ';
    t.onPointerDown([500, 500]);
    t.onPointerDown([5000, 500]);
    t.onPointerDown([5000, 4000]);
    expect(floor().ducts).toHaveLength(0);       // 완료 전에는 상태를 건드리지 않는다
    expect(t.onKey(key('Enter'))).toBe(true);
    const d = floor().ducts[0];
    expect(d.points).toEqual([[500, 500], [5000, 500], [5000, 4000]]);
    expect(d.segments).toEqual([{ w: 750, h: 400, z: 2650 }, { w: 750, h: 400, z: 2650 }]);
    expect(d.kind).toBe('exhaust');
    expect(d.system).toBe('F-2');                 // 앞뒤 공백은 잘라 낸다
    expect(ui.get().selection).toEqual({ type: 'duct', id: d.id, segment: null, vertex: null });
    expect(done()).toBe(1);
    store.undo();
    expect(floor().ducts).toHaveLength(0);
  });

  test('직교 모드가 이전 점 기준으로 축을 잠근다(끄면 그대로)', () => {
    const { t } = setup();
    t.onPointerDown([0, 0]);
    t.onPointerMove([3000, 200]);
    expect(t.getPreview().cursor).toEqual([3000, 0]);
    t.opts.ortho = false;
    t.onPointerMove([3000.5, 200.25]);
    expect(t.getPreview().cursor).toEqual([3000.5, 200.25]);
  });

  test('설비 위 클릭은 접속점에 스냅하고 연결로 기록된다(DT-02)', () => {
    const { t, hood, floor } = setup();
    t.onPointerDown([2150, 1600]);                // 후드 중심에서 180 mm — 허용 300 mm 안
    expect(t.getPreview().points[0]).toEqual([2000, 1500]);
    t.onPointerDown([6000, 1500]);
    t.onKey(key('Enter'));
    const d = floor().ducts[0];
    expect(d.connections).toEqual([{ point: 0, itemId: hood }]);
    expect(d.points[0]).toEqual([2000, 1500]);
  });

  test('마지막 점을 다시 클릭하면 완료된다(더블클릭도 같은 경로다)', () => {
    const { t, floor, done } = setup();
    t.onPointerDown([0, 0]);
    t.onPointerDown([4000, 0]);
    t.onPointerDown([4000, 0]);                   // 같은 자리 재클릭
    expect(floor().ducts).toHaveLength(1);
    expect(done()).toBe(1);
  });

  test('Backspace는 마지막 점과 그 연결을 되돌리고, Esc는 그리던 것을 버린다', () => {
    const { t, floor, done } = setup();
    t.onPointerDown([2000, 1500]);                // 후드에 연결된 첫 점
    t.onPointerDown([6000, 1500]);
    expect(t.onKey(key('Backspace'))).toBe(true);
    expect(t.getPreview().points).toHaveLength(1);
    expect(t.onKey(key('Backspace'))).toBe(true);
    expect(t.getPreview().conns).toEqual([]);
    expect(t.onKey(key('Escape'))).toBe(false);   // 그리던 것이 없으면 Esc를 소비하지 않는다
    t.onPointerDown([0, 0]); t.onPointerDown([1000, 0]);
    expect(t.onKey(key('Escape'))).toBe(true);
    expect(floor().ducts).toHaveLength(0);
    expect(done()).toBe(1);
  });

  test('점 하나만 찍고 Enter를 누르면 덕트가 생기지 않는다', () => {
    const { t, floor } = setup();
    t.onPointerDown([0, 0]);
    t.onKey(key('Enter'));
    expect(floor().ducts).toHaveLength(0);
  });
});

describe('단축키 T', () => {
  test('KEYMAP에 덕트 그리기가 있고 T는 예약 키가 아니다', () => {
    const e = KEYMAP.find(x => x.action === 'tool:duct');
    expect(e).toMatchObject({ group: '도구', label: '덕트 그리기', keys: ['T'] });
    expect(TABLE.get('t')).toBe('tool:duct');
    expect(RESERVED_KEYS.some(r => r.key === 't')).toBe(false);
    expect(KEYMAP.filter(x => x.keys.includes('T'))).toHaveLength(1);   // 다른 동작이 T를 쓰지 않는다
  });

  // §17.9(3) · 감사 §16: 다 그려도 아무 말이 없었다. 2구간 · 총 5 m = 3000 + 2000 mm.
  test('덕트를 완성하면 구간 수와 총 길이를 알린다', () => {
    const { t, toasts, floor } = setup({ system: 'EA-1' });
    t.onPointerDown([500.5, 500.25]);
    t.onPointerDown([3500.5, 500.25]);
    t.onPointerDown([3500.5, 2500.25]);
    t.onKey(key('Enter'));
    expect(floor().ducts).toHaveLength(1);
    expect(toasts).toEqual(['덕트 2구간 · 총 5 m']);
  });

  test('계통이 비어 있으면 완성 토스트와 함께 경고 한 번을 더 낸다(막지는 않는다)', () => {
    const { t, toasts, floor } = setup({ system: '' });
    t.onPointerDown([500.5, 500.25]);
    t.onPointerDown([3500.5, 500.25]);
    t.onKey(key('Enter'));
    expect(floor().ducts).toHaveLength(1);                 // 계통 없는 덕트도 정당한 상태다
    expect(floor().ducts[0].system).toBe('');
    expect(toasts).toEqual(['덕트 1구간 · 총 3 m', '계통을 지정하지 않았습니다 — 풍량 표에 "미지정"으로 잡힙니다']);
  });

  test('점이 하나면 완성도 토스트도 없다', () => {
    const { t, toasts, floor, done } = setup();
    t.onPointerDown([500.5, 500.25]);
    expect(t.onKey(key('Enter'))).toBe(false);
    expect(floor().ducts).toHaveLength(0);
    expect(toasts).toEqual([]);
    expect(done()).toBe(0);
  });

  test('ft·in 모드에서도 덕트 길이는 m로 알린다(물량의 계약 단위)', () => {
    const { store, t, toasts } = setup({ system: 'EA-1' });
    store.dispatch(d => { d.units = 'ftin'; }, { record: false });
    t.onPointerDown([500.5, 500.25]);
    t.onPointerDown([3500.5, 500.25]);
    t.onKey(key('Enter'));
    expect(toasts[0]).toBe('덕트 1구간 · 총 3 m');
  });

  // 완성할 때만 기억한다: 그리다 [Esc]로 버린 계통은 남기지 않는다 — 기억(localStorage)에 대한
  // 단정은 jsdom인 tests/prefs.test.js가 진다(이 파일은 node 환경이라 localStorage가 없다).
  test('[Esc]로 버린 덕트는 아무것도 알리지 않는다', () => {
    const { t, toasts, floor } = setup({ system: 'EA-9' });
    t.onPointerDown([500.5, 500.25]);
    t.onPointerDown([3500.5, 500.25]);
    expect(t.onKey(key('Escape'))).toBe(true);
    expect(floor().ducts).toHaveLength(0);
    expect(toasts).toEqual([]);
  });
});

// 리뷰 I-4: getSnap()은 브리핑의 Produces 계약이자 마커가 읽는 표면이다(§16.6).
test('덕트 도구가 스냅 종류를 내놓는다(§16.6)', () => {
  const { t } = setup();                 // 8000×6000 벽 · scale 0.1 → 허용 80 mm
  t.onPointerMove([4000.5, 3000.25]);    // 방 한가운데: 아무 대상도 없다(첫 점 전이라 직교도 걸리지 않는다)
  expect(t.getSnap()).toBeNull();
  t.onPointerMove([60.5, 40.25]);        // 아래쪽 벽면에서 40.25 mm
  expect(t.getSnap()).toEqual({ point: [60.5, 0], hit: 'wall' });
  t.onPointerDown([5000.5, 4000.25]);    // 첫 점(후드·벽에서 멀다)
  t.onPointerMove([5030.5, 4000.25]);    // 그 점에서 30 mm — 직교로 잠긴 뒤 점 스냅이 이긴다
  expect(t.getSnap()).toEqual({ point: [5000.5, 4000.25], hit: 'point' });
});
