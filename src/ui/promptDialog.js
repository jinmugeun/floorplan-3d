// 이름 입력 대화상자(§13.8). prompt()는 브라우저마다 모양이 다르고 검증을 붙일 수 없어
// 잘못된 이름을 받은 뒤에야 알려 줄 수밖에 없었다. 앱 안의 모달로 바꾼다.
// [Esc]·[취소] = null, [Enter]·[확인] = 입력 문자열. validate가 문구를 돌려주면 확인이 막힌다.
import { esc } from '../util/html.js';
import { openModal } from './dialogBase.js';

export function promptDialog({ title = '이름 입력', label = '이름', value = '', ok = '확인', cancel = '취소', validate = null } = {}) {
  const html = `<div class="modal-card narrow" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header><h2>${esc(title)}</h2></header>
    <div class="modal-body">
      <label class="field"><span>${esc(label)}</span><input type="text" name="text" value="${esc(value)}"></label>
      <p class="error" data-part="error"></p>
    </div>
    <div class="toolbar">
      <button type="button" name="cancel">${esc(cancel)}</button>
      <button type="button" name="ok" class="primary">${esc(ok)}</button>
    </div>
  </div>`;
  const read = root => root.querySelector('[name="text"]').value;
  // 오류 문구를 화면에 반영하고, 막아야 하면 그 문구를 돌려준다(통과면 null).
  const check = root => {
    const msg = (validate ? validate(read(root)) : null) ?? null;
    root.querySelector('[data-part="error"]').textContent = msg ?? '';
    return msg;
  };
  return openModal('prompt', {
    className: 'modal prompt',
    html,
    focus: '[name="text"]',
    onKey(ev, { root, close }) {
      // 한글 조합 중의 확정 [Enter]는 isComposing으로 한 번 먼저 온다: 그 키로 닫으면 한 박자 일찍 닫힌다
      // (keymap.js:112·shell.js:229와 같은 방어 — M-1).
      if (ev.isComposing || ev.keyCode === 229) return;
      if (ev.key === 'Escape') { ev.preventDefault(); close(null); return; }
      if (ev.key !== 'Enter') return;      // 글자 키는 입력란이 그대로 받는다(막지 않는다)
      ev.preventDefault();
      if (check(root)) return;
      close(read(root));
    },
    onClick(ev, { root, close }) {
      const name = ev.target?.name;
      if (name === 'cancel') { close(null); return; }
      if (name !== 'ok') return;
      if (check(root)) return;
      close(read(root));
    },
  });
}
