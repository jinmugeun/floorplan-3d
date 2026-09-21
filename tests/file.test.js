// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { serializeProject, parseProject, startAutosave, loadAutosave, filenameFor } from '../src/io/file.js';

test('serialize/parse round trip keeps walls and rooms', () => {
  const store = createStore(createEmptyProject('테스트'));
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  const back = parseProject(serializeProject(store.get()));
  expect(activeFloor(back).walls).toHaveLength(4);
  expect(activeFloor(back).rooms).toHaveLength(1);
  expect(back.name).toBe('테스트');
});
test('parse rejects garbage', () => { expect(() => parseProject('{"version":42}')).toThrow(); expect(() => parseProject('nope')).toThrow(); });
test('autosave writes to localStorage after interval', () => {
  vi.useFakeTimers();
  const store = createStore(createEmptyProject('자동'));
  const saved = []; const auto = startAutosave(store, { key: 'k', intervalMs: 1000, onSaved: t => saved.push(t) });
  store.dispatch(d => { d.name = '변경'; });
  vi.advanceTimersByTime(1100);
  expect(loadAutosave('k').name).toBe('변경'); expect(saved).toHaveLength(1);
  auto.stop(); vi.useRealTimers();
});
test('filenameFor', () => { expect(filenameFor({ name: '강당중' })).toMatch(/^강당중_\d{8}-\d{4}\.json$/); });
test('loadAutosave returns null when localStorage is unavailable or holds garbage', () => {
  const orig = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  expect(loadAutosave('k')).toBeNull();
  Object.defineProperty(window, 'localStorage', orig);
  localStorage.setItem('bad', '{"version":42}');
  expect(loadAutosave('bad')).toBeNull();
});

// §13.3 + 전역 규칙: 저장 형식은 assignment.scale 하나만 늘어난다. scale이 없는 파일은
// 필드가 생기지 않은 채로 열리고 저장되며(바이트가 늘지 않는다), 있는 파일은 값이 그대로 돌아온다.
test('assignment.scale은 있을 때만 저장 파일에 실린다', async () => {
  const { applyMaterial } = await import('../src/state/materialOps.js');   // 이 파일이 아직 import하지 않은 것만 가져온다
  const s = createStore(createEmptyProject());
  addWalls(s, rectWalls([0, 0], [4000.5, 3000.25], 200));
  const id = activeFloor(s.get()).walls[0].id;
  applyMaterial(s, { kind: 'wall', id, side: 'in' }, { id: 'tile-white-300', offset: [0, 0], angle: 0 });
  const plain = serializeProject(s.get());
  expect(plain).not.toContain('"scale"');
  expect(activeFloor(parseProject(plain)).walls.find(w => w.id === id).matIn.scale).toBeUndefined();
  applyMaterial(s, { kind: 'wall', id, side: 'in' }, { id: 'tile-white-300', offset: [0, 0], angle: 0, scale: [600, 450] });
  const tiled = parseProject(serializeProject(s.get()));
  expect(activeFloor(tiled).walls.find(w => w.id === id).matIn.scale).toEqual([600, 450]);
});
