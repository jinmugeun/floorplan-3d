// 기둥·개구부 전용 배치 도구(§13.2). 라이브러리 타일을 거치지 않고 레일 버튼·단축키(R/C/O)로 바로
// 켜지고, 오늘의집처럼 **클릭마다 하나씩 놓으면서 도구가 켜진 채로 남는다**([Esc]로 종료).
// 제품은 카탈로그의 column-square / column-round / opening-pass를 옵션 크기로 만든다.
// 2D 심벌·3D 형상은 기존 것 그대로다(제품이 같으므로 바뀌는 것이 없다).
// view는 도구 인터페이스를 맞추기 위해 받는다(다시 그리기는 view2d가 한다).
import { activeFloor, createItem } from '../../state/schema.js';
import { addItem } from '../../state/floorOps.js';
import { snapItemPos, nearestWallPlacement, WALL_ATTACH_DIST } from '../../geom/items.js';
import { productById } from '../../products/catalog.js';
import { drawGhost } from './placeTool.js';

export const STRUCT_KINDS = ['column-square', 'column-round', 'opening'];
export const STRUCT_PRODUCT = { 'column-square': 'column-square', 'column-round': 'column-round', opening: 'opening-pass' };
export const STRUCT_LABELS = { 'column-square': '사각 기둥', 'column-round': '원형 기둥', opening: '개구부' };

// 옵션 기본값: 기둥 400 × 400 × 층고(원형은 지름 w 하나), 개구부 900 × 2100 · 바닥에서 0.
// 층고는 도구를 처음 켤 때의 활성 층에서 읽는다(층 높이를 바꾼 도면에서 천장까지 닿는 기둥이 되게).
export function structDefaults(kind, height = 2300) {
  const h = Math.max(10, Math.round(Number(height) || 2300));
  if (kind === 'column-round') return { w: 400, h };
  if (kind === 'opening') return { w: 900, h: 2100, sill: 0 };
  return { w: 400, d: 400, h };
}

const int = (v, def) => Math.max(10, Math.round(Number(v) || def));

export function createStructTool({ store, ui, view, kind = 'column-square', opts: given = null, onDone = () => {} }) {
  const k = STRUCT_KINDS.includes(kind) ? kind : 'column-square';
  const floor = () => activeFloor(store.get());
  const opts = given ?? structDefaults(k, floor().height);
  const product = () => productById(STRUCT_PRODUCT[k]);
  let ghost = ghostAt([0, 0], false);

  // 옵션 → 아이템 크기. 원형 기둥은 w가 지름이라 가로·세로가 같고, 개구부의 깊이는 제품 값(40 mm)이다.
  function sizeOf(p) {
    const w = int(opts.w, 400), h = int(opts.h, 2100);
    if (k === 'column-round') return [w, w, h];
    if (k === 'opening') return [w, p.size[1], h];
    return [w, int(opts.d, 400), h];
  }
  function ghostAt(pt, noSnap) {
    const f = floor(), p = product();
    const size = sizeOf(p);
    // 개구부의 밑선 높이는 sill이다: 벽 구멍은 (item.z, item.z + size[2])로 계산된다(geom/openings.js).
    const z = k === 'opening' ? Math.max(0, Math.round(Number(opts.sill) || 0)) : 0;
    const item = createItem(p, { pos: [pt[0], pt[1]], size, z });
    if (k === 'opening') {
      const hit = nearestWallPlacement(f.walls, pt, size, WALL_ATTACH_DIST, { embed: true });
      if (!hit) return { item, guides: [] };
      return { item: { ...item, pos: [hit.pos[0], hit.pos[1]], rot: hit.rot, wallId: hit.wallId, t: hit.t, side: hit.side }, guides: [] };
    }
    if (noSnap) return { item, guides: [] };
    const s = snapItemPos(item, { walls: f.walls, items: f.items.filter(i => !i.hidden) });
    return { item: { ...item, pos: s.pos }, guides: s.guides };
  }

  return {
    name: k, opts, kind: k,
    hint: `${STRUCT_LABELS[k]}을(를) 놓을 위치를 클릭해주세요. 클릭할 때마다 하나씩 놓습니다. [Esc]를 누르면 종료됩니다.`,
    getGhost: () => ghost,
    onPointerMove(p, ev) { ghost = ghostAt(p, !!ev?.ctrlKey); },
    onPointerDown(p, ev) {
      ghost = ghostAt(p, !!ev?.ctrlKey);
      if (k === 'opening' && !ghost.item.wallId) return;   // 붙일 벽이 없으면 놓지 않는다
      // pos는 정수 mm로 반올림해 저장한다(placeTool과 같은 규칙). 사선 벽의 개구부는 중심이 벽 중심선에서 최대 0.7 mm 벗어나지만 구멍 자체는 t로 계산되므로 어긋나지 않는다.
      const item = { ...ghost.item, pos: [Math.round(ghost.item.pos[0]), Math.round(ghost.item.pos[1])] };
      addItem(store, item);
      ui.set({ selection: { type: 'item', id: item.id } });
      // 도구는 끄지 않는다 — 연속 배치가 이 도구의 요점이다(§13.2).
    },
    onPointerUp() {},
    onKey(ev) { if (ev.key === 'Escape') { onDone(); return true; } return false; },
    onHintClick() { onDone(); },
    onContextMenu() { onDone(); return null; },
    draw(ctx, v) { drawGhost(ctx, v, ghost); },
    cancel() {},
  };
}
