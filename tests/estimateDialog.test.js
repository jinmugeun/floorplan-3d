// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { openEstimateDialog } from '../src/ui/estimateDialog.js';

function setup() {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  addItem(store, createItem(productById('sofa-3'), { pos: [2000, 1500] }));
  const dlg = openEstimateDialog({ store });
  return { store, dlg, root: document.querySelector('.modal.estimate') };
}
beforeEach(() => { document.body.innerHTML = ''; });

describe('견적서 대화상자', () => {
  test('제목과 표, 합계를 보여준다', () => {
    const a = setup();
    expect(a.root.querySelector('h2').textContent).toBe('실시간 견적서');
    expect(a.root.textContent).toContain('3인 소파');
    expect(a.root.textContent).toContain('890,000');
    expect(a.root.querySelector('[data-part="total"]').textContent).toContain('890,000원');
  });

  test('제품을 더하면 표가 저절로 갱신된다(실시간)', () => {
    const a = setup();
    addItem(a.store, createItem(productById('chair-dining'), { pos: [1000, 1000] }));
    expect(a.root.textContent).toContain('식탁 의자');
    expect(a.root.querySelector('[data-part="total"]').textContent).toContain((890000 + 68000).toLocaleString('ko-KR'));
  });

  test('CSV 내려받기는 파일을 만든다', () => {
    const a = setup();
    const clicks = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(tag => {
      const el = realCreate(tag);
      if (tag === 'a') el.click = () => clicks.push(el.download);
      return el;
    });
    global.URL.createObjectURL = () => 'blob:x';
    global.URL.revokeObjectURL = () => {};
    a.root.querySelector('[name="csv"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicks[0]).toMatch(/\.csv$/);
    document.createElement.mockRestore();
  });

  test('Esc로 닫으면 구독도 끊긴다', () => {
    const a = setup();
    a.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.modal.estimate')).toBeNull();
    expect(() => addItem(a.store, createItem(productById('sofa-2'), { pos: [500, 500] }))).not.toThrow();
  });

  test('다시 열면 이전 구독을 정리한다(누수 없음)', () => {
    const store = createStore(createEmptyProject());
    addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
    let live = 0;
    const origSubscribe = store.subscribe.bind(store);
    store.subscribe = fn => { live++; const unsub = origSubscribe(fn); return () => { live--; unsub(); }; };

    openEstimateDialog({ store });                          // 첫 인스턴스: 닫지 않고 바로 다시 연다
    expect(live).toBe(1);
    const second = openEstimateDialog({ store });            // 새 인스턴스가 옛 구독을 정리해야 한다
    expect(live).toBe(1);                                    // 누수라면 2가 된다
    expect(document.querySelectorAll('.modal.estimate')).toHaveLength(1);

    second.close();
    expect(live).toBe(0);
    expect(() => addItem(store, createItem(productById('sofa-2'), { pos: [500, 500] }))).not.toThrow();
  });

  test('팝업이 차단되면 toast로 안내하고 인쇄 버튼 글자는 그대로다', () => {
    const a = setup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    a.root.querySelector('[name="print"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(a.root.querySelector('[name="print"]').textContent).toBe('인쇄');
    const host = document.getElementById('toasts');
    expect(host).toBeTruthy();
    expect(host.textContent).toContain('팝업이 차단되어 인쇄 창을 열 수 없습니다');
    openSpy.mockRestore();
  });
});
