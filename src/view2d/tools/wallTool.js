import { activeFloor } from '../../state/schema.js';
import { addWalls } from '../../state/floorOps.js';
import { makeWall, endpoints } from '../../geom/walls.js';
import { snapPoint, tolMm } from '../../geom/snap.js';
import { drawSnapMark } from '../snapMarks.js';
import { add, sub, mul, norm, perp, dist } from '../../geom/vec.js';
import { fmtLen, parseLen, typedChar } from '../../util/units.js';
import { TYPED_DIM_HINT } from '../../ui/messages.js';

export const WALL_TOOL_DEFAULTS = { reference: 'center', thickness: 200, snap: true, ortho: true };

// view는 스냅 허용치(화면 8 px → mm)에 쓴다(§16.6). 넘기지 않으면 예전 기본값 150 mm다.
export function createWallTool({ store, view = null, onDone = () => {}, opts: given = null }) {
  const opts = given ?? { ...WALL_TOOL_DEFAULTS };
  let points = [], cursor = null, guides = [], typed = '', hit = null;
  const reset = () => { points = []; cursor = null; guides = []; typed = ''; hit = null; };
  const last = () => points[points.length - 1] ?? null;
  const tol = () => tolMm(view?.camera?.scale);
  const snap = p => { const f = activeFloor(store.get()); return snapPoint(p, { points: endpoints(f.walls).concat(points), guides: f.guides, walls: f.walls, anchor: last(), ortho: opts.ortho, snap: opts.snap, tol: tol() }); };
  // 반환값은 "실제로 벽이 늘었다"다(최종 리뷰 I-3a): addWalls가 겹치는 벽을 버리면 dispatch도
  // 없으므로 상태 동일성으로 판정한다. 그래야 호출자가 헛전진(points.push)을 하지 않는다.
  const addSegment = (a, b) => {
    if (dist(a, b) < 10) return false;
    let s = a, e = b;
    if (opts.reference !== 'center') { const n = mul(perp(norm(sub(b, a))), (opts.reference === 'inner' ? 1 : -1) * opts.thickness / 2); s = add(a, n); e = add(b, n); }
    const before = store.get();
    addWalls(store, [makeWall({ a: s, b: e, thickness: opts.thickness })]);
    return store.get() !== before;
  };
  const finish = () => { const had = points.length > 0; reset(); if (had) onDone(); return had; };
  return {
    name: 'wall', opts,
    // 단계 안내(§14.7).
    get hint() { return last() ? `다음 점을 클릭 · ${TYPED_DIM_HINT} · [Enter] 완료 · [Esc] 취소` : '첫 점을 클릭하세요 (1/2)'; },
    onPointerDown(p) {
      const r = snap(p); cursor = r.point; guides = r.guides; hit = r.hit;
      // 고리 닫기 판정도 같은 허용치를 쓴다(§16.6: 확대하면 좁아진다 — 예전에는 고정 150 mm였다).
      if (points.length >= 2 && dist(cursor, points[0]) <= tol()) { addSegment(last(), points[0]); finish(); return; }
      if (last() && dist(cursor, last()) < 10) { finish(); return; }
      if (last()) addSegment(last(), cursor);
      points.push(cursor); typed = '';
    },
    onPointerMove(p) { const r = snap(p); cursor = r.point; guides = r.guides; hit = r.hit; },
    onPointerUp() {},
    onKey(ev) {
      if (ev.key === 'Escape') return finish(); // 그리던 벽이 없으면 소비하지 않는다
      if (!last()) return false;
      if (typedChar(store.get().units).test(ev.key)) { typed += ev.key; return true; }
      if (ev.key === 'Backspace') { typed = typed.slice(0, -1); return true; }
      if (ev.key === 'Enter') {
        if (typed) {
          const len = parseLen(typed, store.get().units);
          if (len != null && len > 0) { const d = norm(sub(cursor, last())); const e = add(last(), mul(d, len)); if (addSegment(last(), e)) points.push(e); typed = ''; }
          // 파싱 실패(null) 또는 0 이하면 Enter를 무시한다 — typed는 그대로 두고 사용자가 고칠 수 있게 한다.
        }
        else finish();
        return true;
      }
      return false;
    },
    getPreview() { return { points: [...points], cursor, guides, typed }; },
    getSnap() { return cursor && hit ? { point: cursor, hit } : null; },
    // §16.7: 캔버스의 보이지 않는 typed 버퍼가 **옵션 바 칸의 모델**이다. 두 입구(캔버스 숫자 키,
    // 옵션 바 칸)가 같은 버퍼를 쓰므로 확정 경로도 하나다(onKey의 [Enter]).
    dims() {
      if (!last() || !cursor) return null;
      const units = store.get().units ?? 'mm';
      const mm = Math.round(dist(last(), cursor));
      return { fields: [{ key: 'len', text: typed !== '' ? typed : fmtLen(mm, units), mm, active: true }] };
    },
    dimSig() { const d = this.dims(); return d ? d.fields.map(f => `${f.key}:${f.text}:1`).join('|') : ''; },
    setDim(key, text) { if (key !== 'len' || !last()) return false; typed = String(text ?? ''); return true; },
    focusDim() {},                                    // 칸이 하나뿐이라 옮길 자리가 없다
    // 리뷰 I-6: 손대지 않은 칸의 [Enter]는 **칸에 보이는 길이로 한 구간을 확정**한다(체인을 끝내지
    // 않는다). 배너가 "길이를 타이핑하고 [Enter]"라고 말하고 칸에 3000이 적혀 있는 화면에서, 같은
    // 키가 프리뷰 구간을 버리고 그리기를 끝내면 보이는 값과 결과가 어긋난다. 캔버스 [Enter]의
    // "완료"는 그대로다 — 이 경로는 옵션 바 칸에서만 온다. 보이는 값을 typed에 문자열로 싣지 않고
    // 프리뷰 구간을 그대로 놓는다: 스냅된 끝점과 ft·in 왕복 오차를 함께 피한다.
    commitDims() {
      if (typed !== '') return this.onKey({ key: 'Enter', preventDefault() {} });
      if (!last() || !cursor || !addSegment(last(), cursor)) return false;
      points.push(cursor);
      return true;
    },
    draw(ctx, view) {
      for (const g of guides) { const [w, h] = [ctx.canvas.clientWidth || ctx.canvas.width, ctx.canvas.clientHeight || ctx.canvas.height]; ctx.strokeStyle = view.COLORS.guide; ctx.setLineDash([6, 4]); ctx.beginPath(); if (g.type === 'v') { const x = view.toScreen([g.x, 0])[0]; ctx.moveTo(x, 0); ctx.lineTo(x, h); } else { const y = view.toScreen([0, g.y])[1]; ctx.moveTo(0, y); ctx.lineTo(w, y); } ctx.stroke(); ctx.setLineDash([]); }
      if (!last() || !cursor) { if (cursor) { const s = view.toScreen(cursor); ctx.beginPath(); ctx.arc(s[0], s[1], 5, 0, Math.PI * 2); ctx.strokeStyle = view.COLORS.wallSel; ctx.stroke(); drawSnapMark(ctx, view, this.getSnap()); } return; }
      const a = view.toScreen(last()), b = view.toScreen(cursor);
      ctx.strokeStyle = view.COLORS.wallSel; ctx.lineWidth = Math.max(2, opts.thickness * view.camera.scale); ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
      const mid = [(last()[0] + cursor[0]) / 2, (last()[1] + cursor[1]) / 2];
      view.label(typed ? `${typed}|` : fmtLen(dist(last(), cursor), view.units ?? 'mm'), mid, { bg: '#fff', color: view.COLORS.dim });
      drawSnapMark(ctx, view, this.getSnap());
    },
    cancel() { reset(); },
  };
}
