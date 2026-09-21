// 하단 바 버튼 위에 뜨는 작은 패널. 열 때마다 HTML을 새로 그린다(상태는 스토어가 갖는다).
// §15.3(감사 §1): 열리면 첫 항목으로 포커스가 들어가고 [Tab]은 안에서 돌고 [Esc]는 호출 버튼으로
// 되돌린다 — 예전에는 Tab이 뒤쪽 상단 바로 새어 나가면서 팝오버가 열린 채 남았다.
import { trapTab, focusables } from './dialogBase.js';

let seq = 0;   // 제목 id는 인스턴스별로 준다(한 문서에 팝오버가 둘이면 고정 id가 겹친다)

export function createPopover(root) {
  const titleId = `popoverTitle${++seq}`;
  const el = document.createElement('div');
  el.className = 'popover'; el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'false');   // 뒤쪽 앱을 막지 않는다(모달이 아니다 — §15.3)
  root.appendChild(el);
  let onClose = () => {};
  let opener = null;                        // 닫을 때 포커스를 돌려줄 자리
  // 팝오버를 닫는 바깥 클릭은 캔버스까지 내려가지 않는다(닫으려던 클릭이 벽을 그리거나 팬을 시작하지 않게).
  // 캔버스 위의 클릭만 기본 동작까지 막는다: 팝오버를 닫으려는 클릭이 다른 입력란의 포커스를 빼앗지 않게.
  const onDocDown = ev => {
    if (el.hidden || el.contains(ev.target) || ev.target.closest?.('[data-popover]')) return;
    ev.stopPropagation();
    if (ev.target.tagName === 'CANVAS' || ev.target.closest?.('#canvasWrap')) ev.preventDefault();
    close();
  };
  const onKey = ev => {
    if (el.hidden) return;
    if (ev.key === 'Escape') { ev.stopPropagation(); close(); return; }
    // 팝오버가 열려 있으면 Tab은 안에서만 돈다. 포커스가 바깥에 있으면 안으로 데려온다
    // (trapTab은 목록에 없는 포커스를 앞으로는 첫, 뒤로는 마지막 항목으로 보낸다).
    if (ev.key === 'Tab') { ev.stopPropagation(); trapTab(ev, focusables(el)); }
  };
  // 페이지가 스크롤되면 앵커에서 떨어지므로 닫는다. 단 팝오버 안에서 난 스크롤(넘치는 목록을
  // Tab으로 감싸 돌 때 브라우저가 일으킨다)은 페이지 스크롤이 아니다 — 캡처 단계라 여기까지 온다.
  const onScroll = ev => { if (!el.contains(ev.target)) close(); };
  document.addEventListener('pointerdown', onDocDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', onScroll, true);

  function open(anchor, html, handlers = {}) {
    const wasOpen = !el.hidden;
    // 앵커가 바뀌면(다른 팝오버 버튼으로 옮겨 열기) 돌아갈 자리도 그 버튼이다:
    // shell.openPopover는 다른 종류를 누르면 닫지 않고 그대로 pop.open(newAnchor, …)를 부른다.
    // 같은 앵커로 다시 그리는 refreshPopover()는 노드가 같으므로 건드리지 않는다(§15.3).
    if (!wasOpen || (anchor && anchor !== opener)) opener = anchor ?? document.activeElement;
    el.innerHTML = html; el.hidden = false;
    onClose = handlers.onClose ?? (() => {});
    el.onchange = handlers.onChange ?? null;
    el.oninput = handlers.onInput ?? null;
    el.onclick = handlers.onClick ?? null;
    // 이름은 팝오버 제목(h4)이 있으면 그것, 없으면 호출 버튼의 글자다.
    const head = el.querySelector('h4');
    if (head) { if (!head.id) head.id = titleId; el.setAttribute('aria-labelledby', head.id); el.removeAttribute('aria-label'); }
    else { el.removeAttribute('aria-labelledby'); el.setAttribute('aria-label', (anchor?.textContent ?? '').trim() || '옵션'); }
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth || 260, h = el.offsetHeight || 220;
    const vw = window.innerWidth || 1280, vh = window.innerHeight || 800;
    el.style.left = `${Math.max(8, Math.min(vw - w - 8, r.left))}px`;
    el.style.top = `${Math.max(8, Math.min(vh - h - 8, r.top - h - 8))}px`; // 기본은 버튼 위쪽
    // 처음 열 때만 포커스를 옮긴다: refreshPopover()가 같은 팝오버를 다시 그릴 때 첫 항목으로
    // 튀면 두 번째 체크박스를 키보드로 켤 수 없다.
    if (!wasOpen) focusables(el)[0]?.focus();
  }
  function close() {
    if (el.hidden) return;
    el.hidden = true; el.innerHTML = '';
    el.onchange = el.oninput = el.onclick = null;
    const back = opener; opener = null;
    const fn = onClose; onClose = () => {};
    back?.focus?.();                 // 호출 버튼으로 포커스를 되돌린다(§15.3)
    fn();
  }
  return {
    el, open, close, isOpen: () => !el.hidden, focusables: () => focusables(el),
    destroy() { document.removeEventListener('pointerdown', onDocDown, true); document.removeEventListener('keydown', onKey, true); window.removeEventListener('scroll', onScroll, true); el.remove(); },
  };
}
