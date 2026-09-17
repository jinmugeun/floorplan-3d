import { activeFloor } from '../state/schema.js';
import { updateWall, updateRoom, setRoomWallThickness } from '../state/floorOps.js';
import { wallLength } from '../geom/walls.js';
import { fmtLen, parseLen, fmtArea } from '../util/units.js';

export const ROOM_TYPES = [['none', '미지정'], ['cook', '가열조리실'], ['prep', '전처리실'], ['cold', '비가열조리실'], ['wash', '식기구세척실'], ['dining', '식당'], ['storage', '창고'], ['office', '사무실'], ['etc', '기타']];

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const field = (label, inner) => `<label class="field"><span>${label}</span>${inner}</label>`;
const num = (name, value, min, max, step = 1, ro = false) => `<input type="number" name="${name}" value="${Number(value) || 0}" min="${min}" max="${max}" step="${step}" ${ro ? 'readonly' : ''}>`;
// 숫자 입력: 비어 있거나 숫자가 아니면 null, 범위를 벗어나면 min/max로 잘라 준다.
function numValue(el) {
  if (el.value.trim() === '') return null;
  const v = Number(el.value); if (Number.isNaN(v)) return null;
  const min = el.min === '' ? -Infinity : Number(el.min), max = el.max === '' ? Infinity : Number(el.max);
  return Math.min(max, Math.max(min, v));
}
// 길이 입력은 단위에 따라 모양이 달라진다: mm는 숫자 입력, ft·in은 텍스트 입력(12' 6").
// 저장 값은 언제나 mm 정수다. step은 mm 숫자 입력의 화살표 간격이다(기존 층 높이·바닥 기준 높이·방 높이는 10을 썼다).
function lenField(label, name, mm, min, max, ro = false, units = 'mm', step = 1) {
  if (units !== 'ftin') return field(label, num(name, mm, min, max, step, ro));
  return field(label, `<input type="text" name="${name}" data-len="1" data-min="${min}" data-max="${max}" value="${esc(fmtLen(mm, 'ftin'))}" ${ro ? 'readonly' : ''}>`);
}
function readLen(el, units) {
  const v = parseLen(el.value, units);
  if (v === null) return null;
  const min = Number(el.dataset.min ?? -Infinity), max = Number(el.dataset.max ?? Infinity);
  return Math.min(max, Math.max(min, Math.round(v)));
}
// 치수 단위 표시가 꺼져 있으면 라벨에 단위를 쓰지 않는다: "벽 높이" / "벽 높이 (mm)"
const withUnit = (label, units, showUnit) => (showUnit ? `${label} (${units === 'ftin' ? 'ft·in' : 'mm'})` : label);

// deleteSelection: 앱의 삭제 동작(확인 대화상자 포함). 삭제 버튼은 이를 그대로 호출한다.
export function createPropsPanel(container, store, ui, { deleteSelection = () => {} } = {}) {
  function render() {
    const sel = ui.get().selection, f = activeFloor(store.get());
    const st = store.get(), units = st.units ?? 'mm', pyeong = !!st.settings?.pyeong, showUnit = !!st.settings?.showUnit;
    if (!sel) {
      container.innerHTML = `<h2>층 관리</h2>${lenField(withUnit('층 높이', units, showUnit), 'floorHeight', f.height, 2000, 8000, false, units, 10)}<p class="hint">객체를 클릭하면 상세 정보가 표시됩니다.</p>`;
      const bg = store.get().background;
      if (bg) container.insertAdjacentHTML('beforeend', `<h2>배경 이미지</h2>${field('투명도', `<input type="range" name="bgOpacity" min="0" max="1" step="0.05" value="${bg.opacity}">`)}<label class="check"><input type="checkbox" name="bgVisible" ${bg.visible ? 'checked' : ''}> 표시</label><button type="button" name="bgRemove">배경 제거</button>`);
      return;
    }
    if (sel.type === 'wall') {
      const w = f.walls.find(x => x.id === sel.id); if (!w) { container.innerHTML = ''; return; }
      container.innerHTML = `<h2>벽 상세 정보</h2>
        ${lenField(withUnit('벽 중심선 길이', units, showUnit), 'length', Math.round(wallLength(w)), 0, 999999, true, units)}
        ${lenField(withUnit('두께', units, showUnit), 'thickness', w.thickness, 2, 1000, false, units)}
        ${lenField(withUnit('벽 높이', units, showUnit), 'height', w.height, 2, 8000, false, units)}
        <button type="button" name="split">벽 나누기 (나눌 지점 클릭)</button>
        <button type="button" name="delete" class="danger">벽 삭제</button>`;
      return;
    }
    if (sel.type === 'room') {
      const r = f.rooms.find(x => x.id === sel.id); if (!r) { container.innerHTML = ''; return; }
      const t = f.walls.find(x => r.wallIds.includes(x.id))?.thickness ?? 200;
      container.innerHTML = `<h2>공간 상세 정보</h2>
        ${field('공간 타입', `<select name="type">${ROOM_TYPES.map(([v, l]) => `<option value="${v}" ${r.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
        ${field('공간 이름', `<input type="text" name="name" value="${esc(r.name)}" placeholder="공간 이름을 입력해 주세요">`)}
        ${field('면적', `<output>${fmtArea(r.area, { pyeong })}</output>`)}
        ${lenField(withUnit('벽 두께', units, showUnit), 'wallThickness', t, 2, 1000, false, units)}
        ${lenField(withUnit('바닥 기준 높이', units, showUnit), 'floorOffset', r.floorOffset, -1000, 1000, false, units, 10)}
        ${lenField(withUnit('방 높이', units, showUnit), 'height', r.height, 0, 8000, false, units, 10)}
        <label class="check"><input type="checkbox" name="hideCeiling" ${r.hideCeiling ? 'checked' : ''}> 천장 감추기</label>
        <button type="button" name="delete" class="danger">방 삭제</button>`;
    }
  }
  function applyNumber(sel, name, v) {
    if (!sel) { if (name === 'floorHeight') store.dispatch(d => { activeFloor(d).height = v; }); return; }
    if (sel.type === 'wall') updateWall(store, sel.id, { [name]: v });
    if (sel.type === 'room') { if (name === 'wallThickness') setRoomWallThickness(store, sel.id, v); else updateRoom(store, sel.id, { [name]: v }); }
  }
  const onChange = ev => {
    const sel = ui.get().selection, el = ev.target, name = el.name; if (!name) return;
    if (name === 'bgOpacity') { store.dispatch(d => { d.background.opacity = Number(el.value); }); return; }
    if (name === 'bgVisible') { store.dispatch(d => { d.background.visible = el.checked; }); return; }
    if (el.dataset.len) {
      const v = readLen(el, store.get().units ?? 'mm');
      if (v === null) { render(); return; } // 잘못된 입력은 버리고 현재 값으로 되돌린다
      applyNumber(sel, name, v); return;
    }
    if (el.type === 'number') {
      const v = numValue(el);
      if (v === null) { render(); return; } // 잘못된 입력은 버리고 현재 값으로 되돌린다
      applyNumber(sel, name, v); return;
    }
    if (sel?.type === 'room') {
      if (name === 'hideCeiling') updateRoom(store, sel.id, { hideCeiling: el.checked });
      else if (name === 'name' || name === 'type') updateRoom(store, sel.id, { [name]: el.value });
    }
  };
  const onClick = ev => {
    if (ev.target.name === 'split') { ui.set({ splitWall: true }); return; }
    if (ev.target.name === 'bgRemove') { store.dispatch(d => { d.background = null; }); return; }
    if (ev.target.name === 'delete' && ui.get().selection) deleteSelection();
  };
  container.addEventListener('change', onChange); container.addEventListener('click', onClick);
  const unsubs = [store.subscribe(render), ui.subscribe(render)];
  render();
  return { destroy() { unsubs.forEach(u => u()); container.removeEventListener('change', onChange); container.removeEventListener('click', onClick); } };
}
