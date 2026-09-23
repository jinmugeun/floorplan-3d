import { activeFloor, uid } from '../../state/schema.js';
import { endpoints } from '../../geom/walls.js';
import { snapPoint, tolMm } from '../../geom/snap.js';
import { drawSnapMark } from '../snapMarks.js';

export const GUIDE_TOOL_DEFAULTS = { direction: 'v' };

export function createGuideTool({ store, view, opts: given = null }) {
  const opts = given ?? { ...GUIDE_TOOL_DEFAULTS };
  let typed = '', lastId = null, mark = null;
  const px = n => n / view.camera.scale;
  // 보조선도 벽 끝점·다른 보조선에 물린다(§16.6: 여섯 도구가 같은 허용치와 같은 마커를 쓴다).
  // 벽이 없는 도면에서는 snapPoint가 점을 그대로 돌려주므로 예전 동작과 같다.
  const snap = p => {
    const f = activeFloor(store.get());
    const r = snapPoint(p, { points: endpoints(f.walls), guides: f.guides, walls: f.walls, snap: true, tol: tolMm(view?.camera?.scale) });
    mark = r.hit ? { point: r.point, hit: r.hit } : null;
    return r.point;
  };
  return {
    name: 'guide', opts,
    hint: '보조선을 놓을 자리를 클릭 · 다시 클릭하면 지웁니다 · [Esc] 종료',
    getSnap() { return mark; },
    onPointerDown(p0) {
      const p = snap(p0);
      const f = activeFloor(store.get());
      const hit = f.guides.find(g => (g.type === 'v' ? Math.abs(g.pos - p[0]) : Math.abs(g.pos - p[1])) <= px(6));
      if (hit) { store.dispatch(d => { const fl = activeFloor(d); fl.guides = fl.guides.filter(g => g.id !== hit.id); }); lastId = null; return; }
      const g = { id: uid('g'), type: opts.direction, pos: Math.round(opts.direction === 'v' ? p[0] : p[1]) };
      store.dispatch(d => { activeFloor(d).guides.push(g); }); lastId = g.id; typed = '';
    },
    onPointerMove(p) { snap(p); }, onPointerUp() {},
    onKey(ev) {
      if (ev.key === 'Escape') { typed = ''; lastId = null; return false; }
      if (/^[0-9-]$/.test(ev.key)) { typed += ev.key; return true; }
      if (ev.key === 'Backspace') { typed = typed.slice(0, -1); return true; }
      if (ev.key === 'Enter' && typed && lastId) { const pos = Number(typed); if (!Number.isFinite(pos)) { typed = ''; return true; } store.dispatch(d => { const g = activeFloor(d).guides.find(x => x.id === lastId); if (g) g.pos = pos; }); typed = ''; return true; }
      return false;
    },
    draw(ctx, v) { if (typed) v.label(`${typed}|`, v.toWorld([ctx.canvas.clientWidth / 2, 40]), { bg: '#fff', color: v.COLORS.dim }); drawSnapMark(ctx, v, mark); },
    cancel() { typed = ''; lastId = null; mark = null; },
  };
}
