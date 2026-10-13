// 아이템 컨텍스트 메뉴가 부르는 단일 동작들(반전·숨김/잠금·제품 교체·붙여넣기).
// floorOps.js가 너무 길어져 여기로 나누고 floorOps.js에서 다시 내보낸다(순환 import는 실행 시점엔 문제 없다:
// 아래 함수들은 모두 호출될 때만 itemsOf/updateItems를 쓰고, 모듈 평가 시점엔 쓰지 않는다).
import { activeFloor } from './schema.js';
import { placeOnWall, isEmbed } from '../geom/items.js';
import { productById } from '../products/catalog.js';
import { itemsOf, movableItems, updateItems } from './floorOps.js';
import { reattach, seatCopies, pruneEquipRefs, userCopy } from './floorInternal.js';

export const sameProductIds = (floor, productId) => floor.items.filter(i => i.productId === productId).map(i => i.id);
// "같은 …선택"이 고를 아이템(2026-10-13 · 계획 14 Task D · 근거: 계획 13 최종 리뷰 F-11 — 사동 '도면 기구' 83개 · 신상A 50개를 하나씩 바꿔야 했다).
// 가져온 기구(dxfBlock)는 제품 + 이름이 같은 것만: '도면 기구' 상자는 이름(도면 블록 이름)마다 다른 물건이라 productId로 다 고르면 83개가
// 한꺼번에 엉뚱한 제품으로 바뀐다. 이름이 같으면(사동 식탁6인 61개) 한 번에 잡혀 기존 "제품 교체"(main.js replaceProductOf)가 전체에 든다.
// 손으로 놓은 아이템은 예전 그대로 같은 productId 전부다.
// 라벨 없는 가져온 기구(익명·쓰레기 이름 → name = 제품명)는 이름이 아무것도 말하지 않는다: 같은 블록(dxfBlock)끼리만 고른다(2026-10-13 · 리뷰 M-1 —
// "같은 이름"이 사동 '도면 기구' 28개 = 블록 20종 · 신상A 18개 = 15종을 한 묶음으로 잡았고 손으로 놓은 상자까지 끌려왔다. 블록별로는 가장 큰 묶음 4 · 6).
export function sameItemIds(floor, item) {
  if (!item) return [];
  if (!item.dxfBlock) return sameProductIds(floor, item.productId);
  const unlabeled = item.name === productById(item.productId)?.name;
  return floor.items.filter(i => i.productId === item.productId && (unlabeled ? i.dxfBlock === item.dxfBlock : i.name === item.name)).map(i => i.id);
}

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
    // dxfProduct 해제(2026-10-12 · 계획 13 최종 재리뷰 M-1): 사람이 제품을 고른 순간부터 그 제품 가격이다 — 같은 제품을 다시 고르거나
    // 다른 제품으로 갔다가 돌아와도. 남겨 두면 estimate.isDrawnItem이 영원히 0원으로 센다. dxfBlock(원 블록 이름)은 그대로 둔다.
    const patch = { productId: product.id, name: product.name, code: product.code, kind, size, attach: product.attach, color: product.color ?? it.color, z: product.zDefault ?? 0, dxfProduct: undefined };
    if (product.equip) patch.props = { ...product.equip };   // 설비를 다른 종류로 바꾸면 옛 종류의 props가 남지 않는다
    else if (kind !== 'equipment') patch.props = undefined;
    if (product.attach !== 'wall') patch.wallId = null;
    else {
      const w = it.wallId ? f.walls.find(x => x.id === it.wallId) : null;
      // 벽을 못 찾으면 부착을 푼다: pos만 남기고 wallId를 들고 있으면 "pos는 (wallId, t)의 결과"가 깨진다.
      if (w) { const r = placeOnWall(w, it.t, it.side, size, { embed: isEmbed({ kind }) }); patch.pos = [Math.round(r.pos[0]), Math.round(r.pos[1])]; patch.rot = r.rot; }
      else { patch.wallId = null; patch.t = 0; }
    }
    return { id: it.id, patch };
  });
  if (!patches.length) return store.get();
  // 설비를 설비가 아닌 제품으로(또는 후드를 다른 종류로) 바꾸면 그 설비를 가리키던 덕트 연결과
  // 조리기구의 상단 후드가 유령 참조로 남는다(§12.5). 교체와 정리를 한 트랜잭션으로 묶어
  // 되돌림은 한 단계로 둔다(안쪽 호출은 둘 다 { record: false }).
  if (!itemsOf(store.get(), ids).some(it => it.kind === 'equipment')) return updateItems(store, patches, opts);
  // 되돌릴 단계가 아닌 호출(opts.record === false)에서는 트랜잭션도 열지 않는다: endTransaction은
  // 상태가 바뀌었으면 무조건 히스토리에 한 단계를 쌓으므로(store.js의 closeTransaction) 여는 것만으로
  // "보기·UI 쓰기는 undo 단계를 만들지 않는다"는 전역 규칙이 깨진다.
  const record = opts.record !== false;
  if (record) store.beginTransaction();
  updateItems(store, patches, { ...opts, record: false });
  store.dispatch(d => { pruneEquipRefs(activeFloor(d)); }, { record: false });
  if (record) store.endTransaction();
  return store.get();
}

// 스냅샷은 `ui.clipboard`에 남아 있는 남의 객체다. 복제해서 넣는다(붙여넣기를 두 번 해도 서로 얽히지 않는다).
// 사본은 seatCopies를 지난다: 벽 부착 제품은 붙여넣은 자리의 벽에 다시 앉거나 wallId를 비운다(I-2).
// 사본은 사용자가 놓은 것이라 dxfProduct를 뗀다(userCopy — 2026-10-13 · 계획 14 Task D: 가져온 기구의 사본에 가격이 붙는다).
export function pasteItems(store, snapshots, { delta = [200, 200] } = {}) {
  const { walls, items } = activeFloor(store.get());
  const copies = seatCopies((snapshots ?? []).map(i => ({ ...userCopy(i), pos: [i.pos[0] + delta[0], i.pos[1] + delta[1]] })), { walls, items });
  if (!copies.length) return [];
  store.dispatch(d => { const f = activeFloor(d); f.items.push(...copies.map(c => structuredClone(c))); reattach(f); });
  return copies.map(c => c.id);
}
