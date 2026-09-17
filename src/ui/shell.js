import { esc } from '../util/html.js';
import { toast } from './toast.js';
import { createPopover } from './popover.js';
import { viewPopoverHtml, cameraPopoverHtml, sunPopoverHtml } from './viewOptions.js';


const LABELS = { reference: '기준선', thickness: '두께', snap: '스냅 모드', ortho: '직교 모드', direction: '방향' };
// 길이 옵션은 라벨에 현재 단위를 붙인다. 입력값은 아직 mm 숫자 그대로다(ft·in 입력란은 2B에서).
const LEN_OPTS = new Set(['thickness']);
const unitLabel = units => (units === 'ftin' ? 'ft·in' : 'mm');
const REF = [['center', '중심선'], ['inner', '내벽선'], ['outer', '외벽선']];

export function createShell(root, { store, ui }) {
  root.innerHTML = `
  <div id="layout">
    <header id="topbar">
      <div class="group"><button id="btnUndo" aria-label="실행 취소">↶</button><button id="btnRedo" aria-label="다시 실행">↷</button></div>
      <div class="group"><input id="projectName" aria-label="프로젝트 이름" value="${esc(store.get().name)}"><span id="savedAt" class="muted">저장 이력 없음</span></div>
      <div class="group"><button id="btnSettings" aria-label="설정">설정</button><button id="btnCapture" data-action="capture">캡처</button><button id="btnLoad">불러오기</button><button id="btnSave" class="primary">저장</button></div>
    </header>
    <nav id="rail" aria-label="작업 영역">
      <button data-panel="draw" class="on"><span>도면 그리기</span></button>
      <button data-panel="products"><span>제품</span></button>
      <button data-panel="background"><span>배경 도면</span></button>
      <button data-panel="layers"><span>레이어</span></button>
    </nav>
    <aside id="panel">
      <section data-panel="draw">
        <h3>방 만들기</h3>
        <button data-tool="wall">벽 그리기 <kbd>L</kbd></button>
        <button data-tool="room">방 그리기 <kbd>F</kbd></button>
        <button data-tool="delete">삭제 <kbd>D</kbd></button>
        <h3>도면 반전 / 회전</h3>
        <div class="row"><button data-action="flipH">좌우 반전</button><button data-action="flipV">상하 반전</button><button data-action="rotL">↺ 90°</button><button data-action="rotR">↻ 90°</button></div>
        <h3>보조선 그리기</h3>
        <button data-tool="guide">보조선 <kbd>E</kbd></button>
        <button data-tool="measure">측정 <kbd>M</kbd></button>
        <h3>일반</h3>
        <button data-tool="select">선택 <kbd>Esc</kbd></button>
      </section>
      <section data-panel="products" hidden><h3>제품</h3><div id="library"></div></section>
      <section data-panel="background" hidden>
        <h3>배경 도면</h3>
        <button data-action="background">도면 이미지 업로드 <kbd>B</kbd></button>
        <p class="hint">사진이나 스캔을 올리고 모서리를 찍어 펴고, 두 점으로 축척을 잡습니다.</p>
      </section>
      <section data-panel="layers" hidden><h3>레이어</h3><ul id="layerList"></ul></section>
    </aside>
    <main id="canvasWrap">
      <canvas id="c2d"></canvas>
      <div id="c3d" hidden></div>
      <div id="optionBar" hidden></div>
      <div id="banner" hidden></div>
      <div id="imageStrip" hidden>
        <span class="muted">이미지 세팅</span>
        <label>투명도 <input type="range" name="stripOpacity" min="0" max="1" step="0.05"></label>
        <label><input type="checkbox" name="stripVisible"> 표시</label>
        <button type="button" id="btnBgLock" aria-label="배경 도면 잠금">잠금</button>
      </div>
    </main>
    <aside id="right"><div id="minimap"><div class="mm-label">미니맵</div><canvas></canvas></div><div id="props"></div></aside>
    <footer id="bottombar">
      <div class="seg"><button data-mode="2d" class="on">2D</button><button data-mode="plan">평면 <kbd>2</kbd></button><button data-mode="iso">3D <kbd>3</kbd></button><button data-mode="fp">1인칭 <kbd>4</kbd></button></div>
      <div class="seg"><button id="btnView" data-popover="view">보기</button><button id="btnCam" data-popover="cam" hidden>카메라 설정</button><button id="btnSun" data-popover="sun" hidden>햇빛</button></div>
      <div class="seg"><button id="btnLock">도면 잠금</button><button data-action="capture">스크린 캡쳐</button></div>
      <div class="seg"><button id="btnZoomIn" aria-label="도면 확대">＋</button><button id="btnZoomOut" aria-label="도면 축소">－</button><button id="btnFit">화면 맞추기</button></div>
      <div class="seg" id="unitSeg"><button data-units="mm" class="on">mm</button><button data-units="ftin">ft·in</button></div>
    </footer>
  </div>`;
  const q = s => root.querySelector(s);
  const els = { canvas2d: q('#c2d'), view3d: q('#c3d'), props: q('#props'), minimap: q('#minimap canvas'), optionBar: q('#optionBar'), toolPanel: q('#panel'), topbar: q('#topbar'), banner: q('#banner'), layerList: q('#layerList'), library: q('#library') };
  const strip = q('#imageStrip');
  strip.addEventListener('change', ev => {
    const el = ev.target;
    if (el.name === 'stripOpacity') store.dispatch(d => { if (d.background) d.background.opacity = Number(el.value); }, { record: false });
    if (el.name === 'stripVisible') store.dispatch(d => { if (d.background) d.background.visible = el.checked; }, { record: false });
  });
  q('#btnBgLock').addEventListener('click', () => store.dispatch(d => { if (d.background) d.background.locked = !d.background.locked; }, { record: false }));

  function showPanel(name) {
    root.querySelectorAll('#rail button').forEach(x => x.classList.toggle('on', x.dataset.panel === name));
    root.querySelectorAll('#panel section').forEach(s => s.hidden = s.dataset.panel !== name);
  }
  root.querySelectorAll('#rail button').forEach(b => b.addEventListener('click', () => showPanel(b.dataset.panel)));
  root.querySelectorAll('[data-units]').forEach(b => b.addEventListener('click', () => store.dispatch(d => { d.units = b.dataset.units; }, { record: false })));
  q('#btnLock').addEventListener('click', () => store.dispatch(d => { d.view.lockPlan = !d.view.lockPlan; }, { record: false }));

  const pop = createPopover(root);
  let popKind = null;
  const popHtml = kind => {
    const v = store.get().view;
    if (kind === 'view') return viewPopoverHtml(v, ui.get().mode === '2d' ? '2d' : '3d');
    if (kind === 'cam') return cameraPopoverHtml(v);
    if (kind === 'sun') return sunPopoverHtml(v);
    return '';
  };
  function openPopover(kind, anchor) {
    if (pop.isOpen() && popKind === kind) { pop.close(); popKind = null; return; }
    popKind = kind;
    pop.open(anchor, popHtml(kind), { onChange: applyViewChange, onInput: applyViewChange, onClick: onPopoverClick, onClose: () => { popKind = null; } });
  }
  function refreshPopover() { if (pop.isOpen() && popKind) { const anchor = root.querySelector(`[data-popover="${popKind}"]`); pop.open(anchor, popHtml(popKind), { onChange: applyViewChange, onInput: applyViewChange, onClick: onPopoverClick, onClose: () => { popKind = null; } }); } }
  const setPath = (o, path, v) => { const ks = path.split('.'); let t = o; for (const k of ks.slice(0, -1)) t = t[k]; t[ks.at(-1)] = v; };
  // 보기 옵션은 되돌릴 단계가 아니다(record: false).
  function applyViewChange(ev) {
    const el = ev.target;
    if (!el || (!el.dataset.v2 && !el.dataset.v3 && !el.dataset.view)) return;
    const value = el.type === 'checkbox' ? el.checked : el.type === 'range' || el.type === 'number' ? Number(el.value) : el.value;
    store.dispatch(d => {
      if (el.dataset.v2) d.view.v2[el.dataset.v2] = value;
      else if (el.dataset.v3) d.view.v3[el.dataset.v3] = value;
      else setPath(d.view, el.dataset.view, value);
    }, { record: false });
    const out = el.parentElement?.querySelector('output'); if (out) out.textContent = `${el.value}${out.dataset.suffix ?? ''}`;
  }
  function onPopoverClick(ev) {
    const spec = ev.target?.dataset?.preset;
    if (!spec) return;
    const [key, value] = spec.split(':');
    store.dispatch(d => { setPath(d.view, key, Number(value)); }, { record: false });
    refreshPopover(); // 슬라이더 위치를 새 값으로 다시 그린다
  }
  root.querySelectorAll('[data-popover]').forEach(b => b.addEventListener('click', () => openPopover(b.dataset.popover, b)));

  let currentTool = null;
  function setOptionBar(tool) {
    currentTool = tool;
    const hasOpts = tool && tool.opts && Object.keys(tool.opts).length;
    const hint = tool?.hint;
    if (!hasOpts && !hint) { els.optionBar.hidden = true; els.optionBar.innerHTML = ''; return; }
    els.optionBar.hidden = false;
    els.optionBar.innerHTML = hasOpts ? Object.entries(tool.opts).map(([k, v]) => {
      const label = `${LABELS[k] ?? k}${LEN_OPTS.has(k) ? ` (${unitLabel(store.get().units ?? 'mm')})` : ''}`;
      if (typeof v === 'boolean') return `<label><input type="checkbox" name="${k}" ${v ? 'checked' : ''}> ${label}</label>`;
      if (typeof v === 'number') return `<label>${label} <input type="number" name="${k}" value="${v}" step="1"></label>`;
      if (k === 'reference') return `<label>${label} <select name="${k}">${REF.map(([val, l]) => `<option value="${val}" ${v === val ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
      if (k === 'direction') return `<label>${label} <select name="${k}"><option value="v" ${v === 'v' ? 'selected' : ''}>세로</option><option value="h" ${v === 'h' ? 'selected' : ''}>가로</option></select></label>`;
      return `<label>${label} <input type="text" name="${k}" value="${v}"></label>`;
    }).join('') : '';
    if (hint) { const span = document.createElement('span'); span.className = 'hint'; span.dataset.action = 'hintCancel'; span.textContent = hint; els.optionBar.appendChild(span); }
  }
  els.optionBar.addEventListener('change', ev => {
    const el = ev.target, k = el.name; if (!currentTool || !k) return;
    currentTool.opts[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
  });
  // 안내 문구를 누르면 도구가 스스로 취소한다(배치 도구의 "메시지를 누르면 취소").
  els.optionBar.addEventListener('click', ev => { if (ev.target.dataset.action === 'hintCancel') currentTool?.onHintClick?.(); });

  ui.subscribe(s => {
    root.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === s.tool));
    root.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === s.mode));
    els.canvas2d.hidden = s.mode !== '2d'; els.view3d.hidden = s.mode === '2d';
    const is3d = s.mode !== '2d';
    q('#btnCam').hidden = !is3d; q('#btnSun').hidden = !is3d;
    if (!is3d && (popKind === 'cam' || popKind === 'sun')) pop.close();
    if (s.fpPick) { els.banner.hidden = false; els.banner.innerHTML = '👆 1인칭으로 확인할 위치를 클릭해주세요. [ESC]로 취소'; }
    else if (s.soloRoom) { els.banner.hidden = false; els.banner.innerHTML = '단일 공간 모드 <button type="button" id="btnExitSolo">도면 전체 보기</button>'; q('#btnExitSolo').onclick = () => ui.set({ soloRoom: null }); }
    else { els.banner.hidden = true; els.banner.innerHTML = ''; }
    if (pop.isOpen() && popKind === 'view') refreshPopover();
    strip.hidden = !store.get().background || s.mode !== '2d'; // 모드가 바뀌면 이미지 세팅 스트립도 따라간다
  });
  let lastUnits = null;
  const syncTop = s => {
    q('#btnUndo').disabled = !store.canUndo(); q('#btnRedo').disabled = !store.canRedo();
    const u = s.units ?? 'mm';
    if (u !== lastUnits) { lastUnits = u; if (currentTool) setOptionBar(currentTool); } // 단위가 바뀌면 옵션 바 라벨도 다시 그린다(바뀔 때만: 타이핑 중 입력을 지우지 않게)
    if (q('#projectName').value !== s.name) q('#projectName').value = s.name;
    root.querySelectorAll('[data-units]').forEach(b => b.classList.toggle('on', b.dataset.units === (s.units ?? 'mm')));
    q('#btnLock').classList.toggle('on', !!s.view.lockPlan);
    const bg = s.background;
    strip.hidden = !bg || ui.get().mode !== '2d'; // 이미지 세팅은 2D에서만
    if (bg) {
      strip.querySelector('[name="stripOpacity"]').value = String(bg.opacity);
      strip.querySelector('[name="stripVisible"]').checked = !!bg.visible;
      q('#btnBgLock').classList.toggle('on', !!bg.locked);
      q('#btnBgLock').textContent = bg.locked ? '잠금 해제' : '잠금'; // 버튼은 누르면 일어나는 일을 말한다
    }
  };
  store.subscribe(syncTop); syncTop(store.get()); // 시작 시에도 버튼 상태를 맞춘다
  return { els, setOptionBar, showPanel, toast, popover: pop, refreshPopover };
}
