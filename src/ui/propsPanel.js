import { activeFloor } from '../state/schema.js';
import { updateWall, updateRoom, setRoomWallThickness, deleteWall, deleteRoom } from '../state/floorOps.js';
import { wallLength } from '../geom/walls.js';

export const ROOM_TYPES = [['none', '미지정'], ['cook', '가열조리실'], ['prep', '전처리실'], ['cold', '비가열조리실'], ['wash', '식기구세척실'], ['dining', '식당'], ['storage', '창고'], ['office', '사무실'], ['etc', '기타']];

const field = (label, inner) => `<label class="field"><span>${label}</span>${inner}</label>`;
const num = (name, value, min, max, step = 1, ro = false) => `<input type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="${step}" ${ro ? 'readonly' : ''}>`;

export function createPropsPanel(container, store, ui) {
  function render() {
    const sel = ui.get().selection, f = activeFloor(store.get());
    if (!sel) { container.innerHTML = `<h2>층 관리</h2>${field('층 높이 (mm)', num('floorHeight', f.height, 2000, 8000, 10))}<p class="hint">객체를 클릭하면 상세 정보가 표시됩니다.</p>`; return; }
    if (sel.type === 'wall') {
      const w = f.walls.find(x => x.id === sel.id); if (!w) { container.innerHTML = ''; return; }
      container.innerHTML = `<h2>벽 상세 정보</h2>
        ${field('벽 중심선 길이 (mm)', num('length', Math.round(wallLength(w)), 0, 999999, 1, true))}
        ${field('두께 (mm)', num('thickness', w.thickness, 2, 1000))}
        ${field('벽 높이 (mm)', num('height', w.height, 2, 8000))}
        <button type="button" name="split">벽 나누기 (나눌 지점 클릭)</button>
        <button type="button" name="delete" class="danger">벽 삭제</button>`;
      return;
    }
    if (sel.type === 'room') {
      const r = f.rooms.find(x => x.id === sel.id); if (!r) { container.innerHTML = ''; return; }
      const t = f.walls.find(x => r.wallIds.includes(x.id))?.thickness ?? 200;
      container.innerHTML = `<h2>공간 상세 정보</h2>
        ${field('공간 타입', `<select name="type">${ROOM_TYPES.map(([v, l]) => `<option value="${v}" ${r.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
        ${field('공간 이름', `<input type="text" name="name" value="${r.name}" placeholder="공간 이름을 입력해 주세요">`)}
        ${field('면적', `<output>${r.area.toFixed(1)} m²</output>`)}
        ${field('벽 두께 (mm)', num('wallThickness', t, 2, 1000))}
        ${field('바닥 기준 높이 (mm)', num('floorOffset', r.floorOffset, -1000, 1000, 10))}
        ${field('방 높이 (mm)', num('height', r.height, 0, 8000, 10))}
        <label class="check"><input type="checkbox" name="hideCeiling" ${r.hideCeiling ? 'checked' : ''}> 천장 감추기</label>
        <button type="button" name="delete" class="danger">방 삭제</button>`;
    }
  }
  const onChange = ev => {
    const sel = ui.get().selection, el = ev.target, name = el.name; if (!name) return;
    if (!sel) { if (name === 'floorHeight') store.dispatch(d => { activeFloor(d).height = Number(el.value); }); return; }
    if (sel.type === 'wall') updateWall(store, sel.id, { [name]: Number(el.value) });
    if (sel.type === 'room') {
      if (name === 'wallThickness') setRoomWallThickness(store, sel.id, Number(el.value));
      else if (name === 'hideCeiling') updateRoom(store, sel.id, { hideCeiling: el.checked });
      else if (name === 'name' || name === 'type') updateRoom(store, sel.id, { [name]: el.value });
      else updateRoom(store, sel.id, { [name]: Number(el.value) });
    }
  };
  const onClick = ev => {
    if (ev.target.name === 'split') { ui.set({ splitWall: true }); return; }
    if (ev.target.name !== 'delete') return;
    const sel = ui.get().selection; if (!sel) return;
    if (sel.type === 'wall') { deleteWall(store, sel.id); ui.set({ selection: null }); }
    if (sel.type === 'room' && window.confirm('방과 그 벽을 모두 삭제할까요?')) { deleteRoom(store, sel.id); ui.set({ selection: null }); }
  };
  container.addEventListener('change', onChange); container.addEventListener('click', onClick);
  const unsubs = [store.subscribe(render), ui.subscribe(render)];
  render();
  return { destroy() { unsubs.forEach(u => u()); container.removeEventListener('change', onChange); container.removeEventListener('click', onClick); } };
}
