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
