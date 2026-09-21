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

// §13.3: 타일 카테고리에서만 "타일 크기 W × H" 두 칸이 보이고, 그 값이 matPick으로 실린다.
describe('타일 배치와 타일 크기', () => {
  test('타일 카테고리에서만 크기 두 칸이 보인다', () => {
    const { el } = setup();
    expect(el.querySelector('[name="scaleW"]')).toBeNull();
    click(el, '[data-cat="벽돌"]');
    expect(el.querySelector('[name="scaleW"]')).toBeNull();
    click(el, '[data-up]');
    click(el, '[data-cat="타일"]');
    expect(el.querySelector('[name="scaleW"]').value).toBe('300');   // tile-white-300의 기본 크기
    expect(el.querySelector('[name="scaleH"]').value).toBe('300');
    expect(el.querySelectorAll('.tile')).toHaveLength(4);            // 타일 목록은 그대로다
  });

  test('타일을 고르면 지금의 크기가 matPick에 실리고, 칸을 고치면 곧바로 반영된다', () => {
    const { el, ui } = setup();
    click(el, '[data-cat="타일"]');
    const w = el.querySelector('[name="scaleW"]');
    w.value = '600';
    w.dispatchEvent(new Event('input', { bubbles: true }));
    click(el, '.tile[data-id="tile-gray-600"]');
    expect(ui.get().matPick).toEqual({ assignment: { id: 'tile-gray-600', offset: [0, 0], angle: 0, scale: [600, 300] }, category: '타일' });
    const h = el.querySelector('[name="scaleH"]');
    h.value = '450';
    h.dispatchEvent(new Event('input', { bubbles: true }));
    expect(ui.get().matPick.assignment.scale).toEqual([600, 450]);   // 켜져 있는 적용 모드도 따라간다
    // 범위 밖은 잘린다.
    h.value = '9999';
    h.dispatchEvent(new Event('input', { bubbles: true }));
    expect(ui.get().matPick.assignment.scale).toEqual([600, 2000]);
  });

  // I-1: 검색 중에는 목록이 전 카테고리라 "타일 카테고리"라는 상태가 더 이상 필터가 아니다.
  test('타일 카테고리에서 검색해 나온 비-타일에는 타일 크기가 실리지 않는다', () => {
    const { el, ui } = setup();
    click(el, '[data-cat="타일"]');
    const q = el.querySelector('input[name="q"]');
    q.value = '오크'; q.dispatchEvent(new Event('input', { bubbles: true }));
    click(el, '.tile[data-id="wood-oak"]');
    expect(ui.get().matPick).toEqual({ assignment: mat('wood-oak') });
    expect('scale' in ui.get().matPick.assignment).toBe(false);
    expect(ui.get().matPick.category).toBeUndefined();
  });

  // I-1: 벽 우클릭 "마감재 복사"는 category 없이 matPick만 넣는다 — 타일 칸을 건드려도 그 배정은 그대로다.
  test('타일 흐름이 아닌 matPick에는 타일 크기를 주입하지 않는다', () => {
    const { el, ui } = setup();
    click(el, '[data-cat="타일"]');
    const copied = { assignment: { id: 'wood-oak', offset: [0.5, 0.25], angle: 0 } };
    ui.set({ matPick: copied });
    const w = el.querySelector('[name="scaleW"]');
    w.value = '600';
    w.dispatchEvent(new Event('input', { bubbles: true }));
    expect(ui.get().matPick).toBe(copied);                            // 손대지 않았다
    expect('scale' in ui.get().matPick.assignment).toBe(false);
  });

  test('placeTile()이 타일 카테고리를 열고 첫 타일로 적용 모드를 켠다', () => {
    const { el, ui, panel } = setup();
    click(el, '[data-cat="벽돌"]');
    panel.placeTile();
    expect(panel.state.category).toBe('타일');
    expect(panel.state.mode).toBe('place');
    expect(el.querySelector('[name="scaleW"]').value).toBe('300');
    expect(ui.get().matPick).toEqual({ assignment: { id: 'tile-white-300', offset: [0, 0], angle: 0, scale: [300, 300] }, category: '타일' });
  });
});

// §14.10: "타일 배치"가 조용한 패널 전환이라 좌측 패널이 접혀 있으면 아무 변화도 보이지 않았다(감사 #17).
test('placeTile은 타일 크기 칸에 포커스를 준다', () => {
  const a = setup();
  const m = a.panel.placeTile();
  expect(m).toBeTruthy();
  expect(document.activeElement).toBe(a.el.querySelector('[name="scaleW"]'));
});

// §15.8: 마감재 패널도 같은 구조다(타일 배치로 들어오면 타일 칩이 켜진 채다).
test('처음 열면 전체 스와치 그리드가 보이고 타일 배치는 타일 칩을 켠다', () => {
  const { el, panel } = setup();
  expect(el.querySelectorAll('.chips button[data-cat]')).toHaveLength(11);
  expect(el.querySelectorAll('.tile').length).toBeGreaterThan(10);
  expect(el.querySelector('.cat-list')).toBeNull();
  panel.placeTile();
  expect(el.querySelector('[data-cat="타일"]').classList.contains('on')).toBe(true);
  expect(el.querySelector('[data-cat-all]').classList.contains('on')).toBe(false);
  expect(el.querySelector('[name="scaleW"]')).not.toBeNull();   // 타일 크기 칸도 함께 보인다
});
