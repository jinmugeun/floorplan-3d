import { addFloor, renameFloor } from '../state/floorOps.js';
import { esc } from '../util/html.js';

const COPY_OPTIONS = [['none', '없음'], ['plan', '도면만'], ['all', '전체']];

export function openFloorDialog({ store, mode = 'add', index = null, onClose = () => {} }) {
  const p = store.get();
  const current = mode === 'rename' ? (p.floors[index]?.name ?? '') : `Floor ${p.floors.length + 1}`;
  const root = document.createElement('div');
  root.className = 'modal';
  root.innerHTML = `<div class="modal-card narrow">
    <header><h2>${mode === 'rename' ? '층 이름 변경' : '층 추가하기'}</h2><button type="button" name="close" aria-label="닫기">✕</button></header>
    <label class="field"><span>이름</span><input type="text" name="floorName" value="${esc(current)}"></label>
    ${mode === 'rename' ? '' : `<fieldset class="field"><legend>복사 옵션</legend>${COPY_OPTIONS.map(([v, l], i) => `<label class="check"><input type="radio" name="copy" value="${v}" ${i === 0 ? 'checked' : ''}> ${l}</label>`).join('')}</fieldset>`}
    <p class="error" name="error" hidden>이름을 입력해 주세요</p>
    <div class="toolbar"><button type="button" name="submit" class="primary">${mode === 'rename' ? '변경' : '추가'}</button></div>
  </div>`;
  document.body.appendChild(root);
  const q = s => root.querySelector(`[name="${s}"]`);
  const close = () => { root.remove(); onClose(); };
  q('close').onclick = close;
  q('submit').onclick = () => {
    const name = q('floorName').value.trim();
    if (!name) { q('error').hidden = false; return; }
    if (mode === 'rename') renameFloor(store, index, name);
    else addFloor(store, { name, copy: root.querySelector('[name="copy"]:checked').value });
    close();
  };
  // Enter로 확정, Esc로 닫기(폼 없이 만든 대화상자라 직접 처리한다).
  // 한글 조합 중의 Enter는 "글자 확정"이라 여기서 거른다(M-1).
  root.addEventListener('keydown', ev => { if (ev.isComposing || ev.keyCode === 229) return; if (ev.key === 'Enter') { ev.preventDefault(); q('submit').click(); } else if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
  q('floorName').focus();
  return { close };
}
