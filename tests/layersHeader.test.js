// §17.6(감사 §28·§33): 레이어 패널의 "무엇을 보여 줄지" 규칙은 스토어도 DOM도 모르는 순수 함수다.
import { describe, test, expect } from 'vitest';
import { createItem } from '../src/state/schema.js';
import { productById } from '../src/products/catalog.js';
import { LAYER_SEARCH_PH, COLLAPSE_ALL, EXPAND_ALL, LAYER_AUTO_COLLAPSE_ROWS, LAYER_CODE_HIDE_PX, layersHeaderHtml, matchLayer, filterBuckets, rowCount, autoCollapsed } from '../src/ui/layersHeader.js';

const hood = () => createItem(productById('hood-box'), { pos: [1000.5, 1000.25] });
const sofa = () => createItem(productById('sofa-3'), { pos: [2000.5, 2000.25] });
const duct = (system = 'EA-1') => ({ id: 'd1', kind: 'exhaust', system, points: [[0.5, 0.25], [3000.5, 0.25]], segments: [{ w: 500, h: 300, z: 2900 }] });
const buckets = () => [
  { room: { id: 'r1', name: '가열조리실' }, items: [hood()], ducts: [duct()] },
  { room: { id: 'r2', name: '부식창고' }, items: [sofa()], ducts: [] },
];

describe('레이어 머리 한 줄', () => {
  test('matchLayer는 대소문자를 무시한 부분 일치이고 빈 질의는 모두 통과다', () => {
    expect(matchLayer('상자형 후드 VH-BX', '후드')).toBe(true);
    expect(matchLayer('상자형 후드 VH-BX', 'vh-bx')).toBe(true);
    expect(matchLayer('상자형 후드 VH-BX', '  ')).toBe(true);
    expect(matchLayer('상자형 후드 VH-BX', '디퓨저')).toBe(false);
    expect(matchLayer(null, '후드')).toBe(false);
  });

  test('filterBuckets는 이름·코드·계통으로 거르고 빈 방 노드는 뺀다', () => {
    const all = buckets();
    expect(filterBuckets(all, '')).toBe(all);                 // 빈 질의는 그대로 돌려준다(복사도 하지 않는다)
    const hoods = filterBuckets(all, '후드');
    expect(hoods).toHaveLength(1);
    expect(hoods[0].room.name).toBe('가열조리실');
    expect(hoods[0].items).toHaveLength(1);
    expect(hoods[0].ducts).toHaveLength(0);
    expect(filterBuckets(all, 'EA-1')).toHaveLength(1);       // 덕트는 급배기·계통으로 걸린다
    expect(filterBuckets(all, 'VH-BX')).toHaveLength(1);      // 코드로도 걸린다
    expect(filterBuckets(all, '없는것')).toEqual([]);
  });

  test('행이 30개를 넘으면 방 노드는 접힌 채 연다', () => {
    expect(LAYER_AUTO_COLLAPSE_ROWS).toBe(30);
    expect(LAYER_CODE_HIDE_PX).toBe(280);
    expect(rowCount(buckets())).toBe(3);
    expect(autoCollapsed(30)).toBe(false);
    expect(autoCollapsed(31)).toBe(true);
  });

  test('머리 한 줄은 검색 칸과 접기 버튼이고 라벨이 상태를 따른다', () => {
    const open = layersHeaderHtml({ query: '후드', anyOpen: true });
    expect(open).toContain(`placeholder="${LAYER_SEARCH_PH}"`);
    expect(open).toContain('name="q"');
    expect(open).toContain('aria-label="레이어 검색"');
    expect(open).toContain('value="후드"');
    expect(open).toContain(`>${COLLAPSE_ALL}<`);
    expect(layersHeaderHtml({ anyOpen: false })).toContain(`>${EXPAND_ALL}<`);
    expect(layersHeaderHtml({ anyOpen: false })).toContain(`title="${EXPAND_ALL}"`);
  });
});
