import { esc } from '../util/html.js';
// 우클릭 메뉴. 항목은 호출한 쪽(도구)이 만든다: { label, shortcut?, danger?, disabled?, title?, onSelect } 또는 'sep'.
export function createContextMenu(root) {
  let el = null, items = [], focus = -1, opener = null;

  const buttons = () => (el ? [...el.querySelectorAll('.ctx-item')] : []);
  const isOpen = () => !!el;

  function close() {
    if (!el) return;
    el.remove(); el = null; items = []; focus = -1;
    const back = opener; opener = null;
    back?.focus?.();     // 메뉴를 열기 전 포커스로 되돌린다(§15.3)
    document.removeEventListener('pointerdown', onDocDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', close, true);
  }
  // 메뉴를 닫는 바깥 클릭은 캔버스까지 내려가지 않는다(팝오버와 같은 규칙).
  const onDocDown = ev => { if (el && !el.contains(ev.target)) { ev.stopPropagation(); ev.preventDefault(); close(); } };
  function move(step) {
    const bs = buttons();
    if (!bs.length) return;
    for (let i = 0; i < bs.length; i++) {
      focus = (focus + step + bs.length) % bs.length;
      if (!bs[focus].disabled) break;
    }
    bs[focus].focus();
  }
  function onKey(ev) {
    if (!el) return;
    if (ev.key === 'Escape') { ev.stopPropagation(); close(); return; }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); move(1); return; }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); move(-1); return; }
    if (ev.key === 'Enter') { ev.preventDefault(); const b = buttons()[focus]; if (b && !b.disabled) b.click(); }
  }
  function open(x, y, list) {
    const back = opener ?? document.activeElement;   // 메뉴를 다시 열어도 원래 자리를 잃지 않는다
    close();
    opener = back;
    items = list;
    el = document.createElement('div');
    el.className = 'ctx-menu';
    el.setAttribute('role', 'menu');
    el.innerHTML = list.map((it, i) => (it === 'sep'
      ? '<div class="ctx-sep" role="separator"></div>'
      : `<button type="button" role="menuitem" class="ctx-item ${it.danger ? 'danger' : ''}" data-i="${i}" ${it.disabled ? 'disabled' : ''} ${it.title ? `title="${esc(it.title)}"` : ''}><span>${esc(it.label)}</span>${it.shortcut ? `<kbd>${esc(it.shortcut)}</kbd>` : ''}</button>`)).join('');
    root.appendChild(el);
    const w = el.offsetWidth || 190, h = el.offsetHeight || 40 + list.length * 28;
    const vw = window.innerWidth || 1280, vh = window.innerHeight || 800;
    el.style.left = `${Math.max(4, Math.min(vw - w - 4, x))}px`;
    el.style.top = `${Math.max(4, Math.min(vh - h - 4, y))}px`;
    el.addEventListener('click', ev => {
      const b = ev.target.closest('.ctx-item');
      if (!b || b.disabled) return;
      const it = items[Number(b.dataset.i)];
      close();
      it.onSelect?.();
    });
    document.addEventListener('pointerdown', onDocDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', close, true);
    move(1);   // 첫 활성 항목으로 포커스(§15.3) — 비활성 항목은 move가 건너뛴다
  }
  return { open, close, isOpen, focusFirst: () => move(1) };
}
