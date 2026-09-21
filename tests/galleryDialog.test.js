// @vitest-environment jsdom
// 갤러리 대화상자: Esc로 즉시 닫히는지, 목록/삭제 실패를 안내하는지 확인한다(리뷰 Important 1·2).
import { describe, test, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/io/gallery.js', () => ({
  listShots: vi.fn(),
  deleteShot: vi.fn(),
}));

import { listShots, deleteShot } from '../src/io/gallery.js';
import { openGalleryDialog } from '../src/ui/galleryDialog.js';

beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

describe('갤러리 대화상자 Esc', () => {
  test('열면 닫기 버튼에 포커스가 가서 Esc가 바로 대화상자를 지운다', () => {
    listShots.mockResolvedValue([]);
    openGalleryDialog({});
    const root = document.querySelector('.modal.gallery');
    expect(document.activeElement).toBe(root.querySelector('[name="close"]'));
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.modal.gallery')).toBeNull();
  });
});

describe('갤러리 대화상자 오류 처리', () => {
  test('목록을 불러오지 못하면 안내 문구와 토스트를 보여준다', async () => {
    listShots.mockRejectedValue(new Error('열기 실패'));
    openGalleryDialog({});
    const root = document.querySelector('.modal.gallery');
    await vi.waitFor(() => expect(root.querySelector('[data-part="grid"]').textContent).toContain('갤러리를 불러오지 못했습니다'));
    expect(root.querySelector('[data-part="grid"]').textContent).not.toContain('불러오는 중');
    await vi.waitFor(() => expect(document.querySelector('.toast')?.textContent).toBe('갤러리를 불러오지 못했습니다'));
  });

  test('삭제에 실패하면 토스트로 알리고 목록은 그대로 둔다', async () => {
    listShots.mockResolvedValue([{ id: 's1', name: '컷 1', dataUrl: 'data:image/png;base64,AAA', width: 100, height: 100 }]);
    deleteShot.mockRejectedValue(new Error('삭제 실패'));
    openGalleryDialog({});
    const root = document.querySelector('.modal.gallery');
    await vi.waitFor(() => expect(root.querySelectorAll('[data-shot]')).toHaveLength(1));
    root.querySelector('[data-shot] [name="del"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('.toast')?.textContent).toBe('삭제하지 못했습니다'));
    expect(root.querySelectorAll('[data-shot]')).toHaveLength(1);
  });
});

// §15.10(리뷰 Important 1): [삭제] → 목록 재렌더가 방금 누른 버튼을 지워 포커스가 body로 떨어진다.
// 그래도 트랩은 살아 있어야 한다 — 예전에는 여기서 Tab이 모달 뒤 앱으로 새고 Esc도 먹지 않았다.
describe('갤러리 삭제 뒤 재렌더', () => {
  const oneShot = () => [{ id: 's1', name: '컷 1', dataUrl: 'data:image/png;base64,AAA', width: 100, height: 100 }];
  const del = async () => {
    const root = document.querySelector('.modal.gallery');
    await vi.waitFor(() => expect(root.querySelectorAll('[data-shot]')).toHaveLength(1));
    const button = root.querySelector('[data-shot] [name="del"]');
    button.focus();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(root.querySelectorAll('[data-shot]')).toHaveLength(0));
    expect(document.activeElement).toBe(document.body);   // 누른 버튼이 사라졌다
    return root;
  };

  test('삭제한 뒤에도 [Tab]이 대화상자 안에 머문다', async () => {
    listShots.mockResolvedValueOnce(oneShot()).mockResolvedValue([]);
    deleteShot.mockResolvedValue();
    openGalleryDialog({});
    const root = await del();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(root.querySelector('[name="close"]'));
  });

  test('삭제한 뒤에도 Esc가 대화상자를 닫는다', async () => {
    listShots.mockResolvedValueOnce(oneShot()).mockResolvedValue([]);
    deleteShot.mockResolvedValue();
    openGalleryDialog({});
    await del();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.querySelector('.modal.gallery')).toBeNull();
  });
});

// §15.10: 갤러리도 같은 규칙이다(닫으면 [갤러리] 버튼으로 돌아온다).
test('갤러리를 닫으면 열기 전 포커스로 돌아온다', () => {
  listShots.mockResolvedValue([]);
  const opener = document.createElement('button'); document.body.appendChild(opener);
  opener.focus();
  const dlg = openGalleryDialog({});
  const root = document.querySelector('.modal.gallery');
  expect(root.contains(document.activeElement)).toBe(true);
  dlg.close();
  expect(document.activeElement).toBe(opener);
});
