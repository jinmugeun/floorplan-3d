import { activeFloor } from '../../state/schema.js';
import { addWalls } from '../../state/floorOps.js';
import { makeWall, endpoints } from '../../geom/walls.js';
import { snapPoint } from '../../geom/snap.js';
import { add, sub, mul, norm, perp, dist } from '../../geom/vec.js';

export function createWallTool({ store, onDone = () => {} }) {
  const opts = { reference: 'center', thickness: 200, snap: true, ortho: true };
  let points = [], cursor = null, guides = [], typed = '';
  const reset = () => { points = []; cursor = null; guides = []; typed = ''; };
  const last = () => points[points.length - 1] ?? null;
  const snap = p => { const f = activeFloor(store.get()); return snapPoint(p, { points: endpoints(f.walls).concat(points), guides: f.guides, anchor: last(), ortho: opts.ortho, snap: opts.snap }); };
  const addSegment = (a, b) => {
    if (dist(a, b) < 10) return false;
    let s = a, e = b;
    if (opts.reference !== 'center') { const n = mul(perp(norm(sub(b, a))), (opts.reference === 'inner' ? 1 : -1) * opts.thickness / 2); s = add(a, n); e = add(b, n); }
    addWalls(store, [makeWall({ a: s, b: e, thickness: opts.thickness })]);
    return true;
  };
  const finish = () => { const had = points.length > 0; reset(); if (had) onDone(); return had; };
  return {
    name: 'wall', opts,
    onPointerDown(p) {
      const r = snap(p); cursor = r.point; guides = r.guides;
      if (points.length >= 2 && dist(cursor, points[0]) <= 150) { addSegment(last(), points[0]); finish(); return; }
      if (last() && dist(cursor, last()) < 10) { finish(); return; }
      if (last()) addSegment(last(), cursor);
      points.push(cursor); typed = '';
    },
    onPointerMove(p) { const r = snap(p); cursor = r.point; guides = r.guides; },
    onPointerUp() {},
    onKey(ev) {
      if (ev.key === 'Escape') return finish(); // 그리던 벽이 없으면 소비하지 않는다
      if (!last()) return false;
      if (/^[0-9]$/.test(ev.key)) { typed += ev.key; return true; }
      if (ev.key === 'Backspace') { typed = typed.slice(0, -1); return true; }
      if (ev.key === 'Enter') {
        if (typed && cursor) { const d = norm(sub(cursor, last())); const e = add(last(), mul(d, Number(typed))); if (addSegment(last(), e)) points.push(e); typed = ''; }
        else finish();
        return true;
      }
      return false;
    },
    getPreview() { return { points: [...points], cursor, guides, typed }; },
    draw(ctx, view) {
      for (const g of guides) { const [w, h] = [ctx.canvas.clientWidth || ctx.canvas.width, ctx.canvas.clientHeight || ctx.canvas.height]; ctx.strokeStyle = view.COLORS.guide; ctx.setLineDash([6, 4]); ctx.beginPath(); if (g.type === 'v') { const x = view.toScreen([g.x, 0])[0]; ctx.moveTo(x, 0); ctx.lineTo(x, h); } else { const y = view.toScreen([0, g.y])[1]; ctx.moveTo(0, y); ctx.lineTo(w, y); } ctx.stroke(); ctx.setLineDash([]); }
      if (!last() || !cursor) { if (cursor) { const s = view.toScreen(cursor); ctx.beginPath(); ctx.arc(s[0], s[1], 5, 0, Math.PI * 2); ctx.strokeStyle = view.COLORS.wallSel; ctx.stroke(); } return; }
      const a = view.toScreen(last()), b = view.toScreen(cursor);
      ctx.strokeStyle = view.COLORS.wallSel; ctx.lineWidth = Math.max(2, opts.thickness * view.camera.scale); ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
      const mid = [(last()[0] + cursor[0]) / 2, (last()[1] + cursor[1]) / 2];
      view.label(typed ? `${typed}|` : `${Math.round(dist(last(), cursor))}`, mid, { bg: '#fff', color: view.COLORS.dim });
    },
    cancel() { reset(); },
  };
}
