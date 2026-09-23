import { activeFloor, uid } from '../../state/schema.js';
import { endpoints } from '../../geom/walls.js';
import { snapPoint, tolMm } from '../../geom/snap.js';
import { drawSnapMark } from '../snapMarks.js';

export const GUIDE_TOOL_DEFAULTS = { direction: 'v' };

export function createGuideTool({ store, view, opts: given = null }) {
  const opts = given ?? { ...GUIDE_TOOL_DEFAULTS };
  let typed = '', lastId = null, mark = null, cursor = null;
  const px = n => n / view.camera.scale;
  const axis = () => (opts.direction === 'v' ? 0 : 1);   // 수직 보조선은 x만, 수평 보조선은 y만 쓴다
  // 보조선도 벽 끝점·다른 보조선에 물린다(§16.6: 여섯 도구가 같은 허용치와 같은 마커를 쓴다).
  // 벽이 없는 도면에서는 snapPoint가 점을 그대로 돌려주므로 예전 동작과 같다.
  const snap = p => {
    const f = activeFloor(store.get());
    const r = snapPoint(p, { points: endpoints(f.walls), guides: f.guides, walls: f.walls, snap: true, tol: tolMm(view.camera.scale) });
    // 마커는 자기 축이 실제로 움직였을 때만 보인다(리뷰 I-1): 수직 보조선이 수평 벽면에 물리면
    // y만 당겨지고 보조선 위치(x)는 그대로라, △를 띄우면 물리지 않은 것을 물렸다고 말하게 된다.
    const i = axis();
    mark = r.hit && r.point[i] !== p[i] ? { point: r.point, hit: r.hit } : null;
    cursor = r.point;
    return r.point;
  };
  return {
    name: 'guide', opts,
    hint: '보조선을 놓을 자리를 클릭 · 다시 클릭하면 지웁니다 · [Esc] 종료',
    getSnap() { return mark; },
    // §16.7: 좌표 한 칸. 놓은 보조선이 있으면 그 좌표를, 없으면 커서 좌표를 보여 준다.
    // 확정은 놓은 보조선에만 적용된다(그게 예전 [Enter]의 동작이다).
    dims() {
      const g = lastId ? activeFloor(store.get()).guides.find(x => x.id === lastId) : null;
      const at = g ? g.pos : cursor?.[axis()];
      if (!Number.isFinite(at)) return null;
      const mm = Math.round(at);
      return { fields: [{ key: 'pos', text: typed !== '' ? typed : String(mm), mm, active: true }] };
    },
    dimSig() { const d = this.dims(); return d ? `pos:${d.fields[0].text}:1` : ''; },
    setDim(key, text) { if (key !== 'pos') return false; typed = String(text ?? ''); return true; },
    focusDim() {},
    commitDims() { return this.onKey({ key: 'Enter', preventDefault() {} }); },
    onPointerDown(p0) {
      // 지우기는 스냅 **전** 원좌표로 판정한다(리뷰 C-1): 스냅이 먼저 붙으면 거리가 0이 되어 히트 영역이
      // 6 px에서 허용치(최대 확대에서 화면 40 px)로 커져, 보조선을 하나 더 놓으려던 클릭이 기존 것을 지운다.
      const f = activeFloor(store.get());
      const del = f.guides.find(g => (g.type === 'v' ? Math.abs(g.pos - p0[0]) : Math.abs(g.pos - p0[1])) <= px(6));
      if (del) { store.dispatch(d => { const fl = activeFloor(d); fl.guides = fl.guides.filter(g => g.id !== del.id); }); lastId = null; mark = null; return; }
      const p = snap(p0);   // 스냅은 새 보조선을 놓을 때만 쓴다
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
    draw(ctx, v) { if (typed) v.label(`${typed}|`, v.toWorld([ctx.canvas.clientWidth / 2, 40]), { bg: '#fff', color: v.COLORS.dim }); drawSnapMark(ctx, v, this.getSnap()); },
    cancel() { typed = ''; lastId = null; mark = null; },
  };
}
