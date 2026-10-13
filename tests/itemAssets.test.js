// 제품 실사 에셋 런타임 로더(2026-10-13 · 계획 15 Task B · 사전 검토 p15-preflight I-6 · I-10 · I-11 · S-4).
// 로더는 __setLoader로 바꿔 끼운다: 단위 테스트는 GLB도 네트워크도 건드리지 않는다.
import { test, expect, vi } from 'vitest';
import * as THREE from 'three';
import { assetUrl, enableAssets, templateOf, requestAsset, onAssetsReady, assetsVersion, fitClone, __setLoader, __reset } from '../src/view3d/itemAssets.js';

const box = (w, h, d, y0 = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial()); m.position.y = y0 + h / 2; const g = new THREE.Group(); g.add(m); return g; };
const flush = () => new Promise(r => setTimeout(r, 0));

test('assetUrl은 product.asset이 있을 때만 models/<asset>.glb', () => {
  expect(assetUrl({ id: 'chair-dining', asset: 'chair-dining' })).toBe('models/chair-dining.glb');
  expect(assetUrl({ id: 'x' })).toBeNull();
});

test('enableAssets 전에는 requestAsset이 아무것도 하지 않는다(단위 테스트·2D 경로가 네트워크를 건드리지 않는다)', async () => {
  __reset(); const loader = vi.fn(() => Promise.resolve(box(1, 1, 1))); __setLoader(loader);
  requestAsset({ id: 'chair-dining', asset: 'chair-dining' }); await flush();
  expect(loader).not.toHaveBeenCalled();
  enableAssets(); requestAsset({ id: 'chair-dining', asset: 'chair-dining' }); await flush(); await flush();
  expect(loader).toHaveBeenCalledTimes(1);
});

test('종류당 한 번만 받고, 한 틱에 모아 알리며 버전이 오른다 · 실패는 다시 시도하지 않는다', async () => {
  __reset(); enableAssets();
  const loader = vi.fn(url => (url.includes('bad') ? Promise.reject(new Error('404')) : Promise.resolve(box(0.45, 0.9, 0.5))));
  __setLoader(loader);
  const seen = []; const off = onAssetsReady(v => seen.push(v));
  const v0 = assetsVersion();
  requestAsset({ id: 'chair-dining', asset: 'chair-dining' }); requestAsset({ id: 'chair-dining', asset: 'chair-dining' });
  requestAsset({ id: 'bad', asset: 'bad' }); requestAsset({ id: 'bad', asset: 'bad' });
  await flush(); await flush(); await flush();
  expect(loader).toHaveBeenCalledTimes(2);
  expect(templateOf('chair-dining')).toBeTruthy();
  expect(templateOf('bad')).toBeNull();
  expect(seen.length).toBe(1);                               // 같은 틱에 도착한 둘은 알림 한 번(사전 검토 I-11)
  expect(assetsVersion()).toBe(v0 + 1);
  requestAsset({ id: 'bad', asset: 'bad' }); await flush();
  expect(loader).toHaveBeenCalledTimes(2);
  off();
});

test('템플릿은 바닥 중심·bbox·shared 표시를 갖고, fitClone은 아이템 크기에 축별로 맞추며 지오메트리·재질을 공유한다', async () => {
  __reset(); enableAssets(); __setLoader(() => Promise.resolve(box(0.45, 0.9, 0.5, 0.1)));
  requestAsset({ id: 'chair-dining', asset: 'chair-dining' }); await flush(); await flush(); await flush();
  const t = templateOf('chair-dining');
  expect(t.userData.bbox.min[1]).toBeCloseTo(0, 6);
  expect(t.getObjectByProperty('isMesh', true).userData.shared).toBe(true);
  const item = { id: 'i1', productId: 'chair-dining', size: [900, 1000, 900], z: 0 };
  const c = fitClone(t, item);
  const mesh = c.getObjectByProperty('isMesh', true);
  expect(mesh.geometry).toBe(t.getObjectByProperty('isMesh', true).geometry);
  expect(mesh.material).toBe(t.getObjectByProperty('isMesh', true).material);
  const bb = new THREE.Box3().setFromObject(c);
  expect(bb.max.x - bb.min.x).toBeCloseTo(0.9, 3); expect(bb.max.z - bb.min.z).toBeCloseTo(1.0, 3); expect(bb.max.y - bb.min.y).toBeCloseTo(0.9, 3);
  expect((bb.max.y + bb.min.y) / 2).toBeCloseTo(0, 3);
});

// 사전 검토 S-4: normalize가 position.set(-c)로 덮어쓰면 루트에 원래 위치가 있는 장면(x = 5)이 중심 −5로 어긋났다 — position.sub(c)여야 0.
test('normalize는 루트의 원래 위치를 빼서 맞춘다(덮어쓰지 않는다) — 중심 0 · 바닥 0', async () => {
  __reset(); enableAssets();
  const g = box(0.4, 0.8, 0.4, 0.2); g.position.set(5, 0, -3);
  __setLoader(() => Promise.resolve(g));
  requestAsset({ id: 'p', asset: 'p' }); await flush(); await flush();
  const { min, max } = templateOf('p').userData.bbox;
  expect((min[0] + max[0]) / 2).toBeCloseTo(0, 6); expect((min[2] + max[2]) / 2).toBeCloseTo(0, 6); expect(min[1]).toBeCloseTo(0, 6);
});

// 2026-10-13 · 리뷰 B-m1: 메시 없는 장면은 빈 Box3 → bbox가 NaN·±Inf인 채 정상 템플릿으로 캐시돼 아이템이 아무것도 그리지 않았다.
// 실패와 같은 길이어야 한다: 템플릿 없음(상자 그대로) · 알림 묶음 한 번 · 다시 받지 않음 · 예외가 밖으로 새지 않음.
test('메시 없는 장면은 실패로 친다 — 템플릿 null · 버전 한 번 · 예외가 새지 않는다', async () => {
  __reset(); enableAssets();
  const loader = vi.fn(() => Promise.resolve(new THREE.Group())); __setLoader(loader);
  const unhandled = vi.fn(); process.on('unhandledRejection', unhandled);
  try {
    const seen = []; const off = onAssetsReady(v => seen.push(v));
    const v0 = assetsVersion();
    expect(() => requestAsset({ id: 'hollow', asset: 'hollow' })).not.toThrow();
    await flush(); await flush(); await flush();
    expect(templateOf('hollow')).toBeNull();
    expect(seen.length).toBe(1);
    expect(assetsVersion()).toBe(v0 + 1);
    requestAsset({ id: 'hollow', asset: 'hollow' }); await flush();
    expect(loader).toHaveBeenCalledTimes(1);                         // 실패와 같이 다시 시도하지 않는다
    expect(unhandled).not.toHaveBeenCalled();
    off();
  } finally { process.off('unhandledRejection', unhandled); }
});
