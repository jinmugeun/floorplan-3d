// 층 관리(추가·전환·이름·속성·삭제·면적). floorOps.js가 300줄 규칙을 넘어 여기로 나누고
// floorOps.js에서 다시 내보낸다(호출자는 계속 floorOps.js만 import한다).
// 공유 조각(reattach·seatCopies·copyRoomProps)은 floorInternal.js에서 가져온다: floorOps.js를 import하지
// 않으므로 순환 import가 없다.
import { createFloor, uid, activeFloor, defaultFloorName } from './schema.js';
import { normalizeWalls } from '../geom/normalize.js';
import { detectRooms } from '../geom/rooms.js';
import { wallLength } from '../geom/walls.js';
import { reattach, seatCopies, copyRoomProps, cloneProp } from './floorInternal.js';

// 기본 층 이름의 정본은 schema.js다(M-22): normalizeFloor도 같은 규칙을 쓴다.
export { defaultFloorName } from './schema.js';
export function addFloor(store, { name = null, copy = 'none' } = {}, opts) {
  return store.dispatch(d => {
    const base = activeFloor(d);
    const f = createFloor(name && name.trim() ? name.trim() : defaultFloorName(d.floors));
    f.height = base?.height ?? f.height;
    f.slab = base?.slab ?? 0;
    // 벽은 새 id를 받는다. 벽 부착 아이템이 옛 층의 벽을 가리키지 않도록 id 맵을 만들어 함께 옮긴다.
    const idMap = new Map();
    if (copy !== 'none' && base) {
      // matIn/matOut/regions는 객체라 그대로 옮기면 새 층이 원래 층과 같은 참조를 공유한다(I1).
      f.walls = base.walls.map(w => {
        const id = uid('w'); idMap.set(w.id, id);
        return { ...w, id, a: [...w.a], b: [...w.b], matIn: cloneProp(w.matIn), matOut: cloneProp(w.matOut), regions: cloneProp(w.regions) };
      });
      f.guides = base.guides.map(g => ({ ...g, id: uid('g') }));
    }
    if (copy === 'all' && base) {
      f.items = seatCopies(base.items, { idMap });
      // 아이템 사본은 새 id를 받는다: 덕트 연결도 새 id로 옮긴다(seatCopies는 순서를 지킨다).
      const itemMap = new Map(base.items.map((it, i) => [it.id, f.items[i]?.id ?? null]));
      // 조리기구가 가리키는 후드도 새 층의 사본을 가리킨다(옛 층의 설비를 가리키면 유령 참조다).
      f.items = f.items.map(it => (it.props?.hoodId ? { ...it, props: { ...it.props, hoodId: itemMap.get(it.props.hoodId) ?? null } } : it));
      f.ducts = structuredClone(base.ducts ?? []).map(d => ({
        ...d, id: uid('d'),
        connections: (d.connections ?? []).map(c => ({ ...c, itemId: itemMap.get(c.itemId) ?? null })).filter(c => c.itemId),
      }));
      f.measures = structuredClone(base.measures);
    }
    f.walls = normalizeWalls(f.walls);
    f.rooms = detectRooms(f.walls);
    reattach(f); // 새 벽 id로 옮긴 아이템의 pos·rot을 (wallId, t)에서 다시 만든다(3D 개구부가 생기게)
    if (copy !== 'none' && base) copyRoomProps(base.rooms, f.rooms);
    d.floors.push(f);
    d.activeFloor = d.floors.length - 1;
  }, opts);
}
export function setActiveFloor(store, index) {
  return store.dispatch(d => { if (Number.isInteger(index) && index >= 0 && index < d.floors.length) d.activeFloor = index; }, { record: false });
}
// 이름이 그대로면 dispatch하지 않는다(최종 리뷰 I-3b): 층 대화상자는 현재 이름을 미리 채우고
// 입력란을 전체 선택해 열므로 "층 이름 변경 → [변경]"만으로 빈 되돌림 단계가 쌓였다.
export function renameFloor(store, index, name, opts) {
  const next = String(name ?? '').trim();
  const cur = store.get().floors[index];
  if (!cur || !next || cur.name === next) return store.get();
  return store.dispatch(d => { const f = d.floors[index]; if (f) f.name = next; }, opts);
}
export function updateFloor(store, index, patch, opts) {
  return store.dispatch(d => { const f = d.floors[index]; if (f) Object.assign(f, patch); }, opts);
}
export function deleteFloor(store, index, opts) {
  return store.dispatch(d => {
    if (d.floors.length <= 1 || !d.floors[index]) return; // 마지막 층은 남긴다
    d.floors.splice(index, 1);
    // 활성 층보다 앞의 층을 지우면 활성 층은 한 칸 앞으로 당겨진다. 활성 층 자체를 지우면 범위 안으로 잘라 준다.
    d.activeFloor = index < d.activeFloor ? d.activeFloor - 1 : Math.min(d.activeFloor, d.floors.length - 1);
  }, opts);
}
// 실면적(net) = 방 폴리곤 면적 합. 실면적+내외벽(gross) = 거기에 벽 바닥면적을 더한 값. 단위 m².
export function totalArea(floor, areaMode = 'net') {
  const net = (floor.rooms ?? []).reduce((s, r) => s + (Number(r.area) || 0), 0);
  if (areaMode !== 'gross') return net;
  const walls = (floor.walls ?? []).reduce((s, w) => s + wallLength(w) * w.thickness, 0) / 1e6;
  return net + walls;
}

// 방 속성 목록(ROOM_PROPS)과 층 복사용 속성 이전(copyRoomProps)은 floorInternal.js가 정본이다.
// 여기서 다시 내보내기만 한다: 정의를 두 벌 두면 Task 2가 더한 floorMat·ceilingMat가 한쪽에만 남는다.
export { ROOM_PROPS, copyRoomProps } from './floorInternal.js';

// 되돌리기·다시 실행이 **실제로 달라진 층**을 찾는다(§17.7 · 감사 §53). 예전에는 "도착한 층"을
// 돌려주어 되돌리기에서만 맞았다: 다시 실행은 2층의 변경을 적용하면서 사용자를 1층으로 보내고
// 그 1층을 "변경이 일어난 층"이라고 불렀다.
// null인 자리는 둘이다. (1) 층 수가 바뀐 단계 — 층을 더하거나 지운 일 자체는 "다른 층의 변경"이
// 아니다(리뷰 I-1). (2) 사용자가 보던 층도, 도착할 층도 그 층이면 같은 층 안의 변경이라 알릴 것이
// 없다. 판정은 첫 번째로 달라진 층에서 끝낸다: 한 단계가 두 층을 함께 바꾸는 경로는 없다
// (층을 가로지르는 편집 액션이 없고, 층 복사는 층 수를 바꾼다).
// 판정 한 번으로 둘을 함께 돌려준다(리뷰 m-1: 배선이 같은 스캔을 두 번 하지 않는다).
//   index — 다시 실행이 데려갈 층(없으면 null) · name — 토스트가 부를 층 이름(없으면 null)
// 둘이 늘 같지는 않다: 층 내용이 하나도 안 달라졌는데 스냅숏이 화면만 옮기는 **프로젝트 수준
// 단계**(프로젝트 이름 변경 · 배경 도면 삽입·제거)에서는 데려갈 층이 없고(index null) 부를 이름만
// 있다 — 거기서는 §16.4의 옛 규칙(도착한 층)으로 돌아간다(리뷰 I-1). 그러지 않으면 "화면이 말없이
// 다른 층으로 넘어갔다"를 막던 보증이 그 경로에서만 사라진다(배경 도면은 이 앱의 주 워크플로다).
export function crossFloorStep(prev, next) {
  const none = { index: null, name: null };
  const a = prev?.floors ?? [], b = next?.floors ?? [];
  if (!a.length || a.length !== b.length) return none;
  const pa = prev.activeFloor ?? 0, na = next.activeFloor ?? 0;
  for (let i = 0; i < a.length; i++) {
    if (JSON.stringify(a[i]) === JSON.stringify(b[i])) continue;
    return pa === i && na === i ? none : { index: i, name: b[i]?.name ?? null };
  }
  return pa === na ? none : { index: null, name: b[na]?.name ?? null };
}
export function changedFloorIndex(prev, next) { return crossFloorStep(prev, next).index; }
export function crossFloorName(prev, next) { return crossFloorStep(prev, next).name; }
