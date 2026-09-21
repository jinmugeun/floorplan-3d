import { activeFloor } from '../../state/schema.js';
import { updateItems, movableItems, resizeItem } from '../../state/floorOps.js';
import { sub, add, dist } from '../../geom/vec.js';
import { pointInItem, itemAABB, snapItemPos, wallGaps, nearestWallPlacement, isEmbed, WALL_ATTACH_DIST, scaleFromHandle, rotateToPoint } from '../../geom/items.js';
import { itemVisible, itemHandles, drawOrder, HANDLE_HIT_PX } from '../items2d.js';
import { collidingIds } from '../../geom/collide.js';

// 아이템 드래그 한 묶음. selectTool은 "무엇을 잡았나"만 판단하고 나머지를 여기로 넘긴다.
// drag.kind: 'items'(이동) | 'scale'(크기 핸들, Task 9) | 'rotate'(회전 핸들, Task 9)
export function createItemDragger({ store, ui, view, toast = () => {} }) {
  const px = n => n / view.camera.scale;
  const floor = () => activeFloor(store.get());
  const flags = () => store.get().view?.v2 ?? {};
  let drag = null;

  // 위에 그린 아이템이 먼저 잡힌다: 그리는 순서(drawOrder)를 역순으로 돈다 — 천장 부착(후드·디퓨저)이
  // 조리기구 위에 그려지므로 클릭도 후드가 먼저 가져간다(§13.7).
  // 잠긴 아이템은 클릭으로 잡히지 않는다(레이어 패널에서만 고른다).
  function pick(p) {
    const fl = flags();
    const order = drawOrder(floor().items);
    for (let i = order.length - 1; i >= 0; i--) {
      const it = order[i];
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
    const onWall = item.attach === 'wall' && item.wallId; // 벽 부착 제품은 벽 방향에 고정된다(명세 8.5): 회전 핸들이 없다
    if (!onWall && dist(p, h.rotHandle) <= px(HANDLE_HIT_PX)) return { kind: 'rotate' };
    const index = h.handles.findIndex(q => dist(p, q) <= px(HANDLE_HIT_PX));
    return index >= 0 ? { kind: 'scale', index } : null;
  }

  // 잠긴 아이템은 드래그 대상에서 빠진다(그룹을 통해 선택에 들어와도 함께 끌려가지 않는다 → I-5).
  // 움직일 수 있는 것이 하나도 없으면 드래그를 열지 않는다(빈 트랜잭션도 열지 않는다).
  function start(kind, ids, p, extra = {}) {
    const base = movableItems(store.get(), ids).map(i => ({ ...i, pos: [...i.pos], size: [...i.size] }));
    if (!base.length) return null;
    drag = { kind, ids: base.map(i => i.id), startP: p, guides: [], gaps: null, moved: false, warned: false, ...extra, base };
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
        : { ...primary, pos: add(primary.pos, d), wallId: null, t: 0 }]; // 벽 범위를 벗어나면 부착을 푼다(3D 개구부가 옛 자리에 남지 않게)
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
    warn();
  }

  // 드래그당 한 번만 경고한다. 배치 자체는 막지 않는다.
  function warn() {
    if (drag.warned || flags().collision === false) return;
    const bad = collidingIds(floor().items);
    if (drag.ids.some(id => bad.has(id))) { drag.warned = true; toast('충돌이 발생중입니다'); }
  }

  function apply(p, ev) {
    if (!drag) return;
    // 핸들을 잡자마자 생기는 손떨림은 크기·각도를 바꾸지 않는다(1mm 데드존은 확대 배율에 따라 너무 작다).
    if (!drag.moved && drag.kind !== 'items' && dist(p, drag.startP) < px(2)) return;
    if (drag.kind === 'rotate') {
      const rot = rotateToPoint(drag.base[0], p, { snapDeg: ev?.ctrlKey ? 0 : 15 });
      drag.moved = true;
      updateItems(store, [{ id: drag.ids[0], patch: { rot } }], { record: false });
      return;
    }
    if (drag.kind === 'scale') {
      const r = scaleFromHandle(drag.base[0], drag.index, p, { keepRatio: !!ev?.shiftKey });
      drag.moved = true;
      const size = [Math.round(r.size[0]), Math.round(r.size[1]), r.size[2]];
      if (drag.base[0].attach === 'wall' && drag.base[0].wallId) resizeItem(store, drag.ids[0], size, { record: false }); // 벽 부착 제품은 새 크기로 벽에 다시 앉힌다
      else updateItems(store, [{ id: drag.ids[0], patch: { size, pos: [Math.round(r.pos[0]), Math.round(r.pos[1])] } }], { record: false });
      return;
    }
    if (drag.kind === 'items') move(p, ev);
    // Task 10이 move() 끝에 충돌 경고를 덧붙인다.
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
