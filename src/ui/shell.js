import { activeFloor } from '../state/schema.js';
import { toast } from './toast.js';
import { createPopover } from './popover.js';
import { viewPopoverHtml, cameraPopoverHtml, sunPopoverHtml } from './viewOptions.js';
import { optionBarHtml, applyOptionInput } from './optionBar.js';
import { loadPanelWidths, savePanelWidth, fitPanelWidths, autoCollapse, applyPanelWidths, createSplitter, togglePanel, createResizeWatch } from './layout.js';
import { shellHtml } from './shellHtml.js';
import { createBottomBar } from './bottomBar.js';
import { createBanner } from './banner.js';
import { helpHtml } from './helpPopover.js';

// 기즈모 모드 토글은 3D 궤도 뷰에서 기즈모가 실제로 붙는 아이템 하나를 골랐을 때만 쓸 일이 있다.
// 1인칭·2D 투영(ortho)에는 기즈모가 없고, 벽 부착·잠긴 아이템에도 붙지 않으므로 버튼도 숨긴다.
export function gizmoBtnVisible({ mode = '2d', ortho = null, item = null } = {}) {
  return mode !== '2d' && mode !== 'fp' && !ortho && !!item && !item.locked && !(item.attach === 'wall' && item.wallId);
}

export function createShell(root, { store, ui, onGizmoMode = () => {}, onMinimapResize = () => {}, onOpenKeymap = () => {}, onExitFp = () => {} }) {
  root.innerHTML = shellHtml({ name: store.get().name });
  const q = s => root.querySelector(s);
  const els = { canvas2d: q('#c2d'), view3d: q('#c3d'), props: q('#props'), minimap: q('#minimap canvas'), optionBar: q('#optionBar'), toolPanel: q('#panel'), topbar: q('#topbar'), banner: q('#banner'), layers: q('#layers'), library: q('#library'), materials: q('#materials'), airflow: q('#airflow') };
  const layout = q('#layout');
  // widths는 "사용자가 바란 폭"이고(스플리터·kvp.panelW), 실제로 적용하는 폭은 창에 맞춰 줄인 값이다.
  // 그래서 창을 좁혔다 넓히면 저장해 둔 폭이 그대로 돌아온다(§14.1).
  const widths = loadPanelWidths();
  // 사용자가 접은 것과 자동 접힘을 구분한다: 창이 넓어질 때 다시 펴지는 것은 자동 접힘뿐이다.
  const autoOff = { panel: false, right: false };
  // 하단 바 접기(§14.3). relayout()이 첫 배치에서 먼저 돌므로 선언은 그 위에 두고, 실제 생성은
  // 마크업이 붙은 뒤(relayout() 다음) 한다 — 그 사이의 sync()는 ?.로 조용히 건너뛴다.
  let bottom = null;
  let firstLayout = true;
  // 레일 버튼의 `.on`은 "어느 탭인가"이고 aria-pressed는 "지금 열려 있는가"다(m-9): 활성 탭을 다시
  // 눌러 접거나 좁은 창이 자동으로 접으면 화면에는 패널이 없는데 보조기술은 눌림으로 읽었다.
  // 함수 선언이라 첫 relayout()보다 위에서 불려도 TDZ에 걸리지 않는다.
  function syncRail() {
    const off = q('#panel').classList.contains('collapsed');
    root.querySelectorAll('#rail button').forEach(b => b.setAttribute('aria-pressed', String(b.classList.contains('on') && !off)));
  }
  function relayout() {
    const vw = globalThis.innerWidth ?? 1280;
    applyPanelWidths(layout, fitPanelWidths(widths, vw));
    const want = autoCollapse(widths, vw);
    for (const side of ['panel', 'right']) {
      const el = q(side === 'right' ? '#right' : '#panel');
      const off = el.classList.contains('collapsed');
      if (want[side] && !off) { togglePanel(layout, side, true); autoOff[side] = true; }
      else if (!want[side] && off && autoOff[side]) { togglePanel(layout, side, false); autoOff[side] = false; }
    }
    // 우측 패널이 접혀 있을 때만 하단 바 오른쪽 끝에 "속성 ▸"이 보인다(다시 펴는 유일한 길이다).
    q('#btnRightPanel').hidden = !q('#right').classList.contains('collapsed');
    syncRail();          // 자동 접힘도 레일 상태에 반영한다(m-9)
    bottom?.sync();
    // 첫 배치에서는 미니맵에 알리지 않는다: 아직 아무것도 바뀌지 않았고, 미니맵 리사이즈
    // 콜백은 "크기가 변했다"는 신호다(shell.test.js의 ResizeObserver 테스트가 횟수를 센다).
    if (!firstLayout) onMinimapResize();
    firstLayout = false;
  }
  relayout();
  // 팝오버는 한 번에 하나만 열린다: 더보기를 열면 셸 팝오버(보기·카메라·햇빛·도움말)를 닫는다.
  // pop은 아래에서 만들지만 이 콜백은 클릭 때 비로소 돌아 TDZ에 걸리지 않는다.
  bottom = createBottomBar(root, { onOpen: () => pop.close() });
  const resizeWatch = createResizeWatch(layout, relayout);
  q('#btnRightPanel').addEventListener('click', () => { autoOff.right = false; togglePanel(layout, 'right', false); q('#btnRightPanel').hidden = true; onMinimapResize(); });
  const splitters = [
    createSplitter(q('#panelSplitter'), {
      get: () => widths.panel,
      set: w => { widths.panel = w; relayout(); },
      onEnd: w => savePanelWidth('panel', w),
    }),
    createSplitter(q('#rightSplitter'), {
      invert: true,   // 오른쪽 패널은 왼쪽으로 끌 때 넓어진다
      get: () => widths.right,
      set: w => { widths.right = w; relayout(); },
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
  const miniRo = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { saveMiniHeight(); onMinimapResize(); }) : null;
  miniRo?.observe(mini);

  function showPanel(name) {
    autoOff.panel = false;
    togglePanel(layout, 'panel', false);   // 코드에서 패널을 열 때는 접힘을 함께 푼다(교체 모드 등)
    root.querySelectorAll('#rail button').forEach(x => x.classList.toggle('on', x.dataset.panel === name));
    root.querySelectorAll('#panel section').forEach(s => s.hidden = s.dataset.panel !== name);
    syncRail();
  }
  // 레일 버튼: 지금 열려 있는 탭을 다시 누르면 패널을 접는다(캔버스가 넓어진다 — §12.2).
  root.querySelectorAll('#rail button').forEach(b => b.addEventListener('click', () => {
    const current = b.classList.contains('on');
    const collapsed = q('#panel').classList.contains('collapsed');
    autoOff.panel = false;
    if (current && !collapsed) { togglePanel(layout, 'panel', true); syncRail(); return; }
    showPanel(b.dataset.panel);
  }));
  root.querySelectorAll('[data-units]').forEach(b => b.addEventListener('click', () => store.dispatch(d => { d.units = b.dataset.units; }, { record: false })));
  q('#btnLock').addEventListener('click', () => store.dispatch(d => { d.view.lockPlan = !d.view.lockPlan; }, { record: false }));
  // 3D 기즈모 모드 토글(이동 ↔ 회전). R은 1인칭이 쓰므로 단축키 없이 버튼으로만 바꾼다.
  let gizmoMode = 'translate';
  const syncGizmoBtn = () => { const b = q('#btnGizmoMode'); b.textContent = gizmoMode === 'rotate' ? '회전' : '이동'; b.classList.toggle('on', gizmoMode === 'rotate'); b.setAttribute('aria-pressed', String(gizmoMode === 'rotate')); };
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
  // 접힌 하단 바의 버튼(카메라·햇빛)은 더보기 팝오버 안에 있다. 그 팝오버를 닫으면 버튼이
  // display: none이 되어 rect가 0이 되므로(팝오버가 좌상단으로 튄다) 늘 보이는 "더보기 ▾"를
  // 앵커로 삼는다 — 팝오버는 접힌 바에서도 버튼 근처에 뜬다.
  const anchorFor = el => (el?.closest?.('#bottomMore') ? q('#btnBottomMore') : el);
  // 팝오버 버튼은 눌린 상태가 아니라 "열려 있는지"를 알린다(§14.10).
  const syncPopButtons = () => root.querySelectorAll('[data-popover]').forEach(b => b.setAttribute('aria-expanded', String(pop.isOpen() && popKind === b.dataset.popover)));
  const popHandlers = { onChange: applyViewChange, onInput: applyViewChange, onClick: onPopoverClick, onClose: () => { popKind = null; syncPopButtons(); } };
  function openPopover(kind, anchor) {
    const at = anchorFor(anchor);
    bottom?.closeMore();                 // 팝오버는 한 번에 하나만 열린다
    if (pop.isOpen() && popKind === kind) { pop.close(); popKind = null; syncPopButtons(); return; }
    popKind = kind;
    pop.open(at, popHtml(kind), popHandlers);
    syncPopButtons();
  }
  function refreshPopover() { if (pop.isOpen() && popKind) pop.open(anchorFor(root.querySelector(`[data-popover="${popKind}"]`)), popHtml(popKind), popHandlers); }
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
  // 배너(문구 우선순위·드래그 중 행 고정)는 ui/banner.js 한 곳에 있다: 이 파일이 300줄 규칙에 닿아
  // "더하기 전에 나눈다"대로 덩어리째 옮겼다. 셸은 구독에서 render()만 부른다.
  const banner = createBanner({ store, ui, el: els.banner, stack: q('#canvasStack'), tool: () => currentTool, onExitFp });
  const renderBanner = s => banner.render(s);
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

  // 2D 투영 뷰 이름. view3d가 onOrthoView로 알려 주면 setOrtho로 들어온다(기즈모 버튼 표시가 여기에 걸린다).
  let orthoName = null;
  const syncGizmoVisible = (s = ui.get()) => {
    const item = s.selection?.type === 'item' ? activeFloor(store.get())?.items.find(i => i.id === s.selection.id) : null;
    q('#btnGizmoMode').hidden = !gizmoBtnVisible({ mode: s.mode, ortho: orthoName, item });
  };
  // 2D 투영으로 들어가고 나오면 기즈모 버튼이 숨거나 보인다 → 하단 바 접기 판정도 다시 한다.
  const setOrtho = name => { orthoName = name ?? null; syncGizmoVisible(); bottom?.sync(); };

  const unsubs = [ui.subscribe(s => {
    root.querySelectorAll('[data-tool]').forEach(b => { const on = b.dataset.tool === s.tool; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    root.querySelectorAll('[data-mode]').forEach(b => { const on = b.dataset.mode === s.mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    els.canvas2d.hidden = s.mode !== '2d'; els.view3d.hidden = s.mode === '2d';
    const isIso = s.mode === 'iso';   // 평면 뷰어·1인칭에는 궤도 카메라·햇빛 조절이 뜻이 없다
    q('#btnCam').hidden = !isIso; q('#btnSun').hidden = !isIso;
    syncGizmoVisible(s);
    if (!isIso && (popKind === 'cam' || popKind === 'sun')) pop.close();
    bottom?.sync();                        // 3D 전용 버튼이 늘거나 줄면 접기 판정을 다시 한다
    renderBanner(s);
    if (pop.isOpen() && popKind === 'view') refreshPopover();
    strip.hidden = !store.get().background || s.mode !== '2d'; // 모드가 바뀌면 이미지 세팅 스트립도 따라간다
  })];
  let lastUnits = null;
  const syncTop = s => {
    q('#btnUndo').disabled = !store.canUndo(); q('#btnRedo').disabled = !store.canRedo();
    const u = s.units ?? 'mm';
    if (u !== lastUnits) { lastUnits = u; if (currentTool) renderOptions(); } // 단위가 바뀌면 옵션 바 라벨도 다시 그린다(바뀔 때만: 타이핑 중 입력을 지우지 않게)
    if (q('#projectName').value !== s.name) q('#projectName').value = s.name;
    root.querySelectorAll('[data-units]').forEach(b => { const on = b.dataset.units === (s.units ?? 'mm'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    q('#btnLock').classList.toggle('on', !!s.view.lockPlan); q('#btnLock').setAttribute('aria-pressed', String(!!s.view.lockPlan));
    const bg = s.background;
    strip.hidden = !bg || ui.get().mode !== '2d'; // 이미지 세팅은 2D에서만
    if (bg) {
      strip.querySelector('[name="stripOpacity"]').value = String(bg.opacity);
      strip.querySelector('[name="stripVisible"]').checked = !!bg.visible;
      q('#btnBgLock').classList.toggle('on', !!bg.locked);
      q('#btnBgLock').textContent = bg.locked ? '잠금 해제' : '잠금'; // 버튼은 누르면 일어나는 일을 말한다
    }
    renderBanner();   // 충돌 건수는 스토어가 바뀔 때만 달라진다(§14.8)
    // 기즈모 버튼 표시(gizmoBtnVisible)는 item.locked·attach·wallId를 읽는다 — 전부 스토어 상태다.
    // 속성 패널·우클릭 메뉴로 고른 아이템을 잠그거나 아이템을 끌어 벽에 붙이면 ui는 그대로이므로
    // ui.subscribe가 돌지 않는다: 여기서도 다시 맞춰야 버튼과 하단 바 접기 판정이 낡지 않는다.
    // bottom.sync()는 보이는 컨트롤 서명이 같으면 측정만 하고 끝나므로 비용이 늘지 않는다(bottomBar.js).
    syncGizmoVisible(); bottom?.sync();
  };
  unsubs.push(store.subscribe(syncTop)); syncTop(store.get()); // 시작 시에도 버튼 상태를 맞춘다
  return { els, setOptionBar, showPanel, setOrtho, toast, popover: pop, refreshPopover, refreshBanner: () => renderBanner(),
    // 셸을 버리면 구독·관찰자·document 리스너까지 함께 뗀다: 남아 있으면 스토어가 바뀔 때
    // syncTop이 사라진 #btnUndo에서 던진다(m-8).
    destroy() { unsubs.forEach(u => u?.()); banner.destroy(); bottom?.destroy(); pop.destroy(); miniRo?.disconnect(); resizeWatch.destroy(); splitters.forEach(s => s.destroy()); } };
}
