// @vitest-environment jsdom
// main.js가 283줄이라 파일 열기·캡처·드롭 배선을 app/fileActions.js로 나눴다(§9 · 전역 규칙).
import { test, expect, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { serializeProject } from '../src/io/file.js';
import { createFileActions } from '../src/app/fileActions.js';

const setup = () => {
  const store = createStore(createEmptyProject());
  const toasts = [];
  const view = { fit: vi.fn() };
  const acts = createFileActions({ store, ui: createUiState(), view, view3d: { capture: () => 'data:,' }, toast: m => toasts.push(m) });
  return { store, toasts, view, acts };
};
const fileOf = (text, name = 'a.json', type = 'application/json') => ({ name, type, text: async () => text });

test('JSON 파일을 열면 프로젝트를 갈아 끼우고 화면을 맞춘다', async () => {
  const { store, toasts, view, acts } = setup();
  const src = createStore(createEmptyProject());
  addWalls(src, rectWalls([0, 0], [4000.5, 3000.25], 200));
  await acts.loadFile(fileOf(serializeProject(src.get())));
  expect(activeFloor(store.get()).walls).toHaveLength(4);
  expect(view.fit).toHaveBeenCalled();
  expect(toasts).toEqual(['불러왔습니다']);
  await acts.loadFile(null);                      // 파일 선택 취소는 아무 일도 하지 않는다
  await acts.loadFile(fileOf('엉터리'));
  expect(toasts).toEqual(['불러왔습니다', 'JSON 파일이 아닙니다']);
});

test('캔버스에 떨어뜨린 JSON은 프로젝트로 열고 제품 드래그는 지나간다', async () => {
  const { toasts, acts } = setup();
  const el = document.createElement('div'); document.body.appendChild(el);
  acts.wireDrop(el);
  const drop = dataTransfer => { const ev = new Event('drop', { bubbles: true, cancelable: true }); ev.dataTransfer = dataTransfer; el.dispatchEvent(ev); return ev; };
  const ev = drop({ files: [] });                 // 제품 타일 드래그(§14.11): files가 비어 있다
  expect(ev.defaultPrevented).toBe(true);
  expect(toasts).toEqual([]);
  drop({ files: [fileOf('엉터리')] });
  await new Promise(r => setTimeout(r, 0));
  expect(toasts).toEqual(['JSON 파일이 아닙니다']);
});

// §15.13(감사 §19): 불러오기가 현재 작업을 확인 없이 덮었다.
test('작업 중이면 불러오기 전에 확인을 받고, 취소하면 도면이 그대로다', async () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const asked = [];
  const toasts = [];
  const loaded = [];
  let answer = false;
  const acts = createFileActions({
    store, ui: createUiState(), view: { fit: vi.fn() }, view3d: { capture: () => 'data:,' },
    toast: m => toasts.push(m), isDirty: () => true, markSaved: kind => loaded.push(kind),
    confirm: opts => { asked.push(opts); return Promise.resolve(answer); },
  });
  const src = createStore(createEmptyProject());
  await acts.loadFile({ name: 'a.json', type: 'application/json', text: async () => serializeProject(src.get()) });
  expect(asked).toHaveLength(1);
  expect(asked[0].message).toBe('현재 도면이 대체됩니다. 자동 저장본은 남습니다');
  expect(activeFloor(store.get()).walls).toHaveLength(4);     // 취소했으니 그대로다
  expect(toasts).toEqual([]);
  expect(loaded).toEqual([]);
  answer = true;
  await acts.loadFile({ name: 'a.json', type: 'application/json', text: async () => serializeProject(src.get()) });
  expect(activeFloor(store.get()).walls).toHaveLength(0);
  expect(toasts).toEqual(['불러왔습니다']);
  expect(loaded).toEqual(['none']);                           // 불러온 직후는 clean이지만 저장 이력은 없다
});

test('빈 프로젝트나 저장 직후에는 묻지 않는다', async () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const asked = [];
  const mk = isDirty => createFileActions({ store, ui: createUiState(), view: { fit: vi.fn() }, view3d: { capture: () => 'data:,' }, toast: () => {}, isDirty, confirm: o => { asked.push(o); return Promise.resolve(true); } });
  const src = createStore(createEmptyProject());
  const file = () => ({ name: 'a.json', type: 'application/json', text: async () => serializeProject(src.get()) });
  await mk(() => false).loadFile(file());                     // 저장 직후
  expect(asked).toEqual([]);
  await mk(() => true).loadFile(file());                      // 이제 빈 프로젝트다
  expect(asked).toEqual([]);
});

// 리뷰 M2: 확인 문구는 "자동 저장본은 남습니다"라고 약속하는데 loadFile은 saveNow를 부르지 않았다
// — 자동 저장 간격이 5분이므로 마지막 자동 저장 뒤의 작업이 복구 불가로 사라졌다(confirmLeave는 부른다).
test('불러오기를 확인하면 교체 전에 자동 저장하고, 취소하면 저장도 교체도 없다', async () => {
  const src = createStore(createEmptyProject());
  const file = () => ({ name: 'a.json', type: 'application/json', text: async () => serializeProject(src.get()) });
  const mk = answer => {
    const store = createStore(createEmptyProject());
    addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
    const log = [];
    store.subscribe(() => log.push('replace'));
    const acts = createFileActions({
      store, ui: createUiState(), view: { fit: vi.fn() }, view3d: { capture: () => 'data:,' },
      toast: () => {}, isDirty: () => true, saveNow: () => log.push('save'),
      confirm: () => Promise.resolve(answer),
    });
    return { store, log, acts };
  };
  const yes = mk(true);
  await yes.acts.loadFile(file());
  expect(yes.log).toEqual(['save', 'replace']);               // 저장이 교체보다 먼저다
  expect(activeFloor(yes.store.get()).walls).toHaveLength(0);

  const no = mk(false);
  await no.acts.loadFile(file());
  expect(no.log).toEqual([]);                                 // 취소는 아무것도 저장하지 않는다
  expect(activeFloor(no.store.get()).walls).toHaveLength(4);
});
