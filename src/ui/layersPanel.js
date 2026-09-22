import { activeFloor } from '../state/schema.js';
import { roomAt } from '../vent/airflow.js';
import { setItemFlag, updateItem, setDuctFlag } from '../state/floorOps.js';
import { layerTreeHtml, ALL_SHOW, ALL_HIDE } from './layersTree.js';
import { toast } from './toast.js';
import { LAYERS_HIDDEN, LAYERS_SHOWN } from './messages.js';

// 덕트는 첫 점이 든 방에 묶는다. 폴리라인은 여러 방을 지날 수 있어 기준이 하나 필요하다.
// 방 판정은 맨손 pointInPolygon이 아니라 roomAt(vent/airflow.js)을 쓴다: 방 폴리곤은 벽 **중심선**이라
// 벽에 붙은 후드·벽팬의 중심이 경계 위에 놓인다 → 두 곳이 다르게 판정하면 같은 후드가 풍량 표에는
// 그 방에 세어지면서 레이어 트리에서는 '미지정'으로 빠지는 어긋남이 생긴다.
export const ductRoomId = (floor, duct) => roomAt(duct.points[0], floor.rooms, floor.walls)?.id ?? null;

export function createLayersPanel(container, { store, ui }) {
  let renaming = null;
  // 방 노드의 접힘 기억. 기본값은 "내용이 있으면 펼침"이고(layersTree), 사용자가 토글하면 그 값이 이긴다.
  const openState = new Map();

  // 아이템 위치가 어느 방 안인지로 묶는다(판정은 roomAt 한 자리 — 위 ductRoomId 주석과 같은 이유).
  // 어느 방에도 없으면 "미지정". 덕트는 첫 점으로 묶는다.
  function buckets() {
    const f = activeFloor(store.get());
    const rooms = f.rooms.map(r => ({ room: r, items: [], ducts: [] }));
    const none = { room: null, items: [], ducts: [] };
    for (const it of f.items) {
      const id = roomAt(it.pos, f.rooms, f.walls)?.id ?? null;
      (rooms.find(x => x.room.id === id) ?? none).items.push(it);
    }
    for (const d of f.ducts ?? []) { const id = ductRoomId(f, d); (rooms.find(x => x.room.id === id) ?? none).ducts.push(d); }
    return none.items.length || none.ducts.length ? [...rooms, none] : rooms;
  }
  const showHidden = () => ui.get().showHidden !== false;

  // 선택 표시는 ui.selection에서 온다(§16.3 · 감사 §21): 캔버스에서 고른 것도 트리에서 보인다.
  const selectedIds = () => {
    const s = ui.get().selection;
    if (!s) return new Set();
    if (s.type === 'item' || s.type === 'duct') return new Set([s.id]);
    if (s.type === 'multi' && s.kind === 'item') return new Set(s.ids);
    return new Set();
  };
  // 마지막으로 스크롤해 보여 준 선택. 렌더마다가 아니라 **선택이 바뀔 때만** 스크롤하기 위한 기억이다.
  let lastSel = '';
  function render() {
    const pyeong = !!store.get().settings?.pyeong;
    // "모두 보기" 체크박스(상태 거울 + 파괴적 스위치)를 두 동작으로 가른다(§16.3 · 감사 §20).
    container.innerHTML = `
      <div class="row layer-actions"><button type="button" name="showAll">${ALL_SHOW}</button><button type="button" name="hideAll">${ALL_HIDE}</button></div>
      <label class="check"><input type="checkbox" name="showHidden" ${showHidden() ? 'checked' : ''}> 숨긴 항목 보기</label>
      ${layerTreeHtml(buckets(), { units: store.get().units ?? 'mm', pyeong, showHidden: showHidden(), selectedIds: selectedIds(), renaming, openState })}`;
    if (renaming) container.querySelector(`input[data-name="${renaming}"]`)?.focus();
    // 캔버스에서 고른 것이 트리 밖에 있으면 스크롤해 보여 준다(49행이 4화면이므로 꼭 필요하다).
    // **선택이 바뀔 때만** 한다: render()는 스토어·ui 양쪽에 걸려 있어 조건 없이 스크롤하면 다른 행의
    // 👁 클릭이나 캔버스 드래그가 사용자가 보고 있던 자리를 선택 행으로 되끌어당긴다.
    // jsdom에는 scrollIntoView가 없을 수 있다 — 없으면 조용히 지나간다.
    const ids = [...selectedIds()].sort().join(',');
    if (ids && ids !== lastSel) {
      const sel = container.querySelector('.layer-item.on');
      try { sel?.scrollIntoView?.({ block: 'nearest' }); } catch { /* 스크롤 불가 환경 */ }
    }
    lastSel = ids;
  }

  const onClick = ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.name === 'showAll' || b.name === 'hideAll') {
      const hidden = b.name === 'hideAll';
      const n = hideAll(store, activeFloor(store.get()), hidden);
      if (n.items || n.ducts) toast((hidden ? LAYERS_HIDDEN : LAYERS_SHOWN)(n.items, n.ducts));
      return;
    }
    if (b.name === 'showHidden') { ui.set({ showHidden: true }); return; }   // 숨긴 항목을 되살릴 길(감사 §26)
    if (b.dataset.select) { ui.set({ selection: { type: 'item', id: b.dataset.select } }); return; }
    if (b.dataset.hide) { setItemFlag(store, [b.dataset.hide], 'hidden'); return; }
    if (b.dataset.lock) { setItemFlag(store, [b.dataset.lock], 'locked'); return; }
    if (b.dataset.ductSelect) { ui.set({ selection: { type: 'duct', id: b.dataset.ductSelect, segment: null, vertex: null } }); return; }
    if (b.dataset.ductHide) { setDuctFlag(store, [b.dataset.ductHide], 'hidden'); return; }
    if (b.dataset.ductLock) { setDuctFlag(store, [b.dataset.ductLock], 'locked'); return; }
    if (b.dataset.rename) { renaming = b.dataset.rename; render(); }
  };
  // Enter로 확정하면 다시 그리는 도중 focusout도 터지므로 두 번 커밋되지 않게 막는다
  // (두 번 커밋되면 undo가 두 단계가 된다).
  let committing = false;
  const commit = input => {
    const id = input.dataset.name;
    if (committing || renaming !== id) return;
    committing = true;
    renaming = null;
    try { updateItem(store, id, { name: input.value.trim() }); } finally { committing = false; }
    render(); // 스토어 변경으로도 그려지지만 이름이 같을 때를 위해 직접 한 번 더
  };
  const onKeyDown = ev => {
    if (!ev.target.dataset?.name) return;
    if (ev.key === 'Enter') commit(ev.target);
    else if (ev.key === 'Escape') { renaming = null; render(); }
  };
  const onBlur = ev => { if (ev.target.dataset?.name) commit(ev.target); };

  container.addEventListener('click', onClick);
  container.addEventListener('keydown', onKeyDown);
  container.addEventListener('focusout', onBlur);
  const onChange = ev => {
    if (ev.target.name === 'showHidden') { ui.set({ showHidden: ev.target.checked }); }
  };
  container.addEventListener('change', onChange);
  // <details>의 접힘은 사용자 기억이다: 다시 그려도 유지된다(스토어가 아니라 패널이 들고 있다 —
  // 접힘은 프로젝트 파일에 저장하지 않는다).
  const onToggle = ev => { const d = ev.target.closest?.('details[data-room]'); if (d) openState.set(d.dataset.room, d.open); };
  container.addEventListener('toggle', onToggle, true);   // toggle은 버블하지 않는다 → 캡처로 받는다
  const unsubs = [store.subscribe(render), ui.subscribe(render)];
  render();
  return { destroy() { unsubs.forEach(u => u()); container.removeEventListener('click', onClick); container.removeEventListener('keydown', onKeyDown); container.removeEventListener('focusout', onBlur); container.removeEventListener('change', onChange); container.removeEventListener('toggle', onToggle, true); container.innerHTML = ''; } };
}

// 제품과 덕트를 한 단계로 함께 켜고 끈다(각각 기록하면 undo가 두 번 필요해진다).
// 바뀐 개수를 돌려준다: 결과 토스트가 그 수를 말하고, 0이면 트랜잭션도 열지 않는다(빈 단계 금지).
export function hideAll(store, floor, hidden) {
  const items = (floor.items ?? []).filter(i => !!i.hidden !== !!hidden).map(i => i.id);
  const ducts = (floor.ducts ?? []).filter(d => !!d.hidden !== !!hidden).map(d => d.id);
  if (!items.length && !ducts.length) return { items: 0, ducts: 0 };
  store.beginTransaction();
  if (items.length) setItemFlag(store, items, 'hidden', hidden, { record: false });
  if (ducts.length) setDuctFlag(store, ducts, 'hidden', hidden, { record: false });
  store.endTransaction();
  return { items: items.length, ducts: ducts.length };
}
