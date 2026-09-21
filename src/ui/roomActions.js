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
import { toast as showToast } from './toast.js';
import { WALL_DELETE_RESULT } from './messages.js';

// toast를 받는 이유: 방 우클릭 메뉴(surfaceMenu.js)는 모듈의 토스트를 그대로 쓰고,
// app/deleteActions.js는 자기가 쥔 토스트를 넘긴다(테스트도 그것으로 문구를 확인한다).
export async function removeRoom(store, ui, roomId, toast = showToast) {
  if (!(await confirmDialog(CONFIRM_ROOM_DELETE))) return false;
  if (!activeFloor(store.get()).rooms.some(r => r.id === roomId)) return false;
  const r = deleteRoom(store, roomId);
  // 방이 사라진 것은 방금 확인창에서 본 일이라 그것만으로는 알리지 않는다. 확인창이 말해 주지 않는
  // 것은 "벽에 붙어 있던 제품도 함께 사라졌다"다(§15.6 · 감사 §28) — 벽 삭제와 같은 문구를 쓴다.
  // 줄어든 방 수는 그 문구 뒤에 붙는다(방 하나를 지워 옆 방까지 열렸을 때 K > 1이 된다).
  if (r.items > 0) toast(WALL_DELETE_RESULT(r.walls, r.items, r.rooms));
  const s = ui.get().selection;
  if (s?.type === 'room' && s.id === roomId) ui.set({ selection: null });
  return true;
}
