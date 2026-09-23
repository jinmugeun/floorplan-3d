import { activeFloor } from '../../state/schema.js';
import { addWalls } from '../../state/floorOps.js';
import { rectWalls, endpoints } from '../../geom/walls.js';
import { snapPoint, tolMm } from '../../geom/snap.js';
import { drawSnapMark } from '../snapMarks.js';
import { fmtLen, parseLen, typedChar } from '../../util/units.js';

export const ROOM_TOOL_DEFAULTS = { thickness: 200, snap: true };

// opts를 넘기면 그 객체를 그대로 쓰고 tool.opts로 돌려준다(도구를 다시 켜도 옵션 바의 편집이 유지되도록).
export function createRoomTool({ store, view = null, onDone = () => {}, opts: given = null }) {
  const opts = given ?? { ...ROOM_TOOL_DEFAULTS };
  let start = null, cur = null, typed = { w: '', h: '', field: 'w' }, hit = null;
  const reset = () => { start = null; cur = null; typed = { w: '', h: '', field: 'w' }; hit = null; };
  // 허용치는 화면 8 px 한 규칙이다(§16.6). hit은 커서 옆 마커가 쓴다(감사 §42).
  const snap = p => {
    const f = activeFloor(store.get());
    const r = snapPoint(p, { points: endpoints(f.walls), guides: f.guides, walls: f.walls, snap: opts.snap, tol: tolMm(view?.camera?.scale) });
    hit = r.hit;
    return r.point;
  };
  const dims = () => {
    const units = store.get().units;
    const sx = Math.sign(cur[0] - start[0]) || 1, sy = Math.sign(cur[1] - start[1]) || 1;
    const w = typed.w ? (parseLen(typed.w, units) ?? 0) : Math.abs(cur[0] - start[0]);
    const h = typed.h ? (parseLen(typed.h, units) ?? 0) : Math.abs(cur[1] - start[1]);
    return { w, h, end: [start[0] + sx * w, start[1] + sy * h] };
  };
  const commit = end => {
    if (Math.abs(end[0] - start[0]) < 10 || Math.abs(end[1] - start[1]) < 10) return;
    addWalls(store, rectWalls(start, end, opts.thickness));
    reset(); onDone();
  };
  return {
    name: 'room', opts,
    // 단계 안내(§14.7). 배너는 shell의 renderBanner가 이 getter를 읽는다 — 도구는 상태만 바꾸고
    // view.requestRender()가 돌 때 onHint가 배너를 다시 그린다.
    get hint() { return start ? '맞은편 모서리를 클릭 (2/2)' : '첫 모서리를 클릭 (1/2)'; },
    onPointerDown(p) { const s = snap(p); if (!start) { start = s; cur = s; } else { cur = s; commit(typed.w || typed.h ? dims().end : s); } },
    onPointerMove(p) { cur = snap(p); },   // 첫 모서리 단계에서도 마커가 보이도록 start 가드를 두지 않는다(리뷰 I-2)
    onPointerUp() {},
    onKey(ev) {
      // 그리던 사각형이 있을 때만 Esc를 소비한다. 없으면 앱이 선택 도구로 돌아가게 둔다.
      if (ev.key === 'Escape') { const had = !!start; reset(); return had; }
      if (!start) return false;
      if (typedChar(store.get().units).test(ev.key)) { typed[typed.field] += ev.key; return true; }
      if (ev.key === 'Backspace') { typed[typed.field] = typed[typed.field].slice(0, -1); return true; }
      if (ev.key === 'Tab') { ev.preventDefault(); typed.field = typed.field === 'w' ? 'h' : 'w'; return true; }
      if (ev.key === 'Enter') { commit(dims().end); return true; }
      return false;
    },
    getPreview() { if (!start) return null; const d = dims(); return { start, end: d.end, w: d.w, h: d.h, typed: { ...typed } }; },
    getSnap() { return cur && hit ? { point: cur, hit } : null; },
    draw(ctx, view) {
      // 1단계(첫 모서리)에는 미리보기가 없어 아래에서 조기 반환한다 — 마커는 그 전에 한 번 그린다(리뷰 I-2).
      const pv = this.getPreview();
      if (!pv) { drawSnapMark(ctx, view, this.getSnap()); return; }
      const [x0, y0] = pv.start, [x1, y1] = pv.end;
      view.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], 'rgba(31,95,208,0.10)', view.COLORS.wallSel, 2);
      const wLabel = `${fmtLen(pv.w, view.units ?? 'mm')}${pv.typed.field === 'w' ? '|' : ''}`, hLabel = `${fmtLen(pv.h, view.units ?? 'mm')}${pv.typed.field === 'h' ? '|' : ''}`;
      view.label(wLabel, [(x0 + x1) / 2, y0], { bg: '#fff', color: view.COLORS.dim });
      view.label(hLabel, [x1, (y0 + y1) / 2], { bg: '#fff', color: view.COLORS.dim });
      drawSnapMark(ctx, view, this.getSnap());
    },
    cancel() { reset(); },
  };
}
