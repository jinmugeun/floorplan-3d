// 스테인리스 형상 진입점(계획 17 Task 5). items3d.itemMesh가 부른다: 제품에 shape가 있거나(엑셀 카탈로그) 도면 기구면 여기서,
// 아니면(문·창·기둥·환기 부속·숨김 단종 제품) 예전 itemShapes.shapeFor/simpleMesh로 선다 — 옛 프로젝트의 단종 제품은 옛 모습 그대로다.
// 돌려주는 Group: 재질별 메시(지오메트리·재질 공유, userData.shared) + userData.assetSize(충돌 상자 선 크기 — paintItem 규칙).
import * as THREE from 'three';
import { createParts } from './parts.js';
import { cachedShape, shapeKey } from './merge.js';
import { shapeMaterial, tintedSteel } from './materials.js';
import { genericSpec, isThin, SHAPE_FAMILIES } from '../../products/shapeNames.js';
import { ITEM_BASE_COLOR } from '../itemShapes.js';
import { range, kettle, ricecooker, oven, griddle } from './cook.js';
import { sink, dishwasher } from './wash.js';
import { cabinet, rack, cart } from './store.js';
import { worktable, counter, table, chair } from './serve.js';
import { hood, machine, wallunit, panel } from './misc.js';
import { enclosure } from './enclosure.js';

export const FAMILY = { worktable, sink, range, kettle, ricecooker, oven, griddle, dishwasher, cabinet, hood, rack, cart, counter, table, chair, machine, wallunit, panel, enclosure };
export { SHAPE_FAMILIES };
export const GENERIC_ID = 'equip-generic';

export function shapeSpecFor(item, product) {
  if (!item || item.kind === 'opening' || item.kind === 'column' || item.kind === 'door' || item.kind === 'window') return null;
  if (product?.shape && FAMILY[product.shape]) return { shape: product.shape, opts: product.shapeOpts ?? {} };
  if (item.productId === GENERIC_ID) return genericSpec(item);
  return null;
}

// 형상 부품 목록(병합 전) — 테스트가 바운딩 박스를 재는 데 쓴다.
export function shapeParts(shape, opts, sizeMm) {
  const P = createParts(sizeMm.map(v => v / 1000));
  FAMILY[shape](P, opts ?? {});
  return P.list;
}

// schema 기본 색(ITEM_BASE_COLOR)이나 제품 색이면 칠하지 않는다(엑셀 제품의 color).
const customColor = (item, product) => {
  const c = typeof item?.color === 'string' ? item.color.toLowerCase() : '';
  return c && c !== ITEM_BASE_COLOR && c !== String(product?.color ?? ITEM_BASE_COLOR).toLowerCase() ? c : null;
};

// 형상이 감당하지 못하는 크기를 돌린다: 아주 얇으면 판, 아주 낮으면(< 300 mm) 받침(작업대 꼴). 사용자가 크기를 줄여도 박스 밖으로 안 나간다.
const LOW_OK = new Set(['worktable', 'panel', 'cart', 'wallunit', 'machine', 'sink', 'enclosure']);   // 함체는 비율로 늘어나 낮아도 같은 꼴(기본 높이 310)
export function fitSpec(spec, sizeMm) {
  if (!spec) return null;
  if (isThin(sizeMm)) return { shape: 'panel', opts: {} };
  if (sizeMm[2] < 300 && !LOW_OK.has(spec.shape)) return { shape: 'worktable', opts: {} };
  return spec;
}

export function buildShape(rawSpec, item, product) {
  const spec = fitSpec(rawSpec, item.size);
  if (!spec || !FAMILY[spec.shape]) return null;
  const geos = cachedShape(shapeKey(spec.shape, spec.opts, item.size), () => shapeParts(spec.shape, spec.opts, item.size));
  const tint = customColor(item, product);
  const g = new THREE.Group();
  for (const [mat, geo] of geos) {
    const m = new THREE.Mesh(geo, mat === 'steel' && tint ? tintedSteel(tint) : shapeMaterial(mat));
    m.name = `shape-${mat}`; m.userData.shared = true; m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  g.userData.assetSize = item.size;
  g.userData.shape = spec.shape;
  return g;
}
