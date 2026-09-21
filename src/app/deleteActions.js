// 삭제 배선(삭제 도구 · 선택 삭제 · 삭제 키). main.js가 300줄을 넘지 않게 여기로 뺐고,
// "방을 지울 때만 확인을 받는다"는 규칙을 한 자리에 모았다(§12.5 — 전에는 main.js 두 곳에
// 같은 브라우저 확인창 문구가 따로 있었다).
import { activeFloor } from '../state/schema.js';
import { deleteWall, deleteWalls, deleteRoom, deleteItems } from '../state/floorOps.js';
import { deleteSelectedDuct } from '../view2d/tools/ductSelect.js';
import { hitWall } from '../geom/walls.js';
import { pointInPolygon } from '../geom/rooms.js';
import { confirmDialog, CONFIRM_ROOM_DELETE } from '../ui/confirmDialog.js';

export function createDeleteActions({ store, ui, view, toast = () => {}, setTool = () => {} }) {
  // 방 삭제는 벽까지 함께 사라지므로 늘 확인을 받는다. 대화상자가 열려 있는 동안 방이 사라질 수
  // 있어(undo·다른 경로) 확인 뒤에 다시 찾는다.
  async function removeRoom(roomId) {
    if (!(await confirmDialog(CONFIRM_ROOM_DELETE))) return false;
    if (!activeFloor(store.get()).rooms.some(r => r.id === roomId)) return false;
    deleteRoom(store, roomId);
    const s = ui.get().selection;
    if (s?.type === 'room' && s.id === roomId) ui.set({ selection: null });
    return true;
  }
  function deleteSelection() {
    const s = ui.get().selection;
    if (deleteSelectedDuct({ store, ui, toast })) return;           // 덕트 규칙은 계획 3의 한 함수가 정본이다
    if (s?.type === 'item') { deleteItems(store, [s.id]); ui.set({ selection: null }); return; }
    if (s?.type === 'multi' && s.kind === 'item') { deleteItems(store, s.ids); ui.set({ selection: null }); return; }
    if (s?.type === 'wall') { deleteWall(store, s.id); ui.set({ selection: null }); return; }
    if (s?.type === 'multi' && s.kind === 'wall') { deleteWalls(store, s.ids); ui.set({ selection: null }); return; }
    if (s?.type === 'room') removeRoom(s.id);                       // 확인은 비동기다(호출자는 기다리지 않는다)
  }
  function createDeleteTool() {
    return {
      name: 'delete', opts: {}, hint: '삭제할 벽을 클릭하세요. 방을 지우려면 방 안쪽 바닥을 클릭하세요.',
      onPointerDown(p) {
        const f = activeFloor(store.get());
        const w = hitWall(f.walls, p, 6 / view.camera.scale);
        if (w) { deleteWall(store, w.id); return; }
        const r = f.rooms.find(x => pointInPolygon(p, x.points));
        if (r) removeRoom(r.id);
      },
      onPointerMove() {}, onPointerUp() {}, onKey: () => false, draw() {}, cancel() {},
    };
  }
  const deleteOrTool = () => { if (ui.get().selection) deleteSelection(); else setTool('delete'); };
  return { createDeleteTool, deleteSelection, deleteOrTool, removeRoom };
}
