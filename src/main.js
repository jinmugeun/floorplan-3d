import { createStore } from './state/store.js';
import { createUiState } from './state/uistate.js';
import { createEmptyProject, activeFloor } from './state/schema.js';
import { deleteWall, deleteRoom, transformFloor, selectionStillValid } from './state/floorOps.js';
import { hitWall } from './geom/walls.js';
import { pointInPolygon } from './geom/rooms.js';
import { createView2D } from './view2d/view2d.js';
import { createRoomTool, ROOM_TOOL_DEFAULTS } from './view2d/tools/roomTool.js';
import { createWallTool, WALL_TOOL_DEFAULTS } from './view2d/tools/wallTool.js';
import { createSelectTool } from './view2d/tools/selectTool.js';
import { createGuideTool, GUIDE_TOOL_DEFAULTS } from './view2d/tools/guideTool.js';
import { createMeasureTool, MEASURE_TOOL_DEFAULTS } from './view2d/tools/measureTool.js';
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
createPropsPanel(shell.els.props, store, ui, { deleteSelection });
// undo/redo/방 재검출로 선택한 객체가 사라지면 선택을 비운다
store.subscribe(s => { if (!selectionStillValid(s, ui.get().selection)) ui.set({ selection: null }); });

function createDeleteTool() {
  return {
    name: 'delete', opts: {}, hint: '삭제할 벽을 클릭하세요. 방을 지우려면 바닥을 클릭해 선택한 뒤 Delete 키를 누르세요.',
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
const tools = {
  select: () => createSelectTool({ store, ui, view }),
  room: () => createRoomTool({ store, opts: toolOpts.room, onDone: () => setTool('select') }),
  wall: () => createWallTool({ store, opts: toolOpts.wall, onDone: () => setTool('select') }),
  delete: createDeleteTool,
  guide: () => createGuideTool({ store, view, opts: toolOpts.guide }),
  measure: () => createMeasureTool({ store, opts: toolOpts.measure }),
};
function setTool(name) { const t = tools[name](); ui.set({ tool: name }); view.setTool(t); shell.setOptionBar(t); }
function setMode(mode, opts) {
  if (mode === 'fp') { if (view3d.getMode() === 'fp') view3d.setMode('iso'); ui.set({ fpPick: true, mode: '2d' }); return; }
  ui.set({ mode, fpPick: false });
  if (mode !== '2d') view3d.setMode(mode, opts);
  else { if (view3d.getMode() === 'fp') view3d.setMode('iso'); view.requestRender(); } // 2D로 갈 때 fp(포인터 락, 렌더 루프)를 끝낸다
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
document.getElementById('btnFit').addEventListener('click', () => view.fit());
document.getElementById('projectName').addEventListener('change', ev => store.dispatch(d => { d.name = ev.target.value; }));

function deleteSelection() {
  const s = ui.get().selection;
  if (s?.type === 'wall') { deleteWall(store, s.id); ui.set({ selection: null }); }
  if (s?.type === 'room' && window.confirm('방과 그 벽을 모두 삭제할까요?')) { deleteRoom(store, s.id); ui.set({ selection: null }); }
}
function deleteOrTool() { if (ui.get().selection) deleteSelection(); else setTool('delete'); }
const restored = loadAutosave();
if (restored && window.confirm('자동 저장된 프로젝트가 있습니다. 불러올까요?')) store.replace(restored, { record: false }); // 복원은 되돌릴 단계가 아니다
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
document.getElementById('btnCapture').addEventListener('click', async () => {
  try { const url = ui.get().mode === '2d' ? await capture2D(store, ui) : view3d.capture(); const a = document.createElement('a'); a.href = url; a.download = filenameFor(store.get()).replace('.json', '.png'); a.click(); }
  catch (e) { shell.toast(e.message); }
});

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

window.addEventListener('keydown', createKeyHandler({ store, ui, view, setTool, setMode, openBackground: () => openBackgroundDialog({ store }), deleteSelection, deleteOrTool, save: () => document.getElementById('btnSave').click() }));
setTool('select'); view.fit(); minimap.fit(500);
if (import.meta.env.DEV) window.__app = { store, ui, view, view3d }; // 브라우저 검증용, 개발 빌드에서만
