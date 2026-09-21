import { esc } from '../util/html.js';
import { activeFloor } from '../state/schema.js';
import { toast } from './toast.js';
import { createPopover } from './popover.js';
import { viewPopoverHtml, cameraPopoverHtml, sunPopoverHtml } from './viewOptions.js';
import { optionBarHtml, applyOptionInput } from './optionBar.js';
import { loadPanelWidths, savePanelWidth, fitPanelWidths, applyPanelWidths, createSplitter, togglePanel } from './layout.js';
import { helpHtml } from './helpPopover.js';


// 기즈모 모드 토글은 3D 궤도 뷰에서 기즈모가 실제로 붙는 아이템 하나를 골랐을 때만 쓸 일이 있다.
// 1인칭·2D 투영(ortho)에는 기즈모가 없고, 벽 부착·잠긴 아이템에도 붙지 않으므로 버튼도 숨긴다.
export function gizmoBtnVisible({ mode = '2d', ortho = null, item = null } = {}) {
  return mode !== '2d' && mode !== 'fp' && !ortho && !!item && !item.locked && !(item.attach === 'wall' && item.wallId);
}

export function createShell(root, { store, ui, onGizmoMode = () => {}, onMinimapResize = () => {}, onOpenKeymap = () => {} }) {
  root.innerHTML = `
  <div id="layout">
    <header id="topbar">
      <div class="group"><button id="btnUndo" aria-label="실행 취소">↶</button><button id="btnRedo" aria-label="다시 실행">↷</button></div>
      <div class="group"><input id="projectName" aria-label="프로젝트 이름" value="${esc(store.get().name)}"><span id="savedAt" class="muted">저장 이력 없음</span></div>
      <div class="group"><button id="btnRender">렌더샷</button><button id="btnGallery">갤러리</button><button id="btnEstimate">실시간 견적서</button><button id="btnSpec">시방서</button><button id="btnNew">새로만들기</button><button id="btnMore" aria-label="더보기">더보기 ▾</button></div>
      <div class="group"><button id="btnHelp" data-popover="help" aria-label="도움말">?</button><button id="btnSettings" aria-label="설정">설정</button><button id="btnCapture" data-action="capture">캡처</button><button id="btnLoad">불러오기</button><button id="btnSave" class="primary">저장</button></div>
    </header>
    <nav id="rail" aria-label="작업 영역">
      <button data-panel="draw" class="on"><span>도면 그리기</span></button>
      <button data-panel="products"><span>제품</span></button>
      <button data-panel="materials"><span>마감재</span></button>
      <button data-panel="background"><span>배경 도면</span></button>
      <button data-panel="airflow"><span>풍량</span></button>
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
        <h3>환기 덕트</h3>
        <button data-tool="duct">덕트 그리기 <kbd>T</kbd></button>
        <h3>일반</h3>
        <button data-tool="select">선택 <kbd>Esc</kbd></button>
      </section>
      <section data-panel="products" hidden><h3>제품</h3><div id="library"></div></section>
      <section data-panel="materials" hidden><h3>마감재</h3><div id="materials"></div></section>
      <section data-panel="background" hidden>
        <h3>배경 도면</h3>
        <button data-action="background">도면 이미지 업로드 <kbd>B</kbd></button>
        <p class="hint">사진이나 스캔을 올리고 모서리를 찍어 펴고, 두 점으로 축척을 잡습니다.</p>
      </section>
      <section data-panel="airflow" hidden><h3>풍량 집계</h3><div id="airflow"></div></section>
      <section data-panel="layers" hidden><h3>리소스 관리</h3><div id="layers"></div></section>
    </aside>
    <div id="panelSplitter" class="splitter" role="separator" aria-orientation="vertical" aria-label="작업 패널 폭 조절"></div>
    <main id="canvasWrap">
      <div id="optionBar" hidden></div>
      <div id="banner" hidden></div>
      <div id="canvasStack">
        <canvas id="c2d"></canvas>
        <div id="c3d" hidden></div>
        <div id="imageStrip" hidden>
          <span class="muted">이미지 세팅</span>
          <label>투명도 <input type="range" name="stripOpacity" min="0" max="1" step="0.05"></label>
          <label><input type="checkbox" name="stripVisible"> 표시</label>
          <button type="button" id="btnBgLock" aria-label="배경 도면 잠금">잠금</button>
        </div>
      </div>
    </main>
    <div id="rightSplitter" class="splitter" role="separator" aria-orientation="vertical" aria-label="속성 패널 폭 조절"></div>
    <aside id="right"><div id="minimap"><div class="mm-label">미니맵</div><canvas></canvas></div><div id="props"></div></aside>
    <footer id="bottombar">
      <div class="seg"><button data-mode="2d" class="on">2D</button><button data-mode="plan">평면 <kbd>2</kbd></button><button data-mode="iso">3D <kbd>3</kbd></button><button data-mode="fp">1인칭 <kbd>4</kbd></button></div>
      <div class="seg"><button id="btnView" data-popover="view">보기</button><button id="btnCam" data-popover="cam" hidden>카메라 설정</button><button id="btnSun" data-popover="sun" hidden>햇빛</button></div>
      <div class="seg"><button id="btnLock">도면 잠금</button><button data-action="capture">스크린 캡쳐</button></div>
      <div class="seg"><button id="btnZoomIn" aria-label="도면 확대">＋</button><button id="btnZoomOut" aria-label="도면 축소">－</button><button id="btnFit">화면 맞추기</button></div>
      <div class="seg"><label class="muted">2D 투영 <select id="viewPreset" aria-label="2D 투영 뷰"><option value="">—</option><option value="front">정면</option><option value="back">배면</option><option value="left">좌측</option><option value="right">우측</option><option value="top">평면</option><option value="bottom">저면</option></select></label></div>
      <div class="seg"><button id="btnGizmoMode" aria-label="3D 기즈모 모드" hidden>이동</button></div>
      <div class="seg" id="unitSeg"><button data-units="mm" class="on">mm</button><button data-units="ftin">ft·in</button></div>
    </footer>
  </div>`;
  const q = s => root.querySelector(s);
  const els = { canvas2d: q('#c2d'), view3d: q('#c3d'), props: q('#props'), minimap: q('#minimap canvas'), optionBar: q('#optionBar'), toolPanel: q('#panel'), topbar: q('#topbar'), banner: q('#banner'), layers: q('#layers'), library: q('#library'), materials: q('#materials'), airflow: q('#airflow') };
  const layout = q('#layout');
  // 좁은 창(≤ 1100 px)에서는 저장된 폭을 최소 폭으로 자른다(fitPanelWidths). CSS 미디어 쿼리는
  // 여기서 쓰는 인라인 폭을 이기지 못하므로 폭 결정은 전부 layout.js에 있다.
  const widths = fitPanelWidths(loadPanelWidths());
  applyPanelWidths(layout, widths);
  const splitters = [
    createSplitter(q('#panelSplitter'), {
      get: () => widths.panel,
      set: w => { widths.panel = w; applyPanelWidths(layout, widths); onMinimapResize(); },
      onEnd: w => savePanelWidth('panel', w),
    }),
    createSplitter(q('#rightSplitter'), {
      invert: true,   // 오른쪽 패널은 왼쪽으로 끌 때 넓어진다
      get: () => widths.right,
      set: w => { widths.right = w; applyPanelWidths(layout, widths); onMinimapResize(); },
      onEnd: w => savePanelWidth('right', w),
    }),
  ];
  const strip = q('#imageStrip');
  strip.addEventListener('change', ev => {
    const el = ev.target;
    if (el.name === 'stripOpacity') store.dispatch(d => { if (d.background) d.background.opacity = Number(el.value); }, { record: false });
    if (el.name === 'stripVisible') store.dispatch(d => { if (d.background) d.background.visible = el.checked; }, { record: false });
  });
  q('#btnBgLock').addEventListener('click', () => store.dispatch(d => { if (d.background) d.background.locked = !d.background.locked; }, { record: false }));

  // 미니맵 높이(CSS resize)를 브라우저에 기억한다.
  const mini = q('#minimap');
  try { const h = Number(localStorage.getItem('kvp.minimapH')); if (h >= 80 && h <= 600) mini.style.height = `${h}px`; } catch { /* 저장 불가 */ }
  const saveMiniHeight = () => { try { localStorage.setItem('kvp.minimapH', String(Math.round(mini.getBoundingClientRect().height || parseFloat(mini.style.height) || 0))); } catch { /* 저장 불가 */ } };
  mini.addEventListener('pointerup', saveMiniHeight);
  // CSS resize 드래그는 pointerup이 미니맵 밖에서 끝날 수 있어, 실제 크기 변화는 ResizeObserver로 잡아 저장하고 캔버스를 다시 그리게 한다.
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { saveMiniHeight(); onMinimapResize(); }).observe(mini);

  function showPanel(name) {
    togglePanel(layout, 'panel', false);   // 코드에서 패널을 열 때는 접힘을 함께 푼다(교체 모드 등)
    root.querySelectorAll('#rail button').forEach(x => x.classList.toggle('on', x.dataset.panel === name));
    root.querySelectorAll('#panel section').forEach(s => s.hidden = s.dataset.panel !== name);
  }
  // 레일 버튼: 지금 열려 있는 탭을 다시 누르면 패널을 접는다(캔버스가 넓어진다 — §12.2).
  root.querySelectorAll('#rail button').forEach(b => b.addEventListener('click', () => {
    const current = b.classList.contains('on');
    const collapsed = q('#panel').classList.contains('collapsed');
    if (current && !collapsed) { togglePanel(layout, 'panel', true); return; }
    showPanel(b.dataset.panel);
  }));
  root.querySelectorAll('[data-units]').forEach(b => b.addEventListener('click', () => store.dispatch(d => { d.units = b.dataset.units; }, { record: false })));
  q('#btnLock').addEventListener('click', () => store.dispatch(d => { d.view.lockPlan = !d.view.lockPlan; }, { record: false }));
  // 3D 기즈모 모드 토글(이동 ↔ 회전). R은 1인칭이 쓰므로 단축키 없이 버튼으로만 바꾼다.
  let gizmoMode = 'translate';
  const syncGizmoBtn = () => { const b = q('#btnGizmoMode'); b.textContent = gizmoMode === 'rotate' ? '회전' : '이동'; b.classList.toggle('on', gizmoMode === 'rotate'); };
  q('#btnGizmoMode').addEventListener('click', () => { gizmoMode = gizmoMode === 'rotate' ? 'translate' : 'rotate'; syncGizmoBtn(); onGizmoMode(gizmoMode); });
  syncGizmoBtn();

  const pop = createPopover(root);
  let popKind = null;
  // 도움말은 현재 화면에 맞는 규칙을 보여 준다: 덕트 도구가 켜져 있으면 덕트, 아니면 2D/3D.
  const popHtml = kind => {
    const v = store.get().view;
    if (kind === 'view') return viewPopoverHtml(v, ui.get().mode === '2d' ? '2d' : '3d');
    if (kind === 'cam') return cameraPopoverHtml(v);
    if (kind === 'sun') return sunPopoverHtml(v);
    if (kind === 'help') return helpHtml(ui.get().tool === 'duct' ? 'duct' : ui.get().mode === '2d' ? '2d' : '3d');
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
    // 도움말 팝오버의 "단축키 표 열기": 닫고 설정의 단축키 탭을 연다(같은 내용을 두 곳에 적지 않는다).
    if (ev.target?.dataset?.help === 'keymap') { pop.close(); onOpenKeymap(); return; }
    const spec = ev.target?.dataset?.preset;
    if (!spec) return;
    const [key, value] = spec.split(':');
    store.dispatch(d => { setPath(d.view, key, Number(value)); }, { record: false });
    refreshPopover(); // 슬라이더 위치를 새 값으로 다시 그린다
  }
  // [?] 버튼도 다른 팝오버 버튼([보기]/[카메라 설정]/[햇빛])과 같은 data-popover 경로를 타므로
  // openPopover의 "이미 열려 있으면 닫는다" 규칙을 그대로 물려받아 두 번째 클릭에 닫힌다.
  root.querySelectorAll('[data-popover]').forEach(b => b.addEventListener('click', () => openPopover(b.dataset.popover, b)));

  let currentTool = null;
  // 옵션 바는 캔버스 위에 뜬 팝업이 아니라 캔버스 위쪽 행이다(§12.1): 옵션이 없으면 행이 접히고(hidden),
  // 안내 문구(hint)는 배너가 맡는다 — 캔버스를 가리고 클릭을 가로채는 요소를 남기지 않는다.
  function renderOptions() {
    const html = optionBarHtml(currentTool, { units: store.get().units ?? 'mm' });
    els.optionBar.hidden = !html;
    els.optionBar.innerHTML = html;
  }
  // 배너는 한 번에 하나만 보인다: ui 상태(1인칭 찍기 · 마감재 적용 · 단일 공간 모드)가 도구 안내보다 앞선다.
  function renderBanner(s = ui.get()) {
    const exitSolo = '<button type="button" id="btnExitSolo">도면 전체 보기</button>';
    const show = html => { els.banner.hidden = false; els.banner.innerHTML = html; };
    const wireSolo = () => { q('#btnExitSolo').onclick = () => ui.set({ soloRoom: null }); };
    if (s.fpPick) { show('👆 1인칭으로 확인할 위치를 클릭해주세요. [Esc]로 취소'); return; }
    if (s.matPick) {
      // 단일 공간 모드 중에도 모드를 빠져나갈 버튼을 남긴다.
      // 키 표기는 전역 규칙대로 [Esc] 한 가지다(예전 대문자 표기를 여기서 바로잡는다 — Task 10의
      // grep이 소스에 대문자 표기가 하나도 없음을 확인하므로 주석에도 쓰지 않는다).
      // 이 문구는 shell.test.js:272의 기대값과 짝이다: 둘을 함께 고친다.
      show('🎨 재질을 적용할 면을 클릭해주세요. [Esc]를 누르면 종료됩니다.' + (s.soloRoom ? ` ${exitSolo}` : ''));
      if (s.soloRoom) wireSolo();
      return;
    }
    if (s.soloRoom) { show(`단일 공간 모드 ${exitSolo}`); wireSolo(); return; }
    // 누를 수 있는 것은 버튼이다: <span>은 Tab으로 닿지도 Enter로 눌리지도 않아 키보드만 쓰는
    // 사람에게는 "메시지를 누르면 취소"가 없는 기능이었다. 모양은 CSS가 글자처럼 되돌린다.
    if (currentTool?.hint) { show(`<button type="button" class="hint" data-action="hintCancel">${esc(currentTool.hint)}</button>`); return; }
    els.banner.hidden = true; els.banner.innerHTML = '';
  }
  function setOptionBar(tool) { currentTool = tool; renderOptions(); renderBanner(); }
  els.optionBar.addEventListener('change', ev => { applyOptionInput(currentTool, ev.target, store.get().units ?? 'mm'); });
  // 길이 입력은 change뿐 아니라 [Enter]로도 반영한다(값을 고치고 Enter만 누르면 그대로였다 — §12.5).
  // 같은 경로를 쓰도록 change 이벤트를 직접 쏜다(ft·in 되돌리기 규칙까지 그대로 적용된다).
  // 값이 바뀐 상태로 Enter를 누르면 실제 브라우저에서는 네이티브 change까지 더해 applyOptionInput이
  // 두 번 돈다 — 멱등하므로(같은 값을 같은 키에 두 번 쓴다) 결과는 같다. select는 INPUT이 아니라
  // 애초에 걸리지 않고, 체크박스는 Enter로 값이 바뀌지 않으므로 여기서 뺀다.
  els.optionBar.addEventListener('keydown', ev => {
    // 한글 입력 조합 중의 Enter는 "글자 확정"이지 "반영"이 아니다(keymap.js:107과 같은 방어).
    // 조합 중에 반영하면 아직 완성되지 않은 값이 들어가고, 이어지는 확정 Enter가 또 한 번 돈다.
    if (ev.isComposing || ev.keyCode === 229) return;
    if (ev.key !== 'Enter' || ev.target?.tagName !== 'INPUT' || !ev.target.name) return;
    if (ev.target.type === 'checkbox') return;
    ev.preventDefault();
    ev.target.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // 안내 문구를 누르면 도구가 스스로 취소한다(배치 도구의 "메시지를 누르면 취소").
  els.banner.addEventListener('click', ev => { if (ev.target.dataset.action === 'hintCancel') currentTool?.onHintClick?.(); });

  // 2D 투영 뷰 이름. view3d가 onOrthoView로 알려 주면 setOrtho로 들어온다(기즈모 버튼 표시가 여기에 걸린다).
  let orthoName = null;
  const syncGizmoVisible = (s = ui.get()) => {
    const item = s.selection?.type === 'item' ? activeFloor(store.get())?.items.find(i => i.id === s.selection.id) : null;
    q('#btnGizmoMode').hidden = !gizmoBtnVisible({ mode: s.mode, ortho: orthoName, item });
  };
  const setOrtho = name => { orthoName = name ?? null; syncGizmoVisible(); };

  ui.subscribe(s => {
    root.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === s.tool));
    root.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === s.mode));
    els.canvas2d.hidden = s.mode !== '2d'; els.view3d.hidden = s.mode === '2d';
    const isIso = s.mode === 'iso';   // 평면 뷰어·1인칭에는 궤도 카메라·햇빛 조절이 뜻이 없다
    q('#btnCam').hidden = !isIso; q('#btnSun').hidden = !isIso;
    syncGizmoVisible(s);
    if (!isIso && (popKind === 'cam' || popKind === 'sun')) pop.close();
    renderBanner(s);
    if (pop.isOpen() && popKind === 'view') refreshPopover();
    strip.hidden = !store.get().background || s.mode !== '2d'; // 모드가 바뀌면 이미지 세팅 스트립도 따라간다
  });
  let lastUnits = null;
  const syncTop = s => {
    q('#btnUndo').disabled = !store.canUndo(); q('#btnRedo').disabled = !store.canRedo();
    const u = s.units ?? 'mm';
    if (u !== lastUnits) { lastUnits = u; if (currentTool) renderOptions(); } // 단위가 바뀌면 옵션 바 라벨도 다시 그린다(바뀔 때만: 타이핑 중 입력을 지우지 않게)
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
  return { els, setOptionBar, showPanel, setOrtho, toast, popover: pop, refreshPopover, destroy() { splitters.forEach(s => s.destroy()); } };
}
