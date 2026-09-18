// 아이템 컨텍스트 메뉴가 부르는 단일 동작들(반전·숨김/잠금·제품 교체·붙여넣기).
// floorOps.js가 너무 길어져 여기로 나누고 floorOps.js에서 다시 내보낸다(순환 import는 실행 시점엔 문제 없다:
// 아래 함수들은 모두 호출될 때만 itemsOf/updateItems를 쓰고, 모듈 평가 시점엔 쓰지 않는다).
import { activeFloor } from './schema.js';
import { placeOnWall, isEmbed } from '../geom/items.js';
import { itemsOf, movableItems, updateItems } from './floorOps.js';
import { reattach, seatCopies } from './floorInternal.js';

export const sameProductIds = (floor, productId) => floor.items.filter(i => i.productId === productId).map(i => i.id);

// 좌우(h)·상하(v) 반전. 하나면 심벌만 뒤집고, 여러 개면 선택 묶음의 중심을 기준으로 위치도 반사한다.
// 잠긴 아이템은 반전 대상에서 빠진다(위치가 바뀌는 동작이다 → I-5).
export function mirrorItems(store, ids, axis, opts = {}) {
  const items = movableItems(store.get(), ids);
  if (!items.length) return store.get();
  const a = axis === 'h' ? 0 : 1;
  const vals = items.map(i => i.pos[a]);
  const c = (Math.min(...vals) + Math.max(...vals)) / 2;
  const many = items.length > 1;
  return updateItems(store, items.map(it => {
    const patch = axis === 'h' ? { flipH: !it.flipH } : { flipV: !it.flipV };
    if (many) { const pos = [...it.pos]; pos[a] = 2 * c - it.pos[a]; patch.pos = pos; }
    return { id: it.id, patch };
  }), opts);
}

export function setItemFlag(store, ids, key, value = null, opts = {}) {
  const patches = itemsOf(store.get(), ids).map(it => ({ id: it.id, patch: { [key]: value === null ? !it[key] : !!value } }));
  return patches.length ? updateItems(store, patches, opts) : store.get();
}

// 제품 교체: 위치·각도·벽 정보를 지키고 제품 속성만 갈아 끼운다.
export function replaceProduct(store, ids, product, opts = {}) {
  const f = activeFloor(store.get());
  const patches = itemsOf(store.get(), ids).map(it => {
    const kind = product.kind ?? 'product';
    const size = [...product.size];
    const patch = { productId: product.id, name: product.name, code: product.code, kind, size, attach: product.attach, color: product.color ?? it.color, z: product.zDefault ?? 0 };
    if (product.attach !== 'wall') patch.wallId = null;
    else {
      const w = it.wallId ? f.walls.find(x => x.id === it.wallId) : null;
      // 벽을 못 찾으면 부착을 푼다: pos만 남기고 wallId를 들고 있으면 "pos는 (wallId, t)의 결과"가 깨진다.
      if (w) { const r = placeOnWall(w, it.t, it.side, size, { embed: isEmbed({ kind }) }); patch.pos = [Math.round(r.pos[0]), Math.round(r.pos[1])]; patch.rot = r.rot; }
      else { patch.wallId = null; patch.t = 0; }
    }
    return { id: it.id, patch };
  });
  return patches.length ? updateItems(store, patches, opts) : store.get();
}

// 스냅샷은 `ui.clipboard`에 남아 있는 남의 객체다. 복제해서 넣는다(붙여넣기를 두 번 해도 서로 얽히지 않는다).
// 사본은 seatCopies를 지난다: 벽 부착 제품은 붙여넣은 자리의 벽에 다시 앉거나 wallId를 비운다(I-2).
export function pasteItems(store, snapshots, { delta = [200, 200] } = {}) {
  const walls = activeFloor(store.get()).walls;
  const copies = seatCopies((snapshots ?? []).map(i => ({ ...structuredClone(i), pos: [i.pos[0] + delta[0], i.pos[1] + delta[1]] })), { walls });
  if (!copies.length) return [];
  store.dispatch(d => { const f = activeFloor(d); f.items.push(...copies.map(c => structuredClone(c))); reattach(f); });
  return copies.map(c => c.id);
}
