// 숫자·길이 입력 한 칸을 상태에 반영한다(propsPanel.js에서 그대로 옮겼다 — 300줄 규칙).
// 규칙은 옮기기 전과 같다: 잠긴 제품은 건드리지 않고, 벽 부착 제품의 pos는 (wallId, t)의 결과이며,
// 여러 dispatch는 트랜잭션으로 묶어 undo 한 단계로 만든다.
import { activeFloor } from '../state/schema.js';
import { updateWall, updateRoom, setRoomWallThickness, updateFloor, setWallLength, setRoomWallHeight, updateWallProps, updateItem, resizeItem } from '../state/floorOps.js';
import { toast } from './toast.js';
import { wallLength } from '../geom/walls.js';

// "크기 비율 유지"는 체크박스를 읽는 쪽(propsPanel의 렌더·change)과 값을 쓰는 쪽(applyNumber)이
// 같은 칸을 봐야 한다: 모듈 스코프에 두고 접근자로 주고받는다.
let keepRatio = false;
export const setKeepRatio = on => { keepRatio = !!on; };
export const getKeepRatio = () => keepRatio;

// 같은 값인가. 화면에 보이던 값(반올림된 표시값)과 비교하므로 오차 한 점(1e-9)까지만 본다.
const same = (a, b) => Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) < 1e-9;

// 반영했으면 true, **값이 지금과 같아 아무것도 하지 않았으면 false**(§16.1).
// 빈 단계를 만들지 않는 것이 이 반환값의 뜻이다: store.dispatch는 structuredClone으로 늘 새
// 상태를 만들어 "바뀐 것이 없다"를 스스로 알지 못한다(감사 §41).
export function applyNumber(store, sel, name, v) {
  const f = activeFloor(store.get());
  if (!sel) {
    if (name === 'floorHeight') {
      if (same(f.height, v)) return false;
      store.dispatch(d => { activeFloor(d).height = v; });
      return true;
    }
    if (name === 'slab') {
      if (same(f.slab ?? 0, v)) return false;
      updateFloor(store, store.get().activeFloor ?? 0, { slab: v });
      return true;
    }
    return false;
  }
  if (sel.type === 'item') {
    const it = f.items.find(x => x.id === sel.id); if (!it) return false;
    if (it.locked) { toast('잠긴 제품은 편집할 수 없습니다'); return false; }              // 잠금 = 이동·회전·크기 불가
    if ((name === 'posX' || name === 'posY') && it.attach === 'wall' && it.wallId) return false; // 벽 부착 제품의 pos는 (wallId, t)의 결과다
    if (name === 'w' || name === 'd' || name === 'h') {
      const i = { w: 0, d: 1, h: 2 }[name];
      if (same(it.size[i], v)) return false;
      const size = [...it.size];
      if (keepRatio) { const k = v / size[i]; size[0] = Math.min(5000, Math.max(10, size[0] * k)); size[1] = Math.min(5000, Math.max(10, size[1] * k)); size[2] = Math.min(5000, Math.max(10, size[2] * k)); }
      size[i] = v;
      resizeItem(store, sel.id, size.map(x => Math.round(x)));
      return true;
    }
    if (name === 'posX') { if (same(it.pos[0], v)) return false; updateItem(store, sel.id, { pos: [v, it.pos[1]] }); return true; }
    if (name === 'posY') { if (same(it.pos[1], v)) return false; updateItem(store, sel.id, { pos: [it.pos[0], v] }); return true; }
    if (name === 'rot' && it.attach === 'wall' && it.wallId) return false; // 벽 부착 제품은 벽 방향에 고정(명세 8.5)
    if (same(it[name], v)) return false;
    updateItem(store, sel.id, { [name]: v });   // z, rot
    return true;
  }
  if (sel.type === 'wall') {
    const w = f.walls.find(x => x.id === sel.id); if (!w) return false;
    if (name === 'wallLength') {
      if (same(Math.round(wallLength(w)), v)) return false;   // 화면이 보여 준 값과 비교한다(길이는 float다)
      setWallLength(store, sel.id, v);
      return true;
    }
    if (same(w[name], v)) return false;
    if (name === 'height') updateWallProps(store, sel.id, { height: v }); // 기하 불변 → reroom 없음
    else updateWall(store, sel.id, { [name]: v });                        // 두께는 방 면적을 바꾼다
    return true;
  }
  // 여러 dispatch를 한 undo 단계로 묶는다: 안쪽 updateWall은 { record: false }를 넘겨야 한다.
  if (sel.type === 'multi' && sel.kind === 'wall') {
    const targets = f.walls.filter(w => sel.ids.includes(w.id) && !same(w[name], v));
    if (!targets.length) return false;
    store.beginTransaction();
    for (const w of targets) updateWall(store, w.id, { [name]: v }, { record: false });
    store.endTransaction();
    return true;
  }
  if (sel.type === 'room') {
    const r = f.rooms.find(x => x.id === sel.id); if (!r) return false;
    if (name === 'wallThickness') {
      const walls = f.walls.filter(w => r.wallIds.includes(w.id));
      if (walls.length && walls.every(w => same(w.thickness, v))) return false;
      setRoomWallThickness(store, sel.id, v);
      return true;
    }
    if (same(r[name], v)) return false;
    // 방 높이 변경이 "공간 높이 맞추기"로 벽 높이까지 바꿀 수 있으므로 두 dispatch를 묶는다.
    store.beginTransaction();
    updateRoom(store, sel.id, { [name]: v }, { record: false });
    const room = activeFloor(store.get()).rooms.find(x => x.id === sel.id);
    if (name === 'height' && room?.matchWallHeight) setRoomWallHeight(store, sel.id, v, { record: false }); // "공간 높이 맞추기"
    store.endTransaction();
    return true;
  }
  return false;
}
