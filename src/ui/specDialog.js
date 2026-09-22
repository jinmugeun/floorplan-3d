// 시방서 대화상자: 용지·구역 옵션을 고르고, 도면 이미지를 만들어 인쇄하거나 HTML로 내려받는다.
import { specHtml, SPEC_SECTIONS, PAPER } from '../io/specSheet.js';
import { capture2D, downloadText, filenameFor } from '../io/file.js';
import { printHtml } from '../io/printWindow.js';
import { toast } from './toast.js';
import { POPUP_BLOCKED, SPEC_IMAGES_FAIL, SPEC_FAIL } from './messages.js';
import { esc } from '../util/html.js';
import { focusTrap, reopenOpener } from './dialogBase.js';

const ELEV = ['front', 'back', 'left', 'right', 'top'];   // 3D 직교 렌더 프리셋(입면도 5장)

let current = null;                                        // 한 번에 하나만 띄운다

export function openSpecDialog({ store, ui, view3d, onClose = () => {} }) {
  const prev = document.activeElement;   // 이번 opener는 앞 인스턴스를 닫은 뒤 reopenOpener가 정한다
  current?.close();

  const root = document.createElement('div');
  root.className = 'modal spec';
  root.innerHTML = `<div class="modal-card">
    <header><h2>시방서</h2><button type="button" name="close" aria-label="닫기">✕</button></header>
    <div class="row">
      <label class="field"><span>용지</span><select name="paper">${Object.keys(PAPER).map(k => `<option value="${k}">${k}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" name="landscape"> 가로 방향</label>
    </div>
    <div class="spec-sections">${SPEC_SECTIONS.map(([k, l]) => `<label class="check"><input type="checkbox" data-section="${k}" checked> ${esc(l)}</label>`).join('')}</div>
    <label class="field"><span>비고</span><textarea name="notes" rows="3" placeholder="현장 주의 사항을 적습니다"></textarea></label>
    <p class="hint" data-part="msg"></p>
    <div class="toolbar"><button type="button" name="download">HTML 내려받기</button><button type="button" name="print" class="primary">미리보기/인쇄</button></div>
  </div>`;
  document.body.appendChild(root);

  const part = n => root.querySelector(`[data-part="${n}"]`);
  const buttons = [...root.querySelectorAll('[name="download"], [name="print"]')];
  const close = () => { root.remove(); trap.destroy(); if (current === self) current = null; onClose(); };
  const self = { close };

  // 옵션은 DOM에서 그때그때 읽는다(따로 상태를 들고 있지 않으니 어긋날 일이 없다).
  const readOptions = () => ({
    paper: root.querySelector('[name="paper"]').value,
    landscape: root.querySelector('[name="landscape"]').checked,
    sections: Object.fromEntries(SPEC_SECTIONS.map(([k]) => [k, root.querySelector(`[data-section="${k}"]`).checked])),
    notes: root.querySelector('[name="notes"]').value,
  });

  // 평면도는 2D 캡처, 입면도는 3D 직교 렌더로 만든다. 실패한 이미지는 그 자리를 비우고 알리기만 한다.
  async function buildImages(sections) {
    const images = {};
    let failed = 0;
    if (sections.plan) { try { images.plan = await capture2D(store, ui); } catch { failed += 1; } }
    if (sections.elevations) {
      for (const preset of ELEV) {
        try { images[preset] = view3d.renderImage({ width: 1600, height: 900, preset }); } catch { failed += 1; }
      }
    }
    if (failed) toast(SPEC_IMAGES_FAIL(failed));
    return images;
  }

  async function html() {
    part('msg').textContent = '도면 이미지를 만들고 있습니다…';
    const options = readOptions();
    const images = await buildImages(options.sections);
    part('msg').textContent = '';
    const p = store.get();
    return specHtml({ project: p, floorIndex: p.activeFloor ?? 0, images, options });
  }

  let busy = false;                                        // 렌더 중에는 버튼을 잠근다(중복 캡처 방지)
  async function run(fn) {
    if (busy) return;
    busy = true;
    buttons.forEach(b => { b.disabled = true; });
    try { await fn(); }
    catch (e) { part('msg').textContent = ''; toast(SPEC_FAIL(e.message)); }
    finally { busy = false; buttons.forEach(b => { b.disabled = false; }); }
  }

  root.addEventListener('click', ev => {
    const name = ev.target.name;
    if (name === 'close') { close(); return; }
    if (name === 'download') { run(async () => downloadText(filenameFor(store.get()).replace(/\.json$/, '-시방서.html'), await html())); return; }
    if (name === 'print') {
      run(async () => {
        const body = await html();
        if (!printHtml(body, { title: '시방서' })) {
          part('msg').textContent = '팝업이 막혀 인쇄할 수 없습니다. HTML 내려받기를 쓰세요.';
          toast(POPUP_BLOCKED);
        }
      });
    }
  });
  root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
  const trap = focusTrap(root, { focus: '[name="close"]', opener: reopenOpener(prev) });   // §15.10
  current = self;
  return self;
}
