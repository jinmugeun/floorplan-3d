// @vitest-environment jsdom
// §18.6의 검토 대화상자. 워커는 가짜를 주입하고(node에서 진짜 워커를 띄우지 않는다),
// 캔버스는 tests/view2d.test.js의 Proxy 스텁 관례를 그대로 쓴다(jsdom에는 캔버스가 없다).
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { openDxfDialog, DXF_THICKNESS_RANGE } from '../src/ui/dxfDialog.js';
import { DXF_ERRORS, DXF_IMPORT_FAILED, DXF_LAYERS_GUESSED, DXF_STEP_READ, DXF_STEP_PARSE, DXF_STEP_WALLS, DXF_STEP_ROOMS, DXF_NUMS, DXF_OPEN_END_COUNT, DXF_UNMATCHED, DXF_TRACE_SKIPPED } from '../src/ui/messages.js';
import { DXF_HEIGHT_KEY, DXF_TRACE_KEY, DXF_HEIGHT_RANGE } from '../src/ui/prefs.js';
import { layerListHtml, layerRowHtml, aciColor, wallOnly, allOn } from '../src/ui/dxfLayerList.js';
import { previewTransform, boundsOf, drawDxfPreview, PREVIEW_COLORS, OPEN_END_R } from '../src/ui/dxfPreview.js';
import { DXF_BADGE_OFF, DXF_BADGE_HATCH, DXF_BADGE_GUESSED, DXF_BADGE_COLOR, DXF_MANY_PLANS, DXF_REGION, DXF_RECONCILED, DXF_GUIDE_LINE, DXF_GUIDE_LINK, DXF_NAME_DIVIDERS, DXF_NAME_DIVIDED, DXF_RAIL_DIVIDED } from '../src/ui/messages.js';

const row = (name, role, segs, extra = {}) => ({ name, role, keyRole: role, segs, arcs: 0, circles: 0, texts: 0, dims: 0, inserts: 0, lenM: 1, medianSeg: 900, color: 3, off: false, frozen: false, ...extra });
const ROWS = [
  row('기존', 'wall', 1353), row('WAL-2', 'wall', 334), row('FIN', 'wall', 256), row('WAL', 'wall', 242),
  row('ST-PL', 'wall', 163), row('BLO', 'wall', 78), row('COL', 'wall', 14),
  row('04창호', 'opening', 3069, { color: 4 }), row('WIN', 'opening', 2003, { color: 4 }),
  row('급식기구', 'equip', 16789, { color: 8 }), row('SYM', 'hatch', 15772, { color: 7, medianSeg: 3 }),
  row('CEN', 'grid', 1205, { color: -1, off: true }), row('TEXT2', 'text', 0, { color: -81, off: true, texts: 746 }),
  row('WALL', 'wall', 0),
];

test('레이어 행은 색 점·이름·선분 수·역할 라벨·배지를 갖는다', () => {
  const html = layerListHtml(ROWS, new Set(['WAL', 'FIN']));
  const el = document.createElement('div');
  el.innerHTML = html;
  const boxes = [...el.querySelectorAll('input[name="layer"]')];
  expect(boxes).toHaveLength(ROWS.length);
  expect(boxes.filter(b => b.checked).map(b => b.value).sort()).toEqual(['FIN', 'WAL']);
  expect(el.textContent).toContain('1353');
  expect(el.textContent).toContain('벽');
  expect(el.textContent).toContain('개구부');
  expect(el.textContent).toContain(DXF_BADGE_OFF);
  expect(el.textContent).toContain(DXF_BADGE_HATCH);
  expect(el.querySelectorAll('.dxf-layer.off')).toHaveLength(2);      // CEN · TEXT2
  expect(layerRowHtml(row('WAL', 'wall', 5), true)).toContain('checked');
  expect(aciColor(1)).toBe('#ff0000');
  expect(aciColor(7)).toBe('#000000');
  expect(aciColor(-1)).toBe('#ff0000');                               // 꺼진 레이어도 색은 있다
  expect(aciColor(150)).toMatch(/^hsl\(/);                            // 표에 없는 ACI는 파생색
});

test('[벽 후보만]과 [전체]는 서로 다른 집합을 고른다', () => {
  expect([...wallOnly(ROWS)].sort()).toEqual(['BLO', 'COL', 'FIN', 'ST-PL', 'WAL', 'WAL-2', '기존'].sort());
  expect(wallOnly(ROWS).has('WALL')).toBe(false);                     // 선분 0개
  expect(wallOnly(ROWS).has('CEN')).toBe(false);                      // 꺼짐
  const all = allOn(ROWS);
  expect(all.has('급식기구')).toBe(true);
  expect(all.has('CEN')).toBe(false);                                 // 꺼진 레이어는 [전체]에도 없다
  expect(all.size).toBe(11);
});

test('미리보기는 벽·방·끊긴 끝점을 같은 변환으로 그린다', () => {
  const t = previewTransform([-3000, -2000, 3000, 2000], 560, 420, 10);
  expect(t.at([0, 0])).toEqual([280, 210]);
  expect(t.at([-3000, -2000])[0]).toBeCloseTo(10, 6);
  expect(t.k).toBeCloseTo((560 - 20) / 6000, 9);
  expect(boundsOf({ walls: [{ a: [-100.5, -50.25], b: [200.5, 80.75], thickness: 200 }] })).toEqual([-100.5, -50.25, 200.5, 80.75]);
  expect(boundsOf({})).toBe(null);
  // 캔버스는 스텁이다(jsdom에는 2D 컨텍스트가 없다). Proxy 대신 **기록하는 컨텍스트**를 쓴다 —
  // 스타일이 평범한 속성이라 호출마다 그때의 색이 함께 남는다(Task 11 리뷰 Important: Proxy는
  // strokeStyle·fillStyle 대입을 하나도 기록하지 않아 벽 색과 끊긴 끝점 색을 맞바꿔도 초록이었다).
  const calls = [];
  const ctx = { strokeStyle: '', fillStyle: '', lineWidth: 0, globalAlpha: 1 };
  for (const op of ['clearRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke']) {
    ctx[op] = (...args) => calls.push({ op, args, strokeStyle: ctx.strokeStyle, fillStyle: ctx.fillStyle, lineWidth: ctx.lineWidth });
  }
  const cv = { width: 560, height: 420, getContext: () => ctx };
  const out = drawDxfPreview(cv, {
    trace: { segs: new Float32Array([-3000, -2000, 3000, -2000]), box: [-3000, -2000, 3000, 2000] },
    walls: [{ a: [-3000, -2000], b: [3000, -2000], thickness: 200 }],
    rooms: [{ points: [[-3000, -2000], [3000, -2000], [3000, 2000]] }],
    openEnds: [[0.5, 0.25]],
    box: [-3000, -2000, 3000, 2000],
  });
  expect(out).not.toBe(null);
  // 색은 §18.6이 글자로 정한 값이고, 무엇을 그 색으로 그리는지까지 못 박는다.
  const traceStrokes = calls.filter(c => c.op === 'stroke' && c.strokeStyle === PREVIEW_COLORS.trace);
  const roomFills = calls.filter(c => c.op === 'fill' && c.fillStyle === PREVIEW_COLORS.room[0]);
  const wallFills = calls.filter(c => c.op === 'fill' && c.fillStyle === PREVIEW_COLORS.wall);
  const endStrokes = calls.filter(c => c.op === 'stroke' && c.strokeStyle === PREVIEW_COLORS.openEnd);
  expect([traceStrokes.length, roomFills.length, wallFills.length, endStrokes.length]).toEqual([1, 1, 1, 1]);
  expect(endStrokes[0].lineWidth).toBe(2);
  expect(calls.filter(c => c.op === 'stroke')).toHaveLength(2);                     // 트레이스 + 끊긴 끝점
  // 차례도 못 박는다: 끊긴 끝점이 이 기능의 결론이므로 벽·방보다 **뒤에** 그려 덮이지 않는다.
  const at = c => calls.indexOf(c);
  expect(at(traceStrokes[0])).toBeLessThan(at(roomFills[0]));
  expect(at(roomFills[0])).toBeLessThan(at(wallFills[0]));
  expect(at(wallFills[0])).toBeLessThan(at(endStrokes[0]));
  // 끊긴 끝점 ✚는 반지름 OPEN_END_R의 가로·세로 두 획이다(마지막 beginPath 뒤의 네 점).
  const endMoves = calls.filter(c => c.op === 'moveTo' && c.strokeStyle === PREVIEW_COLORS.openEnd);
  expect(endMoves.map(c => c.args[0])).toEqual([0.5 * out.k + out.ox - OPEN_END_R, 0.5 * out.k + out.ox]);
  expect(PREVIEW_COLORS).toMatchObject({ trace: '#dcdcdc', wall: '#475569', openEnd: '#dc2626' });
  expect(OPEN_END_R).toBe(6);
  expect(drawDxfPreview({ width: 10, height: 10, getContext: () => null }, {})).toBe(null);
});

// 가짜 워커: 같은 프로토콜을 흉내 내고 무엇이 오갔는지 기록한다.
class FakeWorker {
  constructor() { this.posted = []; this.terminated = 0; FakeWorker.last = this; }
  postMessage(msg) { this.posted.push(msg); }
  terminate() { this.terminated++; }
  emit(data) { this.onmessage?.({ data }); }
}
const SUMMARY = {
  ver: 'AC1032', codepage: 'ANSI_949', encoding: 'utf-8', insunits: 4, unitScale: 1, unitsGuessed: false,
  layers: ROWS, checked: [...wallOnly(ROWS)], blocks: 1009, blocksUsed: 174, entities: 2631,
  segs: 70230, arcs: 8463, texts: 1100, others: [], skipped: [],
  title: '경산 사동중', size: [43974, 25935], manySheets: false, ms: { decode: 65, parse: 864, explode: 42 },
};
const EXTRACTED = {
  type: 'extracted',
  project: { version: 1, name: '경산 사동중', background: null, floors: [{ walls: [{ a: [-100.5, -50.25], b: [200.5, -50.25], thickness: 200 }], rooms: [], items: [] }] },
  stats: { walls: 213, rooms: 52, areaM2: 249.7, openEnds: [[0.5, 0.25], [10.5, 20.25]], thickness: [[100, 70], [200, 26], [95, 23], [250, 19], [500, 15]], unmatchedNames: [], items: 128, size: [43974, 25935], guessed: false, guessedLayers: [], hist: [], ms: { walls: 112, rooms: 169, trace: 40 } },
  trace: { segs: new Float32Array([-100.5, -50.25, 200.5, -50.25]), box: [-100.5, -50.25, 200.5, -50.25] },
};
const fileOf = (name = '평면도.dxf') => ({ name, arrayBuffer: async () => new ArrayBuffer(16) });
const stubCanvas = root => {
  const cv = root.querySelector('[name="preview"]');
  cv.getContext = () => new Proxy({}, { get: () => () => {} });
};
// 타이머는 가짜(디바운스를 직접 돌린다)지만 대기는 **마이크로태스크**로 푼다 —
// setTimeout(0)을 쓰면 가짜 타이머 아래에서 영원히 깨지 않는다.
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

function open(opts = {}) {
  const w = new FakeWorker();
  const api = openDxfDialog({ workerFactory: () => w, ...opts });
  const root = document.getElementById('dxfDialog');
  stubCanvas(root);
  return { w, api, root, q: n => root.querySelector(`[name="${n}"]`) };
}

test('열면 포커스가 파일 칸이고 [Tab]이 대화상자 안에서만 돈다', () => {
  const { root } = open();
  expect(document.activeElement).toBe(root.querySelector('[name="file"]'));
  const inside = () => root.contains(document.activeElement);
  for (let i = 0; i < 12; i++) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(inside()).toBe(true);
  }
});

test('[Esc]는 워커를 terminate하고 취소를 알린다', async () => {
  const onCancel = vi.fn();
  const { w, root } = open({ onCancel, file: fileOf() });
  await flush();                                   // 파일을 읽고 워커가 만들어진 뒤
  root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(w.terminated).toBe(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(document.getElementById('dxfDialog')).toBe(null);
});

test('진행 막대는 phase를 네 단계 라벨로 옮긴다', async () => {
  const { w, root, q } = open({ file: fileOf() });
  await flush();
  expect(q('step').textContent).toBe(DXF_STEP_READ);
  w.emit({ type: 'progress', phase: 'parse', pct: 0.3, blocks: 1009 });
  expect(q('step').textContent).toBe(DXF_STEP_PARSE(1009));
  w.emit({ type: 'progress', phase: 'explode', pct: 0.9, blocks: 1009 });
  expect(q('step').textContent).toBe(DXF_STEP_PARSE(1009));
  w.emit({ type: 'progress', phase: 'walls', pct: 0, blocks: 1009 });
  expect(q('step').textContent).toBe(DXF_STEP_WALLS);
  w.emit({ type: 'progress', phase: 'trace', pct: 0, blocks: 1009 });
  expect(q('step').textContent).toBe(DXF_STEP_ROOMS);
  expect(q('progress').hidden).toBe(false);
});

test('머리줄·레이어 행 수·하단 수치·두께 분포가 채워진다', async () => {
  const { w, root, q } = open({ file: fileOf() });
  await flush();
  w.emit({ type: 'parsed', summary: SUMMARY });
  await flush();
  expect(q('head').textContent).toBe('경산 사동중 · 44.0 m × 25.9 m · mm (INSUNITS=4) · AC1032');
  expect(root.querySelectorAll('input[name="layer"]')).toHaveLength(ROWS.length);
  expect([...root.querySelectorAll('input[name="layer"]')].filter(b => b.checked)).toHaveLength(7);
  w.emit(EXTRACTED);
  await flush();
  expect(q('nums').textContent).toBe(DXF_NUMS(213, 52, '249.7'));
  expect(q('warn').textContent).toBe(DXF_OPEN_END_COUNT(2));
  expect(q('warn').hidden).toBe(false);
  expect(q('hist').textContent).toBe('100 mm×70 · 200 mm×26 · 95 mm×23 · 250 mm×19');
  expect(q('import').disabled).toBe(false);
  expect(q('progress').hidden).toBe(true);
});

// 사전 검토 C-5: 앞 요청이 아직 돌고 있으면 새 요청은 **큐에 하나만** 남고 응답 직후 나간다.
test('[벽 후보만]·[전체]·[자동 판정 되돌리기]와 250 ms 디바운스(마지막 요청이 이긴다)', async () => {
  const { w, root, q } = open({ file: fileOf() });
  await flush();
  w.emit({ type: 'parsed', summary: SUMMARY });
  await flush();
  w.emit(EXTRACTED);
  await flush();
  const extracts = () => w.posted.filter(m => m.type === 'extract');
  expect(extracts()).toHaveLength(1);
  q('all').click();
  expect([...root.querySelectorAll('input[name="layer"]')].filter(b => b.checked)).toHaveLength(11);
  // 세 번 바꿔도 250 ms 뒤 한 번만 간다.
  const boxes = [...root.querySelectorAll('input[name="layer"]')];
  for (const b of boxes.slice(0, 3)) { b.checked = false; b.dispatchEvent(new Event('change', { bubbles: true })); }
  expect(extracts()).toHaveLength(1);
  vi.advanceTimersByTime(250);
  await flush();
  expect(extracts()).toHaveLength(2);
  // 앞 요청(extract #2)의 응답이 아직 오지 않았다 — 그 사이의 요청은 **보내지 않고 큐에 둔다**.
  q('wallOnly').click();
  vi.advanceTimersByTime(250);
  await flush();
  expect(extracts()).toHaveLength(2);
  q('auto').click();
  vi.advanceTimersByTime(250);
  await flush();
  expect(extracts()).toHaveLength(2);
  // 응답이 오면 **가장 최근 것 하나만** 나간다(중간의 [벽 후보만]은 superseded로 사라진다).
  w.emit(EXTRACTED);
  await flush();
  expect(extracts()).toHaveLength(3);
  expect(extracts()[2].opts.layers.sort()).toEqual([...SUMMARY.checked].sort());
});

test('오류 코드 다섯이 §18.6의 문구를 그대로 띄운다', async () => {
  // 띄우는 문장마다 워커가 보낸 원문을 콘솔에 남긴다(Task 10 리뷰) — 여기서 조용히 받아 센다.
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  for (const code of ['not-dxf', 'binary', 'dwg', 'no-walls', 'oom']) {
    const { w, q } = open({ file: fileOf() });
    await flush();
    w.emit({ type: 'error', code, message: code });
    await flush();
    expect(q('error').textContent).toBe(DXF_ERRORS[code]);
    expect(q('error').hidden).toBe(false);
    expect(q('import').disabled).toBe(true);
    document.body.innerHTML = '';
  }
  expect(warn.mock.calls.map(c => c.join(' '))).toEqual(['not-dxf', 'binary', 'dwg', 'no-walls', 'oom'].map(c => 'dxf: ' + c));
  warn.mockRestore();
});

test('[가져오기]는 onImported를 한 번 부르고 트레이스를 배경으로 붙인다', async () => {
  const onImported = vi.fn(async () => true);
  const { w, q, root } = open({ file: fileOf(), onImported });
  await flush();
  w.emit({ type: 'parsed', summary: SUMMARY });
  await flush();
  w.emit(EXTRACTED);
  await flush();
  q('height').value = '3200';
  q('height').dispatchEvent(new Event('change', { bubbles: true }));
  vi.advanceTimersByTime(250);
  await flush();
  w.emit(EXTRACTED);
  await flush();
  expect(w.posted.filter(m => m.type === 'extract').at(-1).opts).toMatchObject({ height: 3200, thickness: 200, scale: 1 });
  q('import').click();
  await flush();
  expect(onImported).toHaveBeenCalledTimes(1);
  const { project, stats } = onImported.mock.calls[0][0];
  expect(stats.walls).toBe(213);
  expect(project.background).toBe(null);          // 캔버스 스텁이 toDataURL을 주지 않으면 배경은 없다
  expect(localStorage.getItem(DXF_HEIGHT_KEY)).toBe('3200');
  expect(localStorage.getItem(DXF_TRACE_KEY)).toBe('1');
  expect(document.getElementById('dxfDialog')).toBe(null);
  expect(w.terminated).toBe(1);
});

test('트레이스가 한도를 넘으면 배경 없이 알리고, onImported가 false면 닫지 않는다', async () => {
  const toast = vi.fn();
  const onImported = vi.fn(async () => false);
  const { w, q } = open({ file: fileOf(), onImported, toast });
  await flush();
  w.emit({ type: 'parsed', summary: SUMMARY });
  await flush();
  w.emit(EXTRACTED);
  await flush();
  q('import').click();
  await flush();
  expect(toast).toHaveBeenCalledWith(DXF_TRACE_SKIPPED);
  expect(document.getElementById('dxfDialog')).not.toBe(null);   // 취소했으므로 열린 채다
  expect(onImported).toHaveBeenCalledTimes(1);
});

// ── 리뷰 F-1…F-5가 연 다섯 자리. 전부 사용자가 실제로 밟는 경로다.

// F-1: 두 번째 클릭은 래치가 막는다(disabled만으로는 dispatchEvent가 그냥 지나간다).
test('[가져오기]를 빠르게 두 번 눌러도 onImported는 한 번이다', async () => {
  let done;
  const onImported = vi.fn(() => new Promise(r => { done = r; }));
  const { w, q } = open({ file: fileOf(), onImported });
  await flush();
  w.emit({ type: 'parsed', summary: SUMMARY });
  await flush();
  w.emit(EXTRACTED);
  await flush();
  q('import').click();
  q('import').dispatchEvent(new MouseEvent('click', { bubbles: true }));   // disabled를 우회해도 막힌다
  await flush();
  expect(onImported).toHaveBeenCalledTimes(1);
  expect(q('import').disabled).toBe(true);                                  // 기다리는 동안 잠겨 있다
  expect(document.getElementById('dxfDialog')).not.toBe(null);
  done(true);
  await flush();
  expect(onImported).toHaveBeenCalledTimes(1);
  expect(document.getElementById('dxfDialog')).toBe(null);
});

// F-2: 밀려난 요청(superseded)은 오류가 아니다 — 파싱 쪽 catch도 추출 쪽과 같은 그물을 쓴다.
test('파일을 잇달아 세 번 떨어뜨려도 거짓 오류가 뜨지 않는다', async () => {
  const { w, q, root } = open();
  const drop = name => root.dispatchEvent(Object.assign(new Event('drop', { bubbles: true }), { dataTransfer: { files: [fileOf(name)] } }));
  drop('a.dxf'); drop('b.dxf'); drop('c.dxf');
  await flush();
  expect(q('error').hidden).toBe(true);                                     // 예전에는 "도면이 너무 큽니다"
  expect(q('progress').hidden).toBe(false);                                 // 진행 막대도 살아 있다
  expect(w.posted.filter(m => m.type === 'parse').map(m => m.fileName)).toEqual(['a.dxf']);   // b는 큐에서 밀렸다
  w.emit({ type: 'parsed', summary: SUMMARY });                             // a의 응답 → 밀려 있던 c가 나간다
  await flush();
  expect(w.posted.filter(m => m.type === 'parse').map(m => m.fileName)).toEqual(['a.dxf', 'c.dxf']);
  w.emit({ type: 'parsed', summary: { ...SUMMARY, title: '마지막 도면' } });
  await flush();
  expect(q('error').hidden).toBe(true);
  expect(q('head').textContent).toContain('마지막 도면');                   // 마지막 파일이 화면의 정본이다
});

// F-3: 거절을 삼키면 "버튼이 먹지 않는" 화면이 된다(Task 14의 saveNow가 localStorage 한도를 넘는 경우).
test('onImported가 거절하면 오류 줄을 띄우고 대화상자를 열어 둔다', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const onImported = vi.fn(async () => { throw new Error('quota exceeded'); });
  const { w, q } = open({ file: fileOf(), onImported });
  await flush();
  w.emit({ type: 'parsed', summary: SUMMARY });
  await flush();
  w.emit(EXTRACTED);
  await flush();
  q('import').click();
  await flush();
  expect(q('error').textContent).toBe(DXF_IMPORT_FAILED);
  expect(q('error').hidden).toBe(false);
  expect(document.getElementById('dxfDialog')).not.toBe(null);
  expect(q('import').disabled).toBe(false);                                 // 래치가 풀려 다시 누를 수 있다
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0].join(' ')).toContain('quota exceeded');         // 원인은 콘솔에 남는다
  warn.mockRestore();
});

// F-4: 프리셋 칸은 상태를 비추는 거울이다 — 어긋나면 다음 클릭이 라벨과 반대로 움직인다.
test('"벽만 남기기" 칸은 지금 체크 집합을 그대로 비춘다', async () => {
  const { w, q, root } = open({ file: fileOf() });
  await flush();
  w.emit({ type: 'parsed', summary: SUMMARY });
  await flush();
  const boxes = () => [...root.querySelectorAll('input[name="layer"]')];
  const on = () => boxes().filter(b => b.checked).map(b => b.value).sort();
  expect(q('preset').checked).toBe(true);
  q('all').click();
  expect(q('preset').checked).toBe(false);                                  // 전체가 켜졌으니 "벽만"이 아니다
  q('preset').checked = true;
  q('preset').dispatchEvent(new Event('change', { bubbles: true }));
  expect(on()).toEqual([...wallOnly(ROWS)].sort());                         // 한 번에 기본 집합으로 돌아온다
  expect(q('preset').checked).toBe(true);
  const one = boxes().find(b => b.value === 'WAL');
  one.checked = false;
  one.dispatchEvent(new Event('change', { bubbles: true }));
  expect(q('preset').checked).toBe(false);                                  // 벽 하나를 꺼도 기본 집합이 아니다
});

// F-5(§18.6): 알림이 "체크를 확인해 주세요"라고 하면 확인할 체크가 켜져 있어야 한다.
test('폴백이면 추정 레이어가 체크리스트에 미리 켜진다', async () => {
  const rows = [...ROWS, row('A-WALL', 'other', 900)];
  const { w, q, root } = open({ file: fileOf() });
  await flush();
  w.emit({ type: 'parsed', summary: { ...SUMMARY, layers: rows, checked: [] } });
  await flush();
  expect([...root.querySelectorAll('input[name="layer"]')].filter(b => b.checked)).toHaveLength(0);
  w.emit({ ...EXTRACTED, stats: { ...EXTRACTED.stats, guessed: true, guessedLayers: ['A-WALL'] } });
  await flush();
  const on = [...root.querySelectorAll('input[name="layer"]')].filter(b => b.checked).map(b => b.value);
  expect(on).toEqual(['A-WALL']);
  expect(q('notice').textContent).toBe(DXF_LAYERS_GUESSED);
  expect(q('notice').hidden).toBe(false);
});


// 최종 리뷰 I-1: <input min max>는 타이핑을 막지 않고 이 대화상자에는 폼 제출도 없다. 범위 밖 값은
// 워커로도 설정으로도 가지 않는다 — 층고 99999는 normalizeProject를 빠져나가 room.height 하나만
// 99999로 남고(floor·wall만 8000으로 잘린다) 3D 천장이 100 m로 선다.
test('범위 밖 층고·두께는 추출 옵션과 설정에 닿기 전에 잘린다', async () => {
  const onImported = vi.fn(async () => true);
  const { w, q } = open({ file: fileOf(), onImported });
  await flush();
  w.emit({ type: 'parsed', summary: SUMMARY });
  await flush();
  w.emit(EXTRACTED);
  await flush();
  const lastOpts = () => w.posted.filter(m => m.type === 'extract').at(-1).opts;
  q('height').value = '99999';
  q('thickness').value = '-50';
  q('height').dispatchEvent(new Event('change', { bubbles: true }));
  vi.advanceTimersByTime(250);
  await flush();
  expect(lastOpts()).toMatchObject({ height: DXF_HEIGHT_RANGE[1], thickness: DXF_THICKNESS_RANGE[0] });
  expect(lastOpts().height).toBe(8000);
  expect(lastOpts().thickness).toBe(50);
  w.emit(EXTRACTED);
  await flush();
  // 반대쪽 경계도 같은 규칙이다.
  q('height').value = '10';
  q('thickness').value = '99999';
  q('height').dispatchEvent(new Event('change', { bubbles: true }));
  vi.advanceTimersByTime(250);
  await flush();
  expect(lastOpts()).toMatchObject({ height: DXF_HEIGHT_RANGE[0], thickness: DXF_THICKNESS_RANGE[1] });
  w.emit(EXTRACTED);
  await flush();
  // 설정도 잘린 값으로 남는다 — setDxfHeight는 범위 밖을 조용히 버려 "층고를 기억한다"가 깨졌다.
  q('height').value = '99999';
  q('import').click();
  await flush();
  expect(onImported).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem(DXF_HEIGHT_KEY)).toBe(String(DXF_HEIGHT_RANGE[1]));
});

// 최종 리뷰 I-2(§18.4): stats.unmatchedNames는 "어느 공간이 안 닫혔나"를 알려 주는 유일한 신호다.
test('닫히지 않은 공간 수를 검토 화면에 적는다', async () => {
  const { w, q } = open({ file: fileOf() });
  await flush();
  w.emit({ type: 'parsed', summary: SUMMARY });
  await flush();
  w.emit({ ...EXTRACTED, stats: { ...EXTRACTED.stats, unmatchedNames: ['조리실', '세척실'] } });
  await flush();
  expect(q('unmatched').textContent).toBe(DXF_UNMATCHED(2));
  expect(q('unmatched').textContent).toBe('닫히지 않은 공간 2곳');
  expect(q('unmatched').hidden).toBe(false);
  // 하나도 없으면 줄 자체가 없다(EXTRACTED의 unmatchedNames는 빈 배열이다).
  q('trace').dispatchEvent(new Event('change', { bubbles: true }));
  vi.advanceTimersByTime(250);
  await flush();
  w.emit(EXTRACTED);
  await flush();
  expect(q('unmatched').hidden).toBe(true);
  expect(q('unmatched').textContent).toBe('');
});
// ── 2026-10-02 배포 사이트 실측에서 나온 것들 ────────────────────────────────────────────────
const REGIONS = [
  { size: [38630, 20684], lenM: 3724, wallM: 258, hint: '식당 (196석) · 슬로프' },
  { size: [37830, 20548], lenM: 1342, wallM: 247, hint: '식당 (168석)' },
];

// 신상중: 같은 건물의 두 안이 한 파일에 있었고 선이 많은 쪽이 조용히 골라졌다.
test('도면 후보가 둘 이상이면 고르는 칸과 알림이 나오고, 바꾸면 그 번호로 다시 추출한다', async () => {
  const { w, q } = open({ file: fileOf() });
  await flush();
  w.emit({ type: 'parsed', summary: { ...SUMMARY, size: REGIONS[0].size, regions: REGIONS } });
  await flush();
  expect(q('regionRow').hidden).toBe(false);
  const opts = [...q('region').options];
  expect(opts.map(o => o.textContent)).toEqual([DXF_REGION(1, '38.6', '20.7', REGIONS[0].hint), DXF_REGION(2, '37.8', '20.5', REGIONS[1].hint)]);
  expect(q('notice').textContent).toBe(DXF_MANY_PLANS(2));
  expect(q('notice').hidden).toBe(false);
  const extracts = () => w.posted.filter(m => m.type === 'extract');
  expect(extracts()[0].opts.region).toBe(0);
  w.emit(EXTRACTED);
  await flush();
  q('region').value = '1';
  q('region').dispatchEvent(new Event('change', { bubbles: true }));
  expect(q('head').textContent).toContain('37.8 m × 20.5 m');
  vi.advanceTimersByTime(250);
  await flush();
  expect(extracts()[1].opts.region).toBe(1);
});

test('도면 후보가 하나면 고르는 칸은 숨는다', async () => {
  const { w, q } = open({ file: fileOf() });
  await flush();
  w.emit({ type: 'parsed', summary: { ...SUMMARY, regions: [REGIONS[0]] } });
  await flush();
  expect(q('regionRow').hidden).toBe(true);
  expect(q('notice').hidden).toBe(true);
  expect(w.posted.find(m => m.type === 'extract').opts.region).toBe(0);
});

// 내곡중: 벽 레이어를 이름으로 못 찾아 내용으로 고른 경우(행의 guessed) — 불러오자마자 알리고 행에 배지를 단다.
test('내용으로 고른 벽 레이어는 불러오자마자 알리고 배지를 단다', async () => {
  const rows = [row('건축', 'wall', 14829, { keyRole: 'other', guessed: true }), row('WID', 'opening', 2584, { keyRole: 'other', byColor: true, color: 4 }), row('실명', 'text', 0, { texts: 23 })];
  const { w, q, root } = open({ file: fileOf() });
  await flush();
  w.emit({ type: 'parsed', summary: { ...SUMMARY, layers: rows, checked: ['건축'] } });
  await flush();
  expect(q('notice').textContent).toBe(DXF_LAYERS_GUESSED);
  const labels = [...root.querySelectorAll('.dxf-layer')].map(l => l.textContent);
  expect(labels[0]).toContain(DXF_BADGE_GUESSED);
  expect(labels[1]).toContain(DXF_BADGE_COLOR);
  expect(labels[2]).not.toContain(DXF_BADGE_GUESSED);
  expect(w.posted.find(m => m.type === 'extract').opts.layers).toEqual(['건축']);
});

// 코드 리뷰 2026-09-29에서 재현: 층고를 바꾸고 곧바로 [가져오기]를 누르면 옛 결과가 들어갔다(디바운스 중 버튼이
// 켜져 있었고, 앞 재추출의 응답이 뒤 재추출을 기다리는 동안 버튼을 켰다). 바뀐 순간부터 최신 결과가 올 때까지 잠근다.
test('옵션·체크를 바꾸면 최신 결과가 올 때까지 [가져오기]가 잠긴다', async () => {
  const onImported = vi.fn(async () => true);
  const { w, q } = open({ file: fileOf(), onImported });
  await flush();
  w.emit({ type: 'parsed', summary: SUMMARY });
  await flush();
  w.emit(EXTRACTED);
  await flush();
  expect(q('import').disabled).toBe(false);
  q('height').value = '2700';
  q('height').dispatchEvent(new Event('change', { bubbles: true }));
  expect(q('import').disabled).toBe(true);                 // 디바운스가 돌기도 전에 잠긴다
  q('import').click();
  await flush();
  expect(onImported).not.toHaveBeenCalled();
  vi.advanceTimersByTime(250);
  await flush();                                            // 재추출 #2가 나갔다
  q('autoNames').click();                                   // 그 응답이 오기 전에 또 바꾼다
  w.emit(EXTRACTED);                                        // #2의 응답 — 최신이 아니다
  await flush();
  expect(q('import').disabled).toBe(true);
  vi.advanceTimersByTime(250);
  await flush();
  w.emit(EXTRACTED);                                        // #3(최신)의 응답
  await flush();
  expect(q('import').disabled).toBe(false);
});

// 2026-10-12 · 계획 12 Task 3: 선이 많은 도면이면 사람이 도면부터 간편화할 수 있게 — 선 수 · 체크한 벽 레이어 수와 입력 도면 안내(새 탭).
test('검토 창은 "선 n개 중 벽 레이어 m개"와 입력 도면 안내 링크를 보이고, 체크를 바꾸면 m이 따라간다', async () => {
  const { w, q, root } = open({ file: fileOf() });
  await flush();
  w.emit({ type: 'parsed', summary: SUMMARY });
  await flush();
  expect(q('guide').hidden).toBe(false);
  expect(q('guide').textContent).toContain(DXF_GUIDE_LINE(70230, 7));
  expect(DXF_GUIDE_LINE(70230, 7)).toBe('선 70,230개 중 벽 레이어 7개');
  const a = q('guide').querySelector('a');
  expect(a.getAttribute('href')).toBe('dxf-guide.html');
  expect(a.getAttribute('target')).toBe('_blank');
  expect(a.getAttribute('rel')).toBe('noopener');
  expect(a.textContent).toBe(DXF_GUIDE_LINK);
  const box = [...root.querySelectorAll('input[name="layer"]')].find(b => b.value === 'WAL');
  box.checked = false;
  box.dispatchEvent(new Event('change', { bubbles: true }));
  expect(q('guide').textContent).toContain(DXF_GUIDE_LINE(70230, 6));
});

// 2026-10-02: 가져오기가 방 구조를 도면의 면적 표기에 맞췄으면(구획선·딸린 방) 무엇을 했는지 알린다.
test('구획선을 긋거나 딸린 방을 합쳤으면 알림 줄에 적는다', async () => {
  const { w, q } = open({ file: fileOf() });
  await flush();
  w.emit({ type: 'parsed', summary: SUMMARY });
  await flush();
  w.emit({ ...EXTRACTED, stats: { ...EXTRACTED.stats, dividers: 2, annexes: 1 } });
  await flush();
  expect(q('notice').textContent).toBe(DXF_RECONCILED(2, 1));
  expect(DXF_RECONCILED(2, 1)).toBe('도면의 면적 표기에 맞춰 구획선 2개를 긋고 딸린 방 1곳을 합쳤습니다');
  expect(DXF_RECONCILED(2, 0)).toBe('도면의 면적 표기에 맞춰 구획선 2개를 그었습니다');
  expect(DXF_RECONCILED(0, 3)).toBe('도면의 면적 표기에 맞춰 딸린 방 3곳을 합쳤습니다');
  expect(q('notice').hidden).toBe(false);
});

// 2026-10-12 · 계획 12 최종 리뷰 X-4(M5-4): 난간 구획선은 늘 켜져 있는데(railDividers) 검토 창이 아무 말도 하지 않아, 면적 표기 없는 도면에서
// 미리보기의 점선이 설명 없이 나타났다. 그은 수를 따로 알린다 — 면적 표기 문구(stats.dividers)와 섞지 않는다.
test('난간으로 닫은 구획선을 그었으면 그 수를 알림 줄에 따로 적는다(면적 표기 구획선과 섞지 않는다)', async () => {
  const noticeOf = async stats => {
    document.body.innerHTML = '';
    const { w, q } = open({ file: fileOf() });
    await flush();
    w.emit({ type: 'parsed', summary: SUMMARY });
    await flush();
    w.emit({ ...EXTRACTED, stats: { ...EXTRACTED.stats, ...stats } });
    await flush();
    return q('notice').textContent;
  };
  expect(await noticeOf({ railDividers: 2 })).toBe(DXF_RAIL_DIVIDED(2));
  expect(DXF_RAIL_DIVIDED(2)).toBe('난간으로 닫은 구획선 2개를 그었습니다 — 미리보기의 점선을 확인해 주세요');
  expect(await noticeOf({ dividers: 1, railDividers: 3 })).toBe(`${DXF_RECONCILED(1, 0)} / ${DXF_RAIL_DIVIDED(3)}`);
  expect(await noticeOf({ railDividers: 0 })).not.toContain('난간');
});

// 2026-10-12 · 계획 12 Task 6: 실명만으로 구획선은 **옵션, 기본 꺼짐**(사용자 결정 2026-10-02). 켜면 추출 옵션 dividerByNames로 다시 추출하고,
// 그은 수를 알림 줄에 적는다(제안이라 점선을 확인하게).
test('"실명만으로 구획선 제안" 칸은 기본 꺼짐이고, 켜면 dividerByNames로 다시 추출하고 그은 수를 알린다', async () => {
  const { w, q } = open({ file: fileOf() });
  await flush();
  w.emit({ type: 'parsed', summary: SUMMARY });
  await flush();
  const lastOpts = () => w.posted.filter(m => m.type === 'extract').at(-1).opts;
  expect(q('nameDividers').checked).toBe(false);
  expect(q('nameDividers').closest('label').textContent.trim()).toBe(DXF_NAME_DIVIDERS);
  expect(DXF_NAME_DIVIDERS).toBe('실명만으로 구획선 제안(면적 표기 없을 때)');
  expect(lastOpts().dividerByNames).toBe(false);
  w.emit(EXTRACTED);
  await flush();
  q('nameDividers').click();
  expect(q('import').disabled).toBe(true);                  // 최신 결과가 올 때까지 잠긴다
  vi.advanceTimersByTime(250);
  await flush();
  expect(lastOpts().dividerByNames).toBe(true);
  w.emit({ ...EXTRACTED, stats: { ...EXTRACTED.stats, nameDividers: 3 } });
  await flush();
  expect(q('notice').textContent).toBe(DXF_NAME_DIVIDED(3));
  expect(DXF_NAME_DIVIDED(3)).toBe('실명만으로 구획선 3개를 제안했습니다 — 미리보기의 점선을 확인해 주세요');
  expect(q('import').disabled).toBe(false);
});

test('미리보기는 구획선(virtual)을 두께 폴리곤이 아니라 중심선 점선으로 긋는다', () => {
  const calls = [];
  const ctx = { strokeStyle: '', fillStyle: '', lineWidth: 0, globalAlpha: 1, dash: [] };
  for (const op of ['clearRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke']) ctx[op] = (...args) => calls.push({ op, args, dash: ctx.dash, strokeStyle: ctx.strokeStyle });
  ctx.setLineDash = d => { ctx.dash = d; };
  const walls = [{ a: [-3000, 0], b: [3000, 0], thickness: 200 }, { a: [0, -2000], b: [0, 2000], thickness: 20, virtual: true }];
  drawDxfPreview({ width: 560, height: 420, getContext: () => ctx }, { walls, box: [-3000, -2000, 3000, 2000] });
  expect(calls.filter(c => c.op === 'fill')).toHaveLength(1);                           // 벽 하나만 폴리곤
  const dashed = calls.filter(c => c.op === 'stroke' && c.dash.length);
  expect(dashed).toHaveLength(1);
  expect([dashed[0].dash, dashed[0].strokeStyle]).toEqual([[6, 4], PREVIEW_COLORS.wall]);
  expect(ctx.dash).toEqual([]);                                                          // 점선을 되돌려 놓았다
});

// 2026-10-12 · 계획 12 Task 10: [가져오기]를 누른 순간(사람이 검토를 마친 뒤 · 스토어에 들어가기 전)의 선택과 결과 스냅숏을
// project.meta.dxfImport에 남긴다 — 나중에 "교정 기록 내보내기"가 지금 프로젝트와의 차이를 낸다(io/dxfFeedback.js).
test('[가져오기]는 가져오기 선택과 결과 스냅숏을 project.meta.dxfImport에 남긴다(워커 결과는 고치지 않는다)', async () => {
  vi.setSystemTime(new Date('2026-10-12T05:06:07.000Z'));
  const onImported = vi.fn(async () => true);
  const { w, q } = open({ file: fileOf('사동중.dxf'), onImported });
  await flush();
  w.emit({ type: 'parsed', summary: SUMMARY });
  await flush();
  const floor = {
    id: 'f1', name: '1F',
    walls: [{ id: 'w1', a: [-100.54, -50.26], b: [200.5, -50.26], thickness: 200, height: 3500, colorIn: '#ffffff' }, { id: 'v1', a: [0, 0], b: [0, 900], thickness: 20, virtual: true }],
    rooms: [{ id: 'r1', name: '교실', area: 10.5, areaCenter: 12.346, points: [[0, 0]], wallIds: ['w1'] }],
    items: [{ id: 'i1', kind: 'door', productId: 'door-swing-900', wallId: 'w1', t: 0.5, size: [900, 40, 2100], pos: [1, 2], attach: 'wall' }],
  };
  const ext = { ...EXTRACTED, project: { ...EXTRACTED.project, floors: [floor] }, stats: { ...EXTRACTED.stats, guessed: false } };
  w.emit(ext);
  await flush();
  q('import').click();
  await flush();
  const { project } = onImported.mock.calls[0][0];
  const meta = project.meta.dxfImport;
  expect(meta.at).toBe('2026-10-12T05:06:07.000Z');
  expect(meta.fileName).toBe('사동중.dxf');
  const sent = w.posted.filter(m => m.type === 'extract').at(-1).opts;
  expect(meta.checked).toEqual(sent.layers);                                 // 이 결과를 낸 체크 그대로
  expect(meta.checked.sort()).toEqual([...SUMMARY.checked].sort());
  const { layers, ...rest } = sent;
  expect(meta.options).toEqual({ ...rest, rolesGiven: false, layersGuessed: false });
  expect(meta.options).toMatchObject({ region: 0, dividerByNames: false, openings: true });
  expect(meta.snapshot).toEqual({
    walls: [{ id: 'w1', a: [-100.5, -50.3], b: [200.5, -50.3], thickness: 200, virtual: false }, { id: 'v1', a: [0, 0], b: [0, 900], thickness: 20, virtual: true }],
    rooms: [{ id: 'r1', name: '교실', area: 12.35 }],
    items: [{ id: 'i1', productId: 'door-swing-900', wallId: 'w1', t: 0.5, size: [900, 40, 2100] }],
  });
  expect(project.floors).toBe(ext.project.floors);                           // 층은 워커가 낸 그대로다
  expect(ext.project.meta).toBeUndefined();                                  // 워커 결과 객체에는 붙이지 않는다(취소 뒤 다시 눌러도 새 기록)
});
