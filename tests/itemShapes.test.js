import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { shapeFor, itemMaterial, itemMaterialSpec, darkerHex, SHAPE_SYMBOLS, ITEM_MATERIALS, ITEM_BASE_COLOR } from '../src/view3d/itemShapes.js';
import { createItem } from '../src/state/schema.js';
import { productById, CATEGORIES } from '../src/products/catalog.js';

const mk = (id, patch = {}) => createItem(productById(id), { pos: [1000.5, 2000.25], ...patch });
const names = g => g.children.map(c => c.name);
// three가 변환을 반영해 재게 한다: 손으로 geometry.boundingBox + position만 더하면 cyl(..., { axis: 'z' })이
// 세팅하는 rotation.x = π/2를 무시해 팬·환기캡·조리기구 손잡이에서 엉뚱한 값이 나온다.
const bbox = g => { g.updateMatrixWorld(true); return new THREE.Box3().setFromObject(g); };

describe('조합 형상', () => {
  test('심벌 목록과 자식 구성', () => {
    expect(SHAPE_SYMBOLS).toEqual(['bed', 'table', 'chair', 'sofa', 'fridge', 'sink', 'range', 'appliance', 'lamp', 'hood', 'diffuser', 'fan', 'ventcap']);
    expect(names(shapeFor(mk('bed-queen')))).toEqual(['bedFrame', 'mattress', 'headboard']);
    expect(names(shapeFor(mk('dining-4')))).toEqual(['tableTop', 'tableLeg', 'tableLeg', 'tableLeg', 'tableLeg']);
    expect(names(shapeFor(mk('chair-dining')))).toEqual(['chairSeat', 'chairBack', 'chairLeg', 'chairLeg', 'chairLeg', 'chairLeg']);
    expect(names(shapeFor(mk('sofa-3')))).toEqual(['sofaSeat', 'sofaBack', 'sofaArm', 'sofaArm']);
    expect(names(shapeFor(mk('fridge-2door')))).toEqual(['fridgeBody', 'fridgeDoor', 'fridgeHandle']);
    expect(names(shapeFor(mk('sink-double')))).toEqual(['sinkCabinet', 'sinkTop', 'sinkBasin']);
    expect(names(shapeFor(mk('range-gas-6')))).toEqual(['rangeBody', 'rangeBurner', 'rangeBurner', 'rangeBurner', 'rangeBurner']);
    expect(names(shapeFor(mk('range-gas-high')))).toEqual(['applianceBody', 'applianceTop', 'applianceKnob']);  // 조리기구 7종이 모두 이 심벌이다
    expect(names(shapeFor(mk('dishwasher-conveyor')))).toEqual(['applianceBody', 'applianceTop', 'applianceKnob']);
    expect(names(shapeFor(mk('light-pendant')))).toEqual(['lampShade', 'lampCord']);
    expect(names(shapeFor(mk('hood-box')))).toEqual(['hoodBody', 'hoodSkirt', 'hoodSlit', 'hoodSlit']);
    expect(names(shapeFor(mk('diffuser-650')))).toEqual(['diffuserFrame', 'diffuserBar', 'diffuserBar']);
    expect(names(shapeFor(mk('fan-exhaust-700')))).toEqual(['fanChamber', 'fanDisc']);
    expect(names(shapeFor(mk('ventcap-150')))).toEqual(['ventcapPipe', 'ventcapCap']);
  });

  test('목록에 없는 심벌은 null이다(호출자가 예전 박스를 만든다)', () => {
    expect(shapeFor(mk('cabinet-lower'))).toBeNull();   // symbol: box
    expect(shapeFor(mk('door-swing-900'))).toBeNull();  // symbol: door
    expect(shapeFor(mk('window-fix-600'))).toBeNull();
    expect(shapeFor(mk('column-square'))).toBeNull();   // 기둥은 items3d의 박스·원기둥 경로가 맡는다
    expect(shapeFor(mk('column-round'))).toBeNull();
    expect(shapeFor(mk('opening-pass'))).toBeNull();
    expect(shapeFor(null)).toBeNull();
  });

  // 규약: 형상은 아이템 바운딩 박스 밖으로 나가지 않는다(2D 심벌·충돌 판정·간격 치수가 item.size를
  // 쓰므로 3D만 어긋나면 안 된다). 대표 제품 13개 = SHAPE_SYMBOLS 13종을 전부 검사한다.
  test('형상은 아이템 크기 안에 들어간다(13종 전부 + 소수 크기)', () => {
    const ids = ['bed-queen', 'dining-4', 'chair-dining', 'sofa-3', 'fridge-2door', 'sink-double', 'range-gas-6', 'range-gas-high', 'light-ceiling', 'hood-box', 'diffuser-650', 'fan-exhaust-700', 'ventcap-100'];
    const cases = [...ids.map(id => mk(id)), mk('dining-4', { size: [1200.5, 800.25, 750.75] })];   // 마지막은 소수 크기
    expect(cases).toHaveLength(SHAPE_SYMBOLS.length + 1);
    for (const it of cases) {
      const g = shapeFor(it);
      expect(g).not.toBeNull();
      const b = bbox(g);
      const [w, d, h] = it.size;
      const half = { x: w / 2000, y: h / 2000, z: d / 2000 };     // three 로컬: x = 너비, y = 높이, z = 깊이(m)
      for (const k of ['x', 'y', 'z']) {
        expect(b.min[k]).toBeGreaterThanOrEqual(-half[k] - 1e-6);
        expect(b.max[k]).toBeLessThanOrEqual(half[k] + 1e-6);
      }
      expect(g.children.every(c => c.geometry.type === 'BoxGeometry' || c.geometry.type === 'CylinderGeometry')).toBe(true);
    }
  });

  test('조명·팬·환기캡은 원기둥을 쓴다', () => {
    expect(shapeFor(mk('light-ceiling')).children.map(c => c.geometry.type)).toEqual(['CylinderGeometry', 'CylinderGeometry']);
    expect(shapeFor(mk('fan-exhaust-700')).children[1].geometry.type).toBe('CylinderGeometry');
    expect(shapeFor(mk('ventcap-100')).children.every(c => c.geometry.type === 'CylinderGeometry')).toBe(true);
  });
});

describe('카테고리 재질', () => {
  test('카탈로그의 모든 카테고리에 재질이 있다', () => {
    for (const c of CATEGORIES) expect(ITEM_MATERIALS[c.name]).toBeTruthy();
    expect(Object.keys(ITEM_MATERIALS).sort()).toEqual(CATEGORIES.map(c => c.name).sort());
  });

  test('제품 색이 이기고, 스키마 기본색이면 카테고리 색을 쓴다', () => {
    expect(itemMaterialSpec(mk('sofa-3')).color).toBe('#c9cdd6');           // 제품 색
    expect(itemMaterialSpec(mk('sofa-3', { color: '#ff0000' })).color).toBe('#ff0000');
    const plain = mk('dishwasher');                                        // 제품 색이 기본값(#cfd4da)이다
    expect(plain.color).toBe(ITEM_BASE_COLOR);
    expect(itemMaterialSpec(plain).color).toBe(ITEM_MATERIALS['가전'].color);
    expect(itemMaterialSpec(mk('hood-box')).roughness).toBe(ITEM_MATERIALS['환기 설비'].roughness);
    expect(itemMaterialSpec({ productId: '없음', color: '#123456' })).toEqual({ color: '#123456', roughness: 0.8, metalness: 0 });
  });

  test('재질은 메시마다 새로 만들고 perMesh 표시가 붙는다', () => {
    const m = itemMaterial(mk('sofa-3'));
    expect(m.userData.perMesh).toBe(true);
    expect(m.color.getHexString()).toBe('c9cdd6');
    expect(itemMaterial(mk('sofa-3'), { color: '#00ff00' }).color.getHexString()).toBe('00ff00');
  });

  test('darkerHex는 채널마다 비율을 곱한다', () => {
    expect(darkerHex('#cfd4da', 0.75)).toBe('#9b9fa4');
    expect(darkerHex('#ffffff', 0.5)).toBe('#808080');
    expect(darkerHex('nope', 0.5)).toBe('nope');
  });
});
