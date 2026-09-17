import { createStore } from './state/store.js';
import { createUiState } from './state/uistate.js';
import { createEmptyProject, activeFloor } from './state/schema.js';
import { deleteWall, deleteRoom, transformFloor } from './state/floorOps.js';
import { hitWall } from './geom/walls.js';
import { createView2D } from './view2d/view2d.js';
import { createRoomTool } from './view2d/tools/roomTool.js';
import { createWallTool } from './view2d/tools/wallTool.js';
import { createSelectTool } from './view2d/tools/selectTool.js';
import { createView3D } from './view3d/view3d.js';
import { createShell } from './ui/shell.js';
import { createKeyHandler } from './ui/keymap.js';
import { createPropsPanel } from './ui/propsPanel.js';
import { openBackgroundDialog } from './ui/backgroundDialog.js';
import { serializeProject, parseProject, downloadText, readTextFile, startAutosave, loadAutosave, filenameFor, capture2D } from './io/file.js';

const store = createStore(createEmptyProject());
const ui = createUiState();
const shell = createShell(document.getElementById('app'), { store, ui });
const view = createView2D(shell.els.canvas2d, store, ui);
const minimap = createView2D(shell.els.minimap, store, ui, { readonly: true, labels: false });
const view3d = createView3D(shell.els.view3d, store, ui, { onExitFp: () => ui.set({ mode: 'iso' }) });
createPropsPanel(shell.els.props, store, ui);

function createDeleteTool() {
  return { name: 'delete', opts: {}, onPointerDown(p) { const w = hitWall(activeFloor(store.get()).walls, p, 6 / view.camera.scale); if (w) deleteWall(store, w.id); }, onPointerMove() {}, onPointerUp() {}, onKey: () => false, draw() {}, cancel() {} };
}
const tools = {
  select: () => createSelectTool({ store, ui, view }),
  room: () => createRoomTool({ store, onDone: () => setTool('select') }),
  wall: () => createWallTool({ store, onDone: () => setTool('select') }),
  delete: createDeleteTool,
};
function setTool(name) { const t = tools[name](); ui.set({ tool: name }); view.setTool(t); shell.setOptionBar(t); }
function setMode(mode, opts) {
  if (mode === 'fp') { if (view3d.getMode() === 'fp') view3d.setMode('iso'); ui.set({ fpPick: true, mode: '2d' }); return; }
  ui.set({ mode, fpPick: false });
  if (mode !== '2d') view3d.setMode(mode, opts);
  else { if (view3d.getMode() === 'fp') view3d.setMode('iso'); view.requestRender(); } // 2D로 갈 때 fp(포인터 락, 렌더 루프)를 끝낸다
}
const originalDown = shell.els.canvas2d;
originalDown.addEventListener('pointerdown', ev => { if (ui.get().fpPick && ev.button === 0) { const at = view.toWorld([ev.offsetX, ev.offsetY]); ui.set({ mode: 'fp', fpPick: false }); view3d.setMode('fp', { at }); ev.stopImmediatePropagation(); } }, true);

document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
document.querySelector('[data-action="background"]').addEventListener('click', () => openBackgroundDialog({ store }));
document.querySelector('[data-action="flipH"]').addEventListener('click', () => transformFloor(store, p => [-p[0], p[1]]));
document.querySelector('[data-action="flipV"]').addEventListener('click', () => transformFloor(store, p => [p[0], -p[1]]));
document.querySelector('[data-action="rotL"]').addEventListener('click', () => transformFloor(store, p => [p[1], -p[0]]));
document.querySelector('[data-action="rotR"]').addEventListener('click', () => transformFloor(store, p => [-p[1], p[0]]));
document.getElementById('btnUndo').addEventListener('click', () => store.undo());
document.getElementById('btnRedo').addEventListener('click', () => store.redo());
document.getElementById('btnFit').addEventListener('click', () => view.fit());
document.getElementById('projectName').addEventListener('change', ev => store.dispatch(d => { d.name = ev.target.value; }));

function deleteSelection() {
  const s = ui.get().selection;
  if (s?.type === 'wall') { deleteWall(store, s.id); ui.set({ selection: null }); }
  if (s?.type === 'room' && window.confirm('방과 그 벽을 모두 삭제할까요?')) { deleteRoom(store, s.id); ui.set({ selection: null }); }
}
const restored = loadAutosave();
if (restored && window.confirm('자동 저장된 프로젝트가 있습니다. 불러올까요?')) store.replace(restored);
const auto = startAutosave(store, { onSaved: t => { document.getElementById('savedAt').textContent = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')} 자동 저장됨`; } });
document.getElementById('btnSave').addEventListener('click', () => { downloadText(filenameFor(store.get()), serializeProject(store.get())); auto.saveNow(); shell.toast('저장했습니다'); });
document.getElementById('btnLoad').addEventListener('click', () => {
  const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
  i.onchange = async () => {
    if (!i.files[0]) return;
    try { store.replace(parseProject(await readTextFile(i.files[0]))); view.fit(); shell.toast('불러왔습니다'); }
    catch (e) { shell.toast(e.message); }
  };
  i.click();
});
document.getElementById('btnCapture').addEventListener('click', async () => {
  const url = ui.get().mode === '2d' ? await capture2D(store, ui) : view3d.capture();
  const a = document.createElement('a'); a.href = url; a.download = filenameFor(store.get()).replace('.json', '.png'); a.click();
});

const canvasWrap = document.getElementById('canvasWrap');
canvasWrap.addEventListener('dragover', ev => ev.preventDefault());
canvasWrap.addEventListener('drop', async ev => {
  ev.preventDefault();
  const file = ev.dataTransfer.files[0];
  if (!file) return;
  if (file.type === 'application/json' || /\.json$/i.test(file.name)) {
    try { store.replace(parseProject(await readTextFile(file))); view.fit(); shell.toast('불러왔습니다'); }
    catch (e) { shell.toast(e.message); }
  } else if (/^image\//.test(file.type)) {
    openBackgroundDialog({ store });
  }
});

window.addEventListener('keydown', createKeyHandler({ store, ui, view, setTool, setMode, openBackground: () => openBackgroundDialog({ store }), deleteSelection, save: () => document.getElementById('btnSave').click() }));
setTool('select'); view.fit(); minimap.fit(500);
window.__app = { store, ui, view, view3d };
