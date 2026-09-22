// §16.4: 현재 층 select와 [층 추가]는 **선택과 무관하게** 늘 보이는 한 줄이다(#floorBar).
// 문자열 모듈이라 선택 상태를 만들지 않고 직접 단정한다.
import { describe, test, expect } from 'vitest';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';   // activeFloor의 정본은 schema.js다(floorOps.js는 다시 내보내지 않는다)
import { addFloor } from '../src/state/floorOps.js';
import { createStore } from '../src/state/store.js';
import { floorBarHtml, floorDetailsHtml, FLOOR_ADD } from '../src/ui/floorBar.js';

const twoFloors = () => {
  const store = createStore(createEmptyProject());
  addFloor(store, { name: 'Floor 2', copy: 'none' });
  return store;
};

describe('층 바', () => {
  test('#floorBar는 현재 층 select와 [층 추가]만 갖는다', () => {
    const p = twoFloors().get();
    const html = floorBarHtml(p);
    expect(html).toContain('id="floorBar"');
    expect(html).toContain('name="floorSelect"');
    expect(html).toContain(`name="floorAdd"`);
    expect(html).toContain(FLOOR_ADD);
    expect(FLOOR_ADD).toBe('층 추가');
    // 현재 층이 선택돼 있다(addFloor가 새 층을 활성으로 만든다).
    expect(html).toContain('<option value="1" selected>Floor 2</option>');
    // 상세(이름 변경·삭제·높이·투명도)는 여기 없다 — 선택이 없을 때만 나온다.
    expect(html).not.toContain('floorDelete');
    expect(html).not.toContain('wallOpacity');
  });

  test('상세는 층 높이·총면적·투명도를 담고 마지막 층은 삭제가 비활성이다', () => {
    const store = createStore(createEmptyProject());
    const p = store.get();
    const html = floorDetailsHtml(p, activeFloor(p), { units: 'mm', showUnit: false, pyeong: false, detailsOpen: true });
    expect(html).toContain('name="floorRename"');
    expect(html).toContain('name="floorHeight"');
    expect(html).toContain('name="totalArea"');
    expect(html).toContain('name="wallOpacity"');
    expect(html).toMatch(/name="floorDelete"[^>]*disabled/);
    expect(html).toContain('층이 하나뿐입니다');                 // LAST_FLOOR_TITLE
    // 층이 둘이면 삭제가 열린다.
    const two = twoFloors().get();
    expect(floorDetailsHtml(two, activeFloor(two), { detailsOpen: false })).not.toMatch(/name="floorDelete"[^>]*disabled/);
  });

  test('층 버튼에도 툴팁이 있다(§16.5)', () => {
    const p = twoFloors().get();
    expect(floorBarHtml(p)).toContain('title="층 추가하기"');
    const d = floorDetailsHtml(p, activeFloor(p), {});
    expect(d).toContain('title="이 층의 이름을 바꿉니다"');
    expect(d).toContain('title="이 층과 그 안의 모든 것을 삭제합니다"');
  });
});
