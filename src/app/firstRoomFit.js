// 첫 방 자동 fit 래치(§16.12 · 감사 §49 · 리뷰 I-1). 빈 프로젝트 기본 배율 0.056에서 처음 그린
// 3000 mm 벽은 168 px이고 치수 라벨이 11 px이라, 첫 방이 생기는 순간 한 번 화면을 맞춰 준다.
// "한 번"이 래치인 이유: 활성 층의 방 수만 보면 0 → 1이 될 때마다 다시 튄다 — 첫 방 undo → redo,
// 방 전체 삭제 후 재작도, 그리고 층 전환(빈 층을 더했다가 방이 있는 층으로 돌아오기)에서
// 사용자가 잡아 둔 확대·팬이 예고 없이 날아갔다.
// rearm()은 프로젝트를 갈아 끼우는 길(새로 만들기·불러오기·샘플·템플릿·복원)이 부른다: 그 길들은
// 스스로 view.fit()을 부르므로 래치만 새 프로젝트 기준으로 다시 잡는다 — 방이 있는 프로젝트를
// 불러오면 그대로 잠긴 채고(다시 맞출 일이 없다), 빈 프로젝트에서는 그 프로젝트의 첫 방을 기다린다.
import { activeFloor } from '../state/schema.js';

const hasRooms = s => (activeFloor(s)?.rooms?.length ?? 0) > 0;

export function createFirstRoomFit({ store, ui, view }) {
  let fitted = hasRooms(store.get());
  const unsub = store.subscribe(s => {
    if (fitted || !hasRooms(s)) return;
    fitted = true;
    view.fit();
    // 첫 방 유도도 여기서 끈다(리뷰 m-1): 플래그가 true로 남으면 방이 다시 0이 되는 순간
    // (새로 더한 빈 층)에 안내가 되살아난다. uistate는 프로젝트 스토어가 아니라 되돌림 이력이
    // 없다 — 화면 상태 쓰기는 기록되지 않는다({ record: false }와 같은 뜻이다).
    if (ui?.get?.().firstRoomHint) ui.set({ firstRoomHint: false });
  });
  return {
    rearm: () => { fitted = hasRooms(store.get()); },
    fitted: () => fitted,
    destroy: unsub,
  };
}
