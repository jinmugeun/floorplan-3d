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
  test('합계와 버튼은 스크롤 본문 밖의 고정 푸터에 있다(§16.2 · 감사 §1)', () => {
    const a = setup();
    const foot = a.root.querySelector('.est-foot');
    expect(foot).not.toBeNull();
    expect(foot.querySelector('[data-part="total"]')).not.toBeNull();
    for (const name of ['csv', 'print', 'close']) expect(foot.querySelector(`[name="${name}"]`)).not.toBeNull();
    // 표는 자기 영역에서만 스크롤한다(푸터가 그 밖에 있다).
    expect(a.root.querySelector('[data-part="table"]').parentElement).toBe(a.root.querySelector('.modal-card'));
    expect(a.root.querySelector('.est-note').textContent).toBe('단가는 예시 값(2026-09 기준)');
  });

  test('덕트·마감재 행은 수량·단위 칸을 쓰고 열 제목이 아홉 개다', () => {
    const a = setup();
    const head = [...a.root.querySelectorAll('.est-table thead th')].map(th => th.textContent);
    expect(head).toEqual(['구분', '이름', '코드', '규격', '길이', '수량', '단위', '단가', '금액']);
    const cells = [...a.root.querySelectorAll('.est-table tbody tr td')].map(td => td.textContent);
    expect(cells).toEqual(['제품', '3인 소파', 'SF-3P', '2100×900×800', '', '1', '개', '890,000원', '890,000원']);
  });

  test('항목이 0이면 [CSV]·[인쇄]가 비활성 + 사유다(감사 §5)', () => {
    document.body.innerHTML = '';
    const store = createStore(createEmptyProject());
    openEstimateDialog({ store });
    const root = document.querySelector('.modal.estimate');
    for (const name of ['csv', 'print']) {
      const b = root.querySelector(`[name="${name}"]`);
      expect(b.disabled).toBe(true);
      expect(b.title).toBe('배치된 제품·마감재·덕트가 없습니다');
    }
    expect(root.querySelector('[name="close"]').disabled).toBe(false);
  });
});
