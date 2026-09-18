// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { applyMaterial, setWallRegions } from '../src/state/materialOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { createMaterialPanel, isFavMaterial, toggleFavMaterial, placedMaterials } from '../src/ui/materialPanel.js';

function setup() {
  const store = createStore(createEmptyProject()), ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  const el = document.createElement('div'); document.body.appendChild(el);
  const picked = [];
  const panel = createMaterialPanel(el, { store, ui, onPick: (m, opts) => picked.push([m.id, opts.mode, opts.target]) });
  return { store, ui, el, panel, picked, floor: () => activeFloor(store.get()) };
}
const click = (el, sel) => el.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const mat = id => ({ id, offset: [0, 0], angle: 0 });

beforeEach(() => localStorage.clear());

describe('마감재 패널', () => {
  test('탭 3개와 카테고리 11개를 보여주고 카테고리로 들어가면 스와치 타일이 나온다', () => {
    const { el } = setup();
    expect([...el.querySelectorAll('[data-tab]')].map(b => b.textContent)).toEqual(['오늘의집 마감재', '즐겨찾기', '배치된 마감재']);
    expect(el.querySelectorAll('[data-cat]')).toHaveLength(11);
    click(el, '[data-cat="타일"]');
    const tiles = [...el.querySelectorAll('.tile')];
    expect(tiles).toHaveLength(4);
    expect(tiles[0].querySelector('canvas')).not.toBeNull();
    expect(tiles[0].textContent).toContain('오늘의집');
    click(el, '[data-up]');
    expect(el.querySelectorAll('[data-cat]')).toHaveLength(11);
  });

  test('타일을 클릭하면 적용 모드가 켜지고 onPick이 불린다', () => {
    const { el, ui, picked } = setup();
    click(el, '[data-cat="벽돌"]');
    click(el, '.tile[data-id="brick-red"]');
    expect(ui.get().matPick).toEqual({ assignment: mat('brick-red') });
    expect(picked).toEqual([['brick-red', 'place', null]]);
  });

  test('교체 모드는 안내를 띄우고 한 번 고르면 배치 모드로 돌아온다', () => {
    const { el, ui, panel, picked } = setup();
    const target = { kind: 'floor', id: 'r1' };
    panel.setMode('replace', { target });
    expect(el.querySelector('[data-part="note"]').hidden).toBe(false);
    expect(el.querySelector('[data-part="note"]').textContent).toContain('교체할 재질을 선택하세요');
    click(el, '[data-cat="마루/잔디"]');
    click(el, '.tile[data-id="wood-oak"]');
    expect(picked).toEqual([['wood-oak', 'replace', target]]);
    expect(ui.get().matPick).toBeNull();           // 교체는 연속 적용이 아니다
    expect(panel.state.mode).toBe('place');
    expect(el.querySelector('[data-part="note"]').hidden).toBe(true);
  });

  // main.js의 cancelReplace(Esc·도구 전환·레일 이동)가 이 경로로 교체 모드를 끈다(I-18).
  test('setMode("place")로 교체 모드를 끌 수 있다', () => {
    const { el, panel } = setup();
    panel.setMode('replace', { target: { kind: 'floor', id: 'r1' } });
    expect(panel.state.mode).toBe('replace');
    panel.setMode('place');
    expect(el.querySelector('[data-part="note"]').hidden).toBe(true);
    expect(panel.state.target).toBeNull();
  });

  test('검색은 카테고리 밖에서도 찾고 즐겨찾기는 브라우저에 남는다', () => {
    const { el } = setup();
    const q = el.querySelector('input[name="q"]');
    q.value = '오크'; q.dispatchEvent(new Event('input', { bubbles: true }));
    expect(el.querySelectorAll('.tile')).toHaveLength(1);
    click(el, '[data-fav="wood-oak"]');
    expect(isFavMaterial('wood-oak')).toBe(true);
    q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
    click(el, '[data-tab="fav"]');
    expect([...el.querySelectorAll('.tile')].map(t => t.dataset.id)).toEqual(['wood-oak']);
    toggleFavMaterial('wood-oak');
    expect(isFavMaterial('wood-oak')).toBe(false);
  });

  test('배치된 마감재 탭은 벽·방·영역에 쓰인 재질을 개수와 함께 보여준다', () => {
    const a = setup();
    const f = a.floor();
    applyMaterial(a.store, { kind: 'wall', id: f.walls[0].id, side: 'in' }, mat('brick-red'));
    applyMaterial(a.store, { kind: 'wall', id: f.walls[1].id, side: 'out' }, mat('brick-red'));
    applyMaterial(a.store, { kind: 'floor', id: f.rooms[0].id }, mat('wood-oak'));
    setWallRegions(a.store, f.walls[0].id, 'in', [{ kind: 'band', z0: 0, z1: 1200.5, mat: mat('tile-white-300') }]);
    const counts = placedMaterials(a.floor());
    expect(counts.get('brick-red')).toBe(2);
    expect(counts.get('wood-oak')).toBe(1);
    expect(counts.get('tile-white-300')).toBe(1);
    click(a.el, '[data-tab="placed"]');
    expect([...a.el.querySelectorAll('.tile')].map(t => t.dataset.id).sort()).toEqual(['brick-red', 'tile-white-300', 'wood-oak']);
    expect(a.el.textContent).toContain('2개');
  });

  test('destroy가 구독과 리스너를 끊는다', () => {
    const a = setup();
    a.panel.destroy();
    expect(a.el.innerHTML).toBe('');
  });
});
