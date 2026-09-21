import { describe, test, expect, vi } from 'vitest';
import * as THREE from 'three';
import { buildDucts, segmentMesh, riserMesh, damperMesh, DUCT_COLOR3, DUCT_OPACITY } from '../src/view3d/ducts3d.js';
import { buildFloorGroup, sceneSignature, disposeGroup } from '../src/view3d/build.js';
import { cutawayMeshStyle, soloMeshVisible } from '../src/view3d/cutaway.js';
import { normalizeDuct } from '../src/state/ductSchema.js';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { addDuct } from '../src/state/ductOps.js';
import { productById } from '../src/products/catalog.js';
import { rectWalls } from '../src/geom/walls.js';

const duct = normalizeDuct({
  id: 'd1', kind: 'exhaust', points: [[1000, 500], [4000, 500], [4000, 3500.5]],
  segments: [{ w: 750, h: 400, z: 2650 }, { w: 500, h: 300, z: 2700 }],
  connections: [{ point: 0, itemId: 'f1' }], dampers: [{ segment: 0, t: 0.25, type: 'VD', w: 550, h: 350 }],
});
const fan = { id: 'f1', kind: 'equipment', pos: [1000, 500], size: [700, 700, 700], z: 0, hidden: false };

describe('3D 덕트', () => {
  test('구간 하나는 길이×높이×폭 박스이고 중심·각도가 맞는다', () => {
    const m = segmentMesh(duct, 0);
    expect(m.name).toBe('duct');
    expect(m.userData).toEqual({ ductId: 'd1', segment: 0 });
    expect(m.geometry.parameters.width).toBeCloseTo(3.0, 9);      // 3000 mm
    expect(m.geometry.parameters.height).toBeCloseTo(0.4, 9);     // h
    expect(m.geometry.parameters.depth).toBeCloseTo(0.75, 9);     // w
    expect(m.position.x).toBeCloseTo(2.5, 9);
    expect(m.position.y).toBeCloseTo(2.65, 9);                    // z(중심 높이) → three y
    expect(m.position.z).toBeCloseTo(0.5, 9);
    expect(m.rotation.y).toBeCloseTo(0, 9);
    const m2 = segmentMesh(duct, 1);                              // 남쪽으로 꺾인 구간(소수 좌표)
    expect(m2.geometry.parameters.width).toBeCloseTo(3.0005, 9);
    expect(m2.rotation.y).toBeCloseTo(-Math.PI / 2, 9);
    expect(segmentMesh(normalizeDuct({ points: [[0, 0], [0, 0.0]] }), 0)).toBeNull();
  });

  test('재질 색은 급기/배기이고 반투명이다', () => {
    expect(segmentMesh(duct, 0).material.color.getHex()).toBe(DUCT_COLOR3.exhaust);
    expect(segmentMesh({ ...duct, kind: 'supply' }, 0).material.color.getHex()).toBe(DUCT_COLOR3.supply);
    expect(segmentMesh(duct, 0).material.opacity).toBe(DUCT_OPACITY);
    expect(segmentMesh(duct, 0).material.userData.perMesh).toBe(true);
  });

  test('라이저는 설비 윗면에서 구간 아랫면까지 서고, 댐퍼는 얇은 판이다', () => {
    const r = riserMesh(fan, duct, { point: 0, itemId: 'f1' });
    expect(r.name).toBe('riser');
    expect(r.geometry.parameters.height).toBeCloseTo(1.75, 9);    // 700 → 2450
    expect(r.position.y).toBeCloseTo(1.575, 9);                   // (700 + 2450) / 2
    const d = damperMesh(duct, duct.dampers[0], 0);
    expect(d.name).toBe('damper');
    expect(d.userData).toEqual({ ductId: 'd1', damper: 0 });
    expect(d.geometry.parameters.height).toBeCloseTo(0.35, 9);
    expect(d.position.x).toBeCloseTo(1.75, 9);                    // 1000 + 0.25 × 3000
  });

  test('buildDucts는 구간·라이저·댐퍼를 한 그룹에 담고 플래그·숨김을 따른다', () => {
    const g = buildDucts({ ducts: [duct], items: [fan] }, {});
    expect(g.name).toBe('ducts');
    expect(g.children.map(c => c.name).sort()).toEqual(['damper', 'duct', 'duct', 'riser']);
    expect(buildDucts({ ducts: [duct], items: [fan] }, { v3: { ducts: false } }).children).toHaveLength(0);
    expect(buildDucts({ ducts: [{ ...duct, hidden: true }], items: [fan] }, {}).children).toHaveLength(0);
    expect(buildDucts({ ducts: [duct], items: [{ ...fan, hidden: true }] }, {}).children.map(c => c.name)).not.toContain('riser');
  });
});

describe('씬에 덕트를 담는다', () => {
  function setup() {
    const store = createStore(createEmptyProject());
    addWalls(store, rectWalls([0, 0], [6000.5, 5000.25], 200));
    addItem(store, createItem(productById('fan-exhaust-700'), { pos: [1000, 500] }));
    addDuct(store, { points: [[1000, 500], [4000, 500]], segments: [{ w: 750, h: 400, z: 2650 }] });
    return store;
  }

  test('buildFloorGroup에 ducts 그룹이 들어가고 dispose가 정리한다', () => {
    const store = setup();
    const g = buildFloorGroup(activeFloor(store.get()), store.get().view);
    const ducts = g.children.find(c => c.name === 'ducts');
    expect(ducts).toBeTruthy();
    expect(ducts.children.some(c => c.name === 'duct')).toBe(true);
    // "지오메트리가 있었다"가 아니라 "dispose가 실제로 불렸다"를 본다.
    const seg = ducts.children.find(c => c.name === 'duct');
    const spy = vi.spyOn(seg.geometry, 'dispose');
    expect(seg.material.userData.perMesh).toBe(true);   // disposeGroup이 재질도 정리할 표시
    disposeGroup(g);
    expect(spy).toHaveBeenCalled();
  });

  test('덕트가 바뀌면 씬 서명이 바뀐다', () => {
    const store = setup();
    const before = sceneSignature(store.get());
    addDuct(store, { points: [[0, 0], [1000, 0]] });
    expect(sceneSignature(store.get())).not.toBe(before);
    const mid = sceneSignature(store.get());
    store.dispatch(s => { s.view.v3.ducts = false; }, { record: false });
    expect(sceneSignature(store.get())).not.toBe(mid);
    const after = sceneSignature(store.get());
    store.dispatch(s => { s.view.sun.hour = 9; }, { record: false });
    expect(sceneSignature(store.get())).toBe(after);   // 씬을 다시 만들 일이 아닌 값은 서명에 없다
  });

  test('컷어웨이·단일 공간 모드는 덕트를 건드리지 않는다', () => {
    const store = setup();
    const g = buildFloorGroup(activeFloor(store.get()), store.get().view);
    const ducts = g.children.find(c => c.name === 'ducts');
    // applyCutaway는 group.children 중 userData.wallId가 있는 자식만 만진다: 덕트 그룹에는 없다.
    expect(ducts.userData.wallId).toBeUndefined();
    expect(ducts.userData.roomId).toBeUndefined();
    // applySolo는 group.children 전부에 soloMeshVisible을 적용한다 — 규칙 함수를 직접 불러
    // "단일 공간 모드를 켜도 덕트 그룹은 현재 visible 그대로"임을 단정한다.
    expect(ducts.visible).toBe(true);
    expect(soloMeshVisible(ducts, null)).toBe(true);
    expect(soloMeshVisible(ducts, activeFloor(store.get()).rooms[0])).toBe(true);
    // 덕트가 안전한 이유는 메시 이름이 아니라 "wallId가 없어 컷어웨이 루프에 들어가지 않는다"는 것이다:
    // 같은 이름을 cutawayMeshStyle에 직접 넘기면 isHidden을 따라 숨는다(그 경로로는 절대 가지 않는다).
    expect(cutawayMeshStyle('duct', { isHidden: true }).visible).toBe(false);
  });
});
