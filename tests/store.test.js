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
