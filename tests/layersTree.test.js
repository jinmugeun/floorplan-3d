// §16.3: 트리 HTML은 문자열 모듈이 만든다 — 방 노드 접기·꼬리표·숨김 줄·선택 강조를
// DOM 배선 없이 직접 단정할 수 있다.
import { describe, test, expect } from 'vitest';
import { createItem } from '../src/state/schema.js';
import { productById } from '../src/products/catalog.js';
import { layerTreeHtml, itemTag, HIDDEN_LINE, BTN_TITLES, ALL_SHOW, ALL_HIDE } from '../src/ui/layersTree.js';

const hood = no => createItem(productById('hood-box'), { pos: [1000.5, 1000.25], props: { no } });
const sofa = () => createItem(productById('sofa-3'), { pos: [2000.5, 2000.25] });
const room = (id, name, area) => ({ id, name, area, points: [[0, 0], [4000.5, 0], [4000.5, 3000.25], [0, 3000.25]] });
const ctx = { units: 'mm', pyeong: false, showHidden: true, selectedIds: new Set(), renaming: null, openState: new Map() };

describe('레이어 트리 HTML', () => {
  test('방 노드는 details이고 개수를 적는다. 빈 방은 접힌 채다', () => {
    const html = layerTreeHtml([
      { room: room('r1', '가열조리실', 18.2), items: [sofa()], ducts: [] },
      { room: room('r2', '부식창고', 5.4), items: [], ducts: [] },
    ], ctx);
    expect(html).toContain('가열조리실');
    expect(html).toContain('제품 1');
    // 첫 방은 내용이 있어 열려 있고, 빈 방은 닫혀 있다.
    const details = [...html.matchAll(/<details([^>]*)>/g)].map(m => m[1]);
    expect(details[0]).toContain('open');
    expect(details[1]).not.toContain('open');
  });

  test('같은 이름 제품에만 꼬리표가 붙는다(설비는 자기 번호, 그 밖은 순번)', () => {
    expect(itemTag(hood(1), { seq: 1, total: 3 })).toBe('①');
    expect(itemTag(hood(2), { seq: 2, total: 3 })).toBe('②');
    expect(itemTag(sofa(), { seq: 2, total: 2 })).toBe('#2');
    expect(itemTag(sofa(), { seq: 1, total: 1 })).toBe('');      // 하나뿐이면 꼬리표가 없다
    const html = layerTreeHtml([{ room: room('r1', '가열조리실', 18.2), items: [hood(1), hood(2)], ducts: [] }], ctx);
    expect(html).toContain('①');
    expect(html).toContain('②');
  });

  test('행은 한 줄이고 버튼마다 title과 aria-label이 있다', () => {
    const html = layerTreeHtml([{ room: room('r1', '가열조리실', 18.2), items: [sofa()], ducts: [] }], ctx);
    expect(html).toContain(`title="${BTN_TITLES.hide}"`);
    expect(html).toContain(`aria-label="${BTN_TITLES.hide}"`);
    expect(html).toContain(`title="${BTN_TITLES.lock}"`);
    expect(html).toContain(`title="${BTN_TITLES.rename}"`);
    expect(html).not.toContain('<br>');                          // 두 줄짜리 행이 없다
  });

  test('선택된 행에 강조가 붙는다', () => {
    const it = sofa();
    const html = layerTreeHtml([{ room: room('r1', '가열조리실', 18.2), items: [it], ducts: [] }],
      { ...ctx, selectedIds: new Set([it.id]) });
    expect(html).toContain('class="layer-item on"');
    expect(html).toContain('data-sel="1"');
  });

  test('숨김 필터로 사라진 행은 "숨긴 항목 N개" 줄을 남긴다', () => {
    const shown = sofa(), gone = { ...sofa(), hidden: true };
    const html = layerTreeHtml([{ room: room('r1', '가열조리실', 18.2), items: [shown, gone], ducts: [] }],
      { ...ctx, showHidden: false });
    expect(html).toContain(HIDDEN_LINE(1));
    expect(HIDDEN_LINE(3)).toBe('숨긴 항목 3개 — 숨긴 항목 보기');
    expect(ALL_SHOW).toBe('모두 보이기');
    expect(ALL_HIDE).toBe('모두 숨기기');
  });
});
