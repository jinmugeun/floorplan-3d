// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, createItem } from '../src/state/schema.js';
import { createShell, gizmoBtnVisible } from '../src/ui/shell.js';
import { addItem } from '../src/state/floorOps.js';
import { productById } from '../src/products/catalog.js';
import { COLLISION_BANNER, COLLISION_BANNER_QUIET } from '../src/ui/messages.js';
import { LAYOUT_DEBOUNCE_MS } from '../src/ui/layout.js';

// 세 태스크(6·8·12)의 테스트가 이 한 헬퍼로 셸을 띄운다. opts는 createShell에 그대로 넘어가므로
// mountShell({ onToolChange })처럼 셸 생성 인자를 더할 수 있다.
function mountShell(opts = {}) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const store = createStore(createEmptyProject()), ui = createUiState();
  const shell = createShell(root, { store, ui, ...opts });
  return { root, store, ui, shell };
}

// §16.5(감사 §38): 아이콘·짧은 이름만 있는 버튼에 마우스 툴팁이 없어 무엇인지 알 수 없었다.
// 규칙을 글로 적는 대신 실측으로 센다 — 세 묶음의 버튼은 모두 마우스 툴팁(title)을 갖는다.
// 판정은 title만 본다(리뷰 I-1): 감사 §38이 지적한 것은 "마우스로 무엇인지 알 수 없다"였으므로
// aria-label이 대신 서면 그 회귀를 놓친다. 묶음마다 개수를 먼저 세는 것도 같은 이유다 —
// 선택자가 리팩터링으로 어긋나면 gaps는 빈 배열이라 테스트 이름만 남고 보증이 사라진다.
test('상단 바·하단 바·반전 회전 버튼에 툴팁 공백이 없다', () => {
  const { root } = mountShell();
  const groups = ['#topbar button', '#bottombar button', '#panel .row button'];
  const gaps = [];
  for (const sel of groups) {
    const bs = root.querySelectorAll(sel);
    expect(bs.length, `선택자가 아무것도 잡지 못했다: ${sel}`).toBeGreaterThan(0);
    for (const b of bs) {
      if (!(b.getAttribute('title') ?? '').trim()) gaps.push(`${sel} → ${b.id || b.dataset.action || b.textContent.trim()}`);
    }
  }
  expect(gaps).toEqual([]);
  // 단축키가 있는 버튼은 대괄호 표기로 알려 준다(전역 규칙).
  expect(root.querySelector('#btnSave').title).toContain('[Ctrl+S]');
  expect(root.querySelector('#btnUndo').title).toContain('[Ctrl+Z]');
});
// (층 바는 속성 패널이 그리므로 셸만 띄운 이 테스트에는 없다 — 그 묶음은 `floorBar.test.js`의
//  문자열 단정과 Task 13의 브라우저 프로브가 함께 확인한다.)

// §16.5(감사 §39): onHintClick이 없는 도구에서는 안내가 탭 스톱도 링크도 아니어야 한다.
test('배너 안내는 취소를 구현한 도구에서만 버튼이다', () => {
  const { shell, root } = mountShell();
  shell.setOptionBar({ name: 'wall', opts: {}, hint: '첫 점을 클릭하세요 (1/2)' });   // onHintClick 없음
  expect(root.querySelector('#banner button.hint')).toBeNull();
  expect(root.querySelector('#banner span.hint').textContent).toBe('첫 점을 클릭하세요 (1/2)');
  shell.setOptionBar({ name: 'place', opts: {}, hint: '배치할 위치를 클릭해주세요', onHintClick() {} });
  expect(root.querySelector('#banner button.hint[data-action="hintCancel"]')).not.toBeNull();
  expect(root.querySelector('#banner span.hint')).toBeNull();
});

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
  // §14.3: 모드·보기·줌은 항상 보인다 → 줌은 sticky 꼬리 안에 있어야 한다(꼬리가 덮던 자리다).
  for (const id of ['#btnZoomIn', '#btnZoomOut', '#btnFit']) expect(root.querySelector(`#bottomTail ${id}`)).not.toBeNull();
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

// I-4: gizmoBtnVisible이 읽는 것(locked·attach·wallId)은 전부 **스토어** 상태다. 속성 패널·우클릭
// 메뉴로 고른 아이템을 잠그면 ui는 그대로이므로 ui.subscribe가 돌지 않는다 — 스토어 구독에서도
// 다시 맞춰야 버튼이 낡지 않는다(같은 이유로 하단 바 접기 판정도 다시 한다).
test('스토어만 바뀌는 경로(고른 아이템 잠금·벽 부착)에서도 기즈모 버튼이 다시 동기화된다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const ui = createUiState(); const store = createStore(createEmptyProject());
  store.dispatch(d => { d.floors[0].items = [{ id: 'i1', attach: 'floor', wallId: null, locked: false, pos: [0.5, 0.25], size: [600, 600, 600] }]; });
  createShell(root, { store, ui });
  const btn = root.querySelector('#btnGizmoMode');
  ui.set({ mode: 'iso', selection: { type: 'item', id: 'i1' } });
  expect(btn.hidden).toBe(false);
  store.dispatch(d => { d.floors[0].items[0].locked = true; });      // 잠금 = 스토어만 바뀐다
  expect(btn.hidden).toBe(true);
  store.dispatch(d => { d.floors[0].items[0].locked = false; });
  expect(btn.hidden).toBe(false);
  store.dispatch(d => { Object.assign(d.floors[0].items[0], { attach: 'wall', wallId: 'w1' }); }); // 끌어서 벽에 붙은 경우
  expect(btn.hidden).toBe(true);
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
    // §15.4: 캔버스 560 px 기준에서 1280 px 창은 646 px 몫이다 → 700에서 27 px씩 덜어 낸다.
    expect(layout.style.getPropertyValue('--panel-w')).toBe('373px');
    expect(layout.style.getPropertyValue('--right-w')).toBe('273px');
    const ids = [...layout.children].map(c => c.id);
    // #bottomMore는 #layout의 아홉 번째 자식이다: #bottombar가 overflow-x: auto라 팝오버를 그 안에
    // 둘 수 없고(잘린다 — 결정 8), position: fixed라 그리드 흐름을 차지하지 않는다.
    // §15.14: #toasts가 열 번째 자식으로 상주한다(position: fixed라 그리드를 차지하지 않는다).
    expect(ids).toEqual(['topbar', 'rail', 'panel', 'panelSplitter', 'canvasWrap', 'rightSplitter', 'right', 'bottombar', 'bottomMore', 'toasts']);
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
  // m-9: 접혀 있으면 눌린 것이 아니다 — `.on`(어느 탭인가)과 aria-pressed(열려 있는가)를 가른다.
  expect(rail('products').classList.contains('on')).toBe(true);
  expect(rail('products').getAttribute('aria-pressed')).toBe('false');
  shell.showPanel('materials');                             // 코드에서 패널을 열면 접힘도 풀린다
  expect(panel.classList.contains('collapsed')).toBe(false);
  expect(root.querySelector('#panel section[data-panel="materials"]').hidden).toBe(false);
  expect(rail('materials').getAttribute('aria-pressed')).toBe('true');
  expect(rail('products').getAttribute('aria-pressed')).toBe('false');
});

// m-8: destroy()가 구독을 떼지 않으면 셸을 버린 뒤의 스토어 변경이 사라진 #btnUndo에서 던진다.
test('destroy()는 스토어·ui 구독까지 뗀다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  const shell = createShell(root, { store, ui });
  shell.destroy();
  root.innerHTML = '';                                      // 셸 마크업이 사라진 뒤
  expect(() => store.dispatch(d => { d.name = '다음'; }, { record: false })).not.toThrow();
  expect(() => ui.set({ mode: 'iso' })).not.toThrow();
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

// §14.1: 좁은 창에서 캔버스가 106 px 띠가 되던 문제. 폭은 창이 바뀔 때마다 다시 정하고,
// 최소 폭으로 줄여도 모자라면 패널을 자동으로 접는다(사용자가 접은 것과 구분한다).
test('창을 좁히면 패널이 자동으로 접히고 넓히면 자동 접힘만 풀린다', () => {
  localStorage.clear();
  const vw = window.innerWidth;
  vi.useFakeTimers();
  try {
    const root = document.createElement('div'); document.body.appendChild(root);
    window.innerWidth = 1600;
    createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
    const layout = root.querySelector('#layout');
    expect(layout.classList.contains('right-off')).toBe(false);
    expect(root.querySelector('#btnRightPanel').hidden).toBe(true);
    window.innerWidth = 800;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(200);
    expect(layout.classList.contains('right-off')).toBe(true);
    expect(layout.classList.contains('panel-off')).toBe(true);
    expect(root.querySelector('#btnRightPanel').hidden).toBe(false);
    window.innerWidth = 1600;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(200);
    expect(layout.classList.contains('right-off')).toBe(false);
    expect(layout.style.getPropertyValue('--panel-w')).toBe('320px');   // 저장해 둔 폭이 그대로 돌아온다
    expect(root.querySelector('#btnRightPanel').hidden).toBe(true);
  } finally { vi.useRealTimers(); localStorage.clear(); window.innerWidth = vw; }
});

test('사용자가 접은 패널은 창을 넓혀도 그대로 접혀 있고 "속성 ▸"이 우측 패널을 되돌린다', () => {
  localStorage.clear();
  const vw = window.innerWidth;
  vi.useFakeTimers();
  try {
    const root = document.createElement('div'); document.body.appendChild(root);
    window.innerWidth = 1600;
    createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
    const layout = root.querySelector('#layout');
    root.querySelector('#rail [data-panel="draw"]').click();            // 직접 접었다
    expect(layout.classList.contains('panel-off')).toBe(true);
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(200);
    expect(layout.classList.contains('panel-off')).toBe(true);          // 자동 접힘이 아니므로 펴지 않는다
    window.innerWidth = 800;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(200);
    const btn = root.querySelector('#btnRightPanel');
    expect(btn.hidden).toBe(false);
    btn.click();
    expect(layout.classList.contains('right-off')).toBe(false);
    expect(btn.hidden).toBe(true);
  } finally { vi.useRealTimers(); localStorage.clear(); window.innerWidth = vw; }
});

// §14.8: 겹침은 빨간 테두리로만 알려 줘서(문구 0건) 처음 쓰는 사람이 무엇이 잘못됐는지 몰랐다.
test('충돌이 있으면 배너가 건수를 알리고 ui 상태 배너가 그보다 앞선다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  const shell = createShell(root, { store, ui });
  const banner = root.querySelector('#banner');
  expect(banner.hidden).toBe(true);
  addItem(store, createItem(productById('sofa-3'), { pos: [1000.5, 1000.25] }));
  addItem(store, createItem(productById('sofa-3'), { pos: [1200.5, 1000.25] }));
  expect(banner.hidden).toBe(false);
  expect(banner.textContent).toContain(COLLISION_BANNER(2));
  shell.setOptionBar({ name: 'room', opts: {}, hint: '첫 모서리를 클릭 (1/2)' });
  expect(banner.textContent).toContain('충돌 2건');            // 도구 안내보다 앞이다
  ui.set({ matPick: { assignment: { id: 'paint-white' } } });
  expect(banner.textContent).toContain('재질을 적용할 면을 클릭');  // ui 상태 배너가 충돌보다 앞이다
  ui.set({ matPick: null });
  expect(banner.textContent).toContain('충돌 2건');
  store.dispatch(d => { d.view.v2.collision = false; }, { record: false });
  expect(banner.textContent).toContain('첫 모서리를 클릭 (1/2)');   // 표시를 끄면 도구 안내가 돌아온다
});

test('충돌이 사라지면 배너도 사라진다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject());
  createShell(root, { store, ui: createUiState() });
  const a = addItem(store, createItem(productById('sofa-3'), { pos: [1000, 1000] }));
  addItem(store, createItem(productById('sofa-3'), { pos: [1100, 1000] }));
  expect(root.querySelector('#banner').hidden).toBe(false);
  store.dispatch(d => { const f = d.floors[0]; f.items = f.items.filter(i => i.id !== a); });
  expect(root.querySelector('#banner').hidden).toBe(true);
});

// §14.10: 활성 상태가 색으로만 전달됐다(aria-pressed·title이 하나도 없었다).
test('도구·모드·레일·단위·잠금 토글이 aria-pressed와 title을 갖고 팝오버는 aria-expanded를 쓴다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  createShell(root, { store, ui });
  const tools = [...root.querySelectorAll('[data-tool]')];
  expect(tools).toHaveLength(10);
  expect(tools.every(b => b.title && b.hasAttribute('aria-pressed'))).toBe(true);
  expect(root.querySelector('[data-tool="wall"]').title).toBe('벽 그리기 [L]');
  ui.set({ tool: 'wall' });
  expect(root.querySelector('[data-tool="wall"]').getAttribute('aria-pressed')).toBe('true');
  expect(root.querySelector('[data-tool="room"]').getAttribute('aria-pressed')).toBe('false');
  ui.set({ mode: 'iso' });
  expect(root.querySelector('[data-mode="iso"]').getAttribute('aria-pressed')).toBe('true');
  expect(root.querySelector('[data-mode="2d"]').getAttribute('aria-pressed')).toBe('false');
  const rail = [...root.querySelectorAll('#rail button')];
  expect(rail.every(b => b.hasAttribute('aria-pressed'))).toBe(true);
  root.querySelector('#rail [data-panel="products"]').click();
  expect(root.querySelector('#rail [data-panel="products"]').getAttribute('aria-pressed')).toBe('true');
  expect(root.querySelector('#rail [data-panel="draw"]').getAttribute('aria-pressed')).toBe('false');
  store.dispatch(d => { d.units = 'ftin'; d.view.lockPlan = true; }, { record: false });
  expect(root.querySelector('[data-units="ftin"]').getAttribute('aria-pressed')).toBe('true');
  expect(root.querySelector('#btnLock').getAttribute('aria-pressed')).toBe('true');
  const view = root.querySelector('#btnView');
  expect(view.getAttribute('aria-expanded')).toBe('false');
  view.click();
  expect(view.getAttribute('aria-expanded')).toBe('true');
  view.click();
  expect(view.getAttribute('aria-expanded')).toBe('false');
});

// §14.7: 셸은 배너를 다시 그릴 수 있는 문을 열어 둔다(2D 뷰가 hint 변화를 알려 준다).
test('refreshBanner가 현재 도구의 hint를 다시 읽는다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const shell = createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
  let step = 1;
  shell.setOptionBar({ name: 'room', opts: {}, get hint() { return `단계 ${step}`; } });
  const banner = root.querySelector('#banner');
  expect(banner.textContent).toContain('단계 1');
  step = 2;
  shell.refreshBanner();
  expect(banner.textContent).toContain('단계 2');
});

// Task 8 리뷰 Important 1: #banner는 #canvasWrap의 레이아웃 행이라, 드래그 중에 행이 생기거나
// 사라지면 캔버스 높이가 ~33 px 달라지고(중심 기준 좌표 변환) 끌던 제품이 커서 아래에서 튄다.
// 그래서 드래그 중에는 행의 생성·삭제를 미루고 pointerup에 한 번 반영한다.
test('드래그 중에는 충돌 배너 행이 생기거나 사라지지 않고 pointerup에 한 번 반영된다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject());
  const ui = createUiState();
  createShell(root, { store, ui });
  const banner = root.querySelector('#banner');
  // 앞선 테스트들이 같은 document에 열린 팝오버를 남긴다: 팝오버의 document 캡처 리스너는
  // 바깥 pointerdown을 stopPropagation으로 삼켜(popover.js) 캔버스까지 내려보내지 않는다.
  document.querySelectorAll('.popover').forEach(el => { el.hidden = true; });
  const down = () => root.querySelector('#canvasStack').dispatchEvent(new Event('pointerdown', { bubbles: true }));
  const up = () => window.dispatchEvent(new Event('pointerup'));
  expect(banner.hidden).toBe(true);
  down();
  const a = addItem(store, createItem(productById('sofa-3'), { pos: [1000, 1000] }));
  addItem(store, createItem(productById('sofa-3'), { pos: [1100, 1000] }));
  expect(banner.hidden).toBe(true);            // 행이 끼어들지 않는다(캔버스 높이가 그대로다)
  expect(banner.innerHTML).toBe('');
  // 순서는 그대로다: 드래그 중이라도 배너가 이미 떠 있으면 ui 상태 배너가 충돌보다 앞선다(§14.8).
  up();
  expect(banner.hidden).toBe(false);           // 손을 떼면 한 번에 반영된다
  expect(banner.textContent).toContain(COLLISION_BANNER(2));
  down();
  ui.set({ matPick: { assignment: { id: 'paint-white' } } });
  expect(banner.hidden).toBe(false);
  expect(banner.textContent).toContain('재질을 적용할 면을 클릭');   // 내용만 바뀌는 갱신은 미루지 않는다
  ui.set({ matPick: null });
  expect(banner.textContent).toContain('충돌 2건');
  // 반대 방향(겹침이 풀려 행이 접히는 것)도 드래그가 끝날 때까지 미룬다.
  store.dispatch(d => { const f = d.floors[0]; f.items = f.items.filter(i => i.id !== a); });
  expect(banner.hidden).toBe(false);
  up();
  expect(banner.hidden).toBe(true);
});

// Task 8 리뷰 Minor 1: "실시간 충돌 감지"를 끄면 드래그 중에만 빨간 테두리가 감춰지므로(view2d),
// 그 사이의 문구에서만 "빨간 테두리" 절을 뺀다. 배너를 감추면 §14.8("드래그 밖에서도")을 깬다.
test('실시간 충돌 감지를 끈 드래그 중에만 "빨간 테두리" 절이 빠지고 배너는 남는다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  const store = createStore(createEmptyProject());
  createShell(root, { store, ui: createUiState() });
  const banner = root.querySelector('#banner');
  store.dispatch(d => { d.view.v2.collisionLive = false; }, { record: false });
  addItem(store, createItem(productById('sofa-3'), { pos: [1000, 1000] }));
  addItem(store, createItem(productById('sofa-3'), { pos: [1100, 1000] }));
  expect(banner.hidden).toBe(false);
  expect(banner.textContent).toContain(COLLISION_BANNER(2));        // 드래그 밖에서는 그대로다
  // 앞선 테스트들이 같은 document에 열린 팝오버를 남긴다: 팝오버의 document 캡처 리스너는
  // 바깥 pointerdown을 stopPropagation으로 삼켜(popover.js) 캔버스까지 내려보내지 않는다.
  document.querySelectorAll('.popover').forEach(el => { el.hidden = true; });
  root.querySelector('#canvasStack').dispatchEvent(new Event('pointerdown', { bubbles: true }));
  store.dispatch(d => { d.floors[0].items[0].pos = [1010, 1000]; }, { record: false });
  expect(banner.hidden).toBe(false);                                 // 배너 자체는 남는다
  expect(banner.textContent).toContain(COLLISION_BANNER_QUIET(2));
  expect(banner.textContent).not.toContain('빨간 테두리');
  window.dispatchEvent(new Event('pointerup'));
  store.dispatch(d => { d.floors[0].items[0].pos = [1011, 1000]; }, { record: false });
  expect(banner.textContent).toContain(COLLISION_BANNER(2));         // 놓으면 바로 교정된다
});

// §15.1: 1인칭 중에는 화면에 안내가 하나도 없었다(#banner·#optionBar 모두 hidden — 감사 §8 ③).
test('1인칭에서는 안내 배너와 [나가기] 버튼이 상주한다', () => {
  const exits = [];
  const root = document.createElement('div'); root.id = 'app'; document.body.appendChild(root);
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const shell = createShell(root, { store, ui, onExitFp: () => exits.push(1) });
  ui.set({ mode: 'fp' });
  const banner = root.querySelector('#banner');
  expect(banner.hidden).toBe(false);
  expect(banner.textContent).toContain('1인칭 — WASD 이동 · 드래그로 둘러보기 · [Esc] 나가기');
  const exit = banner.querySelector('#btnExitFp');
  expect(exit.textContent).toBe('나가기');
  exit.click();
  expect(exits).toEqual([1]);
  ui.set({ mode: 'iso' });
  expect(root.querySelector('#banner').hidden).toBe(true);
  shell.destroy();
});

// 계획 6 R-1 · §15.2: bottom.sync()는 scrollWidth를 읽어 강제 리플로를 일으킨다. 드래그 중
// 매 프레임 스토어가 바뀌면(예전 경로) 그때마다 다시 재서 프레임을 삼켰다.
test('하단 바 접기 판정은 보이는 컨트롤 서명이 바뀔 때만 다시 잰다', () => {
  const root = document.createElement('div'); root.id = 'app'; document.body.appendChild(root);
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const shell = createShell(root, { store, ui });
  let reads = 0;
  const bar = root.querySelector('#bottombar');
  Object.defineProperty(bar, 'scrollWidth', { configurable: true, get() { reads++; return 900; } });
  Object.defineProperty(bar, 'clientWidth', { configurable: true, get: () => 1000 });
  reads = 0;
  store.dispatch(d => { d.name = 'a'; });
  store.dispatch(d => { d.name = 'b'; });
  store.dispatch(d => { d.name = 'c'; });
  expect(reads).toBe(0);                       // 서명이 같으면 재지 않는다
  ui.set({ mode: 'iso' });                     // 3D 전용 버튼(카메라·햇빛)이 드러난다 → 서명이 바뀐다
  expect(reads).toBeGreaterThan(0);
  shell.destroy();
});

// p7 Task 2 리뷰 I-1: 레일로 좌측 패널을 접거나 펴면 #bottombar의 clientWidth가 바뀌지만
// #layout 크기·서명 4필드는 그대로라 예전 게이팅은 이 경로를 영원히 놓쳤다. syncBottom(true)로
// 강제 재측정하되, 아이템 드래그처럼 서명이 그대로인 store 갱신은 여전히 한 번도 재지 않아야 한다.
test('레일 패널을 접으면 서명이 그대로여도 하단 바를 다시 재고, 아이템 드래그는 여전히 재지 않는다', () => {
  const root = document.createElement('div'); root.id = 'app'; document.body.appendChild(root);
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const shell = createShell(root, { store, ui });
  let reads = 0;
  const bar = root.querySelector('#bottombar');
  Object.defineProperty(bar, 'scrollWidth', { configurable: true, get() { reads++; return 900; } });
  Object.defineProperty(bar, 'clientWidth', { configurable: true, get: () => 1000 });

  // 드래그 프레임을 흉내 낸다: record:false dispatch를 여러 번(ui/mode는 그대로) — 서명이
  // 바뀌지 않으므로 한 번도 재측정하지 않아야 한다(§15.2, 이동마다 sync 금지).
  reads = 0;
  store.dispatch(d => { d.name = 'drag-1'; }, { record: false });
  store.dispatch(d => { d.name = 'drag-2'; }, { record: false });
  store.dispatch(d => { d.name = 'drag-3'; }, { record: false });
  expect(reads).toBe(0);

  // 레일 탭을 다시 눌러 왼쪽 패널을 접는다: ui/store 서명은 그대로지만 바 폭은 325px가량 바뀐다.
  const drawTab = root.querySelector('#rail [data-panel="draw"]');
  expect(drawTab.classList.contains('on')).toBe(true);   // 기본 탭이 이미 열려 있다
  reads = 0;
  drawTab.click();                                        // 열려 있는 탭을 다시 누른다 → 접힘
  expect(root.querySelector('#panel').classList.contains('collapsed')).toBe(true);
  expect(reads).toBeGreaterThan(0);                       // 서명 불변이어도 강제로 다시 쟀다

  // 같은 탭을 다시 눌러 편다: 역시 강제 재측정.
  reads = 0;
  drawTab.click();
  expect(root.querySelector('#panel').classList.contains('collapsed')).toBe(false);
  expect(reads).toBeGreaterThan(0);

  shell.destroy();
});

// §15.4: 아이콘으로 줄여도 이름은 남아야 한다(title·aria-label).
test('화면 맞추기 버튼은 넓은 라벨과 아이콘을 함께 갖고 이름을 잃지 않는다', () => {
  const root = document.createElement('div'); root.id = 'app'; document.body.appendChild(root);
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const shell = createShell(root, { store, ui });
  const fit = root.querySelector('#btnFit');
  expect(fit.title).toBe('화면 맞추기 [0]');
  expect(fit.getAttribute('aria-label')).toBe('화면 맞추기');
  expect(fit.querySelector('.wide').textContent).toBe('화면 맞추기');
  expect(fit.querySelector('.narrow').textContent).toBe('⤢');
  expect(fit.querySelector('.narrow').getAttribute('aria-hidden')).toBe('true');
  // 리뷰 I-1의 1순위: 꼬리의 나머지 두 라벨도 같은 패턴으로 줄인다(꼬리 폭 ~67 px 절약).
  for (const [id, name, icon] of [['#btnBottomMore', '더보기', '▾'], ['#btnRightPanel', '속성 패널', '▸']]) {
    const el = root.querySelector(id);
    expect(el.closest('#bottomTail'), id).not.toBeNull();
    expect(el.title, id).toBe(name);
    expect(el.getAttribute('aria-label'), id).toBe(name);
    expect(el.querySelector('.narrow').textContent, id).toBe(icon);
    expect(el.querySelector('.narrow').getAttribute('aria-hidden'), id).toBe('true');
    expect(el.querySelector('.wide').textContent, id).toContain(icon);   // 넓은 라벨은 이름 + 같은 화살표
  }
  shell.destroy();
});

// §15.14: 첫 알림도 낭독되어야 한다(라이브 영역은 갱신 **전에** 존재해야 한다 — 감사 (d)10).
test('#toasts가 셸 마크업에 상주하고 캔버스·미니맵에 이름이 있다', () => {
  const root = document.createElement('div'); root.id = 'app'; document.body.appendChild(root);
  const store = createStore(createEmptyProject()); const ui = createUiState();
  const shell = createShell(root, { store, ui });
  const host = root.querySelector('#toasts');
  expect(host).not.toBeNull();
  expect(host.getAttribute('role')).toBe('status');
  expect(host.getAttribute('aria-live')).toBe('polite');
  const c2d = root.querySelector('#c2d');
  expect(c2d.getAttribute('role')).toBe('application');
  expect(c2d.getAttribute('aria-label')).toBe('도면 캔버스');
  const mini = root.querySelector('#minimap canvas');
  expect(mini.getAttribute('aria-label')).toBe('미니맵 — 클릭하면 그 자리로 이동합니다');
  shell.destroy();
});

// §15.14(계획 6 이월): 스플리터가 클램프되지 않은 폭을 저장해, 좁은 창에서 끌면 화면과 다른
// 폭이 kvp에 남았다. 저장은 "실제로 적용된 폭"이다.
test('스플리터는 화면에 적용된 폭을 저장한다', () => {
  localStorage.clear();
  const vw = window.innerWidth;
  window.innerWidth = 1100;                     // 두 패널이 260으로 클램프되는 폭
  try {
    const root = document.createElement('div'); document.body.appendChild(root);
    const shell = createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
    const sp = root.querySelector('#panelSplitter');
    sp.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 300, bubbles: true, cancelable: true }));
    sp.dispatchEvent(new MouseEvent('pointermove', { clientX: 460, bubbles: true }));   // 480까지 끌었다
    sp.dispatchEvent(new MouseEvent('pointerup', { clientX: 460, bubbles: true }));
    expect(localStorage.getItem('kvp.panelW')).toBe('260');   // 적용된 폭이 저장된다
    shell.destroy();
  } finally { localStorage.clear(); window.innerWidth = vw; }
});

// §15.14: 사용자가 직접 연 우측 패널은 다음 리사이즈에서 다시 접히지 않는다(계획 6 결정 6을
// 이렇게 좁힌다 — 손으로 연 것을 즉시 다시 접으면 조작이 먹지 않는 것처럼 보인다).
test('사용자가 연 우측 패널은 다음 자동 접힘에서 제외된다', () => {
  vi.useFakeTimers();
  const vw = window.innerWidth;
  window.innerWidth = 1000;                     // 우측이 자동으로 접히는 폭
  try {
    const root = document.createElement('div'); document.body.appendChild(root);
    const shell = createShell(root, { store: createStore(createEmptyProject()), ui: createUiState() });
    const layout = root.querySelector('#layout');
    expect(layout.classList.contains('right-off')).toBe(true);
    root.querySelector('#btnRightPanel').click();             // 사용자가 직접 펴 준다
    expect(layout.classList.contains('right-off')).toBe(false);
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(LAYOUT_DEBOUNCE_MS + 1);           // relayout()이 실제로 돈다
    expect(layout.classList.contains('right-off')).toBe(false); // 다시 접지 않는다
    // 창이 넓어져 접을 이유가 사라지면 예외도 끝난다.
    window.innerWidth = 1600;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(LAYOUT_DEBOUNCE_MS + 1);
    window.innerWidth = 1000;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(LAYOUT_DEBOUNCE_MS + 1);
    expect(layout.classList.contains('right-off')).toBe(true);
    shell.destroy();
  } finally { vi.useRealTimers(); window.innerWidth = vw; }
});
