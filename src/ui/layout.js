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

// 좁은 창에서는 저장된 폭이라도 최소 폭으로 줄인다(고정 열 합 64 + 320 + 5 + 5 + 300 = 694 px이라
// 1100 px 창에서는 캔버스가 400 px 남는다). CSS 미디어 쿼리로는 할 수 없다: applyPanelWidths가
// #layout에 인라인 스타일로 --panel-w를 쓰고, 인라인 선언은 !important 없는 어떤 저작자 규칙보다
// 우선하므로 셸이 뜨는 순간 미디어 쿼리가 영구히 무효가 된다. 그래서 폭은 여기서 정한다.
export function fitPanelWidths(widths, vw = (globalThis.innerWidth ?? 1280)) {
  return vw <= 1100 ? { panel: PANEL_MIN, right: PANEL_MIN } : widths;
}

// 폭은 CSS 변수 하나로 다룬다: 그리드 열 정의(#layout)와 접기 클래스가 같은 변수를 읽는다.
export function applyPanelWidths(layout, widths = PANEL_DEFAULT) {
  if (!layout?.style) return;
  layout.style.setProperty('--panel-w', `${clamp(widths.panel ?? PANEL_DEFAULT.panel)}px`);
  layout.style.setProperty('--right-w', `${clamp(widths.right ?? PANEL_DEFAULT.right)}px`);
}

// 세로 스플리터 하나. 드래그 중에는 set으로 즉시 반영하고(미리 보기), 놓을 때 한 번만 onEnd로 저장한다
// (드래그마다 localStorage를 쓰면 프레임이 튄다). invert는 오른쪽 패널용이다: 왼쪽으로 끌면 넓어진다.
export function createSplitter(el, { min = PANEL_MIN, max = PANEL_MAX, invert = false, get = () => min, set = () => {}, onEnd = () => {} } = {}) {
  // 요소가 없어도 던지지 않는다(applyPanelWidths·togglePanel과 같은 방어 수준).
  if (!el) return { isDragging: () => false, destroy() {} };
  let start = null;
  const onDown = ev => {
    if (ev.button !== 0) return;
    start = { x: ev.clientX, w: get() };
    el.setPointerCapture?.(ev.pointerId);   // 커서가 캔버스 위로 넘어가도 이동을 계속 받는다
    ev.preventDefault();
  };
  const onMove = ev => {
    if (!start) return;
    const dx = (ev.clientX - start.x) * (invert ? -1 : 1);
    set(Math.min(max, Math.max(min, Math.round(start.w + dx))));
  };
  const onUp = ev => {
    if (!start) return;
    start = null;
    if (el.hasPointerCapture?.(ev.pointerId)) el.releasePointerCapture?.(ev.pointerId);
    onEnd(get());
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, onUp);
  return {
    isDragging: () => !!start,
    destroy() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
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
