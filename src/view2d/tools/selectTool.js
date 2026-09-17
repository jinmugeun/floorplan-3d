import { activeFloor } from '../../state/schema.js';
import { setWalls } from '../../state/floorOps.js';
import { hitWall, moveWallParallel, moveVertex, transformWalls, splitWall } from '../../geom/walls.js';
import { pointInPolygon } from '../../geom/rooms.js';
import { eq, sub, add, dist } from '../../geom/vec.js';

export function createSelectTool({ store, ui, view }) {
  let drag = null; // { kind, id|point, startP, base, moved }
  const px = n => n / view.camera.scale;
  const floor = () => activeFloor(store.get());
  return {
    name: 'select', opts: {},
    onPointerDown(p) {
      const f = floor(), sel = ui.get().selection;
      if (ui.get().splitWall) {
        const w = hitWall(f.walls, p, px(6));
        if (w) { setWalls(store, splitWall(f.walls, w.id, p)); }
        ui.set({ splitWall: false }); return;
      }
      if (sel?.type === 'wall') {
        const w = f.walls.find(x => x.id === sel.id);
        const v = w && [w.a, w.b].find(q => dist(q, p) <= px(8));
        if (v) { drag = { kind: 'vertex', point: [...v], startP: p, base: f.walls }; store.beginTransaction(); return; }
      }
      const w = hitWall(f.walls, p, px(6));
      if (w) { ui.set({ selection: { type: 'wall', id: w.id } }); drag = { kind: 'wall', id: w.id, startP: p, base: f.walls }; store.beginTransaction(); return; }
      const r = f.rooms.find(x => pointInPolygon(p, x.points));
      if (r) { ui.set({ selection: { type: 'room', id: r.id } }); drag = { kind: 'room', id: r.id, wallIds: r.wallIds, startP: p, base: f.walls }; store.beginTransaction(); return; }
      ui.set({ selection: null }); drag = null;
    },
    onPointerMove(p) {
      if (!drag) return;
      const d = sub(p, drag.startP); if (Math.abs(d[0]) < 1 && Math.abs(d[1]) < 1) return;
      let walls = drag.base;
      if (drag.kind === 'vertex') walls = moveVertex(walls, drag.point, add(drag.point, d));
      else if (drag.kind === 'wall') walls = moveWallParallel(walls, drag.id, d);
      else if (drag.kind === 'room') { const pts = new Set(); for (const w of walls) if (drag.wallIds.includes(w.id)) { pts.add(w.a.join(',')); pts.add(w.b.join(',')); } walls = transformWalls(walls, q => (pts.has(q.join(',')) ? add(q, d) : q)); }
      drag.moved = true;
      setWalls(store, walls, { record: false });
    },
    onPointerUp() { if (drag && !drag.moved) store.cancelTransaction(); drag = null; },
    onKey(ev) {
      if (ev.key === 'Escape') { ui.set({ selection: null, splitWall: false }); return true; }
      return false;
    },
    draw(ctx, v) {
      const sel = ui.get().selection; if (!sel) return;
      const f = floor();
      if (sel.type === 'wall') {
        const w = f.walls.find(x => x.id === sel.id); if (!w) return;
        const others = f.walls.filter(x => x.id !== w.id);
        for (const q of [w.a, w.b]) { const n = others.find(x => eq(x.a, q) || eq(x.b, q)); v.label(`${Math.round(dist(w.a, w.b))}`, [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], { bg: '#fff', color: v.COLORS.dim }); if (!n) { const s = v.toScreen(q); ctx.fillStyle = v.COLORS.guide; ctx.beginPath(); ctx.arc(s[0], s[1], 4, 0, Math.PI * 2); ctx.fill(); } }
      }
    },
    cancel() { if (drag) { store.cancelTransaction(); drag = null; } },
  };
}
