import { activeFloor } from '../../state/schema.js';
import { addWalls } from '../../state/floorOps.js';
import { rectWalls, endpoints } from '../../geom/walls.js';
import { snapPoint, tolMm } from '../../geom/snap.js';
import { drawSnapMark } from '../snapMarks.js';
import { fmtLen, parseLen, typedChar } from '../../util/units.js';
import { TYPED_DIM_HINT } from '../../ui/messages.js';

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
  // 지역 계산의 이름은 measured다: 아래 도구 메서드 dims()(옵션 바의 칸 모델)와 겹치지 않게.
  const measured = () => {
    const units = store.get().units;
    const sx = Math.sign(cur[0] - start[0]) || 1, sy = Math.sign(cur[1] - start[1]) || 1;
    const w = typed.w ? (parseLen(typed.w, units) ?? 0) : Math.abs(cur[0] - start[0]);
    const h = typed.h ? (parseLen(typed.h, units) ?? 0) : Math.abs(cur[1] - start[1]);
    return { w, h, end: [start[0] + sx * w, start[1] + sy * h] };
  };
  // 돌려주는 값은 "확정했다"다(리뷰 M-2): 10 mm 미만 사각형에서 [Enter]가 소비되고 아무 일도
  // 일어나지 않던 자리다 — 이제 셸이 그 [Enter]를 도구의 onKey로 넘긴다(리뷰 I-2).
  // 실패하면 typed도 그대로 둔다(reset을 지나지 않는다): 칸에 친 글자가 말없이 사라지지 않는다.
  const commit = end => {
    if (Math.abs(end[0] - start[0]) < 10 || Math.abs(end[1] - start[1]) < 10) return false;
    addWalls(store, rectWalls(start, end, opts.thickness));
    reset(); onDone();
    return true;
  };
  const api = {
    name: 'room', opts,
    // 단계 안내(§14.7). 배너는 shell의 renderBanner가 이 getter를 읽는다 — 도구는 상태만 바꾸고
    // view.requestRender()가 돌 때 onHint가 배너를 다시 그린다.
    get hint() { return start ? `맞은편 모서리를 클릭 (2/2) · ${TYPED_DIM_HINT}` : '첫 모서리를 클릭 (1/2)'; },
    onPointerDown(p) { const s = snap(p); if (!start) { start = s; cur = s; } else { cur = s; commit(typed.w || typed.h ? measured().end : s); } },
    onPointerMove(p) { cur = snap(p); },   // 첫 모서리 단계에서도 마커가 보이도록 start 가드를 두지 않는다(리뷰 I-2)
    onPointerUp() {},
    onKey(ev) {
      // 그리던 사각형이 있을 때만 Esc를 소비한다. 없으면 앱이 선택 도구로 돌아가게 둔다.
      if (ev.key === 'Escape') { const had = !!start; reset(); return had; }
      if (!start) return false;
      if (typedChar(store.get().units).test(ev.key)) { typed[typed.field] += ev.key; return true; }
      if (ev.key === 'Backspace') { typed[typed.field] = typed[typed.field].slice(0, -1); return true; }
      if (ev.key === 'Tab') { ev.preventDefault(); typed.field = typed.field === 'w' ? 'h' : 'w'; return true; }
      // §17.8(3): 캔버스와 칸이 같은 확정을 쓴다(방 도구는 체인이 없어 확정이 곧 완료다).
      if (ev.key === 'Enter') return api.commitDims();
      return false;
    },
    getPreview() { if (!start) return null; const d = measured(); return { start, end: d.end, w: d.w, h: d.h, typed: { ...typed } }; },
    getSnap() { return cur && hit ? { point: cur, hit } : null; },
    // §16.7: W·H 두 칸. 활성 칸(typed.field)이 캔버스의 [Tab]과 옵션 바의 포커스에서 함께 움직인다.
    dims() {
      if (!start || !cur) return null;
      const units = store.get().units ?? 'mm';
      const d = measured();
      return {
        fields: [
          // typed는 "사람이 이 칸에 글자를 쳤다"다(리뷰 C-2): 손대지 않은 칸은 포커스가 있어도 실측을 따라간다.
          { key: 'w', text: typed.w !== '' ? typed.w : fmtLen(Math.round(d.w), units), mm: Math.round(d.w), active: typed.field === 'w', typed: typed.w !== '' },
          { key: 'h', text: typed.h !== '' ? typed.h : fmtLen(Math.round(d.h), units), mm: Math.round(d.h), active: typed.field === 'h', typed: typed.h !== '' },
        ],
      };
    },
    dimSig() { const d = this.dims(); return d ? d.fields.map(f => `${f.key}:${f.text}:${f.active ? 1 : 0}`).join('|') : ''; },
    setDim(key, text) { if ((key !== 'w' && key !== 'h') || !start) return false; typed[key] = String(text ?? ''); return true; },
    focusDim(key) { if (key === 'w' || key === 'h') typed.field = key; },
    commitDims() { if (!start) return false; return commit(measured().end); },
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
  return api;
}
