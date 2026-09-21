// 인앱 확인 대화상자(아키텍처 §12.5). 브라우저 기본 확인창은 브라우저마다 다른 모양으로 뜨고, 문구를
// 꾸밀 수 없고, 창 위쪽에 붙어 캔버스 작업 흐름을 끊는다. 앱 안의 모달로 바꾼다.
// [Esc] = 취소, [Enter] = 확인, [Tab]은 두 버튼 사이만 돈다(포커스 트랩).
// 모달 하나 규칙·키 캡처·포커스 트랩은 promptDialog와 같으므로 dialogBase.js가 맡는다(§13.8).
import { esc } from '../util/html.js';
import { openModal } from './dialogBase.js';

// 같은 확인이 세 곳(삭제 도구 · 선택 삭제 · 방 우클릭 메뉴)에서 쓰인다 — 문구가 갈라지지 않게 상수로 둔다.
export const CONFIRM_ROOM_DELETE = { title: '방 삭제', message: '방과 그 벽을 모두 삭제할까요?', ok: '삭제', danger: true };

export function confirmDialog({ title = '확인', message = '', ok = '확인', cancel = '취소', danger = false } = {}) {
  const html = `<div class="modal-card narrow" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header><h2>${esc(title)}</h2></header>
    <p class="modal-body">${esc(message)}</p>
    <div class="toolbar">
      <button type="button" name="cancel">${esc(cancel)}</button>
      <button type="button" name="ok" class="${danger ? 'danger' : 'primary'}">${esc(ok)}</button>
    </div>
  </div>`;
  return openModal('confirm', {
    className: 'modal confirm',
    html,
    focus: '[name="ok"]',
    // 이 대화상자에는 텍스트 입력이 없으므로 Esc·Enter·Tab 밖의 키도 그냥 삼킨다(openModal이 이미 멈췄다).
    onKey(ev, { close }) {
      if (ev.key === 'Escape') { ev.preventDefault(); close(false); return; }
      if (ev.key === 'Enter') { ev.preventDefault(); close(true); }
    },
    onClick(ev, { close }) {
      const name = ev.target?.name;
      if (name === 'ok') close(true);
      else if (name === 'cancel') close(false);
    },
  });
}
