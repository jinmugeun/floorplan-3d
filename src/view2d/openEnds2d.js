// 가져온 도면의 "끊긴 끝점" 마커(§18.6). **view2d.js는 한 줄도 고치지 않는다** —
// createView2D의 기존 overlay(ctx, api) 훅에 이 함수를 끼운다. ui.subscribe(requestRender)가
// 이미 걸려 있어 ui.set 한 번이면 다시 그려진다.
import { activeFloor } from '../state/schema.js';

export const OPEN_END_COLOR = '#dc2626';
export const OPEN_END_PX = 9;

// 벽 기하 서명 — "이 안내가 낡았는가"를 정하는 값이다. 벽을 정의하는 필드만 본다(id·양 끝점·두께):
// 재질·색·regions가 달라졌다고 끊긴 끝점의 자리가 옮겨 가지는 않는다.
const wallSig = ws => (ws ?? []).map(w => `${w.id},${w.a[0]},${w.a[1]},${w.b[0]},${w.b[1]},${w.thickness}`).join(';');

// **호출 계약**(Task 14가 읽을 것):
// 1) 순서 — `ui.set({ openEnds })`는 반드시 `store.swap(project)` **뒤**에 한다. 이 모듈은 안내가
//    켜지는 순간의 벽 기하를 기준으로 잡으므로, swap보다 먼저 켜면 기준이 옛 프로젝트의 것이 되고
//    곧이어 오는 swap이 안내를 조용히 지운다(증상은 "가져왔는데 배너가 안 뜬다"로만 보인다).
// 2) destroy() — 만든 쪽(main.js)이 앱 정리 경로에서 부른다. 두 번 불러도 안전하다(두 번째는 무시).
// index는 배너의 [보기]를 누른 횟수다(ui/는 뷰를 부를 수 없으므로 배너는 수를 올리기만 한다).
// 여기서 그 변화를 보고 카메라를 옮긴다 — 화면에서 보이는 결과는 §18.6의 `centerOn(pts[index++ % n])`과 같다.
export function createOpenEnds(ui, { centerOn = () => {}, store = null } = {}) {
  let last = 0;
  // 안내가 뜬 순간의 기준: { floor, sig, ref }. floor는 그때의 활성 층 번호, sig는 그 층의 벽 기하,
  // ref는 마지막으로 "기하가 같다"고 확인한 walls 배열 참조다(빠른 길).
  let base = null;
  const baseline = () => {
    if (!store) return null;
    const s = store.get();
    const ws = activeFloor(s)?.walls;
    return { floor: s.activeFloor ?? 0, ref: ws, sig: wallSig(ws) };
  };
  const unsubUi = ui.subscribe(s => {
    const oe = s.openEnds;
    if (!oe?.pts?.length) { last = 0; base = null; return; }
    if (!base) base = baseline();   // 안내가 뜨는 순간(빈 상태 → 있는 상태)의 벽 기하를 기준으로 잡는다
    const i = oe.index ?? 0;
    if (i === last) return;
    last = i;
    if (i > 0) centerOn(oe.pts[(i - 1) % oe.pts.length]);
  });
  // 벽을 한 번이라도 고치면 이 안내의 숫자는 낡는다 — 거짓말이 되기 전에 지운다.
  // 화면 상태라 지우는 데 되돌리기 단계가 들지 않는다. 다만 store.dispatch는 structuredClone이라
  // **모든** 변경이 walls 참조를 갈아 치운다(리뷰 I-1) — 참조는 "안 바뀌었다"를 싸게 확인하는 길일
  // 뿐이고, 지울지 말지는 기준 층의 벽 기하 서명으로 정한다. 그래서 벽과 무관한 편집·{record:false}
  // 쓰기·층 왕복은 안내를 지우지 않고, 벽이 늘거나 줄거나 움직이거나 두께가 바뀌면(되돌리기·다시
  // 실행으로 그리 되어도) 지운다.
  const unsubStore = store ? store.subscribe(s => {
    if (!base) return;
    const ws = s.floors?.[base.floor]?.walls;
    if (ws === base.ref) return;        // 참조가 그대로면 기하도 그대로다
    base.ref = ws;                      // 복제본이라도 기하가 같으면 이 참조를 다음 빠른 길로 삼는다
    if (wallSig(ws) === base.sig) return;
    base = null;
    if (ui.get().openEnds) ui.set({ openEnds: null });
  }) : () => {};

  const overlay = (ctx, api) => {
    const oe = ui.get().openEnds;
    if (!oe?.pts?.length) return;
    const cur = oe.index ? (oe.index - 1) % oe.pts.length : -1;
    ctx.save();
    ctx.strokeStyle = OPEN_END_COLOR;
    for (let i = 0; i < oe.pts.length; i++) {
      const p = api.toScreen(oe.pts[i]);
      const r = i === cur ? OPEN_END_PX * 1.6 : OPEN_END_PX;
      ctx.lineWidth = i === cur ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(p[0] - r, p[1]); ctx.lineTo(p[0] + r, p[1]);
      ctx.moveTo(p[0], p[1] - r); ctx.lineTo(p[0], p[1] + r);
      ctx.stroke();
    }
    ctx.restore();
  };
  let dead = false;
  return { overlay, destroy() { if (dead) return; dead = true; unsubUi(); unsubStore(); base = null; } };
}
