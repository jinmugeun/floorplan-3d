// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { openSpecDialog } from '../src/ui/specDialog.js';

vi.mock('../src/io/file.js', async orig => {
  const real = await orig();
  return { ...real, capture2D: async () => 'data:image/png;base64,PLAN', downloadText: (name, text) => { globalThis.__down = [name, text]; } };
});

function setup() {
  const store = createStore(createEmptyProject('내 도면'));
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const calls = [];
  const view3d = { renderImage: opts => { calls.push(opts.preset); return `data:image/png;base64,${opts.preset}`; } };
  const dlg = openSpecDialog({ store, ui: createUiState(), view3d });
  return { store, view3d, calls, dlg, root: document.querySelector('.modal.spec') };
}
const click = (root, sel) => root.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));

beforeEach(() => { document.body.innerHTML = ''; globalThis.__down = null; });

describe('시방서 대화상자', () => {
  test('용지·방향·구역 옵션을 보여준다', () => {
    const a = setup();
    expect(a.root.querySelector('h2').textContent).toBe('시방서');
    expect(a.root.querySelectorAll('[name="paper"] option')).toHaveLength(2);
    expect(a.root.querySelector('[name="landscape"]').type).toBe('checkbox');
    expect(a.root.querySelectorAll('[data-section]')).toHaveLength(6);
    expect(a.root.querySelector('[name="notes"]').tagName).toBe('TEXTAREA');
  });

  test('[HTML 내려받기]가 도면 이미지를 만들고 파일을 저장한다', async () => {
    const a = setup();
    click(a.root, '[name="download"]');
    await vi.waitFor(() => expect(globalThis.__down).not.toBeNull());
    const [name, text] = globalThis.__down;
    expect(name).toMatch(/시방서\.html$/);
    expect(text).toContain('data:image/png;base64,PLAN');
    expect(a.calls).toEqual(['front', 'back', 'left', 'right', 'top']);
  });

  test('입면도를 끄면 3D 렌더를 부르지 않는다', async () => {
    const a = setup();
    a.root.querySelector('[data-section="elevations"]').click();
    click(a.root, '[name="download"]');
    await vi.waitFor(() => expect(globalThis.__down).not.toBeNull());
    expect(a.calls).toEqual([]);
  });

  test('[미리보기/인쇄]는 새 창에 HTML을 쓴다', async () => {
    const a = setup();
    const writes = [];
    const win = { document: { open() {}, write: h => writes.push(h), close() {} }, focus() {}, print() {} };
    vi.spyOn(window, 'open').mockReturnValue(win);
    click(a.root, '[name="print"]');
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toContain('시방서');
    window.open.mockRestore();
  });

  test('Esc로 닫는다', () => {
    const a = setup();
    a.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.modal.spec')).toBeNull();
  });
});
