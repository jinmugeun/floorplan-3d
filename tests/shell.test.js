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

test('안내 문구는 옵션 바가 아니라 배너에 찍히고, 누르면 도구가 취소된다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const shell = createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
  let cancelled = 0;
  shell.setOptionBar({ name: 'delete', opts: {}, hint: '안내', onHintClick: () => { cancelled += 1; } });
  expect(root.querySelector('#optionBar').hidden).toBe(true);
  const banner = root.querySelector('#banner');
  expect(banner.hidden).toBe(false);
  expect(banner.textContent).toContain('안내');
  const cancel = banner.querySelector('[data-action="hintCancel"]');
  // 키보드로 닿아야 하므로 <span>이 아니라 <button>이다(Tab·Enter로 눌린다).
  expect(cancel.tagName).toBe('BUTTON');
  expect(cancel.type).toBe('button');
  expect(cancel.classList.contains('hint')).toBe(true);
  cancel.click();
  expect(cancelled).toBe(1);
  shell.setOptionBar({ name: 'select', opts: {} });
  expect(banner.hidden).toBe(true);
});

// 한글을 조합하는 중의 Enter는 "글자 확정"이다: 그때 반영하면 완성되지 않은 값이 들어간다(keymap.js와 같은 방어).
test('옵션 바의 [Enter]는 한글 조합 중에는 반영하지 않는다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const shell = createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
  const tool = { name: 'duct', opts: { system: 'F-4' } };
  shell.setOptionBar(tool);
  const el = root.querySelector('#optionBar input[name="system"]');
  expect(el.type).toBe('text');
  const enter = init => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init }));
  el.value = '가열';
  expect(enter({ isComposing: true })).toBe(true);    // preventDefault도 걸지 않고 그냥 흘려보낸다
  expect(tool.opts.system).toBe('F-4');
  expect(enter({ keyCode: 229 })).toBe(true);         // isComposing을 주지 않는 브라우저의 조합 중 키코드
  expect(tool.opts.system).toBe('F-4');
  expect(enter({})).toBe(false);                      // 조합이 끝난 Enter는 반영하고 기본 동작을 막는다
  expect(tool.opts.system).toBe('가열');
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
  expect(root.querySelector('#optionBar').textContent).toContain('W (mm)');
  store.dispatch(d => { d.units = 'ftin'; }, { record: false });
  shell.setOptionBar(tool); // 옵션 바는 도구를 다시 세울 때 그려진다
  expect(root.querySelector('#optionBar').textContent).toContain('W (ft·in)');
  expect(root.querySelector('#optionBar').textContent).not.toContain('W (mm)');
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
  expect(root.querySelector('#optionBar').textContent).toContain('W (mm)');
  root.querySelector('[data-units="ftin"]').click();
  expect(root.querySelector('#optionBar').textContent).toContain('W (ft·in)');
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
  expect(banner.textContent).toContain('재질을 적용할 면을 클릭해주세요. [Esc]를 누르면 종료됩니다.');
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
  expect(ids).toEqual(['btnUndo', 'btnRedo', 'btnRender', 'btnGallery', 'btnEstimate', 'btnSpec', 'btnNew', 'btnMore', 'btnHelp', 'btnSettings', 'btnCapture', 'btnLoad', 'btnSave']);
});

test('[?] 버튼은 현재 모드의 도움말을 열고 단축키 표 콜백을 부른다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const ui = createUiState(); const asked = [];
  const shell = createShell(root, { store: createStore(createEmptyProject()), ui, onOpenKeymap: () => asked.push(1) });
  const btn = root.querySelector('#btnHelp');
  expect(btn.getAttribute('aria-label')).toBe('도움말');
  btn.click();
  // 반드시 root 안에서 찾는다: shell.test.js에는 beforeEach도 body 비우기도 없고 테스트마다 새 셸을
  // 붙이므로 이 시점 문서에는 .popover가 20개 넘게 있다. document.querySelector('.popover')는
  // 맨 처음 셸의 빈 팝오버를 돌려줘 textContent가 ''이 된다(세 단정이 모두 실패한다).
  expect(root.querySelector('.popover').textContent).toContain('2D 도면 조작');
  root.querySelector('.popover [data-help="keymap"]').click();
  expect(asked).toEqual([1]);
  ui.set({ mode: 'iso' });
  btn.click();
  expect(root.querySelector('.popover').textContent).toContain('3D 보기 조작');
  shell.popover.close();
  ui.set({ tool: 'duct' });
  btn.click();
  expect(root.querySelector('.popover').textContent).toContain('덕트 그리기');
});

// [?]도 #btnView/#btnCam/#btnSun과 같은 openPopover(kind, anchor) 경로를 타야 한다: 이미 열려 있는
// 채로 다시 누르면(두 번째 클릭) 닫혀야 하고, 그다음 클릭에서 다시 열려야 한다.
test('[?] 버튼은 다른 팝오버 버튼처럼 두 번째 클릭에 닫힌다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const shell = createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
  const btn = root.querySelector('#btnHelp');
  btn.click();
  expect(shell.popover.isOpen()).toBe(true);
  btn.click();                                    // 두 번째 클릭 = 닫는다
  expect(shell.popover.isOpen()).toBe(false);
  btn.click();                                    // 세 번째 클릭 = 다시 연다
  expect(shell.popover.isOpen()).toBe(true);
  expect(root.querySelector('.popover').textContent).toContain('2D 도면 조작');
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

test('옵션 바와 배너는 캔버스 위에 떠 있지 않고 캔버스 위쪽 행이다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
  const wrap = root.querySelector('#canvasWrap');
  expect([...wrap.children].map(c => c.id)).toEqual(['optionBar', 'banner', 'canvasStack']);
  const stack = root.querySelector('#canvasStack');
  expect([...stack.children].map(c => c.id)).toEqual(['c2d', 'c3d', 'imageStrip']);
});

test('배너는 ui 상태가 도구 안내보다 앞선다(한 번에 하나만)', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const ui = createUiState();
  const shell = createShell(root, { store: createStore(createEmptyProject()), ui });
  shell.setOptionBar({ name: 'place', opts: {}, hint: '배치할 위치를 클릭' });
  const banner = root.querySelector('#banner');
  expect(banner.textContent).toContain('배치할 위치를 클릭');
  ui.set({ matPick: { assignment: { id: 'wood-oak', offset: [0, 0], angle: 0 } } });
  expect(banner.textContent).toContain('재질을 적용할 면을 클릭해주세요');
  expect(banner.textContent).not.toContain('배치할 위치를 클릭');
  ui.set({ matPick: null });
  expect(banner.textContent).toContain('배치할 위치를 클릭'); // 상태가 풀리면 도구 안내가 돌아온다
});

test('패널 폭은 CSS 변수로 들어가고 스플리터 두 개가 그리드에 있다', () => {
  localStorage.clear();                       // 먼저 지운다: 중간에 실패해도 kvp.panelW가 뒤 테스트로 번지지 않게
  const vw = window.innerWidth;
  window.innerWidth = 1280;                   // jsdom 기본값은 1024라 fitPanelWidths가 260으로 줄인다
  try {
    localStorage.setItem('kvp.panelW', '400');
    const root = document.createElement('div'); document.body.appendChild(root);
    createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
    const layout = root.querySelector('#layout');
    expect(layout.style.getPropertyValue('--panel-w')).toBe('400px');
    expect(layout.style.getPropertyValue('--right-w')).toBe('300px');
    const ids = [...layout.children].map(c => c.id);
    expect(ids).toEqual(['topbar', 'rail', 'panel', 'panelSplitter', 'canvasWrap', 'rightSplitter', 'right', 'bottombar']);
    expect(root.querySelector('#panelSplitter').getAttribute('aria-label')).toBe('작업 패널 폭 조절');
  } finally { localStorage.clear(); window.innerWidth = vw; }
});

test('좁은 창에서는 저장된 폭이라도 최소 폭으로 들어간다(인라인 폭이 미디어 쿼리를 이긴다)', () => {
  localStorage.clear();
  const vw = window.innerWidth;
  window.innerWidth = 1000;
  try {
    localStorage.setItem('kvp.panelW', '400');
    const root = document.createElement('div'); document.body.appendChild(root);
    createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
    const layout = root.querySelector('#layout');
    expect(layout.style.getPropertyValue('--panel-w')).toBe('260px');
    expect(layout.style.getPropertyValue('--right-w')).toBe('260px');
  } finally { localStorage.clear(); window.innerWidth = vw; }
});

test('레일 버튼을 같은 탭에서 다시 누르면 패널이 접히고 다른 탭을 누르면 펼쳐진다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const shell = createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
  const panel = root.querySelector('#panel');
  const layout = root.querySelector('#layout');
  const rail = name => root.querySelector(`#rail [data-panel="${name}"]`);
  expect(panel.classList.contains('collapsed')).toBe(false);
  rail('draw').click();                                     // 지금 열려 있는 탭 = 접는다
  expect(panel.classList.contains('collapsed')).toBe(true);
  expect(layout.classList.contains('panel-off')).toBe(true);
  rail('draw').click();                                     // 다시 누르면 펼친다
  expect(panel.classList.contains('collapsed')).toBe(false);
  rail('products').click();
  expect(root.querySelector('#panel section[data-panel="products"]').hidden).toBe(false);
  expect(panel.classList.contains('collapsed')).toBe(false);
  rail('products').click();
  expect(panel.classList.contains('collapsed')).toBe(true);
  shell.showPanel('materials');                             // 코드에서 패널을 열면 접힘도 풀린다
  expect(panel.classList.contains('collapsed')).toBe(false);
  expect(root.querySelector('#panel section[data-panel="materials"]').hidden).toBe(false);
});

test('옵션 바 길이 입력은 [Enter]로도 반영된다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject());
  const shell = createShell(root, { store, ui: createUiState() });
  const tool = { name: 'wall', opts: { thickness: 200 } };
  shell.setOptionBar(tool);
  const el = root.querySelector('#optionBar input[name="thickness"]');
  el.value = '250';
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(tool.opts.thickness).toBe(250);
  // 실제 브라우저는 Enter 뒤 blur에서 네이티브 change까지 쏜다 → 같은 값을 두 번 반영해도 결과가 같다.
  el.dispatchEvent(new Event('change', { bubbles: true }));
  expect(tool.opts.thickness).toBe(250);
  store.dispatch(d => { d.units = 'ftin'; }, { record: false });
  shell.setOptionBar(tool);
  const ft = root.querySelector('#optionBar input[name="thickness"]');
  ft.value = `1' 0"`;
  ft.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(tool.opts.thickness).toBe(305);
  ft.dispatchEvent(new Event('change', { bubbles: true }));   // Enter + blur가 겹쳐도 한 번과 같다
  expect(tool.opts.thickness).toBe(305);
});

// §13.2: 레일 "방 만들기" 아래 "구조물" 소절에 버튼 3개.
test('도면 그리기 패널에 구조물 버튼 3개가 있다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
  const draw = root.querySelector('#panel section[data-panel="draw"]');
  expect([...draw.querySelectorAll('h3')].map(h => h.textContent)).toContain('구조물');
  const tools = [...draw.querySelectorAll('[data-tool]')].map(b => b.dataset.tool);
  expect(tools).toContain('column-square');
  expect(tools).toContain('column-round');
  expect(tools).toContain('opening');
  expect(draw.querySelector('[data-tool="column-square"]').textContent).toContain('사각 기둥');
  expect(draw.querySelector('[data-tool="column-square"] kbd').textContent).toBe('R');
  expect(draw.querySelector('[data-tool="column-round"] kbd').textContent).toBe('C');
  expect(draw.querySelector('[data-tool="opening"] kbd').textContent).toBe('O');
});
