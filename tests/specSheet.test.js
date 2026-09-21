import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem, updateRoom } from '../src/state/floorOps.js';
import { applyMaterial } from '../src/state/materialOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { specHtml, SPEC_SECTIONS, PAPER } from '../src/io/specSheet.js';
import { roomAirflow } from '../src/vent/airflow.js';

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
