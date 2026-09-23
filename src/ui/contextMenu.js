import { esc } from '../util/html.js';
import { trapTab } from './dialogBase.js';
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
    window.removeEventListener('scroll', onScroll, true);
  }
  // 메뉴를 닫는 바깥 클릭은 캔버스까지 내려가지 않는다(팝오버와 같은 규칙).
  const onDocDown = ev => { if (el && !el.contains(ev.target)) { ev.stopPropagation(); ev.preventDefault(); close(); } };
  // 페이지가 스크롤되면 메뉴가 엉뚱한 자리에 남으므로 닫는다 — 메뉴 안에서 난 스크롤은 페이지 스크롤이 아니다.
  const onScroll = ev => { if (el && !el.contains(ev.target)) close(); };
  // 기준은 실제 포커스다: [Tab]으로 옮긴 뒤에도 ↑/↓·Enter가 엉뚱한 항목을 가리키지 않게.
  const activeIndex = () => {
    const i = buttons().indexOf(document.activeElement);
    return i >= 0 ? i : focus;
  };
  function move(step) {
    const bs = buttons();
    if (!bs.length) return;
    focus = activeIndex();
    for (let i = 0; i < bs.length; i++) {
      focus = (focus + step + bs.length) % bs.length;
      if (!bs[focus].disabled) break;
    }
    bs[focus].focus();
  }
  // 메뉴가 먹는 키는 전역 키맵(window bubble)까지 가지 않는다: 그러지 않으면 ↑/↓로 항목을 고르는
  // 동안 선택한 제품이 한 번에 10 mm씩 움직이고 undo 단계가 쌓인다(§15.3).
  function onKey(ev) {
    if (!el) return;
    if (ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); close(); return; }
    // [Tab]/[Shift+Tab]은 메뉴 안에서만 돈다(마지막 항목에서 앱으로 새어 나가지 않는다).
    if (ev.key === 'Tab') { ev.stopPropagation(); trapTab(ev, buttons().filter(b => !b.disabled)); return; }
    if (ev.key === 'ArrowDown') { ev.stopPropagation(); ev.preventDefault(); move(1); return; }
    if (ev.key === 'ArrowUp') { ev.stopPropagation(); ev.preventDefault(); move(-1); return; }
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.stopPropagation(); ev.preventDefault();
      const b = buttons()[activeIndex()];
      if (b && !b.disabled) b.click();
      return;
    }
    // 메뉴가 열린 동안 글자 단축키는 뒤로 새지 않는다(§16.12 · M-10 — 팝오버와 같은 규칙).
    // 이 리스너도 document 캡처 단계이므로(open()의 addEventListener(..., true)) 끊으면 타깃
    // 리스너까지 막힌다: 입력 칸이 든 메뉴는 없지만 규칙을 팝오버와 같게 두어 두 곳이 갈라지지 않게 한다.
    const t = ev.target;
    const inField = t?.tagName === 'INPUT' || t?.tagName === 'SELECT' || t?.tagName === 'TEXTAREA';
    if (!inField && !ev.ctrlKey && !ev.metaKey && !ev.altKey) ev.stopPropagation();
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
    window.addEventListener('scroll', onScroll, true);
    move(1);   // 첫 활성 항목으로 포커스(§15.3) — 비활성 항목은 move가 건너뛴다
  }
  return { open, close, isOpen, focusFirst: () => move(1) };
}
