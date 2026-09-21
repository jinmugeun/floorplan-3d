// 인앱 확인 대화상자(아키텍처 §12.5). 브라우저 기본 확인창은 브라우저마다 다른 모양으로 뜨고, 문구를
// 꾸밀 수 없고, 창 위쪽에 붙어 캔버스 작업 흐름을 끊는다. 앱 안의 모달로 바꾼다.
// [Esc] = 취소, [Enter] = 확인, [Tab]은 두 버튼 사이만 돈다(포커스 트랩).
import { esc } from '../util/html.js';

// 같은 확인이 세 곳(삭제 도구 · 선택 삭제 · 방 우클릭 메뉴)에서 쓰인다 — 문구가 갈라지지 않게 상수로 둔다.
export const CONFIRM_ROOM_DELETE = { title: '방 삭제', message: '방과 그 벽을 모두 삭제할까요?', ok: '삭제', danger: true };

// 열려 있는 대화상자(있다면 하나뿐이다) — 두 번째 호출이 새 모달을 겹쳐 띄우지 않게 막는다.
let openDialog = null; // { promise, focus() }

export function confirmDialog({ title = '확인', message = '', ok = '확인', cancel = '취소', danger = false } = {}) {
  if (openDialog) {                          // 이미 열려 있으면 같은 Promise를 돌려주고 포커스만 되돌린다
    openDialog.focus();
    return openDialog.promise;
  }
  const root = document.createElement('div');
  root.className = 'modal confirm';
  root.innerHTML = `<div class="modal-card narrow" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header><h2>${esc(title)}</h2></header>
    <p class="modal-body">${esc(message)}</p>
    <div class="toolbar">
      <button type="button" name="cancel">${esc(cancel)}</button>
      <button type="button" name="ok" class="${danger ? 'danger' : 'primary'}">${esc(ok)}</button>
    </div>
  </div>`;
  document.body.appendChild(root);
  const focusOk = () => root.querySelector('[name="ok"]')?.focus();
  let done = false;
  const promise = new Promise(resolve => {
    const close = value => {
      if (done) return;                       // 버튼을 두 번 눌러도 한 번만 resolve한다
      done = true;
      document.removeEventListener('keydown', onKey, true);
      root.remove();
      openDialog = null;
      resolve(value);
    };
    const buttons = () => [...root.querySelectorAll('button')];
    // 캡처 단계에서 듣고 멈춘다: 열려 있는 동안은 어떤 키도 전역 단축키(도구 전환·저장·Ctrl+Z)까지
    // 내려가지 않는다 — 이 대화상자에는 텍스트 입력이 없으므로 전부 삼켜도 잃을 동작이 없다.
    function onKey(ev) {
      ev.stopPropagation();
      if (ev.key === 'Escape') { ev.preventDefault(); close(false); return; }
      if (ev.key === 'Enter') { ev.preventDefault(); close(true); return; }
      if (ev.key !== 'Tab') return;
      const bs = buttons();
      const i = bs.indexOf(document.activeElement);
      const next = ev.shiftKey ? (i <= 0 ? bs.length - 1 : i - 1) : (i === bs.length - 1 || i < 0 ? 0 : i + 1);
      bs[next]?.focus();
      ev.preventDefault();
    }
    document.addEventListener('keydown', onKey, true);
    root.addEventListener('click', ev => {
      const name = ev.target?.name;
      if (name === 'ok') close(true);
      else if (name === 'cancel') close(false);
    });
  });
  focusOk();
  openDialog = { promise, focus: focusOk };
  return promise;
}
