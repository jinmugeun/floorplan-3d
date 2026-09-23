import { activeFloor, uid } from '../../state/schema.js';
import { addMeasure, deleteMeasure } from '../../state/floorOps.js';
import { endpoints, distToSegment } from '../../geom/walls.js';
import { snapPoint, tolMm } from '../../geom/snap.js';
import { drawSnapMark } from '../snapMarks.js';
import { dist } from '../../geom/vec.js';
import { fmtLen } from '../../util/units.js';

export const MEASURE_TOOL_DEFAULTS = { snap: true };

export function createMeasureTool({ store, opts: given = null, view = null }) {
  const opts = given ?? { ...MEASURE_TOOL_DEFAULTS };
  // 허용치는 geom/snap.js 한 곳이다(§16.6): 이 도구가 쓰던 화면 기준이 이제 여섯 도구의 규칙이다.
  const tol = () => tolMm(view?.camera?.scale);
  let a = null, b = null, cur = null, mark = null;
  const snap = p => {
    const f = activeFloor(store.get());
    const r = snapPoint(p, { points: endpoints(f.walls), guides: f.guides, walls: f.walls, snap: opts.snap, tol: tol() });
    mark = r.hit ? { point: r.point, hit: r.hit } : null;
    return r.point;
  };
  return {
    name: 'measure', opts,
    get hint() { return a ? '끝점을 클릭 (2/2)' : '시작점을 클릭 (1/2) · [Esc] 종료'; },
    onPointerDown(p) {
      const f = activeFloor(store.get());
      if (!a) { // 새 측정 시작 전에 기존 측정선을 클릭하면 지운다
        const hit = f.measures.find(m => distToSegment(p, m.a, m.b) <= tol());
        if (hit) { deleteMeasure(store, hit.id); return; }
      }
      const s = snap(p);
      if (!a || b) { a = s; b = null; return; }
      b = s;
      addMeasure(store, { id: uid('m'), a, b }); // 도구를 떠나도 남는다(보기 옵션 "측정선"으로 표시/숨김)
      a = b = null; // 다음 클릭은 새 측정이다(기존 측정선 위를 누르면 지우기로 이어진다)
    },
    onPointerMove(p) { cur = snap(p); }, onPointerUp() {},
    onKey(ev) { if (ev.key === 'Escape') { const had = !!a; a = b = null; return had; } return false; },
    getSnap() { return mark; },
    draw(ctx, v) {
      const end = b ?? cur;
      if (!a || !end) { drawSnapMark(ctx, v, mark); return; }
      drawSnapMark(ctx, v, mark);
      const s0 = v.toScreen(a), s1 = v.toScreen(end);
      ctx.strokeStyle = v.COLORS.guide; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke(); ctx.lineWidth = 1;
      v.label(fmtLen(dist(a, end), v.units, { unit: true }), [(a[0] + end[0]) / 2, (a[1] + end[1]) / 2], { bg: '#fff', color: v.COLORS.dim });
    },
    cancel() { a = b = cur = null; mark = null; },
  };
}
