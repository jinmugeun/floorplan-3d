// 되돌리기·다시 실행 배선(§17.7 · 감사 §53). main.js가 300줄 규칙 코앞이라 여기로 뺐다 — 계획 4의
// app/deleteActions.js, 계획 6의 app/fileActions.js와 같은 자리다. 배선이 모듈이 되면서
// 계획 8의 이월("main.js의 withFloorNote를 소스 문자열로 단정")이 진짜 단정으로 바뀐다.
import { crossFloorStep } from '../state/floorOps.js';
import { CROSS_FLOOR_UNDO, CROSS_FLOOR_REDO } from '../ui/messages.js';

export function createHistoryActions({ store, toast = () => {} }) {
  // 되돌리기: 스냅숏이 활성 층까지 되돌려 준다(변경이 일어난 순간의 층이 거기 적혀 있다).
  // 배선이 할 일은 "화면이 말없이 다른 층으로 넘어갔다"를 알리는 것뿐이다.
  const undoAction = () => {
    const prev = store.get();
    if (!store.undo()) return false;
    const { name } = crossFloorStep(prev, store.get());
    if (name) toast(CROSS_FLOOR_UNDO(name));
    return true;
  };
  // 다시 실행: 스냅숏의 activeFloor는 "되돌리기를 누른 순간 보던 층"이라 변경이 일어난 층과
  // 어긋난다(감사 §53). 데려갈 층은 **다시 실행한 뒤의 스냅숏**을 봐야 알 수 있으므로(future를
  // 미리 볼 방법이 없다) 스토어가 설치 직전에 부르는 콜백에서 한 번만 판정한다 — 스냅숏 설치와
  // 층 이동이 **알림 한 번**으로 끝나고(리뷰 I-2: 3D 씬을 두 번, 그것도 한 번은 곧 떠날 층으로
  // 짓지 않는다), 그 이동은 기록이 아니라서 되돌리기 단계도 다시 실행 스택도 건드리지 않는다.
  const redoAction = () => {
    const prev = store.get();
    let name = null;
    const activeFloor = next => { const s = crossFloorStep(prev, next); name = s.name; return s.index; };
    if (!store.redo({ activeFloor })) return false;
    if (name) toast(CROSS_FLOOR_REDO(name));
    return true;
  };
  return { undoAction, redoAction };
}
