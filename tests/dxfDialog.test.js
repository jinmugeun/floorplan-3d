// @vitest-environment jsdom
// §18.6의 검토 대화상자. 워커는 가짜를 주입하고(node에서 진짜 워커를 띄우지 않는다),
// 캔버스는 tests/view2d.test.js의 Proxy 스텁 관례를 그대로 쓴다(jsdom에는 캔버스가 없다).
import { test, expect } from 'vitest';
import { layerListHtml, layerRowHtml, aciColor, wallOnly, allOn } from '../src/ui/dxfLayerList.js';
import { previewTransform, boundsOf, drawDxfPreview, PREVIEW_COLORS, OPEN_END_R } from '../src/ui/dxfPreview.js';
import { DXF_BADGE_OFF, DXF_BADGE_HATCH } from '../src/ui/messages.js';

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
