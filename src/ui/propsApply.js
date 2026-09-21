// 숫자·길이 입력 한 칸을 상태에 반영한다(propsPanel.js에서 그대로 옮겼다 — 300줄 규칙).
// 규칙은 옮기기 전과 같다: 잠긴 제품은 건드리지 않고, 벽 부착 제품의 pos는 (wallId, t)의 결과이며,
// 여러 dispatch는 트랜잭션으로 묶어 undo 한 단계로 만든다.
import { activeFloor } from '../state/schema.js';
import { updateWall, updateRoom, setRoomWallThickness, updateFloor, setWallLength, setRoomWallHeight, updateWallProps, updateItem, resizeItem } from '../state/floorOps.js';
import { toast } from './toast.js';

// "크기 비율 유지"는 체크박스를 읽는 쪽(propsPanel의 렌더·change)과 값을 쓰는 쪽(applyNumber)이
// 같은 칸을 봐야 한다: 모듈 스코프에 두고 접근자로 주고받는다.
let keepRatio = false;
export const setKeepRatio = on => { keepRatio = !!on; };
export const getKeepRatio = () => keepRatio;

export function applyNumber(store, sel, name, v) {
  if (!sel) {
    if (name === 'floorHeight') store.dispatch(d => { activeFloor(d).height = v; });
    if (name === 'slab') updateFloor(store, store.get().activeFloor ?? 0, { slab: v });
    return;
  }
  if (sel.type === 'item') {
    const it = activeFloor(store.get()).items.find(x => x.id === sel.id); if (!it) return;
    if (it.locked) { toast('잠긴 제품은 편집할 수 없습니다'); return; }             // 잠금 = 이동·회전·크기 불가
    if ((name === 'posX' || name === 'posY') && it.attach === 'wall' && it.wallId) return; // 벽 부착 제품의 pos는 (wallId, t)의 결과다
    if (name === 'w' || name === 'd' || name === 'h') {
      const i = { w: 0, d: 1, h: 2 }[name];
      const size = [...it.size];
      if (keepRatio) { const k = v / size[i]; size[0] = Math.min(5000, Math.max(10, size[0] * k)); size[1] = Math.min(5000, Math.max(10, size[1] * k)); size[2] = Math.min(5000, Math.max(10, size[2] * k)); }
      size[i] = v;
      resizeItem(store, sel.id, size.map(x => Math.round(x)));
      return;
    }
    if (name === 'posX') updateItem(store, sel.id, { pos: [v, it.pos[1]] });
    else if (name === 'posY') updateItem(store, sel.id, { pos: [it.pos[0], v] });
    else if (name === 'rot' && it.attach === 'wall' && it.wallId) return; // 벽 부착 제품은 벽 방향에 고정(명세 8.5)
    else updateItem(store, sel.id, { [name]: v });   // z, rot
    return;
  }
  if (sel.type === 'wall') {
    if (name === 'wallLength') setWallLength(store, sel.id, v);
    else if (name === 'height') updateWallProps(store, sel.id, { height: v }); // 기하 불변 → reroom 없음
    else updateWall(store, sel.id, { [name]: v });                            // 두께는 방 면적을 바꾼다
    return;
  }
  // 여러 dispatch를 한 undo 단계로 묶는다: 안쪽 updateWall은 { record: false }를 넘겨야 한다.
  if (sel.type === 'multi' && sel.kind === 'wall') {
    store.beginTransaction();
    for (const id of sel.ids) updateWall(store, id, { [name]: v }, { record: false });
    store.endTransaction();
    return;
  }
  if (sel.type === 'room') {
    if (name === 'wallThickness') { setRoomWallThickness(store, sel.id, v); return; }
    // 방 높이 변경이 "공간 높이 맞추기"로 벽 높이까지 바꿀 수 있으므로 두 dispatch를 묶는다.
    store.beginTransaction();
    updateRoom(store, sel.id, { [name]: v }, { record: false });
    const room = activeFloor(store.get()).rooms.find(x => x.id === sel.id);
    if (name === 'height' && room?.matchWallHeight) setRoomWallHeight(store, sel.id, v, { record: false }); // "공간 높이 맞추기"
    store.endTransaction();
  }
}
