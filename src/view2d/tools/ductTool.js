// 덕트 그리기(명세 §11.2 DT-01~03). 벽 도구와 같은 점 클릭 방식이고, 완료 전에는 상태를 건드리지 않는다
// (완료할 때 addDuct 한 번 = 되돌림 한 단계).
import { activeFloor } from '../../state/schema.js';
import { createDuct } from '../../state/ductSchema.js';
import { addDuct } from '../../state/ductOps.js';
import { snapToEquipment, segmentQuad, DUCT_SNAP_TOL } from '../../geom/ducts.js';
import { FLOW_COLORS } from '../../vent/equipment.js';
import { snapPoint, tolMm } from '../../geom/snap.js';
import { drawSnapMark } from '../snapMarks.js';
import { dist } from '../../geom/vec.js';
import { fmtLen } from '../../util/units.js';

export const DUCT_TOOL_DEFAULTS = { kind: 'exhaust', w: 500, h: 300, z: 2900, system: '', ortho: true };

export function createDuctTool({ store, ui, view, opts: given = null, onDone = () => {} }) {
  const opts = given ?? { ...DUCT_TOOL_DEFAULTS };
  // hit은 커서 옆 마커가 읽는 스냅 종류다(§16.6). snapped(설비 id)와는 다른 것이다 —
  // snapped는 노란 고리(설비에 붙는 중)를, hit은 ■△┆⋯⊾ 마커(무엇에 물렸나)를 그린다.
  let points = [], conns = [], cursor = null, guides = [], snapped = null, hit = null;
  const floor = () => activeFloor(store.get());
  const last = () => points[points.length - 1] ?? null;
  const reset = () => { points = []; conns = []; cursor = null; guides = []; snapped = null; hit = null; };

  // 설비 스냅이 먼저다(DT-02): 접속점에 붙으면 직교·점 스냅을 건너뛴다(설비 중심에 정확히 앉게).
  // 설비 스냅의 허용치(DUCT_SNAP_TOL 300 mm)는 접속점의 물리적 크기라 화면 배율과 무관하게 남는다.
  // 점·벽·보조선 스냅만 §16.6의 한 규칙(화면 8 px)을 쓴다. hit은 커서 옆 마커가 읽는다.
  function resolve(p) {
    const f = floor();
    const eq = snapToEquipment(f.items, p, DUCT_SNAP_TOL);
    if (eq) return { point: [...eq.pos], guides: [], itemId: eq.itemId, hit: 'point' };
    const r = snapPoint(p, { points, guides: f.guides, walls: f.walls, anchor: last(), ortho: opts.ortho, snap: true, tol: tolMm(view?.camera?.scale) });
    return { point: r.point, guides: r.guides, itemId: null, hit: r.hit };
  }

  function finish() {
    if (points.length < 2) return;
    const seg = { w: Math.round(opts.w), h: Math.round(opts.h), z: Math.round(opts.z) };
    const id = addDuct(store, createDuct({
      kind: opts.kind === 'supply' ? 'supply' : 'exhaust',
      system: String(opts.system ?? '').trim(),
      points: points.map(q => [Math.round(q[0]), Math.round(q[1])]),
      segments: points.slice(1).map(() => ({ ...seg })),
      connections: conns.map(c => ({ point: c.point, itemId: c.itemId })),
    }));
    reset();
    if (id) ui.set({ selection: { type: 'duct', id, segment: null, vertex: null } });
    onDone();
  }

  return {
    name: 'duct', opts,
    hint: '점을 차례로 클릭해 덕트를 그립니다. 설비 위를 클릭하면 연결됩니다. [Enter] 완료 · [Esc] 취소 (중심 높이 = 덕트 중심. 천장보다 h/2 아래로 두세요)',
    onPointerDown(p) {
      const r = resolve(p);
      cursor = r.point; guides = r.guides; snapped = r.itemId; hit = r.hit;
      // 마지막 점을 다시 클릭하면 완료다(브라우저 더블클릭도 두 번째 pointerdown이 여기로 온다).
      if (last() && dist(cursor, last()) < 10) { finish(); return; }
      if (r.itemId) conns.push({ point: points.length, itemId: r.itemId });
      points.push(cursor);
    },
    onPointerMove(p) { const r = resolve(p); cursor = r.point; guides = r.guides; snapped = r.itemId; hit = r.hit; },
    onPointerUp() {},
    onKey(ev) {
      if (ev.key === 'Escape') { const had = points.length > 0; reset(); if (had) onDone(); return had; }
      // 그릴 것이 없으면 Enter를 소비하지 않는다(createKeyHandler가 헛되게 preventDefault를 부르지 않게).
      if (ev.key === 'Enter') { const had = points.length >= 2; finish(); return had; }
      if (ev.key === 'Backspace' && points.length) {
        const i = points.length - 1;
        points.pop();
        conns = conns.filter(c => c.point !== i);
        return true;
      }
      return false;
    },
    onHintClick() { reset(); onDone(); },
    getPreview() { return { points: [...points], cursor, guides, snapped, conns: conns.map(c => ({ ...c })) }; },
    getSnap() { return cursor && hit ? { point: cursor, hit } : null; },
    draw(ctx, v) {
      const color = opts.kind === 'supply' ? FLOW_COLORS.supply : FLOW_COLORS.exhaust;
      const [cw, ch] = [ctx.canvas.clientWidth || ctx.canvas.width, ctx.canvas.clientHeight || ctx.canvas.height];
      for (const g of guides) {
        ctx.save(); ctx.strokeStyle = v.COLORS.guide; ctx.setLineDash([6, 4]); ctx.beginPath();
        if (g.type === 'v') { const x = v.toScreen([g.x, 0])[0]; ctx.moveTo(x, 0); ctx.lineTo(x, ch); }
        else { const y = v.toScreen([0, g.y])[1]; ctx.moveTo(0, y); ctx.lineTo(cw, y); }
        ctx.stroke(); ctx.restore();
      }
      const chain = cursor && last() ? [...points, cursor] : [...points];
      ctx.save();
      for (let i = 0; i < chain.length - 1; i++) {
        const quad = segmentQuad(chain[i], chain[i + 1], opts.w);
        if (!quad) continue;
        ctx.beginPath();
        quad.forEach((q, k) => { const s = v.toScreen(q); k ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); });
        ctx.closePath();
        ctx.globalAlpha = 0.35; ctx.fillStyle = color; ctx.fill();
        ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
      }
      for (const q of chain) {
        const s = v.toScreen(q);
        ctx.beginPath(); ctx.arc(s[0], s[1], 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      }
      if (snapped && cursor) {   // 설비에 붙는 중임을 노란 고리로 알린다
        const s = v.toScreen(cursor);
        ctx.beginPath(); ctx.arc(s[0], s[1], 10, 0, Math.PI * 2);
        ctx.strokeStyle = v.COLORS.guide; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.restore();
      if (last() && cursor) {
        const mid = [(last()[0] + cursor[0]) / 2, (last()[1] + cursor[1]) / 2];
        v.label(`${fmtLen(dist(last(), cursor), v.units ?? 'mm')} · ${Math.round(opts.w)}×${Math.round(opts.h)}`, mid, { bg: '#fff', color: v.COLORS.dim });
      }
      drawSnapMark(ctx, v, this.getSnap());
    },
    cancel() { reset(); },
  };
}
