// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, createItem } from '../src/state/schema.js';
import { addItem } from '../src/state/floorOps.js';
import { productById } from '../src/products/catalog.js';
import { createLibraryPanel, isFav, toggleFav } from '../src/ui/libraryPanel.js';

function setup() {
  const store = createStore(createEmptyProject()), ui = createUiState();
  const el = document.createElement('div'); document.body.appendChild(el);
  const picked = [];
  const panel = createLibraryPanel(el, { store, ui, onPick: (p, opts) => picked.push([p.id, opts?.mode]) });
  return { store, ui, el, panel, picked };
}
const click = (el, sel) => el.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));

beforeEach(() => localStorage.clear());

describe('라이브러리 패널', () => {
  test('탭 3개와 카테고리 13개를 보여주고 카테고리 → 하위 → 타일로 들어간다', () => {
    const { el } = setup();
    expect([...el.querySelectorAll('[data-tab]')].map(b => b.textContent)).toEqual(['오늘의집 제품', '즐겨찾기', '배치된 제품']);
    expect(el.querySelectorAll('[data-cat]')).toHaveLength(13);   // '환기 설비' 카테고리가 늘었다
    click(el, '[data-cat="소파"]');
    expect([...el.querySelectorAll('[data-sub]')].map(b => b.dataset.sub)).toEqual(['', '소파', '리클라이너']);
    click(el, '[data-sub="소파"]');
    const tiles = [...el.querySelectorAll('.tile')];
    expect(tiles.length).toBe(3);
    expect(tiles[0].textContent).toContain('SF-');
    expect(tiles[0].querySelector('svg')).not.toBeNull();
    click(el, '[data-up]');
    expect(el.querySelectorAll('[data-sub]').length).toBeGreaterThan(0);
  });

  test('타일 클릭이 onPick을 부르고 크기 표기가 붙는다', () => {
    const { el, picked } = setup();
    click(el, '[data-cat="소파"]'); click(el, '[data-sub="소파"]');
    const tile = el.querySelector('.tile[data-id="sofa-3"]');
    expect(tile.textContent).toContain('2100×900×800');
    tile.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(picked).toEqual([['sofa-3', 'place']]);
  });

  test('검색은 카테고리 안에 들어가 있어도 전체를 찾는다', () => {
    const { el } = setup();
    click(el, '[data-cat="소파"]'); click(el, '[data-sub="소파"]');
    const q = el.querySelector('input[name="q"]');
    q.value = '침대'; q.dispatchEvent(new Event('input', { bubbles: true }));
    const ids = [...el.querySelectorAll('.tile')].map(t => t.dataset.id);
    expect(ids).toContain('bed-queen');
    expect(ids).not.toContain('sofa-3');
    expect(el.querySelector('input[name="q"]').value).toBe('침대'); // 입력 중 포커스가 날아가지 않는다
  });

  test('정렬을 크기순으로 바꾸면 타일 순서가 바뀐다', () => {
    const { el } = setup();
    click(el, '[data-cat="소파"]'); click(el, '[data-sub="소파"]');
    const sel = el.querySelector('select[name="sort"]');
    sel.value = 'size'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect([...el.querySelectorAll('.tile')].map(t => t.dataset.id)).toEqual(['sofa-2', 'sofa-3', 'sofa-corner']);
  });

  test('별을 누르면 즐겨찾기가 localStorage에 남고 즐겨찾기 탭에 나온다', () => {
    const { el, picked } = setup();
    click(el, '[data-cat="소파"]'); click(el, '[data-sub="소파"]');
    click(el, '[data-fav="sofa-3"]');
    expect(localStorage.getItem('fav:sofa-3')).toBe('1');
    expect(picked).toEqual([]); // 별 클릭은 배치가 아니다
    click(el, '[data-tab="fav"]');
    expect([...el.querySelectorAll('.tile')].map(t => t.dataset.id)).toEqual(['sofa-3']);
    click(el, '[data-fav="sofa-3"]');
    expect(isFav('sofa-3')).toBe(false);
  });

  test('배치된 제품 탭은 현재 층의 제품과 개수를 보여준다', () => {
    const { store, el } = setup();
    addItem(store, createItem(productById('chair-dining'), { pos: [0, 0] }));
    addItem(store, createItem(productById('chair-dining'), { pos: [500, 0] }));
    click(el, '[data-tab="placed"]');
    const tile = el.querySelector('.tile[data-id="chair-dining"]');
    expect(tile).not.toBeNull();
    expect(tile.textContent).toContain('2개');
    expect(el.querySelectorAll('.tile')).toHaveLength(1);
  });

  test('교체 모드는 안내를 띄우고 onPick에 mode replace와 itemIds를 준다', () => {
    const { el, panel, picked } = setup();
    panel.setMode('replace', { itemIds: ['i1', 'i2'] });
    expect(el.textContent).toContain('교체할 제품을 선택하세요');
    click(el, '[data-cat="소파"]'); click(el, '[data-sub="소파"]');
    click(el, '.tile[data-id="sofa-2"]');
    expect(picked).toEqual([['sofa-2', 'replace']]);
    expect(panel.state.mode).toBe('place'); // 한 번 교체하면 배치 모드로 돌아간다
  });

  // I-4: setMode('place')가 교체 모드를 되돌리는 유일한 문이다(main.js의 cancelReplace가 Esc·도구
  // 전환·패널 이동에서 이것을 부른다). 되돌린 뒤 타일을 누르면 교체가 아니라 배치여야 한다.
  test("setMode('place')가 교체 모드를 되돌리고 다음 타일 클릭은 배치가 된다", () => {
    const { el, panel, picked } = setup();
    panel.setMode('replace', { itemIds: ['i1', 'i2'] });
    expect(panel.state.mode).toBe('replace');
    expect(el.querySelector('[data-part="note"]').hidden).toBe(false);
    panel.setMode('place'); // = cancelReplace()
    expect(panel.state.mode).toBe('place');
    expect(panel.state.replaceIds).toEqual([]);
    expect(el.querySelector('[data-part="note"]').hidden).toBe(true);
    click(el, '[data-cat="소파"]'); click(el, '[data-sub="소파"]');
    click(el, '.tile[data-id="sofa-2"]');
    expect(picked).toEqual([['sofa-2', 'place']]);
  });

  test('toggleFav는 localStorage가 막혀 있어도 예외를 던지지 않는다', () => {
    const orig = localStorage.setItem;
    localStorage.setItem = () => { throw new Error('denied'); };
    expect(() => toggleFav('sofa-3')).not.toThrow();
    localStorage.setItem = orig;
  });
});
