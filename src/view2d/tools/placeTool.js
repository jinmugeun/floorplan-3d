import { activeFloor, createItem } from '../../state/schema.js';
import { addItem } from '../../state/floorOps.js';
import { snapItemPos, nearestWallPlacement, WALL_ATTACH_DIST } from '../../geom/items.js';
import { drawItem } from '../items2d.js';

// 라이브러리 타일을 누르면 켜지는 도구. 한 번 배치하면 선택 도구로 돌아간다(오늘의집과 같은 동작).
export function createPlaceTool({ store, ui, view, product, onDone = () => {} }) {
  const floor = () => activeFloor(store.get());
  const embed = !!product.opening; // 문·창·개구부는 벽 두께 안에 박힌다
  let ghost = ghostAt([0, 0], false);

  function ghostAt(p, noSnap) {
    const f = floor();
    const item = createItem(product, { pos: [p[0], p[1]] });
    if (product.attach === 'ceiling') {
      item.z = Math.max(0, Math.round(f.height - item.size[2]));  // 천장에 매단다
      return { item, guides: [] };
    }
    if (product.attach === 'wall') {
      const hit = nearestWallPlacement(f.walls, p, item.size, WALL_ATTACH_DIST, { embed });
      if (!hit) return { item, guides: [] };
      return { item: { ...item, pos: [hit.pos[0], hit.pos[1]], rot: hit.rot, wallId: hit.wallId, t: hit.t, side: hit.side }, guides: [] };
    }
    if (noSnap) return { item, guides: [] };
    const s = snapItemPos(item, { walls: f.walls, items: f.items.filter(i => !i.hidden) });
    return { item: { ...item, pos: s.pos }, guides: s.guides };
  }

  return {
    name: 'place', opts: {}, product,
    hint: `${product.name}을(를) 배치할 위치를 클릭해주세요. 메시지를 누르거나 [ESC] 키를 누르면 취소됩니다.`,
    getGhost: () => ghost,
    onPointerMove(p, ev) { ghost = ghostAt(p, !!ev?.ctrlKey); },
    onPointerDown(p, ev) {
      ghost = ghostAt(p, !!ev?.ctrlKey);
      const item = { ...ghost.item, pos: [Math.round(ghost.item.pos[0]), Math.round(ghost.item.pos[1])] };
      addItem(store, item);
      ui.set({ selection: { type: 'item', id: item.id } });
      onDone();
    },
    onPointerUp() {},
    onKey(ev) { if (ev.key === 'Escape') { onDone(); return true; } return false; },
    onHintClick() { onDone(); },
    onContextMenu() { onDone(); return null; },
    draw(ctx, v) {
      drawItem(ctx, v, ghost.item, { alpha: 0.6, outline: v.COLORS.wallSel, labels: false });
      for (const g of ghost.guides) {
        const [w, h] = [ctx.canvas.clientWidth, ctx.canvas.clientHeight];
        ctx.save(); ctx.strokeStyle = v.COLORS.guide; ctx.setLineDash([8, 6]); ctx.beginPath();
        if (g.type === 'v') { const x = Math.round(v.toScreen([g.x, 0])[0]) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, h); }
        else { const y = Math.round(v.toScreen([0, g.y])[1]) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y); }
        ctx.stroke(); ctx.restore();
      }
    },
    cancel() {},
  };
}
