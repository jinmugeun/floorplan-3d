// @vitest-environment jsdom
// §16.1의 불변식 한 줄을 여섯 칸에서 못 박는다: **필드 확정 1회 = undo 1단계**.
// 감사 §41이 잡은 회귀는 "값은 맞는데 Ctrl+Z 한 번이 헛돈다"였고, 그 원인은 히스토리에 쌓인
// 빈 단계였다 — 값만 보는 테스트(계획 7 §15.9의 브라우저 검증)로는 통과해 버린다.
//
// jsdom은 blur()에서 네이티브 change를 내지 않으므로(실제 브라우저의 동작이 이 결함의 절반이다)
// 그 change를 테스트가 직접 쏜다. commitField가 남긴 dataset.committed 표시와, 적용 함수의
// "같으면 dispatch 없음"이 둘 다 있어야 단계가 하나로 남는다.
import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { addDuct } from '../src/state/ductOps.js';
import { createDuct } from '../src/state/ductSchema.js';
import { rectWalls, wallLength } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { createPropsPanel } from '../src/ui/propsPanel.js';
import { commitField } from '../src/ui/fieldUtils.js';
import { applyOptionInput } from '../src/ui/optionBar.js';

// 되돌림 단계를 센다. 트랜잭션 밖의 기록 dispatch 하나가 한 단계이고, 상태를 바꾼 트랜잭션도
// 한 단계다(store.js의 지연 기록 규칙 그대로). { record: false } 단독 dispatch는 단계가 아니다.
function stepCounter(store) {
  let steps = 0, depth = 0, txDirty = false;
  const d = store.dispatch.bind(store), b = store.beginTransaction.bind(store), e = store.endTransaction.bind(store);
  store.dispatch = (fn, opts = {}) => {
    if (depth > 0) txDirty = true;                  // 트랜잭션 안에서는 record:false여도 상태가 바뀐다
    else if (opts.record !== false) steps += 1;
    return d(fn, opts);
  };
  store.beginTransaction = () => { depth += 1; return b(); };
  store.endTransaction = () => { depth = Math.max(0, depth - 1); if (!depth && txDirty) { steps += 1; txDirty = false; } return e(); };
  return { get: () => steps, reset() { steps = 0; } };
}

// 소수 좌표로 만든 도면: 벽 두께·길이 계산이 반올림 가정에 기대지 않는지 함께 본다.
function setup() {
  const store = createStore(createEmptyProject()), ui = createUiState();
  addWalls(store, rectWalls([120.5, 80.25], [4120.5, 3080.25], 200));
  const hood = addItem(store, createItem(productById('hood-box'), { pos: [2000.5, 1500.25] }));
  const duct = addDuct(store, createDuct({
    kind: 'exhaust', system: 'F-1',
    points: [[500.5, 500.25], [3500.5, 500.25]],
    segments: [{ w: 500, h: 300, z: 2900 }],
  }));
  const el = document.createElement('div'); document.body.appendChild(el);
  const panel = createPropsPanel(el, store, ui, {});
  const counter = stepCounter(store);
  return { store, ui, el, panel, hood, duct, counter };
}

// 사용자가 하는 일 한 번: 값을 고치고 [Enter]로 확정한다. keymap의 INPUT 가드가 하는 그대로
// commitField를 부르고, 이어서 실제 브라우저의 blur가 내는 네이티브 change를 한 번 더 쏜다.
function typeAndCommit(el, value) {
  el.value = String(value);
  commitField(el);
  el.dispatchEvent(new Event('change', { bubbles: true }));   // blur가 내는 네이티브 change
}
const q = (el, name) => el.querySelector(`[name="${name}"]`);

describe('필드 확정 1회 = undo 1단계 (§16.1)', () => {
  test('벽 두께: 확정 한 번이 한 단계이고 Ctrl+Z 한 번이 되돌린다', () => {
    const { store, ui, el, counter } = setup();
    const id = activeFloor(store.get()).walls[0].id;
    ui.set({ selection: { type: 'wall', id } });
    counter.reset();
    typeAndCommit(q(el, 'thickness'), 250);
    expect(activeFloor(store.get()).walls.find(w => w.id === id).thickness).toBe(250);
    expect(counter.get()).toBe(1);
    store.undo();
    expect(activeFloor(store.get()).walls.find(w => w.id === id).thickness).toBe(200);
  });

  test('벽 길이·벽 높이도 한 단계다', () => {
    const { store, ui, el, counter } = setup();
    const id = activeFloor(store.get()).walls[0].id;
    ui.set({ selection: { type: 'wall', id } });
    counter.reset();
    typeAndCommit(q(el, 'wallLength'), 3500);
    expect(Math.round(wallLength(activeFloor(store.get()).walls.find(w => w.id === id)))).toBe(3500);
    expect(counter.get()).toBe(1);
    counter.reset();
    typeAndCommit(q(el, 'height'), 2600);
    expect(activeFloor(store.get()).walls.find(w => w.id === id).height).toBe(2600);
    expect(counter.get()).toBe(1);
    store.undo();
    expect(activeFloor(store.get()).walls.find(w => w.id === id).height).toBe(2300);
  });

  test('후드 면풍속(설비 props)도 한 단계다', () => {
    const { store, ui, el, hood, counter } = setup();
    ui.set({ selection: { type: 'item', id: hood } });
    counter.reset();
    typeAndCommit(q(el, 'eqFaceVelocity'), 0.4);
    const it = activeFloor(store.get()).items.find(i => i.id === hood);
    expect(it.props.faceVelocity).toBe(0.4);
    expect(counter.get()).toBe(1);
    store.undo();
    expect(activeFloor(store.get()).items.find(i => i.id === hood).props.faceVelocity).toBe(0.5);
  });

  test('덕트 단면 W도 한 단계다', () => {
    const { store, ui, el, duct, counter } = setup();
    ui.set({ selection: { type: 'duct', id: duct, segment: 0, vertex: null } });
    counter.reset();
    typeAndCommit(q(el, 'segW'), 750);
    expect(activeFloor(store.get()).ducts[0].segments[0].w).toBe(750);
    expect(counter.get()).toBe(1);
    store.undo();
    expect(activeFloor(store.get()).ducts[0].segments[0].w).toBe(500);
  });

  test('옵션 바 W는 스토어를 건드리지 않고, 같은 값의 두 번째 change는 아무것도 하지 않는다', () => {
    const { counter } = setup();
    const tool = { name: 'wall', opts: { thickness: 200 } };
    const el = document.createElement('input');
    el.type = 'number'; el.name = 'thickness'; el.value = '250';
    expect(applyOptionInput(tool, el, 'mm')).toBe(true);
    expect(tool.opts.thickness).toBe(250);
    expect(applyOptionInput(tool, el, 'mm')).toBe(false);   // blur의 네이티브 change
    expect(tool.opts.thickness).toBe(250);
    expect(counter.get()).toBe(0);                          // 도구 옵션은 되돌릴 단계가 아니다
  });

  test('값을 고치지 않고 확정하면 단계가 생기지 않는다(빈 단계 금지)', () => {
    const { store, ui, el, counter } = setup();
    const id = activeFloor(store.get()).walls[0].id;
    ui.set({ selection: { type: 'wall', id } });
    counter.reset();
    typeAndCommit(q(el, 'thickness'), 200);                 // 지금 값과 같다
    expect(counter.get()).toBe(0);
    expect(store.canUndo()).toBe(true);                     // 도면을 만든 단계는 그대로 남아 있다
  });

  test('같은 칸을 두 번 고치면 두 단계다(삼키는 것은 중복 커밋뿐이다)', () => {
    const { store, ui, el, counter } = setup();
    const id = activeFloor(store.get()).walls[0].id;
    ui.set({ selection: { type: 'wall', id } });
    counter.reset();
    typeAndCommit(q(el, 'thickness'), 250);
    typeAndCommit(q(el, 'thickness'), 300);
    expect(counter.get()).toBe(2);
    store.undo();
    expect(activeFloor(store.get()).walls.find(w => w.id === id).thickness).toBe(250);
  });
});
