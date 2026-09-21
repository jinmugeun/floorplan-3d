import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { buildLabels, labelSprite, setLabelCanvasFactory, clearLabelCache, LABEL_H_PX, labelTextureSize, cullSprites, cullLabels, LABEL3D_PRIORITY } from '../src/view3d/labels3d.js';
import { DEFAULT_VIEW, createItem } from '../src/state/schema.js';
import { normalizeDuct } from '../src/state/ductSchema.js';
import { productById } from '../src/products/catalog.js';
import { V2_OPTIONS, V3_OPTIONS, viewPopoverHtml } from '../src/ui/viewOptions.js';

// node 환경에는 document가 없다. 라벨이 부르는 메서드만 가진 가짜 캔버스를 깔아 둔다(build.test.js와 같은 방식).
function fakeCanvas() {
  const ctx = { fillStyle: '', font: '', textAlign: '', textBaseline: '', clearRect() {}, fillRect() {}, fillText() {} };
  return { width: 0, height: 0, getContext: () => ctx };
}
beforeAll(() => setLabelCanvasFactory(fakeCanvas));
afterAll(() => { clearLabelCache(); setLabelCanvasFactory(null); });

const hood = createItem(productById('hood-box'), { pos: [14350, 12700], z: 2300, props: { type: 'hood', no: 3, faceVelocity: 0.5, system: 'F-3' } });
const duct = normalizeDuct({ id: 'd1', kind: 'exhaust', points: [[0, 0], [3000.5, 0]], segments: [{ w: 750, h: 400, z: 2650 }] });

describe('3D 라벨', () => {
  test('스프라이트는 CanvasTexture를 쓰고 빈 글자는 만들지 않는다', () => {
    const s = labelSprite('③');
    expect(s.isSprite).toBe(true);
    expect(s.material.map.isCanvasTexture).toBe(true);
    expect(s.material.map.image.width).toBe(labelTextureSize('③').w);
    expect(s.material.map.image.height).toBe(LABEL_H_PX);
    expect(s.material.userData.perMesh).toBe(true);
    expect(labelSprite(null)).toBeNull();
    expect(labelSprite('')).toBeNull();
  });

  test('같은 글자·색은 텍스처를 다시 만들지 않는다', () => {
    const a = labelSprite('가'), b = labelSprite('가');
    expect(a.material.map).toBe(b.material.map);
    expect(labelSprite('가', { color: '#dc2626' }).material.map).not.toBe(a.material.map);
  });

  test('설비 라벨은 설비 윗면 위에, 덕트 라벨은 구간 중앙 위에 선다', () => {
    const g = buildLabels({ items: [hood], ducts: [duct] }, {});
    expect(g.name).toBe('labels');
    expect(g.children).toHaveLength(2);
    const eq = g.children.find(c => c.userData.itemId === hood.id);
    expect(eq.position.x).toBeCloseTo(14.35, 9);
    expect(eq.position.z).toBeCloseTo(12.7, 9);
    expect(eq.position.y).toBeCloseTo((2300 + 600 + 150) / 1000, 9);
    const dl = g.children.find(c => c.userData.ductId === 'd1');
    expect(dl.userData.segment).toBe(0);
    expect(dl.position.x).toBeCloseTo(1.50025, 9);
    expect(dl.position.y).toBeCloseTo((2650 + 200 + 150) / 1000, 9);
  });

  test('보기 플래그로 라벨을 끈다(설비·덕트 각각)', () => {
    expect(buildLabels({ items: [hood], ducts: [duct] }, { v3: { equipLabels: false } }).children).toHaveLength(1);
    expect(buildLabels({ items: [hood], ducts: [duct] }, { v3: { ductLabels: false } }).children).toHaveLength(1);
    expect(buildLabels({ items: [hood], ducts: [duct] }, { v3: { equipLabels: false, ductLabels: false } }).children).toHaveLength(0);
    expect(buildLabels({ items: [hood], ducts: [duct] }, { v3: { ceilingItems: false } }).children).toHaveLength(1); // 천장 가구를 끄면 후드 라벨도 사라진다
    expect(buildLabels({ items: [hood], ducts: [duct] }, { v3: { ducts: false } }).children).toHaveLength(1);
  });

  test('조리기구는 라벨이 없어 스프라이트를 만들지 않는다', () => {
    const range = createItem(productById('range-gas-high'), { pos: [7650, 18800] });
    expect(buildLabels({ items: [range], ducts: [] }, {}).children).toHaveLength(0);
  });

  test('텍스처와 스프라이트 폭이 글자 폭을 따른다(감사 §11)', () => {
    const short = labelSprite('③'), long = labelSprite('750×400');
    expect(labelTextureSize('750×400').w).toBeGreaterThan(labelTextureSize('③').w);
    expect(long.material.map.image.width).toBe(labelTextureSize('750×400').w);
    // 스프라이트 가로/세로 비율 = 텍스처 비율(글자가 눌리거나 잘리지 않는다).
    const box = labelTextureSize('750×400');
    expect(long.scale.x / long.scale.y).toBeCloseTo(box.w / box.h, 6);
    expect(short.scale.x / short.scale.y).toBeCloseTo(labelTextureSize('③').w / box.h, 6);
    expect(long.scale.y).toBeCloseTo(0.4, 6);        // 높이는 예전과 같다(0.4 m)
  });

  test('cullSprites는 겹치면 낮은 우선순위를 숨긴다(설비 번호 > 덕트 단면)', () => {
    expect(LABEL3D_PRIORITY).toEqual(['equip', 'ductSize']);
    const keep = cullSprites([
      { key: 'duct1', kind: 'ductSize', text: '750×400', sp: [100.5, 100.25], size: 12 },
      { key: 'eq1', kind: 'equip', text: '③', sp: [104, 102], size: 12 },
      { key: 'duct2', kind: 'ductSize', text: '600×300', sp: [400, 400], size: 12 },
    ]);
    expect(keep.has('eq1')).toBe(true);
    expect(keep.has('duct1')).toBe(false);           // 설비 번호에 자리를 내준다
    expect(keep.has('duct2')).toBe(true);            // 멀리 있는 것은 그대로
    expect(cullSprites([]).size).toBe(0);
  });
});

describe('보기 옵션', () => {
  test('기본값에 덕트·덕트 라벨·설비 라벨이 켜져 있다', () => {
    for (const k of ['ducts', 'ductLabels', 'equipLabels']) {
      expect(DEFAULT_VIEW.v2[k], `v2.${k}`).toBe(true);
      expect(DEFAULT_VIEW.v3[k], `v3.${k}`).toBe(true);
    }
  });

  test('팝오버 목록에 세 줄이 2D·3D 모두 있다', () => {
    for (const list of [V2_OPTIONS, V3_OPTIONS]) {
      expect(list.map(x => x[0])).toEqual(expect.arrayContaining(['ducts', 'ductLabels', 'equipLabels']));
    }
    expect(V2_OPTIONS.find(x => x[0] === 'ducts')[1]).toBe('덕트');
    expect(V3_OPTIONS.find(x => x[0] === 'ductLabels')[1]).toBe('덕트 라벨');
    const html2 = viewPopoverHtml({ ...DEFAULT_VIEW }, '2d');
    expect(html2).toContain('data-v2="equipLabels"');
    const html3 = viewPopoverHtml({ ...DEFAULT_VIEW }, '3d');
    expect(html3).toContain('data-v3="ducts"');
  });
});

// §13.4: 성능 우선에서는 설비·덕트 라벨 스프라이트를 아예 만들지 않는다(플래그는 그대로).
test('성능 우선 모드는 라벨을 만들지 않고 빈 labels 그룹을 준다', async () => {
  const { buildLabels } = await import('../src/view3d/labels3d.js');
  const { createItem } = await import('../src/state/schema.js');
  const { productById } = await import('../src/products/catalog.js');
  const hood = createItem(productById('hood-box'), { pos: [1000.5, 1000.25] });
  const fl = { walls: [], rooms: [], items: [hood], ducts: [], height: 2300 };
  const on = buildLabels(fl, { v3: { equipLabels: true } });
  expect(on.children.length).toBeGreaterThan(0);
  const off = buildLabels(fl, { v3: { equipLabels: true }, perfMode: 'performance' });
  expect(off.name).toBe('labels');
  expect(off.children).toHaveLength(0);
});

// §15.12: 컬링은 카메라가 멈춘 뒤 한 번 돈다(view3d가 120 ms 디바운스). 투영은 주입할 수 있다.
test('cullLabels는 그룹의 스프라이트 visible을 맞춘다', () => {
  const g = buildLabels({ items: [hood], ducts: [duct] }, {});
  expect(g.children).toHaveLength(2);
  // 둘을 같은 화면 자리로 투영하면 우선순위가 낮은 덕트 라벨이 숨는다.
  const keep = cullLabels(g, null, { width: 800, height: 600, project: () => [400, 300] });
  const eq = g.children.find(c => c.userData.itemId === hood.id);
  const dl = g.children.find(c => c.userData.ductId === 'd1');
  expect(eq.visible).toBe(true);
  expect(dl.visible).toBe(false);
  expect(keep.has(eq.uuid)).toBe(true);
  // 서로 멀면 둘 다 보인다.
  let n = 0;
  cullLabels(g, null, { width: 800, height: 600, project: () => [100 + (n++) * 300, 300] });
  expect(g.children.every(c => c.visible)).toBe(true);
});
