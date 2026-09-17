import { activeFloor } from '../state/schema.js';
import { wallPolygon, endpoints } from '../geom/walls.js';
import { roomInnerPolygon, centroid } from '../geom/rooms.js';

const COLORS = { wall: '#3a4351', wallSel: '#14b8c4', room: '#e2c9a4', roomSel: '#d3b58a', grid: '#d9dee5', grid2: '#eceff3', text: '#5b6775', guide: '#e8b100', dim: '#1b2430' };

export function createView2D(canvas, store, ui, { readonly = false } = {}) {
  const ctx = canvas.getContext('2d');
  const camera = { cx: 4000, cy: 3000, scale: 0.08 };
  let tool = null, dirty = true, raf = 0, panning = null, dpr = 1;
  const bgCache = { src: null, img: null };

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
    requestRender();
  }
  function zoomAt(s, factor) {
    const before = toWorld(s);
    camera.scale = Math.max(0.005, Math.min(2, camera.scale * factor));
    const after = toWorld(s);
    camera.cx += before[0] - after[0]; camera.cy += before[1] - after[1];
    requestRender();
  }
  function requestRender() { dirty = true; if (!raf) raf = requestAnimationFrame(render); }

  function drawGrid() {
    const [w, h] = size(); const [x0, y0] = toWorld([0, 0]); const [x1, y1] = toWorld([w, h]);
    for (const [step, color] of [[200, COLORS.grid2], [1000, COLORS.grid]]) {
      if (step * camera.scale < 6) continue;
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
    const bg = state.background; if (!bg || !state.view.background) return;
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
    drawBackground(state);
    if (state.view.grid && !readonly) drawGrid();
    for (const r of f.rooms) {
      poly(roomInnerPolygon(r, f.walls), sel?.type === 'room' && sel.id === r.id ? COLORS.roomSel : COLORS.room, null);
      if (state.view.labels && !readonly) { const c = centroid(r.points); if (r.name) label(r.name, [c[0], c[1] - 250], { size: 13, color: COLORS.dim }); label(`${r.area.toFixed(1)}m²`, c); }
    }
    for (const wl of f.walls) poly(wallPolygon(wl, f.walls), sel?.type === 'wall' && sel.id === wl.id ? COLORS.wallSel : COLORS.wall, null);
    if (sel?.type === 'wall' && !readonly) { const wl = f.walls.find(x => x.id === sel.id); if (wl) for (const p of [wl.a, wl.b]) { const s = toScreen(p); ctx.beginPath(); ctx.arc(s[0], s[1], 6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = COLORS.wallSel; ctx.lineWidth = 2; ctx.stroke(); } }
    if (tool && !readonly) tool.draw(ctx, api);
  }

  // 입력
  const pos = ev => { const r = canvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
  const onDown = ev => {
    if (readonly) return;
    if (ev.button === 1 || ev.button === 2 || (ev.button === 0 && !tool)) { panning = { s: pos(ev), cx: camera.cx, cy: camera.cy }; return; }
    if (ev.button === 0 && tool) tool.onPointerDown(toWorld(pos(ev)), ev);
    requestRender();
  };
  const onMove = ev => {
    if (readonly) return;
    const s = pos(ev);
    if (panning) { camera.cx = panning.cx - (s[0] - panning.s[0]) / camera.scale; camera.cy = panning.cy - (s[1] - panning.s[1]) / camera.scale; requestRender(); return; }
    if (tool) { tool.onPointerMove(toWorld(s), ev); requestRender(); }
  };
  const onUp = ev => { if (panning) { panning = null; return; } if (tool) { tool.onPointerUp(toWorld(pos(ev)), ev); requestRender(); } };
  const onWheel = ev => { ev.preventDefault(); zoomAt(pos(ev), ev.deltaY < 0 ? 1.15 : 1 / 1.15); };
  const onMenu = ev => ev.preventDefault();
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('wheel', onWheel, { passive: false }); canvas.addEventListener('contextmenu', onMenu);
  const unsubs = [store.subscribe(() => { if (readonly) fit(500); else requestRender(); }), ui.subscribe(requestRender)];
  const onResize = () => requestRender(); window.addEventListener('resize', onResize);

  const api = { camera, toScreen, toWorld, fit, zoomAt, requestRender, label, poly, COLORS,
    get tool() { return tool; },
    setTool(t) { tool?.cancel?.(); tool = t; requestRender(); },
    destroy() { unsubs.forEach(u => u()); window.removeEventListener('resize', onResize); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('contextmenu', onMenu); } };
  requestRender();
  return api;
}
