// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject } from '../src/state/schema.js';
import { createShell } from '../src/ui/shell.js';
import { createContextMenu } from '../src/ui/contextMenu.js';
import { createTopbar } from '../src/app/topbar.js';

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
