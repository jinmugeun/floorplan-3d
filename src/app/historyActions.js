// 되돌리기·다시 실행 배선(§17.7 · 감사 §53). main.js가 256줄이라 여기로 뺐다 — 계획 4의
// app/deleteActions.js, 계획 6의 app/fileActions.js와 같은 자리다. 배선이 모듈이 되면서
// 계획 8의 이월("main.js의 withFloorNote를 소스 문자열로 단정")이 진짜 단정으로 바뀐다.
import { crossFloorName, changedFloorIndex, setActiveFloor } from '../state/floorOps.js';
import { CROSS_FLOOR_UNDO, CROSS_FLOOR_REDO } from '../ui/messages.js';

export function createHistoryActions({ store, toast = () => {} }) {
  // 되돌리기: 스냅숏이 활성 층까지 되돌려 준다(변경이 일어난 순간의 층이 거기 적혀 있다).
  // 배선이 할 일은 "화면이 말없이 다른 층으로 넘어갔다"를 알리는 것뿐이다.
  const undoAction = () => {
    const prev = store.get();
    if (!store.undo()) return false;
    const name = crossFloorName(prev, store.get());
    if (name) toast(CROSS_FLOOR_UNDO(name));
    return true;
  };
  // 다시 실행: 스냅숏의 activeFloor는 "되돌리기를 누른 순간 보던 층"이라 변경이 일어난 층과
  // 어긋난다(감사 §53). 변경이 있던 층으로 활성 층을 옮긴다 — setActiveFloor는 { record: false }라
  // 되돌리기 스택에 단계를 더하지 않는다(그러지 않으면 다시 실행 한 번이 두 단계가 된다).
  const redoAction = () => {
    const prev = store.get();
    if (!store.redo()) return false;
    const next = store.get();
    const i = changedFloorIndex(prev, next);
    const name = crossFloorName(prev, next);
    if (i !== null && i !== (next.activeFloor ?? 0)) setActiveFloor(store, i);
    if (name) toast(CROSS_FLOOR_REDO(name));
    return true;
  };
  return { undoAction, redoAction };
}
