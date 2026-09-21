import { MATERIAL_CATEGORIES, MATERIALS, materialsIn, searchMaterials, materialById } from '../materials/catalog.js';
import { drawPattern } from '../materials/pattern.js';
import { activeFloor } from '../state/schema.js';
import { esc } from '../util/html.js';

const key = id => `favmat:${id}`;
// 즐겨찾기는 프로젝트 파일이 아니라 브라우저에 남긴다(계정이 없으므로). 저장이 막힌 브라우저에서도 죽지 않는다.
export const isFavMaterial = id => { try { return localStorage.getItem(key(id)) === '1'; } catch { return false; } };
export const toggleFavMaterial = id => { try { isFavMaterial(id) ? localStorage.removeItem(key(id)) : localStorage.setItem(key(id), '1'); } catch { /* 저장 불가 */ } };
export const favMaterials = () => MATERIALS.filter(m => isFavMaterial(m.id));

// 이 층에서 실제로 쓰인 재질과 그 횟수(벽 안·밖, 영역, 방 바닥·천장).
export function placedMaterials(floor) {
  const counts = new Map();
  const add = a => { if (a?.id) counts.set(a.id, (counts.get(a.id) ?? 0) + 1); };
  for (const w of floor.walls ?? []) {
    add(w.matIn); add(w.matOut);
    for (const side of ['in', 'out']) for (const rg of w.regions?.[side] ?? []) add(rg.mat);
  }
  for (const r of floor.rooms ?? []) { add(r.floorMat); add(r.ceilingMat); }
  return counts;
}

export const SWATCH_PX = 96;
export function drawSwatch(canvas, material) {
  canvas.width = SWATCH_PX; canvas.height = SWATCH_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;                                        // jsdom 등 2D 컨텍스트가 없는 환경
  drawPattern(ctx, material, SWATCH_PX);
}

const TABS = [['ohouse', '오늘의집 마감재'], ['fav', '즐겨찾기'], ['placed', '배치된 마감재']];

export function createMaterialPanel(container, { store, ui, onPick = () => {} }) {
  const st = { tab: 'ohouse', category: null, q: '', mode: 'place', target: null };
  container.innerHTML = `
    <div class="tabs" data-part="tabs"></div>
    <p class="hint" data-part="note" hidden></p>
    <div class="lib-tools"><input type="search" name="q" placeholder="전체 검색 (이름·코드)" aria-label="마감재 검색"></div>
    <div data-part="crumbs"></div>
    <div class="lib-list" data-part="list"></div>`;
  const part = n => container.querySelector(`[data-part="${n}"]`);

  // null이면 타일 대신 카테고리 목록을 보여준다는 뜻이다.
  function visible() {
    if (st.q.trim()) return searchMaterials(st.q);
    if (st.tab === 'fav') return favMaterials();
    if (st.tab === 'placed') { const c = placedMaterials(activeFloor(store.get())); return MATERIALS.filter(m => c.has(m.id)); }
    if (!st.category) return null;
    return materialsIn(st.category);
  }
  const tileHtml = (m, count) => `<button type="button" class="tile" data-id="${m.id}" title="${esc(`${m.name} · ${m.category}`)}">
      <canvas class="swatch" width="${SWATCH_PX}" height="${SWATCH_PX}" aria-hidden="true"></canvas>
      <span class="tile-name">${esc(m.name)}</span>
      <span class="tile-code muted">${esc(m.code)}${count ? ` · ${count}개` : ''}</span>
      <span class="tile-size muted">${esc(m.maker)}</span>
      <span class="fav ${isFavMaterial(m.id) ? 'on' : ''}" data-fav="${m.id}" role="button" tabindex="0" aria-label="즐겨찾기">★</span>
    </button>`;
  function renderTabs() {
    part('tabs').innerHTML = TABS.map(([k, l]) => `<button type="button" data-tab="${k}" class="${st.tab === k ? 'on' : ''}">${l}</button>`).join('');
    const note = part('note');
    note.hidden = st.mode !== 'replace';
    note.textContent = '교체할 재질을 선택하세요. [ESC] 키를 누르면 취소됩니다.';
  }
  function renderCrumbs() {
    const c = part('crumbs');
    c.innerHTML = st.tab !== 'ohouse' || st.q.trim() || !st.category ? '' : `<button type="button" data-up="1" class="crumb">‹ ${esc(st.category)}</button>`;
  }
  function renderList() {
    const list = visible(), el = part('list');
    if (list === null) {
      el.innerHTML = `<ul class="cat-list">${MATERIAL_CATEGORIES.map(c => `<li><button type="button" data-cat="${esc(c)}">${esc(c)}</button></li>`).join('')}</ul>`;
      return;
    }
    const counts = st.tab === 'placed' ? placedMaterials(activeFloor(store.get())) : null;
    el.innerHTML = list.length
      ? `<div class="tiles">${list.map(m => tileHtml(m, counts?.get(m.id))).join('')}</div>`
      : '<p class="hint">해당하는 마감재가 없습니다.</p>';
    // 스와치는 innerHTML 다음에 그린다(캔버스는 문자열로 그릴 수 없다).
    for (const c of el.querySelectorAll('canvas.swatch')) drawSwatch(c, materialById(c.closest('.tile').dataset.id));
  }
  const render = () => { renderTabs(); renderCrumbs(); renderList(); };

  const onClick = ev => {
    const fav = ev.target.closest('[data-fav]');
    if (fav) { ev.stopPropagation(); toggleFavMaterial(fav.dataset.fav); renderList(); return; }
    const tab = ev.target.closest('[data-tab]');
    if (tab) { st.tab = tab.dataset.tab; st.category = null; render(); return; }
    if (ev.target.closest('[data-up]')) { st.category = null; render(); return; }
    const cat = ev.target.closest('[data-cat]');
    if (cat) { st.category = cat.dataset.cat; render(); return; }
    const tile = ev.target.closest('.tile');
    if (!tile) return;
    const m = materialById(tile.dataset.id);
    if (!m) return;
    if (st.mode === 'replace') {
      const target = st.target;
      st.mode = 'place'; st.target = null; renderTabs();
      onPick(m, { mode: 'replace', target });
      return;
    }
    // 배치 모드: 연속 적용을 켠다(Esc로 끝난다).
    ui.set({ matPick: { assignment: { id: m.id, offset: [0, 0], angle: 0 } } });
    onPick(m, { mode: 'place', target: null });
  };
  const onInput = ev => { if (ev.target.name === 'q') { st.q = ev.target.value; renderCrumbs(); renderList(); } }; // 입력란은 다시 그리지 않아 포커스가 유지된다
  container.addEventListener('click', onClick);
  container.addEventListener('input', onInput);
  const unsub = store.subscribe(() => { if (st.tab === 'placed') renderList(); });
  render();
  return {
    destroy() { unsub(); container.removeEventListener('click', onClick); container.removeEventListener('input', onInput); container.innerHTML = ''; },
    setMode(mode, { target = null } = {}) { st.mode = mode; st.target = target; renderTabs(); },
    get state() { return { ...st }; },
  };
}
