// 형상 부품 병합·캐시(계획 17 Task 5 · 설계 D10). 부품을 재질별로 하나의 지오메트리로 합쳐 아이템당 draw를 4회 이하로 줄이고,
// 같은 (형상, 옵션, 크기)는 지오메트리 한 벌을 모든 아이템이 나눠 쓴다(userData.shared — disposeGroup이 남긴다).
// 캐시는 층 재빌드 사이에 남는다(같은 템플릿을 다시 지어도 새로 만들지 않는다). 상한을 넘으면 가장 오래 안 쓴 키를 버린다 —
// 버린 지오메트리를 아직 쓰는 메시가 있으면 three가 다음 렌더에 다시 올린다(dispose는 GPU 버퍼만 지운다).
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const SHAPE_CACHE_LIMIT = 512;
const cache = new Map();

export const shapeKey = (shape, opts, sizeMm) => `${shape}|${JSON.stringify(opts ?? {})}|${sizeMm.map(v => Math.round(v)).join('x')}`;

// 'steel'의 uv를 상자 투영 미터로 다시 쓴다: 세로면은 가로결(u = 수평 거리), 윗면은 x·z. 헤어라인 굵기가 면 크기와 무관해진다.
export function boxProjectUv(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, pos.getX(i), pos.getZ(i));
    else if (az >= ax) uv.setXY(i, pos.getX(i), pos.getY(i));
    else uv.setXY(i, pos.getZ(i), pos.getY(i));
  }
  uv.needsUpdate = true;
  return geo;
}

// 부품 목록 → Map(재질 이름 → 병합 지오메트리). 원본 부품 지오메트리는 버린다.
export function mergeParts(list) {
  const groups = new Map();
  for (const { geo, mat } of list) { if (!groups.has(mat)) groups.set(mat, []); groups.get(mat).push(geo); }
  const out = new Map();
  for (const [mat, geos] of groups) {
    const g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (g !== geos[0]) for (const x of geos) x.dispose();
    if (mat === 'steel') boxProjectUv(g);
    g.computeBoundingBox(); g.computeBoundingSphere();
    out.set(mat, g);
  }
  return out;
}

// build: () => 부품 목록. 같은 키는 한 번만 만든다(LRU).
export function cachedShape(key, build) {
  let hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  hit = mergeParts(build());
  cache.set(key, hit);
  if (cache.size > SHAPE_CACHE_LIMIT) {
    const [oldKey, old] = cache.entries().next().value;
    cache.delete(oldKey);
    for (const g of old.values()) g.dispose();
  }
  return hit;
}

export const shapeCacheSize = () => cache.size;
export function clearShapeCache() { for (const m of cache.values()) for (const g of m.values()) g.dispose(); cache.clear(); }
