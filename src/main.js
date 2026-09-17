import { createStore } from './state/store.js';
import { createUiState } from './state/uistate.js';
import { createEmptyProject } from './state/schema.js';
import { addWalls, deleteWall, deleteRoom } from './state/floorOps.js';
import { rectWalls } from './geom/walls.js';
import { createView2D } from './view2d/view2d.js';
import { createRoomTool } from './view2d/tools/roomTool.js';
import { createWallTool } from './view2d/tools/wallTool.js';
import { createSelectTool } from './view2d/tools/selectTool.js';
import { createPropsPanel } from './ui/propsPanel.js';
import { openBackgroundDialog } from './ui/backgroundDialog.js';
import { createView3D } from './view3d/view3d.js';

const store = createStore(createEmptyProject());
const ui = createUiState();
const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
const c3d = document.createElement('div');
c3d.id = 'c3d';
c3d.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
const app = document.getElementById('app');
app.style.position = 'relative';
app.replaceChildren(canvas, c3d);
addWalls(store, rectWalls([0, 0], [7892, 5464], 200));
const view = createView2D(canvas, store, ui);
view.fit();
const view3d = createView3D(c3d, store, ui);
function syncMode() { const is2d = ui.get().mode === '2d'; canvas.hidden = !is2d; c3d.hidden = is2d; }
ui.subscribe(syncMode);
syncMode();
const props = document.createElement('div');
props.id = 'props';
props.style.cssText = 'position:fixed;right:0;top:0;width:300px;height:100%;background:#fff;padding:16px;overflow:auto;';
document.body.appendChild(props);
createPropsPanel(props, store, ui);
window.__app = { store, ui, view, view3d };
const tools = { room: () => createRoomTool({ store, onDone: () => setTool('select') }), wall: () => createWallTool({ store, onDone: () => setTool('select') }), select: () => createSelectTool({ store, ui, view }) };
function setTool(name) { ui.set({ tool: name }); view.setTool(tools[name] ? tools[name]() : null); }
setTool('select');
window.addEventListener('keydown', ev => {
  if (ev.target.tagName === 'INPUT') return;
  if (view.tool?.onKey?.(ev)) { view.requestRender(); return; }
  if (ev.key === 'f' || ev.key === 'F') setTool('room');
  if (ev.key === 'l' || ev.key === 'L') setTool('wall');
  if (ev.key === 'Escape') setTool('select');
  if (ev.key === 'b' || ev.key === 'B') openBackgroundDialog({ store });
  if (ev.key === '1') ui.set({ mode: '2d' });
  if (ev.key === '2') { ui.set({ mode: 'plan' }); view3d.setMode('plan'); }
  if (ev.key === '3') { ui.set({ mode: 'iso' }); view3d.setMode('iso'); }
  if (ev.key === 'Delete' || ev.key === 'Backspace') {
    const sel = ui.get().selection;
    if (sel?.type === 'wall') { deleteWall(store, sel.id); ui.set({ selection: null }); }
    else if (sel?.type === 'room' && window.confirm('방과 그 벽을 모두 삭제할까요?')) { deleteRoom(store, sel.id); ui.set({ selection: null }); }
  }
});
