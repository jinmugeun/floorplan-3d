import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem, updateRoom } from '../src/state/floorOps.js';
import { applyMaterial } from '../src/state/materialOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { specHtml, SPEC_SECTIONS, PAPER, AIRFLOW_TITLES, CMH } from '../src/io/specSheet.js';
import { roomAirflow } from '../src/vent/airflow.js';
import { estimateRows } from '../src/io/estimate.js';
import { setItemFlag } from '../src/state/itemOps.js';

function project() {
  const store = createStore(createEmptyProject('강당중 조리실'));
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  const f = activeFloor(store.get());
  updateRoom(store, f.rooms[0].id, { name: '조리실', type: 'cook' });
  applyMaterial(store, { kind: 'floor', id: f.rooms[0].id }, { id: 'tile-white-300', offset: [0, 0], angle: 0 });
  applyMaterial(store, { kind: 'wall', id: f.walls[0].id, side: 'in' }, { id: 'steel-brush', offset: [0, 0], angle: 0 });
  addItem(store, createItem(productById('range-gas-6'), { pos: [1000.5, 800.25] }));
  return store.get();
}

describe('시방서 HTML', () => {
  test('용지 크기와 방향이 @page에 들어간다', () => {
    expect(PAPER.A4).toEqual([210, 297]);
    expect(specHtml({ project: project(), options: { paper: 'A4' } })).toContain('@page { size: 210mm 297mm');
    expect(specHtml({ project: project(), options: { paper: 'A3', landscape: true } })).toContain('@page { size: 420mm 297mm');
    expect(specHtml({ project: project(), options: { paper: '없음' } })).toContain('210mm 297mm'); // 모르는 값은 A4
  });

  test('구역 7개를 끄고 켤 수 있다', () => {
    expect(SPEC_SECTIONS.map(s => s[0])).toEqual(['plan', 'elevations', 'products', 'rooms', 'walls', 'airflow', 'notes']);
    const all = specHtml({ project: project(), images: { plan: 'data:image/png;base64,P', front: 'data:image/png;base64,F' }, options: { notes: '주의: 배기 덕트 간섭 확인' } });
    for (const [, label] of SPEC_SECTIONS) expect(all).toContain(label);
    expect(all).toContain('data:image/png;base64,P');
    expect(all).toContain('data:image/png;base64,F');
    expect(all).toContain('주의: 배기 덕트 간섭 확인');
    const few = specHtml({ project: project(), options: { sections: { plan: false, elevations: false, products: false, walls: false, notes: false } } });
    expect(few).toContain('공간 목록');
    expect(few).not.toContain('제품 목록');
    expect(few).not.toContain('입면도');
  });

  test('공간·벽·제품 표에 실제 값이 들어간다(소수 좌표)', () => {
    const html = specHtml({ project: project() });
    expect(html).toContain('조리실');
    expect(html).toContain('가열조리실');
    expect(html).toContain('업소용 6구 레인지');
    expect(html).toContain('AP-RG06');
    expect(html).toContain('4001');            // 벽 중심선 길이 4000.5 → 반올림 표기
    expect(html).toContain('화이트 타일 300');  // 바닥 마감재
    expect(html).toContain('브러시 스테인리스'); // 내벽 마감재
    expect(html).toContain('m²');
  });

  // 숨긴 것은 세지 않는다 — 견적서(io/estimate.js)·풍량 집계와 같은 규칙이다(§12.5).
  // 한쪽만 숨김을 빼면 같은 도면에서 뽑은 두 산출물이 서로 다른 수량을 말하므로 견적 수량과 함께 단정한다.
  test('숨긴 아이템은 제품 목록에서도 빠진다(견적서와 같은 수량, 소수 좌표)', () => {
    const store = createStore(createEmptyProject('강당중 조리실'));
    addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
    const p = productById('range-gas-6');
    addItem(store, createItem(p, { pos: [1000.5, 800.25] }));
    const second = addItem(store, createItem(p, { pos: [2500.75, 800.75] }));
    // 제품 목록 줄: <td>이름</td><td>코드</td><td>치수</td><td>수량</td>
    const qty = () => /업소용 6구 레인지<\/td>(?:<td>[^<]*<\/td>){2}<td>(\d+)<\/td>/
      .exec(specHtml({ project: store.get() }))?.[1];
    const estQty = () => estimateRows(activeFloor(store.get())).products.find(r => r.code === p.code)?.qty;
    expect([qty(), estQty()]).toEqual(['2', 2]);
    setItemFlag(store, [second], 'hidden', true);
    expect([qty(), estQty()]).toEqual(['1', 1]);   // 두 문서가 같은 수량을 말한다
    setItemFlag(store, [second], 'hidden', false);
    expect([qty(), estQty()]).toEqual(['2', 2]);   // 다시 보이게 하면 둘 다 돌아온다
  });

  test('프로젝트 이름과 층 이름을 머리글에 쓰고 HTML을 이스케이프한다', () => {
    const p = project();
    p.name = '<img src=x onerror="alert(1)">';
    const html = specHtml({ project: p });
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('Floor 1');
  });

  test('빈 프로젝트도 던지지 않는다', () => {
    const html = specHtml({ project: createEmptyProject(), floorIndex: 9 });
    expect(html).toContain('시방서');
    expect(html).toContain('항목이 없습니다');
  });

  test('풍량 집계 구역이 실별·계통별 표를 찍고 끌 수 있다', () => {
    const p = {
      name: '강당중 조리실', units: 'mm', settings: {},
      floors: [{
        name: '1층', height: 2900, walls: [], items: [
          { id: 'h1', kind: 'equipment', pos: [1000, 1000], size: [1800, 1100, 600], z: 2300, props: { type: 'hood', no: 1, faceVelocity: 0.7, cmh: 4990, system: 'F-4' } },
        ],
        rooms: [{ id: 'r1', name: '가열조리실', type: 'cook', points: [[0, 0], [4000.5, 0], [4000.5, 3000], [0, 3000]], area: 12, height: 2900, design: { EA: 5000, SA: 4000 } }],
        ducts: [{ id: 'd1', kind: 'exhaust', system: 'F-4', points: [[1000, 1000], [3000, 1000]], segments: [{ w: 800, h: 500, z: 2600 }], connections: [{ point: 0, itemId: 'h1' }], dampers: [] }],
      }],
    };
    expect(SPEC_SECTIONS.map(s => s[0])).toContain('airflow');
    const html = specHtml({ project: p, floorIndex: 0, images: {}, options: {} });
    expect(html).toContain('풍량 집계');
    expect(html).toContain('가열조리실');
    expect(html).toContain('4,990');
    expect(html).toContain('F-4');
    expect(specHtml({ project: p, floorIndex: 0, images: {}, options: { sections: { airflow: false } } })).not.toContain('풍량 집계');
    expect(roomAirflow(p.floors[0])[0].EA).toBe(4990);
  });
});

// §16.2(감사 §6): 실별 표와 계통별 표가 제목 없이 연달아 붙고 EA·SA 헤더에 CMH가 없었다.
test('풍량 두 표에 제목과 (CMH)가 붙고 미배치 행은 경고색이다', () => {
  const hood = createItem(productById('hood-box'), { pos: [9000.5, 9000.25] });   // 어느 방에도 들지 않는다
  const p = {
    name: '강당중', units: 'mm', settings: {},
    floors: [{
      name: '1층', height: 3500, walls: [], items: [hood], ducts: [],
      rooms: [{ id: 'r1', name: '가열조리실', type: 'cook', points: [[0, 0], [4000.5, 0], [4000.5, 3000], [0, 3000]], area: 12, height: 2900, design: { EA: 5000, SA: 4000 } }],
    }],
  };
  const html = specHtml({ project: p, floorIndex: 0, images: {}, options: {} });
  expect(AIRFLOW_TITLES.room).toBe('실별 풍량');
  expect(AIRFLOW_TITLES.system).toBe('계통별 풍량');
  expect(CMH).toBe('(CMH)');
  expect(html).toContain('<h3>실별 풍량 (CMH)</h3>');
  expect(html).toContain('<h3>계통별 풍량 (CMH)</h3>');
  expect(html).toContain('<tr class="warn"><td>미배치</td>');    // 어느 방에도 들지 않은 설비(감사 §6)
  expect(html).toContain('규격(W×D×H, mm)');                     // 한 문서 안 단위 표기를 한 갈래로
});

// §16.11(감사 §8): 쪽 번호·도면번호·작성자/현장 칸이 없었다.
test('머리글에 도면번호·작성자·현장·쪽 칸이 있다', () => {
  const html = specHtml({ project: project(), options: { sheet: { number: 'M-106', author: '홍길동', site: '강당중학교' } } });
  expect(html).toContain('도면번호');
  expect(html).toContain('M-106');
  expect(html).toContain('작성자');
  expect(html).toContain('홍길동');
  expect(html).toContain('현장');
  expect(html).toContain('강당중학교');
  // 쪽 번호는 인쇄 페이지 여백 상자에서 센다(브라우저가 지원하면 자동, 아니면 브라우저 머리글이 맡는다).
  expect(html).toContain('@bottom-right');
  expect(html).toContain('counter(page)');
  // 값이 없으면 칸은 빈칸으로 남는다(칸 자체는 있어야 손으로 적을 수 있다).
  const blank = specHtml({ project: project(), options: {} });
  expect(blank).toContain('도면번호');
});

test('빈 절은 인쇄에서 빠진다(§16.11 · 감사 §8)', () => {
  // 비고를 비우면 빈 <pre> 상자를 찍지 않는다.
  const noNotes = specHtml({ project: project(), options: { notes: '   ' } });
  expect(noNotes).not.toContain('<pre class="notes"');
  expect(noNotes).not.toContain('비고');
  // 이미지가 없으면 그 절 자체를 빼고 "이미지가 없습니다."도 찍지 않는다.
  const noImg = specHtml({ project: project(), images: {}, options: {} });
  expect(noImg).not.toContain('이미지가 없습니다');
  expect(noImg).not.toContain('평면도');
  expect(noImg).not.toContain('입면도');
  // 이미지가 있으면 그 절만 남는다.
  const onlyPlan = specHtml({ project: project(), images: { plan: 'data:image/png;base64,P' }, options: {} });
  expect(onlyPlan).toContain('평면도');
  expect(onlyPlan).not.toContain('입면도');
});
