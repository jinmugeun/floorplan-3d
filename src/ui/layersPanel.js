import { activeFloor } from '../state/schema.js';
import { pointInPolygon } from '../geom/rooms.js';
import { productById, fmtSize } from '../products/catalog.js';
import { setItemFlag, updateItem } from '../state/floorOps.js';
import { fmtArea } from '../util/units.js';
import { esc } from '../util/html.js';

export function createLayersPanel(container, { store, ui }) {
  let renaming = null;

  // 아이템 위치가 어느 방 안인지로 묶는다. 어느 방에도 없으면 "미지정".
  function buckets() {
    const f = activeFloor(store.get());
    const rooms = f.rooms.map(r => ({ room: r, items: [] }));
    const none = { room: null, items: [] };
    for (const it of f.items) (rooms.find(x => pointInPolygon(it.pos, x.room.points)) ?? none).items.push(it);
    return none.items.length ? [...rooms, none] : rooms;
  }
  const showHidden = () => ui.get().showHidden !== false;

  function itemRow(it) {
    const p = productById(it.productId);
    const name = it.name || p?.name || '제품';
    const body = renaming === it.id
      ? `<input type="text" data-name="${it.id}" value="${esc(name)}" aria-label="이름 변경">`
      : `<button type="button" class="layer-name" data-select="${it.id}">${esc(name)}</button>`;
    return `<li class="layer-item ${it.hidden ? 'off' : ''}" data-id="${it.id}">
      ${body}
      <span class="muted">${esc(it.code || p?.code || '')} ${p ? fmtSize(it.size) : ''}</span>
      <span class="layer-btns">
        <button type="button" data-hide="${it.id}" aria-label="${it.hidden ? '보이기' : '숨김'}">${it.hidden ? '🚫' : '👁'}</button>
        <button type="button" data-lock="${it.id}" aria-label="${it.locked ? '잠금 해제' : '잠금'}">${it.locked ? '🔒' : '🔓'}</button>
        <button type="button" data-rename="${it.id}" aria-label="이름 변경">✎</button>
      </span></li>`;
  }
  function render() {
    const f = activeFloor(store.get());
    const allShown = f.items.length > 0 && f.items.every(i => !i.hidden);
    const pyeong = !!store.get().settings?.pyeong;
    container.innerHTML = `
      <label class="check"><input type="checkbox" name="showAll" ${allShown ? 'checked' : ''}> 모두 보기</label>
      <label class="check"><input type="checkbox" name="showHidden" ${showHidden() ? 'checked' : ''}> 가려진 제품 보기</label>
      <ul class="layer-tree">${buckets().map(b => {
        const rows = b.items.filter(it => showHidden() || !it.hidden).map(itemRow).join('');
        const title = b.room ? `${esc(b.room.name || '이름 없는 공간')} (${fmtArea(b.room.area, { pyeong })})` : '미지정';
        return `<li class="layer-room"><span class="layer-room-name">${title}</span><ul>${rows}</ul></li>`;
      }).join('')}</ul>`;
    if (renaming) container.querySelector(`input[data-name="${renaming}"]`)?.focus();
  }

  const onClick = ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.select) { ui.set({ selection: { type: 'item', id: b.dataset.select } }); return; }
    if (b.dataset.hide) { setItemFlag(store, [b.dataset.hide], 'hidden'); return; }
    if (b.dataset.lock) { setItemFlag(store, [b.dataset.lock], 'locked'); return; }
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
    if (ev.target.name === 'showAll') { setItemFlag(store, activeFloor(store.get()).items.map(i => i.id), 'hidden', !ev.target.checked); return; }
    if (ev.target.name === 'showHidden') { ui.set({ showHidden: ev.target.checked }); }
  };
  container.addEventListener('change', onChange);
  const unsubs = [store.subscribe(render), ui.subscribe(render)];
  render();
  return { destroy() { unsubs.forEach(u => u()); container.removeEventListener('click', onClick); container.removeEventListener('keydown', onKeyDown); container.removeEventListener('focusout', onBlur); container.removeEventListener('change', onChange); container.innerHTML = ''; } };
}
