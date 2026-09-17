import { createStore } from './state/store.js';
import { createUiState } from './state/uistate.js';
import { createEmptyProject, activeFloor } from './state/schema.js';
import { deleteWall, deleteWalls, deleteRoom, deleteItems, transformFloor, pruneSelection, pruneSolo, itemsOf, mirrorItems, setItemFlag, replaceProduct, pasteItems, sameProductIds, groupItems, ungroupItems, alignSelection, relativeMove, arrayCopy } from './state/floorOps.js';
import { hitWall } from './geom/walls.js';
import { pointInPolygon } from './geom/rooms.js';
import { createView2D } from './view2d/view2d.js';
import { createMinimap } from './view2d/minimap.js';
import { createRoomTool, ROOM_TOOL_DEFAULTS } from './view2d/tools/roomTool.js';
import { createWallTool, WALL_TOOL_DEFAULTS } from './view2d/tools/wallTool.js';
import { createSelectTool } from './view2d/tools/selectTool.js';
import { createGuideTool, GUIDE_TOOL_DEFAULTS } from './view2d/tools/guideTool.js';
import { createMeasureTool, MEASURE_TOOL_DEFAULTS } from './view2d/tools/measureTool.js';
import { createPlaceTool } from './view2d/tools/placeTool.js';
import { createView3D } from './view3d/view3d.js';
import { viewForMode } from './view3d/fit.js';
import { createShell } from './ui/shell.js';
import { createLibraryPanel } from './ui/libraryPanel.js';
import { createLayersPanel } from './ui/layersPanel.js';
import { createKeyHandler } from './ui/keymap.js';
import { createPropsPanel } from './ui/propsPanel.js';
import { openRelativeMoveDialog, openArrayDialog } from './ui/itemDialogs.js';
import { openBackgroundDialog } from './ui/backgroundDialog.js';
import { openSettingsDialog } from './ui/settingsDialog.js';
import { createContextMenu } from './ui/contextMenu.js';
import { openStartScreen } from './ui/startScreen.js';
import { loadSample } from './samples/gangdang.js';
import { serializeProject, parseProject, downloadText, readTextFile, startAutosave, loadAutosave, filenameFor, capture2D } from './io/file.js';

const store = createStore(createEmptyProject());
const ui = createUiState();
const shell = createShell(document.getElementById('app'), { store, ui, onGizmoMode: m => view3d.setGizmoMode(m) });
const viewPreset = document.getElementById('viewPreset'); // 하단 바의 2D 투영 선택(view3d가 상태를 되돌려 준다)
let minimap = null; // view보다 먼저 선언한다(onCameraChange가 닫아서 읽는다)
const menu = createContextMenu(document.body);
const view = createView2D(shell.els.canvas2d, store, ui, { menu, onCameraChange: () => minimap?.requestRender() }); // 태스크 5의 onCameraChange를 유지한다
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
};
const view3d = createView3D(shell.els.view3d, store, ui, { onExitFp: () => ui.set({ mode: 'iso' }), openMenu: (x, y, items) => menu.open(x, y, items), itemActions, onOrthoView: name => { if (viewPreset) viewPreset.value = name ?? ''; } });
minimap = createMinimap(shell.els.minimap, store, ui, { view2d: view, view3d });
view3d.controls.addEventListener('change', () => minimap.requestRender()); // 3D 궤도 드래그도 미니맵을 다시 그린다
function replaceProductOf(itemIds, product) { if (itemIds?.length) { replaceProduct(store, itemIds, product); shell.toast('제품을 교체했습니다'); } }
const library = createLibraryPanel(shell.els.library, { store, ui, onPick: (p, { mode, itemIds } = {}) => { if (mode === 'replace') replaceProductOf(itemIds, p); else startPlace(p); } });
createLayersPanel(shell.els.layers, { store, ui });
createPropsPanel(shell.els.props, store, ui, { deleteSelection, itemActions });
// undo/redo/방 재검출로 선택한 객체가 사라지면 선택을 비운다(multi는 남은 것만 남긴다)
store.subscribe(s => {
  const u = ui.get();
  const next = pruneSelection(s, u.selection);
  if (next !== u.selection) ui.set({ selection: next });
  const solo = pruneSolo(s, u.soloRoom); // 단일 공간 모드의 방이 사라지면 모드도 끈다
  if (solo !== u.soloRoom) ui.set({ soloRoom: solo });
});

function createDeleteTool() {
  return {
    name: 'delete', opts: {}, hint: '삭제할 벽을 클릭하세요. 방을 지우려면 방 안쪽 바닥을 클릭하세요.',
    onPointerDown(p) {
      const f = activeFloor(store.get());
      const w = hitWall(f.walls, p, 6 / view.camera.scale);
      if (w) { deleteWall(store, w.id); return; }
      const r = f.rooms.find(x => pointInPolygon(p, x.points));
      if (r && window.confirm('방과 그 벽을 모두 삭제할까요?')) {
        deleteRoom(store, r.id);
        if (ui.get().selection?.type === 'room' && ui.get().selection.id === r.id) ui.set({ selection: null });
      }
    },
    onPointerMove() {}, onPointerUp() {}, onKey: () => false, draw() {}, cancel() {},
  };
}
// 도구 옵션은 세션 동안 유지된다: 도구를 다시 켜도 옵션 바에서 바꾼 값이 남는다.
const toolOpts = { room: { ...ROOM_TOOL_DEFAULTS }, wall: { ...WALL_TOOL_DEFAULTS }, guide: { ...GUIDE_TOOL_DEFAULTS }, measure: { ...MEASURE_TOOL_DEFAULTS } };
let pendingProduct = null; // startPlace가 세팅하고, place 도구가 켜질 때 읽는다
const tools = {
  select: () => createSelectTool({ store, ui, view, itemActions, toast: shell.toast, onLocked: () => shell.toast('현재 도면 잠금 상태입니다') }),
  room: () => createRoomTool({ store, opts: toolOpts.room, onDone: () => setTool('select') }),
  wall: () => createWallTool({ store, opts: toolOpts.wall, onDone: () => setTool('select') }),
  delete: createDeleteTool,
  guide: () => createGuideTool({ store, view, opts: toolOpts.guide }),
  measure: () => createMeasureTool({ store, opts: toolOpts.measure }),
  place: () => createPlaceTool({ store, ui, view, product: pendingProduct, onDone: () => setTool('select') }),
};
function setTool(name) { const t = tools[name](); ui.set({ tool: name }); view.setTool(t); shell.setOptionBar(t); }
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

function deleteSelection() {
  const s = ui.get().selection;
  if (s?.type === 'item') { deleteItems(store, [s.id]); ui.set({ selection: null }); return; }
  if (s?.type === 'multi' && s.kind === 'item') { deleteItems(store, s.ids); ui.set({ selection: null }); return; }
  if (s?.type === 'wall') { deleteWall(store, s.id); ui.set({ selection: null }); }
  if (s?.type === 'multi' && s.kind === 'wall') { deleteWalls(store, s.ids); ui.set({ selection: null }); }
  if (s?.type === 'room' && window.confirm('방과 그 벽을 모두 삭제할까요?')) { deleteRoom(store, s.id); ui.set({ selection: null }); }
}
function deleteOrTool() { if (ui.get().selection) deleteSelection(); else setTool('delete'); }
const restored = loadAutosave();
const restoredOk = !!(restored && window.confirm('자동 저장된 프로젝트가 있습니다. 불러올까요?'));
if (restoredOk) store.replace(restored, { record: false }); // 복원은 되돌릴 단계가 아니다
const isEmpty = s => s.floors.every(f => !f.walls.length) && !s.background;
if (!restoredOk && isEmpty(store.get())) {
  openStartScreen({
    store,
    onEmpty: () => {},
    onUpload: () => openBackgroundDialog({ store }),
    onSample: () => { loadSample(store); view.fit(); },
  });
}
const auto = startAutosave(store, { onSaved: t => { document.getElementById('savedAt').textContent = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')} 자동 저장됨`; } });
document.getElementById('btnSave').addEventListener('click', () => { downloadText(filenameFor(store.get()), serializeProject(store.get())); auto.saveNow(); shell.toast('저장했습니다'); });

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

window.addEventListener('keydown', createKeyHandler({ store, ui, view, setTool, setMode, openBackground: () => openBackgroundDialog({ store }), deleteSelection, deleteOrTool, save: () => document.getElementById('btnSave').click(), selectAll, openSettings, zoomIn: () => zoom(1.25), zoomOut: () => zoom(1 / 1.25), fit: fitView, itemActions }));
setTool('select'); view.fit(); minimap.fit(500);
if (import.meta.env.DEV) window.__app = { store, ui, view, view3d }; // 브라우저 검증용, 개발 빌드에서만
