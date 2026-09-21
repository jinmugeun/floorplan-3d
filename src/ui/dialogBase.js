// confirmDialog(계획 4)와 promptDialog(§13.8)의 공통 뼈대.
// 두 대화상자가 지켜야 할 것이 같다: ① 앱 전체에 모달은 하나뿐이다(두 번째 호출은 새 모달을 겹쳐
// 띄우지 않고 먼저 열린 것의 Promise를 그대로 돌려준다), ② 키를 캡처 단계에서 듣고 stopPropagation
// 해서 전역 단축키(도구 전환·저장·Ctrl+Z)로 새지 않는다, ③ [Tab]이 대화상자 안에서만 돈다,
// ④ close는 몇 번 불러도 한 번만 resolve한다.
// preventDefault는 Esc·Enter·Tab에만 부른다 — 입력란에 글자를 치는 것을 막으면 안 된다.

let current = null;   // { key, promise, focus() }

export const openDialogKey = () => current?.key ?? null;

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

// key: 'confirm' | 'prompt'. html은 .modal-card 한 장, focus는 열릴 때 포커스를 줄 요소의 선택자다.
export function openModal(key, { className = 'modal', html = '', focus = 'button', onKey = () => {}, onClick = () => {} } = {}) {
  if (current) { current.focus(); return current.promise; }
  const opener = document.activeElement;   // 닫을 때 포커스를 여기로 되돌린다(계획 4·5 이월 — §14.10)
  const root = document.createElement('div');
  root.className = className;
  root.innerHTML = html;
  document.body.appendChild(root);
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
      root.remove();
      current = null;
      opener?.focus?.();                   // 대화상자가 사라진 뒤 부른 버튼이 다시 포커스를 갖는다
      resolve(value);
    };
    const focusables = () => [...root.querySelectorAll('input, button')];
    const ctx = { root, close, focusables };
    handler = ev => {
      ev.stopPropagation();
      if (trapTab(ev, focusables())) return;
      onKey(ev, ctx);
    };
    document.addEventListener('keydown', handler, true);
    root.addEventListener('click', ev => onClick(ev, ctx));
  });
  focusFirst();
  current = { key, promise, focus: focusFirst };
  return promise;
}
