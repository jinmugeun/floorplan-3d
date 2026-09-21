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

function setup() {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [8000, 6000], 200));
  const hood = addItem(store, createItem(productById('hood-box'), { pos: [2000, 1500], z: 1700 }));
  let done = 0;
  const t = createDuctTool({ store, ui, view: fakeView, opts: { ...DUCT_TOOL_DEFAULTS }, onDone: () => { done += 1; } });
  return { store, ui, t, hood, done: () => done, floor: () => activeFloor(store.get()) };
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
});
