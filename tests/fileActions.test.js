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
