// @vitest-environment jsdom
// 리뷰 Minor 1·2: 대화상자를 "다시 열기"로 갈아 끼우는 경로(갤러리·렌더샷·템플릿)와 설정의
// "이미 열려 있음" 분기가 앞 인스턴스의 포커스 트랩을 해제하지 않고 지나갔다. 트랩 해제를
// 스파이로 직접 확인한다(리스너 누수 + 닫을 때 포커스가 body로 떨어지는 문제).
import { test, expect, beforeEach, vi } from 'vitest';

const { traps } = vi.hoisted(() => ({ traps: [] }));

vi.mock('../src/ui/dialogBase.js', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    focusTrap: (root, opts) => {
      const real = actual.focusTrap(root, opts);
      const handle = { root, destroy: vi.fn(() => real.destroy()) };
      traps.push(handle);
      return handle;
    },
  };
});

import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls, updateRoom } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { openGalleryDialog } from '../src/ui/galleryDialog.js';
import { openRenderDialog } from '../src/ui/renderDialog.js';
import { openRoomTemplateDialog } from '../src/ui/templateDialog.js';
import { openSettingsDialog } from '../src/ui/settingsDialog.js';
import { confirmDialog } from '../src/ui/confirmDialog.js';
import { CONFIRM_SHOT_DELETE } from '../src/ui/messages.js';

const opener = () => { const b = document.createElement('button'); document.body.appendChild(b); b.focus(); return b; };
const view3d = { renderImage: () => 'data:image/png;base64,ZZZ' };
const roomStore = () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [6000, 4000], 200));
  const roomId = activeFloor(store.get()).rooms[0].id;
  updateRoom(store, roomId, { type: 'cook' });
  return { store, roomId };
};

beforeEach(() => { document.body.innerHTML = ''; traps.length = 0; });

test('갤러리를 다시 열면 앞 트랩을 해제한다', () => {
  const button = opener();
  openGalleryDialog({});
  expect(traps).toHaveLength(1);
  button.focus();
  const dlg = openGalleryDialog({});
  expect(traps).toHaveLength(2);
  expect(traps[0].destroy).toHaveBeenCalledTimes(1);   // 앞 인스턴스의 트랩이 남지 않는다
  expect(document.querySelectorAll('.modal.gallery')).toHaveLength(1);
  dlg.close();
  expect(document.activeElement).toBe(button);
});

test('대화상자 안에서 다시 열어도 닫으면 처음 부른 버튼으로 돌아온다', () => {
  const button = opener();
  openGalleryDialog({});
  const inside = document.querySelector('.modal.gallery [name="close"]');
  inside.focus();                                      // 이 요소는 갈아 끼울 때 사라진다
  const dlg = openGalleryDialog({});
  dlg.close();
  expect(document.activeElement).toBe(button);         // body로 떨어지지 않는다
});

test('렌더샷을 다시 열면 앞 트랩을 해제한다', () => {
  const button = opener();
  const store = createStore(createEmptyProject());
  openRenderDialog({ store, view3d });
  button.focus();
  const dlg = openRenderDialog({ store, view3d });
  expect(traps[0].destroy).toHaveBeenCalledTimes(1);
  expect(document.querySelectorAll('.modal.render')).toHaveLength(1);
  dlg.close();
  expect(document.activeElement).toBe(button);
});

test('템플릿 대화상자를 다시 열면 앞 트랩을 해제한다', () => {
  const button = opener();
  const { store, roomId } = roomStore();
  openRoomTemplateDialog({ store, roomId });
  button.focus();
  const dlg = openRoomTemplateDialog({ store, roomId });
  expect(traps[0].destroy).toHaveBeenCalledTimes(1);
  expect(document.querySelectorAll('.modal.templates')).toHaveLength(1);
  dlg.close();
  expect(document.activeElement).toBe(button);
});

test('설정이 이미 열려 있으면 살아 있는 핸들을 돌려주고 그 핸들로 닫으면 트랩도 풀린다', () => {
  const button = opener();
  const store = createStore(createEmptyProject());
  const first = openSettingsDialog({ store });
  const again = openSettingsDialog({ store, tab: 'keys' });
  expect(traps).toHaveLength(1);                       // 두 번 열어도 트랩은 하나다
  expect(document.querySelectorAll('.modal.settings')).toHaveLength(1);
  expect(document.querySelector('#tabKeys').hidden).toBe(false);   // 탭만 바뀐다
  again.close();                                       // 예전에는 이 길이 trap.destroy()를 건너뛰었다
  expect(traps[0].destroy).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.modal.settings')).toBeNull();
  expect(document.activeElement).toBe(button);
  first.close();                                       // 같은 핸들이라 두 번 닫아도 조용하다
  expect(traps[0].destroy).toHaveBeenCalledTimes(1);
});

// §16.9: 갤러리의 [삭제]가 확인을 받게 되면서 "모달 위 모달"이 새로 생긴다. 중첩 트랩 규칙은
// [Esc]가 **안쪽만** 닫고 포커스가 갤러리로 돌아오는 것이다(갤러리는 열린 채 남는다).
test('갤러리 위에 겹친 확인 대화상자는 [Esc]로 안쪽만 닫힌다', async () => {
  const button = opener();
  const dlg = openGalleryDialog({});
  const gallery = document.querySelector('.modal.gallery');
  const answer = confirmDialog(CONFIRM_SHOT_DELETE);
  const confirm = document.querySelector('.modal.confirm');
  expect(confirm).not.toBeNull();
  expect(confirm.contains(document.activeElement)).toBe(true);   // 안쪽이 포커스를 갖는다
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  expect(await answer).toBe(false);                              // 취소로 닫힌다
  expect(document.querySelector('.modal.confirm')).toBeNull();
  expect(document.querySelector('.modal.gallery')).toBe(gallery);
  expect(gallery.contains(document.activeElement)).toBe(true);   // 포커스가 갤러리로 돌아온다
  dlg.close();
  expect(document.activeElement).toBe(button);
});
