// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { createArrangeActions, PATH_TOOL, spacingDefault } from '../src/app/arrangeActions.js';

const fakeView = { camera: { scale: 0.1 }, requestRender: () => {} };
function setup(productId = 'dining-6') {
  const store = createStore(createEmptyProject()), ui = createUiState();
  addWalls(store, rectWalls([0, 0], [8000, 6000], 200));
  const id = addItem(store, createItem(productById(productId), { pos: [1000.5, 1000.25] }));
  const tools = [], toasts = [];
  const a = createArrangeActions({ store, ui, view: fakeView, toast: m => toasts.push(m), setTool: n => tools.push(n) });
  return { store, ui, id, tools, toasts, ...a, floor: () => activeFloor(store.get()) };
}
const modal = () => document.querySelector('.modal');

beforeEach(() => { document.body.innerHTML = ''; });

describe('경로 배열 배선', () => {
  test('긴 변이 간격 기본값이다', () => {
    expect(spacingDefault({ size: [1800, 900, 750] })).toBe(1800);
    expect(spacingDefault({ size: [450, 500, 900] })).toBe(500);
    expect(spacingDefault(null)).toBe(600);
    expect(PATH_TOOL).toBe('pathArray');
  });

  test('2D에서 선택이 있으면 도구를 켜고, 도구가 끝나면 대화상자 → 사본 → 토스트로 이어진다', () => {
    const a = setup();
    expect(a.pathArray([a.id])).toBe(true);
    expect(a.tools).toEqual(['pathArray']);
    const tool = a.createPathTool();
    expect(tool.name).toBe('pathArray');
    tool.onPointerDown([2000, 1000], {});
    tool.onPointerDown([2000, 4000], {});
    tool.onKey({ key: 'Enter', preventDefault() {} });
    expect(a.tools).toEqual(['pathArray', 'select']);     // 경로를 끝내면 선택 도구로 돌아온다
    expect(modal().textContent).toContain('경로 배열 복사');
    expect(modal().querySelector('[name="spacing"]').value).toBe('1800'); // dining-6의 긴 변
    modal().querySelector('[name="spacing"]').value = '1000';
    modal().querySelector('[name="apply"]').click();
    const copies = a.floor().items.slice(1);
    expect(copies).toHaveLength(4);                        // 0 · 1000 · 2000 · 3000
    expect(copies.map(i => i.pos[1])).toEqual([1000, 2000, 3000, 4000]);
    expect(copies.every(i => i.rot === 90)).toBe(true);    // 남쪽으로 가는 경로
    expect(a.toasts).toEqual(['4개 복사했습니다']);
    a.store.undo();
    expect(a.floor().items).toHaveLength(1);               // 한 단계
  });

  test('취소한 경로는 대화상자를 열지 않고 선택 도구로만 돌아온다', () => {
    const a = setup();
    a.pathArray([a.id]);
    const tool = a.createPathTool();
    tool.onPointerDown([2000, 1000], {});
    tool.onKey({ key: 'Escape', preventDefault() {} });
    expect(a.tools).toEqual(['pathArray', 'select']);
    expect(modal()).toBeNull();
    expect(a.floor().items).toHaveLength(1);
    expect(a.toasts).toEqual([]);
  });

  test('선택이 없으면 아무 일도 없고, 3D에서는 토스트로 알린다', () => {
    const a = setup();
    expect(a.pathArray([])).toBe(false);
    expect(a.tools).toEqual([]);
    a.ui.set({ mode: 'iso' });
    expect(a.pathArray([a.id])).toBe(false);
    expect(a.tools).toEqual([]);
    expect(a.toasts).toEqual(['2D에서 사용']);
  });
});
