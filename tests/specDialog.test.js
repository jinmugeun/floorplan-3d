// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { openSpecDialog } from '../src/ui/specDialog.js';

// I-2: 모의를 vi.fn으로 둔다 — 인자를 보지 않으면 capture2D(store, ui)로 되돌려도 전부 초록이었다.
const { cap } = vi.hoisted(() => ({ cap: vi.fn(async () => 'data:image/png;base64,PLAN') }));
vi.mock('../src/io/file.js', async orig => {
  const real = await orig();
  return { ...real, capture2D: cap, downloadText: (name, text) => { globalThis.__down = [name, text]; } };
});

function setup() {
  const store = createStore(createEmptyProject('내 도면'));
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const calls = [], shots = [];
  const view3d = { renderImage: opts => { calls.push(opts.preset); shots.push(opts); return `data:image/png;base64,${opts.preset}`; } };
  const dlg = openSpecDialog({ store, ui: createUiState(), view3d });
  return { store, view3d, calls, shots, dlg, root: document.querySelector('.modal.spec') };
}
const click = (root, sel) => root.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));

beforeEach(() => { document.body.innerHTML = ''; globalThis.__down = null; cap.mockClear(); });

describe('시방서 대화상자', () => {
  test('용지·방향·구역 옵션을 보여준다', () => {
    const a = setup();
    expect(a.root.querySelector('h2').textContent).toBe('시방서');
    expect(a.root.querySelectorAll('[name="paper"] option')).toHaveLength(2);
    expect(a.root.querySelector('[name="landscape"]').type).toBe('checkbox');
    expect(a.root.querySelectorAll('[data-section]')).toHaveLength(7);
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
    // §16.11(I-2): 선택한 용지 → printBodyPx → capture2D 배선. 세 번째 인자가 빠지면(capture2D(store, ui))
    // 여기서 깨진다 — 그때는 논리 폭이 2000 px로 돌아가 인쇄물 글자가 다시 4~5 px이 된다.
    expect(cap).toHaveBeenCalledTimes(1);
    expect(cap.mock.calls[0][0]).toBe(a.store);
    expect(cap.mock.calls[0][2]).toEqual({ cssWidth: 765, ratio: 2 });    // A4 세로 본문 폭
  });

  test('가로를 켜면 캡처 폭도 가로 본문 폭이 된다', async () => {
    const a = setup();
    a.root.querySelector('[name="landscape"]').checked = true;
    click(a.root, '[name="download"]');
    await vi.waitFor(() => expect(globalThis.__down).not.toBeNull());
    expect(cap.mock.calls[0][2]).toEqual({ cssWidth: 1123, ratio: 2 });   // A4 가로 = A3 세로
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

  // §16.11: 세 칸이 시방서 머리글로 들어가고, 평면도는 인쇄 배율로 캡처한다.
  test('도면번호·작성자·현장 칸이 시방서에 실린다', async () => {
    const a = setup();                                   // 이 파일의 setup()(15행) — { store, view3d, calls, dlg, root }
    a.root.querySelector('[name="sheetNumber"]').value = 'M-106';
    a.root.querySelector('[name="sheetAuthor"]').value = '홍길동';
    a.root.querySelector('[name="sheetSite"]').value = '강당중학교';
    a.root.querySelector('[name="download"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(globalThis.__down?.[1]).toContain('M-106'));
    expect(globalThis.__down[1]).toContain('홍길동');
    expect(globalThis.__down[1]).toContain('강당중학교');
  });

  // §17.4(2) · 감사 §37: 입면도가 자연 크기 1600×900으로 나와 본문 393 px에 눌려 배율 0.245였다
  // (평면도는 0.5). 논리 폭을 본문 폭으로 두고 비트맵만 2배로 키운다 — 평면도와 같은 규칙이다.
  test('입면도 렌더 크기는 본문 폭 × 2이고 16:9다', async () => {
    const { printBodyPx } = await import('../src/io/file.js');
    const a = setup();
    click(a.root, '[name="download"]');
    await vi.waitFor(() => expect(globalThis.__down).not.toBeNull());
    const w = printBodyPx('A4', false) * 2;                 // A4 세로: 765 × 2 = 1530
    expect(a.shots).toHaveLength(5);
    for (const s of a.shots) {
      expect(s.width).toBe(w);
      expect(s.height).toBe(Math.round((w * 9) / 16));
    }
  });
});

// §17.11(1) · 감사 §44: 빈 도면에서도 [HTML 내려받기]·[미리보기/인쇄]가 활성이었다.
// 이 파일의 setup()은 벽을 채워 열므로(비어 있지 않다) 빈 프로젝트로 직접 연다.
test('빈 도면에서는 실행 버튼이 비활성이고 사유가 붙는다([닫기]는 살아 있다)', async () => {
  const { OUTPUT_EMPTY_TITLE } = await import('../src/ui/messages.js');
  openSpecDialog({ store: createStore(createEmptyProject('빈 도면')), ui: createUiState(), view3d: { renderImage: () => 'data:,' } });
  const root = document.querySelector('.modal.spec');
  for (const n of ['download', 'print']) {
    const b = root.querySelector(`[name="${n}"]`);
    expect(b.disabled, n).toBe(true);
    expect(b.title, n).toBe(OUTPUT_EMPTY_TITLE);
  }
  expect(root.querySelector('[name="close"]').disabled).toBe(false);
  // 도면이 있으면 그대로 활성이다(기존 경로 회귀 방어).
  document.body.innerHTML = '';
  const a = setup();
  expect(a.root.querySelector('[name="print"]').disabled).toBe(false);
});
