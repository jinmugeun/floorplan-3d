// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject } from '../src/state/schema.js';
import { createShell, gizmoBtnVisible } from '../src/ui/shell.js';

test('shell renders regions and option bar reflects tool opts', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const shell = createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
  for (const id of ['topbar', 'rail', 'panel', 'c2d', 'c3d', 'optionBar', 'props', 'bottombar', 'minimap']) expect(root.querySelector('#' + id)).not.toBeNull();
  const tool = { name: 'wall', opts: { reference: 'center', thickness: 200, snap: true, ortho: true } };
  shell.setOptionBar(tool);
  const th = root.querySelector('#optionBar input[name="thickness"]');
  th.value = '150'; th.dispatchEvent(new Event('change', { bubbles: true }));
  expect(tool.opts.thickness).toBe(150);
  const sel = root.querySelector('#optionBar select[name="reference"]');
  sel.value = 'inner'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  expect(tool.opts.reference).toBe('inner');
});

test('option bar shows a hint when opts is empty but hint is set', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const shell = createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
  shell.setOptionBar({ name: 'delete', opts: {}, hint: '안내' });
  expect(root.querySelector('#optionBar').hidden).toBe(false);
  expect(root.querySelector('#optionBar').textContent).toContain('안내');
});

test('option bar hides when both opts and hint are empty', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const shell = createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
  shell.setOptionBar({ name: 'x', opts: {} });
  expect(root.querySelector('#optionBar').hidden).toBe(true);
});

test('project name is not interpreted as HTML', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject('<img src=x onerror="window.__pwned=1">'));
  createShell(root, { store, ui: createUiState() });
  expect(root.querySelector('#projectName').value).toBe('<img src=x onerror="window.__pwned=1">');
  expect(root.querySelector('#topbar img')).toBeNull();
});

test('the 보기 popover writes v2 flags in 2D and v3 flags in 3D without adding undo steps', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject()); const ui = createUiState();
  createShell(root, { store, ui });
  root.querySelector('#btnView').click();
  const grid = document.querySelector('.popover input[data-v2="grid"]');
  expect(grid.checked).toBe(true);
  grid.checked = false; grid.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().view.v2.grid).toBe(false);
  expect(store.canUndo()).toBe(false);
  ui.set({ mode: 'iso' });
  const outer = document.querySelector('.popover input[data-v3="outerWalls"]'); // 모드 변경이 팝오버를 다시 그린다
  outer.checked = false; outer.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().view.v3.outerWalls).toBe(false);
  const display = document.querySelector('.popover select[data-view="display"]');
  display.value = 'white'; display.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().view.display).toBe('white');
});

test('the bottom bar unit toggle writes project.units and follows the loaded project', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject());
  createShell(root, { store, ui: createUiState() });
  root.querySelector('[data-units="ftin"]').click();
  expect(store.get().units).toBe('ftin');
  expect(root.querySelector('[data-units="ftin"]').classList.contains('on')).toBe(true);
  expect(store.canUndo()).toBe(false); // 단위 전환은 되돌릴 단계가 아니다
  store.replace({ ...store.get(), units: 'mm' }, { record: false });
  expect(root.querySelector('[data-units="mm"]').classList.contains('on')).toBe(true);
});

test('camera and sun buttons appear only in 3D and their sliders and preset buttons write the view', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject()); const ui = createUiState();
  createShell(root, { store, ui });
  expect(root.querySelector('#btnCam').hidden).toBe(true);
  expect(root.querySelector('#btnSun').hidden).toBe(true);
  ui.set({ mode: 'iso' });
  expect(root.querySelector('#btnCam').hidden).toBe(false);
  root.querySelector('#btnCam').click();
  const elev = document.querySelector('.popover input[data-view="cameraPreset.elevation"]');
  elev.value = '12'; elev.dispatchEvent(new Event('input', { bubbles: true }));
  expect(store.get().view.cameraPreset.elevation).toBe(12);
  document.querySelector('.popover [data-preset="cameraPreset.elevation:89"]').click();
  expect(store.get().view.cameraPreset.elevation).toBe(89);
  expect(document.querySelector('.popover input[data-view="cameraPreset.elevation"]').value).toBe('89'); // 다시 그려진다
  root.querySelector('#btnSun').click();
  const hour = document.querySelector('.popover input[data-view="sun.hour"]');
  hour.value = '17'; hour.dispatchEvent(new Event('input', { bubbles: true }));
  expect(store.get().view.sun.hour).toBe(17);
  expect(store.canUndo()).toBe(false);
});

test('the bottom bar has zoom, lock and capture controls and the lock button follows the project', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject());
  createShell(root, { store, ui: createUiState() });
  expect(root.querySelector('#btnZoomIn')).not.toBeNull();
  expect(root.querySelector('#btnZoomOut')).not.toBeNull();
  expect(root.querySelectorAll('[data-action="capture"]')).toHaveLength(2); // 상단 바 + 하단 바
  root.querySelector('#btnLock').click();
  expect(store.get().view.lockPlan).toBe(true);
  expect(root.querySelector('#btnLock').classList.contains('on')).toBe(true);
  expect(store.canUndo()).toBe(false);
});

test('the image strip appears with a background and drives opacity, visibility and the lock', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject());
  createShell(root, { store, ui: createUiState() });
  expect(root.querySelector('#imageStrip').hidden).toBe(true);
  store.dispatch(d => { d.background = { src: 'data:,', width: 10, height: 10, scale: 1, offset: [0, 0], opacity: 0.5, visible: true, locked: true }; }, { record: false });
  const strip = root.querySelector('#imageStrip');
  expect(strip.hidden).toBe(false);
  expect(strip.textContent).toContain('이미지 세팅');
  const op = strip.querySelector('[name="stripOpacity"]');
  op.value = '0.25'; op.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().background.opacity).toBe(0.25);
  const vis = strip.querySelector('[name="stripVisible"]');
  vis.checked = false; vis.dispatchEvent(new Event('change', { bubbles: true }));
  expect(store.get().background.visible).toBe(false);
  root.querySelector('#btnBgLock').click();
  expect(store.get().background.locked).toBe(false); // 잠금 해제가 된다
  expect(root.querySelector('#btnBgLock').classList.contains('on')).toBe(false);
  root.querySelector('#btnBgLock').click();
  expect(store.get().background.locked).toBe(true);
  expect(store.canUndo()).toBe(false); // 표시 설정은 되돌릴 단계가 아니다
});

test('the image strip is only shown in 2D mode', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject()); const ui = createUiState();
  createShell(root, { store, ui });
  store.dispatch(d => { d.background = { src: 'data:,', width: 10, height: 10, scale: 1, offset: [0.5, 0.25], opacity: 0.5, visible: true, locked: true }; }, { record: false });
  const strip = root.querySelector('#imageStrip');
  expect(strip.hidden).toBe(false);
  ui.set({ mode: 'iso' });
  expect(strip.hidden).toBe(true);
  ui.set({ mode: '2d' });
  expect(strip.hidden).toBe(false);
});

test('bottom bar has the 2D projection select with seven options', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
  const sel = root.querySelector('#viewPreset');
  expect(sel).not.toBeNull();
  expect(sel.getAttribute('aria-label')).toBe('2D 투영 뷰');
  expect(sel.querySelectorAll('option')).toHaveLength(7); // — + 6종
});

test('length option labels carry the active unit and the lock button says what a click does', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject());
  const shell = createShell(root, { store, ui: createUiState() });
  const tool = { name: 'wall', opts: { thickness: 200, snap: true } };
  shell.setOptionBar(tool);
  expect(root.querySelector('#optionBar').textContent).toContain('두께 (mm)');
  store.dispatch(d => { d.units = 'ftin'; }, { record: false });
  shell.setOptionBar(tool); // 옵션 바는 도구를 다시 세울 때 그려진다
  expect(root.querySelector('#optionBar').textContent).toContain('두께 (ft·in)');
  expect(root.querySelector('#optionBar').textContent).not.toContain('두께 (mm)');
  store.dispatch(d => { d.background = { src: 'data:,', width: 10, height: 10, scale: 1, offset: [0, 0], opacity: 0.5, visible: true, locked: true }; }, { record: false });
  expect(root.querySelector('#btnBgLock').textContent).toBe('잠금 해제'); // 잠긴 상태 → 누르면 풀린다
  root.querySelector('#btnBgLock').click();
  expect(store.get().background.locked).toBe(false);
  expect(root.querySelector('#btnBgLock').textContent).toBe('잠금');
});

test('switching units re-renders the option bar label', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const shell = createShell(root, { store, ui });
  shell.setOptionBar({ name: 'wall', opts: { thickness: 200, snap: true } });
  expect(root.querySelector('#optionBar').textContent).toContain('두께 (mm)');
  root.querySelector('[data-units="ftin"]').click();
  expect(root.querySelector('#optionBar').textContent).toContain('두께 (ft·in)');
});

test('기즈모 모드 버튼은 3D에서 아이템을 골랐을 때만 보이고 이동/회전을 뒤집는다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const ui = createUiState(); const modes = []; const store = createStore(createEmptyProject());
  store.dispatch(d => { d.floors[0].items = [{ id: 'i1', attach: 'floor', wallId: null, locked: false, pos: [0, 0], size: [600, 600, 600] }]; });
  createShell(root, { store, ui, onGizmoMode: m => modes.push(m) });
  const btn = root.querySelector('#btnGizmoMode');
  expect(btn.hidden).toBe(true);
  ui.set({ selection: { type: 'item', id: 'i1' } });
  expect(btn.hidden).toBe(true);           // 2D에서는 기즈모가 없다
  ui.set({ mode: 'iso' });
  expect(btn.hidden).toBe(false);
  expect(btn.textContent).toBe('이동');
  btn.click();
  expect(modes).toEqual(['rotate']);
  expect(btn.textContent).toBe('회전');
  btn.click();
  expect(modes).toEqual(['rotate', 'translate']);
  expect(btn.textContent).toBe('이동');
  ui.set({ mode: 'fp' });
  expect(btn.hidden).toBe(true);           // 1인칭에도 기즈모가 없다
  ui.set({ mode: 'iso', selection: { type: 'multi', kind: 'item', ids: ['i1', 'i2'] } });
  expect(btn.hidden).toBe(true);           // 기즈모는 한 개를 고른 때만 붙는다
  ui.set({ selection: null });
  expect(btn.hidden).toBe(true);
});

test('기즈모 모드 버튼은 벽 부착·잠긴 아이템에는 보이지 않는다(3D에서 기즈모가 붙지 않는 것과 같은 규칙)', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const ui = createUiState(); const store = createStore(createEmptyProject());
  store.dispatch(d => { d.floors[0].items = [
    { id: 'a', attach: 'floor', wallId: null, locked: false, pos: [0.5, 0], size: [600, 600, 600] },
    { id: 'b', attach: 'wall', wallId: 'w1', locked: false, pos: [0, 0], size: [900, 40, 2100] },
    { id: 'c', attach: 'floor', wallId: null, locked: true, pos: [0, 0], size: [600, 600, 600] },
  ]; });
  createShell(root, { store, ui });
  const btn = root.querySelector('#btnGizmoMode');
  ui.set({ mode: 'iso', selection: { type: 'item', id: 'a' } });
  expect(btn.hidden).toBe(false);
  ui.set({ selection: { type: 'item', id: 'b' } });
  expect(btn.hidden).toBe(true);   // 벽 부착
  ui.set({ selection: { type: 'item', id: 'c' } });
  expect(btn.hidden).toBe(true);   // 잠김
  ui.set({ selection: { type: 'item', id: '없음' } });
  expect(btn.hidden).toBe(true);   // 없는 아이템
});

// M-9: 2D 투영 뷰(정면·평면 …)는 고정 카메라라 view3d가 기즈모를 떼어 둔다. 버튼만 남으면 눌러도
// 아무 일도 일어나지 않으므로, view3d의 onOrthoView가 shell.setOrtho로 표시 여부를 함께 갱신한다.
test('기즈모 모드 버튼은 2D 투영 뷰에서 숨고 투영을 벗어나면 돌아온다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const ui = createUiState(); const store = createStore(createEmptyProject());
  store.dispatch(d => { d.floors[0].items = [{ id: 'i1', attach: 'floor', wallId: null, locked: false, pos: [0.5, 0.25], size: [600, 600, 600] }]; });
  const shell = createShell(root, { store, ui });
  const btn = root.querySelector('#btnGizmoMode');
  ui.set({ mode: 'iso', selection: { type: 'item', id: 'i1' } });
  expect(btn.hidden).toBe(false);
  shell.setOrtho('front');
  expect(btn.hidden).toBe(true);
  ui.set({ selection: null }); ui.set({ selection: { type: 'item', id: 'i1' } }); // 투영 중에는 다시 골라도 숨은 채다
  expect(btn.hidden).toBe(true);
  shell.setOrtho(null);
  expect(btn.hidden).toBe(false);
});

test('gizmoBtnVisible은 모드·투영·아이템 상태를 함께 본다', () => {
  const item = { locked: false, attach: 'floor', wallId: null };
  expect(gizmoBtnVisible({ mode: 'iso', item })).toBe(true);
  expect(gizmoBtnVisible({ mode: '2d', item })).toBe(false);
  expect(gizmoBtnVisible({ mode: 'fp', item })).toBe(false);
  expect(gizmoBtnVisible({ mode: 'iso', ortho: 'top', item })).toBe(false);
  expect(gizmoBtnVisible({ mode: 'iso', item: null })).toBe(false);
  expect(gizmoBtnVisible({ mode: 'iso', item: { ...item, locked: true } })).toBe(false);
  expect(gizmoBtnVisible({ mode: 'iso', item: { attach: 'wall', wallId: 'w1' } })).toBe(false);
  expect(gizmoBtnVisible({ mode: 'iso', item: { attach: 'wall', wallId: null } })).toBe(true); // 벽에서 떨어진 벽 부착 제품
  expect(gizmoBtnVisible()).toBe(false);
});

test('마감재 레일 탭과 적용 모드 배너', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject()), ui = createUiState();
  const shell = createShell(root, { store, ui });
  expect(root.querySelector('#rail [data-panel="materials"]')).not.toBeNull();
  expect(shell.els.materials).not.toBeNull();
  shell.showPanel('materials');
  expect(root.querySelector('#panel section[data-panel="materials"]').hidden).toBe(false);
  ui.set({ matPick: { assignment: { id: 'wood-oak', offset: [0, 0], angle: 0 } } });
  const banner = root.querySelector('#banner');
  expect(banner.hidden).toBe(false);
  expect(banner.textContent).toContain('재질을 적용할 면을 클릭해주세요. [ESC] 키를 누르면 종료됩니다.');
  // M-34: 단일 공간 모드에서 재질을 바르는 동안에도 모드를 빠져나갈 버튼이 남는다.
  ui.set({ soloRoom: 'r1' });
  expect(root.querySelector('#banner #btnExitSolo')).not.toBeNull();
  root.querySelector('#banner #btnExitSolo').click();
  expect(ui.get().soloRoom).toBeNull();
  ui.set({ matPick: null });
  expect(root.querySelector('#banner').hidden).toBe(true);
});

test('상단 바에 출력 버튼이 순서대로 있다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
  const ids = [...root.querySelectorAll('#topbar button')].map(b => b.id).filter(Boolean);
  expect(ids).toEqual(['btnUndo', 'btnRedo', 'btnRender', 'btnGallery', 'btnEstimate', 'btnSpec', 'btnNew', 'btnMore', 'btnSettings', 'btnCapture', 'btnLoad', 'btnSave']);
});

test('옵션 바 두께는 ft·in 모드에서 텍스트 입력이 되고 mm로 저장된다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const shell = createShell(root, { store, ui });
  store.dispatch(d => { d.units = 'ftin'; }, { record: false });
  const tool = { name: 'wall', opts: { thickness: 200 } };
  shell.setOptionBar(tool);
  const el = root.querySelector('#optionBar input[name="thickness"]');
  expect(el.type).toBe('text');
  expect(el.dataset.len).toBe('1');
  el.value = `1' 0"`; el.dispatchEvent(new Event('change', { bubbles: true }));
  expect(tool.opts.thickness).toBe(305);          // 12인치 = 304.8 → 반올림
  el.value = '엉터리'; el.dispatchEvent(new Event('change', { bubbles: true }));
  expect(tool.opts.thickness).toBe(305);          // 잘못된 입력은 값을 바꾸지 않는다
});

test('카메라 설정·햇빛은 ISO 3D에서만 보인다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const ui = createUiState();
  createShell(root, { store: createStore(createEmptyProject()), ui });
  const shown = () => [root.querySelector('#btnCam').hidden, root.querySelector('#btnSun').hidden];
  ui.set({ mode: 'iso' }); expect(shown()).toEqual([false, false]);
  ui.set({ mode: 'plan' }); expect(shown()).toEqual([true, true]);
  ui.set({ mode: 'fp' }); expect(shown()).toEqual([true, true]);
  ui.set({ mode: '2d' }); expect(shown()).toEqual([true, true]);
});

test('미니맵 높이는 조절되고 localStorage에 남는다', () => {
  localStorage.setItem('kvp.minimapH', '320');
  const root = document.createElement('div'); document.body.appendChild(root);
  createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
  const mm = root.querySelector('#minimap');
  expect(mm.style.height).toBe('320px');
  mm.style.height = '150px';
  mm.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  expect(localStorage.getItem('kvp.minimapH')).toBe('150');
  localStorage.clear();
});

// Task 16 리뷰 I-2·I-3: CSS resize 드래그는 pointerup이 밖에서 끝나므로 ResizeObserver가 저장과 다시 그리기를 맡는다.
test('미니맵 크기가 바뀌면 ResizeObserver 경로로 높이를 저장하고 다시 그리기를 요청한다', () => {
  const observed = [];
  const prev = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; } observe(el) { observed.push({ el, cb: this.cb }); } disconnect() {} };
  try {
    const root = document.createElement('div'); document.body.appendChild(root);
    let redraws = 0;
    createShell(root, { store: createStore(createEmptyProject()), ui: createUiState(), onMinimapResize: () => { redraws += 1; } });
    const mm = root.querySelector('#minimap');
    const entry = observed.find(o => o.el === mm);
    expect(entry).toBeTruthy();
    mm.style.height = '240.5px';
    entry.cb([]);
    expect(localStorage.getItem('kvp.minimapH')).toBe('241');
    expect(redraws).toBe(1);
  } finally { globalThis.ResizeObserver = prev; localStorage.clear(); }
});
