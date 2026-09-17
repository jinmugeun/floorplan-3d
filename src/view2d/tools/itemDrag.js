import { activeFloor } from '../../state/schema.js';
import { updateItems, itemsOf } from '../../state/floorOps.js';
import { sub, add, dist } from '../../geom/vec.js';
import { pointInItem, itemAABB, snapItemPos, wallGaps, nearestWallPlacement, isEmbed, WALL_ATTACH_DIST } from '../../geom/items.js';
import { itemVisible, itemHandles, HANDLE_HIT_PX } from '../items2d.js';

// 아이템 드래그 한 묶음. selectTool은 "무엇을 잡았나"만 판단하고 나머지를 여기로 넘긴다.
// drag.kind: 'items'(이동) | 'scale'(크기 핸들, Task 9) | 'rotate'(회전 핸들, Task 9)
export function createItemDragger({ store, ui, view, toast = () => {} }) {
  const px = n => n / view.camera.scale;
  const floor = () => activeFloor(store.get());
  const flags = () => store.get().view?.v2 ?? {};
  let drag = null;

  // 위에 그린 아이템이 먼저 잡힌다. 잠긴 아이템은 클릭으로 잡히지 않는다(레이어 패널에서만 고른다).
  function pick(p) {
    const f = floor(), fl = flags();
    for (let i = f.items.length - 1; i >= 0; i--) {
      const it = f.items[i];
      if (it.locked || !itemVisible(it, fl)) continue;
      if (pointInItem(p, it, px(2))) return it;
    }
    return null;
  }
  // 2A의 `boxOf`가 만든 [x0, y0, x1, y1] 안에 중심이 든 아이템.
  function pickInBox([x0, y0, x1, y1]) {
    const fl = flags();
    return floor().items.filter(i => !i.locked && itemVisible(i, fl)
      && i.pos[0] >= x0 && i.pos[0] <= x1 && i.pos[1] >= y0 && i.pos[1] <= y1);
  }
  // 선택된 아이템이 하나일 때의 크기·회전 핸들 히트(Task 9에서 쓴다).
  function handleHit(item, p) {
    if (!item || item.locked) return null;
    const h = itemHandles(item, view.camera.scale);
    if (dist(p, h.rotHandle) <= px(HANDLE_HIT_PX)) return { kind: 'rotate' };
    const index = h.handles.findIndex(q => dist(p, q) <= px(HANDLE_HIT_PX));
    return index >= 0 ? { kind: 'scale', index } : null;
  }

  function start(kind, ids, p, extra = {}) {
    drag = {
      kind, ids: [...ids], startP: p, guides: [], gaps: null, moved: false, warned: false, ...extra,
      base: itemsOf(store.get(), ids).map(i => ({ ...i, pos: [...i.pos], size: [...i.size] })),
    };
    store.beginTransaction();
    return drag;
  }

  function move(p, ev) {
    const f = floor(), d = sub(p, drag.startP);
    if (!drag.moved && Math.abs(d[0]) < 1 && Math.abs(d[1]) < 1) return; // 1mm 미만 손떨림은 이동으로 보지 않는다
    const primary = drag.base[0];
    let moved;
    if (drag.base.length === 1 && primary.attach === 'wall') {
      const hit = nearestWallPlacement(f.walls, p, primary.size, WALL_ATTACH_DIST, { embed: isEmbed(primary) });
      moved = [hit
        ? { ...primary, pos: hit.pos, rot: hit.rot, wallId: hit.wallId, t: hit.t, side: hit.side }
        : { ...primary, pos: add(primary.pos, d) }];
      drag.guides = [];
    } else {
      moved = drag.base.map(b => ({ ...b, pos: add(b.pos, d) }));
      if (ev?.ctrlKey) drag.guides = [];
      else {
        const others = f.items.filter(i => !drag.ids.includes(i.id) && !i.hidden);
        const s = snapItemPos(moved[0], { walls: f.walls, items: others });
        const dd = sub(s.pos, moved[0].pos);
        moved = moved.map(m => ({ ...m, pos: add(m.pos, dd) }));
        drag.guides = s.guides;
      }
    }
    drag.gaps = wallGaps(itemAABB(moved[0]), f.walls);
    drag.moved = true;
    // 여러 개를 함께 옮기면 벽 부착을 놓는다(묶음에서 기준 아이템만 벽을 따라갈 수 있다).
    updateItems(store, moved.map(m => ({
      id: m.id,
      patch: {
        pos: [Math.round(m.pos[0]), Math.round(m.pos[1])], rot: m.rot,
        ...(drag.base.length === 1 ? { wallId: m.wallId, t: m.t, side: m.side } : { wallId: null }),
      },
    })), { record: false });
  }

  function apply(p, ev) {
    if (!drag) return;
    if (drag.kind === 'items') move(p, ev);
    // Task 9가 여기에 'scale'·'rotate' 분기를, Task 10이 move() 끝에 충돌 경고를 덧붙인다.
  }
  function finish() {
    if (!drag) return false;
    const moved = drag.moved;
    moved ? store.endTransaction() : store.cancelTransaction();
    drag = null;
    return moved;
  }
  function cancel() { if (drag) { store.cancelTransaction(); drag = null; } }

  // 드래그 중 노란 가이드와 벽까지 거리 라벨. `v2.gapDims`가 꺼져 있으면 거리 라벨은 그리지 않는다.
  function drawOverlay(ctx, v, d = drag) {
    if (!d) return;
    const [w, h] = [ctx.canvas.clientWidth, ctx.canvas.clientHeight];
    for (const g of d.guides ?? []) {
      ctx.save(); ctx.strokeStyle = v.COLORS.guide; ctx.setLineDash([8, 6]); ctx.beginPath();
      if (g.type === 'v') { const x = Math.round(v.toScreen([g.x, 0])[0]) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      else { const y = Math.round(v.toScreen([0, g.y])[1]) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke(); ctx.restore();
    }
    const it = floor().items.find(x => x.id === d.base[0].id);
    if (it && d.gaps && flags().gapDims !== false) {
      const b = itemAABB(it), c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
      const spots = {
        left: [b.min[0] - d.gaps.left / 2, c[1]], right: [b.max[0] + d.gaps.right / 2, c[1]],
        up: [c[0], b.min[1] - d.gaps.up / 2], down: [c[0], b.max[1] + d.gaps.down / 2],
      };
      for (const k of ['left', 'right', 'up', 'down']) {
        if (d.gaps[k] === null) continue;
        v.label(`${Math.round(d.gaps[k])}`, spots[k], { size: 11, bg: '#fff', color: v.COLORS.dim });
      }
    }
  }

  return {
    pick, pickInBox, handleHit, start, apply, finish, cancel, drawOverlay,
    // 테스트와 오버레이가 읽는 좁은 뷰(내부 base·startP는 내보내지 않는다)
    getDrag: () => (drag ? { kind: drag.kind, guides: drag.guides, gaps: drag.gaps } : null),
  };
}
