import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, migrate, activeFloor, SCHEMA_VERSION } from '../src/state/schema.js';
import { createUiState } from '../src/state/uistate.js';

describe('schema', () => {
  test('empty project has one floor and defaults', () => {
    const p = createEmptyProject();
    expect(p.version).toBe(SCHEMA_VERSION);
    expect(p.units).toBe('mm');
    expect(p.floors).toHaveLength(1);
    expect(activeFloor(p).height).toBe(2300);
    expect(activeFloor(p).walls).toEqual([]);
    expect(p.view.cutaway).toBe(true);
  });
  test('migrate rejects non-objects and unknown versions', () => {
    expect(() => migrate(null)).toThrow();
    expect(() => migrate({ version: 99 })).toThrow('99');
    expect(migrate({ name: 'x' }).version).toBe(SCHEMA_VERSION);
  });
});

describe('store', () => {
  test('dispatch records history and undo/redo restore snapshots', () => {
    const s = createStore({ n: 0 });
    s.dispatch(d => { d.n = 1; });
    s.dispatch(d => { d.n = 2; });
    expect(s.get().n).toBe(2);
    expect(s.undo()).toBe(true);
    expect(s.get().n).toBe(1);
    expect(s.redo()).toBe(true);
    expect(s.get().n).toBe(2);
    expect(s.redo()).toBe(false);
  });
  test('dispatch does not mutate previous snapshot', () => {
    const s = createStore({ list: [] });
    const before = s.get();
    s.dispatch(d => { d.list.push(1); });
    expect(before.list).toEqual([]);
  });
  // ui/propsPanel.js는 "상태 객체가 그대로면 dispatch가 없었다"로 무동작 확정을 판정하고(리뷰 I-2b·N-6)
  // 그때만 칸을 다시 그린다. 그 규칙은 dispatch가 **언제나** 새 객체를 앉힌다는 이 성질에 기댄다 —
  // store를 "바뀐 게 없으면 상태를 그대로 둔다"로 최적화하면 그 패널 규칙이 조용히 죽는다(리뷰 N-8).
  test('dispatch always installs a new state object', () => {
    const s = createStore({ n: 0 });
    const a = s.get();
    s.dispatch(d => { d.n = 1; });
    expect(s.get()).not.toBe(a);
    const b = s.get();
    s.dispatch(() => {});                       // 아무것도 바꾸지 않는 mutate도 새 객체를 앉힌다
    expect(s.get()).not.toBe(b);
    expect(s.get()).toEqual({ n: 1 });
  });
  test('history is capped', () => {
    const s = createStore({ n: 0 }, { limit: 3 });
    for (let i = 1; i <= 5; i++) s.dispatch(d => { d.n = i; });
    let undos = 0; while (s.undo()) undos++;
    expect(undos).toBe(3);
  });
  // §17.7 리뷰 I-2: 층을 가로지르는 되돌리기·다시 실행은 "스냅숏 설치 + 활성 층 이동"이 한 동작이다.
  // 층을 따로 dispatch로 옮기면 알림이 두 번 나가고, 3D는 씬 서명에 activeFloor가 들어 있어 씬을 두 번
  // 짓는다(첫 번째는 곧 떠날 층). 덧쓰기는 기록이 아니므로 past·future는 그대로여야 한다.
  test('undo/redo의 activeFloor 옵션: 알림 한 번 · past·future 불변', () => {
    const s = createStore({ floors: [{ name: 'A' }, { name: 'B' }], activeFloor: 0, n: 0 });
    s.dispatch(d => { d.n = 1; });
    let calls = 0; s.subscribe(() => calls++);
    expect(s.undo({ activeFloor: 1 })).toBe(true);
    expect(s.get()).toEqual({ floors: [{ name: 'A' }, { name: 'B' }], activeFloor: 1, n: 0 });
    expect(calls).toBe(1);                       // 알림은 정확히 한 번
    expect(s.canUndo()).toBe(false);             // 덧쓰기는 되돌리기 단계를 더하지 않는다
    expect(s.canRedo()).toBe(true);              // 다시 실행 스택도 살아 있다
    // 다시 실행이 데려갈 층은 스냅숏을 봐야 안다: 함수 형태는 설치 직전의 스냅숏을 받는다.
    expect(s.redo({ activeFloor: next => (next.n === 1 ? 1 : null) })).toBe(true);
    expect(calls).toBe(2);
    expect(s.get()).toEqual({ floors: [{ name: 'A' }, { name: 'B' }], activeFloor: 1, n: 1 });
    expect(s.canUndo()).toBe(true);
    expect(s.canRedo()).toBe(false);
  });
  test('activeFloor 옵션이 없거나 범위 밖이면 스냅숏을 그대로 앉힌다', () => {
    const s = createStore({ floors: [{ name: 'A' }], activeFloor: 0, n: 0 });
    s.dispatch(d => { d.n = 1; });
    expect(s.undo({ activeFloor: 5 })).toBe(true);              // 층이 하나뿐이다
    expect(s.get().activeFloor).toBe(0);
    expect(s.redo({ activeFloor: () => null })).toBe(true);     // 데려갈 층이 없다
    expect(s.get()).toEqual({ floors: [{ name: 'A' }], activeFloor: 0, n: 1 });
    expect(s.undo()).toBe(true);                                // 옵션 없는 옛 호출도 그대로다
    expect(s.get().n).toBe(0);
  });
  test('transaction: beginTransaction records once, unrecorded dispatches collapse', () => {
    const s = createStore({ n: 0 });
    s.beginTransaction();
    s.dispatch(d => { d.n = 5; }, { record: false });
    s.dispatch(d => { d.n = 9; }, { record: false });
    expect(s.get().n).toBe(9);
    s.undo();
    expect(s.get().n).toBe(0);
  });
  test('cancelTransaction restores the snapshot taken at beginTransaction', () => {
    const s = createStore({ n: 0 });
    let calls = 0; s.subscribe(() => calls++);
    s.beginTransaction();
    s.dispatch(d => { d.n = 7; }, { record: false });
    s.cancelTransaction();
    expect(s.get().n).toBe(0);
    expect(s.canUndo()).toBe(false);
    expect(calls).toBe(2);
    s.cancelTransaction(); // 트랜잭션이 없으면 아무 일도 하지 않는다
    expect(s.get().n).toBe(0);
  });
  test('cancelTransaction without an open transaction leaves committed history alone', () => {
    const s = createStore({ n: 0 });
    s.dispatch(d => { d.n = 1; });
    s.cancelTransaction();
    expect(s.get().n).toBe(1);
    expect(s.canUndo()).toBe(true);
  });
  test('beginTransaction is idempotent while open; a recorded dispatch closes it as one undo step', () => {
    const s = createStore({ n: 0 });
    s.beginTransaction(); s.beginTransaction();
    s.dispatch(d => { d.n = 3; }, { record: false });
    s.cancelTransaction();
    expect(s.get().n).toBe(0); expect(s.canUndo()).toBe(false);
    s.beginTransaction();
    s.dispatch(d => { d.n = 4; }, { record: false });
    s.dispatch(d => { d.n = 5; });
    s.cancelTransaction(); // 이미 닫힌 트랜잭션: 아무 일도 하지 않는다
    expect(s.get().n).toBe(5); expect(s.canUndo()).toBe(true);
    s.undo();
    expect(s.get().n).toBe(0); expect(s.canUndo()).toBe(false);
  });
  test('endTransaction commits unrecorded changes as one undo step', () => {
    const s = createStore({ n: 0 });
    s.beginTransaction();
    s.dispatch(d => { d.n = 8; }, { record: false });
    s.endTransaction();
    s.cancelTransaction(); // 닫힌 뒤에는 아무 일도 하지 않는다
    expect(s.get().n).toBe(8); expect(s.canUndo()).toBe(true);
    s.undo();
    expect(s.get().n).toBe(0);
  });
  test('a transaction that ends without changes leaves the redo stack intact', () => {
    const s = createStore({ n: 0 });
    s.dispatch(d => { d.n = 1; });
    s.undo();
    expect(s.canRedo()).toBe(true);
    s.beginTransaction(); s.cancelTransaction();
    expect(s.canRedo()).toBe(true);
    expect(s.canUndo()).toBe(false);
    s.beginTransaction(); s.endTransaction(); // 변경 없이 끝난 트랜잭션은 undo 단계도 남기지 않는다
    expect(s.canRedo()).toBe(true);
    expect(s.canUndo()).toBe(false);
    expect(s.redo()).toBe(true); expect(s.get().n).toBe(1);
  });
  test('replace records by default and can be told not to', () => {
    const s = createStore({ n: 0 });
    s.replace({ n: 1 });
    expect(s.get().n).toBe(1); expect(s.canUndo()).toBe(true);
    const t = createStore({ n: 0 });
    t.replace({ n: 1 }, { record: false });
    expect(t.get().n).toBe(1); expect(t.canUndo()).toBe(false); // 자동 저장 복원처럼 되돌릴 이유가 없는 교체
  });
  test('subscribe is called on every change', () => {
    const s = createStore({ n: 0 });
    let calls = 0; s.subscribe(() => calls++);
    s.dispatch(d => { d.n = 1; }); s.undo();
    expect(calls).toBe(2);
  });
  // §17.3: 프로젝트를 갈아 끼우는 일은 **단계가 0개인 동작**이다 — 기록하지 않는 것만으로는
  // 모자라고(앞에 쌓인 단계가 남아 Ctrl+Z가 옛 프로젝트로 돌아간다) 히스토리를 그 자리에서 비운다.
  test('resetHistory는 열린 트랜잭션과 undo·redo 스택을 모두 비운다(상태는 그대로)', () => {
    const s = createStore({ n: 0 });
    s.dispatch(d => { d.n = 1; });
    s.dispatch(d => { d.n = 2; });
    s.undo();
    expect(s.canUndo()).toBe(true);
    expect(s.canRedo()).toBe(true);
    s.beginTransaction();
    s.dispatch(d => { d.n = 9; }, { record: false });
    s.resetHistory();
    expect(s.get().n).toBe(9);              // 상태는 건드리지 않는다
    expect(s.canUndo()).toBe(false);
    expect(s.canRedo()).toBe(false);
    s.endTransaction();                     // 열린 트랜잭션도 비워졌으므로 단계가 생기지 않는다
    expect(s.canUndo()).toBe(false);
    expect(s.undo()).toBe(false);
  });
  // 리뷰 I-1: replace + resetHistory를 나란히 쓰면 replace의 알림이 **아직 남아 있는 옛 past**를
  // 보고 지나가므로, 그 알림으로 그리는 ↶/↷ 버튼이 "되돌릴 수 있다"고 굳는다. swap은 한 번만
  // 알리고, 그 한 번이 이미 빈 히스토리를 본다 — 구독자가 보는 값과 실제 값이 갈라지지 않는다.
  test('swap은 교체·비우기·알림을 한 번에 한다(구독자가 보는 canUndo·canRedo가 false)', () => {
    const s = createStore({ n: 0 });
    s.dispatch(d => { d.n = 1; });
    s.dispatch(d => { d.n = 2; });
    s.undo();
    expect(s.canUndo()).toBe(true);
    expect(s.canRedo()).toBe(true);
    s.beginTransaction();                   // 열린 트랜잭션도 함께 닫힌다
    const seen = [];
    s.subscribe(v => seen.push([v.n, s.canUndo(), s.canRedo()]));
    s.swap({ n: 7 });
    expect(seen).toEqual([[7, false, false]]);   // 알림은 정확히 한 번, 그 시점에 이미 비어 있다
    expect(s.get().n).toBe(7);
    expect(s.canUndo()).toBe(false);
    expect(s.canRedo()).toBe(false);
    s.endTransaction();
    expect(s.canUndo()).toBe(false);
    expect(s.undo()).toBe(false);
  });
});

describe('ui state', () => {
  test('set merges and notifies', () => {
    const u = createUiState();
    let last; u.subscribe(v => { last = v; });
    u.set({ tool: 'room' });
    expect(u.get().tool).toBe('room');
    expect(last.mode).toBe('2d');
  });
});
