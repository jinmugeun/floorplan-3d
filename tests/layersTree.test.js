// §16.3: 트리 HTML은 문자열 모듈이 만든다 — 방 노드 접기·꼬리표·숨김 줄·선택 강조를
// DOM 배선 없이 직접 단정할 수 있다.
import { describe, test, expect } from 'vitest';
import { createItem } from '../src/state/schema.js';
import { productById, fmtSize } from '../src/products/catalog.js';
import { layerTreeHtml, itemTag, HIDDEN_LINE, BTN_TITLES, ALL_SHOW, ALL_HIDE, layerRowTitle, LAYERS_EMPTY, ALL_SHOW_TITLE, ALL_HIDE_TITLE } from '../src/ui/layersTree.js';
import { LAYERS_NO_MATCH } from '../src/ui/messages.js';

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

  // §17.6(감사 §33·§49): 잘린 이름을 마우스로 확인할 길이 없었다. 코드·크기는 좁은 패널에서
  // 숨을 수 있게 제 클래스를 갖는다(#panel.narrow .layer-code).
  test('행 이름 버튼에 전체 이름·코드·크기 title이 붙고 코드는 layer-code다', () => {
    const p = productById('hood-box');
    const html = layerTreeHtml([{ room: room('r1', '가열조리실', 18.2), items: [hood(1)], ducts: [] }], ctx);
    expect(html).toContain(`title="${p.name} · ${p.code} ${fmtSize(p.size)}"`);
    expect(html).toContain('class="muted layer-code"');
    expect(layerRowTitle('상자형 후드', 'VH-BX', '1600×1200×600')).toBe('상자형 후드 · VH-BX 1600×1200×600');
    expect(layerRowTitle('덕트 급기 EA-1', '', '12400')).toBe('덕트 급기 EA-1 · 12400');   // §17.6(1)의 예시 표기
    expect(layerRowTitle('이름만', '', '')).toBe('이름만');
    // 덕트 행: 보이는 글자는 `덕트 배기 · EA-1`이고 툴팁은 §17.6(1)의 `덕트 배기 EA-1 · 길이`다(M-1).
    // 그리고 이스케이프는 한 번만 한다(M-2): 계통 이름의 `&`가 `&amp;`로 한 번만 바뀐다.
    const dh = layerTreeHtml([{ room: null, items: [], ducts: [{ id: 'd1', kind: 'exhaust', system: 'A&B', hidden: false, locked: false, points: [[0, 0], [12400, 0]], segments: [{ w: 500, h: 300, z: 2900 }], dampers: [], connections: [] }] }], ctx);
    expect(dh).toContain('>덕트 배기 · A&amp;B<');
    expect(dh).toContain('title="덕트 배기 A&amp;B · 12400"');
    expect(dh).not.toContain('&amp;amp;');
  });

  // §17.6: 큰 도면은 접힌 채 연다(탭 스톱 2,000개 → 방 수 수준). 사용자 토글은 그대로 이긴다.
  test('autoCollapse면 내용이 있는 방도 접힌 채 열리고 openState가 이긴다', () => {
    const b = [{ room: room('r1', '가열조리실', 18.2), items: [sofa()], ducts: [] }];
    expect(layerTreeHtml(b, ctx)).toContain('<details data-room="r1" open>');
    expect(layerTreeHtml(b, { ...ctx, autoCollapse: true })).toContain('<details data-room="r1">');
    expect(layerTreeHtml(b, { ...ctx, autoCollapse: true, openState: new Map([['r1', true]]) })).toContain('<details data-room="r1" open>');
  });
});

// 리뷰 M-6: 번호는 숨김 필터 **전** 목록에서 매긴다 — 그려진 행에서만 세면 앞의 것을 숨기는
// 순간 남은 #2가 #1이 되어 같은 물건의 꼬리표가 바뀐다(사용자에게 보이는 오정보).
const tags = html => [...html.matchAll(/layer-tag">([^<]*)</g)].map(m => m[1]);
test('꼬리표 번호가 숨김 필터에 흔들리지 않는다(리뷰 M-6)', () => {
  const a = sofa(), b = { ...sofa(), hidden: true }, c = sofa();
  const bucket = () => [{ room: room('r1', '가열조리실', 18.2), items: [a, b, c], ducts: [] }];
  expect(tags(layerTreeHtml(bucket(), ctx))).toEqual(['#1', '#2', '#3']);
  expect(tags(layerTreeHtml(bucket(), { ...ctx, showHidden: false }))).toEqual(['#1', '#3']);   // 예전에는 ['#1','#2']
  // 방이 갈려도 트리 전체에서 한 번호다(숨김 필터 앞의 순서 그대로).
  const split = layerTreeHtml([
    { room: room('r1', '가열조리실', 18.2), items: [a, b], ducts: [] },
    { room: room('r2', '부식창고', 5.4), items: [c], ducts: [] },
  ], { ...ctx, showHidden: false });
  expect(tags(split)).toEqual(['#1', '#3']);
});

// §17.11(3) · 감사 §46: 빈 도면의 레이어 패널이 아무 말도 하지 않았다(풍량 패널은 빈 상태 문구 3종).
test('버킷이 비면 빈 상태 문구를 그린다', () => {
  expect(LAYERS_EMPTY).toBe('이 층에는 제품·덕트가 없습니다');
  expect(ALL_SHOW_TITLE).toBe('숨긴 제품·덕트를 모두 보이게');
  expect(ALL_HIDE_TITLE).toBe('제품·덕트를 모두 숨기기');
  expect(layerTreeHtml([], ctx)).toContain(LAYERS_EMPTY);
  expect(layerTreeHtml([], ctx)).toContain('class="hint"');
  // 방은 있는데 제품·덕트가 하나도 없는 층도 빈 상태다(헤더만 남은 트리를 보여 주지 않는다).
  expect(layerTreeHtml([{ room: room('r1', '창고', 5.4), items: [], ducts: [] }], ctx)).toContain(LAYERS_EMPTY);
  expect(layerTreeHtml([{ room: room('r1', '창고', 5.4), items: [sofa()], ducts: [] }], ctx)).not.toContain(LAYERS_EMPTY);
});

// 리뷰 I-1: 검색이 아무것도 맞히지 못한 것과 층이 빈 것은 다른 사실이다 — 거른 결과만 보고
// "이 층에는 제품·덕트가 없습니다"라고 하면 거짓말이고, 검색 중이라는 신호까지 사라진다.
test('검색 0건은 빈 층이 아니라 검색 결과 없음이다(리뷰 I-1)', () => {
  expect(LAYERS_NO_MATCH).toBe('검색 결과가 없습니다');
  const empty = layerTreeHtml([], { ...ctx, query: '' });
  expect(empty).toContain(LAYERS_EMPTY);
  expect(empty).not.toContain(LAYERS_NO_MATCH);
  // filterBuckets가 아무것도 남기지 않은 화면(= 검색 중)에서는 다른 말을 한다.
  const noMatch = layerTreeHtml([], { ...ctx, query: 'zzz없는검색어' });
  expect(noMatch).toContain(LAYERS_NO_MATCH);
  expect(noMatch).not.toContain(LAYERS_EMPTY);
  expect(noMatch).toContain('class="hint"');
  // 공백만 친 질의는 검색이 아니다(layersPanel의 query.trim()과 같은 규칙).
  expect(layerTreeHtml([], { ...ctx, query: '   ' })).toContain(LAYERS_EMPTY);
  // 맞힌 행이 있으면 두 문구 중 어느 것도 나오지 않는다(트리 그대로다).
  const hit = layerTreeHtml([{ room: room('r1', '창고', 5.4), items: [sofa()], ducts: [] }], { ...ctx, query: '소파' });
  expect(hit).toContain('layer-tree');
  expect(hit).not.toContain(LAYERS_NO_MATCH);
});
