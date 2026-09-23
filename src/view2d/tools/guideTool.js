import { activeFloor, uid } from '../../state/schema.js';
import { endpoints } from '../../geom/walls.js';
import { snapPoint, tolMm } from '../../geom/snap.js';
import { drawSnapMark } from '../snapMarks.js';
import { fmtLen, parseLen, typedChar } from '../../util/units.js';

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
  const units = () => store.get().units ?? 'mm';
  // 좌표 확정 한 곳(리뷰 I-3): 놓은 보조선이 있으면 그것을 옮기고, **없으면 그 자리에 새로 놓는다**.
  // 예전에는 놓기 전에도 칸이 떴는데 [Enter]가 아무 일도 하지 않는 죽은 입구였다(§16.5와 같은 결).
  // 겹치기 방지는 onPointerDown과 같은 규칙이다(리뷰 N-1): 같은 축·같은 좌표에 이미 있으면 그것을
  // 집기만 한다 — dispatch가 없으니 빈 되돌림 단계도 생기지 않는다.
  const setPos = pos => {
    const f = activeFloor(store.get());
    const same = f.guides.find(g => g.type === opts.direction && g.pos === pos);
    if (same) { lastId = same.id; return; }
    if (lastId && f.guides.some(g => g.id === lastId)) { store.dispatch(d => { const g = activeFloor(d).guides.find(x => x.id === lastId); if (g) g.pos = pos; }); return; }
    const g = { id: uid('g'), type: opts.direction, pos };
    store.dispatch(d => { activeFloor(d).guides.push(g); });
    lastId = g.id;
  };
  return {
    name: 'guide', opts,
    hint: '보조선을 놓을 자리를 클릭 · 다시 클릭하면 지웁니다 · [Esc] 종료',
    getSnap() { return mark; },
    // §16.7: 좌표 한 칸. 놓은 보조선이 있으면 그 좌표를, 없으면 커서 좌표를 보여 준다(그 자리에서
    // 확정하면 새 보조선이 놓인다 — setPos).
    // 값은 현재 단위로 말한다(리뷰 I-4): 라벨이 `좌표 (ft·in)`인데 값만 mm 정수였고, 그 라벨을 믿고
    // 넣은 `4'`는 Number()가 NaN을 내 조용히 사라졌다. 이제 ft·in 칸은 표기와 입력이 같은 말을 한다.
    dims() {
      const g = lastId ? activeFloor(store.get()).guides.find(x => x.id === lastId) : null;
      const at = g ? g.pos : cursor?.[axis()];
      if (!Number.isFinite(at)) return null;
      const mm = Math.round(at);
      return { fields: [{ key: 'pos', text: typed !== '' ? typed : fmtLen(mm, units()), mm, active: true }] };
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
      const pos = Math.round(opts.direction === 'v' ? p[0] : p[1]);
      // 스냅이 이미 있는 보조선 위로 붙었으면 겹쳐 놓지 않는다(리뷰 N-1 — setPos가 그 판정을 갖는다):
      // 화면은 그대로인데 되돌림 단계만 쌓이고, 지우기·좌표 입력이 겹친 쪽만 건드려 고장처럼 보인다.
      // 그 보조선이 lastId로 잡히므로 이어지는 [숫자]+[Enter]가 그것을 옮긴다.
      lastId = null; setPos(pos); typed = '';   // lastId를 비워 "옮기기"가 아니라 "놓기"로 들어간다
    },
    onPointerMove(p) { snap(p); }, onPointerUp() {},
    onKey(ev) {
      if (ev.key === 'Escape') { typed = ''; lastId = null; return false; }
      // 타이핑할 수 있는 글자는 단위 규칙을 따른다(ft·in에서는 `'`·`"`도 글자다 — 리뷰 I-4).
      // 음수 좌표는 어느 단위에서나 있으므로 '-'는 따로 통과시킨다.
      if (ev.key === '-' || typedChar(units()).test(ev.key)) { typed += ev.key; return true; }
      if (ev.key === 'Backspace') { typed = typed.slice(0, -1); return true; }
      if (ev.key === 'Enter' && typed) {
        const v = parseLen(typed, units());
        typed = '';
        if (v === null || !Number.isFinite(v)) return true;   // 읽을 수 없는 입력은 버린다(칸은 모델 값으로 돌아온다)
        setPos(Math.round(v));
        return true;
      }
      return false;
    },
    draw(ctx, v) { if (typed) v.label(`${typed}|`, v.toWorld([ctx.canvas.clientWidth / 2, 40]), { bg: '#fff', color: v.COLORS.dim }); drawSnapMark(ctx, v, this.getSnap()); },
    cancel() { typed = ''; lastId = null; mark = null; },
  };
}
