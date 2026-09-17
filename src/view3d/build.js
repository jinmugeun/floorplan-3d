import * as THREE from 'three';
import { wallPolygon } from '../geom/walls.js';
import { roomInnerPolygon } from '../geom/rooms.js';

const M = v => v / 1000;
export const toThree = p => new THREE.Vector3(M(p[0]), M(p[2] ?? 0), M(p[1]));
const MAT = {
  // 벽 재질은 벽마다 새로 만든다(불투명도가 개별). perMesh 표시가 있는 재질만 dispose 대상이다.
  wall: () => { const m = new THREE.MeshStandardMaterial({ color: 0xe9e6e0, roughness: 0.9, transparent: true }); m.userData.perMesh = true; return m; },
  wallTop: new THREE.MeshStandardMaterial({ color: 0x3a4351, roughness: 1, side: THREE.DoubleSide }),
  floor: new THREE.MeshStandardMaterial({ color: 0xc9a77a, roughness: 1, side: THREE.DoubleSide }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 1 }),
};
// 좌표 규약: ShapeGeometry는 XY 평면에 만들어지고(shape y = 월드 남쪽), rotation.x = +π/2 로 눕히면
// (x, y, z) → (x, -z, y) 이므로 shape y가 three z(남쪽)로 간다. 이때 면 법선은 아래(-y)를 향하므로
// 위에서 보는 바닥과 벽 윗면은 DoubleSide, 아래에서 보는 천장은 FrontSide(기본)로 둔다.

function shapeFrom(pts) { const s = new THREE.Shape(); pts.forEach((p, i) => (i ? s.lineTo(M(p[0]), M(p[1])) : s.moveTo(M(p[0]), M(p[1])))); s.closePath(); return s; }

export function buildFloorGroup(floor, view) {
  const g = new THREE.Group();
  for (const r of floor.rooms) {
    const shape = shapeFrom(roomInnerPolygon(r, floor.walls));
    const fl = new THREE.Mesh(new THREE.ShapeGeometry(shape), MAT.floor);
    fl.rotation.x = Math.PI / 2; fl.position.y = M(r.floorOffset); fl.name = 'floor'; fl.userData.roomId = r.id; fl.receiveShadow = true;
    g.add(fl);
    if (!r.hideCeiling) { const ce = new THREE.Mesh(new THREE.ShapeGeometry(shape), MAT.ceiling); ce.rotation.x = Math.PI / 2; ce.position.y = M(r.floorOffset + r.height); ce.name = 'ceiling'; ce.visible = false; g.add(ce); }
  }
  for (const w of floor.walls) {
    const geo = new THREE.ExtrudeGeometry(shapeFrom(wallPolygon(w, floor.walls)), { depth: M(w.height), bevelEnabled: false });
    geo.rotateX(Math.PI / 2); geo.translate(0, M(w.height), 0);
    const mesh = new THREE.Mesh(geo, MAT.wall());
    mesh.material.opacity = view.wallOpacity ?? 1; mesh.name = 'wall'; mesh.userData.wallId = w.id; mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
    const top = new THREE.Mesh(new THREE.ShapeGeometry(shapeFrom(wallPolygon(w, floor.walls))), MAT.wallTop);
    top.rotation.x = Math.PI / 2; top.position.y = M(w.height) + 0.002; top.name = 'wallTop'; top.userData.wallId = w.id; g.add(top);
  }
  return g;
}

// 그룹을 씬에서 뺀 뒤 GPU 자원을 해제한다. 공유 재질(floor, ceiling, wallTop)은 남긴다.
export function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material?.userData?.perMesh) o.material.dispose();
  });
}
