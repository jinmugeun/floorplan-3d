// 가져온 도면의 "끊긴 끝점" 마커(§18.6). **view2d.js는 한 줄도 고치지 않는다** —
// createView2D의 기존 overlay(ctx, api) 훅에 이 함수를 끼운다. ui.subscribe(requestRender)가
// 이미 걸려 있어 ui.set 한 번이면 다시 그려진다.
import { activeFloor } from '../state/schema.js';

export const OPEN_END_COLOR = '#dc2626';
export const OPEN_END_PX = 9;

// index는 배너의 [보기]를 누른 횟수다(ui/는 뷰를 부를 수 없으므로 배너는 수를 올리기만 한다).
// 여기서 그 변화를 보고 카메라를 옮긴다 — 화면에서 보이는 결과는 §18.6의 `centerOn(pts[index++ % n])`과 같다.
export function createOpenEnds(ui, { centerOn = () => {}, store = null } = {}) {
  let last = 0;
  const unsubUi = ui.subscribe(s => {
    const oe = s.openEnds;
    if (!oe?.pts?.length) { last = 0; return; }
    const i = oe.index ?? 0;
    if (i === last) return;
    last = i;
    if (i > 0) centerOn(oe.pts[(i - 1) % oe.pts.length]);
  });
  // 벽을 한 번이라도 고치면 이 안내의 숫자는 낡는다 — 거짓말이 되기 전에 지운다.
  // 화면 상태라 지우는 데 되돌리기 단계가 들지 않는다.
  let walls = store ? activeFloor(store.get())?.walls : null;
  const unsubStore = store ? store.subscribe(s => {
    const next = activeFloor(s)?.walls;
    if (next === walls) return;
    walls = next;
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
  return { overlay, destroy() { unsubUi(); unsubStore(); } };
}
