import { describe, test, expect, beforeEach } from 'vitest';
import { addShot, listShots, deleteShot, clearShots, GALLERY_DB } from '../src/io/gallery.js';

beforeEach(async () => { await clearShots(); });

describe('갤러리 저장소(메모리 대체)', () => {
  test('IndexedDB가 없으면 메모리에 쌓고 최신 순으로 돌려준다', async () => {
    expect(GALLERY_DB).toBe('kvp-gallery');
    expect(await listShots()).toEqual([]);
    const a = await addShot({ name: '첫 컷', dataUrl: 'data:image/png;base64,AAA', width: 1280, height: 720 });
    const b = await addShot({ name: '둘째 컷', dataUrl: 'data:image/png;base64,BBB', width: 1920, height: 1080 });
    expect(typeof a.id).toBe('string');
    expect(a.id).not.toBe(b.id);
    expect(typeof a.savedAt).toBe('string');
    const list = await listShots();
    expect(list.map(s => s.name)).toEqual(['둘째 컷', '첫 컷']);
    expect(list[0]).toMatchObject({ width: 1920, height: 1080, dataUrl: 'data:image/png;base64,BBB' });
  });

  test('이름이 없으면 시각으로 만들고 지우기가 하나만 지운다', async () => {
    const a = await addShot({ dataUrl: 'data:image/png;base64,AAA', width: 1, height: 1 });
    expect(a.name.length).toBeGreaterThan(0);
    const b = await addShot({ name: 'b', dataUrl: 'data:image/png;base64,BBB', width: 1, height: 1 });
    await deleteShot(a.id);
    expect((await listShots()).map(s => s.id)).toEqual([b.id]);
    await deleteShot('없음');                    // 없는 id는 조용히 지나간다
    expect(await listShots()).toHaveLength(1);
  });

  test('dataUrl이 없으면 저장하지 않는다', async () => {
    await expect(addShot({ name: 'x' })).rejects.toThrow('이미지가 없습니다');
    expect(await listShots()).toEqual([]);
  });
});
