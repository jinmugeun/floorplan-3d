import { activeFloor } from '../../state/schema.js';
import { setWalls, expandGroups, nudgeItems, rotateItems } from '../../state/floorOps.js';
import { applyMaterial } from '../../state/materialOps.js';
import { hitWall, moveWallParallel, moveVertex, translateNodes, splitWall, wallPolygon, nodeKey } from '../../geom/walls.js';
import { pointInPolygon } from '../../geom/rooms.js';
import { eq, sub, add, dist } from '../../geom/vec.js';
import { fmtLen } from '../../util/units.js';
import { createItemDragger } from './itemDrag.js';
import { createDuctSelect } from './ductSelect.js';
import { drawItemSelection, ITEM_COLORS } from '../items2d.js';
import { LABEL_BG } from '../ducts2d.js';
import { itemMenuItems } from '../../ui/itemMenu.js';
import { wallMenuItems, roomMenuItems } from '../../ui/surfaceMenu.js';
import { pickAt } from './pick.js';
import { MATERIAL_BOTH_SIDES } from '../../ui/messages.js';

const boxOf = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
const inBox = (p, [x0, y0, x1, y1]) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
export const ARROW_STEP = 10, ARROW_STEP_SHIFT = 100;
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

export function createSelectTool({ store, ui, view, onLocked = () => {}, itemActions = {}, surfaceActions = {}, toast = () => {} }) {
  const items = createItemDragger({ store, ui, view, toast });
  const ducts = createDuctSelect({ store, ui, view, toast });
  const selIds = () => { const s = ui.get().selection; return s?.type === 'item' ? [s.id] : s?.type === 'multi' && s.kind === 'item' ? [...s.ids] : []; };
  const setItemSelection = ids => ui.set({ selection: !ids.length ? null : ids.length === 1 ? { type: 'item', id: ids[0] } : { type: 'multi', kind: 'item', ids: [...ids] } });
  let drag = null; // { kind, id|point, startP, base, moved } — 벽·방·배경 드래그(아이템 드래그는 items가 따로 들고 있다)
  const px = n => n / view.camera.scale;
  const floor = () => activeFloor(store.get());
  const locked = () => !!store.get().view?.lockPlan;
  return {
    name: 'select', opts: {},
    onPointerDown(p, ev) {
      const f = floor(), sel = ui.get().selection;
      // 마감재 적용 모드: 클릭이 선택 대신 재질 적용이다(Esc까지 계속). 벽은 안·밖을 한 단계로 함께 바른다.
      // 두 모드가 겹치면(둘 다 ui.set으로 켜진다) 적용 모드가 이긴다: ui.splitWall은 건드리지 않으므로
      // "벽 나누기 대기"는 다음 클릭에 그대로 남는다(M-37).
      const pick = ui.get().matPick;
      if (pick) {
        const hitW = hitWall(f.walls, p, px(6));
        if (hitW) {
          store.beginTransaction();
          applyMaterial(store, { kind: 'wall', id: hitW.id, side: 'in' }, pick.assignment, { record: false });
          applyMaterial(store, { kind: 'wall', id: hitW.id, side: 'out' }, pick.assignment, { record: false });
          store.endTransaction();
          // 2D에서는 면을 가릴 수 없다(면 구분은 3D에서만 된다): 두 면에 발렸다는 것을 알린다(§14.10).
          toast(MATERIAL_BOTH_SIDES);
          return;
        }
        const hitR = f.rooms.find(x => pointInPolygon(p, x.points));
        if (hitR) applyMaterial(store, { kind: 'floor', id: hitR.id }, pick.assignment);
        return;                       // 빈 곳 클릭은 아무 일도 하지 않는다
      }
      if (ui.get().splitWall) {
        const w = hitWall(f.walls, p, px(6));
        if (w) {
          // 벽을 나누면 u 좌표의 뜻이 달라져 영역을 이을 수 없다: 지워진다는 것을 알린다.
          if ((w.regions?.in?.length ?? 0) + (w.regions?.out?.length ?? 0) > 0) toast('벽을 나누면 마감재 영역은 초기화됩니다');
          setWalls(store, splitWall(f.walls, w.id, p));
        }
        ui.set({ splitWall: false }); return;
      }
      const multi = sel?.type === 'multi' && sel.kind === 'wall' ? sel.ids : null;
      // Shift는 토글·영역선택 전용: 아이템 토글 → 벽 토글 → 빈 캔버스면 영역선택(아이템/벽 모두 이 box로 확정한다).
      if (ev?.shiftKey) {
        const hitItem = items.pick(p);
        if (hitItem) {
          const base = selIds();
          const ids = expandGroups(f, base.includes(hitItem.id) ? base.filter(x => x !== hitItem.id) : [...base, hitItem.id]);
          setItemSelection(ids);
          return;
        }
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
      // 이미 고른 것의 핸들이 먼저다(아이템 크기·회전 핸들 → 벽 꼭짓점 → 다중 선택된 벽 묶음).
      // 이 셋은 "지금 고른 것을 편집하는 손잡이"라 일반 히트 순서보다 앞선다.
      const one = selIds().length === 1 ? f.items.find(x => x.id === selIds()[0]) : null;
      const h = one && items.handleHit(one, p);
      if (h) { items.start(h.kind, [one.id], p, h.kind === 'scale' ? { index: h.index } : {}); return; }
      if (sel?.type === 'wall') {
        const w = f.walls.find(x => x.id === sel.id);
        const v = w && [w.a, w.b].find(q => dist(q, p) <= px(8));
        if (v) { if (locked()) { onLocked(); return; } drag = { kind: 'vertex', point: [...v], startP: p, base: f.walls }; store.beginTransaction(); return; }
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
      // 그다음은 2D의 단 하나뿐인 히트 순서다(§14.6): 덕트 꼭짓점 → 덕트 구간 → 아이템 → 벽 → 방.
      // 도면 잠금은 아이템·덕트 편집을 막지 않는다(locked() 가드는 벽·방·배경에만 있다).
      const hit = pickAt(store, ui, p, { scale: view.camera.scale });
      if (hit?.type === 'duct') { ducts.begin(hit, p); return; }
      if (hit?.type === 'item') {
        let ids = selIds();
        if (!ids.includes(hit.item.id)) ids = [hit.item.id];
        ids = expandGroups(f, ids);
        setItemSelection(ids);
        if (ids.length) items.start('items', ids, p);
        return;
      }
      if (hit?.type === 'wall') {
        ui.set({ selection: { type: 'wall', id: hit.wall.id } });
        if (locked()) { onLocked(); return; }
        drag = { kind: 'wall', id: hit.wall.id, startP: p, base: f.walls };
        store.beginTransaction();
        return;
      }
      if (hit?.type === 'room') {
        const r = hit.room;
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
    onPointerMove(p, ev) {
      if (items.getDrag()) { items.apply(p, ev); return; }
      if (ducts.getDrag()) { ducts.apply(p, ev); return; }
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
      if (items.getDrag()) { items.finish(); return; }
      if (ducts.getDrag()) { ducts.finish(); return; }
      if (drag?.kind === 'box') {
        const box = boxOf(drag.startP, drag.cur ?? p);
        const hit = items.pickInBox(box);
        if (hit.length) { setItemSelection(expandGroups(floor(), hit.map(i => i.id))); drag = null; return; }
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
        if (u.fpPick || u.soloRoom || u.matPick) return false; // 취소할 것이 앱 쪽에 있으면 keymap이 처리한다
        if (items.getDrag()) { items.cancel(); return true; } // 아이템 드래그 중 Esc는 이동을 되돌린다
        if (ducts.getDrag()) { ducts.cancel(); return true; }
        const had = !!drag || !!u.selection || !!u.splitWall;
        if (drag) { store.cancelTransaction(); drag = null; } // 드래그 중 Esc는 이동을 되돌린다
        ui.set({ selection: null, splitWall: false });
        return had; // 취소할 것이 없으면 소비하지 않는다(앱이 선택 도구로 돌아간다)
      }
      if (items.getDrag() && ev.ctrlKey && ev.key.toLowerCase() === 'z') { items.cancel(); return true; } // 아이템 드래그 중 undo는 드래그 취소로
      // 덕트 드래그도 같다: 살려 두면 이미 닫힌 트랜잭션 위에 record 없는 dispatch가 쌓여 되돌릴 수 없는 이동이 생긴다
      if (ducts.getDrag() && ev.ctrlKey && ev.key.toLowerCase() === 'z') { ducts.cancel(); return true; }
      if (ev.ctrlKey && ev.key.toLowerCase() === 'z' && drag) { store.cancelTransaction(); drag = null; return true; } // 드래그 중 undo는 드래그 취소로
      const ids = selIds();
      if (ARROWS[ev.key] && ids.length) {
        const k = ev.shiftKey ? ARROW_STEP_SHIFT : ARROW_STEP;
        nudgeItems(store, ids, [ARROWS[ev.key][0] * k, ARROWS[ev.key][1] * k]);
        return true;
      }
      if (ev.key.toLowerCase() === 'q' && ids.length && !ev.ctrlKey && !ev.altKey) { rotateItems(store, ids, 90); return true; }
      return false;
    },
    // 키보드로 연 메뉴는 다시 픽하지 않는다(§15.3): 이미 고른 대상의 메뉴이고, 다시 픽하면
    // 선택 중심에 놓인 다른 것이 잡혀 선택까지 바뀐다(방 중심의 제품·빈 자리의 무게중심).
    onContextMenu(p, { key = false } = {}) {
      const f = floor();
      const sel = ui.get().selection;
      if (key && sel) {
        if (sel.type === 'duct') return ducts.menuFor({ type: 'duct', ductId: sel.id, vertex: sel.vertex ?? null, segment: sel.segment ?? null, handle: false });
        if (sel.type === 'item' || (sel.type === 'multi' && sel.kind === 'item')) return itemMenuItems({ store, ui, ids: expandGroups(f, selIds()), itemActions });
        if (sel.type === 'wall' || (sel.type === 'multi' && sel.kind === 'wall')) return wallMenuItems({ store, ui, wallId: sel.type === 'wall' ? sel.id : sel.ids[0], side: 'in', in3d: false, actions: surfaceActions });
        if (sel.type === 'room') return roomMenuItems({ store, ui, roomId: sel.id, in3d: false, actions: surfaceActions });
      }
      // 우클릭은 좌클릭과 같은 대상을 고른다(§14.6 — 둘이 다른 히트 코드를 갖고 있던 것이 감사 #20이다).
      const hit = pickAt(store, ui, p, { scale: view.camera.scale });
      if (hit?.type === 'duct') return ducts.menuFor(hit);
      if (hit?.type === 'item') {
        const cur = selIds();
        const ids = expandGroups(f, cur.includes(hit.item.id) ? cur : [hit.item.id]);
        setItemSelection(ids);
        return itemMenuItems({ store, ui, ids, itemActions });
      }
      if (hit?.type === 'wall') {
        // 다중 선택에 이미 든 벽이면 다중 선택을 유지한다.
        const sel = ui.get().selection;
        if (!(sel?.type === 'multi' && sel.ids.includes(hit.wall.id))) ui.set({ selection: { type: 'wall', id: hit.wall.id } });
        return wallMenuItems({ store, ui, wallId: hit.wall.id, side: 'in', in3d: false, actions: surfaceActions });
      }
      if (hit?.type === 'room') {
        ui.set({ selection: { type: 'room', id: hit.room.id } });
        return roomMenuItems({ store, ui, roomId: hit.room.id, in3d: false, actions: surfaceActions });
      }
      return [
        { label: '전체 선택', shortcut: 'Ctrl+A', onSelect: () => { const ids = floor().walls.map(x => x.id); ui.set({ selection: ids.length ? { type: 'multi', kind: 'wall', ids } : null }); } },
        { label: '화면 맞추기', onSelect: () => view.fit() },
      ];
    },
    draw(ctx, v) {
      items.drawOverlay(ctx, v); // 노란 가이드 + 벽까지 거리(v2.gapDims)
      ducts.draw(ctx, v);
      if (drag?.kind === 'box') {
        const [x0, y0, x1, y1] = boxOf(drag.startP, drag.cur ?? drag.startP);
        const s0 = v.toScreen([x0, y0]), s1 = v.toScreen([x1, y1]);
        ctx.strokeStyle = ITEM_COLORS.sel; ctx.setLineDash([6, 4]);
        ctx.strokeRect(s0[0], s0[1], s1[0] - s0[0], s1[1] - s0[1]);
        ctx.setLineDash([]);
      }
      const sel = ui.get().selection; if (!sel) return;
      const f = floor();
      if (sel.type === 'item' || (sel.type === 'multi' && sel.kind === 'item')) {
        const preview = items.getPreview();
        for (const id of selIds()) {
          // 드래그 중에는 프리뷰 자리에 외곽선·핸들을 그린다(스토어는 pointerup까지 옛 자리다 — §15.2).
          const it = preview?.get(id) ?? f.items.find(x => x.id === id);
          if (it) drawItemSelection(ctx, v, it, { locked: it.locked });
        }
        return;
      }
      if (sel.type === 'multi' && sel.kind === 'wall') {
        for (const w of f.walls.filter(x => sel.ids.includes(x.id))) v.poly(wallPolygon(w, f.walls), v.COLORS.wallSel, null);
        return;
      }
      if (sel.type === 'wall') {
        const w = f.walls.find(x => x.id === sel.id); if (!w) return;
        const others = f.walls.filter(x => x.id !== w.id);
        // 보기 옵션 "치수"가 켜져 있으면 뷰가 이미 그린다(라벨 두 장 방지). 단, 뷰가 LOD로 생략하는 짧은 벽(40px 미만)은 여기서 그린다.
        const showLen = !store.get().view?.v2?.dims || dist(w.a, w.b) * view.camera.scale < 40;
        if (showLen) v.label(fmtLen(dist(w.a, w.b), v.units, { unit: v.showUnit }), [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], { bg: LABEL_BG, color: v.COLORS.dim });
        for (const q of [w.a, w.b]) { const n = others.find(x => eq(x.a, q) || eq(x.b, q)); if (!n) { const s = v.toScreen(q); ctx.fillStyle = v.COLORS.guide; ctx.beginPath(); ctx.arc(s[0], s[1], 4, 0, Math.PI * 2); ctx.fill(); } }
      }
    },
    cancel() { if (items.getDrag()) items.cancel(); ducts.cancel(); if (drag) { store.cancelTransaction(); drag = null; } },
    getPreview: () => items.getPreview(),
    getDrag: () => items.getDrag() ?? ducts.getDrag() ?? (drag ? { kind: drag.kind, box: drag.kind === 'box' ? boxOf(drag.startP, drag.cur ?? drag.startP) : null } : null),
  };
}
