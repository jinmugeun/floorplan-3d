// confirmDialog(계획 4)와 promptDialog(§13.8)의 공통 뼈대.
// 두 대화상자가 지켜야 할 것이 같다: ① 앱 전체에 모달은 하나뿐이다(두 번째 호출은 새 모달을 겹쳐
// 띄우지 않고 먼저 열린 것의 Promise를 그대로 돌려준다), ② 키를 캡처 단계에서 듣고 stopPropagation
// 해서 전역 단축키(도구 전환·저장·Ctrl+Z)로 새지 않는다, ③ [Tab]이 대화상자 안에서만 돈다,
// ④ close는 몇 번 불러도 한 번만 resolve한다.
// preventDefault는 Esc·Enter·Tab에만 부른다 — 입력란에 글자를 치는 것을 막으면 안 된다.

let current = null;   // { key, promise, focus() }

export const openDialogKey = () => current?.key ?? null;

// 포커스 가능한 요소의 정의는 한 곳이다(팝오버·컨텍스트 메뉴·모달이 같은 목록을 쓴다 — §15.3·§15.10).
// 걸러내는 것은 `hidden` 속성뿐이다 — CSS로만 숨긴 요소(display:none·visibility:hidden)는 순환에 남으므로
// 새로 숨기는 코드는 `hidden` 속성을 써야 한다(지금 숨기는 곳은 모두 속성을 쓴다).
export const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
export const focusables = root => [...(root?.querySelectorAll?.(FOCUSABLE) ?? [])].filter(el => !el.hidden && !el.closest('[hidden]'));

// [Tab]/[Shift+Tab]을 list 안에서만 돌린다. 처리했으면 true.
// 포커스가 목록 밖(또는 없음)이면 앞으로는 첫 번째, 뒤로는 마지막으로 간다.
export function trapTab(ev, list) {
  if (ev.key !== 'Tab') return false;
  const i = list.indexOf(document.activeElement);
  const next = ev.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i === list.length - 1 || i < 0 ? 0 : i + 1);
  list[next]?.focus();
  ev.preventDefault();
  return true;
}

// 같은 대화상자를 다시 열 때의 opener. 앞 인스턴스를 닫으면 포커스가 **그쪽** opener로 돌아가므로
// 닫기 전 포커스(prev)를 쓴다. 단 그 요소가 앞 인스턴스와 함께 사라졌으면(대화상자 안의 버튼으로
// 다시 열었을 때) 닫은 뒤의 포커스를 쓴다 — 어느 쪽이든 body로 떨어지지 않게(리뷰 Minor 1).
export const reopenOpener = prev => (prev?.isConnected ? prev : document.activeElement);

// 활성 트랩 스택. 모달 위에 confirm이 겹치면 **맨 나중에 열린(안쪽)** 트랩이 [Tab]을 갖는다.
// document 캡처로 듣기 때문에(포커스가 사라져도 살아 있게 — 아래 focusTrap 주석) 스택이 없으면
// 겹친 두 트랩이 같은 [Tab]을 두 번 처리해 포커스가 서로 튄다.
const traps = [];
const pushTrap = root => { const entry = { root }; traps.push(entry); return entry; };
const dropTrap = entry => { const i = traps.indexOf(entry); if (i >= 0) traps.splice(i, 1); };
// 이미 떼어낸 root의 트랩(해제를 놓친 것)은 건너뛴다 — 살아 있는 맨 위가 주인이다.
const topTrap = () => { for (let i = traps.length - 1; i >= 0; i--) if (traps[i].root.isConnected) return traps[i]; return null; };

// key: 'confirm' | 'prompt'. html은 .modal-card 한 장, focus는 열릴 때 포커스를 줄 요소의 선택자다.
export function openModal(key, { className = 'modal', html = '', focus = 'button', onKey = () => {}, onClick = () => {} } = {}) {
  if (current) { current.focus(); return current.promise; }
  const opener = document.activeElement;   // 닫을 때 포커스를 여기로 되돌린다(계획 4·5 이월 — §14.10)
  const root = document.createElement('div');
  root.className = className;
  root.innerHTML = html;
  document.body.appendChild(root);
  const entry = pushTrap(root);
  const focusFirst = () => {
    const el = root.querySelector(focus);
    el?.focus();
    el?.select?.();                       // 입력란이면 기본값을 통째로 골라 둔다(바로 덮어쓸 수 있게)
  };
  let done = false;
  let handler = null;
  const promise = new Promise(resolve => {
    const close = value => {
      if (done) return;                   // 버튼을 두 번 눌러도 한 번만 resolve한다
      done = true;
      document.removeEventListener('keydown', handler, true);
      dropTrap(entry);
      root.remove();
      current = null;
      opener?.focus?.();                   // 대화상자가 사라진 뒤 부른 버튼이 다시 포커스를 갖는다
      resolve(value);
    };
    // 포커스 목록의 정의는 FOCUSABLE 하나다(§15.10 — 팝오버·모달·시작 화면이 같은 규칙을 쓴다).
    const inside = () => focusables(root);
    const ctx = { root, close, focusables: inside };
    handler = ev => {
      if (topTrap() !== entry) return;    // 이 위에 또 모달이 열렸으면 그쪽이 먼저다
      ev.stopPropagation();
      if (trapTab(ev, inside())) return;
      onKey(ev, ctx);
    };
    document.addEventListener('keydown', handler, true);
    root.addEventListener('click', ev => onClick(ev, ctx));
  });
  focusFirst();
  current = { key, promise, focus: focusFirst };
  return promise;
}

// 자기 DOM을 직접 만드는 대화상자(설정·시방서·견적서·렌더샷·갤러리·배경·템플릿·층·아이템·마감재)와
// 시작 화면의 포커스 규칙(§15.10 · 감사 §3·§6). openModal이 confirm·prompt에 하던 일과 같다:
// ① 열 때 포커스를 안으로, ② [Tab]은 안에서만, ③ 닫을 때 이전 포커스로 복원.
// 키는 openModal처럼 document **캡처**에서 듣는다. root에서만 들으면 대화상자가 자기 안쪽을 다시 그려
// 포커스를 갖던 요소가 사라지는 순간(activeElement = body) 키가 root를 지나가지 않아 트랩이 조용히
// 멈췄다(갤러리에서 [삭제] → 목록 재렌더가 실제 경로였다. Esc로도 닫히지 않았다).
// 대신 포커스가 root 안이나 body일 때만 관여한다 — 팝오버·컨텍스트 메뉴처럼 밖에 있는 트랩과
// 다투지 않게(§15.3).
export function focusTrap(root, { focus = null, opener = document.activeElement } = {}) {
  const entry = pushTrap(root);
  const focusFirst = () => {
    const first = (typeof focus === 'string' ? root.querySelector(focus) : focus) ?? focusables(root)[0];
    first?.focus();
    // 입력란이면 값을 통째로 골라 둔다(바로 덮어쓸 수 있게 — openModal과 같은 규칙).
    try { first?.select?.(); } catch { /* 선택할 수 없는 입력(파일 등) */ }
  };
  const onKey = ev => {
    const active = document.activeElement;
    const mine = root.contains(active) || !active || active === document.body || active === document.documentElement;
    if (!root.isConnected || !mine || topTrap() !== entry) return;
    if (ev.key === 'Tab') { if (trapTab(ev, focusables(root))) ev.stopPropagation(); return; }
    if (root.contains(active)) return;   // 평소 경로: root에 걸린 핸들러(Esc 등)가 직접 받는다
    // 재렌더로 포커스가 사라진 뒤라 이 키는 root를 지나가지 않는다. 포커스를 안으로 되돌리고
    // 같은 키를 root에 한 번 전달한다 — 첫 Esc도 대화상자를 닫는다.
    ev.stopPropagation();
    focusables(root)[0]?.focus();
    root.dispatchEvent(new KeyboardEvent(ev.type, { key: ev.key, code: ev.code, shiftKey: ev.shiftKey, ctrlKey: ev.ctrlKey, altKey: ev.altKey, metaKey: ev.metaKey, bubbles: true, cancelable: true }));
  };
  document.addEventListener('keydown', onKey, true);
  focusFirst();
  let done = false;
  return {
    destroy() {
      if (done) return;   // close를 두 번 불러도 이미 딴 데로 간 포커스를 다시 빼앗지 않는다
      done = true;
      document.removeEventListener('keydown', onKey, true);
      dropTrap(entry);
      opener?.focus?.();   // 대화상자가 사라진 뒤 부른 버튼이 다시 포커스를 갖는다
    },
  };
}
