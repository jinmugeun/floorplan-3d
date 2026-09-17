import { activeFloor } from '../../state/schema.js';
import { addWalls } from '../../state/floorOps.js';
import { rectWalls, endpoints } from '../../geom/walls.js';
import { snapPoint } from '../../geom/snap.js';

export function createRoomTool({ store, onDone = () => {} }) {
  const opts = { thickness: 200, snap: true };
  let start = null, cur = null, typed = { w: '', h: '', field: 'w' };
  const reset = () => { start = null; cur = null; typed = { w: '', h: '', field: 'w' }; };
  const snap = p => { const f = activeFloor(store.get()); return snapPoint(p, { points: endpoints(f.walls), guides: f.guides, snap: opts.snap }).point; };
  const dims = () => {
    const sx = Math.sign(cur[0] - start[0]) || 1, sy = Math.sign(cur[1] - start[1]) || 1;
    const w = typed.w ? Number(typed.w) : Math.abs(cur[0] - start[0]);
    const h = typed.h ? Number(typed.h) : Math.abs(cur[1] - start[1]);
    return { w, h, end: [start[0] + sx * w, start[1] + sy * h] };
  };
  const commit = end => {
    if (Math.abs(end[0] - start[0]) < 10 || Math.abs(end[1] - start[1]) < 10) return;
    addWalls(store, rectWalls(start, end, opts.thickness));
    reset(); onDone();
  };
  return {
    name: 'room', opts,
    onPointerDown(p) { const s = snap(p); if (!start) { start = s; cur = s; } else { cur = s; commit(typed.w || typed.h ? dims().end : s); } },
    onPointerMove(p) { if (start) cur = snap(p); },
    onPointerUp() {},
    onKey(ev) {
      // 그리던 사각형이 있을 때만 Esc를 소비한다. 없으면 앱이 선택 도구로 돌아가게 둔다.
      if (ev.key === 'Escape') { const had = !!start; reset(); return had; }
      if (!start) return false;
      if (/^[0-9]$/.test(ev.key)) { typed[typed.field] += ev.key; return true; }
      if (ev.key === 'Backspace') { typed[typed.field] = typed[typed.field].slice(0, -1); return true; }
      if (ev.key === 'Tab') { ev.preventDefault(); typed.field = typed.field === 'w' ? 'h' : 'w'; return true; }
      if (ev.key === 'Enter') { commit(dims().end); return true; }
      return false;
    },
    getPreview() { if (!start) return null; const d = dims(); return { start, end: d.end, w: d.w, h: d.h, typed: { ...typed } }; },
    draw(ctx, view) {
      const pv = this.getPreview(); if (!pv) return;
      const [x0, y0] = pv.start, [x1, y1] = pv.end;
      view.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], 'rgba(31,95,208,0.10)', view.COLORS.wallSel, 2);
      const wLabel = `${Math.round(pv.w)}${pv.typed.field === 'w' ? '|' : ''}`, hLabel = `${Math.round(pv.h)}${pv.typed.field === 'h' ? '|' : ''}`;
      view.label(wLabel, [(x0 + x1) / 2, y0], { bg: '#fff', color: view.COLORS.dim });
      view.label(hLabel, [x1, (y0 + y1) / 2], { bg: '#fff', color: view.COLORS.dim });
    },
    cancel() { reset(); },
  };
}
