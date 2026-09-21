import * as THREE from 'three';
import { toThree } from './build.js';
import { productById } from '../products/catalog.js';
import { itemVisible } from '../view2d/items2d.js';
import { RAD } from '../geom/items.js';
import { collidingIds } from '../geom/collide.js';
import { shapeFor, itemMaterial, ITEM_EDGE_COLOR } from './itemShapes.js';

const M = v => v / 1000;
export const itemVisible3 = (item, v3 = {}) => itemVisible(item, v3);
export const COLLIDE_COLOR = '#e5484d';   // 2D의 빨간 테두리와 같은 신호

// 그룹이든 메시든 색을 칠한다(조합 형상은 자식마다 재질이 있다).
export function paintItem(obj, color) {
  obj.traverse(o => { if (o.material?.color) o.material.color.set(color); });
}

// 얇은 윤곽선(v3.itemEdges). 메시마다 자식으로 달아 부모의 변환을 그대로 따르게 한다.
// 선은 재질 하나를 나눠 쓴다(아이템 하나당 하나) — disposeGroup이 perMesh 표시로 정리한다.
function addEdges(obj) {
  const mat = new THREE.LineBasicMaterial({ color: ITEM_EDGE_COLOR, transparent: true, opacity: 0.55 });
  mat.userData.perMesh = true;
  const meshes = [];
  obj.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), mat);
    line.name = 'itemEdge';
    m.add(line);
  }
}

// 조합 형상이 없는 제품의 예전 모양: 박스(원형 기둥은 실린더). 개구부는 벽에 구멍만 내고 메시가 없다.
function simpleMesh(item) {
  const [w, d, h] = item.size;
  const p = productById(item.productId);
  const round = item.kind === 'column' && (p?.symbol === 'columnRound' || p?.symbol === 'circle'); // 'circle'은 옛 파일 호환
  const geo = round
    ? new THREE.CylinderGeometry(M(w / 2), M(w / 2), M(h), 24)
    : new THREE.BoxGeometry(M(w), M(h), M(d));
  const mat = itemMaterial(item);
  if (item.kind === 'window') { mat.transparent = true; mat.opacity = 0.35; }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// 아이템 하나를 3D 오브젝트로. 심벌에 조합 형상이 있으면 Group, 없으면 예전처럼 Mesh다.
// 좌표: 월드 (x, y)가 three (x, z)이고 z(높이)가 three y다. 월드 회전 rot은 three -Y 회전이다.
export function itemMesh(item, { edges = false } = {}) {
  if (item.kind === 'opening') return null;
  const obj = shapeFor(item) ?? simpleMesh(item);
  obj.position.copy(toThree([item.pos[0], item.pos[1], item.z + item.size[2] / 2]));
  obj.rotation.y = -RAD(item.rot);
  obj.name = 'item';
  if (edges) addEdges(obj);
  // 레이캐스트가 자식을 맞혀도 어느 아이템인지 알 수 있게 모든 자손에 id를 박는다(엣지 선까지).
  obj.traverse(o => { o.userData.itemId = item.id; });
  return obj;
}

// 층의 아이템을 3D 오브젝트로 모은 그룹(name 'items'). 숨김·v3 토글은 itemVisible(공유 규칙)이 가린다.
export function buildItems(floor, view = {}) {
  const g = new THREE.Group();
  g.name = 'items';
  const v3 = view.v3 ?? {};
  const edges = v3.itemEdges !== false;
  const bad = v3.collision === false ? null : collidingIds(floor.items ?? []);
  for (const item of floor.items ?? []) {
    if (!itemVisible3(item, v3)) continue;
    const obj = itemMesh(item, { edges });
    if (!obj) continue;
    if (bad?.has(item.id)) paintItem(obj, COLLIDE_COLOR);
    g.add(obj);
  }
  return g;
}
