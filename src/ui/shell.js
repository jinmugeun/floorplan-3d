import { activeFloor } from '../state/schema.js';
import { toast } from './toast.js';
import { createShellPopovers } from './shellPopovers.js';
import { optionBarHtml, applyOptionInput, syncDimBar, autoFocusDim } from './optionBar.js';
import { loadPanelWidths, savePanelWidth, fitPanelWidths, autoCollapse, applyPanelWidths, createSplitter, togglePanel, createResizeWatch } from './layout.js';
import { trackFields, isDuplicateCommit, commitFocusedIn } from './fieldUtils.js';
import { shellHtml } from './shellHtml.js';
import { createBottomBar } from './bottomBar.js';
import { createBanner } from './banner.js';
import { CLAMP_MAX, CLAMP_MIN } from './messages.js';
import { fmtLen } from '../util/units.js';

// 기즈모 모드 토글은 3D 궤도 뷰에서 기즈모가 실제로 붙는 아이템 하나를 골랐을 때만 쓸 일이 있다.
// 1인칭·2D 투영(ortho)에는 기즈모가 없고, 벽 부착·잠긴 아이템에도 붙지 않으므로 버튼도 숨긴다.
export function gizmoBtnVisible({ mode = '2d', ortho = null, item = null } = {}) {
  return mode !== '2d' && mode !== 'fp' && !ortho && !!item && !item.locked && !(item.attach === 'wall' && item.wallId);
}

// onToolChange: 옵션 바의 치수 칸이 도구 상태를 바꿨다(§16.7). 배선이 캔버스를 다시 그리게 한다 —
// ui/는 view2d/를 import하지 않으므로(아키텍처 §9) 셸이 직접 requestRender를 부를 수는 없다.
export function createShell(root, { store, ui, onGizmoMode = () => {}, onMinimapResize = () => {}, onOpenKeymap = () => {}, onExitFp = () => {}, onToolChange = () => {}, onPanelShow = () => {}, onLabelDensity = () => {} }) {
  root.innerHTML = shellHtml({ name: store.get().name });
  const q = s => root.querySelector(s);
  const els = { canvas2d: q('#c2d'), view3d: q('#c3d'), props: q('#props'), minimap: q('#minimap canvas'), optionBar: q('#optionBar'), toolPanel: q('#panel'), topbar: q('#topbar'), banner: q('#banner'), layers: q('#layers'), library: q('#library'), materials: q('#materials'), airflow: q('#airflow') };
  const layout = q('#layout');
  // widths는 "사용자가 바란 폭"이고(스플리터·kvp.panelW), 실제로 적용하는 폭은 창에 맞춰 줄인 값이다.
  // 그래서 창을 좁혔다 넓히면 저장해 둔 폭이 그대로 돌아온다(§14.1).
  const widths = loadPanelWidths();
  // 사용자가 접은 것과 자동 접힘을 구분한다: 창이 넓어질 때 다시 펴지는 것은 자동 접힘뿐이다.
  const autoOff = { panel: false, right: false };
  // 사용자가 직접 연 패널은 다음 자동 접힘에서 제외한다(§15.14 — 계획 6 결정 6을 이렇게 좁힌다):
  // 손으로 연 것을 리사이즈가 즉시 다시 접으면 조작이 먹지 않는 것처럼 보인다. 창이 다시
  // 넓어져 자동 접힘이 필요 없어지면(want[side] === false) 플래그도 함께 풀린다.
  const userOpen = { panel: false, right: false };
  // 하단 바 접기(§14.3). relayout()이 첫 배치에서 먼저 돌므로 선언은 그 위에 두고, 실제 생성은
  // 마크업이 붙은 뒤(relayout() 다음) 한다 — 그 사이의 sync()는 ?.로 조용히 건너뛴다.
  let bottom = null;
  let firstLayout = true;
  // 하단 바 접기 판정은 "보이는 컨트롤 서명"이 바뀔 때만 다시 한다(계획 6 R-1 · §15.2):
  // bottom.sync()가 scrollWidth를 읽어 강제 리플로를 내므로, 스토어가 바뀔 때마다 부르면
  // 드래그 중 프레임을 삼킨다(감사 §29). 폭 변화는 relayout()이 무조건 다시 재므로 놓치지 않는다 —
  // 단, 좌/우 패널을 접거나 펴는 레일·[속성 ▸] 버튼 경로는 `#layout` 자체 크기를 바꾸지 않아
  // ResizeObserver도 뜨지 않고 서명 4필드도 그대로다(p7 Task 2 리뷰 I-1). 그 두 경로는 서명이
  // 같아도 강제로 다시 재도록 `syncBottom(true)`로 부른다 — 드래그 경로는 여전히 이 힘줄을 타지
  // 않으므로 §15.2의 목적(드래그 중 리플로 0)은 그대로다.
  // 선언은 relayout()보다 **위**여야 한다: relayout()은 먼저 돌고, let은 TDZ다.
  let bottomSig = null;
  const bottomSignature = () => ['#btnGizmoMode', '#btnCam', '#btnSun', '#btnRightPanel'].map(s => (q(s)?.hidden ? '0' : '1')).join('');
  const syncBottom = (force = false) => { const s = bottomSignature(); if (!force && s === bottomSig) return; bottomSig = s; bottom?.sync(); };
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
      if (want[side] && !off && !userOpen[side]) { togglePanel(layout, side, true); autoOff[side] = true; }
      else if (!want[side] && off && autoOff[side]) { togglePanel(layout, side, false); autoOff[side] = false; }
      if (!want[side]) userOpen[side] = false;   // 접을 이유가 사라지면 예외도 끝난다
    }
    // 우측 패널이 접혀 있을 때만 하단 바 오른쪽 끝에 "속성 ▸"이 보인다(다시 펴는 유일한 길이다).
    q('#btnRightPanel').hidden = !q('#right').classList.contains('collapsed');
    syncRail();          // 자동 접힘도 레일 상태에 반영한다(m-9)
    bottom?.sync();
    bottomSig = bottom ? bottomSignature() : null;   // 폭 때문에 이미 쟀다: 뒤이은 syncBottom은 건너뛴다
    // 첫 배치에서는 미니맵에 알리지 않는다: 아직 아무것도 바뀌지 않았고, 미니맵 리사이즈
    // 콜백은 "크기가 변했다"는 신호다(shell.test.js의 ResizeObserver 테스트가 횟수를 센다).
    if (!firstLayout) onMinimapResize();
    firstLayout = false;
  }
  relayout();
  // 팝오버는 한 번에 하나만 열린다: 더보기를 열면 셸 팝오버(보기·카메라·햇빛·도움말)를 닫는다.
  // pops는 아래에서 만들지만 이 콜백은 클릭 때 비로소 돌아 TDZ에 걸리지 않는다.
  bottom = createBottomBar(root, { onOpen: () => pops.close(), getMode: () => ui.get().mode });
  const resizeWatch = createResizeWatch(layout, relayout);
  q('#btnRightPanel').addEventListener('click', () => { autoOff.right = false; userOpen.right = true; togglePanel(layout, 'right', false); q('#btnRightPanel').hidden = true; syncBottom(true); onMinimapResize(); });
  const splitters = [
    createSplitter(q('#panelSplitter'), {
      get: () => widths.panel,
      set: w => { widths.panel = w; relayout(); },
      // 화면에 적용된 폭을 저장한다(§15.14 — 계획 6 이월): 좁은 창에서 끌면 클램프된 폭만
      // 보이는데 kvp에는 끌던 값이 남아, 창을 넓히면 만진 적 없는 폭이 튀어나왔다.
      onEnd: () => savePanelWidth('panel', fitPanelWidths(widths, globalThis.innerWidth ?? 1280).panel),
    }),
    createSplitter(q('#rightSplitter'), {
      invert: true,   // 오른쪽 패널은 왼쪽으로 끌 때 넓어진다
      get: () => widths.right,
      set: w => { widths.right = w; relayout(); },
      onEnd: () => savePanelWidth('right', fitPanelWidths(widths, globalThis.innerWidth ?? 1280).right),
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
    autoOff.panel = false; userOpen.panel = true;
    togglePanel(layout, 'panel', false);   // 코드에서 패널을 열 때는 접힘을 함께 푼다(교체 모드 등)
    root.querySelectorAll('#rail button').forEach(x => x.classList.toggle('on', x.dataset.panel === name));
    root.querySelectorAll('#panel section').forEach(s => s.hidden = s.dataset.panel !== name);
    syncRail();
    // 패널을 **여는 순간**은 그 패널의 render()가 돌지 않는 유일한 자리다(스토어도 ui도 그대로다).
    // 레일 버튼도 코드 경로도 모두 여기를 지나므로 훅은 한 자리다(§17.6(3)).
    onPanelShow(name);
  }
  // 레일 버튼: 지금 열려 있는 탭을 다시 누르면 패널을 접는다(캔버스가 넓어진다 — §12.2).
  root.querySelectorAll('#rail button').forEach(b => b.addEventListener('click', () => {
    const current = b.classList.contains('on');
    const collapsed = q('#panel').classList.contains('collapsed');
    autoOff.panel = false;
    // 왼쪽 패널을 접거나 펴면 바(#bottombar)의 clientWidth가 바뀐다 — #layout 크기는 그대로라
    // ResizeObserver도, 서명 4필드도 반응하지 않으므로 여기서만 강제로 다시 잰다(I-1).
    if (current && !collapsed) { togglePanel(layout, 'panel', true); syncRail(); syncBottom(true); return; }
    showPanel(b.dataset.panel);
    syncBottom(true);
  }));
  root.querySelectorAll('[data-units]').forEach(b => b.addEventListener('click', () => store.dispatch(d => { d.units = b.dataset.units; }, { record: false })));
  q('#btnLock').addEventListener('click', () => store.dispatch(d => { d.view.lockPlan = !d.view.lockPlan; }, { record: false }));
  // 3D 기즈모 모드 토글(이동 ↔ 회전). R은 1인칭이 쓰므로 단축키 없이 버튼으로만 바꾼다.
  let gizmoMode = 'translate';
  const syncGizmoBtn = () => { const b = q('#btnGizmoMode'); b.textContent = gizmoMode === 'rotate' ? '회전' : '이동'; b.classList.toggle('on', gizmoMode === 'rotate'); b.setAttribute('aria-pressed', String(gizmoMode === 'rotate')); };
  q('#btnGizmoMode').addEventListener('click', () => { gizmoMode = gizmoMode === 'rotate' ? 'translate' : 'rotate'; syncGizmoBtn(); onGizmoMode(gizmoMode); });
  syncGizmoBtn();

  // 입력 칸의 [Esc] 되돌리기는 "포커스 시점 값"이 필요하다(§15.9): 앱 전체에 한 번만 건다.
  const fieldTrack = trackFields(root);
  // 팝오버(보기·카메라·햇빛·도움말) 배선은 ui/shellPopovers.js 한 곳에 있다(리뷰 I-8 — 300줄 규칙은
  // "커지기 전에 나눈다"였다: 예산에 닿아 설명 주석을 깎던 자리를 덩어리째 옮겼다). 셸은 상태만
  // 묻고(kind()·isOpen()) 화면이 바뀔 때 닫거나 다시 그리게 한다.
  const pops = createShellPopovers(root, { store, ui, onOpenKeymap, onOpen: () => bottom?.closeMore(), onLabelDensity });

  let currentTool = null;
  // 옵션 바는 캔버스 위에 뜬 팝업이 아니라 캔버스 위쪽 행이다(§12.1): 옵션이 없으면 행이 접히고(hidden),
  // 안내 문구(hint)는 배너가 맡는다 — 캔버스를 가리고 클릭을 가로채는 요소를 남기지 않는다.
  const units = () => store.get().units ?? 'mm';
  // 옵션 바 = 도구 옵션(도구가 바뀔 때만 다시 그린다) + 치수 칸(#optionDims, 값만 자주 갱신한다 — §16.7).
  // 둘을 한 innerHTML로 묶으면 타이핑 중 칸이 사라지므로 host 하나를 남겨 둔다.
  function renderOptions() {
    els.optionBar.innerHTML = `${optionBarHtml(currentTool, { units: units() })}<span id="optionDims"></span>`;
    syncDims();                                       // 보일지 말지(hidden)는 여기 한 곳에서만 정한다
  }
  const syncDims = () => {
    syncDimBar(els.optionBar, currentTool, { units: units() });
    els.optionBar.hidden = !currentTool?.dims?.() && !els.optionBar.querySelector('input, select');
    // 칸이 처음 생긴 프레임에만 한 번 포커스를 준다(§17.8(1)). hidden을 먼저 풀어야 focus가 먹는다.
    autoFocusDim(els.optionBar, currentTool);
  };
  // 배너(문구 우선순위·드래그 중 행 고정)는 ui/banner.js 한 곳에 있다: 이 파일이 300줄 규칙에 닿아
  // "더하기 전에 나눈다"대로 덩어리째 옮겼다. 셸은 구독에서 render()만 부른다.
  const banner = createBanner({ store, ui, el: els.banner, stack: q('#canvasStack'), tool: () => currentTool, onExitFp });
  const renderBanner = s => banner.render(s);
  function setOptionBar(tool) { currentTool = tool; renderOptions(); renderBanner(); }
  // 치수 칸의 이름은 dim:<key>다(도구 옵션과 섞이지 않게 — applyOptionInput은 opts에 없는 이름을 받지 않는다).
  const dimKey = el => (typeof el?.name === 'string' && el.name.startsWith('dim:') ? el.name.slice(4) : null);
  // 범위로 잘린 값은 조용히 바뀌지 않는다(리뷰 I-2): 속성 패널과 같은 문구로 알린다(§14.10).
  // ft·in 칸은 그 표기로 말한다(m-6: "최대 8000 mm까지"가 ft·in 화면에 뜨던 자리).
  const clampToast = el => (v, { max }) => toast((v === max ? CLAMP_MAX : CLAMP_MIN)(el.dataset?.len ? fmtLen(v, 'ftin') : v, el.dataset?.len ? '' : 'mm'));
  // [Enter] 확정의 합성 change 뒤 blur가 내는 네이티브 change는 삼킨다(§16.1).
  els.optionBar.addEventListener('change', ev => {
    if (isDuplicateCommit(ev.target)) return;
    if (dimKey(ev.target)) return;                    // 치수 칸은 input에서 이미 반영했다
    applyOptionInput(currentTool, ev.target, units(), { onClamp: clampToast(ev.target) });
  });
  // 치수 칸은 타이핑마다 도구 버퍼에 들어가고(캔버스 프리뷰가 그 값으로 따라온다), 포커스가 옮겨 간
  // 칸이 곧 활성 칸이다(캔버스의 [Tab]과 같은 상태를 가리킨다 — §16.7).
  els.optionBar.addEventListener('input', ev => { const k = dimKey(ev.target); if (!k) return; if (currentTool?.setDim?.(k, ev.target.value)) onToolChange(); });
  els.optionBar.addEventListener('focusin', ev => { const k = dimKey(ev.target); if (k) { currentTool?.focusDim?.(k); syncDims(); onToolChange(); } });
  // 다음 점을 클릭하는 순간 포커스를 캔버스 쪽으로 돌려준다(§17.8(2) · 감사 §57): 치수 칸이 키를
  // 계속 먹으면 캔버스의 숫자·[Enter]·[Esc] 경로가 죽는다. 캡처 단계라 도구의 pointerdown보다
  // 먼저 돈다. **왼쪽 버튼만** 본다(리뷰 M-1): 오른쪽 클릭(맥락 메뉴)·가운데 드래그(패닝)는
  // §17.8(2)가 말한 "다음 점을 클릭"이 아니다. 클릭 프레임은 실측이 0이라 autoFocusDim의 래치가
  // 닫히고, 마우스가 다시 움직여 확정할 값이 생기면 그때 칸이 포커스를 되찾는다(§17.8(1)).
  // 속성 패널에서 타이핑하던 값도 같은 자리에서 확정한다(Task 3 재리뷰 N-1): 이 뒤에 도는 도구의
  // pointerdown이 선택을 먼저 비우고, 브라우저가 mousedown의 포커스 정리에서 뒤늦게 내는 change는
  // 빈 선택에 닿아 아무 데도 적용되지 않았다(계획 8부터). 누르는 순간 확정해 **아직 살아 있는**
  // 선택에 적용한다 — 치수 칸은 위에서 이미 걸러 냈으므로 두 번 확정되지 않는다.
  els.canvas2d.addEventListener('pointerdown', ev => { if (ev.button) return; const a = document.activeElement; if (dimKey(a)) { a.blur(); return; } commitFocusedIn(els.props); }, true);
  // 길이 입력은 change뿐 아니라 [Enter]로도 반영한다(값을 고치고 Enter만 누르면 그대로였다 — §12.5).
  // 같은 경로를 쓰도록 change 이벤트를 직접 쏜다(ft·in 되돌리기 규칙까지 그대로 적용된다). 뒤이어 오는
  // 네이티브 change는 isDuplicateCommit이 한 번 삼킨다(§16.1). select는 INPUT이 아니라 애초에 걸리지
  // 않고, 체크박스는 Enter로 값이 바뀌지 않으므로 여기서 뺀다.
  els.optionBar.addEventListener('keydown', ev => {
    // 한글 입력 조합 중의 Enter는 "글자 확정"이지 "반영"이 아니다(keymap.js:107과 같은 방어).
    // 조합 중에 반영하면 아직 완성되지 않은 값이 들어가고, 이어지는 확정 Enter가 또 한 번 돈다.
    if (ev.isComposing || ev.keyCode === 229) return;
    const dk = dimKey(ev.target);
    // 치수 칸의 [Esc]는 글자와 도구 버퍼를 **함께** 되돌린다(리뷰 I-5): keymap의 revertField는 글자만
    // 되돌려, 다음 프레임의 syncDimBar가 그대로 남은 버퍼를 다시 써 넣었다(되돌림이 없던 일이 됐다).
    // 빈 버퍼 = 마우스 실측으로 복귀 = 이 칸의 "없던 일"이다. 도구는 취소하지 않는다(§16.7).
    // 손대지 않은 칸이면 그 [Esc]를 도구에도 넘긴다(리뷰 I-1): 되돌릴 글자가 없어 눈에 보이는 변화가
    // 없으므로, 배너가 약속한 "[Esc] 그리기 끝"이 자동 포커스가 기본이 된 뒤로 첫 누름에 거짓이었다.
    // "손대지 않았다"는 **도구에게 묻는다**(재리뷰 OPEN-1): 셸이 들던 dimTouched 플래그는 focusin에서만
    // 풀려, 칸의 [Enter]로 확정해 버퍼가 비어도 true로 남았다 — 배너가 권하는 흐름(타이핑 → [Enter] →
    // [Esc])에서 다시 [Esc] 두 번이 됐다. f.typed는 확정과 함께 사라지므로 늘 지금 사실이다.
    if (ev.key === 'Escape' && dk) {
      ev.preventDefault();                            // keymap의 revertField가 한 번 더 돌지 않게 한다
      const untouched = !currentTool?.dims?.()?.fields.find(x => x.key === dk)?.typed;
      currentTool?.setDim?.(dk, '');
      ev.target.blur();                               // 포커스가 없어야 syncDims가 이 칸을 다시 채운다
      if (untouched) currentTool?.onKey?.({ key: 'Escape', preventDefault() {} });
      syncDims(); onToolChange();
      return;
    }
    if (ev.key !== 'Enter' || ev.target?.tagName !== 'INPUT' || !ev.target.name) return;
    if (ev.target.type === 'checkbox') return;
    ev.preventDefault();
    // 치수 칸의 [Enter]는 도구의 확정이다(벽을 놓고 다음 점으로 — §16.7). 옵션 값이 아니다.
    if (dk) {
      // 확정한 칸은 모델 값으로 되맞춘다(계획 8 리뷰 C-1): preventDefault를 했으므로 blur가 없어
      // 포커스가 칸에 남고, 낡은 글자(4500)에 다음 타이핑이 이어 붙어 45003000(45 m 벽)이 놓였다 —
      // select()가 이어 타이핑에 덮어쓰게 한다. 확정할 것이 없으면 도구의 onKey로 넘긴다(리뷰 I-2):
      // 캔버스의 [Enter]는 그때 체인을 끝내는데 칸의 [Enter]만 아무 일도 하지 않아, 자동 포커스가
      // 기본이 된 뒤로는 한 번의 키로 그리기를 끝낼 방법이 없었다.
      if (currentTool?.commitDims?.()) {
        const f = currentTool.dims?.()?.fields.find(x => x.key === dk);
        ev.target.value = f ? f.text : '';
        ev.target.select?.();
      } else currentTool?.onKey?.({ key: 'Enter', preventDefault() {} });
      syncDims(); onToolChange();
      return;
    }
    ev.target.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // 2D 투영 뷰 이름. view3d가 onOrthoView로 알려 주면 setOrtho로 들어온다(기즈모 버튼 표시가 여기에 걸린다).
  let orthoName = null;
  const syncGizmoVisible = (s = ui.get()) => {
    const item = s.selection?.type === 'item' ? activeFloor(store.get())?.items.find(i => i.id === s.selection.id) : null;
    q('#btnGizmoMode').hidden = !gizmoBtnVisible({ mode: s.mode, ortho: orthoName, item });
  };
  // 2D 투영으로 들어가고 나오면 기즈모 버튼이 숨거나 보인다 → 하단 바 접기 판정도 다시 한다.
  const setOrtho = name => { orthoName = name ?? null; syncGizmoVisible(); syncBottom(); };

  const unsubs = [ui.subscribe(s => {
    root.querySelectorAll('[data-tool]').forEach(b => { const on = b.dataset.tool === s.tool; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    root.querySelectorAll('[data-mode]').forEach(b => { const on = b.dataset.mode === s.mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    els.canvas2d.hidden = s.mode !== '2d'; els.view3d.hidden = s.mode === '2d';
    const isIso = s.mode === 'iso';   // 평면 뷰어·1인칭에는 궤도 카메라·햇빛 조절이 뜻이 없다
    q('#btnCam').hidden = !isIso; q('#btnSun').hidden = !isIso;
    syncGizmoVisible(s);
    if (!isIso && (pops.kind() === 'cam' || pops.kind() === 'sun')) pops.close();
    syncBottom();                          // 3D 전용 버튼이 늘거나 줄면 접기 판정을 다시 한다
    renderBanner(s);
    if (pops.isOpen() && pops.kind() === 'view') pops.refresh();
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
    // syncBottom()은 보이는 컨트롤 서명이 같으면 아무것도 하지 않는다(측정조차 하지 않는다 — §15.2).
    syncGizmoVisible(); syncBottom();
  };
  unsubs.push(store.subscribe(syncTop)); syncTop(store.get()); // 시작 시에도 버튼 상태를 맞춘다
  return { els, setOptionBar, showPanel, setOrtho, toast, popover: pops.pop, refreshPopover: pops.refresh, refreshBanner: () => renderBanner(),
    // 도구 상태가 바뀌었다: 배너 문구와 치수 칸을 함께 맞춘다(§16.7 — view2d의 onHint가 부른다).
    refreshTool() { renderBanner(); syncDims(); },
    // 셸을 버리면 구독·관찰자·document 리스너까지 함께 뗀다: 남아 있으면 스토어가 바뀔 때
    // syncTop이 사라진 #btnUndo에서 던진다(m-8).
    destroy() { unsubs.forEach(u => u?.()); banner.destroy(); bottom?.destroy(); pops.destroy(); miniRo?.disconnect(); resizeWatch.destroy(); fieldTrack.destroy(); splitters.forEach(s => s.destroy()); } };
}
