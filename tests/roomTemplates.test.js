import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { rectWalls, makeWall } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { roomInnerPolygon, pointInPolygon, centroid } from '../src/geom/rooms.js';
import { nearestWallPlacement } from '../src/geom/items.js';
import { collidingIds } from '../src/geom/collide.js';
import { ROOM_TEMPLATES, templateById, placeTemplate, applyRoomTemplate, filterTemplates, itemsInRoom } from '../src/templates/roomTemplates.js';

// 좌표는 일부러 소수로 둔다(격자에 기대지 않는지 보려고).
function setup(w = 6000.5, h = 4000.25) {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0.5, 0.25], [w, h], 200));
  return { store, floor: () => activeFloor(store.get()), room: () => activeFloor(store.get()).rooms[0] };
}
// 안쪽 면적이 area m²이고 가로:세로 = ratio인 직사각형 방.
function rectRoom(area, ratio = 1.5) {
  const w = Math.sqrt(area * 1e6 * ratio);
  const a = setup(w + 200.5, w / ratio + 200.25);
  return { ...a, floor: a.floor(), room: a.room() };
}

describe('방 템플릿 데이터', () => {
  test('16개 이상이고 공간 타입마다 2개 이상이며 id가 겹치지 않는다', () => {
    expect(ROOM_TEMPLATES.length).toBeGreaterThanOrEqual(16);
    expect(new Set(ROOM_TEMPLATES.map(t => t.id)).size).toBe(ROOM_TEMPLATES.length);
    for (const type of ['cook', 'prep', 'wash', 'dining', 'storage', 'office']) {
      expect(ROOM_TEMPLATES.filter(t => t.roomType === type).length, type).toBeGreaterThanOrEqual(2);
    }
  });

  test('모든 템플릿의 제품·비율·오프셋·용도·면적·예산이 규칙 안에 있다', () => {
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
        expect(it.offset, t.id).toHaveLength(2);                     // 앵커에서 mm로 재는 절대 오프셋
        for (const v of it.offset) expect(Number.isFinite(v), t.id).toBe(true);
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

  // C2: at 비율만 쓰면 제품 치수가 고정이라 작은 방에서 반드시 파고든다.
  // 묶음은 offset(mm)으로 붙여 두고, 그래도 겹치면 배치 루틴이 밀어내거나 생략한다.
  test('16개 템플릿 모두 선언 면적대(최소·중간·최대)에서 바닥 제품이 겹치지 않는다', () => {
    for (const t of ROOM_TEMPLATES) {
      for (const area of [t.minArea, (t.minArea + t.maxArea) / 2, t.maxArea]) {
        const r = rectRoom(area);
        const made = placeTemplate(r.floor, r.room, t);
        const label = `${t.id} @ ${area}m²`;
        expect([...collidingIds(made)], label).toEqual([]);
        expect(made.length, label).toBe(t.items.length);   // 이 면적대에서는 생략되는 제품이 없다
      }
    }
  });

  test('식탁 의자는 방이 커져도 식탁에서 멀어지지 않는다(offset은 mm)', () => {
    const gap = area => {
      const r = rectRoom(area);
      const made = placeTemplate(r.floor, r.room, templateById('dining-basic'));
      const table = made.find(i => i.productId === 'dining-4');
      const chair = made.find(i => i.productId === 'chair-dining');
      return Math.hypot(chair.pos[0] - table.pos[0], chair.pos[1] - table.pos[1]);
    };
    expect(gap(25)).toBeCloseTo(gap(8), 0);
  });

  // I3: 벽 탐색 거리가 방 bbox 전체면 몇 미터 떨어진 엉뚱한 벽에 조용히 붙는다.
  test('벽 제품은 1500 mm 안에 벽이 있을 때만 앉는다', () => {
    const a = setup(12000.5, 9000.25);
    const far = { id: 'x', name: 'x', roomType: 'none', use: '주거', minArea: 1, maxArea: 999, budget: 1,
      items: [{ productId: 'tv-55', at: [0.5, 0.5], rot: 0 }, { productId: 'tv-55', at: [0.5, 0.02], rot: 0 }] };
    const made = placeTemplate(a.floor(), a.room(), far);
    expect(made).toHaveLength(1);              // 방 한가운데 TV는 붙일 벽이 상한 안에 없어 생략된다
    expect(made[0].wallId).toBeTruthy();
    // 상한을 두어도 지금 템플릿의 벽 제품은 가장 큰 방에서도 모두 살아남는다
    const big = rectRoom(90);
    expect(placeTemplate(big.floor, big.room, templateById('cook-large')).find(i => i.productId === 'hood-wall').wallId).toBeTruthy();
  });

  test('남아 있는 가구(잠긴 제품) 위에는 놓지 않는다', () => {
    const a = setup();
    const locked = createItem(productById('sofa-3'), { pos: [3000, 2000], locked: true });
    const made = placeTemplate(a.floor(), a.room(), templateById('dining-basic'), { avoid: [locked] });
    expect([...collidingIds([locked, ...made])]).toEqual([]);
  });

  test('applyRoomTemplate은 한 단계로 적용되고 replace가 방 안 가구만 지운다', () => {
    const a = setup();
    const keepDoor = addItem(a.store, createItem(productById('door-swing-900'), { pos: [2000, 0.25], wallId: a.room().wallIds[0], t: 0.3 }));
    const lockedSofa = addItem(a.store, createItem(productById('sofa-2'), { pos: [4500, 3000], locked: true }));
    const oldSofa = addItem(a.store, createItem(productById('sofa-3'), { pos: [3000, 2000] }));
    const { placed, skipped } = applyRoomTemplate(a.store, a.room().id, 'cook-basic');
    expect(placed.length).toBeGreaterThanOrEqual(3);
    expect(placed.length + skipped).toBe(templateById('cook-basic').items.length);
    const items = a.floor().items;
    expect(items.some(i => i.id === oldSofa)).toBe(false);     // 기존 가구는 대체된다
    expect(items.some(i => i.id === keepDoor)).toBe(true);     // 문은 남는다
    expect(items.some(i => i.id === lockedSofa)).toBe(true);   // 잠긴 제품도 남는다(I-19)
    expect(items.filter(i => placed.includes(i.id))).toHaveLength(placed.length);
    // 벽 부착 제품은 dispatch 끝의 reattach로 pos가 (wallId, t)에서 다시 만들어진다.
    const hood = items.find(i => i.productId === 'hood-wall');
    expect(hood.wallId).toBeTruthy();
    expect(hood.pos.every(v => Number.isInteger(v))).toBe(true);
    a.store.undo();
    expect(a.floor().items.some(i => i.id === oldSofa)).toBe(true);
    const added = applyRoomTemplate(a.store, a.room().id, 'cook-basic', { replace: false });
    expect(a.floor().items.some(i => i.id === oldSofa)).toBe(true);
    expect(added.placed.length).toBeGreaterThanOrEqual(3);
    expect(applyRoomTemplate(a.store, '없음', 'cook-basic')).toEqual({ placed: [], skipped: 0 });
    expect(applyRoomTemplate(a.store, a.room().id, '없음')).toEqual({ placed: [], skipped: 0 });
  });

  // I1: reattach만으로는 자리 다툼이 풀리지 않는다 — seatCopies(freeT)를 지나야 한다.
  test('벽 제품이 남겨 둔 문과 같은 t에 앉지 않고, 두 번 적용해도 쌓이지 않는다', () => {
    const a = setup();
    const probe = placeTemplate(a.floor(), a.room(), templateById('cook-basic')).find(i => i.productId === 'hood-wall');
    const doorId = addItem(a.store, createItem(productById('door-swing-900'), { pos: [...probe.pos], wallId: probe.wallId, t: probe.t }));
    applyRoomTemplate(a.store, a.room().id, 'cook-basic');
    const door = a.floor().items.find(i => i.id === doorId);
    const hood = a.floor().items.find(i => i.productId === 'hood-wall');
    expect(door).toBeTruthy();
    expect(hood.wallId).toBe(door.wallId);
    expect(Math.abs(hood.t - door.t)).toBeGreaterThan(0.001);   // 문 자리를 비켜 앉았다

    const second = applyRoomTemplate(a.store, a.room().id, 'cook-basic', { replace: false });
    const hoods = a.floor().items.filter(i => i.productId === 'hood-wall');
    expect(hoods).toHaveLength(2);
    expect(Math.abs(hoods[0].t - hoods[1].t)).toBeGreaterThan(0.001);   // 같은 t에 쌓이지 않는다
    expect([...collidingIds(a.floor().items)]).toEqual([]);             // 바닥 제품도 겹치지 않는다
    expect(second.placed.length).toBeGreaterThanOrEqual(3);
  });

  // I2: 자리가 없어 빠지는 제품이 있으면 개수로 알 수 있어야 한다(대화상자가 토스트로 보여 준다).
  test('좁은 방에서는 일부만 놓이고 생략 개수를 돌려준다', () => {
    const a = setup(1600.5, 1200.25);
    const t = templateById('cook-basic');
    const { placed, skipped } = applyRoomTemplate(a.store, a.room().id, t.id);
    expect(skipped).toBeGreaterThan(0);
    expect(placed.length + skipped).toBe(t.items.length);
    expect([...collidingIds(a.floor().items)]).toEqual([]);
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

  // C1: 공유벽은 양쪽 방의 wallIds에 다 들어 있다. wallId만 보면 이웃 방 가구가 조용히 사라진다.
  test('공유벽 건너편 이웃 방의 벽 가구는 replace가 지우지 않는다', () => {
    const store = createStore(createEmptyProject());
    addWalls(store, rectWalls([0.5, 0.25], [8000.5, 4000.25], 200));
    addWalls(store, [makeWall({ a: [4000.5, 0.25], b: [4000.5, 4000.25], thickness: 200 })]);
    const f0 = activeFloor(store.get());
    expect(f0.rooms).toHaveLength(2);
    const byX = [...f0.rooms].sort((r, s) => centroid(r.points)[0] - centroid(s.points)[0]);
    const [left, right] = byX;
    const shared = left.wallIds.find(id => right.wallIds.includes(id));
    expect(shared).toBeTruthy();
    // 오른쪽 방 쪽 벽면에 건 TV
    const wall = f0.walls.find(w => w.id === shared);
    const tv = productById('tv-55');
    const near = nearestWallPlacement([wall], [4400.5, 2000.25], tv.size, 600, { embed: false });
    const tvId = addItem(store, createItem(tv, { pos: [Math.round(near.pos[0]), Math.round(near.pos[1])], wallId: shared, t: near.t, side: near.side, rot: near.rot }));
    const f = activeFloor(store.get());
    expect(itemsInRoom(f, right).map(i => i.id)).toContain(tvId);
    expect(itemsInRoom(f, left).map(i => i.id)).not.toContain(tvId);   // 왼쪽 방 것이 아니다
    applyRoomTemplate(store, left.id, 'cook-basic');
    expect(activeFloor(store.get()).items.some(i => i.id === tvId)).toBe(true);
  });
});
