import { describe, test, expect } from 'vitest';
import { buildItems, itemMesh, itemVisible3 } from '../src/view3d/items3d.js';
import { createItem } from '../src/state/schema.js';
import { productById } from '../src/products/catalog.js';
import { RAD } from '../src/geom/items.js';
import { collidingIds } from '../src/geom/collide.js';

const mk = (id, patch) => createItem(productById(id), patch);
const floor = items => ({ walls: [], rooms: [], items, height: 2300 });

describe('3D 아이템', () => {
  test('바닥 제품은 z + 높이/2에 중심이 오고 rot은 -Y 회전이다(소수 좌표)', () => {
    const m = itemMesh(mk('fridge-2door', { pos: [1000.5, 2000.25], rot: 90 }));
    expect(m.position.x).toBeCloseTo(1.0005);
    expect(m.position.z).toBeCloseTo(2.00025);
    expect(m.position.y).toBeCloseTo(0.9);
    expect(m.rotation.y).toBeCloseTo(-RAD(90));
    expect(m.userData.itemId).toBeTruthy();
    expect(m.name).toBe('item');
  });

  test('천장 제품은 z 그대로 매달리고 바닥에서 z + 높이가 층 높이가 된다', () => {
    const it = mk('light-pendant', { pos: [0, 0] });
    it.z = 2300 - it.size[2];
    const m = itemMesh(it);
    expect(m.position.y).toBeCloseTo((it.z + it.size[2] / 2) / 1000);
    expect((it.z + it.size[2]) / 1000).toBeCloseTo(2.3);
  });

  test('원형 기둥은 실린더, 사각 기둥은 박스, 개구부는 메시가 없다', () => {
    expect(itemMesh(mk('column-round', { pos: [0, 0] })).geometry.type).toBe('CylinderGeometry');
    expect(itemMesh(mk('column-square', { pos: [0, 0] })).geometry.type).toBe('BoxGeometry');
    expect(itemMesh(mk('opening-pass', { pos: [0, 0] }))).toBeNull();
  });

  test('원형 기둥은 새 심벌 이름으로도 원기둥이 된다', () => {
    expect(itemMesh(mk('column-round', { pos: [0.5, 0.25] })).geometry.type).toBe('CylinderGeometry');
    expect(itemMesh(mk('stool-round', { pos: [0, 0] })).geometry.type).toBe('BoxGeometry'); // 기둥이 아닌 원형 제품은 박스
  });

  test('창은 반투명, 재질은 메시마다 새로 만든다', () => {
    const m = itemMesh(mk('window-slide-1200', { pos: [0, 0] }));
    expect(m.material.transparent).toBe(true);
    expect(m.material.opacity).toBeLessThan(1);
    expect(m.material.userData.perMesh).toBe(true);
  });

  test('buildItems는 v3 토글과 숨김을 반영한다', () => {
    const items = [mk('sofa-3', { pos: [0, 0] }), mk('hood-wall', { pos: [1000, 0] }), mk('light-pendant', { pos: [2000, 0] }), mk('bed-queen', { pos: [3000, 0], hidden: true })];
    expect(buildItems(floor(items), { v3: {} }).children).toHaveLength(3);
    expect(buildItems(floor(items), { v3: { wallItems: false } }).children).toHaveLength(2);
    expect(buildItems(floor(items), { v3: { floorItems: false, ceilingItems: false, wallItems: false } }).children).toHaveLength(0);
    expect(buildItems(floor(items), {}).name).toBe('items');
    expect(itemVisible3(items[3], {})).toBe(false);
  });

  test('아이템 색이 재질 색으로 간다', () => {
    const m = itemMesh(mk('sofa-3', { pos: [0, 0], color: '#ff0000' }));
    expect(m.material.color.getHexString()).toBe('ff0000');
  });

  test('v3.collision이 켜져 있으면 겹친 아이템이 빨갛게 칠해진다', () => {
    const items = [mk('dining-4', { pos: [0, 0] }), mk('dining-4', { pos: [500, 0] }), mk('dining-4', { pos: [5000, 0] })];
    expect(collidingIds(items).size).toBe(2);
    const on = buildItems(floor(items), { v3: {} });
    expect(on.children.filter(c => c.material.color.getHexString() === 'e5484d')).toHaveLength(2);
    const off = buildItems(floor(items), { v3: { collision: false } });
    expect(off.children.some(c => c.material.color.getHexString() === 'e5484d')).toBe(false);
  });
});
