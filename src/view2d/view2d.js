import { activeFloor } from '../state/schema.js';
import { endpoints } from '../geom/walls.js';
import { roomInnerPolygon, pointInPolygon } from '../geom/rooms.js';
import { fmtLen, fmtArea } from '../util/units.js';   // api로 도구·라벨에 넘긴다
import { drawItems, ITEM_DRAG_KINDS, previewFloor } from './items2d.js';
import { drawDucts } from './ducts2d.js';
import { memoCollisions, collidingFor } from '../geom/collide.js';
import { drawWalls } from './walls2d.js';
import { collectLabels, placeLabels, drawLabels } from './labels2d.js';

const COLORS = { wall: '#3a4351', wallSel: '#14b8c4', room: '#e2c9a4', roomSel: '#d3b58a', grid: '#d9dee5', grid2: '#eceff3', text: '#5b6775', guide: '#e8b100', dim: '#1b2430' };

// 키 표기는 전역 규칙(대괄호 + 실제 키 이름)을 따른다: §12.4의 인용문은 'F로'였지만 앱의 다른 모든
// 문구가 [F]·[Esc]·[Enter]이므로 여기만 다르게 두지 않는다(전역 표기 규칙이 인용문보다 우선한다).
export const EMPTY_GUIDE_LINES = [
  '아직 도면이 없습니다.',
  '[F]로 방을 그리거나, 시작 화면에서 샘플을 열어 보세요',
];
// 벽·배경·아이템·덕트가 하나도 없고 그리기 도구도 꺼져 있을 때만 캔버스 중앙에 옅은 안내를 그린다(§12.4).
// 아이템·덕트만 있는 도면(벽 없이 배치부터 한 경우)에서는 안내가 이미 놓인 것 위에 겹쳐 그려져
// 헷갈리므로 함께 걸러낸다. 그렸으면 true. 순수 그리기 함수라 테스트가 가짜 v·ctx로 직접 부를 수 있다.
export function drawEmptyGuide(ctx, v, floor, state, { toolName = null } = {}) {
  if ((floor?.walls?.length ?? 0) > 0 || state?.background) return false;
  if ((floor?.items?.length ?? 0) > 0 || (floor?.ducts?.length ?? 0) > 0) return false;
  if (toolName && toolName !== 'select') return false;
  const [p0, p1] = v.viewportRect();
  const cx = (p0[0] + p1[0]) / 2, cy = (p0[1] + p1[1]) / 2;
  const dy = 26 / (v.camera.scale || 1);            // 줄 간격은 화면 26 px
  ctx.save();
  ctx.globalAlpha = 0.5;
  EMPTY_GUIDE_LINES.forEach((t, i) => v.label(t, [cx, cy + (i - (EMPTY_GUIDE_LINES.length - 1) / 2) * dy], { size: i ? 13 : 16, color: v.COLORS.text }));
  ctx.restore();
  return true;
}

export function createView2D(canvas, store, ui, { readonly = false, labels = true, overlay = null, onPick = null, menu = null, onCameraChange = null, onDragOver = null, onDrop = null, onDragLeave = null, onHint = () => {} } = {}) {
  const ctx = canvas.getContext('2d');
  const camera = { cx: 4000, cy: 3000, scale: 0.08 };
  let tool = null, dirty = true, raf = 0, panning = null, dpr = 1, picking = false, lastHint = null;
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
    // 드래그 중이면 이 프레임의 "층"은 프리뷰 자리다(§15.2). 벽 개구부·라벨·충돌·아이템이 모두
    // 같은 층을 본다. 드래그가 없으면 previewFloor가 같은 객체를 돌려주므로 비용이 0이다.
    const preview = tool?.getPreview?.() ?? null;
    const pf = previewFloor(f, preview);
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
    }
    drawWalls(ctx, api, pf, { sel, soloWalls, flags: v2 });
    ctx.globalAlpha = 1;
    if (sel?.type === 'wall' && !readonly) { const wl = f.walls.find(x => x.id === sel.id); if (wl) for (const p of [wl.a, wl.b]) { const s = toScreen(p); ctx.beginPath(); ctx.arc(s[0], s[1], 6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = COLORS.wallSel; ctx.lineWidth = 2; ctx.stroke(); } }
    // 라벨은 맨 마지막에 한 패스로 그린다(§14.5): 우선순위가 높은 것부터 화면 AABB로 자리를 잡고
    // 겹치는 것은 생략한다. 여기서 먼저 걸러 두어야 덕트·아이템이 자기 라벨을 그릴지 알 수 있다.
    // 제품 코드 라벨은 대화형 캔버스에만 그린다(미니맵·캡처는 예전부터 drawItems의 labels && !readonly로
    // 빠져 있었다 — 라벨 패스로 옮기면서 같은 규칙을 플래그로 넘긴다).
    const lflags = readonly ? { ...v2, productCode: false } : v2;
    const placedLabels = labels ? placeLabels(collectLabels(api, pf, { flags: lflags, units, showUnit, pyeong }), { scale: camera.scale }) : [];
    // shown은 "라벨 패스가 맡았다"는 표시다(내용이 아니라 있고 없음만 본다 — ducts2d·items2d가
    // `!shown`으로 검사한다). key는 후보를 테스트에서 지목하고 겹침 진단을 읽기 위한 이름이다.
    const shown = labels ? new Set(placedLabels.map(c => c.key)) : null;
    // 단일 공간 모드에서는 그 방 밖의 아이템도 방·벽처럼 흐리게 그린다
    // 충돌 계산은 아이템 배열 참조가 바뀔 때만 한다(memoCollisions — §13.5). 미니맵·캡처처럼 readonly로
    // 그리는 캔버스와 "충돌 감지"를 끈 경우에는 아예 계산하지 않고, "실시간 충돌 감지"를 끈 상태로 아이템을 끌고 있는 동안에는 색을 내지 않는다(놓으면 다시 보인다).
    drawDucts(ctx, api, pf, { sel, flags: v2, labels, shown });
    const liveOff = v2.collisionLive === false && ITEM_DRAG_KINDS.has(tool?.getDrag?.()?.kind);
    // 드래그 중에는 끌고 있는 것만 비교한다(§15.2). 드래그 밖에서는 예전처럼 캐시된 전체 판정이다.
    const collisions = readonly || v2.collision === false || liveOff ? null
      : preview ? collidingFor(pf.items, [...preview.keys()]) : memoCollisions(f.items);
    drawItems(ctx, api, pf, { sel, flags: v2, collisions, labels: labels && !readonly, shown, dim: soloRoom ? it => (pointInPolygon(it.pos, soloRoom.points) ? 1 : 0.25) : null });
    // 단일 공간 모드·배경 추적의 흐리기는 라벨에도 이어진다(방 루프에서 라벨을 뺐으므로
    // 여기서 같은 계수를 다시 준다 — 다른 방 이름이 또렷하게 남으면 모드의 뜻이 사라진다).
    // 그리는 순서는 placedLabels의 역순이다(§14.5): 나중에 그린 것이 위에 남으므로, 우선순위가
    // 낮은 라벨(덕트 단면·댐퍼)의 반투명 상자가 방 이름·면적을 덮지 못하게 낮은 것부터 그린다.
    if (labels) {
      const a0 = ctx.globalAlpha;
      const soloKeys = soloRoom ? new Set([`room:${solo}:name`, `room:${solo}:area`]) : null;
      for (const c of [...placedLabels].reverse()) {
        const other = soloKeys && c.key.startsWith('room:') && !soloKeys.has(c.key);
        ctx.globalAlpha = (tracing ? 0.35 : 1) * (other ? 0.25 : 1);
        drawLabels(ctx, api, [c]);
      }
      ctx.globalAlpha = a0;
    }
    if (!readonly && v2.guides) for (const g of f.guides) { ctx.strokeStyle = COLORS.guide; ctx.setLineDash([8, 6]); ctx.beginPath(); if (g.type === 'v') { const x = Math.round(toScreen([g.pos, 0])[0]) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, h); } else { const y = Math.round(toScreen([0, g.pos])[1]) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y); } ctx.stroke(); ctx.setLineDash([]); }
    if (v2.measures) for (const m of f.measures) {
      const s0 = toScreen(m.a), s1 = toScreen(m.b);
      ctx.strokeStyle = COLORS.guide; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke(); ctx.lineWidth = 1;
      // 길이 라벨은 여기서 그리지 않는다: 라벨 패스(collectLabels의 'measure')가 우선순위·겹침
      // 판정을 지나 그린다(m-3). 라벨을 끈 캔버스에서는 예전에도 이 라벨이 없었다.
    }
    if (!readonly && labels) drawEmptyGuide(ctx, api, f, state, { toolName: tool?.name ?? null });
    if (tool && !readonly) tool.draw(ctx, api);
    if (overlay) overlay(ctx, api);
    // 도구의 hint는 단계마다 바뀐다(§14.7). 달라진 프레임에만 알려 배너를 다시 그리게 한다.
    const hint = tool?.hint ?? null;
    if (hint !== lastHint) { lastHint = hint; onHint(hint); }
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
  // HTML5 드래그 배치(§14.11). dragover에서 preventDefault를 부르지 않으면 브라우저가 drop을
  // 주지 않는다. 좌표만 월드로 바꿔 넘기고 "무엇을 놓을지"는 배선(app/dndActions.js)이 안다.
  // stopPropagation은 부르지 않는다: 같은 드롭이 바깥 #canvasWrap의 파일 드롭 경로까지 가야 한다.
  const onDragOverEv = ev => {
    if (readonly) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
    onDragOver?.(toWorld(pos(ev)), ev);
    requestRender();
  };
  const onDropEv = ev => {
    if (readonly) return;
    ev.preventDefault();
    onDrop?.(toWorld(pos(ev)), ev);
    requestRender();
  };
  // 캔버스를 벗어난 드래그에서 고스트를 지울 기회를 준다. dragend는 여기서 듣지 않는다(§14.11):
  // 그 이벤트는 드래그 **소스**(라이브러리 타일)에서만 일어나 캔버스 리스너는 실제 브라우저에서
  // 한 번도 불리지 않았다 — [Esc] 취소는 libraryPanel의 dragend → dnd.onDragEnd이 맡는다.
  const onDragLeaveEv = () => { if (readonly) return; onDragLeave?.(); requestRender(); };
  if (onDrop) { canvas.addEventListener('dragover', onDragOverEv); canvas.addEventListener('drop', onDropEv); canvas.addEventListener('dragleave', onDragLeaveEv); }
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false }); canvas.addEventListener('contextmenu', onMenu);
  const unsubs = [store.subscribe(() => { if (readonly) fit(500); else requestRender(); }), ui.subscribe(requestRender)];
  const onResize = () => requestRender(); window.addEventListener('resize', onResize);
  // 옵션 바·배너 행이 생기고 사라지면 캔버스 높이만 바뀐다(window resize가 오지 않는다 — §12.1).
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => requestRender()) : null; ro?.observe(canvas);

  const api = { camera, toScreen, toWorld, fit, zoomAt, zoomBy, centerOn, viewportRect, requestRender, label, poly, COLORS, fmtLen, fmtArea,
    get units() { return store.get().units ?? 'mm'; },
    get showUnit() { return !!store.get().settings?.showUnit; },
    get tool() { return tool; },
    setTool(t) { tool?.cancel?.(); tool = t; requestRender(); },
    destroy() { unsubs.forEach(u => u()); if (raf) { cancelAnimationFrame(raf); raf = 0; } if (bgCache.img) bgCache.img.onload = null; ro?.disconnect(); window.removeEventListener('resize', onResize); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.removeEventListener(type, onUp); canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('contextmenu', onMenu); canvas.removeEventListener('dragover', onDragOverEv); canvas.removeEventListener('drop', onDropEv); canvas.removeEventListener('dragleave', onDragLeaveEv); } };
  requestRender();
  return api;
}
