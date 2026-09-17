import * as THREE from 'three';
import { toThree } from './build.js';
import { productById } from '../products/catalog.js';
import { itemVisible } from '../view2d/items2d.js';
import { RAD } from '../geom/items.js';
import { collidingIds } from '../geom/collide.js';

const M = v => v / 1000;
export const itemVisible3 = (item, v3 = {}) => itemVisible(item, v3);

// 아이템 하나를 박스(원형 기둥은 실린더)로 만든다. 개구부는 벽에 구멍만 내고 메시가 없다.
// 좌표: 월드 (x, y)가 three (x, z)이고 z(높이)가 three y다. 월드 회전 rot은 three -Y 회전이다.
export function itemMesh(item) {
  if (item.kind === 'opening') return null;
  const [w, d, h] = item.size;
  const p = productById(item.productId);
  const round = p?.symbol === 'circle' && item.kind === 'column';
  const geo = round
    ? new THREE.CylinderGeometry(M(w / 2), M(w / 2), M(h), 24)
    : new THREE.BoxGeometry(M(w), M(h), M(d));
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(item.color || '#cfd4da'), roughness: 0.8 });
  if (item.kind === 'window') { mat.transparent = true; mat.opacity = 0.35; }
  mat.userData.perMesh = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(toThree([item.pos[0], item.pos[1], item.z + h / 2]));
  mesh.rotation.y = -RAD(item.rot);
  mesh.name = 'item';
  mesh.userData.itemId = item.id;
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// 층의 아이템을 3D 메시로 모은 그룹(name 'items'). 숨김·v3 토글은 itemVisible(공유 규칙)이 가린다.
export function buildItems(floor, view = {}) {
  const g = new THREE.Group();
  g.name = 'items';
  const v3 = view.v3 ?? {};
  const bad = v3.collision === false ? null : collidingIds(floor.items ?? []);
  for (const item of floor.items ?? []) {
    if (!itemVisible3(item, v3)) continue;
    const mesh = itemMesh(item);
    if (!mesh) continue;
    if (bad?.has(item.id)) mesh.material.color.set('#e5484d');   // 2D의 빨간 테두리와 같은 신호
    g.add(mesh);
  }
  return g;
}
