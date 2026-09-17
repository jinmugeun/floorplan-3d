import { CATEGORIES, PRODUCTS, productsIn, searchProducts, sortProducts, fmtSize, ATTACH_LABELS } from '../products/catalog.js';
import { symbolSvg } from '../products/symbols.js';
import { activeFloor } from '../state/schema.js';
import { esc } from '../util/html.js';

const key = id => `fav:${id}`;
// 즐겨찾기는 프로젝트 파일이 아니라 브라우저에 남긴다(계정이 없으므로). 저장이 막힌 브라우저에서도 죽지 않는다.
export const isFav = id => { try { return localStorage.getItem(key(id)) === '1'; } catch { return false; } };
export const toggleFav = id => { try { isFav(id) ? localStorage.removeItem(key(id)) : localStorage.setItem(key(id), '1'); } catch { /* 저장 불가 */ } };
export const favProducts = () => PRODUCTS.filter(p => isFav(p.id));

const TABS = [['ohouse', '오늘의집 제품'], ['fav', '즐겨찾기'], ['placed', '배치된 제품']];

export function createLibraryPanel(container, { store, ui, onPick = () => {} }) {
  const st = { tab: 'ohouse', category: null, sub: null, q: '', sort: 'name', mode: 'place', replaceIds: [] };
  container.innerHTML = `
    <div class="tabs" data-part="tabs"></div>
    <p class="hint" data-part="note" hidden></p>
    <div class="lib-tools">
      <input type="search" name="q" placeholder="전체 검색 (이름·코드·태그)" aria-label="제품 검색">
      <select name="sort" aria-label="정렬"><option value="name">이름순</option><option value="size">크기순</option></select>
    </div>
    <div data-part="crumbs"></div>
    <div class="lib-list" data-part="list"></div>`;
  const part = n => container.querySelector(`[data-part="${n}"]`);

  const placedCounts = () => {
    const m = new Map();
    for (const i of activeFloor(store.get()).items) m.set(i.productId, (m.get(i.productId) ?? 0) + 1);
    return m;
  };
  // null이면 타일 대신 카테고리 목록을 보여준다는 뜻이다.
  function visible() {
    if (st.q.trim()) return sortProducts(searchProducts(st.q), st.sort);       // 검색은 항상 전체 검색(명세 LB-03)
    if (st.tab === 'fav') return sortProducts(favProducts(), st.sort);
    if (st.tab === 'placed') { const m = placedCounts(); return sortProducts(PRODUCTS.filter(p => m.has(p.id)), st.sort); }
    if (!st.category) return null;
    return sortProducts(productsIn(st.category, st.sub), st.sort);
  }
  function tileHtml(p, count) {
    return `<button type="button" class="tile" data-id="${p.id}" title="${esc(`${p.name} · ${ATTACH_LABELS[p.attach]}`)}">
      ${symbolSvg(p.symbol, p.size[0], p.size[1], { solid: p.color })}
      <span class="tile-name">${esc(p.name)}</span>
      <span class="tile-code muted">${esc(p.code)}${count ? ` · ${count}개` : ''}</span>
      <span class="tile-size muted">${fmtSize(p.size)}</span>
      <span class="fav ${isFav(p.id) ? 'on' : ''}" data-fav="${p.id}" role="button" tabindex="0" aria-label="즐겨찾기">★</span>
    </button>`;
  }
  function renderTabs() {
    part('tabs').innerHTML = TABS.map(([k, l]) => `<button type="button" data-tab="${k}" class="${st.tab === k ? 'on' : ''}">${l}</button>`).join('');
    const note = part('note');
    note.hidden = st.mode !== 'replace';
    note.textContent = '교체할 제품을 선택하세요. [ESC] 키를 누르면 취소됩니다.';
  }
  function renderCrumbs() {
    const c = part('crumbs');
    if (st.tab !== 'ohouse' || st.q.trim() || !st.category) { c.innerHTML = ''; return; }
    c.innerHTML = `<button type="button" data-up="1" class="crumb">‹ ${esc(st.category)}${st.sub ? ` / ${esc(st.sub)}` : ''}</button>`;
  }
  function renderList() {
    const list = visible(), el = part('list');
    if (list === null) {
      el.innerHTML = `<ul class="cat-list">${CATEGORIES.map(c => `<li><button type="button" data-cat="${esc(c.name)}">${esc(c.name)}</button></li>`).join('')}</ul>`;
      return;
    }
    const counts = st.tab === 'placed' ? placedCounts() : null;
    const subs = st.tab === 'ohouse' && !st.q.trim() && st.category && !st.sub
      ? `<div class="subs">${[['', '전체'], ...(CATEGORIES.find(c => c.name === st.category)?.subs ?? []).map(s => [s, s])]
          .map(([v, l]) => `<button type="button" data-sub="${esc(v)}">${esc(l)}</button>`).join('')}</div>`
      : '';
    el.innerHTML = subs + (list.length
      ? `<div class="tiles">${list.map(p => tileHtml(p, counts?.get(p.id))).join('')}</div>`
      : `<p class="hint">해당하는 제품이 없습니다.</p>`);
  }
  function render() { renderTabs(); renderCrumbs(); renderList(); }

  const onClick = ev => {
    const fav = ev.target.closest('[data-fav]');
    if (fav) { ev.stopPropagation(); toggleFav(fav.dataset.fav); renderList(); return; }
    const tab = ev.target.closest('[data-tab]');
    if (tab) { st.tab = tab.dataset.tab; st.category = null; st.sub = null; render(); return; }
    if (ev.target.closest('[data-up]')) { if (st.sub) st.sub = null; else st.category = null; render(); return; }
    const cat = ev.target.closest('[data-cat]');
    if (cat) { st.category = cat.dataset.cat; st.sub = null; render(); return; }
    const sub = ev.target.closest('[data-sub]');
    if (sub) { st.sub = sub.dataset.sub || null; render(); return; }
    const tile = ev.target.closest('.tile');
    if (tile) {
      const p = PRODUCTS.find(x => x.id === tile.dataset.id);
      if (!p) return;
      const mode = st.mode, itemIds = [...st.replaceIds];
      if (mode === 'replace') { st.mode = 'place'; st.replaceIds = []; renderTabs(); }
      onPick(p, { mode, itemIds });
    }
  };
  const onInput = ev => {
    if (ev.target.name === 'q') { st.q = ev.target.value; renderCrumbs(); renderList(); return; } // 입력란은 다시 그리지 않아 포커스가 유지된다
    if (ev.target.name === 'sort') { st.sort = ev.target.value; renderList(); }
  };
  container.addEventListener('click', onClick);
  container.addEventListener('input', onInput);
  container.addEventListener('change', onInput);
  const unsub = store.subscribe(() => { if (st.tab === 'placed') renderList(); });
  render();
  return {
    destroy() { unsub(); container.removeEventListener('click', onClick); container.removeEventListener('input', onInput); container.removeEventListener('change', onInput); container.innerHTML = ''; },
    setMode(mode, { itemIds = [] } = {}) { st.mode = mode; st.replaceIds = itemIds; renderTabs(); },
    get state() { return { ...st }; },
  };
}
