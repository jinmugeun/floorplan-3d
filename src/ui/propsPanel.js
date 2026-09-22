import { activeFloor } from '../state/schema.js';
import { updateRoom, setActiveFloor, deleteFloor, totalArea, setRoomWallHeight, updateWallProps, updateItem, resizeItem } from '../state/floorOps.js';
import { wallLength } from '../geom/walls.js';
import { fmtArea, fmtLen } from '../util/units.js';
import { openFloorDialog } from './floorDialog.js';
import { esc } from '../util/html.js';
import { confirmDialog } from './confirmDialog.js';
import { toast } from './toast.js';
import { productById, fmtSize, ATTACH_LABELS } from '../products/catalog.js';
import { materialRowsHtml, mountSwatches, applyMaterialField, targetFor } from './materialRows.js';
import { equipRowsHtml, roomDesignRowsHtml, applyVentField, ventRowsClick } from './equipRows.js';
import { ductPanelHtml, applyDuctField, ductPanelClick } from './ductPanel.js';
import { field, num, numValue, lenField, readLen, withUnit, colorField, isDuplicateCommit } from './fieldUtils.js';
import { roomAirflow } from '../vent/airflow.js';
import { ROOM_TYPES } from '../state/roomTypes.js';   // 목록 자체는 상태 계층에 둔다(시방서 등 DOM 아닌 모듈도 쓴다)
import { applyNumber, setKeepRatio, getKeepRatio } from './propsApply.js';
import { memoCollisions } from '../geom/collide.js';
import { COLLISION_ITEM, CLAMP_MAX, CLAMP_MIN, LAST_FLOOR, LAST_FLOOR_TITLE } from './messages.js';
export { lenField, readLen, withUnit } from './fieldUtils.js';
export { applyNumber };

// 상세 설정 <details>의 열림 상태는 패널을 다시 그려도 유지된다.
let detailsOpen = true;
// 비율 유지는 제품 하나에만 뜻이 있다: 선택이 바뀌면 끈다.
let keepRatioFor = null;

export { ROOM_TYPES };

// deleteSelection: 앱의 삭제 동작(확인 대화상자 포함). 삭제 버튼은 이를 그대로 호출한다.
// itemActions: main.js의 아이템 동작 묶음(정렬·그룹화·그룹 해제는 여기서 부른다).
export function createPropsPanel(container, store, ui, { deleteSelection = () => {}, itemActions = {}, surfaceActions = {} } = {}) {
  function render() {
    const active = document.activeElement;
    if (colorTx && active?.type === 'color' && container.contains(active)) return; // 색을 끌고 있는 동안만 다시 그리지 않는다(입력이 끊긴다)
    renderBody();
    mountSwatches(container, activeFloor(store.get()), ui.get().selection);
    // 마감재 행에도 <details>가 생겼다: 층 관리 패널의 "상세 설정"만 골라 잡는다(I-14).
    const details = container.querySelector('details:not(.mat-row details)');
    if (details) details.addEventListener('toggle', () => { detailsOpen = details.open; });
    const wanted = ui.get().focusField;
    if (!wanted) return;
    ui.set({ focusField: null });                          // 한 번만. 이 set이 renderBody를 다시 돌린다
    container.querySelector(`[name="${wanted}"]`)?.focus(); // 그래서 새 DOM에서 다시 찾는다
  }
  function renderBody() {
    const sel = ui.get().selection, f = activeFloor(store.get());
    const st = store.get(), units = st.units ?? 'mm', pyeong = !!st.settings?.pyeong, showUnit = !!st.settings?.showUnit;
    if (!sel) {
      const p = store.get(), idx = p.activeFloor ?? 0;
      container.innerHTML = `<h2>층 관리</h2>
        ${field('현재 층', `<select name="floorSelect">${p.floors.map((fl, i) => `<option value="${i}" ${i === idx ? 'selected' : ''}>${esc(fl.name)}</option>`).join('')}</select>`)}
        <div class="row"><button type="button" name="floorAdd">층 추가하기</button><button type="button" name="floorRename">이름 변경</button></div>
        <button type="button" name="floorDelete" class="danger" ${p.floors.length <= 1 ? `disabled title="${LAST_FLOOR_TITLE}"` : ''}>층 삭제</button>
        ${lenField(withUnit('층 높이', units, showUnit), 'floorHeight', f.height, 2000, 8000, false, units, 10)}
        <details ${detailsOpen ? 'open' : ''}><summary>상세 설정</summary>
          ${field('실면적 기준', `<select name="areaMode"><option value="net" ${p.areaMode !== 'gross' ? 'selected' : ''}>실면적</option><option value="gross" ${p.areaMode === 'gross' ? 'selected' : ''}>실면적+내외벽</option></select>`)}
          ${field('총면적', `<output name="totalArea">${fmtArea(totalArea(f, p.areaMode), { pyeong })}</output>`)}
          ${lenField(withUnit('슬래브 두께', units, showUnit), 'slab', f.slab ?? 0, 0, 1000, false, units)}
          ${field('벽 투명도', `<input type="range" name="wallOpacity" min="0" max="1" step="0.05" value="${p.view.wallOpacity}"><output name="wallOpacityOut">${Math.round((p.view.wallOpacity ?? 1) * 100)}%</output>`)}
          ${field('바닥 투명도', `<input type="range" name="floorOpacity" min="0" max="1" step="0.05" value="${p.view.floorOpacity}"><output name="floorOpacityOut">${Math.round((p.view.floorOpacity ?? 1) * 100)}%</output>`)}
        </details>
        <p class="hint">객체를 클릭하면 상세 정보가 표시됩니다.</p>`;
      const bg = store.get().background;
      if (bg) container.insertAdjacentHTML('beforeend', `<h2>배경 이미지</h2>${field('투명도', `<input type="range" name="bgOpacity" min="0" max="1" step="0.05" value="${bg.opacity}">`)}<label class="check"><input type="checkbox" name="bgVisible" ${bg.visible ? 'checked' : ''}> 표시</label><label class="check"><input type="checkbox" name="bgLocked" ${bg.locked ? 'checked' : ''}> 잠금</label><button type="button" name="bgRemove">배경 제거</button>`);
      return;
    }
    if (sel.type === 'item') {
      const it = f.items.find(x => x.id === sel.id); if (!it) { container.innerHTML = ''; return; }
      if (keepRatioFor !== it.id) { setKeepRatio(false); keepRatioFor = it.id; }
      const p = productById(it.productId);
      const onWall = !!(it.attach === 'wall' && it.wallId); // 벽 부착 제품의 위치는 벽 위 t로 정해지므로 읽기 전용
      // 겹침은 빨간 테두리만으로는 눈치채기 어렵다(§14.8): 고른 제품이 충돌 중이면 한 줄로 말한다.
      const clash = store.get().view?.v2?.collision !== false && memoCollisions(f.items).has(it.id);
      container.innerHTML = `<h2>제품 상세 정보</h2>
        ${clash ? `<p class="error">${COLLISION_ITEM}</p>` : ''}
        <p class="muted">${esc(it.name || p?.name || '제품')} · ${esc(it.code || p?.code || '')}</p>
        ${field('크기 (W×D×H)', `<output>${fmtSize(it.size)}</output>`)}
        ${p?.price ? field('가격', `<output>${p.price.toLocaleString('ko-KR')}원</output>`) : ''}
        ${field('부착 타입', `<output>${ATTACH_LABELS[it.attach]}</output>`)}
        ${field('색상', `<input type="color" name="color" value="${esc(it.color)}">`)}
        ${lenField(withUnit('너비', units, showUnit), 'w', it.size[0], 10, 5000, false, units)}
        ${lenField(withUnit('깊이', units, showUnit), 'd', it.size[1], 10, 5000, false, units)}
        ${lenField(withUnit('높이', units, showUnit), 'h', it.size[2], 10, 5000, false, units)}
        <label class="check"><input type="checkbox" name="keepRatio" ${getKeepRatio() ? 'checked' : ''}> 크기 비율 유지</label>
        <button type="button" name="resetSize">수치 초기화</button>
        ${lenField(withUnit('바닥으로부터의 높이', units, showUnit), 'z', it.z, -1000, 8000, false, units)}
        ${field('각도 (°)', num('rot', it.rot, 0, 360, 1))}
        ${lenField(withUnit('위치 X', units, showUnit), 'posX', it.pos[0], -1e6, 1e6, onWall, units)}
        ${lenField(withUnit('위치 Y', units, showUnit), 'posY', it.pos[1], -1e6, 1e6, onWall, units)}
        ${equipRowsHtml(it, { units, showUnit, floor: f })}
        <button type="button" name="delete" class="danger">제품 삭제</button>`;
      return;
    }
    if (sel.type === 'duct') { container.innerHTML = ductPanelHtml(f, sel, { units, showUnit }); return; }
    if (sel.type === 'wall') {
      const w = f.walls.find(x => x.id === sel.id); if (!w) { container.innerHTML = ''; return; }
      const len = wallLength(w);
      container.innerHTML = `<h2>벽 상세 정보</h2>
        ${lenField(withUnit('벽 중심선 길이', units, showUnit), 'length', Math.round(len), 0, 999999, true, units)}
        ${lenField(withUnit('벽 길이', units, showUnit), 'wallLength', Math.round(len), 1, 999999, false, units)}
        ${lenField(withUnit('두께', units, showUnit), 'thickness', w.thickness, 2, 1000, false, units)}
        ${lenField(withUnit('벽 높이', units, showUnit), 'height', w.height, 2, 8000, false, units)}
        ${field('선택된 벽 면적', `<output name="wallArea">${fmtArea((len * w.height) / 1e6, { pyeong })}</output>`)}
        ${materialRowsHtml(f, sel, { detailsOpen: false })}
        ${w.matIn ? '' : colorField('내벽 색', 'colorIn', w.colorIn)}
        ${w.matOut ? '' : colorField('외벽 색', 'colorOut', w.colorOut)}
        <button type="button" name="split">벽 나누기 (나눌 지점 클릭)</button>
        <button type="button" name="delete" class="danger">벽 삭제</button>`;
      return;
    }
    if (sel.type === 'multi' && sel.kind === 'item') {
      container.innerHTML = `<h2>제품 ${sel.ids.length}개 선택</h2>
        <h3>정렬</h3>
        <div class="row"><button type="button" name="alignVStart">위</button><button type="button" name="alignVCenter">중간</button><button type="button" name="alignVEnd">아래</button></div>
        <div class="row"><button type="button" name="alignHStart">왼</button><button type="button" name="alignHCenter">가운데</button><button type="button" name="alignHEnd">오른</button></div>
        <h3>그룹</h3>
        <button type="button" name="group">그룹화 <kbd>Ctrl+G</kbd></button>
        <button type="button" name="ungroup">그룹 해제 <kbd>Ctrl+Shift+G</kbd></button>
        <button type="button" name="delete" class="danger">선택 삭제</button>`;
      return;
    }
    if (sel.type === 'multi' && sel.kind === 'wall') {
      const picked = f.walls.filter(w => sel.ids.includes(w.id));
      const h = picked[0]?.height ?? 2300, t = picked[0]?.thickness ?? 200;
      container.innerHTML = `<h2>여러 벽 선택</h2>
        <p class="hint">선택된 벽 ${picked.length}개</p>
        ${lenField(withUnit('벽 높이', units, showUnit), 'height', h, 2, 8000, false, units)}
        ${lenField(withUnit('두께', units, showUnit), 'thickness', t, 2, 1000, false, units)}
        ${field('선택된 벽 면적 합', `<output name="wallArea">${fmtArea(picked.reduce((s, w) => s + (wallLength(w) * w.height) / 1e6, 0), { pyeong })}</output>`)}
        <button type="button" name="delete" class="danger">선택 삭제</button>`;
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
        ${field('좌석수', num('seats', r.seats ?? 0, 0, 999, 1))}
        <label class="check"><input type="checkbox" name="matchWallHeight" ${r.matchWallHeight ? 'checked' : ''}> 공간 높이 맞추기</label>
        ${materialRowsHtml(f, sel, { detailsOpen: false })}
        ${r.floorMat ? '' : colorField('바닥 색', 'floorColor', r.floorColor)}
        ${r.ceilingMat ? '' : colorField('천장 색', 'ceilingColor', r.ceilingColor)}
        <label class="check"><input type="checkbox" name="hideCeiling" ${r.hideCeiling ? 'checked' : ''}> 천장 감추기</label>
        ${roomDesignRowsHtml(r, roomAirflow(f).find(x => x.roomId === r.id) ?? null)}
        <button type="button" name="delete" class="danger">방 삭제</button>`;
      return;
    }
  }
  // 색: 기하 불변 → reroom 없음. opts는 트랜잭션 안에서 { record: false }로 넘어온다.
  const applyColor = (sel, name, value, opts) => {
    if (sel?.type === 'wall') updateWallProps(store, sel.id, { [name]: value }, opts);
    if (sel?.type === 'room') updateRoom(store, sel.id, { [name]: value }, opts);
  };
  let colorTx = false; // 열려 있는 색 드래그 트랜잭션
  // 선택기가 change 없이 닫히면(취소·요소 제거) 열린 트랜잭션을 여기서 닫고 미뤄 둔 다시 그리기를 한다.
  const onFocusOut = ev => { if (ev.target?.type === 'color' && colorTx) { store.endTransaction(); colorTx = false; render(); } };
  const onInput = ev => {
    const el = ev.target;
    if (el.type !== 'color' || !el.name) return;
    if (!colorTx) { store.beginTransaction(); colorTx = true; } // 드래그 시작 상태를 되돌림 지점으로 잡는다
    applyColor(ui.get().selection, el.name, el.value, { record: false });
  };
  const onChange = ev => {
    const sel = ui.get().selection, el = ev.target, name = el.name; if (!name) return;
    // [Enter] 확정 뒤 blur가 내는 같은 값의 네이티브 change는 한 번 삼킨다(§16.1). 적용 함수가
    // 이미 값을 거르지만, 클램프 토스트·잠금 토스트가 두 번 뜨는 것은 그쪽에서 막지 못한다.
    if (isDuplicateCommit(el)) return;
    if (applyMaterialField(store, sel, el)) return;      // 마감재 오프셋·각도
    // 설비·덕트 갈래의 boolean은 "내 필드다"를 뜻할 뿐 "적용했다"가 아니다(반환 규약은 그대로 둔다).
    // store.dispatch는 언제나 새 structuredClone을 상태로 앉히므로 상태 동일성이 곧 "dispatch가
    // 없었다"다 → 그때만 직접 다시 그려 칸의 글자를 모델 값으로 되돌린다(리뷰 I-2b: eqNo가 이미
    // 99(최대)일 때 50099를 확정하면 상태는 99인데 글자가 50099로 남았다).
    const before = store.get();
    if (applyVentField(store, ui, sel, el)) { if (store.get() === before) render(); return; }   // 설비 속성 · 방 설계 풍량
    if (applyDuctField(store, sel, el)) { if (store.get() === before) render(); return; }       // 덕트 종류·계통·구간 단면
    if (name === 'bgOpacity') { store.dispatch(d => { d.background.opacity = Number(el.value); }, { record: false }); return; }
    if (name === 'bgVisible') { store.dispatch(d => { d.background.visible = el.checked; }, { record: false }); return; }
    if (name === 'bgLocked') { store.dispatch(d => { d.background.locked = el.checked; }, { record: false }); return; }
    if (name === 'floorSelect') { setActiveFloor(store, Number(el.value)); return; }
    if (name === 'areaMode') { store.dispatch(d => { d.areaMode = el.value; }, { record: false }); return; }
    if (name === 'wallOpacity' || name === 'floorOpacity') { store.dispatch(d => { d.view[name] = Number(el.value); }, { record: false }); return; }
    if (name === 'keepRatio') { setKeepRatio(el.checked); return; }
    if (name === 'color' && sel?.type === 'item') { updateItem(store, sel.id, { color: el.value }); return; }
    // 범위를 벗어난 입력이 말없이 잘리던 것을 알린다(§14.10 — 감사 #7).
    const onClamp = (v, { max }) => toast(v === max ? CLAMP_MAX(max) : CLAMP_MIN(v));
    if (el.dataset.len) {
      // data-len 입력은 ft·in 모드의 길이 칸이다: 한계도 그 표기로 말한다("최대 8000 mm까지"가
      // ft·in 화면에 뜨던 것이 m-6이다). 단위 인자를 비워 값에 mm가 덧붙지 않게 한다.
      const units = store.get().units ?? 'mm';
      const onClampLen = (v, { max }) => toast((v === max ? CLAMP_MAX : CLAMP_MIN)(fmtLen(v, units), ''));
      const v = readLen(el, units, { onClamp: onClampLen });
      if (v === null) { render(); return; } // 잘못된 입력은 버리고 현재 값으로 되돌린다
      // 적용된 것이 없으면(같은 값·클램프·잠금) dispatch가 없어 패널이 다시 그려지지 않는다 →
      // 칸의 글자가 모델과 어긋난 채 남는다(리뷰 I-2). 그때만 직접 다시 그려 모델 값을 보여 준다.
      if (!applyNumber(store, sel, name, v)) render();
      return;
    }
    if (el.type === 'number') {
      const v = numValue(el, { onClamp });
      if (v === null) { render(); return; } // 잘못된 입력은 버리고 현재 값으로 되돌린다
      if (!applyNumber(store, sel, name, v)) render();   // 리뷰 I-2: 적용되지 않았으면 글자를 모델 값으로
      return;
    }
    if (el.type === 'color') {
      // 선택기 드래그(input) 중에는 { record: false }로 미리 보여 주고, change에서 트랜잭션을 한 단계로 닫는다.
      if (colorTx) { applyColor(sel, name, el.value, { record: false }); store.endTransaction(); colorTx = false; }
      else applyColor(sel, name, el.value);
      return;
    }
    if (sel?.type === 'room') {
      if (name === 'hideCeiling') updateRoom(store, sel.id, { hideCeiling: el.checked });
      else if (name === 'matchWallHeight') {
        store.beginTransaction();
        updateRoom(store, sel.id, { matchWallHeight: el.checked }, { record: false });
        if (el.checked) { const room = activeFloor(store.get()).rooms.find(x => x.id === sel.id); if (room) setRoomWallHeight(store, sel.id, room.height, { record: false }); } // 켜는 순간 한 번 맞춘다
        store.endTransaction();
      }
      else if (name === 'name' || name === 'type') updateRoom(store, sel.id, { [name]: el.value });
    }
  };
  const onClick = ev => {
    if (ventRowsClick(ui, ev.target)) return;                              // 설비의 "연결된 덕트" 선택
    if (ductPanelClick(store, ui, ui.get().selection, ev.target)) return;  // 덕트 구간·댐퍼·연결·삭제
    if (ev.target.name === 'split') { ui.set({ splitWall: true }); return; }
    if (ev.target.name === 'matReplace') { surfaceActions.replaceMaterial?.(targetFor(ui.get().selection, ev.target.dataset.side)); return; }
    if (ev.target.name === 'matEditor') { surfaceActions.openEditor?.(ui.get().selection?.id, ev.target.dataset.side); return; }
    if (ev.target.name === 'resetSize') {
      const sel = ui.get().selection;
      const it = activeFloor(store.get()).items.find(x => x.id === sel?.id);
      const p = it && productById(it.productId);
      if (p) resizeItem(store, it.id, [...p.size]);
      return;
    }
    if (ev.target.name === 'bgRemove') { store.dispatch(d => { d.background = null; }); return; }
    if (ev.target.name === 'floorAdd') { openFloorDialog({ store, mode: 'add' }); return; }
    if (ev.target.name === 'floorRename') { openFloorDialog({ store, mode: 'rename', index: store.get().activeFloor ?? 0 }); return; }
    if (ev.target.name === 'floorDelete') {
      const p = store.get();
      if (p.floors.length <= 1) { toast(LAST_FLOOR); return; }
      const idx = p.activeFloor ?? 0;
      const { id, name } = p.floors[idx];
      // 대화상자가 열려 있는 동안 층 목록이 바뀔 수 있다: 확인 뒤에 마지막 층 규칙을 다시 보고,
      // 인덱스가 아니라 id로 대상을 **다시 찾는다**(결정 19 — 확인 뒤에 대상을 다시 찾는다).
      // idx를 그대로 들고 가면 그사이 앞 층이 지워졌을 때 엉뚱한 층을 지운다.
      confirmDialog({ title: '층 삭제', message: `"${name}" 층을 삭제할까요?`, ok: '삭제', danger: true })
        .then(okay => {
          if (!okay) return;
          const next = store.get();
          if (next.floors.length <= 1) return;
          const at = next.floors.findIndex(fl => fl.id === id);
          if (at >= 0) deleteFloor(store, at);
        });
      return;
    }
    if (ev.target.name === 'delete' && ui.get().selection) { deleteSelection(); return; }
    const m = /^align([VH])(Start|Center|End)$/.exec(ev.target.name ?? '');
    if (m) { itemActions.align?.(m[1] === 'V' ? 'v' : 'h', m[2].toLowerCase()); return; }
    if (ev.target.name === 'group') { itemActions.group?.(); return; }
    if (ev.target.name === 'ungroup') { itemActions.ungroup?.(); return; }
  };
  container.addEventListener('change', onChange); container.addEventListener('input', onInput); container.addEventListener('click', onClick); container.addEventListener('focusout', onFocusOut);
  const unsubs = [store.subscribe(render), ui.subscribe(render)];
  render();
  return { destroy() { unsubs.forEach(u => u()); container.removeEventListener('change', onChange); container.removeEventListener('input', onInput); container.removeEventListener('click', onClick); container.removeEventListener('focusout', onFocusOut); } };
}
