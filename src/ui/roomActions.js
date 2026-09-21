// 방을 지우는 한 가지 경로. 벽까지 함께 사라지므로 늘 확인을 받는다(§12.5 — 전에는 main.js 두 곳에
// 같은 브라우저 확인창 문구가 따로 있었다). 대화상자가 열려 있는 동안 방이 사라질 수 있어
// (undo·다른 경로) 확인 뒤에 다시 찾는다.
//
// 이 함수는 방을 지우는 모든 자리(삭제 도구·선택 삭제·방 우클릭 메뉴)가 공유한다. 그 자리 하나가
// ui/surfaceMenu.js라서 app/deleteActions.js가 아니라 여기(ui/)에 둔다: 레이어 규칙은
// "ui/는 view2d/·view3d/·app/을 import하지 않는다"이고, app/은 반대로 ui/를 부를 수 있다
// (app/은 배선 층이다). deleteActions.js가 여기서 가져다 쓴다(다시 내보내지는 않는다 — 확인 경로를
// 한 자리로 두려면 import 자리가 하나여야 한다. deleteActions.js:11-13이 같은 이유를 적었다).
import { activeFloor } from '../state/schema.js';
import { deleteRoom } from '../state/floorOps.js';
import { confirmDialog, CONFIRM_ROOM_DELETE } from './confirmDialog.js';

export async function removeRoom(store, ui, roomId) {
  if (!(await confirmDialog(CONFIRM_ROOM_DELETE))) return false;
  if (!activeFloor(store.get()).rooms.some(r => r.id === roomId)) return false;
  deleteRoom(store, roomId);
  const s = ui.get().selection;
  if (s?.type === 'room' && s.id === roomId) ui.set({ selection: null });
  return true;
}
