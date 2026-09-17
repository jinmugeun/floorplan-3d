import { activeFloor } from '../../state/schema.js';
import { setWalls } from '../../state/floorOps.js';
import { hitWall, moveWallParallel, moveVertex, translateNodes, splitWall, wallPolygon } from '../../geom/walls.js';
import { pointInPolygon } from '../../geom/rooms.js';
import { eq, sub, add, dist } from '../../geom/vec.js';
import { fmtLen } from '../../util/units.js';

const key = p => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`; // 소수 좌표도 구분하는 노드 키
const boxOf = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
const inBox = (p, [x0, y0, x1, y1]) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;

export function createSelectTool({ store, ui, view, onLocked = () => {} }) {
  let drag = null; // { kind, id|point, startP, base, moved }
  const px = n => n / view.camera.scale;
  const floor = () => activeFloor(store.get());
  const locked = () => !!store.get().view?.lockPlan;
  return {
    name: 'select', opts: {},
    onPointerDown(p, ev) {
      const f = floor(), sel = ui.get().selection;
      if (ui.get().splitWall) {
        const w = hitWall(f.walls, p, px(6));
        if (w) { setWalls(store, splitWall(f.walls, w.id, p)); }
        ui.set({ splitWall: false }); return;
      }
      const multi = sel?.type === 'multi' && sel.kind === 'wall' ? sel.ids : null;
      if (ev?.shiftKey) {
        const hit = hitWall(f.walls, p, px(6));
        if (hit) { // Shift+클릭: 토글
          const base = multi ?? (sel?.type === 'wall' ? [sel.id] : []);
          const ids = base.includes(hit.id) ? base.filter(id => id !== hit.id) : [...base, hit.id];
          ui.set({ selection: ids.length ? { type: 'multi', kind: 'wall', ids } : null });
          return;
        }
        drag = { kind: 'box', startP: p, cur: p }; // Shift+드래그: 영역 선택
        return;
      }
      if (multi) {
        const hit = hitWall(f.walls, p, px(6));
        if (hit && multi.includes(hit.id)) {
          if (locked()) { onLocked(); return; }
          const pts = new Set();
          for (const w of f.walls) if (multi.includes(w.id)) { pts.add(key(w.a)); pts.add(key(w.b)); }
          const attached = f.walls.some(w => !multi.includes(w.id) && (pts.has(key(w.a)) || pts.has(key(w.b))));
          drag = { kind: 'multi', ids: multi, startP: p, base: f.walls, pts, attached };
          store.beginTransaction();
          return;
        }
      }
      if (sel?.type === 'wall') {
        const w = f.walls.find(x => x.id === sel.id);
        const v = w && [w.a, w.b].find(q => dist(q, p) <= px(8));
        if (v) { if (locked()) { onLocked(); return; } drag = { kind: 'vertex', point: [...v], startP: p, base: f.walls }; store.beginTransaction(); return; }
      }
      const w = hitWall(f.walls, p, px(6));
      if (w) { ui.set({ selection: { type: 'wall', id: w.id } }); if (locked()) { onLocked(); return; } drag = { kind: 'wall', id: w.id, startP: p, base: f.walls }; store.beginTransaction(); return; }
      const r = f.rooms.find(x => pointInPolygon(p, x.points));
      if (r) {
        ui.set({ selection: { type: 'room', id: r.id } });
        if (locked()) { onLocked(); return; }
        const pts = new Set();
        for (const w of f.walls) if (r.wallIds.includes(w.id)) { pts.add(key(w.a)); pts.add(key(w.b)); }
        const attached = f.walls.some(w => !r.wallIds.includes(w.id) && (pts.has(key(w.a)) || pts.has(key(w.b))));
        drag = { kind: 'room', id: r.id, wallIds: r.wallIds, startP: p, base: f.walls, pts, attached };
        store.beginTransaction(); return;
      }
      ui.set({ selection: null }); drag = null;
    },
    onPointerMove(p) {
      if (!drag) return;
      if (drag.kind === 'box') { drag.cur = p; return; }
      const d = sub(p, drag.startP); if (Math.abs(d[0]) < 1 && Math.abs(d[1]) < 1) return;
      let walls = drag.base;
      if (drag.kind === 'vertex') walls = moveVertex(walls, drag.point, add(drag.point, d));
      else if (drag.kind === 'wall') walls = moveWallParallel(walls, drag.id, d);
      else if (drag.kind === 'room' || drag.kind === 'multi') {
        const dd = drag.attached ? (Math.abs(d[0]) >= Math.abs(d[1]) ? [d[0], 0] : [0, d[1]]) : d;
        if (Math.abs(dd[0]) < 1 && Math.abs(dd[1]) < 1) return;
        walls = translateNodes(walls, q => drag.pts.has(key(q)), dd);
      }
      drag.moved = true;
      setWalls(store, walls, { record: false });
    },
    onPointerUp(p) {
      if (drag?.kind === 'box') {
        const box = boxOf(drag.startP, drag.cur ?? p);
        const ids = floor().walls.filter(w => inBox(w.a, box) && inBox(w.b, box)).map(w => w.id); // 완전히 들어온 벽만
        ui.set({ selection: ids.length ? { type: 'multi', kind: 'wall', ids } : null });
        drag = null; return;
      }
      if (drag) drag.moved ? store.endTransaction() : store.cancelTransaction();
      drag = null;
    },
    onKey(ev) {
      if (ev.key === 'Escape') {
        if (drag) { store.cancelTransaction(); drag = null; } // 드래그 중 Esc는 이동을 되돌린다
        ui.set({ selection: null, splitWall: false }); return true;
      }
      if (ev.ctrlKey && ev.key.toLowerCase() === 'z' && drag) { store.cancelTransaction(); drag = null; return true; } // 드래그 중 undo는 드래그 취소로
      return false;
    },
    draw(ctx, v) {
      if (drag?.kind === 'box') {
        const [x0, y0, x1, y1] = boxOf(drag.startP, drag.cur ?? drag.startP);
        const s0 = v.toScreen([x0, y0]), s1 = v.toScreen([x1, y1]);
        ctx.strokeStyle = v.COLORS.wallSel; ctx.setLineDash([6, 4]);
        ctx.strokeRect(s0[0], s0[1], s1[0] - s0[0], s1[1] - s0[1]);
        ctx.setLineDash([]);
      }
      const sel = ui.get().selection; if (!sel) return;
      const f = floor();
      if (sel.type === 'multi' && sel.kind === 'wall') {
        for (const w of f.walls.filter(x => sel.ids.includes(x.id))) v.poly(wallPolygon(w, f.walls), v.COLORS.wallSel, null);
        return;
      }
      if (sel.type === 'wall') {
        const w = f.walls.find(x => x.id === sel.id); if (!w) return;
        const others = f.walls.filter(x => x.id !== w.id);
        for (const q of [w.a, w.b]) { const n = others.find(x => eq(x.a, q) || eq(x.b, q)); v.label(fmtLen(dist(w.a, w.b), v.units, { unit: v.showUnit }), [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], { bg: '#fff', color: v.COLORS.dim }); if (!n) { const s = v.toScreen(q); ctx.fillStyle = v.COLORS.guide; ctx.beginPath(); ctx.arc(s[0], s[1], 4, 0, Math.PI * 2); ctx.fill(); } }
      }
    },
    cancel() { if (drag) { store.cancelTransaction(); drag = null; } },
  };
}
