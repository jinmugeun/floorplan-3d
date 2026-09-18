import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { roomInnerPolygon, pointInPolygon } from '../src/geom/rooms.js';
import { ROOM_TEMPLATES, templateById, placeTemplate, applyRoomTemplate, filterTemplates, itemsInRoom } from '../src/templates/roomTemplates.js';

function setup() {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0.5, 0.25], [6000.5, 4000.25], 200));
  return { store, floor: () => activeFloor(store.get()), room: () => activeFloor(store.get()).rooms[0] };
}

describe('방 템플릿 데이터', () => {
  test('16개 이상이고 공간 타입마다 2개 이상이며 id가 겹치지 않는다', () => {
    expect(ROOM_TEMPLATES.length).toBeGreaterThanOrEqual(16);
    expect(new Set(ROOM_TEMPLATES.map(t => t.id)).size).toBe(ROOM_TEMPLATES.length);
    for (const type of ['cook', 'prep', 'wash', 'dining', 'storage', 'office']) {
      expect(ROOM_TEMPLATES.filter(t => t.roomType === type).length, type).toBeGreaterThanOrEqual(2);
    }
  });

  test('모든 템플릿의 제품·비율·용도·면적·예산이 규칙 안에 있다', () => {
    for (const t of ROOM_TEMPLATES) {
      expect(['주거', '상업'], t.id).toContain(t.use);
      expect(t.minArea, t.id).toBeGreaterThan(0);
      expect(t.maxArea, t.id).toBeGreaterThan(t.minArea);
      expect(t.budget, t.id).toBeGreaterThan(0);
      expect(t.items.length, t.id).toBeGreaterThanOrEqual(3);
      for (const it of t.items) {
        expect(productById(it.productId), `${t.id}/${it.productId}`).toBeTruthy();
        for (const v of it.at) { expect(v, t.id).toBeGreaterThanOrEqual(0); expect(v, t.id).toBeLessThanOrEqual(1); }
        expect(typeof it.rot, t.id).toBe('number');
      }
    }
    expect(templateById('cook-basic').roomType).toBe('cook');
    expect(templateById('없음')).toBeNull();
  });

  test('filterTemplates는 타입·용도·면적·예산으로 좁힌다', () => {
    const all = ROOM_TEMPLATES;
    expect(filterTemplates(all, { roomType: 'cook' }).every(t => t.roomType === 'cook')).toBe(true);
    expect(filterTemplates(all, { use: '주거' }).every(t => t.use === '주거')).toBe(true);
    expect(filterTemplates(all, { budget: 1000000 }).every(t => t.budget <= 1000000)).toBe(true);
    // 면적 범위는 겹치는 것만 남긴다
    const band = filterTemplates(all, { minArea: 10, maxArea: 12 });
    expect(band.every(t => t.minArea <= 12 && t.maxArea >= 10)).toBe(true);
    expect(filterTemplates(all, {})).toHaveLength(all.length);
  });
});

describe('템플릿 배치', () => {
  test('bbox 비율이 방 안 좌표가 되고 모두 방 안쪽에 들어간다(소수 좌표 방)', () => {
    const a = setup();
    const made = placeTemplate(a.floor(), a.room(), templateById('cook-basic'));
    expect(made.length).toBeGreaterThanOrEqual(3);
    const inner = roomInnerPolygon(a.room(), a.floor().walls);
    for (const it of made) {
      if (it.attach === 'wall') { expect(it.wallId, it.productId).toBeTruthy(); continue; }
      expect(pointInPolygon(it.pos, inner), it.productId).toBe(true);
    }
    expect(made.every(it => typeof it.id === 'string')).toBe(true);
  });

  test('벽 부착 제품은 그 방 벽에 붙고, 천장 제품은 방 높이에서 내려온다', () => {
    const a = setup();
    const made = placeTemplate(a.floor(), a.room(), templateById('cook-basic'));
    const hood = made.find(it => it.productId === 'hood-wall');
    expect(hood.attach).toBe('wall');
    expect(a.room().wallIds).toContain(hood.wallId);
    expect(hood.t).toBeGreaterThanOrEqual(0);
    expect(hood.t).toBeLessThanOrEqual(1);
    const lamp = placeTemplate(a.floor(), a.room(), templateById('dining-basic')).find(it => it.attach === 'ceiling');
    expect(lamp.z).toBeCloseTo(a.room().height - lamp.size[2]);
  });

  test('방 밖으로 떨어지는 항목은 빠진다', () => {
    const a = setup();
    const t = { id: 'x', name: 'x', roomType: 'none', use: '주거', minArea: 1, maxArea: 999, budget: 1, items: [{ productId: 'sofa-3', at: [1, 1], rot: 0 }, { productId: 'sofa-3', at: [0.5, 0.5], rot: 0 }] };
    const made = placeTemplate(a.floor(), a.room(), t);
    expect(made).toHaveLength(1);                     // bbox 꼭짓점은 방 안쪽 폴리곤 밖이다
    expect(Math.abs(made[0].pos[0] - 3000.5)).toBeLessThan(2); // 방 안쪽 bbox의 가운데(반올림 포함)
  });

  test('applyRoomTemplate은 한 단계로 적용되고 replace가 방 안 가구만 지운다', () => {
    const a = setup();
    const keepDoor = addItem(a.store, createItem(productById('door-swing-900'), { pos: [2000, 0.25], wallId: a.room().wallIds[0], t: 0.3 }));
    const lockedSofa = addItem(a.store, createItem(productById('sofa-2'), { pos: [4500, 3000], locked: true }));
    const oldSofa = addItem(a.store, createItem(productById('sofa-3'), { pos: [3000, 2000] }));
    const ids = applyRoomTemplate(a.store, a.room().id, 'cook-basic');
    expect(ids.length).toBeGreaterThanOrEqual(3);
    const items = a.floor().items;
    expect(items.some(i => i.id === oldSofa)).toBe(false);     // 기존 가구는 대체된다
    expect(items.some(i => i.id === keepDoor)).toBe(true);     // 문은 남는다
    expect(items.some(i => i.id === lockedSofa)).toBe(true);   // 잠긴 제품도 남는다(I-19)
    expect(items.filter(i => ids.includes(i.id))).toHaveLength(ids.length);
    // 벽 부착 제품은 dispatch 끝의 reattach로 pos가 (wallId, t)에서 다시 만들어진다.
    const hood = items.find(i => i.productId === 'hood-wall');
    expect(hood.wallId).toBeTruthy();
    expect(hood.pos.every(v => Number.isInteger(v))).toBe(true);
    a.store.undo();
    expect(a.floor().items.some(i => i.id === oldSofa)).toBe(true);
    const added = applyRoomTemplate(a.store, a.room().id, 'cook-basic', { replace: false });
    expect(a.floor().items.some(i => i.id === oldSofa)).toBe(true);
    expect(added.length).toBeGreaterThanOrEqual(3);
    expect(applyRoomTemplate(a.store, '없음', 'cook-basic')).toEqual([]);
    expect(applyRoomTemplate(a.store, a.room().id, '없음')).toEqual([]);
  });

  test('itemsInRoom은 방 안 아이템과 그 방 벽에 붙은 아이템을 찾는다', () => {
    const a = setup();
    const inside = addItem(a.store, createItem(productById('sofa-3'), { pos: [3000.5, 2000.25] }));
    const outside = addItem(a.store, createItem(productById('sofa-3'), { pos: [99000, 99000] }));
    const onWall = addItem(a.store, createItem(productById('tv-55'), { pos: [2000, 150], wallId: a.room().wallIds[0], t: 0.3 }));
    const found = itemsInRoom(a.floor(), a.room()).map(i => i.id);
    expect(found).toContain(inside);
    expect(found).toContain(onWall);
    expect(found).not.toContain(outside);
  });
});
