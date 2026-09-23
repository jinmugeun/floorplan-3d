// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { serializeProject, parseProject, startAutosave, loadAutosave, filenameFor, capture2D, printBodyPx, PRINT_PX_PER_MM } from '../src/io/file.js';

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

// §16.11(감사 §7): 2000 px 캡처를 A4 본문 765 px에 맞추면 12 px 글자가 4.6 px이 된다.
// 인쇄 배율 캡처는 **논리 크기를 용지 폭으로** 두고 비트맵만 ratio배로 키운다 → 글자 크기가 보존된다.
test('printBodyPx는 용지 본문 폭을 px로 준다', async () => {
  expect(printBodyPx('A4', false)).toBe(765);            // 감사가 실측한 A4 본문 폭
  expect(printBodyPx('A4', true)).toBe(printBodyPx('A3', false));   // 가로 A4 = 세로 A3 본문 폭
  expect(printBodyPx('없음', false)).toBe(765);           // 모르는 용지는 A4
  expect(printBodyPx('A3', true)).toBeGreaterThan(printBodyPx('A3', false));
  // M-1: 용지 치수의 정본은 specSheet.js의 PAPER 하나다 — 목록에 있는 용지는 전부 그 표에서 나오고,
  // 없는 용지만 A4로 떨어진다(PAPER에만 새 용지를 더해도 캡처 폭이 조용히 A4가 되지 않는다).
  const { PAPER } = await import('../src/io/specSheet.js');
  for (const [paper, [short, long]] of Object.entries(PAPER)) {
    expect(printBodyPx(paper, false)).toBe(Math.round((short - 24) * PRINT_PX_PER_MM));
    expect(printBodyPx(paper, true)).toBe(Math.round((long - 24) * PRINT_PX_PER_MM));
  }
});

test('capture2D는 숫자 인자로는 예전처럼, 객체 인자로는 인쇄 배율로 캡처한다', async () => {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200));
  const sizes = [];
  const realCreate = document.createElement.bind(document);
  const spy = vi.spyOn(document, 'createElement').mockImplementation(tag => {
    const el = realCreate(tag);
    if (tag === 'canvas') {
      // 이 저장소에는 canvas npm 패키지가 없다(devDependencies = jsdom·vite·vitest)
      // → HTMLCanvasElement.prototype.getContext('2d')가 null을 돌려준다. capture2D가 부르는
      // createView2D의 첫 줄이 canvas.getContext('2d')이고 render()가 ctx.setTransform(...)을
      // 부르므로 스텁이 없으면 rAF 콜백 안에서 TypeError가 난다. tests/view2d.test.js:17의
      // 관례를 그대로 쓴다(measureText만 TextMetrics를 돌려주고 나머지는 빈 함수다).
      el.getContext = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}) });
      el.toDataURL = () => 'data:image/png;base64,C';
      sizes.push(el);
    }
    return el;
  });
  try {
    await capture2D(store, null, 2000);
    expect([sizes[0].width, sizes[0].clientWidth]).toEqual([2000, 2000]);   // 예전과 같다(dpr 1)
    await capture2D(store, null, { cssWidth: 765, ratio: 2 });
    expect(sizes[1].clientWidth).toBe(765);                                 // 글자 크기의 기준
    expect(sizes[1].width).toBe(1530);                                      // 비트맵만 2배(선명하게)
  } finally { spy.mockRestore(); }
});
