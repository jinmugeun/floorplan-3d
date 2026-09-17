import { activeFloor } from '../../state/schema.js';
import { endpoints } from '../../geom/walls.js';
import { snapPoint } from '../../geom/snap.js';
import { dist } from '../../geom/vec.js';

export function createMeasureTool({ store }) {
  const opts = { snap: true };
  let a = null, b = null, cur = null;
  const snap = p => { const f = activeFloor(store.get()); return snapPoint(p, { points: endpoints(f.walls), guides: f.guides, snap: opts.snap }).point; };
  return {
    name: 'measure', opts,
    onPointerDown(p) { const s = snap(p); if (!a || b) { a = s; b = null; } else b = s; },
    onPointerMove(p) { cur = snap(p); }, onPointerUp() {},
    onKey(ev) { if (ev.key === 'Escape') { const had = !!a; a = b = null; return had; } return false; },
    draw(ctx, v) {
      const end = b ?? cur; if (!a || !end) return;
      const s0 = v.toScreen(a), s1 = v.toScreen(end);
      ctx.strokeStyle = v.COLORS.guide; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke(); ctx.lineWidth = 1;
      v.label(`${Math.round(dist(a, end))} mm`, [(a[0] + end[0]) / 2, (a[1] + end[1]) / 2], { bg: '#fff', color: v.COLORS.dim });
    },
    cancel() { a = b = cur = null; },
  };
}
