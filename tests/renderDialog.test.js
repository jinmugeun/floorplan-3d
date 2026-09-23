// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { openRenderDialog, RENDER_SIZES, RENDER_VIEWS } from '../src/ui/renderDialog.js';
import { openGalleryDialog } from '../src/ui/galleryDialog.js';
import { listShots, clearShots, addShot } from '../src/io/gallery.js';

const fakeView3d = () => { const calls = []; return { calls, renderImage: opts => { calls.push(opts); return 'data:image/png;base64,ZZZ'; } }; };
beforeEach(async () => { document.body.innerHTML = ''; await clearShots(); });

describe('렌더샷 대화상자', () => {
  test('해상도 3종과 뷰 6종을 고를 수 있다', () => {
    expect(RENDER_SIZES.map(s => `${s[0]}×${s[1]}`)).toEqual(['1280×720', '1920×1080', '3840×2160']);
    expect(RENDER_VIEWS.map(v => v[1])).toEqual(['현재 카메라', '정면', '배면', '좌측', '우측', '평면']);
    openRenderDialog({ store: createStore(createEmptyProject()), view3d: fakeView3d() });
    const root = document.querySelector('.modal.render');
    expect(root.querySelector('h2').textContent).toBe('렌더샷');
    expect(root.querySelectorAll('[name="size"] option')).toHaveLength(3);
    expect(root.querySelectorAll('[name="view"] option')).toHaveLength(6);
  });

  test('[렌더]가 고른 해상도·뷰로 렌더하고 갤러리에 저장한다', async () => {
    const v = fakeView3d();
    const saved = [];
    openRenderDialog({ store: createStore(createEmptyProject('내 도면')), view3d: v, onSaved: s => saved.push(s) });
    const root = document.querySelector('.modal.render');
    const size = root.querySelector('[name="size"]'); size.value = '3840×2160'; size.dispatchEvent(new Event('change', { bubbles: true }));
    const view = root.querySelector('[name="view"]'); view.value = 'top'; view.dispatchEvent(new Event('change', { bubbles: true }));
    root.querySelector('[name="render"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(async () => expect(await listShots()).toHaveLength(1));
    expect(v.calls).toEqual([{ width: 3840, height: 2160, preset: 'top' }]);
    const shots = await listShots();
    expect(shots[0].dataUrl).toBe('data:image/png;base64,ZZZ');
    expect(shots[0].name).toContain('내 도면');
    expect(saved).toHaveLength(1);
    expect(root.querySelector('[data-part="preview"]').getAttribute('src')).toBe('data:image/png;base64,ZZZ');
  });

  test('현재 카메라는 preset 없이 렌더한다', () => {
    const v = fakeView3d();
    openRenderDialog({ store: createStore(createEmptyProject()), view3d: v });
    document.querySelector('.modal.render [name="render"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(v.calls[0]).toEqual({ width: 1920, height: 1080, preset: null });
  });

  test('[렌더]를 두 번 눌러도 한 장만 만든다(§16.9 · 감사 §9)', async () => {
    const v = fakeView3d();
    openRenderDialog({ store: createStore(createEmptyProject()), view3d: v });
    const btn = document.querySelector('.modal.render [name="render"]');
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));   // 잠긴 동안의 두 번째 클릭
    await vi.waitFor(async () => expect(await listShots()).toHaveLength(1));
    expect(v.calls).toHaveLength(1);
  });

  test('렌더가 파일을 자동으로 내려받지 않는다(§16.9)', async () => {
    const names = [];
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { names.push(this.download); };
    try {
      openRenderDialog({ store: createStore(createEmptyProject()), view3d: fakeView3d() });
      document.querySelector('.modal.render [name="render"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.waitFor(async () => expect(await listShots()).toHaveLength(1));
    } finally { HTMLAnchorElement.prototype.click = realClick; }
    expect(names).toEqual([]);                                       // 버튼을 눌러야만 내려받는다
  });
});

describe('갤러리 대화상자', () => {
  test('썸네일과 버튼을 보여주고 삭제가 목록에서 없앤다', async () => {
    await addShot({ name: '컷 1', dataUrl: 'data:image/png;base64,AAA', width: 1280, height: 720 });
    openGalleryDialog({});
    const root = document.querySelector('.modal.gallery');
    await vi.waitFor(() => expect(root.querySelectorAll('[data-shot]')).toHaveLength(1));
    expect(root.querySelector('h2').textContent).toBe('갤러리');
    expect(root.querySelector('[data-shot] img').getAttribute('src')).toBe('data:image/png;base64,AAA');
    expect(root.textContent).toContain('HD ·');                      // §16.9: "HD · HH:MM" 캡션
    root.querySelector('[data-shot] [name="del"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // §16.9: 삭제는 확인을 받는다.
    await vi.waitFor(() => expect(document.querySelector('.modal.confirm')).not.toBeNull());
    document.querySelector('.modal.confirm [name="ok"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(async () => expect(await listShots()).toHaveLength(0));
    await vi.waitFor(() => expect(root.textContent).toContain('저장된 렌더샷이 없습니다'));
  });

  test('비어 있으면 안내만 보여준다', async () => {
    openGalleryDialog({});
    const root = document.querySelector('.modal.gallery');
    await vi.waitFor(() => expect(root.textContent).toContain('저장된 렌더샷이 없습니다'));
  });
});

// §14.10: 렌더 뒤 "갤러리에 저장했습니다."만 남고 내려받기·갤러리로 가는 길이 없었다(감사 #19).
test('렌더 전에는 내려받기가 숨어 있고 렌더 뒤에 내려받기·갤러리 열기가 동작한다', async () => {
  const store = createStore(createEmptyProject());
  const dlg = openRenderDialog({ store, view3d: { renderImage: () => 'data:image/png;base64,AAA' } });
  const modal = document.querySelector('.modal.render');
  expect(modal.querySelector('[name="download"]').hidden).toBe(true);
  expect(modal.querySelector('[name="gallery"]')).toBeTruthy();
  modal.querySelector('[name="render"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  expect(modal.querySelector('[name="download"]').hidden).toBe(false);
  // m-10: 파일명은 `-WxH`를 갖는다(§16.9로 자동 다운로드가 사라졌으므로 이 이름을 쓰는 곳은
  // [내려받기] 버튼 하나다).
  const names = [];
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { names.push(this.download); };
  try { modal.querySelector('[name="download"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  finally { HTMLAnchorElement.prototype.click = realClick; }
  expect(names).toEqual([expect.stringMatching(/-1920x1080\.png$/)]);
  modal.querySelector('[name="gallery"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(document.querySelector('.modal.gallery')).toBeTruthy();
  document.querySelector('.modal.gallery')?.remove();
  dlg.close();
});

// §17.11(1): 시방서와 같은 규칙이다. 이 파일의 기존 테스트는 빈 프로젝트로 여는데 버튼을
// dispatchEvent로 눌러(사용자 클릭이 아니라) 렌더가 계속 돈다 — 그 테스트들은 그대로 통과한다.
test('빈 도면에서는 [렌더]·[갤러리 열기]가 비활성이고 사유가 붙는다', async () => {
  const { OUTPUT_EMPTY_TITLE } = await import('../src/ui/messages.js');
  openRenderDialog({ store: createStore(createEmptyProject()), view3d: fakeView3d() });
  const root = document.querySelector('.modal.render');
  for (const n of ['render', 'gallery']) {
    const b = root.querySelector(`[name="${n}"]`);
    expect(b.disabled, n).toBe(true);
    expect(b.title, n).toBe(OUTPUT_EMPTY_TITLE);
  }
  expect(root.querySelector('[name="close"]').disabled).toBe(false);
  // 렌더가 한 번 돌아도 잠금과 사유가 남는다(finally가 같은 판정을 다시 쓴다 — 사전 검토 I-3).
  // 비활성 버튼에도 dispatchEvent는 그대로 도달하므로 이 경로를 실제로 지날 수 있다.
  root.querySelector('[name="render"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));          // render()의 async finally까지 흘려 보낸다
  expect(root.querySelector('[name="render"]').disabled).toBe(true);
  expect(root.querySelector('[name="render"]').title).toBe(OUTPUT_EMPTY_TITLE);
  // 도면이 있으면 활성이고 사유 title도 없다.
  document.body.innerHTML = '';
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200));
  openRenderDialog({ store, view3d: fakeView3d() });
  expect(document.querySelector('.modal.render [name="render"]').disabled).toBe(false);
  expect(document.querySelector('.modal.render [name="render"]').hasAttribute('title')).toBe(false);
});

// §17.11(2) · 감사 §29: 렌더샷만 첫 포커스가 [렌더]라 습관적인 [Enter]가 곧바로 렌더를 돌렸다.
test('첫 포커스는 다른 모달 넷과 같은 [name="close"]다', () => {
  openRenderDialog({ store: createStore(createEmptyProject()), view3d: fakeView3d() });
  expect(document.activeElement.name).toBe('close');
});
