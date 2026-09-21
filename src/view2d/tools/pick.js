// 2D의 히트 순서는 여기 한 곳에만 있다(§14.6). 예전에는 좌클릭(selectTool.onPointerDown),
// 우클릭(selectTool.onContextMenu), 덕트(ductSelect.pick)가 각자 순서를 들고 있어서
// "클릭하면 디퓨저가, 우클릭하면 제품 메뉴가" 같은 어긋남이 생겼다.
// 순서: ① 고른 덕트의 꼭짓점 핸들 → ② 덕트 꼭짓점 → ③ 덕트 구간 → ④ 아이템(위에 그린 것 먼저)
//      → ⑤ 벽 → ⑥ 방. ①은 계획 3의 규칙이다(연결된 꼭짓점은 늘 설비 중심에 있어, 이 예외가 없으면
//      그려 둔 핸들·자동 연결 해제·"설비 연결 해제"에 캔버스에서 닿을 수 없다).
// §15.5의 정정: ②에서 **커서가 아이템 발자국 안이면 그 아이템에 연결된 꼭짓점은 건너뛴다** —
//      설비를 옮기면 꼭짓점이 따라오므로 설비 중심 클릭의 뜻은 "설비를 고른다"다(감사 §22).
//      건너뛴 꼭짓점을 끝점으로 갖는 구간도 **그 점 위에서만** 함께 건너뛴다(거리 0으로 다시
//      잡히는 것을 막는다). 연결되지 않은 꼭짓점과 구간 중앙은 여전히 아이템보다 앞선다.
import { activeFloor } from '../../state/schema.js';
import { hitDuct } from '../../geom/ducts.js';
import { hitWall } from '../../geom/walls.js';
import { pointInPolygon } from '../../geom/rooms.js';
import { pointInItem } from '../../geom/items.js';
import { dist } from '../../geom/vec.js';
import { drawOrder, itemVisible } from '../items2d.js';
import { ductVisible } from '../ducts2d.js';

// 히트 허용치는 종류마다 다르다(화면 px): 벽은 두께 밖 6 px, 아이템은 윤곽 밖 2 px,
// 덕트는 띠 반폭 또는 8 px, 고른 덕트의 꼭짓점 핸들은 벽 꼭짓점과 같은 8 px.
// 허용치의 유일한 자리다(§14.6): ductSelect.js에 있던 리터럴 px(8)·DUCT_HANDLE_HIT_PX는 지웠다.
export const PICK_TOL_PX = { wall: 6, item: 2, duct: 8, handle: 8 };

export function pickAt(store, ui, p, { scale = 1 } = {}) {
  const f = activeFloor(store.get());
  const flags = store.get().view?.v2 ?? {};
  const px = n => n / (scale || 1);
  const sel = ui.get().selection;
  const ducts = (f.ducts ?? []).filter(d => ductVisible(d, flags));
  if (sel?.type === 'duct') {
    const d = ducts.find(x => x.id === sel.id);
    let best = null;
    for (let i = 0; d && i < d.points.length; i++) {
      const q = dist(p, d.points[i]);
      if (q <= px(PICK_TOL_PX.handle) && (!best || q < best.q)) best = { q, vertex: i };
    }
    if (best) return { type: 'duct', ductId: sel.id, vertex: best.vertex, segment: null, t: null, handle: true };
  }
  // 커서 아래 아이템을 먼저 찾아 둔다(덕트 꼭짓점 규칙이 이것을 본다 — §15.5).
  const item = topItemAt(f, flags, p, px(PICK_TOL_PX.item));
  const skipVertex = item ? (d, i) => (d.connections ?? []).some(c => c.point === i && c.itemId === item.id) : null;
  const hd = hitDuct(ducts, p, px(PICK_TOL_PX.duct), { skipVertex });
  if (hd) return { type: 'duct', ductId: hd.ductId, vertex: hd.vertex ?? null, segment: hd.segment ?? null, t: hd.t ?? null, handle: false };
  if (item) return { type: 'item', item };
  const w = hitWall(f.walls, p, px(PICK_TOL_PX.wall));
  if (w) return { type: 'wall', wall: w };
  const r = (f.rooms ?? []).find(x => pointInPolygon(p, x.points));
  return r ? { type: 'room', room: r } : null;
}

// 위에 그린 아이템이 먼저 잡힌다(drawOrder 역순 = 천장 부착 먼저). 잠긴 아이템은 클릭으로
// 잡히지 않는다(레이어 패널에서만 고른다 — itemDrag.pick과 같은 규칙).
// 허용치는 mm다(호출자가 화면 px을 이미 환산해 넘긴다).
export function topItemAt(floor, flags = {}, p, tolMm = 0) {
  const order = drawOrder(floor?.items ?? []);
  for (let i = order.length - 1; i >= 0; i--) {
    const it = order[i];
    if (it.locked || !itemVisible(it, flags)) continue;
    if (pointInItem(p, it, tolMm)) return it;
  }
  return null;
}
