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
