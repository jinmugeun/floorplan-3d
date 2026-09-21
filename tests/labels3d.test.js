import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { buildLabels, labelSprite, setLabelCanvasFactory, clearLabelCache, LABEL_PX } from '../src/view3d/labels3d.js';
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
    expect(s.material.map.image.width).toBe(LABEL_PX);
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
