// 상대이동·배열 복사·그룹·정렬. floorOps.js가 이미 300줄을 넘어 여기로 나누고 floorOps.js에서 다시 내보낸다
// (순환 import는 실행 시점엔 문제 없다: 아래 함수들은 호출될 때만 floorOps.js의 함수를 쓰고, 모듈 평가 시점엔 쓰지 않는다).
import { uid, activeFloor } from './schema.js';
import { itemsOf, movableItems, updateItems, duplicateItems } from './floorOps.js';
import { reattach, seatCopies } from './floorInternal.js';
import { linearOffsets, circularPlacements, alignPatches } from '../geom/arrange.js';

// 그룹화(Ctrl+G): 2개 이상일 때만 만든다. 겹치는 기존 그룹은 지우고 새 그룹으로 대체한다(그룹 중첩 없음).
export function groupItems(store, ids) {
  if ((ids ?? []).length < 2) return store.get();
  const g = { id: uid('g'), itemIds: [...ids] };
  return store.dispatch(d => {
    const f = activeFloor(d);
    f.groups = [...(f.groups ?? []).filter(x => !x.itemIds.some(i => ids.includes(i))), g];
  });
}
// 그룹 해제(Ctrl+Shift+G): 골라낸 아이템이 속한 그룹을 통째로 없앤다.
export function ungroupItems(store, ids) {
  return store.dispatch(d => {
    const f = activeFloor(d);
    f.groups = (f.groups ?? []).filter(g => !g.itemIds.some(i => ids.includes(i)));
  });
}
// 정렬: axis 'v'는 위/중간/아래, 'h'는 왼/가운데/오른. AABB 기준으로 한 단계에 맞춘다.
// 잠긴 아이템은 기준(min·max)에도 들지 않고 움직이지도 않는다(I-5).
export function alignSelection(store, ids, axis, mode, opts = {}) {
  const patches = alignPatches(movableItems(store.get(), ids), axis, mode);
  return patches.length ? updateItems(store, patches, opts) : store.get();
}
// 상대이동(Alt+R). copy면 사본을 만들고 새 id를 돌려준다(duplicateItems 자체가 한 dispatch = 한 undo 단계다).
// 원본을 옮기는 경로는 잠긴 아이템을 건드리지 않는다(I-5).
export function relativeMove(store, ids, { dx = 0, dy = 0, copy = false } = {}) {
  if (copy) return duplicateItems(store, ids, { delta: [dx, dy] });
  const patches = movableItems(store.get(), ids).map(it => ({ id: it.id, patch: { pos: [it.pos[0] + dx, it.pos[1] + dy] } }));
  if (patches.length) updateItems(store, patches);
  return [...ids];
}
// 배열 복사(직선·원형·회전). 원본은 그대로 두고 사본만 만든다(한 dispatch = undo 한 단계).
// 사본은 seatCopies를 지난다: 벽 부착 제품은 사본 자리의 벽에 다시 앉거나 wallId를 비운다(I-2).
export function arrayCopy(store, ids, kind, params = {}) {
  const f = activeFloor(store.get());
  const src = itemsOf(store.get(), ids);
  if (!src.length) return [];
  const drafts = [];
  if (kind === 'linear') {
    for (const [dx, dy] of linearOffsets(params)) {
      for (const it of src) drafts.push({ ...structuredClone(it), pos: [it.pos[0] + dx, it.pos[1] + dy] });
    }
  } else {
    const xs = src.map(i => i.pos[0]), ys = src.map(i => i.pos[1]);
    const groupCenter = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    for (const it of src) {
      const center = kind === 'rotate' ? [...it.pos] : (params.center ?? groupCenter);
      for (const pl of circularPlacements(it, { ...params, center })) {
        drafts.push({ ...structuredClone(it), pos: [pl.pos[0], pl.pos[1]], rot: pl.rot });
      }
    }
  }
  const copies = seatCopies(drafts, { walls: f.walls });
  if (!copies.length) return [];
  store.dispatch(d => { const g = activeFloor(d); g.items.push(...copies.map(c => structuredClone(c))); reattach(g); });
  return copies.map(c => c.id);
}
