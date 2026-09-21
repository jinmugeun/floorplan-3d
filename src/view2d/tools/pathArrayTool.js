// 경로 배열 복사의 경로를 캔버스에 그리는 도구(§13.1). 대화상자에서 좌표를 치는 대신 점을 찍는다.
// 스토어는 한 번도 건드리지 않는다: 점만 모아 onDone(points)로 넘기고, 사본은 호출자(arrangeActions)가
// arrayCopy로 만든다. 선택도 그대로 둔다 — 배열 복사의 대상이 선택이기 때문이다.
// ui·view는 도구 인터페이스를 맞추기 위해 받는다(다시 그리기는 view2d가 한다).
import { activeFloor } from '../../state/schema.js';
import { snapPoint } from '../../geom/snap.js';
import { dist } from '../../geom/vec.js';
import { fmtLen } from '../../util/units.js';
import { PATH_MIN_POINTS } from '../../ui/messages.js';

// 점 스냅 허용오차(§14.10 이월). snapPoint의 기본값 150 mm는 이 도구에서는 너무 넓었다:
// 가까운 두 점을 따로 찍을 수 없고, "마지막 점을 다시 클릭 = 완료"가 의도보다 자주 걸렸다.
export const PATH_SNAP_TOL = 50;

export function createPathArrayTool({ store, ui, view, ids = [], onDone = () => {}, toast = () => {} }) {
  const floor = () => activeFloor(store.get());
  let points = [], cursor = null, guides = [];
  const last = () => points[points.length - 1] ?? null;
  const reset = () => { points = []; cursor = null; guides = []; };

  // 직교 잠금은 [Shift]를 누르고 있을 때만이다(벽·덕트 도구처럼 옵션 바로 켜 두는 방식이 아니다 —
  // 이 도구에는 옵션 바가 없다). 점·보조선·벽 스냅은 늘 켜져 있다.
  const resolve = (p, ev) => snapPoint(p, {
    points, guides: floor().guides, walls: floor().walls,
    anchor: last(), ortho: !!ev?.shiftKey, snap: true, tol: PATH_SNAP_TOL,
  });

  function finish() {
    // 점이 하나뿐이면 도구를 끄지 않는다(계획 4·5 이월): 왜 아무 일도 없는지 알려 주고 계속 찍게 둔다.
    if (points.length < 2) { toast(PATH_MIN_POINTS); return; }
    const out = points.map(q => [q[0], q[1]]);
    reset();
    onDone(out);
  }

  return {
    name: 'pathArray', opts: {}, ids: [...ids],
    hint: '경로를 클릭해 그립니다. [Shift] 직교 잠금 · [Backspace] 한 점 되돌리기 · [Enter]·더블클릭 완료 · [Esc] 취소',
    onPointerDown(p, ev) {
      const r = resolve(p, ev);
      cursor = r.point; guides = r.guides;
      // 마지막 점을 다시 클릭하면 완료다(브라우저 더블클릭의 두 번째 pointerdown도 여기로 온다).
      // 실제 판정 거리는 이 도구의 점 스냅 허용오차(PATH_SNAP_TOL = 50 mm)다: 그 안을 클릭하면 cursor가 마지막
      // 점으로 붙어 거리가 0이 되므로, 아래 10 mm 비교는 스냅이 꺼진 경우를 위한 여유다.
      if (last() && dist(cursor, last()) < 10) { finish(); return; }
      points.push(cursor);
    },
    onPointerMove(p, ev) { const r = resolve(p, ev); cursor = r.point; guides = r.guides; },
    onPointerUp() {},
    onKey(ev) {
      if (ev.key === 'Escape') { reset(); onDone(null); return true; }
      if (ev.key === 'Enter') { finish(); return true; }
      if (ev.key === 'Backspace' && points.length) { points.pop(); return true; }
      return false;
    },
    onHintClick() { reset(); onDone(null); },
    onContextMenu() { reset(); onDone(null); return null; },
    getPreview() { return { points: points.map(q => [q[0], q[1]]), cursor, guides }; },
    draw(ctx, v) {
      const [cw, ch] = [ctx.canvas.clientWidth || ctx.canvas.width, ctx.canvas.clientHeight || ctx.canvas.height];
      for (const g of guides) {
        ctx.save(); ctx.strokeStyle = v.COLORS.guide; ctx.setLineDash([6, 4]); ctx.beginPath();
        if (g.type === 'v') { const x = Math.round(v.toScreen([g.x, 0])[0]) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, ch); }
        else { const y = Math.round(v.toScreen([0, g.y])[1]) + 0.5; ctx.moveTo(0, y); ctx.lineTo(cw, y); }
        ctx.stroke(); ctx.restore();
      }
      const chain = cursor && last() ? [...points, cursor] : [...points];
      ctx.save();
      ctx.strokeStyle = v.COLORS.wallSel; ctx.lineWidth = 2; ctx.setLineDash([10, 6]);
      ctx.beginPath();
      chain.forEach((q, i) => { const s = v.toScreen(q); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); });
      ctx.stroke();
      ctx.setLineDash([]);
      for (const q of chain) {
        const s = v.toScreen(q);
        ctx.beginPath(); ctx.arc(s[0], s[1], 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = v.COLORS.wallSel; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.restore();
      if (last() && cursor) {
        const mid = [(last()[0] + cursor[0]) / 2, (last()[1] + cursor[1]) / 2];
        v.label(fmtLen(dist(last(), cursor), v.units ?? 'mm'), mid, { bg: '#fff', color: v.COLORS.dim });
      }
    },
    cancel() { reset(); },
  };
}
