import { createStore } from './state/store.js';
import { createUiState } from './state/uistate.js';
import { createEmptyProject, activeFloor } from './state/schema.js';
import { transformFloor, pruneSelection, pruneSolo, itemsOf, mirrorItems, setItemFlag, replaceProduct, pasteItems, sameProductIds, groupItems, ungroupItems, alignSelection, relativeMove, arrayCopy } from './state/floorOps.js';
import { createView2D } from './view2d/view2d.js';
import { createMinimap } from './view2d/minimap.js';
import { createRoomTool, ROOM_TOOL_DEFAULTS } from './view2d/tools/roomTool.js';
import { createWallTool, WALL_TOOL_DEFAULTS } from './view2d/tools/wallTool.js';
import { createSelectTool } from './view2d/tools/selectTool.js';
import { createGuideTool, GUIDE_TOOL_DEFAULTS } from './view2d/tools/guideTool.js';
import { createMeasureTool, MEASURE_TOOL_DEFAULTS } from './view2d/tools/measureTool.js';
import { createDuctTool, DUCT_TOOL_DEFAULTS } from './view2d/tools/ductTool.js';
import { createPlaceTool } from './view2d/tools/placeTool.js';
import { createStructTool, structDefaults } from './view2d/tools/structTool.js';
import { createView3D } from './view3d/view3d.js';
import { viewForMode } from './view3d/fit.js';
import { createShell } from './ui/shell.js';
import { createLibraryPanel } from './ui/libraryPanel.js';
import { createMaterialPanel } from './ui/materialPanel.js';
import { openMaterialEditor } from './ui/materialEditor.js';
import { panelsToCancel } from './ui/panelModes.js';
import { applyMaterial } from './state/materialOps.js';
import { createLayersPanel } from './ui/layersPanel.js';
import { createAirflowPanel } from './ui/airflowPanel.js';
import { createKeyHandler, setTable } from './ui/keymap.js';
import { buildTable, effectiveKeymap, loadOverrides } from './ui/keyBindings.js';
import { createPropsPanel } from './ui/propsPanel.js';
import { openRelativeMoveDialog, openArrayDialog } from './ui/itemDialogs.js';
import { openBackgroundDialog } from './ui/backgroundDialog.js';
import { openRoomTemplateDialog } from './ui/templateDialog.js';
import { openSettingsDialog } from './ui/settingsDialog.js';
import { createContextMenu } from './ui/contextMenu.js';
import { createDeleteActions } from './app/deleteActions.js';
import { createArrangeActions } from './app/arrangeActions.js';
import { confirmDialog } from './ui/confirmDialog.js';
import { promptDialog } from './ui/promptDialog.js';
import { openStartScreen } from './ui/startScreen.js';
import { openOnboarding, isOnboarded } from './ui/onboarding.js';
import { createTopbar, projectIsEmpty, confirmLeave } from './app/topbar.js';
import { templateProject, saveTemplate, listTemplates, BUILTIN_TEMPLATES } from './templates/projectTemplates.js';
import { loadSample } from './samples/gangdang.js';
import { serializeProject, parseProject, downloadText, readTextFile, startAutosave, loadAutosave, filenameFor, capture2D } from './io/file.js';

const store = createStore(createEmptyProject());
const ui = createUiState();
const shell = createShell(document.getElementById('app'), { store, ui, onGizmoMode: m => view3d.setGizmoMode(m), onMinimapResize: () => minimap?.requestRender(), onOpenKeymap: () => openSettingsDialog({ store, tab: 'keys' }) });
const viewPreset = document.getElementById('viewPreset'); // 하단 바의 2D 투영 선택(view3d가 상태를 되돌려 준다)
let minimap = null; // view보다 먼저 선언한다(onCameraChange가 닫아서 읽는다)
const menu = createContextMenu(document.body);
const view = createView2D(shell.els.canvas2d, store, ui, { menu, onCameraChange: () => minimap?.requestRender() }); // 태스크 5의 onCameraChange를 유지한다
const { createDeleteTool, deleteSelection, deleteOrTool } = createDeleteActions({ store, ui, view, toast: shell.toast, setTool: name => setTool(name) });
const arrange = createArrangeActions({ store, ui, view, toast: shell.toast, setTool: name => setTool(name) });
const selectedItemIds = () => { const s = ui.get().selection; return s?.type === 'item' ? [s.id] : s?.type === 'multi' && s.kind === 'item' ? [...s.ids] : []; };
const selectItems = ids => ui.set({ selection: !ids.length ? null : ids.length === 1 ? { type: 'item', id: ids[0] } : { type: 'multi', kind: 'item', ids } });
// 컨텍스트 메뉴(itemMenu.js)·속성 패널·단축키·3D 피커가 부르는 아이템 동작 묶음. view3d보다 먼저 선언한다(view3d 생성에 넘긴다).
const itemActions = {
  ids: selectedItemIds,
  mirror: axis => mirrorItems(store, selectedItemIds(), axis),
  replace: () => { library.setMode('replace', { itemIds: selectedItemIds() }); shell.showPanel('products'); },
  copy: () => { ui.set({ clipboard: itemsOf(store.get(), selectedItemIds()).map(i => structuredClone(i)) }); shell.toast('복사했습니다'); },
  canPaste: () => (ui.get().clipboard?.length ?? 0) > 0,
  paste: () => { const made = pasteItems(store, ui.get().clipboard ?? [], { delta: [200, 200] }); if (made.length) selectItems(made); }, // 붙여넣을 것이 없으면 선택을 건드리지 않는다
  remove: () => deleteSelection(),
  selectSame: () => {
    const it = itemsOf(store.get(), selectedItemIds())[0];
    if (it) selectItems(sameProductIds(activeFloor(store.get()), it.productId));
  },
  toggleHidden: () => setItemFlag(store, selectedItemIds(), 'hidden'),
  toggleLocked: () => setItemFlag(store, selectedItemIds(), 'locked'),
  group: () => groupItems(store, selectedItemIds()),
  ungroup: () => ungroupItems(store, selectedItemIds()),
  align: (axis, mode) => alignSelection(store, selectedItemIds(), axis, mode),
  relativeMove: () => {
    const ids = selectedItemIds(); if (!ids.length) return;
    openRelativeMoveDialog({ onApply: v => selectItems(relativeMove(store, ids, v)) });
  },
  arrayCopy: kind => {
    const ids = selectedItemIds(); if (!ids.length) return;
    openArrayDialog(kind, { onApply: params => { const made = arrayCopy(store, ids, kind, params); if (made.length) shell.toast(`${made.length}개 복사했습니다`); } });
  },
  pathArray: () => arrange.pathArray(selectedItemIds()),
};
// 벽·방 메뉴(surfaceMenu.js)와 속성 패널이 부르는 면 동작 묶음. 2D·3D가 같은 묶음을 쓴다.
const surfaceActions = {
  toPlanView: () => setMode('2d'),
};
const view3d = createView3D(shell.els.view3d, store, ui, { onExitFp: () => ui.set({ mode: 'iso' }), openMenu: (x, y, items) => menu.open(x, y, items), itemActions, surfaceActions, onOrthoView: name => { if (viewPreset) viewPreset.value = name ?? ''; shell.setOrtho(name); } }); // 투영 뷰에서는 기즈모가 없으므로 버튼도 함께 숨긴다
minimap = createMinimap(shell.els.minimap, store, ui, { view2d: view, view3d });
view3d.controls.addEventListener('change', () => minimap.requestRender()); // 3D 궤도 드래그도 미니맵을 다시 그린다
// 교체 대상이 그 사이 지워졌을 수 있다: 실제로 바꾼 개수를 세어 토스트를 띄운다.
function replaceProductOf(itemIds, product) {
  const live = itemsOf(store.get(), itemIds ?? []).map(i => i.id);
  if (!live.length) { shell.toast('교체할 제품이 없습니다'); return; }
  replaceProduct(store, live, product);
  shell.toast(`제품 ${live.length}개를 교체했습니다`);
}
const library = createLibraryPanel(shell.els.library, { store, ui, onPick: (p, { mode } = {}) => { if (mode === 'replace') replaceProductOf(selectedItemIds(), p); else startPlace(p); } });
const materials = createMaterialPanel(shell.els.materials, {
  store, ui,
  onPick: (m, { mode, target } = {}) => {
    if (mode !== 'replace' || !target) return;                     // 배치 모드는 패널이 ui.matPick을 이미 켰다
    applyMaterial(store, target, { id: m.id, offset: [0, 0], angle: 0 });
    shell.toast('재질을 교체했습니다');
  },
});
surfaceActions.replaceMaterial = target => { materials.setMode('replace', { target }); shell.showPanel('materials'); };
surfaceActions.openEditor = (wallId, side) => { if (wallId) openMaterialEditor({ store, wallId, side }); };
surfaceActions.applyTemplate = roomId => { if (roomId) openRoomTemplateDialog({ store, roomId }); };
// 라이브러리·마감재 "교체 모드"를 끄는 한 곳. Esc·도구 전환·다른 패널로 이동이 모두 이것을 부른다(배너 문구와 동작을 맞춘다).
// 레일 탭을 누른 경우에는 그 탭의 패널만 자기 모드를 지킨다(panelModes.js) — 제품↔마감재를 오가도 상대 패널이 꺼진다.
const cancelReplace = (clickedPanel = null) => {
  const off = panelsToCancel(clickedPanel);
  if (off.includes('products')) library.setMode('place');
  if (off.includes('materials')) materials.setMode('place');
};
ui.subscribe(() => { if (library.state.mode === 'replace' && !selectedItemIds().length) library.setMode('place'); }); // 교체 대상이 사라지면 교체 모드도 끝난다(옛 아이템을 조용히 교체하지 않게). 면 대상은 아이템 선택과 무관하므로 마감재는 그대로 둔다
document.querySelectorAll('#rail button').forEach(b => b.addEventListener('click', () => cancelReplace(b.dataset.panel)));
createAirflowPanel(shell.els.airflow, { store, ui });
createLayersPanel(shell.els.layers, { store, ui });
createPropsPanel(shell.els.props, store, ui, { deleteSelection, itemActions, surfaceActions });
// undo/redo/방 재검출로 선택한 객체가 사라지면 선택을 비운다(multi는 남은 것만 남긴다)
store.subscribe(s => {
  const u = ui.get();
  const next = pruneSelection(s, u.selection);
  if (next !== u.selection) ui.set({ selection: next });
  const solo = pruneSolo(s, u.soloRoom); // 단일 공간 모드의 방이 사라지면 모드도 끈다
  if (solo !== u.soloRoom) ui.set({ soloRoom: solo });
});

// 도구 옵션은 세션 동안 유지된다: 도구를 다시 켜도 옵션 바에서 바꾼 값이 남는다.
const toolOpts = { room: { ...ROOM_TOOL_DEFAULTS }, wall: { ...WALL_TOOL_DEFAULTS }, guide: { ...GUIDE_TOOL_DEFAULTS }, measure: { ...MEASURE_TOOL_DEFAULTS }, duct: { ...DUCT_TOOL_DEFAULTS } };
// 구조물 도구 옵션도 세션 동안 유지된다. 기둥 높이 기본값이 층고라 처음 켤 때 활성 층에서 읽는다.
const structOpts = {};
const structTool = kind => () => createStructTool({ store, ui, view, kind, opts: (structOpts[kind] ??= structDefaults(kind, activeFloor(store.get()).height)), onDone: () => setTool('select') });
let pendingProduct = null; // startPlace가 세팅하고, place 도구가 켜질 때 읽는다
const tools = {
  select: () => createSelectTool({ store, ui, view, itemActions, surfaceActions, toast: shell.toast, onLocked: () => shell.toast('현재 도면 잠금 상태입니다') }),
  room: () => createRoomTool({ store, opts: toolOpts.room, onDone: () => setTool('select') }),
  wall: () => createWallTool({ store, opts: toolOpts.wall, onDone: () => setTool('select') }),
  delete: createDeleteTool,
  'column-square': structTool('column-square'),
  'column-round': structTool('column-round'),
  opening: structTool('opening'),
  guide: () => createGuideTool({ store, view, opts: toolOpts.guide }),
  measure: () => createMeasureTool({ store, opts: toolOpts.measure, view }),
  duct: () => createDuctTool({ store, ui, view, opts: toolOpts.duct, onDone: () => setTool('select') }),
  place: () => createPlaceTool({ store, ui, view, product: pendingProduct, onDone: () => setTool('select') }),
  pathArray: () => arrange.createPathTool(),
};
function setTool(name) { cancelReplace(); const t = tools[name](); ui.set({ tool: name }); view.setTool(t); shell.setOptionBar(t); }
// 라이브러리에서 제품을 고르면 배치 도구를 켠다(오늘의집과 같은 동작: 한 번 배치하면 선택 도구로 돌아간다).
function startPlace(product) { pendingProduct = product; setTool('place'); }
function setMode(mode, opts) {
  if (mode === 'fp') { if (view3d.getMode() === 'fp') view3d.setMode('iso'); ui.set({ fpPick: true, mode: '2d' }); return; }
  ui.set({ mode, fpPick: false });
  if (mode !== '2d') view3d.setMode(mode, opts);
  else { if (view3d.getMode() === 'fp') view3d.setMode('iso'); view3d.clearOrthoView(); view.requestRender(); } // 2D로 갈 때 fp(포인터 락, 렌더 루프)와 2D 투영을 끝낸다
}
const canvas2d = shell.els.canvas2d;
canvas2d.addEventListener('pointerdown', ev => { if (ui.get().fpPick && ev.button === 0) { const at = view.toWorld([ev.offsetX, ev.offsetY]); ui.set({ mode: 'fp', fpPick: false }); view3d.setMode('fp', { at }); ev.stopImmediatePropagation(); } }, true);

document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => b.dataset.tool === 'delete' ? deleteOrTool() : setTool(b.dataset.tool)));
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
document.querySelector('[data-action="background"]').addEventListener('click', () => openBackgroundDialog({ store }));
document.querySelector('[data-action="flipH"]').addEventListener('click', () => transformFloor(store, p => [-p[0], p[1]]));
document.querySelector('[data-action="flipV"]').addEventListener('click', () => transformFloor(store, p => [p[0], -p[1]]));
document.querySelector('[data-action="rotL"]').addEventListener('click', () => transformFloor(store, p => [p[1], -p[0]]));
document.querySelector('[data-action="rotR"]').addEventListener('click', () => transformFloor(store, p => [-p[1], p[0]]));
document.getElementById('btnUndo').addEventListener('click', () => store.undo());
document.getElementById('btnRedo').addEventListener('click', () => store.redo());
// 줌·화면 맞추기는 현재 모드의 뷰가 받는다(2D 도면 / 3D 카메라).
const activeView = () => viewForMode(ui.get().mode, view, view3d);
const fitView = () => activeView().fit();
document.getElementById('btnFit').addEventListener('click', fitView);
const zoom = factor => activeView().zoomBy(factor);
document.getElementById('btnZoomIn').addEventListener('click', () => zoom(1.25));
document.getElementById('btnZoomOut').addEventListener('click', () => zoom(1 / 1.25));
viewPreset?.addEventListener('change', ev => {
  const name = ev.target.value; // 먼저 읽는다: setMode가 onOrthoView(null)로 선택을 비운다
  if (!name) { view3d.clearOrthoView(); return; }
  if (ui.get().mode === '2d') setMode('iso');
  view3d.setOrthoView(name);
});
document.getElementById('projectName').addEventListener('change', ev => store.dispatch(d => { d.name = ev.target.value; }));
const selectAll = () => { const ids = activeFloor(store.get()).walls.map(w => w.id); ui.set({ selection: ids.length ? { type: 'multi', kind: 'wall', ids } : null }); };
const openSettings = () => openSettingsDialog({ store });
document.getElementById('btnSettings').addEventListener('click', openSettings);

// 자동 저장본은 브라우저 대화상자로 묻지 않는다: 시작 화면의 "이어서 작업" 카드로 제안한다(§12.5).
// 온보딩은 시작 화면을 닫은 뒤에 뜬다(오버레이 두 장이 겹치지 않게 — §12.4).
const restored = loadAutosave();
const maybeOnboard = () => { if (!isOnboarded()) openOnboarding({ store }); };
if (projectIsEmpty(store.get())) showStart({ restored, onClose: maybeOnboard });
else maybeOnboard();
const auto = startAutosave(store, { onSaved: t => { document.getElementById('savedAt').textContent = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')} 자동 저장됨`; } });
document.getElementById('btnSave').addEventListener('click', () => { downloadText(filenameFor(store.get()), serializeProject(store.get())); auto.saveNow(); shell.toast('저장했습니다'); });
// 더보기 메뉴의 "템플릿으로 저장". 이름은 프로젝트 이름을 기본값으로 묻고, 이미 있는 이름은 막는다
// (saveTemplate은 같은 이름을 조용히 덮어쓴다 — 실수로 저장해 둔 템플릿을 지우지 않게 여기서 거른다).
async function saveAsTemplate() {
  const taken = new Set([...listTemplates(), ...BUILTIN_TEMPLATES].map(t => String(t.name).trim()));
  const name = await promptDialog({
    title: '템플릿으로 저장', label: '템플릿 이름', value: store.get().name, ok: '저장',
    validate: t => (!t.trim() ? '이름을 입력해주세요' : taken.has(t.trim()) ? '같은 이름의 템플릿이 있습니다' : null),
  });
  if (name === null) return;
  const saved = saveTemplate(name, store.get());
  if (saved) shell.toast(`템플릿 "${saved.name}"을 저장했습니다`);
  else shell.toast('템플릿을 저장하지 못했습니다(저장 공간 부족)');
}
// 새로 만들기·나가기·JSON 내보내기. 상단 바 버튼 배선은 topbar.js가 한다.
function showStart({ restored = null, onClose = () => {} } = {}) {
  openStartScreen({
    store,
    restored,
    onClose,
    onRestore: () => { if (restored) { store.replace(restored, { record: false }); view.fit(); shell.toast('이어서 작업합니다'); } }, // 복원은 되돌릴 단계가 아니다
    onEmpty: () => {},
    onUpload: () => openBackgroundDialog({ store }),
    onSample: () => { loadSample(store); view.fit(); },
    onTemplate: id => { const p = templateProject(id); if (p) { store.replace(p); view.fit(); } },
  });
}
const actions = {
  newProject: async () => {
    if (!(await confirmDialog({ title: '새로 만들기', message: '현재 도면이 초기화됩니다. 새로 만들까요?', ok: '새로 만들기' }))) return;
    store.replace(createEmptyProject());
    ui.set({ selection: null, soloRoom: null, matPick: null });
    view.fit();
    showStart();
  },
  saveAsTemplate,
  exportJson: () => { downloadText(filenameFor(store.get()), serializeProject(store.get())); shell.toast('JSON을 내보냈습니다'); },
  // 시작 화면은 샘플·템플릿으로 프로젝트를 갈아 끼운다: 작업 중이면 먼저 묻는다(새로만들기와 같은 규칙).
  exit: async () => { if (await confirmLeave(store.get(), { saveNow: () => auto.saveNow() })) showStart(); },
};
createTopbar({ store, ui, shell, menu, view3d, actions });

async function loadFile(file) {
  if (!file) return; // 파일 선택 취소
  try { store.replace(parseProject(await readTextFile(file))); view.fit(); shell.toast('불러왔습니다'); }
  catch (e) { shell.toast(e.message); }
}

document.getElementById('btnLoad').addEventListener('click', () => {
  const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
  i.onchange = () => loadFile(i.files[0]);
  i.click();
});
const captureNow = async () => {
  try { const url = ui.get().mode === '2d' ? await capture2D(store, ui) : view3d.capture(); const a = document.createElement('a'); a.href = url; a.download = filenameFor(store.get()).replace('.json', '.png'); a.click(); }
  catch (e) { shell.toast(e.message); }
};
document.querySelectorAll('[data-action="capture"]').forEach(b => b.addEventListener('click', captureNow));

const canvasWrap = document.getElementById('canvasWrap');
canvasWrap.addEventListener('dragover', ev => ev.preventDefault());
canvasWrap.addEventListener('drop', async ev => {
  ev.preventDefault();
  const file = ev.dataTransfer.files[0];
  if (!file) return;
  if (file.type === 'application/json' || /\.json$/i.test(file.name)) {
    loadFile(file);
  } else if (/^image\//.test(file.type)) {
    openBackgroundDialog({ store });
  }
});

setTable(buildTable(effectiveKeymap(loadOverrides()))); // 저장된 단축키 재지정을 적용한다
window.addEventListener('keydown', createKeyHandler({ store, ui, view, setTool, setMode, openBackground: () => openBackgroundDialog({ store }), deleteSelection, deleteOrTool, save: () => document.getElementById('btnSave').click(), selectAll, openSettings, zoomIn: () => zoom(1.25), zoomOut: () => zoom(1 / 1.25), fit: fitView, cancelReplace, itemActions }));
setTool('select'); view.fit(); minimap.fit(500);
if (import.meta.env.DEV) window.__app = { store, ui, view, view3d, actions }; // 브라우저 검증용, 개발 빌드에서만
