import { activeFloor } from '../state/schema.js';
import { wallPolygon, endpoints, wallLength } from '../geom/walls.js';
import { roomInnerPolygon, centroid } from '../geom/rooms.js';
import { fmtLen, fmtArea } from '../util/units.js';
import { dist } from '../geom/vec.js';

const COLORS = { wall: '#3a4351', wallSel: '#14b8c4', room: '#e2c9a4', roomSel: '#d3b58a', grid: '#d9dee5', grid2: '#eceff3', text: '#5b6775', guide: '#e8b100', dim: '#1b2430' };

export function createView2D(canvas, store, ui, { readonly = false, labels = true, overlay = null, onPick = null, menu = null, onCameraChange = null } = {}) {
  const ctx = canvas.getContext('2d');
  const camera = { cx: 4000, cy: 3000, scale: 0.08 };
  let tool = null, dirty = true, raf = 0, panning = null, dpr = 1, picking = false;
  const bgCache = { src: null, img: null };
  // 카메라가 움직였음을 알리는 훅(2D 패닝·줌은 스토어를 건드리지 않으므로 미니맵이 알 방법이 이것뿐이다).
  const cameraMoved = () => { onCameraChange?.(); };

  const size = () => [canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height];
  const toScreen = p => { const [w, h] = size(); return [(p[0] - camera.cx) * camera.scale + w / 2, (p[1] - camera.cy) * camera.scale + h / 2]; };
  const toWorld = s => { const [w, h] = size(); return [(s[0] - w / 2) / camera.scale + camera.cx, (s[1] - h / 2) / camera.scale + camera.cy]; };

  function bounds() {
    const f = activeFloor(store.get());
    const pts = endpoints(f.walls);
    const bg = store.get().background;
    if (bg) pts.push(bg.offset, [bg.offset[0] + bg.width * bg.scale, bg.offset[1] + bg.height * bg.scale]);
    if (!pts.length) return [[-5000, -4000], [5000, 4000]];
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
  }
  function fit(padding = 1000) {
    const [[x0, y0], [x1, y1]] = bounds(); const [w, h] = size();
    camera.cx = (x0 + x1) / 2; camera.cy = (y0 + y1) / 2;
    camera.scale = Math.min(w / (x1 - x0 + padding * 2), h / (y1 - y0 + padding * 2));
    requestRender(); cameraMoved();
  }
  function zoomAt(s, factor) {
    const before = toWorld(s);
    camera.scale = Math.max(0.005, Math.min(2, camera.scale * factor));
    const after = toWorld(s);
    camera.cx += before[0] - after[0]; camera.cy += before[1] - after[1];
    requestRender(); cameraMoved();
  }
  const centerOn = p => { camera.cx = p[0]; camera.cy = p[1]; requestRender(); cameraMoved(); };
  const zoomBy = factor => { const [w, h] = size(); zoomAt([w / 2, h / 2], factor); }; // zoomAt이 이미 알린다
  const viewportRect = () => { const [w, h] = size(); return [toWorld([0, 0]), toWorld([w, h])]; };
  function requestRender() { dirty = true; if (!raf) raf = requestAnimationFrame(render); }

  function drawGrid() {
    const [w, h] = size(); const [x0, y0] = toWorld([0, 0]); const [x1, y1] = toWorld([w, h]);
    for (const [step, color] of [[200, COLORS.grid2], [1000, COLORS.grid]]) {
      if (step === 200 && step * camera.scale < 6) continue; // 보조 격자만 숨긴다
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const sx = Math.round(toScreen([x, 0])[0]) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, h); }
      for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { const sy = Math.round(toScreen([0, y])[1]) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(w, sy); }
      ctx.stroke();
    }
  }
  function poly(pts, fill, stroke, lw = 1) {
    ctx.beginPath(); pts.forEach((p, i) => { const s = toScreen(p); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function label(text, p, { size = 12, color = COLORS.text, bg = null } = {}) {
    const s = toScreen(p); ctx.font = `${size}px "IBM Plex Sans KR", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (bg) { const w = ctx.measureText(text).width + 8; ctx.fillStyle = bg; ctx.fillRect(s[0] - w / 2, s[1] - size / 2 - 3, w, size + 6); }
    ctx.fillStyle = color; ctx.fillText(text, s[0], s[1]);
  }
  function drawBackground(state) {
    const bg = state.background; if (!bg || !bg.visible || !state.view.v2.background) return;
    if (bgCache.src !== bg.src) { bgCache.src = bg.src; bgCache.img = new Image(); bgCache.img.onload = requestRender; bgCache.img.src = bg.src; }
    if (!bgCache.img?.complete) return;
    const s = toScreen(bg.offset); ctx.globalAlpha = bg.opacity;
    ctx.drawImage(bgCache.img, s[0], s[1], bg.width * bg.scale * camera.scale, bg.height * bg.scale * camera.scale);
    ctx.globalAlpha = 1;
  }
  function render() {
    raf = 0; if (!dirty) return; dirty = false;
    dpr = window.devicePixelRatio || 1; const [w, h] = size();
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const state = store.get(), f = activeFloor(state), sel = ui.get().selection;
    ctx.fillStyle = state.settings?.background ?? '#f3f4f6'; ctx.fillRect(0, 0, w, h);
    const solo = ui.get().soloRoom ?? null;
    const soloRoom = solo ? f.rooms.find(r => r.id === solo) : null;
    const soloWalls = soloRoom ? new Set(soloRoom.wallIds) : null;
    const units = state.units ?? 'mm', pyeong = !!state.settings?.pyeong, showUnit = !!state.settings?.showUnit;
    const v2 = state.view.v2;
    drawBackground(state);
    if (v2.grid && !readonly) drawGrid();
    // 배경 도면이 보일 때는 바닥을 반투명하게 그려서 도면을 따라 그릴 수 있게 한다.
    const tracing = !!(state.background && state.background.visible && v2.background);
    for (const r of f.rooms) {
      ctx.globalAlpha = (tracing ? 0.35 : 1) * (soloRoom && r.id !== solo ? 0.25 : 1);
      poly(roomInnerPolygon(r, f.walls), sel?.type === 'room' && sel.id === r.id ? COLORS.roomSel : COLORS.room, null);
      ctx.globalAlpha = 1;
      if (labels) {
        const c = centroid(r.points);
        if (v2.roomArea) label(fmtArea(r.area, { pyeong }), c);
        if (v2.roomName && r.name) label(r.name, [c[0], c[1] + 250], { size: 13, color: COLORS.dim }); // 면적 라벨 아래
      }
    }
    if (!readonly && v2.guides) for (const g of f.guides) { ctx.strokeStyle = COLORS.guide; ctx.setLineDash([8, 6]); ctx.beginPath(); if (g.type === 'v') { const x = Math.round(toScreen([g.pos, 0])[0]) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, h); } else { const y = Math.round(toScreen([0, g.pos])[1]) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y); } ctx.stroke(); ctx.setLineDash([]); }
    for (const wl of f.walls) {
      ctx.globalAlpha = soloWalls && !soloWalls.has(wl.id) ? 0.25 : 1;
      poly(wallPolygon(wl, f.walls), sel?.type === 'wall' && sel.id === wl.id ? COLORS.wallSel : COLORS.wall, null);
    }
    ctx.globalAlpha = 1;
    if (sel?.type === 'wall' && !readonly) { const wl = f.walls.find(x => x.id === sel.id); if (wl) for (const p of [wl.a, wl.b]) { const s = toScreen(p); ctx.beginPath(); ctx.arc(s[0], s[1], 6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = COLORS.wallSel; ctx.lineWidth = 2; ctx.stroke(); } }
    // 벽마다 치수 라벨을 그리되, 화면에서 40px보다 짧은 벽은 건너뛴다(LOD: 라벨이 겹쳐 뭉치는 것을 막는다).
    if (v2.dims && labels) for (const wl of f.walls) {
      const len = wallLength(wl);
      if (len * camera.scale < 40) continue;
      label(fmtLen(len, units, { unit: showUnit }), [(wl.a[0] + wl.b[0]) / 2, (wl.a[1] + wl.b[1]) / 2], { size: 11 });
    }
    if (v2.measures) for (const m of f.measures) {
      const s0 = toScreen(m.a), s1 = toScreen(m.b);
      ctx.strokeStyle = COLORS.guide; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke(); ctx.lineWidth = 1;
      if (labels) label(fmtLen(dist(m.a, m.b), units, { unit: showUnit }), [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2], { bg: '#fff', color: COLORS.dim });
    }
    if (tool && !readonly) tool.draw(ctx, api);
    if (overlay) overlay(ctx, api);
  }

  // 입력
  const pos = ev => { const r = canvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
  let pressed = false; // pointerdown 이후 onUp이 한 번만 실행되도록(pointerup 뒤에 lostpointercapture가 또 온다)
  const onDown = ev => {
    if (readonly) { if (onPick && ev.button === 0) { picking = true; canvas.setPointerCapture?.(ev.pointerId); onPick(toWorld(pos(ev))); } return; }
    if (ev.button === 2 && tool?.onContextMenu) return; // 우클릭 메뉴가 있는 도구에서는 오른쪽 버튼이 패닝을 시작하지 않는다
    pressed = true;
    canvas.setPointerCapture?.(ev.pointerId); // 캔버스 밖에서 놓아도 pointerup/pointercancel을 받는다
    if (ev.button === 1 || ev.button === 2 || (ev.button === 0 && !tool)) { panning = { s: pos(ev), cx: camera.cx, cy: camera.cy }; return; }
    if (ev.button === 0 && tool) tool.onPointerDown(toWorld(pos(ev)), ev);
    requestRender();
  };
  const onMove = ev => {
    if (readonly) { if (picking && onPick) onPick(toWorld(pos(ev))); return; }
    const s = pos(ev);
    if (panning) { camera.cx = panning.cx - (s[0] - panning.s[0]) / camera.scale; camera.cy = panning.cy - (s[1] - panning.s[1]) / camera.scale; requestRender(); cameraMoved(); return; }
    if (tool) { tool.onPointerMove(toWorld(s), ev); requestRender(); }
  };
  const onUp = ev => {
    if (readonly) { if (picking) { picking = false; if (canvas.hasPointerCapture?.(ev.pointerId)) canvas.releasePointerCapture?.(ev.pointerId); } return; }
    if (!pressed) return;
    pressed = false;
    if (canvas.hasPointerCapture?.(ev.pointerId)) canvas.releasePointerCapture?.(ev.pointerId);
    if (panning) { panning = null; return; }
    if (tool) { tool.onPointerUp(toWorld(pos(ev)), ev); requestRender(); }
  };
  const onWheel = ev => { ev.preventDefault(); if (readonly) return; zoomAt(pos(ev), ev.deltaY < 0 ? 1.15 : 1 / 1.15); };
  const onMenu = ev => {
    ev.preventDefault();
    if (readonly || !tool?.onContextMenu) return;
    const items = tool.onContextMenu(toWorld(pos(ev)), ev);
    if (menu && Array.isArray(items) && items.length) menu.open(ev.clientX, ev.clientY, items);
    requestRender();
  };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false }); canvas.addEventListener('contextmenu', onMenu);
  const unsubs = [store.subscribe(() => { if (readonly) fit(500); else requestRender(); }), ui.subscribe(requestRender)];
  const onResize = () => requestRender(); window.addEventListener('resize', onResize);

  const api = { camera, toScreen, toWorld, fit, zoomAt, zoomBy, centerOn, viewportRect, requestRender, label, poly, COLORS, fmtLen, fmtArea,
    get units() { return store.get().units ?? 'mm'; },
    get showUnit() { return !!store.get().settings?.showUnit; },
    get tool() { return tool; },
    setTool(t) { tool?.cancel?.(); tool = t; requestRender(); },
    destroy() { unsubs.forEach(u => u()); if (raf) { cancelAnimationFrame(raf); raf = 0; } if (bgCache.img) bgCache.img.onload = null; window.removeEventListener('resize', onResize); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.removeEventListener(type, onUp); canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('contextmenu', onMenu); } };
  requestRender();
  return api;
}
