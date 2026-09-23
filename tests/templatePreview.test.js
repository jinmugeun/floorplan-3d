// §16.10: 카드 22장이 글자만이라 무엇이 놓이는지 알 수 없었다(감사 §14). 96 px 축소 평면을 그린다.
// 좌표 정규화는 순수 계산이라 캔버스 없이 단정한다.
import { describe, test, expect } from 'vitest';
import { createItem } from '../src/state/schema.js';
import { productById } from '../src/products/catalog.js';
import { previewBox, previewShapes, projectShapes, drawPreview, PREVIEW_PX } from '../src/ui/templatePreview.js';

const room = { points: [[0, 0], [4000.5, 0], [4000.5, 3000.25], [0, 3000.25]] };

describe('템플릿 미리보기', () => {
  test('bbox는 소수 좌표를 그대로 읽고 빈 폴리곤은 null이다', () => {
    expect(previewBox(room.points)).toEqual({ x0: 0, y0: 0, x1: 4000.5, y1: 3000.25 });
    expect(previewBox([])).toBeNull();
    expect(previewBox(null)).toBeNull();
  });

  test('96 px 안에 종횡비를 지키며 들어가고 제품은 발자국 사각형이 된다', () => {
    const sofa = createItem(productById('sofa-3'), { pos: [2000.5, 1500.25] });
    const s = previewShapes(room, [sofa], { size: PREVIEW_PX, pad: 4 });
    expect(PREVIEW_PX).toBe(96);
    expect(s.outline).toHaveLength(4);
    // 가로가 긴 방이므로 가로가 (96 − 8)을 채우고 세로는 그 비율만큼만 쓴다.
    const xs = s.outline.map(p => p[0]), ys = s.outline.map(p => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(4, 6);
    expect(Math.max(...xs)).toBeCloseTo(92, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo((88 * 3000.25) / 4000.5, 6);
    // 제품 하나가 방 가운데에 있다.
    expect(s.boxes).toHaveLength(1);
    expect(s.boxes[0].x + s.boxes[0].w / 2).toBeCloseTo(48, 1);
    expect(s.boxes[0].w).toBeGreaterThan(0);
    expect(s.boxes[0].color).toBe(sofa.color);
  });

  test('방이 없거나 폴리곤이 비면 빈 결과다(그리기는 조용히 지나간다)', () => {
    expect(previewShapes(null, [])).toEqual({ outline: [], boxes: [] });
    expect(previewShapes({ points: [] }, [])).toEqual({ outline: [], boxes: [] });
    expect(() => drawPreview(null, { outline: [], boxes: [] })).not.toThrow();
    expect(() => drawPreview({ getContext: () => null }, { outline: [], boxes: [] })).not.toThrow();
  });
});

// §16.12(감사 §48): 시작 화면 카드가 어떤 도면인지 열어야 알았다.
test('projectShapes는 층 전체(방 여러 개 + 제품)를 한 상자에 담는다', () => {
  const floor = {
    walls: [{ id: 'w1', a: [0, 0], b: [4000.5, 0], thickness: 200 }, { id: 'w2', a: [0, 6000.25], b: [4000.5, 6000.25], thickness: 200 }],
    rooms: [{ id: 'r1', points: [[0, 0], [4000.5, 0], [4000.5, 3000], [0, 3000]] }, { id: 'r2', points: [[0, 3000], [4000.5, 3000], [4000.5, 6000.25], [0, 6000.25]] }],
    items: [createItem(productById('sofa-3'), { pos: [2000.5, 1500.25] })],
  };
  const s = projectShapes(floor, { size: PREVIEW_PX, pad: 4 });
  expect(s.rooms).toHaveLength(2);
  expect(s.boxes).toHaveLength(1);
  // 세로가 긴 도면이므로 세로가 (96 − 8)을 채운다.
  const ys = s.rooms.flat().map(p => p[1]);
  expect(Math.min(...ys)).toBeCloseTo(4, 6);
  expect(Math.max(...ys)).toBeCloseTo(92, 6);
  expect(projectShapes({ walls: [], rooms: [], items: [] })).toEqual({ outline: [], rooms: [], boxes: [] });
  expect(projectShapes(null)).toEqual({ outline: [], rooms: [], boxes: [] });
});
