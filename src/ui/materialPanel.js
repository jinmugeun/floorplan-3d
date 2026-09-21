import { MATERIAL_CATEGORIES, MATERIALS, materialsIn, searchMaterials, materialById } from '../materials/catalog.js';
import { drawPattern } from '../materials/pattern.js';
import { activeFloor, MAT_RANGE } from '../state/schema.js';
import { esc } from '../util/html.js';
import { chipsHtml } from './libraryChips.js';

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

// 타일 크기 덮어쓰기(§13.3). 범위는 normalizeAssignment가 자르는 값과 같은 곳에서 온다.
export const TILE_CATEGORY = '타일';
export const TILE_SCALE_RANGE = [...MAT_RANGE.scale];   // 카탈로그·스키마의 배열을 그대로 내주지 않는다(M-4)
const clampScale = v => Math.min(TILE_SCALE_RANGE[1], Math.max(TILE_SCALE_RANGE[0], Math.round(Number(v) || TILE_SCALE_RANGE[0])));
export const tileScaleHtml = ([w, h]) => `<div class="mat-scale">
  <span class="muted">타일 크기</span>
  <input type="number" name="scaleW" value="${w}" min="${TILE_SCALE_RANGE[0]}" max="${TILE_SCALE_RANGE[1]}" step="10" aria-label="타일 가로 크기(mm)">
  <span class="muted">×</span>
  <input type="number" name="scaleH" value="${h}" min="${TILE_SCALE_RANGE[0]}" max="${TILE_SCALE_RANGE[1]}" step="10" aria-label="타일 세로 크기(mm)">
</div>`;
const defaultTileScale = () => [...(materialsIn(TILE_CATEGORY)[0]?.scale ?? [300, 300])];

const TABS = [['ohouse', '오늘의집 마감재'], ['fav', '즐겨찾기'], ['placed', '배치된 마감재']];

export function createMaterialPanel(container, { store, ui, onPick = () => {} }) {
  const st = { tab: 'ohouse', category: null, q: '', mode: 'place', target: null, scale: null };
  container.innerHTML = `
    <div class="tabs" data-part="tabs"></div>
    <p class="hint" data-part="note" hidden></p>
    <div data-part="chips"></div>
    <div data-part="tile"></div>
    <div class="lib-tools"><input type="search" name="q" placeholder="전체 검색 (이름·코드)" aria-label="마감재 검색"></div>
    <div data-part="crumbs"></div>
    <div class="lib-list" data-part="list"></div>`;
  const part = n => container.querySelector(`[data-part="${n}"]`);

  function visible() {
    if (st.q.trim()) return searchMaterials(st.q);
    if (st.tab === 'fav') return favMaterials();
    if (st.tab === 'placed') { const c = placedMaterials(activeFloor(store.get())); return MATERIALS.filter(m => c.has(m.id)); }
    if (!st.category) return MATERIALS;      // §15.8: 필터가 없으면 전체 그리드(카탈로그 순서)
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
    note.textContent = '교체할 재질을 선택하세요. [Esc]를 누르면 취소됩니다.';
  }
  // 타일 크기 두 칸은 카테고리가 '타일'일 때만 보인다(§13.3).
  function renderTile() {
    part('tile').innerHTML = st.category === TILE_CATEGORY ? tileScaleHtml(st.scale ?? defaultTileScale()) : '';
  }
  function renderCrumbs() {
    const c = part('crumbs');
    c.innerHTML = st.tab !== 'ohouse' || st.q.trim() || !st.category ? '' : `<button type="button" data-up="1" class="crumb">‹ ${esc(st.category)}</button>`;
  }
  function renderChips() {
    part('chips').innerHTML = st.tab === 'ohouse' && !st.q.trim() ? chipsHtml(MATERIAL_CATEGORIES, { active: st.category }) : '';
  }
  function renderList() {
    const list = visible(), el = part('list');
    const counts = st.tab === 'placed' ? placedMaterials(activeFloor(store.get())) : null;
    el.innerHTML = list.length
      ? `<div class="tiles">${list.map(m => tileHtml(m, counts?.get(m.id))).join('')}</div>`
      : '<p class="hint">해당하는 마감재가 없습니다.</p>';
    // 스와치는 innerHTML 다음에 그린다(캔버스는 문자열로 그릴 수 없다).
    for (const c of el.querySelectorAll('canvas.swatch')) drawSwatch(c, materialById(c.closest('.tile').dataset.id));
  }
  const render = () => { renderTabs(); renderChips(); renderTile(); renderCrumbs(); renderList(); };

  const onClick = ev => {
    const fav = ev.target.closest('[data-fav]');
    if (fav) { ev.stopPropagation(); toggleFavMaterial(fav.dataset.fav); renderList(); return; }
    const tab = ev.target.closest('[data-tab]');
    if (tab) { st.tab = tab.dataset.tab; st.category = null; render(); return; }
    if (ev.target.closest('[data-up]')) { st.category = null; render(); return; }
    if (ev.target.closest('[data-cat-all]')) { st.category = null; render(); return; }
    const cat = ev.target.closest('[data-cat]');
    if (cat) { st.category = st.category === cat.dataset.cat ? null : cat.dataset.cat; render(); return; }   // 같은 칩 = 토글(§15.8)
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
    // 배치 모드: 연속 적용을 켠다(Esc로 끝난다). 타일 카테고리에서는 위 두 칸의 크기를 함께 싣는다(§13.3).
    // 검색 중에는 목록이 전 카테고리라 카테고리 필터가 실제로 걸려 있지 않다: 그때 나온 비-타일에
    // 타일 크기를 실으면 그 재질이 자기 scale 대신 타일 크기로 반복되고 저장 파일에도 남는다(I-1).
    const tiling = st.category === TILE_CATEGORY && !st.q.trim();
    const scale = tiling ? [...(st.scale ?? defaultTileScale())] : null;
    ui.set({ matPick: { assignment: { id: m.id, offset: [0, 0], angle: 0, ...(scale ? { scale } : {}) }, ...(tiling ? { category: TILE_CATEGORY } : {}) } });
    onPick(m, { mode: 'place', target: null });
  };
  // 입력란은 다시 그리지 않아 포커스가 유지된다.
  const onInput = ev => {
    const name = ev.target.name;
    if (name === 'q') { st.q = ev.target.value; renderChips(); renderCrumbs(); renderList(); return; }
    if (name !== 'scaleW' && name !== 'scaleH') return;
    if (st.category !== TILE_CATEGORY) return;              // 타일 칸이 남아 있는 다른 카테고리에서는 읽지 않는다
    st.scale = [clampScale(container.querySelector('[name="scaleW"]').value), clampScale(container.querySelector('[name="scaleH"]').value)];
    // 이미 켜져 있는 적용 모드도 새 크기를 따라가게 한다(다음 클릭부터 바로 먹는다).
    // 타일 흐름에서 켠 matPick만 따라간다: 벽 메뉴 "마감재 복사"가 넣어 둔 비-타일 배정에
    // 타일 크기를 주입하지 않게 category까지 본다(I-1).
    const pick = ui.get().matPick;
    if (pick?.assignment && pick.category === TILE_CATEGORY) ui.set({ matPick: { ...pick, assignment: { ...pick.assignment, scale: [...st.scale] } } });
  };
  container.addEventListener('click', onClick);
  container.addEventListener('input', onInput);
  const unsub = store.subscribe(() => { if (st.tab === 'placed') renderList(); });
  render();
  return {
    destroy() { unsub(); container.removeEventListener('click', onClick); container.removeEventListener('input', onInput); container.innerHTML = ''; },
    setMode(mode, { target = null } = {}) { st.mode = mode; st.target = target; renderTabs(); },
    // 벽 메뉴 "타일 배치"(§13.3): 타일 카테고리로 필터해 열고 첫 타일로 적용 모드를 켠다.
    placeTile() {
      const m = materialsIn(TILE_CATEGORY)[0] ?? null;
      st.tab = 'ohouse'; st.q = ''; st.category = TILE_CATEGORY; st.mode = 'place'; st.target = null;
      st.scale = [...(m?.scale ?? [300, 300])];
      const q = container.querySelector('[name="q"]');
      if (q) q.value = '';
      render();
      // 좌측 패널을 펴는 것은 호출자(main의 surfaceActions.placeTile → shell.showPanel)가 하고,
      // 여기서는 방금 보인 타일 크기 칸에 포커스를 준다(§14.10 — 감사 #17).
      const w = container.querySelector('[name="scaleW"]');
      w?.focus(); w?.select?.();
      if (m) ui.set({ matPick: { assignment: { id: m.id, offset: [0, 0], angle: 0, scale: [...st.scale] }, category: TILE_CATEGORY } });
      return m;
    },
    get state() { return { ...st }; },
  };
}
