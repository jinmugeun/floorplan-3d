// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, createItem } from '../src/state/schema.js';
import { addItem } from '../src/state/floorOps.js';
import { productById, CATEGORIES, PRODUCTS, CATEGORY_COLORS, productsIn, sortProducts, fmtSize } from '../src/products/catalog.js';
import { createLibraryPanel, isFav, toggleFav, GRID_PER_CHIP } from '../src/ui/libraryPanel.js';
import { LIB_MORE, LIB_MORE_LABEL } from '../src/ui/messages.js';

// 2026-10-20 · 계획 17 Task 3: 카탈로그가 엑셀 급식기구로 바뀌어 고정 예시를 소파에서 '싱크·조리대 / 상업용싱크대'로 옮겼다.
// 예시 id는 카탈로그에서 결정적으로 고른다(이름순 첫 세정대 · 첫 후드) — 엑셀이 바뀌어도 테스트가 따라온다.
const CHIP = '싱크·조리대', SUB = '상업용싱크대';
const SINKS = sortProducts(productsIn(CHIP, SUB), 'name');
const SINK = SINKS[0], SINK2 = SINKS[1];
const HOOD = sortProducts(productsIn('후드·환기', '상업용주방후드'), 'name')[0];
const chipSel = `[data-cat="${CHIP}"]`, subSel = `[data-sub="${SUB}"]`;

function setup() {
  const store = createStore(createEmptyProject()), ui = createUiState();
  const el = document.createElement('div'); document.body.appendChild(el);
  const picked = [], dragEnds = [];
  const panel = createLibraryPanel(el, { store, ui, onPick: (p, opts) => picked.push([p.id, opts?.mode]), onDragEnd: () => dragEnds.push(1) });
  return { store, ui, el, panel, picked, dragEnds };
}
const click = (el, sel) => el.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
// 키보드 활성화(Enter/Space)는 이미 포커스된 버튼에서 click을 낸다 — .focus() 뒤에 클릭해 흉내 낸다.
const focusClick = (el, sel) => { const b = el.querySelector(sel); b.focus(); b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return b; };

// document는 이 파일의 테스트들 사이에서 공유된다(jsdom 인스턴스 하나) — 앞 테스트가 남긴 포커스가
// 다음 테스트로 새지 않게 매번 지운다(포커스 복원을 검증하는 테스트를 더하며 필요해졌다).
beforeEach(() => { localStorage.clear(); document.activeElement?.blur?.(); });

describe('라이브러리 패널', () => {
  test('탭 3개와 칩 10개를 보여주고 칩 → 하위(세부품명) → 타일로 들어간다', () => {
    const { el } = setup();
    expect([...el.querySelectorAll('[data-tab]')].map(b => b.textContent)).toEqual(['급식기구', '즐겨찾기', '배치된 제품']);   // 계획 17 Task 4
    expect(el.querySelectorAll('[data-cat]')).toHaveLength(10);   // 엑셀 9개 + 건축 요소(계획 17)
    click(el, chipSel);
    expect([...el.querySelectorAll('[data-sub]')].map(b => b.dataset.sub)).toEqual(['', ...CATEGORIES.find(c => c.name === CHIP).subs]);
    click(el, subSel);
    const tiles = [...el.querySelectorAll('.tile')];
    expect(tiles.length).toBe(SINKS.length);
    expect(tiles[0].dataset.id).toBe(SINK.id);
    expect(tiles[0].querySelector('svg')).not.toBeNull();
    click(el, '[data-up]');
    expect(el.querySelectorAll('[data-sub]').length).toBeGreaterThan(0);
  });

  test('타일 클릭이 onPick을 부르고 크기 표기가 붙는다', () => {
    const { el, picked } = setup();
    click(el, chipSel); click(el, subSel);
    const tile = el.querySelector(`.tile[data-id="${SINK.id}"]`);
    expect(tile.textContent).toContain(fmtSize(SINK.size));
    tile.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(picked).toEqual([[SINK.id, 'place']]);
  });

  test('검색은 카테고리 안에 들어가 있어도 전체를 찾는다', () => {
    const { el } = setup();
    click(el, chipSel); click(el, subSel);
    const q = el.querySelector('input[name="q"]');
    q.value = '후드'; q.dispatchEvent(new Event('input', { bubbles: true }));
    const ids = [...el.querySelectorAll('.tile')].map(t => t.dataset.id);
    expect(ids).toContain(HOOD.id);
    expect(ids).not.toContain(SINK.id);
    expect(ids.every(id => !productById(id).hidden)).toBe(true);   // 숨김 단종은 찾지 않는다
    expect(el.querySelector('input[name="q"]').value).toBe('후드'); // 입력 중 포커스가 날아가지 않는다
  });

  test('정렬을 크기순으로 바꾸면 타일 순서가 바뀐다', () => {
    const { el } = setup();
    click(el, chipSel); click(el, subSel);
    const sel = el.querySelector('select[name="sort"]');
    sel.value = 'size'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect([...el.querySelectorAll('.tile')].map(t => t.dataset.id)).toEqual(sortProducts(productsIn(CHIP, SUB), 'size').map(p => p.id));   // 부피가 같으면 카탈로그 순서(안정 정렬)
  });

  test('별을 누르면 즐겨찾기가 localStorage에 남고 즐겨찾기 탭에 나온다', () => {
    const { el, picked } = setup();
    click(el, chipSel); click(el, subSel);
    click(el, `[data-fav="${SINK.id}"]`);
    expect(localStorage.getItem(`fav:${SINK.id}`)).toBe('1');
    expect(picked).toEqual([]); // 별 클릭은 배치가 아니다
    click(el, '[data-tab="fav"]');
    expect([...el.querySelectorAll('.tile')].map(t => t.dataset.id)).toEqual([SINK.id]);
    click(el, `[data-fav="${SINK.id}"]`);
    expect(isFav(SINK.id)).toBe(false);
  });

  // 계획 17: chair-dining은 숨김 단종이다 — 옛 프로젝트에 놓인 단종 제품도 '배치된 제품' 탭에는 보인다(PRODUCTS는 숨김까지 전부).
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
    click(el, chipSel); click(el, subSel);
    click(el, `.tile[data-id="${SINK2.id}"]`);
    expect(picked).toEqual([[SINK2.id, 'replace']]);
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
    click(el, chipSel); click(el, subSel);
    click(el, `.tile[data-id="${SINK2.id}"]`);
    expect(picked).toEqual([[SINK2.id, 'place']]);
  });

  test('toggleFav는 localStorage가 막혀 있어도 예외를 던지지 않는다', () => {
    const orig = localStorage.setItem;
    localStorage.setItem = () => { throw new Error('denied'); };
    expect(() => toggleFav(SINK.id)).not.toThrow();
    localStorage.setItem = orig;
  });

  test('타일 썸네일은 96 px 심벌과 카테고리 색 배경을 쓴다', () => {
    const { el } = setup();
    click(el, chipSel);
    const thumb = el.querySelector(`.tile[data-id="${SINK.id}"] .tile-thumb`);
    expect(thumb).not.toBeNull();
    expect(thumb.getAttribute('style')).toContain(CATEGORY_COLORS[CHIP]);
    const svg = thumb.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('96');
  });

  // §14.11: 처음 쓰는 사람은 썸네일을 거의 반드시 한 번 끌어 본다(감사 #11: draggable=false, 아무 일도 없음).
  test('타일을 끌면 제품 id를 dataTransfer와 ui에 싣고 끝나면 지운다', () => {
    const { el, ui, dragEnds } = setup();
    click(el, chipSel);
    const tile = el.querySelector('.tile');
    expect(tile.draggable).toBe(true);
    const data = new Map();
    const dt = { setData: (k, v) => data.set(k, v), effectAllowed: '' };
    const start = new Event('dragstart', { bubbles: true }); start.dataTransfer = dt;
    tile.dispatchEvent(start);
    expect(data.get('text/x-product')).toBe(tile.dataset.id);
    expect(dt.effectAllowed).toBe('copy');
    expect(ui.get().dragProduct).toBe(tile.dataset.id);
    // dragend는 드래그 소스(타일)에서만 일어난다: 캔버스는 받을 수 없으므로 배치 배선의 취소
    // 경로(dnd.onDragEnd)는 여기에서만 불린다 — 캔버스 위에서 [Esc]로 취소한 드래그도 이 길이다.
    const end = new Event('dragend', { bubbles: true }); end.dataTransfer = dt;
    tile.dispatchEvent(end);
    expect(dragEnds).toHaveLength(1);
    expect(ui.get().dragProduct).toBeNull();
    // 타일이 아닌 곳에서 시작한 드래그는 아무것도 싣지 않는다.
    const bare = new Event('dragstart', { bubbles: true }); bare.dataTransfer = { setData: () => { throw new Error('부르면 안 된다'); } };
    expect(() => el.querySelector('[data-part="tabs"]').dispatchEvent(bare)).not.toThrow();
  });
});

// §15.8(감사 §26): 처음 열면 제품이 하나도 없었다(카테고리 목록 13줄만).
// 계획 17 Task 4: 엑셀 ~500장을 한꺼번에 그리지 않는다 — 칩마다 제목 + 앞 GRID_PER_CHIP장 + [더 보기 (n)].
test('처음 열면 칩별 묶음 그리드와 칩 행이 함께 보인다', () => {
  const { el } = setup();
  expect(el.querySelectorAll('.chips button[data-cat]')).toHaveLength(10);   // 엑셀 9개 + 건축 요소(계획 17)
  expect(el.querySelector('[data-cat-all]').classList.contains('on')).toBe(true);
  expect([...el.querySelectorAll('.lib-group h3')].map(h => h.firstChild.textContent.trim())).toEqual(CATEGORIES.map(c => c.name));
  expect(el.querySelector('section')).toBeNull();   // shell.showPanel이 '#panel section'을 전부 숨긴다(data-panel 없는 것까지) — 묶음은 div여야 보인다
  const tiles = [...el.querySelectorAll('.tile')];
  expect(tiles.length).toBeGreaterThan(20);
  expect(tiles.length).toBeLessThanOrEqual(CATEGORIES.length * GRID_PER_CHIP);   // DOM 상한
  // 묶음마다: 제목 숫자 = 그 칩에 올라간(숨김 아닌) 제품 수 · 타일 = 정렬 순서 앞 GRID_PER_CHIP장(그보다 적으면 전부).
  for (const g of el.querySelectorAll('.lib-group')) {
    const listed = productsIn(g.querySelector('h3').firstChild.textContent.trim());
    expect(g.querySelector('h3 .muted').textContent).toBe(String(listed.length));
    const ids = [...g.querySelectorAll('.tile')].map(t => t.dataset.id);
    expect(ids).toHaveLength(Math.min(GRID_PER_CHIP, listed.length));
    expect(ids).toEqual(sortProducts(listed, 'name').slice(0, GRID_PER_CHIP).map(p => p.id));
  }
  expect(tiles.every(t => !productById(t.dataset.id).hidden)).toBe(true);        // 숨김 단종은 그리드에 없다
  // 타일은 카테고리 순이다: 첫 타일의 카테고리가 CATEGORIES의 첫 카테고리와 같다.
  expect(PRODUCTS.find(p => p.id === tiles[0].dataset.id).category).toBe(CATEGORIES[0].name);
  expect(el.querySelector('.cat-list')).toBeNull();          // 전폭 1열 목록은 사라졌다
});

test('[더 보기 (n)]은 그 칩으로 들어가 칩의 타일을 전부 보여 준다 · 12장 이하 칩에는 없다', () => {
  const { el, panel } = setup();
  const WASH = '세척·소독', all = productsIn(WASH);
  expect(all.length).toBeGreaterThan(GRID_PER_CHIP);
  const more = el.querySelector(`[data-more="${WASH}"]`);
  expect(more.textContent).toBe(LIB_MORE(all.length - GRID_PER_CHIP));
  expect(more.getAttribute('aria-label')).toBe(LIB_MORE_LABEL(WASH, all.length - GRID_PER_CHIP));   // 스크린 리더가 어느 칩의 더 보기인지 읽는다
  expect(el.querySelector('[data-more="건축 요소"]')).toBeNull();               // 문 6 · 창 3 · 기둥 2 · 개구부 = 12장
  more.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(panel.state.category).toBe(WASH);
  expect(el.querySelectorAll('.tile')).toHaveLength(all.length);
  expect(el.querySelector(`[data-cat="${WASH}"]`).classList.contains('on')).toBe(true);
});

// 계획 17 Task 4 리뷰 I-1: [더 보기]도 render()로 목록을 통째로 새로 만든다 — 누른 버튼이 DOM에서 떨어져
// document.activeElement가 <body>로 떨어졌다. 칩 포커스 복원(§Task8 I-1)과 같이 새로 켜진 칩으로 옮긴다.
test('키보드로 [더 보기]를 누르면 새로 켜진 그 칩에 포커스가 간다', () => {
  const { el } = setup();
  const WASH = '세척·소독';
  focusClick(el, `[data-more="${WASH}"]`);
  const chip = el.querySelector(`[data-cat="${WASH}"]`);
  expect(document.activeElement).toBe(chip);
  expect(chip.getAttribute('aria-pressed')).toBe('true');
});

test('마우스로 누른 [더 보기]는(포커스 없이) 포커스를 훔치지 않는다', () => {
  const { el } = setup();
  click(el, '[data-more="세척·소독"]');
  expect(document.activeElement).toBe(document.body);
});

// 계획 17 Task 4 리뷰 I-2: #panel이 스크롤 상자라 깊은 묶음의 [더 보기]를 누르면 새 목록의 ~800 px 아래에
// 떨어지고 칩 행은 화면 밖이었다. [더 보기] 뒤에는 칩 행을 다시 보이게 한다(칩은 누를 때 이미 보이므로 그대로).
test('[더 보기]를 누르면 칩 행을 다시 보이게 스크롤한다 · 칩 클릭은 스크롤하지 않는다', () => {
  const { el } = setup();
  const calls = [];
  el.querySelector('[data-part="chips"]').scrollIntoView = opts => calls.push(opts);   // jsdom은 스크롤을 그리지 않는다 — 부름만 본다
  click(el, chipSel); click(el, '[data-cat-all]');
  expect(calls).toEqual([]);
  click(el, '[data-more="세척·소독"]');
  expect(calls).toEqual([{ block: 'nearest' }]);
});

test('칩을 누르면 필터, "전체"를 누르면 다시 전체다', () => {
  const { el, panel } = setup();
  click(el, chipSel);
  expect(panel.state.category).toBe(CHIP);
  expect(el.querySelector(chipSel).classList.contains('on')).toBe(true);
  const filtered = el.querySelectorAll('.tile').length;
  click(el, chipSel);                                        // 같은 칩을 다시 누르면 필터가 풀린다
  expect(panel.state.category).toBeNull();
  expect(el.querySelectorAll('.tile').length).toBeGreaterThan(filtered);
  click(el, chipSel);
  click(el, '[data-cat-all]');
  expect(panel.state.category).toBeNull();
  expect(el.querySelector('[data-cat-all]').classList.contains('on')).toBe(true);
});

// 리뷰 §Task8 I-1: renderChips()가 칩 행을 통째로 새로 만들어 방금 누른 칩 노드가 사라지고
// document.activeElement가 <body>로 떨어진다. 포커스가 있던(키보드) 활성화만 되돌린다.
test('키보드로 칩을 누르면 다시 그린 뒤에도 같은 칩에 포커스가 남는다', () => {
  const { el } = setup();
  const before = el.querySelector(chipSel);
  focusClick(el, chipSel);
  const after = el.querySelector(chipSel);
  expect(after).not.toBe(before);                    // 옛 노드는 실제로 버려졌다
  expect(document.activeElement).toBe(after);
  expect(after.getAttribute('aria-pressed')).toBe('true');
});

test('포커스된 칩을 다시 눌러 끄면 "전체" 칩으로 포커스가 돌아간다', () => {
  const { el } = setup();
  focusClick(el, chipSel);
  document.activeElement.dispatchEvent(new MouseEvent('click', { bubbles: true })); // 같은(이미 포커스된) 칩 재클릭 = 토글 off
  const allBtn = el.querySelector('[data-cat-all]');
  expect(document.activeElement).toBe(allBtn);
  expect(allBtn.getAttribute('aria-pressed')).toBe('true');
});

test('마우스로 누른 칩은(포커스 없이) 다시 그려도 포커스를 훔치지 않는다', () => {
  const { el } = setup();
  click(el, chipSel); // 기존 click 헬퍼는 focus를 주지 않는다 — 실제 마우스 클릭과 같다
  expect(document.activeElement).toBe(document.body);
});

// 리뷰 M-3: 검색창의 [Esc]가 글자만 되돌리면 "빈 검색창 + 걸러진 목록"으로 어긋났다.
// revertField가 되돌린 값으로 input을 한 번 쏘므로 목록 필터도 같이 풀린다.
test('검색창의 [Esc]는 글자와 목록 필터를 함께 되돌린다', async () => {
  const { rememberFieldValue, revertField } = await import('../src/ui/fieldUtils.js');
  const { el } = setup();
  const ids = () => [...el.querySelectorAll('.tile')].map(t => t.dataset.id);
  const before = ids();
  expect(before.length).toBeGreaterThan(1);
  const q = el.querySelector('input[name="q"]');
  q.focus(); rememberFieldValue(q);
  q.value = '후드'; q.dispatchEvent(new Event('input', { bubbles: true }));
  const filtered = ids();
  expect(filtered).toContain(HOOD.id);
  expect(filtered.length).toBeLessThan(before.length);
  expect(revertField(q)).toBe(true);
  expect(el.querySelector('input[name="q"]').value).toBe('');
  expect(ids()).toEqual(before);                     // 칸과 목록이 같은 값으로 돌아온다
});
