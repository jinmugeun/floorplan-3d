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

  // M-1: 1인칭 찍기는 mode가 '2d'라서 mode 검사만으로는 통과했다. 그 상태에서 도구를 켜면
  // 첫 클릭을 1인칭 진입 리스너가 가져가고 도구가 보이지 않게 남는다.
  test('1인칭 찍기 중에는 Alt+S가 도구를 켜지 않는다', () => {
    const a = setup();
    a.ui.set({ fpPick: true, mode: '2d' });
    expect(a.pathArray([a.id])).toBe(false);
    expect(a.tools).toEqual([]);
    expect(a.toasts).toEqual(['2D에서 사용']);
  });

  // I-1: 200 m 경로 + 최소 간격이 20001개를 만들려다 arrayCopy의 push 스프레드에서 RangeError를 냈다.
  test('200 m 경로에 최소 간격을 넣으면 예외 없이 거절하고 아무것도 만들지 않는다', () => {
    const a = setup();
    a.pathArray([a.id]);
    const tool = a.createPathTool();
    tool.onPointerDown([2000.5, 1000.25], {});
    tool.onPointerDown([2000.5, 201000.25], {});          // 200 m
    tool.onKey({ key: 'Enter', preventDefault() {} });
    modal().querySelector('[name="spacing"]').value = '1'; // 대화상자 min이 10으로 자르고도 20001개다
    modal().querySelector('[name="apply"]').click();
    expect(a.floor().items).toHaveLength(1);               // 사본 0개
    expect(a.toasts).toEqual(['배치 수가 너무 많습니다(최대 500)']);
    expect(modal()).toBeNull();                            // 예외가 없으니 모달도 닫힌다
    a.store.undo();
    expect(a.floor().items).toHaveLength(0);               // 되돌리면 원본 추가로 곧장 간다(경로 단계가 없다)
  });

  // 총 배치 수는 개수 × 선택 수다(아이템마다 같은 경로를 따른다). 개수 모드도 같은 상한을 지난다.
  test('선택 수를 곱한 총 배치 수도 상한을 넘으면 거절하고, 다중 선택은 겹침을 알린다', () => {
    const a = setup();
    const b = addItem(a.store, createItem(productById('chair-dining'), { pos: [2500.5, 1500.25] }));
    a.pathArray([a.id, b]);
    const tool = a.createPathTool();
    tool.onPointerDown([2000, 1000], {});
    tool.onPointerDown([2000, 4000], {});
    tool.onKey({ key: 'Enter', preventDefault() {} });
    expect(a.toasts).toEqual(['여러 개를 고르면 사본이 경로점마다 같은 자리에 겹칩니다']);
    modal().querySelector('[name="count"]').value = '300';   // 300 × 2 = 600 > 500
    modal().querySelector('[name="apply"]').click();
    expect(a.floor().items).toHaveLength(2);
    expect(a.toasts[1]).toBe('배치 수가 너무 많습니다(최대 500)');
  });

  // 대화상자의 min은 브라우저 검증일 뿐이다. 배선 층이 같은 하한을 한 번 더 건다.
  test('대화상자 min을 지나친 간격도 배선 층이 10 mm로 올린다', () => {
    const a = setup();
    a.pathArray([a.id]);
    const tool = a.createPathTool();
    tool.onPointerDown([2000, 1000], {});
    tool.onPointerDown([2000, 1300], {});                  // 300 mm 경로
    tool.onKey({ key: 'Enter', preventDefault() {} });
    const el = modal().querySelector('[name="spacing"]');
    el.min = '0.001'; el.value = '1';                      // 검증을 건너뛴 값
    modal().querySelector('[name="apply"]').click();
    expect(a.floor().items.slice(1)).toHaveLength(31);      // 10 mm 간격 31개(1 mm면 301개였다)
    expect(a.toasts).toEqual(['31개 복사했습니다']);
  });
});
