// 갤러리: 저장된 렌더샷을 썸네일 격자로 보여주고 내려받기·삭제한다.
import { listShots, deleteShot } from '../io/gallery.js';
import { downloadDataUrl } from '../io/file.js';
import { esc } from '../util/html.js';
import { toast } from './toast.js';
import { focusTrap } from './dialogBase.js';

export function openGalleryDialog({ onClose = () => {} } = {}) {
  const existing = document.querySelector('.modal.gallery');
  if (existing) existing.remove();                       // 두 개를 띄우지 않는다
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
      part('grid').innerHTML = `<p class="hint">갤러리를 불러오지 못했습니다: ${esc(e.message)}</p>`;
      toast('갤러리를 불러오지 못했습니다');
      return;
    }
    part('grid').innerHTML = shots.length ? shots.map(s => `<figure class="shot" data-shot="${esc(s.id)}">
      <img src="${esc(s.dataUrl)}" alt="${esc(s.name)}">
      <figcaption><b>${esc(s.name)}</b><span class="muted">${s.width}×${s.height}</span></figcaption>
      <div class="row"><button type="button" name="down">내려받기</button><button type="button" name="del" class="danger">삭제</button></div>
    </figure>`).join('') : '<p class="hint">저장된 렌더샷이 없습니다. 상단 바의 [렌더샷]으로 만들 수 있습니다.</p>';
  }
  const close = () => { root.remove(); trap.destroy(); onClose(); };
  root.addEventListener('click', async ev => {
    if (ev.target.name === 'close') { close(); return; }
    const fig = ev.target.closest('[data-shot]');
    if (!fig) return;
    const shot = shots.find(s => s.id === fig.dataset.shot);
    if (!shot) return;
    if (ev.target.name === 'down') { downloadDataUrl(`${shot.name.replace(/[\/:*?"<>|]/g, '_')}.png`, shot.dataUrl); return; }
    if (ev.target.name === 'del') {
      try { await deleteShot(shot.id); await render(); }
      catch { toast('삭제하지 못했습니다'); }
    }
  });
  root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
  const trap = focusTrap(root, { focus: '[name="close"]' });   // 포커스를 가져와야 Escape 처리가 걸린다(§15.10)
  render();
  return { close };
}
