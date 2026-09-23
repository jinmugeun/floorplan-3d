// 렌더샷: 해상도와 뷰를 골라 오프스크린으로 한 장 렌더해 갤러리에 저장하고, [내려받기]로 파일을 받는다.
// 클라우드 렌더는 범위 밖이라 실시간 three 렌더를 고해상도로 한 장 뽑는 것으로 갈음한다.
import { addShot } from '../io/gallery.js';
import { downloadDataUrl, filenameFor } from '../io/file.js';
import { openGalleryDialog } from './galleryDialog.js';
import { focusTrap, reopenOpener } from './dialogBase.js';
import { SHOT_BUSY, OUTPUT_EMPTY_TITLE } from './messages.js';
import { activeFloor, floorIsEmpty } from '../state/schema.js';

export const RENDER_SIZES = [[1280, 720], [1920, 1080], [3840, 2160]];
export const RENDER_VIEWS = [['', '현재 카메라'], ['front', '정면'], ['back', '배면'], ['left', '좌측'], ['right', '우측'], ['top', '평면']];

let current = null;   // 열려 있는 인스턴스: 다시 열 때 DOM만 떼지 않고 트랩까지 해제한다(리뷰 Minor 1)

export function openRenderDialog({ store, view3d, onSaved = () => {}, onClose = () => {} }) {
  const prev = document.activeElement;   // 이번 opener는 앞 인스턴스를 닫은 뒤 reopenOpener가 정한다
  current?.close();                                      // 두 개를 띄우지 않는다
  document.querySelector('.modal.render')?.remove();     // 핸들이 없는 잔재도 떼어낸다
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
  let closed = false;
  const close = () => {
    if (closed) return;                                  // 두 번 불러도 한 번만 닫는다
    closed = true;
    if (current === self) current = null;
    root.remove(); trap.destroy(); onClose();
  };
  const self = { close };
  // 방금 렌더한 이미지와 **그때의 파일명**(내려받기 버튼이 쓴다 — §14.10).
  // 자동 내려받기는 §16.9에서 없앴다(사용자 클릭만) — 이름이 두 갈래로 갈리던 m-10도 함께 사라졌다.
  let last = null;   // { url, filename }

  // 렌더 중에는 버튼을 잠근다(§16.9 · 감사 §9): 예전에는 두 번 누르면 갤러리 항목 2개와
  // 다운로드 2개가 생겼다. 규칙은 specDialog의 run()과 같다.
  let busy = false;
  const buttons = () => [...root.querySelectorAll('[name="render"], [name="download"], [name="gallery"]')];
  // 빈 도면에서는 만들 것이 없다(§17.11(1) · 감사 §44 — 견적서만 갖고 있던 규칙이다).
  // 한 번만 칠하면 안 된다: render()의 finally가 buttons()를 전부 disabled = false로 되살리므로
  // 렌더가 한 번 돈 뒤에는 잠금과 사유 title이 사라진다(사전 검토 I-3). 판정을 함수로 두고
  // **열 때와 finally에서 함께** 부른다. [닫기]는 buttons()에 없으므로 늘 살아 있다.
  const empty = () => floorIsEmpty(activeFloor(store.get()));
  const syncEmpty = () => buttons().forEach(b => {
    b.disabled = empty();
    if (empty()) b.title = OUTPUT_EMPTY_TITLE; else b.removeAttribute('title');
  });
  syncEmpty();
  async function render() {
    if (busy) { part('msg').textContent = SHOT_BUSY; return; }
    busy = true;
    buttons().forEach(b => { b.disabled = true; });
    try {
      const [w, h] = st.size.split('×').map(Number);
      let url;
      try { url = view3d.renderImage({ width: w, height: h, preset: st.view || null }); }
      catch (e) { part('msg').textContent = `렌더에 실패했습니다: ${e.message}`; return; }
      const img = part('preview'); img.src = url; img.hidden = false;
      // 이름에 크기를 넣지 않는다(§16.9 · 감사 §11): 갤러리 캡션이 해상도 이름과 시각을 따로 적는다.
      const name = `${store.get().name} ${RENDER_VIEWS.find(v => v[0] === st.view)?.[1] ?? ''}`.replace(/\s+/g, ' ').trim();
      try {
        const shot = await addShot({ name, dataUrl: url, width: w, height: h });
        part('msg').textContent = '갤러리에 저장했습니다. [내려받기]로 파일을 받을 수 있습니다.';
        onSaved(shot);
      } catch (e) { part('msg').textContent = `갤러리에 저장하지 못했습니다: ${e.message}`; }
      // 자동 다운로드를 하지 않는다(§16.9): 버튼과 자동 저장이 같은 그림을 두 번 내려받았다.
      last = { url, filename: filenameFor(store.get()).replace(/\.json$/, `-${w}x${h}.png`) };
      root.querySelector('[name="download"]').hidden = false;
    } finally {
      busy = false;
      syncEmpty();   // 빈 도면이면 다시 잠근다(같은 판정 한 곳 — 사전 검토 I-3)
    }
  }
  root.addEventListener('click', ev => {
    if (ev.target.name === 'close') { close(); return; }
    if (ev.target.name === 'gallery') { openGalleryDialog({}); return; }
    if (ev.target.name === 'download' && last) { downloadDataUrl(last.filename, last.url); return; }
    if (ev.target.name === 'render') render();
  });
  root.addEventListener('change', ev => { if (ev.target.name in st) st[ev.target.name] = ev.target.value; });
  root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
  // 첫 포커스는 모달 다섯이 같다(§17.11(2) · 감사 §29): [렌더]에 들어가면 습관적인 [Enter]가
  // 곧바로 렌더를 돌린다(되돌릴 수 없는 부작용 — 갤러리에 항목이 쌓인다).
  const trap = focusTrap(root, { focus: '[name="close"]', opener: reopenOpener(prev) });   // §15.10
  current = self;
  return self;
}
