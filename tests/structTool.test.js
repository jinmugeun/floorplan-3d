import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { createStructTool, structDefaults, STRUCT_KINDS, STRUCT_PRODUCT, STRUCT_LABELS } from '../src/view2d/tools/structTool.js';

const fakeView = { camera: { scale: 0.1 }, requestRender: () => {} };
function setup(kind = 'column-square', height = null) {
  const store = createStore(createEmptyProject()), ui = createUiState();
  addWalls(store, rectWalls([0, 0], [6000, 4000], 200));
  if (height) store.dispatch(d => { activeFloor(d).height = height; });
  const done = [];
  const t = createStructTool({ store, ui, view: fakeView, kind, onDone: () => done.push(kind) });
  return { store, ui, t, done, floor: () => activeFloor(store.get()) };
}
const items = a => a.floor().items;

describe('구조물 도구(기둥·개구부)', () => {
  test('옵션 기본값은 400·400·층고이고 개구부는 900·2100·0이다', () => {
    expect(STRUCT_KINDS).toEqual(['column-square', 'column-round', 'opening']);
    expect(STRUCT_PRODUCT).toEqual({ 'column-square': 'column-square', 'column-round': 'column-round', opening: 'opening-pass' });
    expect(STRUCT_LABELS).toEqual({ 'column-square': '사각 기둥', 'column-round': '원형 기둥', opening: '개구부' });
    expect(structDefaults('column-square', 2700)).toEqual({ w: 400, d: 400, h: 2700 });
    expect(structDefaults('column-round', 2700)).toEqual({ w: 400, h: 2700 });   // 원형은 지름 하나
    expect(structDefaults('opening')).toEqual({ w: 900, h: 2100, sill: 0 });
    expect(structDefaults('column-square')).toEqual({ w: 400, d: 400, h: 2300 });
    expect(setup('column-square', 2700).t.opts).toEqual({ w: 400, d: 400, h: 2700 });
  });

  test('클릭마다 하나씩 놓고 도구는 켜진 채로 있다(소수 좌표는 반올림된다)', () => {
    const a = setup('column-square');
    expect(a.t.name).toBe('column-square');
    a.t.onPointerMove([3000.5, 2000.25], {});
    a.t.onPointerDown([3000.5, 2000.25], {});
    expect(items(a)).toHaveLength(1);
    expect(a.done).toEqual([]);                       // onDone이 불리지 않는다 = 도구가 켜져 있다
    expect(items(a)[0].pos).toEqual([3001, 2000]);
    expect(items(a)[0].kind).toBe('column');
    expect(items(a)[0].size).toEqual([400, 400, 2300]);
    expect(items(a)[0].productId).toBe('column-square');
    expect(a.ui.get().selection).toEqual({ type: 'item', id: items(a)[0].id });
    a.t.onPointerDown([1500, 2000], {});
    expect(items(a)).toHaveLength(2);
    expect(a.ui.get().selection.id).toBe(items(a)[1].id);
  });

  test('옵션 바에서 크기를 바꾸면 다음에 놓는 기둥이 그 크기다', () => {
    const a = setup('column-square');
    a.t.opts.w = 600; a.t.opts.d = 250; a.t.opts.h = 2000;
    a.t.onPointerDown([3000, 2000], {});
    expect(items(a)[0].size).toEqual([600, 250, 2000]);
    expect(a.t.getGhost().item.size).toEqual([600, 250, 2000]);
  });

  test('원형 기둥은 지름 하나로 정사각 크기를 만든다', () => {
    const a = setup('column-round');
    expect(a.t.opts).toEqual({ w: 400, h: 2300 });
    a.t.opts.w = 500;
    a.t.onPointerDown([3000, 2000], {});
    expect(items(a)[0].productId).toBe('column-round');
    expect(items(a)[0].size).toEqual([500, 500, 2300]);
  });

  test('개구부는 벽에 박혀 앉고 sill이 밑선 높이가 된다', () => {
    const a = setup('opening');
    expect(a.t.opts).toEqual({ w: 900, h: 2100, sill: 0 });
    a.t.opts.sill = 300;
    a.t.onPointerDown([3000, 50], {});                // 위쪽 벽(중심선 y = 0)에서 50 mm 안쪽
    expect(items(a)).toHaveLength(1);
    const op = items(a)[0];
    expect(op.kind).toBe('opening');
    expect(op.attach).toBe('wall');
    expect(op.wallId).toBeTruthy();
    expect(op.pos).toEqual([3000, 0]);                // 벽 두께 안에 박힌다(embed)
    expect(op.z).toBe(300);
    expect(op.size).toEqual([900, 40, 2100]);         // 깊이는 제품 값 그대로
    expect(op.t).toBeCloseTo(0.5, 6);
    // 벽이 멀면 놓지 않는다(벽 없는 개구부는 뜻이 없다).
    a.t.onPointerDown([3000, 2000], {});
    expect(items(a)).toHaveLength(1);
  });

  test('[Esc]·안내 문구 클릭·우클릭이 도구를 끝낸다', () => {
    const a = setup('opening');
    expect(a.t.onKey({ key: 'Escape', preventDefault() {} })).toBe(true);
    expect(a.done).toEqual(['opening']);
    expect(a.t.onKey({ key: 'x', preventDefault() {} })).toBe(false);
    a.t.onHintClick();
    expect(a.t.onContextMenu([0, 0], {})).toBeNull();
    expect(a.done).toEqual(['opening', 'opening', 'opening']);
    expect(a.t.hint).toContain('[Esc]');
    expect(a.t.hint).toContain('개구부');
  });

  test('모르는 kind는 사각 기둥으로 떨어지고 고스트는 늘 있다', () => {
    const store = createStore(createEmptyProject()), ui = createUiState();
    addWalls(store, rectWalls([0, 0], [6000, 4000], 200));
    const t = createStructTool({ store, ui, view: fakeView, kind: '없음' });
    expect(t.name).toBe('column-square');
    expect(t.getGhost().item.productId).toBe('column-square');
    expect(Array.isArray(t.getGhost().guides)).toBe(true);
  });
});
