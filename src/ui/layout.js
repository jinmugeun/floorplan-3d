// 좌·우 패널의 폭·접기·스플리터(아키텍처 §12.2). 240 px 패널은 제품 타일 두 개도 겨우 들어가
// 이름이 잘렸다 → 기본 320 px, 드래그로 260~480 px, 레일 버튼으로 접기.
// 폭은 프로젝트가 아니라 브라우저에 남긴다(계정이 없다 — 미니맵 높이와 같은 규칙).
export const PANEL_MIN = 260;
export const PANEL_MAX = 480;
export const PANEL_DEFAULT = { panel: 320, right: 300 };

const KEYS = { panel: 'kvp.panelW', right: 'kvp.rightW' };
const clamp = v => Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(v)));

export function loadPanelWidths() {
  const out = { ...PANEL_DEFAULT };
  for (const side of ['panel', 'right']) {
    try {
      const n = Number(localStorage.getItem(KEYS[side]));
      if (Number.isFinite(n) && n >= PANEL_MIN && n <= PANEL_MAX) out[side] = Math.round(n);
    } catch { /* 저장 불가 */ }
  }
  return out;
}

export function savePanelWidth(side, px) {
  const key = KEYS[side];
  if (!key) return;
  try { localStorage.setItem(key, String(clamp(px))); } catch { /* 저장 불가 */ }
}

// 그리드 고정 열: 레일 64 px + 세로 스플리터 5 px 둘. 캔버스 열은 최소 480 px를 지킨다(§14.1).
export const CANVAS_MIN = 480;
// 클램프는 창 폭 임계값이 아니라 **캔버스 폭**으로 판단한다(§15.4): 캔버스가 이 폭보다 좁아지면
// 패널을 PANEL_MIN까지 줄인다. 480(CANVAS_MIN)만 보던 예전 규칙은 1366 px 노트북에서 한 번도
// 돌지 않아 캔버스가 화면의 49%였다(감사 §23). 480은 "그래도 모자라면 접는다"의 기준으로 남는다.
export const CANVAS_COMFORT = 560;
export const RAIL_W = 64;
export const SPLITTER_W = 5;

// 좁은 창에서는 저장된 폭이라도 줄인다. CSS 미디어 쿼리로는 할 수 없다: applyPanelWidths가
// #layout에 인라인 스타일로 --panel-w를 쓰고, 인라인 선언은 !important 없는 어떤 저작자 규칙보다
// 우선하므로 셸이 뜨는 순간 미디어 쿼리가 영구히 무효가 된다. 그래서 폭은 여기서 정한다.
// 규칙: 두 패널에서 같은 양씩 덜어 내고 PANEL_MIN에서 멈춘다. 한쪽이 먼저 하한에 닿으면
// 남은 몫은 다른 쪽이 낸다(그래서 320/300 같은 비대칭 기본값에서도 결과가 결정적이다).
export function fitPanelWidths(widths, vw = (globalThis.innerWidth ?? 1280)) {
  const panel0 = clamp(widths?.panel ?? PANEL_DEFAULT.panel), right0 = clamp(widths?.right ?? PANEL_DEFAULT.right);
  const over = panel0 + right0 - (vw - RAIL_W - SPLITTER_W * 2 - CANVAS_COMFORT);
  if (!(over > 0)) return { panel: panel0, right: right0 };
  const panel1 = Math.max(PANEL_MIN, panel0 - Math.ceil(over / 2));
  const right = Math.max(PANEL_MIN, right0 - (over - (panel0 - panel1)));
  // 오른쪽이 하한에 먼저 닿아 덜 낸 몫이 있으면 왼쪽이 더 낸다(그래도 하한 아래로는 가지 않는다).
  const panel = Math.max(PANEL_MIN, panel1 - Math.max(0, over - (panel0 - panel1) - (right0 - right)));
  return { panel, right };
}

// 줄여도 캔버스가 480 px에 못 미치면 우측 패널을 접고, 그래도 모자라면 좌측 패널까지 접는다.
// 접힌 열은 스플리터까지 0이 된다(#layout.right-off / .panel-off의 그리드 정의).
export function autoCollapse(widths, vw = (globalThis.innerWidth ?? 1280)) {
  const w = fitPanelWidths(widths, vw);
  const right = RAIL_W + w.panel + SPLITTER_W + w.right + SPLITTER_W + CANVAS_MIN > vw;
  const panel = right && RAIL_W + w.panel + SPLITTER_W + CANVAS_MIN > vw;
  return { panel, right };
}

// 창·레이아웃 크기 변화를 한 번으로 묶는다: 드래그로 창을 줄이면 resize가 수십 번 오고,
// 그때마다 폭을 다시 계산하면 캔버스가 매 프레임 두 번 다시 그려진다.
// ResizeObserver가 없는 환경(jsdom)에서도 window.resize만으로 동작한다.
export const LAYOUT_DEBOUNCE_MS = 120;
export function createResizeWatch(el, fn, { delay = LAYOUT_DEBOUNCE_MS } = {}) {
  let timer = 0;
  const kick = () => { clearTimeout(timer); timer = setTimeout(() => { timer = 0; fn(); }, delay); };
  window.addEventListener('resize', kick);
  const ro = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(kick) : null;
  ro?.observe(el);
  return { destroy() { clearTimeout(timer); window.removeEventListener('resize', kick); ro?.disconnect(); } };
}

// 폭은 CSS 변수 하나로 다룬다: 그리드 열 정의(#layout)와 접기 클래스가 같은 변수를 읽는다.
export function applyPanelWidths(layout, widths = PANEL_DEFAULT) {
  if (!layout?.style) return;
  layout.style.setProperty('--panel-w', `${clamp(widths.panel ?? PANEL_DEFAULT.panel)}px`);
  layout.style.setProperty('--right-w', `${clamp(widths.right ?? PANEL_DEFAULT.right)}px`);
}

// 키보드로 옮기는 한 걸음(px). 드래그는 1 px 단위지만 방향키는 눈에 보이게 움직여야 한다.
export const SPLITTER_STEP = 16;

// 세로 스플리터 하나. 드래그 중에는 set으로 즉시 반영하고(미리 보기), 놓을 때 한 번만 onEnd로 저장한다
// (드래그마다 localStorage를 쓰면 프레임이 튄다). invert는 오른쪽 패널용이다: 왼쪽으로 끌면 넓어진다.
// 마우스만으로 폭을 바꿀 수 있으면 키보드만 쓰는 사람에게는 없는 기능이다 → role="separator" +
// tabindex="0"으로 포커스를 받고 ←·→로 SPLITTER_STEP만큼 옮긴다(드래그와 같은 min/max 안에서,
// 한 번 누를 때마다 onEnd로 저장한다 — 키 입력은 드래그처럼 연속이 아니라 한 번이 곧 끝이다).
export function createSplitter(el, { min = PANEL_MIN, max = PANEL_MAX, invert = false, get = () => min, set = () => {}, onEnd = () => {} } = {}) {
  // 요소가 없어도 던지지 않는다(applyPanelWidths·togglePanel과 같은 방어 수준).
  if (!el) return { isDragging: () => false, destroy() {} };
  // 셸의 HTML에 이미 적혀 있어도 다시 쓴다(스플리터를 만드는 자리가 접근성 속성의 정본이다).
  el.setAttribute('role', 'separator');
  el.setAttribute('aria-orientation', 'vertical');
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
  // ARIA의 window splitter는 값을 노출해야 한다: 스크린 리더 사용자가 화살표를 눌렀을 때
  // 폭이 얼마가 되었는지 읽히지 않으면 키보드 조작이 있으나 마나다. min/max는 고정이고
  // valuenow는 폭이 바뀔 때마다 갱신한다(setValue).
  el.setAttribute('aria-valuemin', String(min));
  el.setAttribute('aria-valuemax', String(max));
  const showValue = w => el.setAttribute('aria-valuenow', String(w));
  const setValue = w => { showValue(w); set(w); };
  showValue(Math.min(max, Math.max(min, get())));   // 만들 때는 읽기만 한다(set을 부르면 없던 폭 변경이 생긴다)
  let start = null;
  const onDown = ev => {
    if (ev.button !== 0) return;
    start = { x: ev.clientX, w: get() };
    el.setPointerCapture?.(ev.pointerId);   // 커서가 캔버스 위로 넘어가도 이동을 계속 받는다
    ev.preventDefault();                    // 텍스트 선택·기본 드래그를 막는다
    el.focus?.();                            // preventDefault가 기본 포커스까지 막으므로 직접 준다(클릭 뒤 화살표가 바로 듣는다)
  };
  const onMove = ev => {
    if (!start) return;
    const dx = (ev.clientX - start.x) * (invert ? -1 : 1);
    setValue(Math.min(max, Math.max(min, Math.round(start.w + dx))));
  };
  const onUp = ev => {
    if (!start) return;
    start = null;
    if (el.hasPointerCapture?.(ev.pointerId)) el.releasePointerCapture?.(ev.pointerId);
    onEnd(get());
  };
  // →는 오른쪽으로 옮긴다: 왼쪽 패널은 넓어지고, invert(오른쪽 패널)는 반대로 좁아진다 —
  // 드래그의 dx * (invert ? -1 : 1)과 같은 부호 규칙이다.
  // 조합키는 우리 것이 아니다: Alt+←는 브라우저 뒤로 가기, Ctrl/Shift+←는 텍스트·탐색 단축키다.
  // 스플리터에 포커스가 있다는 이유로 그것들을 먹으면 앱 밖의 약속을 깨뜨린다.
  const onKey = ev => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
    // Home/End는 ARIA 슬라이더의 관례대로 최소·최대로 보낸다(기본 폭 복귀는 레일 버튼이 맡는다).
    const dir = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
    const to = ev.key === 'Home' ? min : ev.key === 'End' ? max : null;
    if (!dir && to === null) return;
    ev.preventDefault();                    // 방향키로 패널이 가로 스크롤되지 않게
    const w = to !== null ? to : Math.min(max, Math.max(min, get() + dir * SPLITTER_STEP * (invert ? -1 : 1)));
    if (w === get()) return;                // 이미 한계면 저장도 하지 않는다
    setValue(w);
    onEnd(get());                           // 드래그를 놓은 것과 같다(kvp에 남는다)
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('keydown', onKey);
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, onUp);
  return {
    isDragging: () => !!start,
    destroy() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('keydown', onKey);
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.removeEventListener(t, onUp);
    },
  };
}

// 접기: 패널 자신에게 collapsed(테스트·스타일이 보는 상태)와 #layout에 panel-off/right-off
// (그리드 열 폭을 0으로 만드는 자리)를 함께 건다. 접혔는지를 돌려준다.
export function togglePanel(layout, side = 'panel', force = null) {
  const el = layout?.querySelector(side === 'right' ? '#right' : '#panel');
  if (!el) return false;
  const off = force === null ? !el.classList.contains('collapsed') : !!force;
  el.classList.toggle('collapsed', off);
  layout.classList.toggle(side === 'right' ? 'right-off' : 'panel-off', off);
  return off;
}
