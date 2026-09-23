// 갤러리: 저장된 렌더샷을 썸네일 격자로 보여주고 내려받기·삭제한다.
import { listShots, deleteShot, shotCaption } from '../io/gallery.js';
import { downloadDataUrl } from '../io/file.js';
import { esc } from '../util/html.js';
import { toast } from './toast.js';
import { confirmDialog } from './confirmDialog.js';
import { GALLERY_LOAD_FAIL, GALLERY_DELETE_FAIL, CONFIRM_SHOT_DELETE } from './messages.js';
import { focusTrap, reopenOpener } from './dialogBase.js';

let current = null;   // 열려 있는 인스턴스: 다시 열 때 DOM만 떼지 않고 트랩까지 해제한다(리뷰 Minor 1)

export function openGalleryDialog({ onClose = () => {} } = {}) {
  const prev = document.activeElement;   // 이번 opener는 앞 인스턴스를 닫은 뒤 reopenOpener가 정한다
  current?.close();                                      // 두 개를 띄우지 않는다
  document.querySelector('.modal.gallery')?.remove();    // 핸들이 없는 잔재도 떼어낸다
  const root = document.createElement('div');
  root.className = 'modal gallery';
  root.innerHTML = `<div class="modal-card">
    <header><h2>갤러리</h2><button type="button" name="close" aria-label="닫기">✕</button></header>
    <div class="shot-grid" data-part="grid"><p class="hint">불러오는 중…</p></div>
  </div>`;
  document.body.appendChild(root);
  const part = n => root.querySelector(`[data-part="${n}"]`);
  let shots = [];
  async function render() {
    try { shots = await listShots(); }
    catch (e) {
      shots = [];
      part('grid').innerHTML = `<p class="hint">${GALLERY_LOAD_FAIL}: ${esc(e.message)}</p>`;
      toast(GALLERY_LOAD_FAIL);
      return;
    }
    // 캡션은 "이름 / 해상도 이름 · 저장 시각"이다(§16.9 · 감사 §11): 크기를 두 번 적지 않는다.
    part('grid').innerHTML = shots.length ? shots.map(s => `<figure class="shot" data-shot="${esc(s.id)}">
      <img src="${esc(s.dataUrl)}" alt="${esc(s.name)}">
      <figcaption><b>${esc(s.name)}</b><span class="muted">${esc(shotCaption(s))}</span></figcaption>
      <div class="row"><button type="button" name="down">내려받기</button><button type="button" name="del" class="danger">삭제</button></div>
    </figure>`).join('') : '<p class="hint">저장된 렌더샷이 없습니다. 상단 바의 [렌더샷]으로 만들 수 있습니다.</p>';
  }
  let closed = false;
  const close = () => {
    if (closed) return;                                  // 두 번 불러도 한 번만 닫는다
    closed = true;
    if (current === self) current = null;
    root.remove(); trap.destroy(); onClose();
  };
  const self = { close };
  root.addEventListener('click', async ev => {
    if (ev.target.name === 'close') { close(); return; }
    const fig = ev.target.closest('[data-shot]');
    if (!fig) return;
    const shot = shots.find(s => s.id === fig.dataset.shot);
    if (!shot) return;
    if (ev.target.name === 'down') { downloadDataUrl(`${shot.name.replace(/[\/:*?"<>|]/g, '_')}.png`, shot.dataUrl); return; }
    if (ev.target.name === 'del') {
      // 확인 없이 지우던 자리다(§16.9 · 감사 §11). 되돌릴 길이 없는 삭제이므로 확인을 받는다.
      if (!(await confirmDialog(CONFIRM_SHOT_DELETE))) return;
      try { await deleteShot(shot.id); await render(); }
      catch { toast(GALLERY_DELETE_FAIL); }
    }
  });
  root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
  const trap = focusTrap(root, { focus: '[name="close"]', opener: reopenOpener(prev) });   // 포커스를 가져와야 Escape 처리가 걸린다(§15.10)
  render();
  current = self;
  return self;
}
