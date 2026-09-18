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
