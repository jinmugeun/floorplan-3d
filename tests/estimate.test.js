import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem, updateRoom } from '../src/state/floorOps.js';
import { applyMaterial, setWallRegions } from '../src/state/materialOps.js';
import { rectWalls, wallLength } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { materialById } from '../src/materials/catalog.js';
import { estimateRows, estimateCsv } from '../src/io/estimate.js';

function setup() {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  return { store, floor: () => activeFloor(store.get()) };
}
const mat = id => ({ id, offset: [0, 0], angle: 0 });

describe('견적서 계산', () => {
  test('같은 제품은 수량으로 묶이고 금액이 단가 × 수량이다', () => {
    const a = setup();
    addItem(a.store, createItem(productById('chair-dining'), { pos: [1000, 1000] }));
    addItem(a.store, createItem(productById('chair-dining'), { pos: [1500, 1000] }));
    addItem(a.store, createItem(productById('dining-4'), { pos: [2000.5, 1500.25] }));
    const rows = estimateRows(a.floor());
    const chair = rows.products.find(r => r.productId === 'chair-dining');
    expect(chair.qty).toBe(2);
    expect(chair.unitPrice).toBe(productById('chair-dining').price);
    expect(chair.total).toBe(chair.unitPrice * 2);
    expect(chair.size).toBe('450×500×900');
    expect(chair.code).toBe('CH-DN');
    expect(rows.products).toHaveLength(2);
    expect(rows.total).toBe(chair.total + rows.products.find(r => r.productId === 'dining-4').total);
  });

  test('개구부는 제품 목록에 들어가지 않는다', () => {
    const a = setup();
    const wallId = a.floor().walls[0].id;
    addItem(a.store, createItem(productById('opening-pass'), { pos: [2000, 0], wallId, t: 0.5 }));
    addItem(a.store, createItem(productById('door-swing-900'), { pos: [1000, 0], wallId, t: 0.25 }));
    const rows = estimateRows(a.floor());
    expect(rows.products.map(r => r.productId)).toEqual(['door-swing-900']);
  });

  test('재질은 면적으로 합산되고 영역이 덮은 면적은 기본 재질에서 빠진다(소수 좌표)', () => {
    const a = setup();
    // 길이로 벽을 고른다(정규화가 순서를 바꿔도 같은 벽을 잡는다).
    const w = a.floor().walls.find(x => Math.abs(wallLength(x) - 4000.5) < 0.01);
    expect(w.height).toBe(2300);
    applyMaterial(a.store, { kind: 'wall', id: w.id, side: 'in' }, mat('paint-white'));
    setWallRegions(a.store, w.id, 'in', [{ kind: 'band', z0: 0, z1: 1000, mat: mat('tile-white-300') }]);
    const rows = estimateRows(a.floor());
    const tile = rows.materials.find(r => r.id === 'tile-white-300');
    const paint = rows.materials.find(r => r.id === 'paint-white');
    // 리터럴 기대값(프로덕션 공식을 베끼지 않는다 — M-26):
    // 띠 = 4000.5 × 1000 / 1e6 = 4.0005 → round2 4
    // 안쪽 남은 면 = 4000.5 × 2300 / 1e6 − 4.0005 = 5.20065 → round2 5.2
    // 바깥 면은 재질이 없으므로 paint-white는 안쪽 몫만 갖는다
    expect(tile.areaM2).toBe(4);
    expect(paint.areaM2).toBe(5.2);
    expect(tile.unitPrice).toBe(42000);                      // materialById('tile-white-300').pricePerM2
    expect(tile.total).toBe(4 * 42000);
    expect(paint.total).toBe(Math.round(5.2 * 12000));
    expect(materialById('tile-white-300').pricePerM2).toBe(42000); // 카탈로그 단가가 바뀌면 여기서 걸린다
  });

  test('바닥·천장 재질은 방 면적을 쓰고, 천장을 감추면 세지 않는다', () => {
    const a = setup();
    const roomId = a.floor().rooms[0].id;
    applyMaterial(a.store, { kind: 'floor', id: roomId }, mat('wood-oak'));
    applyMaterial(a.store, { kind: 'ceiling', id: roomId }, mat('paint-white'));
    let rows = estimateRows(a.floor());
    expect(rows.materials.find(r => r.id === 'wood-oak').areaM2).toBeCloseTo(Math.round(a.floor().rooms[0].area * 100) / 100, 2);
    expect(rows.materials.find(r => r.id === 'paint-white')).toBeTruthy();
    updateRoom(a.store, roomId, { hideCeiling: true });
    rows = estimateRows(a.floor());
    expect(rows.materials.find(r => r.id === 'paint-white')).toBeUndefined();
  });

  test('빈 층은 빈 견적이 된다', () => {
    const rows = estimateRows({ items: [], walls: [], rooms: [] });
    expect(rows).toEqual({ products: [], materials: [], total: 0 });
  });

  test('CSV는 BOM으로 시작하고 두 구역과 합계를 담는다', () => {
    const a = setup();
    addItem(a.store, createItem(productById('sofa-3'), { pos: [2000, 1500] }));
    applyMaterial(a.store, { kind: 'floor', id: a.floor().rooms[0].id }, mat('wood-oak'));
    const csv = estimateCsv(estimateRows(a.floor()));
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('구분,이름,코드,규격,수량,단가,금액');
    expect(csv).toContain('제품,3인 소파,SF-3P,2100×900×800,1,890000,890000');
    expect(csv).toContain('마감재,오크 원목마루');
    expect(lines.at(-1).startsWith('합계')).toBe(true);
  });
});
