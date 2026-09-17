// 하단 바 버튼 위에 뜨는 작은 패널. 열 때마다 HTML을 새로 그린다(상태는 스토어가 갖는다).
export function createPopover(root) {
  const el = document.createElement('div');
  el.className = 'popover'; el.hidden = true;
  root.appendChild(el);
  let onClose = () => {};
  // 팝오버를 닫는 바깥 클릭은 캔버스까지 내려가지 않는다(닫으려던 클릭이 벽을 그리거나 팬을 시작하지 않게).
  const onDocDown = ev => { if (!el.hidden && !el.contains(ev.target) && !ev.target.closest?.('[data-popover]')) { ev.stopPropagation(); ev.preventDefault(); close(); } };
  const onKey = ev => { if (ev.key === 'Escape' && !el.hidden) { ev.stopPropagation(); close(); } };
  const onScroll = () => close();
  document.addEventListener('pointerdown', onDocDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', onScroll, true);

  function open(anchor, html, handlers = {}) {
    el.innerHTML = html; el.hidden = false;
    onClose = handlers.onClose ?? (() => {});
    el.onchange = handlers.onChange ?? null;
    el.oninput = handlers.onInput ?? null;
    el.onclick = handlers.onClick ?? null;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth || 260, h = el.offsetHeight || 220;
    const vw = window.innerWidth || 1280, vh = window.innerHeight || 800;
    el.style.left = `${Math.max(8, Math.min(vw - w - 8, r.left))}px`;
    el.style.top = `${Math.max(8, Math.min(vh - h - 8, r.top - h - 8))}px`; // 기본은 버튼 위쪽
  }
  function close() {
    if (el.hidden) return;
    el.hidden = true; el.innerHTML = '';
    el.onchange = el.oninput = el.onclick = null;
    const fn = onClose; onClose = () => {}; fn();
  }
  return {
    el, open, close, isOpen: () => !el.hidden,
    destroy() { document.removeEventListener('pointerdown', onDocDown, true); document.removeEventListener('keydown', onKey, true); window.removeEventListener('scroll', onScroll, true); el.remove(); },
  };
}
