// @vitest-environment jsdom
// §16.5(감사 §19): 덕트 메뉴의 비활성 항목도 사유를 말한다. 구간·꼭짓점을 고르지 않은
// 기본 선택에서는 네 항목(점 삽입·점 삭제·댐퍼 추가·설비 연결 해제)이 꺼진다.
import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject } from '../src/state/schema.js';
import { createDuct } from '../src/state/ductSchema.js';
import { addDuct, updateDuct } from '../src/state/ductOps.js';
import { ductMenuItems } from '../src/ui/ductMenu.js';
import { WHY_LOCKED_DUCT, WHY_NO_SEGMENT, WHY_NO_VERTEX, WHY_NO_CONNECTION } from '../src/ui/messages.js';

// 소수 좌표: 덕트 길이·투영이 반올림 가정에 기대지 않는다.
function setup() {
  const store = createStore(createEmptyProject()), ui = createUiState();
  const id = addDuct(store, createDuct({
    kind: 'exhaust', system: 'F-1',
    points: [[0.5, 0.25], [3000.5, 0.25]],
    segments: [{ w: 500, h: 300, z: 2900 }],
  }));
  return { store, ui, id };
}
const sel = (id, patch = {}) => ({ type: 'duct', id, segment: null, vertex: null, ...patch });
const pick = (items, label) => items.find(x => x !== 'sep' && x.label === label);

describe('덕트 컨텍스트 메뉴의 비활성 사유', () => {
  test('비활성 항목에는 모두 사유(title)가 있다', () => {
    const { store, ui, id } = setup();
    const items = ductMenuItems({ store, ui, sel: sel(id) });
    const missing = items.filter(it => it !== 'sep' && it.disabled && !String(it.title ?? '').trim()).map(it => it.label);
    expect(missing).toEqual([]);
  });

  test('사유는 무엇을 고르지 않았는지 말한다', () => {
    const { store, ui, id } = setup();
    const items = ductMenuItems({ store, ui, sel: sel(id) });
    expect(pick(items, '점 삽입').title).toBe(WHY_NO_SEGMENT);
    expect(pick(items, '점 삭제').title).toBe(WHY_NO_VERTEX);
    expect(pick(items, '댐퍼 추가').title).toBe(WHY_NO_SEGMENT);
    expect(pick(items, '설비 연결 해제').title).toBe(WHY_NO_CONNECTION);
    // 활성 항목에는 빈 title이 붙지 않는다.
    expect(pick(items, '급기로 전환').title).toBeUndefined();
  });

  // 리뷰 I-3: 같은 조건식을 disabled와 title에 두 번 적던 자리를 ui/menuReason.js의 why() 하나로
  // 모았다. 한쪽만 바뀌는 회귀("활성인데 사유가 붙는다"는 전수 테스트가 못 잡는다)를 여기서 막는다 —
  // 잠그면 둘이 함께 켜지고, 풀면 둘이 함께 꺼진다.
  test('비활성 사유와 disabled는 같은 조건에서 나온다', () => {
    const { store, ui, id } = setup();
    const on = pick(ductMenuItems({ store, ui, sel: sel(id) }), '급기로 전환');
    expect(on.disabled).toBe(false);
    expect(on.title).toBeUndefined();               // 활성이면 사유도 없다
    updateDuct(store, id, { locked: true });
    const locked = pick(ductMenuItems({ store, ui, sel: sel(id) }), '급기로 전환');
    expect(locked.disabled).toBe(true);
    expect(locked.title).toBe(WHY_LOCKED_DUCT);     // 비활성이면 사유가 있다
    updateDuct(store, id, { locked: false });
    const off = pick(ductMenuItems({ store, ui, sel: sel(id) }), '급기로 전환');
    expect(off.disabled).toBe(false);
    expect(off.title).toBeUndefined();              // 풀면 둘이 함께 꺼진다
  });

  test('잠긴 덕트는 잠금이 먼저 말해진다', () => {
    const { store, ui, id } = setup();
    store.dispatch(s => { s.floors[s.activeFloor].ducts[0].locked = true; });
    const items = ductMenuItems({ store, ui, sel: sel(id, { segment: 0, vertex: 0 }) });
    expect(pick(items, '점 삽입').title).toBe(WHY_LOCKED_DUCT);
    expect(pick(items, '댐퍼 추가').title).toBe(WHY_LOCKED_DUCT);
    expect(pick(items, '급기로 전환').title).toBe(WHY_LOCKED_DUCT);
  });
});
