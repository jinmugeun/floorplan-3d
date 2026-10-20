import { describe, test, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { buildItems, itemMesh, itemVisible3, paintItem, COLLIDE_COLOR } from '../src/view3d/items3d.js';
import { disposeGroup, sceneSignature } from '../src/view3d/build.js';
import { enableAssets, requestAsset, templateOf, onAssetsReady, assetsVersion, __setLoader, __reset } from '../src/view3d/itemAssets.js';
import { __notifyShapeTexturesReady } from '../src/view3d/shapes/materials.js';
import { createItem, createEmptyProject } from '../src/state/schema.js';
import { productById } from '../src/products/catalog.js';
import { KITCHEN_PRODUCTS } from '../src/products/catalogKitchen.js';
import { RAD } from '../src/geom/items.js';
import { collidingIds, memoCollisions } from '../src/geom/collide.js';

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

  test('아이템 색이 재질 색으로 간다(조합 형상은 자식 전부)', () => {
    const g = itemMesh(mk('sofa-3', { pos: [0, 0], color: '#ff0000' }));
    const colors = [];
    g.traverse(o => { if (o.material?.color) colors.push(o.material.color.getHexString()); });
    expect(colors.length).toBeGreaterThan(0);
    expect(colors.some(c => c === 'ff0000')).toBe(true);          // 본체는 지정한 색
    const box = itemMesh(mk('cabinet-lower', { pos: [0, 0], color: '#ff0000' }));
    expect(box.material.color.getHexString()).toBe('ff0000');      // 박스 경로는 그대로
  });

  test('v3.collision이 켜져 있으면 겹친 아이템이 빨갛게 칠해진다', () => {
    const items = [mk('dining-4', { pos: [0, 0] }), mk('dining-4', { pos: [500, 0] }), mk('dining-4', { pos: [5000, 0] })];
    expect(collidingIds(items).size).toBe(2);
    const red = obj => { let hit = false; obj.traverse(o => { if (o.material?.color?.getHexString() === 'e5484d') hit = true; }); return hit; };
    const on = buildItems(floor(items), { v3: {} });
    expect(on.children.filter(red)).toHaveLength(2);
    const off = buildItems(floor(items), { v3: { collision: false } });
    expect(off.children.some(red)).toBe(false);
  });

  // 계획 13 Task 5 · 사전 검토 I-5(2026-10-12): 3D buildItems는 재빌드마다 collidingIds를 캐시 없이 다시 돌렸다
  // (2D·배너·속성 패널은 memoCollisions — 같은 아이템 배열이면 한 번). 가져온 기구 330개에서 재빌드마다 50~65 ms였다.
  // 캐시를 쓰는지 보는 방법: 같은 배열로 캐시 칸을 먼저 채우고 그 Set에 겹치지 않는 아이템을 심는다 — 3D가 캐시를
  // 읽으면 그것도 빨갛고, 다시 계산하면 빨갛지 않다. (캐시를 더럽히는 것은 이 테스트가 만든 배열이라 다른 곳에 새지 않는다.)
  test('buildItems는 충돌을 memoCollisions 캐시에서 읽는다(같은 아이템 배열이면 다시 세지 않는다)', () => {
    const items = [mk('dining-4', { pos: [0.5, 0.25] }), mk('dining-4', { pos: [500.5, 0.25] }), mk('dining-4', { pos: [5000, 0] })];
    const cached = memoCollisions(items);
    expect([...cached].sort()).toEqual([items[0].id, items[1].id].sort());
    cached.add(items[2].id);                                     // 실제로는 겹치지 않는 셋째를 캐시에만 심는다
    const red = obj => { let hit = false; obj.traverse(o => { if (o.material?.color?.getHexString() === 'e5484d') hit = true; }); return hit; };
    expect(buildItems(floor(items), { v3: {} }).children.filter(red)).toHaveLength(3);
    // 새 배열(편집 뒤 스냅숏)은 새로 센다 — 심은 값이 따라오지 않는다.
    expect(buildItems(floor([...items]), { v3: {} }).children.filter(red)).toHaveLength(2);
  });

  test('조합 형상은 그룹이고 위치·회전·itemId는 모든 자손에 붙는다', () => {
    const it = mk('dining-4', { pos: [1000.5, 2000.25], rot: 90 });
    const g = itemMesh(it);
    expect(g.type).toBe('Group');
    expect(g.name).toBe('item');
    expect(g.children).toHaveLength(5);
    expect(g.position.x).toBeCloseTo(1.0005);
    expect(g.position.z).toBeCloseTo(2.00025);
    expect(g.position.y).toBeCloseTo((it.z + it.size[2] / 2) / 1000);
    expect(g.rotation.y).toBeCloseTo(-RAD(90));
    const ids = []; g.traverse(o => ids.push(o.userData.itemId));
    expect(ids.every(x => x === it.id)).toBe(true);
  });

  test('itemEdges가 켜지면 메시마다 엣지 선이 붙고 꺼지면 없다', () => {
    const lines = obj => { let n = 0; obj.traverse(o => { if (o.isLineSegments) n += 1; }); return n; };
    expect(lines(itemMesh(mk('dining-4', { pos: [0, 0] }), { edges: true }))).toBe(5);
    expect(lines(itemMesh(mk('dining-4', { pos: [0, 0] })))).toBe(0);
    expect(lines(itemMesh(mk('cabinet-lower', { pos: [0, 0] }), { edges: true }))).toBe(1);
    // buildItems는 선 객체를 만들지 않는다(윤곽선은 화면 후처리 — 계획 17 Task 6)
    expect(lines(buildItems(floor([mk('dining-4', { pos: [0, 0] })]), { v3: {} }))).toBe(0);
    expect(lines(buildItems(floor([mk('dining-4', { pos: [0, 0] })]), { v3: { itemEdges: false } }))).toBe(0);
  });

  // 2D는 (translate → rotate → scale)로 반전을 아이템 로컬 축에 먹인다(items2d.drawItem).
  // 3D도 같아야 한다 — 형상이 비대칭이 된 뒤로는 후드 슬릿·냉장고 손잡이가 2D와 반대쪽에 오면 바로 보인다.
  test('flipH/flipV가 3D에도 반영되고 아이템 로컬 축을 기준으로 반전된다', () => {
    const at = patch => {
      const g = itemMesh(mk('fridge-2door', { pos: [0, 0], ...patch }));
      g.updateMatrixWorld(true);
      return g.getObjectByName('fridgeHandle').getWorldPosition(new THREE.Vector3());
    };
    const base = at({});
    expect(base.x).toBeGreaterThan(0.1);                      // 손잡이는 +x 쪽에 치우쳐 있다(비대칭)
    expect(base.z).toBeGreaterThan(0.1);                      // 문짝 앞면(+깊이)
    const h = at({ flipH: true });
    expect(h.x).toBeCloseTo(-base.x); expect(h.z).toBeCloseTo(base.z);
    const v = at({ flipV: true });
    expect(v.x).toBeCloseTo(base.x); expect(v.z).toBeCloseTo(-base.z);
    // 회전과 섞이면 로컬 축 기준임이 드러난다: rot 90°에서 로컬 +x는 월드(three) +z로 간다.
    const r = at({ rot: 90 }), rf = at({ rot: 90, flipH: true });
    expect(rf.z).toBeCloseTo(-r.z);                           // 로컬 x가 뒤집힌다
    expect(rf.x).toBeCloseTo(r.x);                            // 월드 x를 뒤집는 것이 아니다
    // 스케일 자체도 확인한다(박스 경로도 같은 규칙을 쓴다).
    const s = itemMesh(mk('cabinet-lower', { pos: [0, 0], flipH: true, flipV: true })).scale;
    expect([s.x, s.y, s.z]).toEqual([-1, 1, -1]);
    const none = itemMesh(mk('cabinet-lower', { pos: [0, 0] })).scale;
    expect([none.x, none.y, none.z]).toEqual([1, 1, 1]);
  });

  test('paintItem은 그룹과 메시 모두 칠한다', () => {
    const g = itemMesh(mk('sofa-3', { pos: [0, 0] }));
    paintItem(g, COLLIDE_COLOR);
    const all = []; g.traverse(o => { if (o.material?.color) all.push(o.material.color.getHexString()); });
    expect(all.every(c => c === 'e5484d')).toBe(true);
    const box = itemMesh(mk('cabinet-lower', { pos: [0, 0] }));
    paintItem(box, COLLIDE_COLOR);
    expect(box.material.color.getHexString()).toBe('e5484d');
  });
});

// 계획 17 Task 6: 윤곽선은 화면 후처리(outlinePass)라 buildItems는 어느 모드에서도 선 객체를 만들지 않는다 — 켜고 끄기는 outlineEnabled(view).
test('buildItems는 표시·성능 모드 모두 선 객체(itemEdge)를 만들지 않는다', () => {
  const items = [mk('sofa-3', { pos: [1000.5, 1000.25] })];
  const edgeCount = g => { let n = 0; g.traverse(o => { if (o.name === 'itemEdge') n += 1; }); return n; };
  expect(edgeCount(buildItems(floor(items), { v3: { itemEdges: true } }))).toBe(0);
  const off = buildItems(floor(items), { v3: { itemEdges: true }, perfMode: 'performance' });
  expect(edgeCount(off)).toBe(0);
  expect(off.children).toHaveLength(1);
});

// ── 실사 에셋(2026-10-13 · 계획 15 Task B · 사전 검토 p15-preflight §8 · I-6 · S-7) ──
// 로더는 __setLoader로 바꿔 끼운다(GLB·네트워크 없음). 카탈로그를 고치는 테스트는 그 테스트 안에서만 고치고 되돌린다.
describe('실사 에셋', () => {
  const box = (w, h, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial()); m.position.y = h / 2; const g = new THREE.Group(); g.add(m); return g; };
  const flush = () => new Promise(r => setTimeout(r, 0));
  const settle = async () => { await flush(); await flush(); await flush(); };
  const withAsset = () => ({ ...productById('chair-dining'), asset: 'chair-dining' });
  const sharedCount = obj => { let n = 0; obj.traverse(o => { if (o.userData.shared) n += 1; }); return n; };
  afterEach(() => __reset());

  test('에셋이 있는 제품은 템플릿 복제(공유)로 서고 자손 전부에 itemId, 윤곽선은 붙지 않으며, 충돌은 재질이 아니라 붉은 상자 선으로', async () => {
    __reset(); enableAssets(); __setLoader(() => Promise.resolve(box(0.45, 0.9, 0.5)));
    const p = withAsset();
    requestAsset(p); await settle();
    const item = { id: 'c1', productId: 'chair-dining', kind: 'product', pos: [1000, 2000], z: 0, rot: 90, size: [450, 500, 900], color: '#cfd4da' };
    const obj = itemMesh(item, { edges: true, assets: true, product: p });      // product 주입: 테스트가 카탈로그를 고치지 않는다(기본은 productById)
    expect(obj.getObjectByProperty('isMesh', true).userData.shared).toBe(true);
    expect(obj.getObjectByName('itemEdge')).toBeUndefined();                   // three getObjectByName은 못 찾으면 undefined
    const ids = new Set(); obj.traverse(o => ids.add(o.userData.itemId)); expect([...ids]).toEqual(['c1']);
    const mat = obj.getObjectByProperty('isMesh', true).material;
    paintItem(obj, '#e5484d'); expect(mat.color.getHexString()).not.toBe('e5484d');
    expect(obj.getObjectByName('collideBox')).toBeTruthy();
    expect(obj.getObjectByName('collideBox').raycast).not.toBe(THREE.LineSegments.prototype.raycast);   // 픽에 안 잡히는 빈 raycast
    expect(obj.getObjectByName('collideBox').userData.itemId).toBe('c1');     // 선도 어느 아이템인지 안다
    paintItem(obj, '#e5484d');
    expect(obj.children.filter(o => o.name === 'collideBox')).toHaveLength(1); // 다시 칠해도 선은 하나
    // 위치·회전은 상자와 같은 규칙(아이템 중심 z + h/2 · -Y 회전), 모델은 아이템 size에 축별로 맞는다(바닥 = 아이템 바닥).
    expect(obj.name).toBe('item');
    expect(obj.position.y).toBeCloseTo(0.45); expect(obj.rotation.y).toBeCloseTo(-RAD(90));
    const model = obj.children.find(o => o.name !== 'collideBox');            // 선은 아이템 크기 그대로라 재지 않는다
    obj.rotation.y = 0; obj.position.set(0, 0.45, 0); obj.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(model);
    expect([bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].map(v => +v.toFixed(3))).toEqual([0.45, 0.9, 0.5]);
    expect(bb.min.y).toBeCloseTo(0, 6);
  });

  test('에셋이 아직 없으면 상자로 서고 requestAsset이 불린다 · assets:false(토글)면 요청도 없다 · 성능 모드는 모델을 유지한다', async () => {
    __reset(); enableAssets();
    const loader = vi.fn(() => Promise.resolve(box(0.45, 0.9, 0.5))); __setLoader(loader);
    const p = withAsset(), item = mk('chair-dining', { pos: [0, 0] });
    itemMesh(item, { assets: false, product: p }); await settle();
    expect(loader).not.toHaveBeenCalled();
    const first = itemMesh(item, { edges: true, product: p });                // assets 기본 true · 템플릿은 아직 없다
    expect(sharedCount(first)).toBe(0);
    expect(first.getObjectByName('chairBack')).toBeTruthy();                   // 지금의 조합 형상 그대로
    expect(first.getObjectByName('itemEdge')).toBeTruthy();                    // 상자에는 윤곽선도 그대로
    await settle();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(sharedCount(itemMesh(item, { product: p }))).toBeGreaterThan(0);    // 도착 뒤에는 모델
    // buildItems: 토글(v3.assets)이 끄면 템플릿이 있어도 상자이고 요청도 없다. 성능 우선은 모델을 유지하고 요청한다(최종 리뷰).
    // buildItems는 product 주입이 없어 카탈로그를 고친다 — 이전 값을 되돌린다(2026-10-13 · 리뷰 B-m2: Task C 뒤로 chair-dining에는
    // 진짜 asset이 있어 delete하면 이 파일의 남은 테스트가 에셋 없는 카탈로그를 보았다).
    const cat = productById('chair-dining'), prev = cat.asset;
    cat.asset = 'chair-dining';
    try {
      const fl = floor([item]);
      expect(sharedCount(buildItems(fl, { v3: {} }))).toBeGreaterThan(0);
      expect(sharedCount(buildItems(fl, { v3: { assets: false } }))).toBe(0);
      expect(sharedCount(buildItems(fl, { v3: {}, perfMode: 'performance' }))).toBeGreaterThan(0);   // 성능 모드도 모델(최종 리뷰)
      __reset(); enableAssets(); loader.mockClear(); __setLoader(loader);
      buildItems(fl, { v3: { assets: false } }); buildItems(fl, { v3: { assets: false }, perfMode: 'performance' }); await settle();
      expect(loader).not.toHaveBeenCalled();
      buildItems(fl, { v3: {}, perfMode: 'performance' }); buildItems(fl, { v3: {} }); await settle();
      expect(loader).toHaveBeenCalledTimes(1);                                 // 성능 모드도 받는다 · 종류당 한 번
    } finally { if (prev === undefined) delete cat.asset; else cat.asset = prev; }
  });

  test('disposeGroup은 shared 지오메트리를 dispose하지 않는다(재질도) · 충돌 상자 선(아이템 전용)은 버린다', async () => {
    __reset(); enableAssets(); __setLoader(() => Promise.resolve(box(0.45, 0.9, 0.5)));
    const p = withAsset(); requestAsset(p); await settle();
    const tm = templateOf('chair-dining').getObjectByProperty('isMesh', true);
    const geoGone = vi.fn(), matGone = vi.fn();
    tm.geometry.addEventListener('dispose', geoGone); tm.material.addEventListener('dispose', matGone);
    const obj = itemMesh(mk('chair-dining', { pos: [0, 0] }), { product: p });
    paintItem(obj, COLLIDE_COLOR);
    const line = obj.getObjectByName('collideBox'), lineGone = vi.fn(), lineMatGone = vi.fn();
    line.geometry.addEventListener('dispose', lineGone); line.material.addEventListener('dispose', lineMatGone);
    const g = new THREE.Group(); g.add(obj); disposeGroup(g);
    expect(geoGone).not.toHaveBeenCalled(); expect(matGone).not.toHaveBeenCalled();
    expect(lineGone).toHaveBeenCalledTimes(1); expect(lineMatGone).toHaveBeenCalledTimes(1);
  });

  test('sceneSignature는 v3.assets와 assetsVersion을 품는다', async () => {
    __reset(); enableAssets(); __setLoader(() => Promise.resolve(box(1, 1, 1)));
    const s = createEmptyProject();
    const a = sceneSignature(s);
    expect(sceneSignature({ ...s, view: { ...s.view, v3: { ...s.view.v3, assets: false } } })).not.toBe(a);
    requestAsset({ id: 'x', asset: 'x' }); await settle();
    expect(sceneSignature(s)).not.toBe(a);                                     // 도착 묶음마다 버전이 오른다
  });
});

// ── 스테인리스 형상(2026-10-20 · 계획 17 Task 5) ──
describe('엑셀 제품 · 도면 기구 형상', () => {
  const kp = shape => KITCHEN_PRODUCTS.find(p => p.shape === shape);
  test('엑셀 제품은 공유 형상 그룹으로 서고, 충돌은 재질이 아니라 붉은 상자 선이다', () => {
    const item = createItem(kp('sink'), { pos: [1000.5, 2000.25] });
    const obj = itemMesh(item);
    expect(obj.name).toBe('item');
    expect(obj.children.every(m => m.isMesh && m.userData.shared && m.name.startsWith('shape-'))).toBe(true);
    expect(obj.userData.assetSize).toEqual(item.size);
    obj.traverse(o => expect(o.userData.itemId).toBe(item.id));
    const before = obj.children[0].material.color.getHexString();
    paintItem(obj, COLLIDE_COLOR);
    expect(obj.children[0].material.color.getHexString()).toBe(before);
    expect(obj.getObjectByName('collideBox')).toBeTruthy();
  });
  test('도면 기구는 이름으로 형상을 고른다', () => {
    const it = mk('equip-generic', { pos: [0, 0], name: '세정대 2조 1500-750', size: [1500, 750, 850] });
    expect(itemMesh(it).children.some(m => m.name === 'shape-steel')).toBe(true);
  });
  test('반전·회전은 상자와 같은 규칙(로컬 축 음수 배율)', () => {
    const obj = itemMesh(createItem(kp('cabinet'), { pos: [0, 0], rot: 90, flipH: true }));
    expect(obj.rotation.y).toBeCloseTo(-RAD(90));
    expect([obj.scale.x, obj.scale.y, obj.scale.z]).toEqual([-1, 1, 1]);
  });
  test('형상 아이템에는 윤곽선 선 객체를 붙이지 않는다(윤곽선은 화면 후처리 — Task 6)', () => {
    const obj = itemMesh(createItem(kp('range'), { pos: [0, 0] }), { edges: true });
    expect(obj.getObjectByName('itemEdge')).toBeUndefined();
  });
  test('disposeGroup은 공유 지오메트리·재질을 버리지 않는다', () => {
    const g = buildItems(floor([createItem(kp('oven'), { pos: [0, 0] })]), { v3: {} });
    const geo = g.children[0].children[0].geometry, mat = g.children[0].children[0].material;
    const gd = vi.spyOn(geo, 'dispose'), md = vi.spyOn(mat, 'dispose');
    disposeGroup(g);
    expect(gd).not.toHaveBeenCalled(); expect(md).not.toHaveBeenCalled();
  });
  // 계획 17 Task 5 리뷰: 색 바꾼 아이템의 스테인리스(tintedSteel)는 아이템 전용이라 버리고, 병합 지오메트리는 캐시가 나눠 쓰니 남긴다.
  test('색 바꾼 형상 아이템: disposeGroup이 아이템 전용 스테인리스 재질만 한 번 버리고 공유 지오메트리는 남긴다', () => {
    const p = kp('worktable');
    const g = buildItems(floor([createItem(p, { pos: [0, 0], color: '#ff0000' })]), { v3: {} });
    const steel = g.children[0].getObjectByName('shape-steel');
    expect(steel.material.userData.perMesh).toBe(true);
    expect(steel.material.color.getHexString()).toBe('ff0000');
    const md = vi.spyOn(steel.material, 'dispose'), gd = vi.spyOn(steel.geometry, 'dispose');
    try {
      disposeGroup(g);
      expect(md).toHaveBeenCalledTimes(1); expect(gd).not.toHaveBeenCalled();
    } finally { gd.mockRestore(); }
  });
  // items3d 모듈 배선: 헤어라인 텍스처 도착(onShapeTexturesReady)이 에셋 도착과 같은 길(assetsChanged → onAssetsReady)로 view3d에 닿는다.
  test('헤어라인 텍스처가 도착하면 onAssetsReady가 한 틱 뒤 불리고 assetsVersion이 오른다', async () => {
    __reset();
    const seen = vi.fn(), off = onAssetsReady(seen), v0 = assetsVersion();
    try {
      __notifyShapeTexturesReady();
      expect(seen).not.toHaveBeenCalled();                            // 알림은 다음 틱(assetsChanged의 묶음)
      await new Promise(r => setTimeout(r, 0));
      expect(seen).toHaveBeenCalledTimes(1);
      expect(assetsVersion()).toBe(v0 + 1);
    } finally { off(); }
  });
});
