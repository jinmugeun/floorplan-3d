// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { PANEL_MIN, PANEL_MAX, PANEL_DEFAULT, loadPanelWidths, savePanelWidth, fitPanelWidths, applyPanelWidths, createSplitter, togglePanel } from '../src/ui/layout.js';

function fakeLayout() {
  const root = document.createElement('div');
  root.innerHTML = `<div id="layout"><aside id="panel"></aside><div id="panelSplitter"></div><main id="canvasWrap"></main><div id="rightSplitter"></div><aside id="right"></aside></div>`;
  document.body.appendChild(root);
  return root.querySelector('#layout');
}
const down = (el, x) => el.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: x, bubbles: true, cancelable: true }));
const move = (el, x) => el.dispatchEvent(new MouseEvent('pointermove', { clientX: x, bubbles: true }));
const up = (el, x) => el.dispatchEvent(new MouseEvent('pointerup', { clientX: x, bubbles: true }));

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });

describe('패널 폭', () => {
  test('기본값과 범위', () => {
    expect([PANEL_MIN, PANEL_MAX]).toEqual([260, 480]);
    expect(PANEL_DEFAULT).toEqual({ panel: 320, right: 300 });
    expect(loadPanelWidths()).toEqual({ panel: 320, right: 300 });
    // 좁은 창에서는 저장된 폭이라도 최소 폭으로 줄인다(인라인 폭이 미디어 쿼리를 이기므로 CSS가 아니라 여기서 정한다).
    expect(fitPanelWidths({ panel: 400, right: 400 }, 1000)).toEqual({ panel: 260, right: 260 });
    expect(fitPanelWidths({ panel: 400, right: 400 }, 1280)).toEqual({ panel: 400, right: 400 });
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
