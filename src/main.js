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
import { createStructTool, structDefaults, structOptsKey, ensureStructuresVisible } from './view2d/tools/structTool.js';
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
import { createDndActions } from './app/dndActions.js';
import { createMenuActions } from './app/menuActions.js';
import { openOnboarding, isOnboarded } from './ui/onboarding.js';
import { createTopbar, projectIsEmpty } from './app/topbar.js';
import { createDirtyTracker, createSaveIndicator } from './app/dirty.js';
import { createProjectActions } from './app/projectActions.js';
import { createHistoryActions } from './app/historyActions.js';
import { createFirstRoomFit } from './app/firstRoomFit.js';
import { serializeProject, downloadText, startAutosave, loadAutosave, filenameFor } from './io/file.js';
import { createFileActions } from './app/fileActions.js';
import { stickyTools } from './ui/prefs.js';
import { FP_NO_LOCK, SAVED_MANUAL, PASTE_RESULT, COPIED, COPIED_N, REPLACE_NONE, REPLACE_DONE, MATERIAL_REPLACED, STRUCTURES_SHOWN, PLAN_LOCKED } from './ui/messages.js';

const store = createStore(createEmptyProject());
const ui = createUiState();
let layersPanel = null;   // 아래에서 만든다: 레일 탭을 열 때 선택 행을 보여 주려면 핸들이 필요하다(§17.6(3))
const shell = createShell(document.getElementById('app'), { store, ui, onGizmoMode: m => view3d.setGizmoMode(m), onMinimapResize: () => minimap?.requestRender(), onOpenKeymap: () => openSettingsDialog({ store, tab: 'keys' }), onExitFp: () => setMode('iso'), onToolChange: () => view.requestRender(), onPanelShow: name => { if (name === 'layers') layersPanel?.reveal(); } });
const viewPreset = document.getElementById('viewPreset'); // 하단 바의 2D 투영 선택(view3d가 상태를 되돌려 준다)
let minimap = null; // view보다 먼저 선언한다(onCameraChange가 닫아서 읽는다)
let dnd = null;     // 같은 이유로 여기서 선언한다(드래그 옵션이 닫아서 읽는다 — 배선은 startPlace 다음에 만든다)
const menu = createContextMenu(document.body);
const view = createView2D(shell.els.canvas2d, store, ui, { menu, onCameraChange: () => minimap?.requestRender(), onDragOver: p => dnd?.onDragOver(p), onDrop: p => dnd?.onDrop(p), onDragLeave: () => dnd?.onDragLeave(), onHint: () => shell.refreshTool() });   // 태스크 5의 onCameraChange를 유지한다 · onHint는 배너 + 치수 칸(§16.7)
const { createDeleteTool, deleteSelection, deleteOrTool } = createDeleteActions({ store, ui, view, toast: shell.toast, setTool: name => setTool(name) });
const arrange = createArrangeActions({ store, ui, view, toast: shell.toast, setTool: name => setTool(name) });
const selectedItemIds = () => { const s = ui.get().selection; return s?.type === 'item' ? [s.id] : s?.type === 'multi' && s.kind === 'item' ? [...s.ids] : []; };
const selectItems = ids => ui.set({ selection: !ids.length ? null : ids.length === 1 ? { type: 'item', id: ids[0] } : { type: 'multi', kind: 'item', ids } });
// 컨텍스트 메뉴(itemMenu.js)·속성 패널·단축키·3D 피커가 부르는 아이템 동작 묶음. view3d보다 먼저 선언한다(view3d 생성에 넘긴다).
const itemActions = {
  ids: selectedItemIds,
  mirror: axis => mirrorItems(store, selectedItemIds(), axis),
  replace: () => { library.setMode('replace', { itemIds: selectedItemIds() }); shell.showPanel('products'); },
  copy: () => { ui.set({ clipboard: itemsOf(store.get(), selectedItemIds()).map(i => structuredClone(i)) }); shell.toast(COPIED); },
  canPaste: () => (ui.get().clipboard?.length ?? 0) > 0,
  // 붙여넣을 것이 없으면 선택도 건드리지 않고 알리지도 않는다. 복사에는 문구가 있었는데
  // 붙여넣기에는 없어 "먹었나?" 싶었다(§15.14 · 감사 §30).
  paste: () => { const made = pasteItems(store, ui.get().clipboard ?? [], { delta: [200, 200] }); if (made.length) { selectItems(made); shell.toast(PASTE_RESULT(made.length)); } },
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
    openArrayDialog(kind, { onApply: params => { const made = arrayCopy(store, ids, kind, params); if (made.length) shell.toast(COPIED_N(made.length)); } });
  },
  pathArray: () => arrange.pathArray(selectedItemIds()),
};
// 벽·방 메뉴(surfaceMenu.js)와 속성 패널이 부르는 면 동작 묶음. 2D·3D가 같은 묶음을 쓴다.
const surfaceActions = {
  toPlanView: () => setMode('2d'),
};
const view3d = createView3D(shell.els.view3d, store, ui, { onExitFp: () => ui.set({ mode: 'iso' }), onFpFallback: on => { if (on) shell.toast(FP_NO_LOCK); }, openMenu: (x, y, items) => menu.open(x, y, items), itemActions, surfaceActions, onOrthoView: name => { if (viewPreset) viewPreset.value = name ?? ''; shell.setOrtho(name); } }); // 투영 뷰에서는 기즈모가 없으므로 버튼도 함께 숨긴다
minimap = createMinimap(shell.els.minimap, store, ui, { view2d: view, view3d });
view3d.controls.addEventListener('change', () => minimap.requestRender()); // 3D 궤도 드래그도 미니맵을 다시 그린다
// 교체 대상이 그 사이 지워졌을 수 있다: 실제로 바꾼 개수를 세어 토스트를 띄운다.
function replaceProductOf(itemIds, product) {
  const live = itemsOf(store.get(), itemIds ?? []).map(i => i.id);
  if (!live.length) { shell.toast(REPLACE_NONE); return; }
  replaceProduct(store, live, product);
  shell.toast(REPLACE_DONE(live.length));
}
// onDragEnd는 라이브러리 타일(드래그 소스)에서만 온다 — dragend는 캔버스에서 일어나지 않으므로
// 캔버스 위에서 [Esc]로 취소한 드래그를 되돌릴 수 있는 유일한 경로다(§14.11).
const library = createLibraryPanel(shell.els.library, { store, ui, onDragEnd: () => dnd?.onDragEnd(), onPick: (p, { mode } = {}) => { if (mode === 'replace') replaceProductOf(selectedItemIds(), p); else startPlace(p); } });
const materials = createMaterialPanel(shell.els.materials, {
  store, ui,
  onPick: (m, { mode, target } = {}) => {
    if (mode !== 'replace' || !target) return;                     // 배치 모드는 패널이 ui.matPick을 이미 켰다
    applyMaterial(store, target, { id: m.id, offset: [0, 0], angle: 0 });
    shell.toast(MATERIAL_REPLACED);
  },
});
surfaceActions.replaceMaterial = target => { materials.setMode('replace', { target }); shell.showPanel('materials'); };
surfaceActions.openEditor = (wallId, side) => { if (wallId) openMaterialEditor({ store, wallId, side }); };
surfaceActions.applyTemplate = roomId => { if (roomId) openRoomTemplateDialog({ store, ui, roomId }); };
surfaceActions.placeTile = () => { shell.showPanel('materials'); materials.placeTile(); };
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
layersPanel = createLayersPanel(shell.els.layers, { store, ui });
createPropsPanel(shell.els.props, store, ui, { deleteSelection, itemActions, surfaceActions });
// undo/redo/방 재검출로 선택한 객체가 사라지면 선택을 비운다(multi는 남은 것만 남긴다)
store.subscribe(s => {
  const u = ui.get();
  const next = pruneSelection(s, u.selection);
  if (next !== u.selection) ui.set({ selection: next });
  const solo = pruneSolo(s, u.soloRoom); // 단일 공간 모드의 방이 사라지면 모드도 끈다
  if (solo !== u.soloRoom) ui.set({ soloRoom: solo });
});

// §14.7: 방·벽 도구는 커밋 뒤에도 켜진 채다(kvp.stickyTools, 기본 켜짐). [Esc]가 선택으로 돌아간다.
// 기둥·개구부(structTool)도 같은 설정을 따른다(m-7): 그 도구는 놓은 뒤(onPlaced)와 끝내는 경로
// (onDone = [Esc]·안내 클릭·우클릭)가 나뉘어 있어, 설정은 onPlaced에만 걸린다 — onDone에 걸면
// 설정이 켜진 동안 [Esc]로 도구를 끌 수 없다.
const stickyDone = () => { if (!stickyTools()) setTool('select'); };
// 도구 옵션은 세션 동안 유지된다: 도구를 다시 켜도 옵션 바에서 바꾼 값이 남는다.
const toolOpts = { room: { ...ROOM_TOOL_DEFAULTS }, wall: { ...WALL_TOOL_DEFAULTS }, guide: { ...GUIDE_TOOL_DEFAULTS }, measure: { ...MEASURE_TOOL_DEFAULTS }, duct: { ...DUCT_TOOL_DEFAULTS } };
// 구조물 도구 옵션도 세션 동안 유지된다. 다만 기둥 높이 기본값이 층고라, 활성 층·층 높이가 바뀌면
// 옵션을 비워 도구를 켤 때 새 층고를 다시 읽게 한다(M-6).
const structOpts = {};
let structKey = null;
const structTool = kind => () => {
  const key = structOptsKey(store.get());
  if (key !== structKey) { structKey = key; for (const k of Object.keys(structOpts)) delete structOpts[k]; }
  if (ensureStructuresVisible(store)) shell.toast(STRUCTURES_SHOWN); // 꺼져 있으면 놓아도 보이지 않는다(M-9)
  return createStructTool({ store, ui, view, kind, opts: (structOpts[kind] ??= structDefaults(kind, activeFloor(store.get()).height)), onDone: () => setTool('select'), onPlaced: stickyDone, toast: shell.toast });
};
let pendingProduct = null; // startPlace가 세팅하고, place 도구가 켜질 때 읽는다
const tools = {
  select: () => createSelectTool({ store, ui, view, itemActions, surfaceActions, toast: shell.toast, onLocked: () => shell.toast(PLAN_LOCKED) }),
  room: () => createRoomTool({ store, view, opts: toolOpts.room, onDone: stickyDone }),
  wall: () => createWallTool({ store, view, opts: toolOpts.wall, onDone: stickyDone }),
  delete: createDeleteTool,
  'column-square': structTool('column-square'),
  'column-round': structTool('column-round'),
  opening: structTool('opening'),
  guide: () => createGuideTool({ store, view, opts: toolOpts.guide }),
  measure: () => createMeasureTool({ store, opts: toolOpts.measure, view }),
  duct: () => createDuctTool({ store, ui, view, opts: toolOpts.duct, onDone: () => setTool('select'), toast: shell.toast }),
  place: () => createPlaceTool({ store, ui, view, product: pendingProduct, onDone: () => setTool('select'), toast: shell.toast }),
  pathArray: () => arrange.createPathTool(),
};
function setTool(name) { cancelReplace(); const t = tools[name](); ui.set({ tool: name }); view.setTool(t); shell.setOptionBar(t); }
// 라이브러리에서 제품을 고르면 배치 도구를 켠다(오늘의집과 같은 동작: 한 번 배치하면 선택 도구로 돌아간다).
function startPlace(product) { pendingProduct = product; setTool('place'); }
// 타일을 캔버스로 끌어 놓는 배치(§14.11). 규칙은 app/dndActions.js 한 자리에 있다.
dnd = createDndActions({ ui, view, startPlace, pending: () => pendingProduct, setTool, toast: shell.toast });
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
// 층을 가로지르는 되돌리기·다시 실행은 어느 층의 무엇이 되돌려졌는지 알리고, 다시 실행은
// **변경이 있던 층**으로 데려간다(§17.7 · 감사 §53). 규칙과 배선은 app/historyActions.js 한 곳이다.
const { undoAction, redoAction } = createHistoryActions({ store, toast: shell.toast });
document.getElementById('btnUndo').addEventListener('click', undoAction);
document.getElementById('btnRedo').addEventListener('click', redoAction);
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
// 저장 표시 세 상태(§15.7): "HH:MM 파일로 저장" / "HH:MM 자동 저장됨" / "저장 안 된 변경" · 이력이
// 없으면 "저장 이력 없음". 무엇을 적을지는 createSaveIndicator가 정한다(kind: manual/auto/none).
// onChange가 saveInd를 보지만 TDZ에 걸리지 않는다: 첫 호출은 스토어가 처음 바뀔 때다(이 구간에 쓰기 없음).
const dirty = createDirtyTracker(store, { onChange: () => saveInd.show() });
const saveInd = createSaveIndicator(dirty);
const auto = startAutosave(store, { onSaved: t => saveInd.markSaved('auto', t) });   // 표시 시각 = 저장 시각
// 첫 방이 생기면 화면을 한 번 맞춘다(§16.12 · 감사 §49 · 리뷰 I-1). 규칙과 "한 번" 래치는
// app/firstRoomFit.js에 있다: undo/redo·방 전체 삭제·층 전환이 카메라를 다시 낚아채지 않게
// 한 프로젝트 세션에 한 번만 튀고, 같은 자리에서 첫 방 유도(firstRoomHint)도 끈다.
// 프로젝트를 갈아 끼우는 길은 스스로 fit을 부르므로 래치만 다시 잡는다(onProjectSwap = rearm).
const firstRoomFit = createFirstRoomFit({ store, ui, view });
const project = createProjectActions({ store, ui, view, toast: shell.toast, restored, isDirty: () => dirty.isDirty(), markSaved: saveInd.markSaved, saveNow: () => auto.saveNow(), onProjectSwap: firstRoomFit.rearm });
// 온보딩을 닫으면 배너가 다음 행동을 가리킨다(§16.12 · 감사 §47).
const maybeOnboard = () => { if (!isOnboarded()) openOnboarding({ store, onDone: () => ui.set({ firstRoomHint: true }) }); };
if (projectIsEmpty(store.get())) project.showStart({ onClose: maybeOnboard });
else maybeOnboard();
document.getElementById('btnSave').addEventListener('click', () => {
  downloadText(filenameFor(store.get()), serializeProject(store.get()));
  auto.saveNow();               // 자동 저장본도 최신으로 만든다(그 onSaved가 시각을 먼저 적는다)
  saveInd.markSaved('manual');  // 그다음 "파일로 저장"으로 덮는다(표시 문구가 수동 저장이 된다)
  shell.toast(SAVED_MANUAL);
});
createTopbar({ store, ui, shell, menu, view3d, actions: project.actions });

const files = createFileActions({ store, ui, view, view3d, toast: shell.toast, isDirty: () => dirty.isDirty(), markSaved: saveInd.markSaved, saveNow: () => auto.saveNow(), onProjectSwap: firstRoomFit.rearm });
document.getElementById('btnLoad').addEventListener('click', () => files.openFileDialog());
document.querySelectorAll('[data-action="capture"]').forEach(b => b.addEventListener('click', () => files.captureNow()));
files.wireDrop(document.getElementById('canvasWrap'));

setTable(buildTable(effectiveKeymap(loadOverrides()))); // 저장된 단축키 재지정을 적용한다
const menuActions = createMenuActions({ store, ui, view, menu, canvas: canvas2d });
window.addEventListener('keydown', createKeyHandler({ store, ui, view, setTool, setMode, openBackground: () => openBackgroundDialog({ store }), deleteSelection, deleteOrTool, save: () => document.getElementById('btnSave').click(), selectAll, openSettings, zoomIn: () => zoom(1.25), zoomOut: () => zoom(1 / 1.25), fit: fitView, cancelReplace, itemActions, contextMenu: () => menuActions.openSelectionMenu(),
  undo: undoAction, redo: redoAction,
}));
setTool('select'); view.fit(); minimap.fit(500);
if (import.meta.env.DEV) window.__app = { store, ui, view, view3d, actions: project.actions, dirty }; // 브라우저 검증용, 개발 빌드에서만
