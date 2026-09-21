// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { createView2D, drawEmptyGuide, EMPTY_GUIDE_LINES } from '../src/view2d/view2d.js';
import { LABEL_BG } from '../src/view2d/labels2d.js';

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = 800; c.height = 600;
  Object.defineProperty(c, 'clientWidth', { value: 800 });
  Object.defineProperty(c, 'clientHeight', { value: 600 });
  // measureText만 진짜 캔버스처럼 TextMetrics를 돌려준다: 배경 상자가 있는 라벨(치수·덕트 — §14.5)이
  // 폭을 재기 때문이다. 나머지는 아무것도 하지 않는 함수다.
  c.getContext = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}) });
  return c;
}

test('toScreen/toWorld round trip and fit', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const v = createView2D(makeCanvas(), store, createUiState());
  v.fit(0);
  const c = v.toScreen([2000, 1500]);
  expect(c[0]).toBeCloseTo(400); expect(c[1]).toBeCloseTo(300);
  const w = v.toWorld(c);
  expect(w[0]).toBeCloseTo(2000); expect(w[1]).toBeCloseTo(1500);
});

test('zoomAt keeps the point under the cursor fixed', () => {
  const store = createStore(createEmptyProject());
  const v = createView2D(makeCanvas(), store, createUiState());
  const before = v.toWorld([100, 100]);
  v.zoomAt([100, 100], 2);
  const after = v.toWorld([100, 100]);
  expect(after[0]).toBeCloseTo(before[0]); expect(after[1]).toBeCloseTo(before[1]);
});

test('pointer events are delegated to the tool in world coords', () => {
  const store = createStore(createEmptyProject());
  const canvas = makeCanvas();
  const v = createView2D(canvas, store, createUiState());
  const tool = { name: 't', opts: {}, onPointerDown: vi.fn(), onPointerMove: vi.fn(), onPointerUp: vi.fn(), onKey: () => false, draw() {}, cancel() {} };
  v.setTool(tool);
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, clientY: 300, button: 0, bubbles: true }));
  expect(tool.onPointerDown).toHaveBeenCalled();
  const [pt] = tool.onPointerDown.mock.calls[0];
  expect(pt[0]).toBeCloseTo(v.camera.cx); expect(pt[1]).toBeCloseTo(v.camera.cy);
});

test('readonly view ignores wheel and pointer input, and destroy stops store updates', () => {
  const store = createStore(createEmptyProject());
  const canvas = makeCanvas();
  const v = createView2D(canvas, store, createUiState(), { readonly: true });
  const before = { ...v.camera };
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 100, clientY: 100, bubbles: true, cancelable: true }));
  canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 100, button: 0, bubbles: true }));
  canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 300, bubbles: true }));
  expect(v.camera).toEqual(before);
  v.destroy();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200)); // readonly 뷰가 살아 있었다면 fit()으로 카메라가 바뀐다
  expect(v.camera).toEqual(before);
});

test('room fills become translucent while a background image is showing', async () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const alphas = [];
  const c = makeCanvas();
  c.getContext = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : () => {}), set: (t, k, v) => { if (k === 'globalAlpha') alphas.push(v); t[k] = v; return true; } });
  const v = createView2D(c, store, createUiState());
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  await frame(); await frame();
  expect(alphas.length).toBeGreaterThan(0);
  expect(alphas.every(a => a === 1)).toBe(true); // 배경이 없으면 바닥은 불투명
  alphas.length = 0;
  store.dispatch(d => { d.background = { src: 'data:,', width: 10, height: 10, scale: 1, offset: [0, 0], opacity: 0.5, visible: true, locked: true }; });
  await frame(); await frame();
  expect(alphas).toContain(0.35); // 배경이 보이면 바닥은 35%
  v.destroy();
});

test('pointercancel ends the drag like pointerup', () => {
  const store = createStore(createEmptyProject());
  const canvas = makeCanvas();
  const v = createView2D(canvas, store, createUiState());
  const tool = { name: 't', opts: {}, onPointerDown: vi.fn(), onPointerMove: vi.fn(), onPointerUp: vi.fn(), onKey: () => false, draw() {}, cancel() {} };
  v.setTool(tool);
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, clientY: 300, button: 0, bubbles: true }));
  canvas.dispatchEvent(new MouseEvent('pointercancel', { clientX: 400, clientY: 300, bubbles: true })); // 캔버스 밖에서 놓거나 브라우저가 포인터를 가져간 경우
  expect(tool.onPointerUp).toHaveBeenCalledTimes(1);
  v.destroy();
  canvas.dispatchEvent(new MouseEvent('pointercancel', { clientX: 400, clientY: 300, bubbles: true }));
  expect(tool.onPointerUp).toHaveBeenCalledTimes(1); // destroy 후에는 듣지 않는다
});

test('v2 flags decide what the 2D canvas draws', async () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  store.dispatch(d => { activeFloor(d).rooms[0].name = '가열조리실'; activeFloor(d).measures.push({ id: 'm1', a: [0, 0], b: [4000.5, 0] }); }, { record: false });
  const texts = [];
  const c = makeCanvas();
  c.getContext = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'fillText' ? (s => texts.push(s)) : (k in t ? t[k] : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
  const v = createView2D(c, store, createUiState());
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  await frame(); await frame();
  expect(texts).toContain('가열조리실');
  expect(texts.some(s => s.includes('m²'))).toBe(true);
  expect(texts).toContain('4001'); // 측정선 라벨(소수 길이 반올림)
  texts.length = 0;
  store.dispatch(d => { d.view.v2.roomName = false; d.view.v2.roomArea = false; d.view.v2.measures = false; d.view.v2.dims = false; }, { record: false });
  await frame(); await frame();
  expect(texts).toEqual([]);
  v.destroy();
});

// §14.5: 우선순위가 낮은 라벨(벽 치수·덕트 단면)의 배경 상자가 방 이름 위에 오면 우선순위가
// 무의미해진다. 라벨 패스는 placedLabels를 역순으로 그려 높은 우선순위를 맨 위에 남긴다.
test('낮은 우선순위의 배경 상자가 방 이름보다 먼저 그려진다(위를 덮지 않는다)', async () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  store.dispatch(d => { activeFloor(d).rooms[0].name = '식기구세척실'; }, { record: false });
  const ops = [];
  const c = makeCanvas();
  c.getContext = () => new Proxy({}, {
    get: (t, k) => (k === 'measureText' ? () => ({ width: 10 })
      : k === 'fillText' ? (str => ops.push(`text:${str}`))
      : k === 'fillRect' ? (() => ops.push(`rect:${t.fillStyle}`))
      : (k in t ? t[k] : () => {})),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const v = createView2D(c, store, createUiState());
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  await frame(); await frame();
  const name = ops.indexOf('text:식기구세척실');
  const lastBox = ops.lastIndexOf(`rect:${LABEL_BG}`);   // 벽 치수 라벨의 반투명 상자
  expect(name).toBeGreaterThan(-1);
  expect(lastBox).toBeGreaterThan(-1);
  expect(lastBox).toBeLessThan(name);                    // 상자가 먼저 = 방 이름이 위에 남는다
  v.destroy();
});

test('zoomBy, centerOn and viewportRect work on the camera', () => {
  const store = createStore(createEmptyProject());
  const v = createView2D(makeCanvas(), store, createUiState());
  const before = v.camera.scale;
  v.zoomBy(2);
  expect(v.camera.scale).toBeCloseTo(before * 2, 9);
  v.centerOn([1234.5, -678.25]); // 소수 좌표
  expect(v.camera.cx).toBeCloseTo(1234.5, 9); expect(v.camera.cy).toBeCloseTo(-678.25, 9);
  const [[x0, y0], [x1, y1]] = v.viewportRect();
  expect(x1 - x0).toBeCloseTo(800 / v.camera.scale, 6);
  expect(y1 - y0).toBeCloseTo(600 / v.camera.scale, 6);
  expect((x0 + x1) / 2).toBeCloseTo(1234.5, 6);
});

test('a readonly view draws the overlay and reports picks in world coords', async () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const canvas = makeCanvas();
  const picks = []; let overlayCalls = 0;
  const v = createView2D(canvas, store, createUiState(), { readonly: true, overlay: () => { overlayCalls++; }, onPick: p => picks.push(p) });
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  await frame(); await frame();
  expect(overlayCalls).toBeGreaterThan(0);
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, clientY: 300, button: 0, bubbles: true }));
  canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 500, clientY: 300, bubbles: true }));
  canvas.dispatchEvent(new MouseEvent('pointerup', { clientX: 500, clientY: 300, bubbles: true }));
  expect(picks).toHaveLength(2);
  expect(picks[0][0]).toBeCloseTo(v.camera.cx, 6);
  canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 600, clientY: 300, bubbles: true }));
  expect(picks).toHaveLength(2); // 버튼을 놓은 뒤에는 따라오지 않는다
  v.destroy();
});

test('onCameraChange fires for zoom, centerOn, fit and panning', () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200)); // 소수 좌표
  const canvas = makeCanvas();
  let moves = 0;
  const v = createView2D(canvas, store, createUiState(), { onCameraChange: () => { moves++; } });
  v.zoomBy(2);
  expect(moves).toBe(1);
  v.centerOn([1234.5, -678.25]);
  expect(moves).toBe(2);
  v.fit();
  expect(moves).toBe(3);
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, clientY: 300, button: 1, bubbles: true })); // 가운데 버튼 = 패닝
  canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 460, clientY: 320, bubbles: true }));
  expect(moves).toBe(4);
  canvas.dispatchEvent(new MouseEvent('pointerup', { clientX: 460, clientY: 320, bubbles: true }));
  v.destroy();
});

test('right click asks the tool for items and opens the given menu', () => {
  const store = createStore(createEmptyProject());
  const canvas = makeCanvas();
  const opened = [];
  const menu = { open: (x, y, items) => opened.push({ x, y, items }), close() {}, isOpen: () => false };
  const v = createView2D(canvas, store, createUiState(), { menu });
  const items = [{ label: 'A', onSelect() {} }];
  v.setTool({ name: 't', opts: {}, onPointerDown() {}, onPointerMove() {}, onPointerUp() {}, onKey: () => false, draw() {}, cancel() {}, onContextMenu: () => items });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  canvas.dispatchEvent(new MouseEvent('contextmenu', { clientX: 120, clientY: 90, bubbles: true, cancelable: true }));
  expect(opened).toHaveLength(1);
  expect(opened[0].items).toBe(items);
  v.setTool({ name: 'u', opts: {}, onPointerDown() {}, onPointerMove() {}, onPointerUp() {}, onKey: () => false, draw() {}, cancel() {} });
  canvas.dispatchEvent(new MouseEvent('contextmenu', { clientX: 120, clientY: 90, bubbles: true, cancelable: true }));
  expect(opened).toHaveLength(1); // onContextMenu가 없는 도구는 메뉴를 열지 않는다
  v.destroy();
});

test('right click does not start panning when the tool has a context menu', () => {
  const store = createStore(createEmptyProject());
  const canvas = makeCanvas();
  const v = createView2D(canvas, store, createUiState(), { menu: { open() {}, close() {}, isOpen: () => false } });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  const base = { name: 't', opts: {}, onPointerDown() {}, onPointerMove() {}, onPointerUp() {}, onKey: () => false, draw() {}, cancel() {} };
  v.setTool({ ...base, onContextMenu: () => [{ label: 'A', onSelect() {} }] });
  const before = { ...v.camera };
  canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, clientY: 300, button: 2, bubbles: true }));
  canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 500, clientY: 360, bubbles: true }));
  expect(v.camera).toEqual(before); // 우클릭은 메뉴 전용
  canvas.dispatchEvent(new MouseEvent('pointerup', { clientX: 500, clientY: 360, bubbles: true }));
  v.setTool({ ...base }); // 우클릭 메뉴가 없는 도구는 예전처럼 패닝한다
  canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, clientY: 300, button: 2, bubbles: true }));
  canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 500, clientY: 360, bubbles: true }));
  expect(v.camera.cx).not.toBe(before.cx);
  v.destroy();
});

test('items are drawn after walls and follow the v2 toggles', async () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const { createItem } = await import('../src/state/schema.js');
  const { productById } = await import('../src/products/catalog.js');
  const { addItem } = await import('../src/state/floorOps.js');
  addItem(store, createItem(productById('sofa-3'), { pos: [2000, 1500] }));
  const calls = [];
  const c = document.createElement('canvas');
  Object.defineProperty(c, 'clientWidth', { value: 800 }); Object.defineProperty(c, 'clientHeight', { value: 600 });
  c.getContext = () => new Proxy({}, {
    get: (t, k) => (k === 'canvas' ? c : k === 'measureText' ? () => ({ width: 10 }) : (...args) => { calls.push([k, ...args]); }),
    set: () => true,
  });
  const v = createView2D(c, store, createUiState());
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  await frame(); await frame();
  const firstRotate = calls.findIndex(x => x[0] === 'rotate');
  const firstFill = calls.findIndex(x => x[0] === 'fill');
  expect(firstRotate).toBeGreaterThan(-1);
  expect(firstFill).toBeGreaterThan(-1);
  expect(firstFill).toBeLessThan(firstRotate); // 방·벽 채우기가 아이템보다 먼저다
  calls.length = 0;
  store.dispatch(d => { d.view.v2 = { ...(d.view.v2 ?? {}), floorItems: false }; }, { record: false });
  await frame(); await frame();
  expect(calls.some(x => x[0] === 'rotate')).toBe(false);
  v.destroy();
});

// 옵션 바 행이 생기고 사라지면 캔버스 높이가 바뀌지만 window의 resize는 오지 않는다(§12.1).
test('캔버스를 ResizeObserver로 관찰하고 destroy에서 끊는다', () => {
  const observed = []; let disconnects = 0;
  const prev = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; } observe(el) { observed.push({ el, cb: this.cb }); } disconnect() { disconnects += 1; } };
  try {
    const canvas = makeCanvas();
    const v = createView2D(canvas, createStore(createEmptyProject()), createUiState());
    const entry = observed.find(o => o.el === canvas);
    expect(entry).toBeTruthy();
    entry.cb([]);              // 콜백이 던지지 않는다(다시 그리기 요청만 한다)
    v.destroy();
    expect(disconnects).toBe(1);
  } finally { globalThis.ResizeObserver = prev; }
});

// 벽도 배경 도면도 없으면 캔버스 중앙에 옅은 안내를 그린다(§12.4).
test('drawEmptyGuide는 빈 도면 + 선택 도구일 때만 그린다', () => {
  const calls = [];
  const v = { viewportRect: () => [[0, 0], [8000.5, 6000.25]], camera: { scale: 0.08 }, COLORS: { text: '#5b6775' }, label: (t, p, o) => calls.push([t, p, o]) };
  const ctx = { save() {}, restore() {}, globalAlpha: 1 };
  expect(drawEmptyGuide(ctx, v, { walls: [] }, {}, { toolName: 'select' })).toBe(true);
  expect(calls).toHaveLength(EMPTY_GUIDE_LINES.length);
  expect(calls[0][0]).toBe(EMPTY_GUIDE_LINES[0]);
  // 명세가 정한 안내 문구는 그대로 찍힌다(위의 제목 줄은 덧붙인 것이다 — 두 줄 형태를 고정한다).
  expect(EMPTY_GUIDE_LINES).toHaveLength(2);
  expect(calls[1][0]).toBe('[F]로 방을 그리거나, 시작 화면에서 샘플을 열어 보세요');
  expect(calls[0][1][0]).toBeCloseTo(4000.25);              // 화면 중앙(소수 좌표)
  expect(calls[1][1][1]).toBeGreaterThan(calls[0][1][1]);   // 둘째 줄이 아래에 온다
  expect(drawEmptyGuide(ctx, v, { walls: [{ id: 'w1' }] }, {}, { toolName: 'select' })).toBe(false);
  expect(drawEmptyGuide(ctx, v, { walls: [] }, { background: { src: 'data:,' } }, { toolName: 'select' })).toBe(false);
  expect(drawEmptyGuide(ctx, v, { walls: [] }, {}, { toolName: 'wall' })).toBe(false);   // 도구가 켜지면 사라진다
  expect(drawEmptyGuide(ctx, v, null, null, {})).toBe(true);                             // 층이 없어도 던지지 않는다
  // 벽 없이 아이템만 놓인 도면(소수 좌표)에서는 안내가 아이템 위에 겹쳐 그려지므로 숨긴다.
  expect(drawEmptyGuide(ctx, v, { walls: [], items: [{ id: 'i1', pos: [12.5, 34.75] }] }, {}, { toolName: 'select' })).toBe(false);
  expect(drawEmptyGuide(ctx, v, { walls: [], items: [], ducts: [{ id: 'd1' }] }, {}, { toolName: 'select' })).toBe(false); // 덕트만 있어도 숨긴다
  expect(drawEmptyGuide(ctx, v, { walls: [], items: [], ducts: [] }, {}, { toolName: 'select' })).toBe(true); // 비어 있으면 다시 나타난다
});

// §13.5: "실시간 충돌 감지"를 끈 채로 아이템을 끌고 있는 동안에는 충돌 색이 나오지 않는다(view2d.js의 liveOff 분기).
// 드래그를 놓으면(=드래그 중이 아니면) collisionLive가 꺼져 있어도 원래 겹친 아이템의 표시는 그대로다.
test('collisionLive를 끄고 아이템을 끄는 동안에는 충돌 색이 숨고, 드래그가 끝나면 다시 보인다', async () => {
  const store = createStore(createEmptyProject());
  const { createItem } = await import('../src/state/schema.js');
  const { productById } = await import('../src/products/catalog.js');
  const { addItem } = await import('../src/state/floorOps.js');
  const sofa = productById('sofa-3'); // size [2100, 900, 800] — 50mm만 어긋나도 크게 겹친다
  addItem(store, createItem(sofa, { pos: [2000.5, 1500.25] })); // 소수 좌표
  addItem(store, createItem(sofa, { pos: [2050.75, 1500.25] }));
  const strokes = [];
  const c = makeCanvas();
  c.getContext = () => new Proxy({}, {
    get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : () => {}),
    set: (t, k, v) => { if (k === 'strokeStyle') strokes.push(v); t[k] = v; return true; },
  });
  const v = createView2D(c, store, createUiState());
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  const dragTool = kind => ({ name: 't', opts: {}, onPointerDown() {}, onPointerMove() {}, onPointerUp() {}, onKey: () => false, draw() {}, cancel() {}, getDrag: () => (kind ? { kind } : null) });

  // collisionLive 기본값(true)에서 아이템 드래그 중 — 충돌 색이 보인다
  v.setTool(dragTool('items'));
  await frame(); await frame();
  expect(strokes).toContain('#e5484d'); // ITEM_COLORS.locked

  // 실시간 충돌 감지를 끄고 여전히 드래그 중 — 충돌 색이 사라진다
  strokes.length = 0;
  store.dispatch(d => { d.view.v2.collisionLive = false; }, { record: false });
  v.setTool(dragTool('items'));
  await frame(); await frame();
  expect(strokes).not.toContain('#e5484d');

  // 드래그를 놓으면(kind 없음) collisionLive가 꺼져 있어도 v2.collision 표시는 영향받지 않는다
  strokes.length = 0;
  v.setTool(dragTool(null));
  await frame(); await frame();
  expect(strokes).toContain('#e5484d');

  v.destroy();
});

// §14.11: 캔버스가 드래그를 받는다(dragover에서 미리보기, drop에서 배치).
test('dragover·drop이 월드 좌표를 넘기고 기본 동작을 막는다', () => {
  const store = createStore(createEmptyProject());
  const canvas = makeCanvas();
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  // #canvasWrap(파일 드롭)과 그 안의 #c2d(제품 드롭)에 각각 리스너가 붙으므로 한 드롭이 두 경로를
  // 지난다: 캔버스 리스너는 stopPropagation을 부르지 않아야 한다(둘 다 자기 페이로드만 본다).
  const wrap = document.createElement('div'); document.body.appendChild(wrap); wrap.appendChild(canvas);
  const wrapDrops = [];
  wrap.addEventListener('drop', () => wrapDrops.push(1));
  const over = [], dropped = [];
  const v = createView2D(canvas, store, createUiState(), { onDragOver: p => over.push(p), onDrop: p => dropped.push(p) });
  v.fit(0);
  const fire = type => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    ev.clientX = 400; ev.clientY = 300; ev.dataTransfer = { dropEffect: '' };
    canvas.dispatchEvent(ev);
    return ev;
  };
  const a = fire('dragover');
  expect(a.defaultPrevented).toBe(true);                 // 막지 않으면 브라우저가 drop을 주지 않는다
  expect(a.dataTransfer.dropEffect).toBe('copy');
  expect(over).toHaveLength(1);
  const b = fire('drop');
  expect(b.defaultPrevented).toBe(true);
  expect(dropped[0][0]).toBeCloseTo(over[0][0], 6);
  expect(wrapDrops).toHaveLength(1);                     // 바깥 파일 드롭 경로까지 버블링된다
  v.destroy();
  wrap.remove();
  // onDrop을 주지 않으면 리스너를 달지 않는다(미니맵·캡처는 드래그를 받지 않는다).
  const bare = makeCanvas();
  bare.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  const plain = createView2D(bare, store, createUiState(), {});
  const c = new Event('dragover', { bubbles: true, cancelable: true });
  c.clientX = 10; c.clientY = 10; c.dataTransfer = { dropEffect: '' };
  bare.dispatchEvent(c);
  expect(c.defaultPrevented).toBe(false);
  plain.destroy();
});

// §14.11 보강: 드래그가 캔버스를 벗어나면 고스트를 지울 기회를 준다. 캔버스가 받는 취소 신호는
// dragleave뿐이다 — dragend는 드래그 소스(라이브러리 타일)에서만 일어나므로 캔버스에 리스너를
// 달아도 실제 브라우저에서는 한 번도 불리지 않는다([Esc] 취소 경로는 libraryPanel.test.js가 본다).
test('캔버스는 dragleave만 onDragLeave로 넘기고 destroy가 리스너를 뗀다', () => {
  const store = createStore(createEmptyProject());
  const canvas = makeCanvas();
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  let left = 0;
  const v = createView2D(canvas, store, createUiState(), { onDrop: () => {}, onDragLeave: () => { left += 1; } });
  canvas.dispatchEvent(new Event('dragleave', { bubbles: true }));
  expect(left).toBe(1);
  canvas.dispatchEvent(new Event('dragend', { bubbles: true }));
  expect(left).toBe(1);                                    // 캔버스의 dragend는 듣지 않는다(죽은 경로였다)
  v.destroy();
  canvas.dispatchEvent(new Event('dragleave', { bubbles: true }));
  expect(left).toBe(1);
});

// §14.7: 도구의 hint가 단계마다 바뀌므로, 렌더 중에 달라진 것을 알려 배너를 다시 그리게 한다.
test('tool.hint가 바뀐 프레임에 onHint를 한 번 부른다', async () => {
  const store = createStore(createEmptyProject());
  const hints = [];
  const v = createView2D(makeCanvas(), store, createUiState(), { onHint: h => hints.push(h) });
  let step = 1;
  v.setTool({ name: 't', opts: {}, get hint() { return `단계 ${step}`; }, onPointerDown() {}, onPointerMove() {}, onPointerUp() {}, onKey: () => false, draw() {}, cancel() {} });
  await new Promise(r => requestAnimationFrame(r));
  expect(hints).toEqual(['단계 1']);
  v.requestRender();
  await new Promise(r => requestAnimationFrame(r));
  expect(hints).toEqual(['단계 1']);          // 바뀌지 않으면 부르지 않는다
  step = 2;
  v.requestRender();
  await new Promise(r => requestAnimationFrame(r));
  expect(hints).toEqual(['단계 1', '단계 2']);
  v.destroy();
});
