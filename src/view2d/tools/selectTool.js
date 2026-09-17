import { activeFloor } from '../../state/schema.js';
import { setWalls, deleteWall, deleteRoom, duplicateRoom } from '../../state/floorOps.js';
import { hitWall, moveWallParallel, moveVertex, translateNodes, splitWall, wallPolygon, nodeKey } from '../../geom/walls.js';
import { pointInPolygon } from '../../geom/rooms.js';
import { eq, sub, add, dist } from '../../geom/vec.js';
import { fmtLen } from '../../util/units.js';

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
          for (const w of f.walls) if (multi.includes(w.id)) { pts.add(nodeKey(w.a)); pts.add(nodeKey(w.b)); }
          const attached = f.walls.some(w => !multi.includes(w.id) && (pts.has(nodeKey(w.a)) || pts.has(nodeKey(w.b))));
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
        for (const w of f.walls) if (r.wallIds.includes(w.id)) { pts.add(nodeKey(w.a)); pts.add(nodeKey(w.b)); }
        const attached = f.walls.some(w => !r.wallIds.includes(w.id) && (pts.has(nodeKey(w.a)) || pts.has(nodeKey(w.b))));
        drag = { kind: 'room', id: r.id, wallIds: r.wallIds, startP: p, base: f.walls, pts, attached };
        store.beginTransaction(); return;
      }
      const bg = store.get().background;
      if (bg && bg.visible && !bg.locked && inBox(p, [bg.offset[0], bg.offset[1], bg.offset[0] + bg.width * bg.scale, bg.offset[1] + bg.height * bg.scale])) { // 잠금이 풀린 배경은 빈 곳 드래그로 옮긴다
        ui.set({ selection: null });
        if (locked()) { onLocked(); drag = null; return; } // 도면 잠금이 배경 이동도 막는다
        drag = { kind: 'bg', startP: p, base: [...bg.offset] };
        store.beginTransaction();
        return;
      }
      ui.set({ selection: null }); drag = null;
    },
    onPointerMove(p) {
      if (!drag) return;
      if (drag.kind === 'bg') {
        const d = sub(p, drag.startP);
        if (Math.abs(d[0]) < 1 && Math.abs(d[1]) < 1) return;
        drag.moved = true;
        store.dispatch(s => { s.background.offset = [drag.base[0] + d[0], drag.base[1] + d[1]]; }, { record: false });
        return;
      }
      if (drag.kind === 'box') { drag.cur = p; return; }
      const d = sub(p, drag.startP); if (Math.abs(d[0]) < 1 && Math.abs(d[1]) < 1) return;
      let walls = drag.base;
      if (drag.kind === 'vertex') walls = moveVertex(walls, drag.point, add(drag.point, d));
      else if (drag.kind === 'wall') walls = moveWallParallel(walls, drag.id, d);
      else if (drag.kind === 'room' || drag.kind === 'multi') {
        const dd = drag.attached ? (Math.abs(d[0]) >= Math.abs(d[1]) ? [d[0], 0] : [0, d[1]]) : d;
        if (Math.abs(dd[0]) < 1 && Math.abs(dd[1]) < 1) return;
        walls = translateNodes(walls, q => drag.pts.has(nodeKey(q)), dd);
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
        const u = ui.get();
        if (u.fpPick || u.soloRoom) return false; // 취소할 것이 앱 쪽에 있으면 keymap이 처리한다
        const had = !!drag || !!u.selection || !!u.splitWall;
        if (drag) { store.cancelTransaction(); drag = null; } // 드래그 중 Esc는 이동을 되돌린다
        ui.set({ selection: null, splitWall: false });
        return had; // 취소할 것이 없으면 소비하지 않는다(앱이 선택 도구로 돌아간다)
      }
      if (ev.ctrlKey && ev.key.toLowerCase() === 'z' && drag) { store.cancelTransaction(); drag = null; return true; } // 드래그 중 undo는 드래그 취소로
      return false;
    },
    onContextMenu(p) {
      const f = floor();
      const w = hitWall(f.walls, p, px(6));
      // 우클릭은 먼저 대상을 선택한다(다중 선택에 이미 든 벽이면 다중 선택을 유지한다).
      const sel = ui.get().selection;
      if (w && !(sel?.type === 'multi' && sel.ids.includes(w.id))) ui.set({ selection: { type: 'wall', id: w.id } });
      if (w) return [
        { label: '벽 나누기', onSelect: () => { ui.set({ selection: { type: 'wall', id: w.id }, splitWall: true }); } },
        { label: '곡선벽 전환', disabled: true, title: '미지원' },
        { label: '재질 교체', onSelect: () => ui.set({ selection: { type: 'wall', id: w.id }, focusField: 'colorOut' }) },
        'sep',
        { label: '삭제', shortcut: '⌫', danger: true, onSelect: () => deleteWall(store, w.id) },
      ];
      const r = f.rooms.find(x => pointInPolygon(p, x.points));
      if (r) ui.set({ selection: { type: 'room', id: r.id } });
      if (r) return [
        { label: '방 복사', shortcut: 'Ctrl+C', onSelect: () => duplicateRoom(store, r.id) },
        { label: '마감재 복사', disabled: true, title: '미지원' },
        { label: '재질 교체', onSelect: () => ui.set({ selection: { type: 'room', id: r.id }, focusField: 'floorColor' }) },
        { label: '단일 공간 모드', onSelect: () => ui.set({ selection: { type: 'room', id: r.id }, soloRoom: r.id }) },
        'sep',
        { label: '삭제', shortcut: '⌫', danger: true, onSelect: () => { if (window.confirm('방과 그 벽을 모두 삭제할까요?')) deleteRoom(store, r.id); } },
      ];
      return [
        { label: '전체 선택', shortcut: 'Ctrl+A', onSelect: () => { const ids = floor().walls.map(x => x.id); ui.set({ selection: ids.length ? { type: 'multi', kind: 'wall', ids } : null }); } },
        { label: '화면 맞추기', onSelect: () => view.fit() },
      ];
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
        const showLen = !store.get().view?.v2?.dims; // 보기 옵션 "치수"가 켜져 있으면 뷰가 이미 그린다(라벨 두 장 방지)
        for (const q of [w.a, w.b]) { const n = others.find(x => eq(x.a, q) || eq(x.b, q)); if (showLen) v.label(fmtLen(dist(w.a, w.b), v.units, { unit: v.showUnit }), [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], { bg: '#fff', color: v.COLORS.dim }); if (!n) { const s = v.toScreen(q); ctx.fillStyle = v.COLORS.guide; ctx.beginPath(); ctx.arc(s[0], s[1], 4, 0, Math.PI * 2); ctx.fill(); } }
      }
    },
    cancel() { if (drag) { store.cancelTransaction(); drag = null; } },
  };
}
