// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createKeyHandler, KEYMAP, TABLE, FP_ALLOWED, PREVENT, tokenOf } from '../src/ui/keymap.js';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, pasteItems } from '../src/state/floorOps.js';
import { productById } from '../src/products/catalog.js';
import { rectWalls } from '../src/geom/walls.js';
import { createSelectTool } from '../src/view2d/tools/selectTool.js';

function setup(toolConsumes = false) {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const calls = { setTool: [], setMode: [], bg: 0, del: 0, save: 0 };
  const view = { tool: { onKey: vi.fn(() => toolConsumes) }, requestRender: vi.fn() };
  const h = createKeyHandler({ store, ui, view, setTool: n => calls.setTool.push(n), setMode: m => calls.setMode.push(m), openBackground: () => calls.bg++, deleteSelection: () => calls.del++, save: () => calls.save++ });
  const key = (key, extra = {}) => h({ key, target: document.body, preventDefault() {}, ...extra });
  return { store, ui, view, calls, key };
}

test('a consuming tool blocks app keys; otherwise app keys route', () => {
  const a = setup(true); a.key('f'); a.key('z', { ctrlKey: true });
  expect(a.calls.setTool).toEqual([]); expect(a.view.requestRender).toHaveBeenCalledTimes(2);
  const b = setup(false); b.key('f'); b.key('l'); b.key('d'); b.key('e'); b.key('m'); b.key('b'); b.key('2'); b.key('4'); b.key('Delete'); b.key('s', { ctrlKey: true });
  expect(b.calls.setTool).toEqual(['room', 'wall', 'delete', 'guide', 'measure']); expect(b.calls.bg).toBe(1);
  expect(b.calls.setMode).toEqual(['plan', 'fp']); expect(b.calls.del).toBe(1); expect(b.calls.save).toBe(1);
});

test('escape clears fpPick and returns to select', () => {
  const a = setup(); a.ui.set({ fpPick: true }); a.key('Escape');
  expect(a.ui.get().fpPick).toBe(false); expect(a.calls.setTool).toEqual(['select']);
});

test('ctrl+z undoes and ctrl+shift+z redoes', () => {
  const a = setup(); a.store.dispatch(d => { d.name = 'x'; });
  a.key('z', { ctrlKey: true }); expect(a.store.get().name).toBe('새 프로젝트');
  a.key('z', { ctrlKey: true, shiftKey: true }); expect(a.store.get().name).toBe('x');
});

test('keys are ignored while typing in an input', () => {
  const a = setup(); a.key('f', { target: document.createElement('input') });
  expect(a.calls.setTool).toEqual([]); expect(a.view.tool.onKey).not.toHaveBeenCalled();
});

test('modified letters (ctrl/meta/alt) are left to the browser', () => {
  const a = setup();
  a.key('f', { ctrlKey: true }); a.key('l', { metaKey: true }); a.key('d', { altKey: true });
  expect(a.calls.setTool).toEqual([]); expect(a.calls.del).toBe(0);
});

test('Ctrl+digit is not forwarded to the active tool, but Ctrl+Z is', () => {
  const a = setup(false);
  a.key('1', { ctrlKey: true });
  expect(a.view.tool.onKey).not.toHaveBeenCalled();
  a.key('z', { ctrlKey: true });
  expect(a.view.tool.onKey).toHaveBeenCalledTimes(1);
});

test('in first-person mode tool letters and Delete are ignored but Escape and 1-4 still work', () => {
  const a = setup(); a.ui.set({ mode: 'fp' });
  a.key('d'); a.key('e'); a.key('f'); a.key('l'); a.key('m'); a.key('b'); a.key('Delete');
  expect(a.calls.setTool).toEqual([]); expect(a.calls.bg).toBe(0); expect(a.calls.del).toBe(0);
  a.key('2'); expect(a.calls.setMode).toEqual(['plan']);
  a.key('Escape'); expect(a.calls.setMode).toEqual(['plan', 'iso']); expect(a.calls.setTool).toEqual([]);
});

test('d calls deleteOrTool instead of setTool', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const view = { tool: { onKey: vi.fn(() => false) }, requestRender: vi.fn() };
  const setTool = vi.fn(); const deleteSelection = vi.fn(); const deleteOrTool = vi.fn();
  const h = createKeyHandler({ store, ui, view, setTool, setMode: vi.fn(), openBackground: vi.fn(), deleteSelection, deleteOrTool });
  const key = (key, extra = {}) => h({ key, target: document.body, preventDefault() {}, ...extra });
  key('d');
  expect(deleteOrTool).toHaveBeenCalledTimes(1);
  expect(setTool).not.toHaveBeenCalled();
});

test('Delete calls deleteSelection', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const view = { tool: { onKey: vi.fn(() => false) }, requestRender: vi.fn() };
  const deleteSelection = vi.fn();
  const h = createKeyHandler({ store, ui, view, setTool: vi.fn(), setMode: vi.fn(), openBackground: vi.fn(), deleteSelection });
  const key = (key, extra = {}) => h({ key, target: document.body, preventDefault() {}, ...extra });
  key('Delete');
  expect(deleteSelection).toHaveBeenCalledTimes(1);
});

test('KEYMAP is a complete, well-formed table', () => {
  expect(KEYMAP.length).toBeGreaterThanOrEqual(20);
  for (const e of KEYMAP) {
    expect(typeof e.group).toBe('string');
    expect(typeof e.label).toBe('string');
    expect(Array.isArray(e.keys) && e.keys.length > 0).toBe(true);
  }
  const labels = KEYMAP.map(e => e.label);
  expect(labels).toContain('벽 그리기');
  expect(labels).toContain('전체 선택');
  expect(labels).toContain('설정');
  expect(KEYMAP.find(e => e.label === '벽 그리기').keys).toEqual(['L']);
  expect(KEYMAP.some(e => e.keys.includes('Shift+클릭') && e.action === null)).toBe(true);
  expect(new Set(KEYMAP.map(e => e.group)).size).toBeGreaterThanOrEqual(4);
});

test('new actions route: Ctrl+A selects all, Ctrl+comma opens settings, +/- zoom, 0 fits', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const view = { tool: { onKey: vi.fn(() => false) }, requestRender: vi.fn(), fit: vi.fn() };
  const calls = { selectAll: 0, settings: 0, zoomIn: 0, zoomOut: 0, fit: 0 };
  const h = createKeyHandler({ store, ui, view, setTool: vi.fn(), setMode: vi.fn(), openBackground: vi.fn(), deleteSelection: vi.fn(),
    selectAll: () => calls.selectAll++, openSettings: () => calls.settings++, zoomIn: () => calls.zoomIn++, zoomOut: () => calls.zoomOut++, fit: () => calls.fit++ });
  const key = (k, extra = {}) => h({ key: k, target: document.body, preventDefault() {}, ...extra });
  key('a', { ctrlKey: true }); key(',', { ctrlKey: true }); key('+'); key('-'); key('0');
  expect(calls).toEqual({ selectAll: 1, settings: 1, zoomIn: 1, zoomOut: 1, fit: 1 });
});

// 실제 선택 도구를 물려서 확인한다: 스텁이 아니면 Esc가 앱까지 오는지가 도구 구현에 달려 있다.
function setupReal() {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const view = { camera: { scale: 0.1 }, fit: vi.fn(), requestRender: vi.fn(), tool: null };
  view.tool = createSelectTool({ store, ui, view });
  const setTool = vi.fn();
  const cancelReplace = vi.fn();
  const h = createKeyHandler({ store, ui, view, setTool, setMode: vi.fn(), openBackground: vi.fn(), deleteSelection: vi.fn(), cancelReplace });
  return { store, ui, setTool, cancelReplace, esc: () => h({ key: 'Escape', target: document.body, preventDefault() {} }), key: (k, extra = {}) => h({ key: k, target: document.body, preventDefault() {}, ...extra }) };
}

// I-4: 라이브러리 "교체할 제품을 선택하세요" 배너가 Esc를 약속한다. 선택이 있으면 선택 도구가 Esc를
// 소비하므로, 교체 모드 취소는 도구보다 앞에서 불려야 한다.
test('Escape cancels the library replace mode even when the select tool consumes the key', () => {
  const a = setupReal();
  a.ui.set({ selection: { type: 'item', id: 'i_없음' } }); // 도구가 소비하는 상황
  a.esc();
  expect(a.cancelReplace).toHaveBeenCalledTimes(1);
  expect(a.setTool).not.toHaveBeenCalled();
  a.esc(); // 취소할 것이 없어 앱까지 오는 경우에도 한 번 더 불린다
  expect(a.cancelReplace).toHaveBeenCalledTimes(2);
  expect(a.setTool).toHaveBeenCalledWith('select');
  a.key('a'); a.key('Delete'); // 다른 키는 교체 모드를 건드리지 않는다
  expect(a.cancelReplace).toHaveBeenCalledTimes(2);
});

test('Escape clears soloRoom through the app even with the real select tool active', () => {
  const a = setupReal();
  const room = activeFloor(a.store.get()).rooms[0];
  a.ui.set({ soloRoom: room.id, selection: { type: 'room', id: room.id } });
  a.esc();
  expect(a.ui.get().soloRoom).toBeNull();
  expect(a.ui.get().selection).toBeNull();
  expect(a.setTool).toHaveBeenCalledWith('select');
});

test('Escape with only a selection is consumed by the select tool', () => {
  const a = setupReal();
  a.ui.set({ selection: { type: 'wall', id: activeFloor(a.store.get()).walls[0].id } });
  a.esc();
  expect(a.ui.get().selection).toBeNull();
  expect(a.setTool).not.toHaveBeenCalled(); // 도구가 소비했으므로 앱은 관여하지 않는다
  a.esc(); // 취소할 것이 없으면 도구는 소비하지 않고 앱이 선택 모드로 돌아간다
  expect(a.setTool).toHaveBeenCalledWith('select');
});

test('Escape clears fpPick even while a wall is selected', () => {
  const a = setupReal();
  a.ui.set({ fpPick: true, selection: { type: 'wall', id: activeFloor(a.store.get()).walls[0].id } });
  a.esc();
  expect(a.ui.get().fpPick).toBe(false);
  expect(a.setTool).toHaveBeenCalledWith('select');
});

test('Ctrl+Shift+Z also reaches the tool first so a drag can be cancelled', () => {
  const a = setup(true); // 도구가 소비한다
  a.key('z', { ctrlKey: true, shiftKey: true });
  expect(a.view.tool.onKey).toHaveBeenCalledTimes(1);
  expect(a.store.canRedo()).toBe(false); // 도구가 소비했으므로 redo는 실행되지 않는다
  const b = setup(false);
  b.store.dispatch(d => { d.name = 'x'; });
  b.key('z', { ctrlKey: true }); b.key('z', { ctrlKey: true, shiftKey: true });
  expect(b.store.get().name).toBe('x'); // 소비하지 않으면 그대로 redo까지 간다
});

test('keys composed by the IME are ignored', () => {
  const a = setup(false);
  a.key('f', { isComposing: true });
  a.key('ㄷ', { keyCode: 229 });
  expect(a.calls.setTool).toEqual([]);
  expect(a.view.tool.onKey).not.toHaveBeenCalled();
});

// 2B가 쓰는 내부 표들이 export되어 있는지(핸들러를 다시 구현하지 않고 재사용하기 위해).
test('the key table, fp allow-list, prevent-list and tokenOf are exported', () => {
  expect(TABLE.get('esc')).toBe('escape');
  expect(TABLE.get('ctrl+shift+z')).toBe('redo');
  expect(TABLE.get('l')).toBe('tool:wall');
  expect(FP_ALLOWED.has('mode:iso')).toBe(true);
  expect(FP_ALLOWED.has('tool:wall')).toBe(false);
  expect(PREVENT.has('save')).toBe(true);
  expect(tokenOf({ key: 'Escape' })).toBe('esc');
  expect(tokenOf({ key: ' ' })).toBe('space');
  expect(tokenOf({ key: 'z', ctrlKey: true, shiftKey: true })).toBe('ctrl+shift+z');
  expect(tokenOf({ key: 'S', metaKey: true })).toBe('ctrl+s');
});

test('a key consumed by the tool also has its browser default prevented', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  let prevented = 0;
  const view = { tool: { onKey: ev => ev.key === 'ArrowRight' }, requestRender: () => {} };
  const h = createKeyHandler({ store, ui, view, setTool: () => {}, setMode: () => {}, openBackground: () => {}, deleteSelection: () => {}, deleteOrTool: () => {} });
  h({ key: 'ArrowRight', preventDefault: () => { prevented++; }, target: { tagName: 'BODY' } });
  h({ key: 'ArrowLeft', preventDefault: () => { prevented++; }, target: { tagName: 'BODY' } }); // 도구가 안 먹는 키는 표에도 없어 그대로 둔다
  expect(prevented).toBe(1);
});

function setupItems({ ids = ['i1'], canPaste = true } = {}) {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const calls = [];
  const base = { ids: () => ids, canPaste: () => canPaste };
  const itemActions = new Proxy(base, { get: (t, k) => (t[k] ?? ((...args) => calls.push([k, ...args]))) });
  const view = { tool: { onKey: vi.fn(() => false) }, requestRender: vi.fn() };
  const h = createKeyHandler({ store, ui, view, setTool: vi.fn(), setMode: vi.fn(), openBackground: vi.fn(), deleteSelection: vi.fn(), itemActions });
  const key = (k, extra = {}) => {
    const ev = { key: k, target: document.body, prevented: 0, preventDefault() { this.prevented++; }, ...extra };
    h(ev); return ev;
  };
  return { ui, calls, key, view };
}

test('alt/ctrl item shortcuts route to itemActions', () => {
  const { calls, key } = setupItems();
  key('h', { altKey: true }); key('v', { altKey: true }); key('r', { altKey: true });
  key('a', { altKey: true }); key('c', { altKey: true }); key('x', { altKey: true });
  key('c', { ctrlKey: true }); key('v', { ctrlKey: true });
  key('h', { ctrlKey: true }); key('l', { ctrlKey: true });
  key('g', { ctrlKey: true }); key('g', { ctrlKey: true, shiftKey: true });
  expect(calls).toEqual([
    ['mirror', 'h'], ['mirror', 'v'], ['relativeMove'],
    ['arrayCopy', 'linear'], ['arrayCopy', 'circular'], ['arrayCopy', 'rotate'],
    ['copy'], ['paste'], ['toggleHidden'], ['toggleLocked'], ['group'], ['ungroup'],
  ]);
});

test('item shortcuts are ignored in first-person mode and the tool gets no keys there', () => {
  const { ui, calls, key, view } = setupItems();
  ui.set({ mode: 'fp' });
  key('h', { altKey: true }); key('c', { ctrlKey: true }); key('q'); key('ArrowRight');
  expect(calls).toEqual([]);
  expect(view.tool.onKey).not.toHaveBeenCalled();
});

test('ctrl+z and ctrl+s are handled before item shortcuts', () => {
  const { calls, key } = setupItems();
  key('z', { ctrlKey: true }); key('s', { ctrlKey: true });
  expect(calls).toEqual([]); // 되돌리기·저장은 아이템 동작으로 새지 않는다
});

test('KEYMAP lists the product shortcuts', async () => {
  const { KEYMAP } = await import('../src/ui/keymap.js');
  const rows = KEYMAP.filter(r => r.group === '제품');
  const keys = rows.map(r => r.keys).join(' ');
  for (const k of ['Alt+H', 'Alt+V', 'Alt+R', 'Alt+A', 'Alt+C', 'Alt+X', 'Ctrl+C', 'Ctrl+V', 'Ctrl+H', 'Ctrl+L', 'Ctrl+G', 'Q']) expect(keys).toContain(k);
  expect(keys).toContain('방향키');
});

// 선택이 없으면 아이템 조합키를 브라우저에 그대로 넘긴다(Ctrl+C로 텍스트 복사 등을 막지 않게).
test('선택이 없으면 Alt+H / Ctrl+C / Ctrl+H / Ctrl+G를 삼키지 않는다', () => {
  const a = setupItems({ ids: [], canPaste: false });
  for (const [k, mod] of [['h', { altKey: true }], ['v', { altKey: true }], ['r', { altKey: true }], ['c', { ctrlKey: true }], ['h', { ctrlKey: true }], ['g', { ctrlKey: true }], ['l', { ctrlKey: true }]]) {
    expect(a.key(k, mod).prevented).toBe(0);
  }
  expect(a.calls).toEqual([]);
});

test('선택이 없어도 클립보드가 차 있으면 Ctrl+V는 붙여넣는다', () => {
  const a = setupItems({ ids: [], canPaste: true });
  const ev = a.key('v', { ctrlKey: true });
  expect(ev.prevented).toBe(1);
  expect(a.calls).toEqual([['paste']]);
});

test('빈 클립보드의 Ctrl+V는 아무것도 하지 않고 키를 삼키지도 않는다', () => {
  const a = setupItems({ ids: ['i1'], canPaste: false });
  const ev = a.key('v', { ctrlKey: true });
  expect(ev.prevented).toBe(0);
  expect(a.calls).toEqual([]);
});

test('벽을 고른 Ctrl+C는 삼키지 않는다(복사는 아이템 동작이다)', () => {
  const a = setupItems({ ids: [] }); // 벽 선택은 아이템 id를 내지 않는다
  a.ui.set({ selection: { type: 'wall', id: 'w1' } });
  const ev = a.key('c', { ctrlKey: true });
  expect(ev.prevented).toBe(0);
  expect(a.calls).toEqual([]);
});

// main.js의 itemActions.paste와 같은 구성: 붙여넣은 것이 없으면 선택을 건드리지 않는다.
test('붙여넣기가 아무것도 만들지 않으면 선택은 그대로다', () => {
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  const selectItems = ids => ui.set({ selection: !ids.length ? null : ids.length === 1 ? { type: 'item', id: ids[0] } : { type: 'multi', kind: 'item', ids } });
  const paste = () => { const made = pasteItems(store, ui.get().clipboard ?? [], { delta: [200, 200] }); if (made.length) selectItems(made); };
  ui.set({ selection: { type: 'wall', id: 'w1' } });
  paste();
  expect(ui.get().selection).toEqual({ type: 'wall', id: 'w1' });
  ui.set({ clipboard: [createItem(productById('sofa-3'), { pos: [0, 0] })] });
  paste();
  expect(ui.get().selection.type).toBe('item');
});

test('escape가 마감재 적용 모드를 끈다', () => {
  const a = setup();
  a.ui.set({ matPick: { assignment: { id: 'wood-oak', offset: [0, 0], angle: 0 } } });
  a.key('Escape');
  expect(a.ui.get().matPick).toBeNull();
  expect(a.calls.setTool).toEqual(['select']);
});

test('재지정한 키가 핸들러에 바로 듣는다', async () => {
  const { setTable, TABLE } = await import('../src/ui/keymap.js');
  const { buildTable, effectiveKeymap } = await import('../src/ui/keyBindings.js');
  const a = setup();
  setTable(buildTable(effectiveKeymap({ 'tool:wall': ['K'] })));
  a.key('k');
  a.key('l');
  expect(a.calls.setTool).toEqual(['wall']);   // K가 벽 그리기, L은 이제 아무것도 아니다
  setTable(TABLE);
});

// §13.1: Alt+S = 경로 배열 복사. 선택이 없으면 삼키지 않는다(다른 Alt 조합과 같은 규칙).
test('Alt+S는 경로 배열 복사로 가고 선택이 없으면 브라우저에 맡긴다', async () => {
  const { KEYMAP } = await import('../src/ui/keymap.js');
  const a = setupItems();
  const ev = a.key('s', { altKey: true });
  expect(a.calls).toEqual([['pathArray']]);
  expect(ev.prevented).toBe(1);
  const none = setupItems({ ids: [], canPaste: false });
  const ev2 = none.key('s', { altKey: true });
  expect(none.calls).toEqual([]);
  expect(ev2.prevented).toBe(0);
  expect(KEYMAP.find(e => e.label === '경로 배열 복사').keys).toEqual(['Alt+S']);
  expect(KEYMAP.find(e => e.label === '경로 배열 복사').group).toBe('제품');
});

// §13.2: R·C·O는 "도구" 그룹의 재지정 가능한 행이다(설정 > 단축키에 나온다).
test('R·C·O가 구조물 도구를 켠다', async () => {
  const { KEYMAP, TABLE } = await import('../src/ui/keymap.js');
  expect(TABLE.get('r')).toBe('tool:column-square');
  expect(TABLE.get('c')).toBe('tool:column-round');
  expect(TABLE.get('o')).toBe('tool:opening');
  const rows = KEYMAP.filter(e => e.group === '도구' && e.action?.startsWith('tool:column'));
  expect(rows.map(e => e.label)).toEqual(['사각 기둥', '원형 기둥']);
  expect(KEYMAP.find(e => e.action === 'tool:opening').keys).toEqual(['O']);
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const calls = [];
  const view = { tool: { onKey: vi.fn(() => false) }, requestRender: vi.fn() };
  const h = createKeyHandler({ store, ui, view, setTool: n => calls.push(n), setMode: vi.fn(), openBackground: vi.fn(), deleteSelection: vi.fn() });
  for (const k of ['r', 'c', 'o']) h({ key: k, target: document.body, preventDefault() {} });
  expect(calls).toEqual(['column-square', 'column-round', 'opening']);
});

// §15.1: 감사 §8 ③ — Esc를 두 번 눌러도 mode가 fp에 남았다(탈출은 3 키나 하단 바뿐이었다).
test('1인칭에서 [Esc] 한 번이 ISO로 되돌린다(선택은 건드리지 않는다)', () => {
  const a = setup();
  a.ui.set({ mode: 'fp', selection: { type: 'wall', id: 'w1' } });
  a.key('Escape');
  expect(a.calls.setMode).toEqual(['iso']);
  expect(a.calls.setTool).toEqual([]);
  expect(a.ui.get().selection).toEqual({ type: 'wall', id: 'w1' });   // 1인칭 탈출은 선택 취소가 아니다
  a.ui.set({ mode: 'iso' });
  a.key('Escape');                                                    // 2D·3D에서는 예전 규칙 그대로
  expect(a.calls.setTool).toEqual(['select']);
  expect(a.ui.get().selection).toBeNull();
});

// §15.3: 마우스 없이도 선택한 대상의 메뉴를 열 수 있어야 한다.
test('[Shift+F10]과 [ContextMenu] 키가 선택 메뉴를 연다', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const view = { tool: { onKey: vi.fn(() => false) }, requestRender: vi.fn() };
  let opens = 0;
  const h = createKeyHandler({ store, ui, view, setTool: () => {}, setMode: () => {}, openBackground: () => {}, deleteSelection: () => {}, contextMenu: () => { opens++; return true; } });
  const ev = (key, extra = {}) => { const e = { key, target: document.body, prevented: false, preventDefault() { this.prevented = true; }, ...extra }; h(e); return e; };
  expect(ev('F10', { shiftKey: true }).prevented).toBe(true);
  expect(ev('ContextMenu').prevented).toBe(true);
  expect(opens).toBe(2);
  expect(ev('F10').prevented).toBe(false);          // Shift 없는 F10은 브라우저 것이다
  expect(opens).toBe(2);
});

test('메뉴를 열 것이 없으면 키를 삼키지 않는다', () => {
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const view = { tool: { onKey: vi.fn(() => false) }, requestRender: vi.fn() };
  const h = createKeyHandler({ store, ui, view, setTool: () => {}, setMode: () => {}, openBackground: () => {}, deleteSelection: () => {}, contextMenu: () => false });
  const e = { key: 'ContextMenu', target: document.body, prevented: false, preventDefault() { this.prevented = true; } };
  h(e);
  expect(e.prevented).toBe(false);
});

// §15.9(감사 §5): 벽 두께 칸에서 Esc가 값도 포커스도 바꾸지 못했다(INPUT이면 먼저 return했다).
test('입력 칸의 [Esc]는 값을 되돌리고 [Enter]는 확정한다', async () => {
  const { rememberFieldValue } = await import('../src/ui/fieldUtils.js');
  const a = setup();
  const el = document.createElement('input');
  el.type = 'number'; el.step = '10'; el.value = '200';
  document.body.appendChild(el);
  const changes = [];
  el.addEventListener('change', () => changes.push(el.value));
  el.focus();
  rememberFieldValue(el);
  el.value = '3200';
  a.key('Escape', { target: el });               // key 헬퍼가 target·preventDefault를 채운다
  expect(el.value).toBe('200');
  expect(changes).toEqual([]);
  expect(a.calls.setTool).toEqual([]);          // 도구 전환은 일어나지 않는다(칸에서 탈출만 한다)
  el.focus(); el.value = '250';
  a.key('Enter', { target: el });
  expect(changes).toEqual(['250']);
  // 글자 키는 예전처럼 브라우저에 맡긴다(단축키가 되지 않는다).
  a.key('f', { target: el });
  expect(a.calls.setTool).toEqual([]);
});

test('이미 처리된 [Enter](옵션 바)는 두 번 확정하지 않는다', () => {
  const a = setup();
  const el = document.createElement('input');
  el.type = 'text'; el.value = 'x';
  document.body.appendChild(el);
  const changes = [];
  el.addEventListener('change', () => changes.push(1));
  a.key('Enter', { target: el, defaultPrevented: true });
  expect(changes).toEqual([]);
});

// §16.4: undo·redo는 주입할 수 있다(층 간 되돌리기 토스트가 그 자리를 쓴다).
test('createKeyHandler는 주입한 undo·redo를 부른다', () => {
  const calls = [];
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  const handler = createKeyHandler({
    store, ui, view: { tool: null, requestRender() {} }, setTool() {}, setMode() {},
    openBackground() {}, deleteSelection() {}, undo: () => calls.push('undo'), redo: () => calls.push('redo'),
  });
  handler(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
  handler(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }));
  expect(calls).toEqual(['undo', 'redo']);
});

// §16.5: 표시 전용 행은 표에 보이지만 키 표(TABLE)에는 들어가지 않는다.
test('선택 메뉴 열기는 표시 전용 KEYMAP 행이다', () => {
  const row = KEYMAP.find(e => e.label === '선택 메뉴 열기');
  expect(row).toBeTruthy();
  expect(row.keys).toEqual(['Shift+F10', 'ContextMenu']);
  expect(row.action).toBeNull();
  expect(TABLE.has('shift+f10')).toBe(false);
  expect(TABLE.has('contextmenu')).toBe(false);
});
