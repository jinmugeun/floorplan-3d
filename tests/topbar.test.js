// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject } from '../src/state/schema.js';
import { createShell } from '../src/ui/shell.js';
import { createContextMenu } from '../src/ui/contextMenu.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { createTopbar, projectIsEmpty, confirmLeave } from '../src/app/topbar.js';

function setup(actions = {}) {
  const root = document.createElement('div'); root.id = 'app'; document.body.appendChild(root);
  const store = createStore(createEmptyProject()), ui = createUiState();
  const shell = createShell(root, { store, ui });
  const menu = createContextMenu(document.body);
  const view3d = { renderImage: () => 'data:image/png;base64,Z' };
  const bar = createTopbar({ store, ui, shell, menu, view3d, actions });
  return { root, store, ui, shell, menu, bar, click: id => document.getElementById(id).dispatchEvent(new MouseEvent('click', { bubbles: true })) };
}
const menuLabels = () => [...document.querySelectorAll('.ctx-item')].map(b => b.textContent.replace(/\s+/g, ' ').trim());

beforeEach(() => { document.body.innerHTML = ''; });

describe('상단 바', () => {
  test('버튼 6개가 정확한 문구로 있다', () => {
    setup();
    expect(document.getElementById('btnRender').textContent).toBe('렌더샷');
    expect(document.getElementById('btnGallery').textContent).toBe('갤러리');
    expect(document.getElementById('btnEstimate').textContent).toBe('실시간 견적서');
    expect(document.getElementById('btnSpec').textContent).toBe('시방서');
    expect(document.getElementById('btnNew').textContent).toBe('새로만들기');
    expect(document.getElementById('btnMore').textContent).toContain('더보기');
  });

  test('렌더샷·갤러리·견적서·시방서 버튼이 각 대화상자를 연다', () => {
    const a = setup();
    a.click('btnEstimate');
    expect(document.querySelector('.modal.estimate')).not.toBeNull();
    a.click('btnRender');
    expect(document.querySelector('.modal.render')).not.toBeNull();
    a.click('btnGallery');
    expect(document.querySelector('.modal.gallery')).not.toBeNull();
    a.click('btnSpec');
    expect(document.querySelector('.modal.spec')).not.toBeNull();
  });

  test('더보기 메뉴 3항목이 actions를 부른다', () => {
    const calls = [];
    const a = setup({ saveAsTemplate: () => calls.push('tpl'), exportJson: () => calls.push('json'), exit: () => calls.push('exit') });
    a.click('btnMore');
    expect(menuLabels()).toEqual(['템플릿으로 저장', 'JSON 내보내기', '나가기']);
    document.querySelectorAll('.ctx-item')[0].click();
    a.click('btnMore');
    document.querySelectorAll('.ctx-item')[1].click();
    a.click('btnMore');
    document.querySelectorAll('.ctx-item')[2].click();
    expect(calls).toEqual(['tpl', 'json', 'exit']);
  });

  test('새로만들기는 actions.newProject를 부른다', () => {
    const calls = [];
    const a = setup({ newProject: () => calls.push('new') });
    a.click('btnNew');
    expect(calls).toEqual(['new']);
  });

  test('destroy 후에는 버튼이 아무 일도 하지 않는다', () => {
    const calls = [];
    const a = setup({ newProject: () => calls.push('new') });
    a.bar.destroy();
    a.click('btnNew');
    expect(calls).toEqual([]);
  });
});

describe('나가기 가드', () => {
  test('빈 프로젝트는 묻지 않고, 작업한 도면은 확인을 받고 자동 저장본을 먼저 남긴다', () => {
    const empty = createEmptyProject();
    expect(projectIsEmpty(empty)).toBe(true);
    let asked = 0, saved = 0;
    expect(confirmLeave(empty, { saveNow: () => { saved += 1; }, confirm: () => { asked += 1; return true; } })).toBe(true);
    expect([asked, saved]).toEqual([0, 0]);

    const store = createStore(createEmptyProject());
    addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
    const drawn = store.get();
    expect(projectIsEmpty(drawn)).toBe(false);
    let msg = null;
    expect(confirmLeave(drawn, { saveNow: () => { saved += 1; }, confirm: m => { msg = m; return false; } })).toBe(false);
    expect(saved).toBe(1);                                   // 묻기 전에 자동 저장본을 최신으로 만든다
    expect(msg).toContain('저장하지 않고 나갈까요');
    expect(msg).toContain('자동 저장본은 남습니다');
    expect(confirmLeave(drawn, { saveNow: () => { saved += 1; }, confirm: () => true })).toBe(true);
    expect(saved).toBe(2);
  });

  test('배경 도면만 올린 프로젝트도 비어 있지 않다', () => {
    const p = createEmptyProject();
    p.background = { url: 'x', opacity: 1, visible: true };
    expect(projectIsEmpty(p)).toBe(false);
  });
});
