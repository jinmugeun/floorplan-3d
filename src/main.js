import { createStore } from './state/store.js';
import { createUiState } from './state/uistate.js';
import { createEmptyProject } from './state/schema.js';
import { addWalls } from './state/floorOps.js';
import { rectWalls } from './geom/walls.js';
import { createView2D } from './view2d/view2d.js';

const store = createStore(createEmptyProject());
const ui = createUiState();
const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;';
document.getElementById('app').replaceChildren(canvas);
addWalls(store, rectWalls([0, 0], [7892, 5464], 200));
const view = createView2D(canvas, store, ui);
view.fit();
window.__app = { store, ui, view };
