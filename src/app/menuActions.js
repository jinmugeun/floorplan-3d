// 선택한 대상의 컨텍스트 메뉴를 키보드로 연다(§15.3의 [Shift+F10]·[ContextMenu] 키).
// 마우스 우클릭은 캔버스가 좌표를 주지만 키보드에는 좌표가 없다: 선택의 월드 중심을 화면
// 좌표로 바꿔 같은 메뉴를 같은 자리에 띄운다. main.js가 길어지지 않게 배선을 여기로 뺐다
// (계획 4의 deleteActions·계획 5의 arrangeActions·계획 6의 fileActions와 같은 자리).
import { activeFloor } from '../state/schema.js';
import { centroid } from '../geom/rooms.js';
import { ductById } from '../state/ductOps.js';
import { lerp } from '../geom/vec.js';

// 선택의 월드 중심. 대상이 사라졌으면 null(메뉴를 열지 않는다).
export function selectionCenter(store, ui) {
  const s = ui.get().selection;
  if (!s) return null;
  const f = activeFloor(store.get());
  if (s.type === 'item') { const it = f.items.find(i => i.id === s.id); return it ? [it.pos[0], it.pos[1]] : null; }
  if (s.type === 'multi' && s.kind === 'item') {
    const pts = f.items.filter(i => s.ids.includes(i.id)).map(i => i.pos);
    if (!pts.length) return null;
    return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  }
  if (s.type === 'wall' || (s.type === 'multi' && s.kind === 'wall')) {
    const ids = s.type === 'wall' ? [s.id] : s.ids;
    const w = f.walls.find(x => ids.includes(x.id));
    return w ? [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2] : null;
  }
  if (s.type === 'room') { const r = f.rooms.find(x => x.id === s.id); return r ? centroid(r.points) : null; }
  if (s.type === 'duct') {
    const d = ductById(f, s.id);
    if (!d) return null;
    if (Number.isInteger(s.vertex) && d.points[s.vertex]) return [...d.points[s.vertex]];
    const i = Number.isInteger(s.segment) ? s.segment : 0;
    const a = d.points[i], b = d.points[i + 1];
    return a && b ? lerp(a, b, 0.5) : [...d.points[0]];
  }
  return null;
}

export function createMenuActions({ store, ui, view, menu, canvas = null }) {
  // 열었으면 true(키맵이 그때만 기본 동작을 막는다). 3D에서는 열지 않는다: 선택 중심은 2D
  // 좌표이고 3D는 면 피커가 자기 우클릭 메뉴를 이미 갖고 있다.
  function openSelectionMenu() {
    if (ui.get().mode !== '2d') return false;
    const at = selectionCenter(store, ui);
    if (!at || !view.tool?.onContextMenu) return false;
    const items = view.tool.onContextMenu(at, { key: true });
    if (!Array.isArray(items) || !items.length) return false;
    const r = canvas?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
    const [sx, sy] = view.toScreen(at);
    menu.open(r.left + sx, r.top + sy, items);
    return true;
  }
  return { openSelectionMenu };
}
