// 삭제 배선(삭제 도구 · 선택 삭제 · 삭제 키). main.js가 300줄을 넘지 않게 여기로 뺐고,
// "방을 지울 때만 확인을 받는다"는 규칙을 한 자리에 모았다(§12.5 — 전에는 main.js 두 곳에
// 같은 브라우저 확인창 문구가 따로 있었다).
import { activeFloor } from '../state/schema.js';
import { deleteWall, deleteWalls, deleteItems } from '../state/floorOps.js';
import { deleteSelectedDuct } from '../view2d/tools/ductSelect.js';
import { hitWall } from '../geom/walls.js';
import { pointInPolygon } from '../geom/rooms.js';
import { removeRoom } from '../ui/roomActions.js';
import { WALL_DELETE_RESULT, ROOMS_GONE } from '../ui/messages.js';

// 방 삭제의 확인·재확인은 ui/roomActions.js의 removeRoom 한 곳이다(방 우클릭 메뉴도 그것을 쓴다 —
// ui/는 app/을 import하지 않으므로 공용 함수가 ui/에 산다). 여기서는 그것을 부르기만 한다:
// 다시 내보내면 같은 함수에 두 개의 import 경로가 생겨 "한 자리" 규칙이 흐려진다.
// 방 삭제의 결과 토스트도 removeRoom이 낸다(확인 뒤 한 번) — 그래서 여기서는 report를 부르지 않는다.

export function createDeleteActions({ store, ui, view, toast = () => {}, setTool = () => {} }) {
  // 벽 삭제 결과 한 곳(§15.6). 제품이 함께 사라졌으면 그것을, 제품은 없고 방만 줄었으면 방만
  // 알린다. 둘 다 없으면(벽만 사라짐) 화면에서 바로 보이므로 조용히 둔다.
  const report = ({ walls = 0, items = 0, rooms = 0 } = {}) => {
    if (!walls) return;
    if (items > 0) toast(WALL_DELETE_RESULT(walls, items, rooms));
    else if (rooms > 0) toast(ROOMS_GONE(rooms));
  };
  function deleteSelection() {
    const s = ui.get().selection;
    if (deleteSelectedDuct({ store, ui, toast })) return;           // 덕트 규칙은 계획 3의 한 함수가 정본이다
    if (s?.type === 'item') { deleteItems(store, [s.id]); ui.set({ selection: null }); return; }
    if (s?.type === 'multi' && s.kind === 'item') { deleteItems(store, s.ids); ui.set({ selection: null }); return; }
    if (s?.type === 'wall') { report(deleteWall(store, s.id)); ui.set({ selection: null }); return; }
    if (s?.type === 'multi' && s.kind === 'wall') { report(deleteWalls(store, s.ids)); ui.set({ selection: null }); return; }
    if (s?.type === 'room') removeRoom(store, ui, s.id, toast);     // 확인은 비동기다(호출자는 기다리지 않는다)
  }
  function createDeleteTool() {
    return {
      name: 'delete', opts: {}, hint: '삭제할 벽을 클릭하세요. 방을 지우려면 방 안쪽 바닥을 클릭하세요.',
      onPointerDown(p) {
        const f = activeFloor(store.get());
        const w = hitWall(f.walls, p, 6 / view.camera.scale);
        if (w) { report(deleteWall(store, w.id)); return; }
        const r = f.rooms.find(x => pointInPolygon(p, x.points));
        if (r) removeRoom(store, ui, r.id, toast);
      },
      onPointerMove() {}, onPointerUp() {}, onKey: () => false, draw() {}, cancel() {},
    };
  }
  const deleteOrTool = () => { if (ui.get().selection) deleteSelection(); else setTool('delete'); };
  // removeRoom은 팩토리를 거치지 않는다: 부르는 자리(main.js·surfaceMenu.js)가 store·ui를 이미 쥐고
  // 있어 감싼 것을 아무도 쓰지 않았다 — 죽은 표면을 남기지 않는다(필요하면 모듈에서 바로 가져다 쓴다).
  return { createDeleteTool, deleteSelection, deleteOrTool };
}
