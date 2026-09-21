// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { PANEL_MIN, PANEL_MAX, PANEL_DEFAULT, CANVAS_MIN, RAIL_W, SPLITTER_W, LAYOUT_DEBOUNCE_MS, loadPanelWidths, savePanelWidth, fitPanelWidths, autoCollapse, createResizeWatch, applyPanelWidths, createSplitter, togglePanel } from '../src/ui/layout.js';

function fakeLayout() {
  const root = document.createElement('div');
  root.innerHTML = `<div id="layout"><aside id="panel"></aside><div id="panelSplitter"></div><main id="canvasWrap"></main><div id="rightSplitter"></div><aside id="right"></aside></div>`;
  document.body.appendChild(root);
  return root.querySelector('#layout');
}
const down = (el, x) => el.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: x, bubbles: true, cancelable: true }));
const move = (el, x) => el.dispatchEvent(new MouseEvent('pointermove', { clientX: x, bubbles: true }));
const up = (el, x) => el.dispatchEvent(new MouseEvent('pointerup', { clientX: x, bubbles: true }));
// dispatchEvent는 preventDefault가 걸리면 false를 돌려준다.
const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });

describe('패널 폭', () => {
  test('기본값과 범위', () => {
    expect([PANEL_MIN, PANEL_MAX]).toEqual([260, 480]);
    expect(PANEL_DEFAULT).toEqual({ panel: 320, right: 300 });
    expect(loadPanelWidths()).toEqual({ panel: 320, right: 300 });
    // 좁은 창에서는 저장된 폭이라도 최소 폭으로 줄인다(인라인 폭이 미디어 쿼리를 이기므로 CSS가 아니라 여기서 정한다).
    expect(fitPanelWidths({ panel: 400, right: 400 }, 1000)).toEqual({ panel: 260, right: 260 });
    expect(fitPanelWidths({ panel: 400, right: 400 }, 1600)).toEqual({ panel: 400, right: 400 });
    expect(fitPanelWidths({ panel: 400, right: 400 }, 1280)).toEqual({ panel: 323, right: 323 }); // 캔버스 560을 지키려고 둘에서 같은 양씩 덜어 낸다
  });

  test('저장된 값을 읽고 범위 밖·쓰레기 값은 기본값으로 떨어진다', () => {
    localStorage.setItem('kvp.panelW', '400');
    localStorage.setItem('kvp.rightW', '9999');
    expect(loadPanelWidths()).toEqual({ panel: 400, right: 300 });
    localStorage.setItem('kvp.panelW', '엉터리');
    expect(loadPanelWidths().panel).toBe(320);
  });

  test('저장은 범위로 자른다', () => {
    savePanelWidth('panel', 10000);
    expect(localStorage.getItem('kvp.panelW')).toBe('480');
    savePanelWidth('right', 10);
    expect(localStorage.getItem('kvp.rightW')).toBe('260');
  });

  test('applyPanelWidths가 CSS 변수를 쓴다(소수 폭은 반올림)', () => {
    const layout = fakeLayout();
    applyPanelWidths(layout, { panel: 333.4, right: 288.6 });
    expect(layout.style.getPropertyValue('--panel-w')).toBe('333px');
    expect(layout.style.getPropertyValue('--right-w')).toBe('289px');
    applyPanelWidths(null, PANEL_DEFAULT);        // 없는 요소에도 던지지 않는다
  });
});

describe('스플리터', () => {
  test('드래그가 폭을 바꾸고 범위를 지키며 놓을 때 한 번 저장된다', () => {
    const layout = fakeLayout();
    const el = layout.querySelector('#panelSplitter');
    let w = 320; const ends = [];
    createSplitter(el, { get: () => w, set: v => { w = v; }, onEnd: v => ends.push(v) });
    down(el, 100); move(el, 160);
    expect(w).toBe(380);
    move(el, 5000);
    expect(w).toBe(PANEL_MAX);                    // 최대에서 멈춘다
    move(el, -5000);
    expect(w).toBe(PANEL_MIN);                    // 최소에서 멈춘다
    up(el, -5000);
    expect(ends).toEqual([PANEL_MIN]);
    move(el, 400);
    expect(w).toBe(PANEL_MIN);                    // 놓은 뒤의 이동은 무시한다
  });

  test('invert는 왼쪽으로 끌 때 넓어진다(우측 패널)', () => {
    const layout = fakeLayout();
    const el = layout.querySelector('#rightSplitter');
    let w = 300;
    const sp = createSplitter(el, { invert: true, get: () => w, set: v => { w = v; } });
    down(el, 500); move(el, 460);
    expect(w).toBe(340);
    expect(sp.isDragging()).toBe(true);
    up(el, 460);
    expect(sp.isDragging()).toBe(false);
    sp.destroy();
    down(el, 500); move(el, 400);
    expect(w).toBe(340);                          // destroy 뒤에는 반응하지 않는다
  });

  test('키보드 ←·→로도 폭을 옮기고(16 px) 그때마다 저장한다', () => {
    const layout = fakeLayout();
    const el = layout.querySelector('#panelSplitter');
    let w = 320; const ends = [];
    createSplitter(el, { get: () => w, set: v => { w = v; savePanelWidth('panel', v); }, onEnd: v => ends.push(v) });
    // 포커스를 받을 수 있고 스크린 리더에 세로 구분선으로 보인다.
    expect(el.getAttribute('role')).toBe('separator');
    expect(el.getAttribute('tabindex')).toBe('0');
    expect(el.getAttribute('aria-orientation')).toBe('vertical');
    expect(key(el, 'ArrowRight')).toBe(false);    // preventDefault가 걸린다(패널 가로 스크롤 방지)
    expect(w).toBe(336);
    key(el, 'ArrowLeft'); key(el, 'ArrowLeft');
    expect(w).toBe(304);
    expect(ends).toEqual([336, 320, 304]);        // 한 번 누를 때마다 드래그를 놓은 것과 같다
    expect(localStorage.getItem('kvp.panelW')).toBe('304');
    // 한계에서는 멈추고, 더 눌러도 저장이 늘지 않는다.
    for (let i = 0; i < 5; i++) key(el, 'ArrowLeft');
    expect(w).toBe(PANEL_MIN);
    expect(ends.at(-1)).toBe(PANEL_MIN);
    const n = ends.length;
    key(el, 'ArrowLeft');
    expect(ends).toHaveLength(n);
    expect(key(el, 'ArrowUp')).toBe(true);        // 쓰지 않는 키는 그대로 흘려보낸다
    expect(w).toBe(PANEL_MIN);
  });

  test('invert 스플리터는 ←가 넓힌다(우측 패널)', () => {
    const layout = fakeLayout();
    const el = layout.querySelector('#rightSplitter');
    let w = 300;
    const sp = createSplitter(el, { invert: true, get: () => w, set: v => { w = v; } });
    key(el, 'ArrowLeft');
    expect(w).toBe(316);
    key(el, 'ArrowRight');
    expect(w).toBe(300);
    sp.destroy();
    key(el, 'ArrowLeft');
    expect(w).toBe(300);                          // destroy 뒤에는 키도 받지 않는다
  });

  // 조합키는 브라우저·OS의 것이다: Alt+←는 뒤로 가기, Ctrl/Shift+←는 탐색·선택 단축키다.
  // 스플리터에 포커스가 있다는 이유로 그것들을 먹으면(preventDefault + 폭 이동) 앱 밖의 약속이 깨진다.
  test('조합키가 붙은 방향키는 스플리터가 먹지 않는다', () => {
    const layout = fakeLayout();
    const el = layout.querySelector('#panelSplitter');
    let w = 320; const ends = [];
    createSplitter(el, { get: () => w, set: v => { w = v; }, onEnd: v => ends.push(v) });
    const mod = (k, opts) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
    for (const opts of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      expect(mod('ArrowLeft', opts)).toBe(true);    // preventDefault를 걸지 않는다 → 브라우저가 받는다
      expect(mod('ArrowRight', opts)).toBe(true);
    }
    expect([w, ends]).toEqual([320, []]);           // 폭도 저장도 건드리지 않는다
    key(el, 'ArrowRight');                          // 맨 방향키는 그대로 듣는다
    expect(w).toBe(336);
  });

  // ARIA의 window splitter는 값을 노출해야 한다(스크린 리더가 폭 변화를 읽는 유일한 단서다).
  test('aria-value* 를 노출하고 폭이 바뀔 때마다 valuenow를 갱신한다(Home·End·클릭 포커스)', () => {
    const layout = fakeLayout();
    const el = layout.querySelector('#panelSplitter');
    let w = 320.4;
    createSplitter(el, { get: () => w, set: v => { w = v; } });
    expect([el.getAttribute('aria-valuemin'), el.getAttribute('aria-valuemax')]).toEqual(['260', '480']);
    expect(el.getAttribute('aria-valuenow')).toBe('320.4');   // 만들 때는 읽기만 한다(set을 부르지 않는다)
    expect(w).toBe(320.4);
    key(el, 'ArrowRight');
    expect([w, el.getAttribute('aria-valuenow')]).toEqual([336.4, '336.4']);
    key(el, 'End');
    expect([w, el.getAttribute('aria-valuenow')]).toEqual([PANEL_MAX, String(PANEL_MAX)]);
    key(el, 'Home');
    expect([w, el.getAttribute('aria-valuenow')]).toEqual([PANEL_MIN, String(PANEL_MIN)]);
    // 드래그도 같은 자리를 지난다.
    down(el, 100); move(el, 140);
    expect(el.getAttribute('aria-valuenow')).toBe('300');
    up(el, 140);
    // onDown이 preventDefault를 걸어 기본 포커스가 막히므로 직접 준다(클릭한 뒤 화살표가 바로 듣는다).
    expect(document.activeElement).toBe(el);
  });

  test('왼쪽 버튼이 아니면 시작하지 않는다', () => {
    const layout = fakeLayout();
    const el = layout.querySelector('#panelSplitter');
    let w = 320;
    createSplitter(el, { get: () => w, set: v => { w = v; } });
    el.dispatchEvent(new MouseEvent('pointerdown', { button: 2, clientX: 100, bubbles: true }));
    move(el, 200);
    expect(w).toBe(320);
  });
});

describe('패널 접기', () => {
  test('togglePanel이 #panel과 #layout에 클래스를 함께 건다', () => {
    const layout = fakeLayout();
    expect(togglePanel(layout, 'panel')).toBe(true);
    expect(layout.querySelector('#panel').classList.contains('collapsed')).toBe(true);
    expect(layout.classList.contains('panel-off')).toBe(true);
    expect(togglePanel(layout, 'panel')).toBe(false);
    expect(layout.classList.contains('panel-off')).toBe(false);
    expect(togglePanel(layout, 'panel', false)).toBe(false);   // force는 상태를 그대로 정한다
    expect(togglePanel(layout, 'right', true)).toBe(true);
    expect(layout.querySelector('#right').classList.contains('collapsed')).toBe(true);
    expect(layout.classList.contains('right-off')).toBe(true);
  });
});

describe('좁은 창 레이아웃(§14.1)', () => {
  const canvasOf = (w, vw, { rightOff = false } = {}) =>
    vw - RAIL_W - w.panel - SPLITTER_W - (rightOff ? 0 : w.right + SPLITTER_W);

  test('상수와 세 창 폭에서 캔버스가 480 px 이상이다', () => {
    expect([CANVAS_MIN, RAIL_W, SPLITTER_W, LAYOUT_DEBOUNCE_MS]).toEqual([480, 64, 5, 120]);
    for (const vw of [1600, 1100]) {
      const w = fitPanelWidths(PANEL_DEFAULT, vw);
      expect(autoCollapse(PANEL_DEFAULT, vw)).toEqual({ panel: false, right: false });
      expect(canvasOf(w, vw)).toBeGreaterThanOrEqual(CANVAS_MIN);
    }
    // 800 px에서는 두 패널을 최소로 줄여도 모자라 자동으로 접는다(접히면 그 열과 스플리터가 0이다).
    expect(autoCollapse(PANEL_DEFAULT, 800)).toEqual({ panel: true, right: true });
    expect(800 - RAIL_W).toBeGreaterThanOrEqual(CANVAS_MIN);
  });

  test('줄일 때 한쪽이 최소에 닿으면 남은 몫은 다른 쪽이 낸다', () => {
    // 480 + 260이 632 px 몫을 108 px 넘긴다: 오른쪽은 이미 하한이라 왼쪽이 108 px를 다 낸다.
    expect(fitPanelWidths({ panel: 480, right: 260 }, 1266)).toEqual({ panel: 372, right: 260 });
    expect(fitPanelWidths({ panel: 300, right: 300 }, 1000)).toEqual({ panel: 260, right: 260 });
    expect(fitPanelWidths(undefined, 1600)).toEqual({ panel: 320, right: 300 });   // 값이 없으면 기본 폭
  });

  test('우측만 접으면 되는 창 폭에서는 좌측 패널을 접지 않는다', () => {
    expect(autoCollapse(PANEL_DEFAULT, 1000)).toEqual({ panel: false, right: true });
    expect(autoCollapse(PANEL_DEFAULT, 900)).toEqual({ panel: false, right: true });
  });

  // §15.4(감사 §23): 클램프가 1100 px 이하에서만 돌아 1366 px 노트북에서는 아무 일도 하지 않았다.
  // 기준을 창 폭이 아니라 캔버스 폭(560 px)으로 바꾼다.
  test('클램프 기준은 캔버스 560 px이고 480은 자동 접기 기준으로 남는다', async () => {
    const { CANVAS_COMFORT } = await import('../src/ui/layout.js');
    expect([CANVAS_COMFORT, CANVAS_MIN]).toEqual([560, 480]);
    // 1366 px: 기본 폭으로도 캔버스가 672 px이라 줄일 필요가 없다.
    expect(fitPanelWidths(PANEL_DEFAULT, 1366)).toEqual(PANEL_DEFAULT);
    expect(canvasOf(fitPanelWidths(PANEL_DEFAULT, 1366), 1366)).toBe(672);
    // 1244 px부터 줄이기 시작한다(620 몫 − 610 = 10 px).
    expect(fitPanelWidths(PANEL_DEFAULT, 1244)).toEqual({ panel: 315, right: 295 });
    expect(canvasOf(fitPanelWidths(PANEL_DEFAULT, 1244), 1244)).toBe(560);
    // 더 좁아지면 하한(260)까지 줄이고, 그래도 480을 못 채우면 접는다.
    expect(fitPanelWidths(PANEL_DEFAULT, 1100)).toEqual({ panel: 260, right: 260 });
    expect(canvasOf(fitPanelWidths(PANEL_DEFAULT, 1100), 1100)).toBe(506);
    expect(autoCollapse(PANEL_DEFAULT, 1100)).toEqual({ panel: false, right: false });
  });

  test('createResizeWatch는 120 ms 디바운스로 한 번만 부르고 destroy 뒤에는 조용하다', () => {
    vi.useFakeTimers();
    try {
      const layout = fakeLayout();
      let calls = 0;
      const watch = createResizeWatch(layout, () => { calls += 1; });
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('resize'));
      expect(calls).toBe(0);                 // 아직 디바운스 중이다
      vi.advanceTimersByTime(LAYOUT_DEBOUNCE_MS);
      expect(calls).toBe(1);
      watch.destroy();
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(LAYOUT_DEBOUNCE_MS * 2);
      expect(calls).toBe(1);
    } finally { vi.useRealTimers(); }
  });
});
