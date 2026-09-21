// 렌더샷: 해상도와 뷰를 골라 오프스크린으로 한 장 렌더하고, 갤러리에 저장하면서 내려받는다.
// 클라우드 렌더는 범위 밖이라 실시간 three 렌더를 고해상도로 한 장 뽑는 것으로 갈음한다.
import { addShot } from '../io/gallery.js';
import { downloadDataUrl, filenameFor } from '../io/file.js';
import { openGalleryDialog } from './galleryDialog.js';

export const RENDER_SIZES = [[1280, 720], [1920, 1080], [3840, 2160]];
export const RENDER_VIEWS = [['', '현재 카메라'], ['front', '정면'], ['back', '배면'], ['left', '좌측'], ['right', '우측'], ['top', '평면']];

export function openRenderDialog({ store, view3d, onSaved = () => {}, onClose = () => {} }) {
  const existing = document.querySelector('.modal.render');
  if (existing) existing.remove();                       // 두 개를 띄우지 않는다
  const st = { size: '1920×1080', view: '' };
  const root = document.createElement('div');
  root.className = 'modal render';
  root.innerHTML = `<div class="modal-card">
    <header><h2>렌더샷</h2><button type="button" name="close" aria-label="닫기">✕</button></header>
    <div class="row">
      <label class="field"><span>해상도</span><select name="size">${RENDER_SIZES.map(([w, h]) => `<option value="${w}×${h}" ${`${w}×${h}` === st.size ? 'selected' : ''}>${w}×${h}</option>`).join('')}</select></label>
      <label class="field"><span>뷰</span><select name="view">${RENDER_VIEWS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
    </div>
    <img data-part="preview" alt="렌더 결과 미리보기" hidden>
    <p class="hint" data-part="msg">해상도가 높으면 몇 초 걸릴 수 있습니다.</p>
    <div class="toolbar"><button type="button" name="download" hidden>내려받기</button><button type="button" name="gallery">갤러리 열기</button><button type="button" name="render" class="primary">렌더</button></div>
  </div>`;
  document.body.appendChild(root);
  const part = n => root.querySelector(`[data-part="${n}"]`);
  const close = () => { root.remove(); onClose(); };
  let lastUrl = null;   // 방금 렌더한 이미지(내려받기 버튼이 쓴다 — §14.10)

  async function render() {
    const [w, h] = st.size.split('×').map(Number);
    let url;
    try { url = view3d.renderImage({ width: w, height: h, preset: st.view || null }); }
    catch (e) { part('msg').textContent = `렌더에 실패했습니다: ${e.message}`; return; }
    const img = part('preview'); img.src = url; img.hidden = false;
    const name = `${store.get().name} ${RENDER_VIEWS.find(v => v[0] === st.view)?.[1] ?? ''} ${w}×${h}`.replace(/\s+/g, ' ').trim();
    try {
      const shot = await addShot({ name, dataUrl: url, width: w, height: h });
      part('msg').textContent = '갤러리에 저장했습니다.';
      onSaved(shot);
    } catch (e) { part('msg').textContent = `갤러리에 저장하지 못했습니다: ${e.message}`; }
    downloadDataUrl(filenameFor(store.get()).replace(/\.json$/, `-${w}x${h}.png`), url);
    lastUrl = url;
    root.querySelector('[name="download"]').hidden = false;
  }
  root.addEventListener('click', ev => {
    if (ev.target.name === 'close') { close(); return; }
    if (ev.target.name === 'gallery') { openGalleryDialog({}); return; }
    if (ev.target.name === 'download' && lastUrl) { downloadDataUrl(filenameFor(store.get()).replace(/\.json$/, '.png'), lastUrl); return; }
    if (ev.target.name === 'render') render();
  });
  root.addEventListener('change', ev => { if (ev.target.name in st) st[ev.target.name] = ev.target.value; });
  root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
  root.querySelector('[name="render"]').focus();
  return { close };
}
