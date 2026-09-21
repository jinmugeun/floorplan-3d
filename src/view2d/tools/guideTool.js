import { activeFloor, uid } from '../../state/schema.js';

export const GUIDE_TOOL_DEFAULTS = { direction: 'v' };

export function createGuideTool({ store, view, opts: given = null }) {
  const opts = given ?? { ...GUIDE_TOOL_DEFAULTS };
  let typed = '', lastId = null;
  const px = n => n / view.camera.scale;
  return {
    name: 'guide', opts,
    hint: '보조선을 놓을 자리를 클릭 · 다시 클릭하면 지웁니다 · [Esc] 종료',
    onPointerDown(p) {
      const f = activeFloor(store.get());
      const hit = f.guides.find(g => (g.type === 'v' ? Math.abs(g.pos - p[0]) : Math.abs(g.pos - p[1])) <= px(6));
      if (hit) { store.dispatch(d => { const fl = activeFloor(d); fl.guides = fl.guides.filter(g => g.id !== hit.id); }); lastId = null; return; }
      const g = { id: uid('g'), type: opts.direction, pos: Math.round(opts.direction === 'v' ? p[0] : p[1]) };
      store.dispatch(d => { activeFloor(d).guides.push(g); }); lastId = g.id; typed = '';
    },
    onPointerMove() {}, onPointerUp() {},
    onKey(ev) {
      if (ev.key === 'Escape') { typed = ''; lastId = null; return false; }
      if (/^[0-9-]$/.test(ev.key)) { typed += ev.key; return true; }
      if (ev.key === 'Backspace') { typed = typed.slice(0, -1); return true; }
      if (ev.key === 'Enter' && typed && lastId) { const pos = Number(typed); if (!Number.isFinite(pos)) { typed = ''; return true; } store.dispatch(d => { const g = activeFloor(d).guides.find(x => x.id === lastId); if (g) g.pos = pos; }); typed = ''; return true; }
      return false;
    },
    draw(ctx, v) { if (typed) v.label(`${typed}|`, v.toWorld([ctx.canvas.clientWidth / 2, 40]), { bg: '#fff', color: v.COLORS.dim }); },
    cancel() { typed = ''; lastId = null; },
  };
}
