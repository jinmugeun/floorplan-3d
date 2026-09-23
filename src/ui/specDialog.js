// 시방서 대화상자: 용지·구역 옵션을 고르고, 도면 이미지를 만들어 인쇄하거나 HTML로 내려받는다.
import { specHtml, SPEC_SECTIONS, PAPER } from '../io/specSheet.js';
import { activeFloor, floorIsEmpty } from '../state/schema.js';
import { elevationAspect, planExtent, topViewAspect } from '../geom/elevation.js';   // 그림 비율의 정본(리뷰 M-7·M-9)
import { capture2D, downloadText, filenameFor, printBodyPx } from '../io/file.js';
import { printHtml } from '../io/printWindow.js';
import { toast } from './toast.js';
import { POPUP_BLOCKED, SPEC_IMAGES_FAIL, SPEC_FAIL, OUTPUT_EMPTY_TITLE } from './messages.js';
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
    <!-- 제목 블록 칸(§16.11 · 감사 §8): 인쇄물이 도면으로 읽히려면 이 셋이 있어야 한다. -->
    <div class="row">
      <label class="field"><span>도면번호</span><input type="text" name="sheetNumber" placeholder="M-106"></label>
      <label class="field"><span>작성자</span><input type="text" name="sheetAuthor"></label>
      <label class="field"><span>현장</span><input type="text" name="sheetSite"></label>
    </div>
    <label class="field"><span>비고</span><textarea name="notes" rows="3" placeholder="현장 주의 사항을 적습니다"></textarea></label>
    <p class="hint" data-part="msg"></p>
    <div class="toolbar"><button type="button" name="download">HTML 내려받기</button><button type="button" name="print" class="primary">미리보기/인쇄</button></div>
  </div>`;
  document.body.appendChild(root);

  const part = n => root.querySelector(`[data-part="${n}"]`);
  const buttons = [...root.querySelectorAll('[name="download"], [name="print"]')];
  // 빈 도면에서는 만들 것이 없다(§17.11(1) · 감사 §44 — 견적서만 갖고 있던 규칙이다).
  // [닫기]는 buttons에 없으므로 늘 살아 있다. 판정은 함수로 두고 **열 때와 run()의 finally에서
  // 함께** 부른다(리뷰 m-10): finally가 무조건 disabled = false로 되살리면 한 번 돌린 뒤 잠금과
  // 사유 title이 사라진다 — 렌더샷 대화상자의 syncEmpty와 같은 계약이어야 한다.
  const syncEmpty = () => buttons.forEach(b => {
    b.disabled = floorIsEmpty(activeFloor(store.get()));
    if (b.disabled) b.title = OUTPUT_EMPTY_TITLE; else b.removeAttribute('title');
  });
  syncEmpty();
  const close = () => { root.remove(); trap.destroy(); if (current === self) current = null; onClose(); };
  const self = { close };

  // 옵션은 DOM에서 그때그때 읽는다(따로 상태를 들고 있지 않으니 어긋날 일이 없다).
  const readOptions = () => ({
    paper: root.querySelector('[name="paper"]').value,
    landscape: root.querySelector('[name="landscape"]').checked,
    sections: Object.fromEntries(SPEC_SECTIONS.map(([k]) => [k, root.querySelector(`[data-section="${k}"]`).checked])),
    notes: root.querySelector('[name="notes"]').value,
    sheet: {
      number: root.querySelector('[name="sheetNumber"]').value,
      author: root.querySelector('[name="sheetAuthor"]').value,
      site: root.querySelector('[name="sheetSite"]').value,
    },
  });

  // 평면도는 2D 캡처, 입면도는 3D 직교 렌더로 만든다. 실패한 이미지는 그 자리를 비우고 알리기만 한다.
  // 평면도는 **인쇄 배율**로 캡처한다(§16.11 · 감사 §7): 논리 폭을 용지 본문 폭으로 두어 치수·공간
  // 이름이 인쇄물에서도 12 px로 읽히게 하고, 비트맵만 2배로 키워 선명하게 만든다.
  async function buildImages(sections, { paper = 'A4', landscape = false } = {}) {
    const images = {};
    let failed = 0;
    if (sections.plan) { try { images.plan = await capture2D(store, ui, { cssWidth: printBodyPx(paper, landscape), ratio: 2 }); } catch { failed += 1; } }
    if (sections.elevations) {
      // 평면도와 같은 배율 규칙(§17.4(2)): 논리 폭은 본문 폭, 비트맵은 그 2배다. A4 세로에서
      // 폭 1530 px → 본문 765 px = 배율 0.5. 높이는 **내용 비율**이 정한다(§17.4(2) 개정 · 리뷰
      // 재검토): 16:9로 고정하면 20 m 도면이 그림의 27%만 채우고 나머지가 빈 종이였다. 시방서의
      // 바닥선·천장선도 같은 elevationAspect를 쓰므로 선과 사진이 같은 프레임을 본다.
      const f = activeFloor(store.get());
      const width = printBodyPx(paper, landscape) * 2;
      const elevH = Math.round(width / elevationAspect({ extent: planExtent(f.walls), height: f.height ?? 0 }));
      // 천장 평면도만 **평면 자신의 비율**로 잰다(재리뷰 2 N-2): 그것은 입면이 아니라 평면이라
      // 층고와 무관하다. 입면 비율을 물려받던 동안 5.71:1 도면의 천장 평면도가 117 × 108 px로
      // 인쇄되고 폭의 85%가 빈 종이였다 — 절은 그대로 두고 높이만 제 비율로 되돌린다.
      const topH = Math.round(width / topViewAspect(f.walls));
      for (const preset of ELEV) {
        const height = preset === 'top' ? topH : elevH;
        try { images[preset] = view3d.renderImage({ width, height, preset }); } catch { failed += 1; }
      }
    }
    if (failed) toast(SPEC_IMAGES_FAIL(failed));
    return images;
  }

  async function html() {
    part('msg').textContent = '도면 이미지를 만들고 있습니다…';
    const options = readOptions();
    const images = await buildImages(options.sections, { paper: options.paper, landscape: options.landscape });
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
    finally { busy = false; syncEmpty(); }   // 빈 도면이면 다시 잠근다(같은 판정 한 곳 — 리뷰 m-10)
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
