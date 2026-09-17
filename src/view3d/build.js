import * as THREE from 'three';
import { wallPolygon } from '../geom/walls.js';
import { roomInnerPolygon } from '../geom/rooms.js';

const M = v => v / 1000;
export const toThree = p => new THREE.Vector3(M(p[0]), M(p[2] ?? 0), M(p[1]));
const COLOR = { wall: 0xe9e6e0, wallTop: 0x3a4351, floor: 0xc9a77a, ceiling: 0xf4f4f2, edge: 0x2b3440, foot: 0x3a4351 };
const TRANSPARENT_OPACITY = { wall: 0.3, floor: 0.6, ceiling: 0.6 };
// 재질은 메시마다 새로 만든다(불투명도·색이 벽/방마다 다르다). perMesh 표시가 있는 재질만 dispose 대상이다.
function surfaceMaterial(kind, view, color = null) {
  const display = view.display ?? 'normal';
  const base = display === 'white' ? 0xffffff : (color ?? COLOR[kind]);
  const twoSided = kind === 'floor' || kind === 'wallTop';
  const m = new THREE.MeshStandardMaterial({ color: base, roughness: kind === 'wall' ? 0.9 : 1, side: twoSided ? THREE.DoubleSide : THREE.FrontSide });
  let opacity = kind === 'wall' ? (view.wallOpacity ?? 1) : kind === 'floor' ? (view.floorOpacity ?? 1) : 1;
  if (display === 'transparent' && TRANSPARENT_OPACITY[kind]) opacity = Math.min(opacity, TRANSPARENT_OPACITY[kind]);
  m.opacity = opacity;
  m.transparent = opacity < 1; // 불투명 면은 투명 정렬 패스를 타지 않게 한다
  m.depthWrite = opacity >= 1; // 반투명 면이 깊이 버퍼를 쓰면 뒤 벽과 z-fighting이 난다
  m.userData.perMesh = true;
  return m;
}
const lineMaterial = color => { const m = new THREE.LineBasicMaterial({ color }); m.userData.perMesh = true; return m; };
const hex = (css, fallback) => (typeof css === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(css) ? new THREE.Color(css).getHex() : fallback);
// 좌표 규약: ShapeGeometry는 XY 평면에 만들어지고(shape y = 월드 남쪽), rotation.x = +π/2 로 눕히면
// (x, y, z) → (x, -z, y) 이므로 shape y가 three z(남쪽)로 간다. 이때 면 법선은 아래(-y)를 향하므로
// 위에서 보는 바닥과 벽 윗면은 DoubleSide, 아래에서 보는 천장은 FrontSide(기본)로 둔다.

function shapeFrom(pts) { const s = new THREE.Shape(); pts.forEach((p, i) => (i ? s.lineTo(M(p[0]), M(p[1])) : s.moveTo(M(p[0]), M(p[1])))); s.closePath(); return s; }

export function buildFloorGroup(floor, view) {
  const g = new THREE.Group();
  for (const r of floor.rooms) {
    const shape = shapeFrom(roomInnerPolygon(r, floor.walls));
    const fl = new THREE.Mesh(new THREE.ShapeGeometry(shape), surfaceMaterial('floor', view, hex(r.floorColor, null)));
    fl.rotation.x = Math.PI / 2; fl.position.y = M(r.floorOffset); fl.name = 'floor'; fl.userData.roomId = r.id; fl.receiveShadow = true;
    g.add(fl);
    if (!r.hideCeiling) {
      const ce = new THREE.Mesh(new THREE.ShapeGeometry(shape), surfaceMaterial('ceiling', view, hex(r.ceilingColor, null)));
      ce.rotation.x = Math.PI / 2; ce.position.y = M(r.floorOffset + r.height); ce.name = 'ceiling'; ce.userData.roomId = r.id; ce.visible = false; g.add(ce);
    }
  }
  for (const w of floor.walls) {
    const poly = wallPolygon(w, floor.walls);
    const geo = new THREE.ExtrudeGeometry(shapeFrom(poly), { depth: M(w.height), bevelEnabled: false });
    geo.rotateX(Math.PI / 2); geo.translate(0, M(w.height), 0);
    const mesh = new THREE.Mesh(geo, surfaceMaterial('wall', view, hex(w.colorOut, null)));
    mesh.name = 'wall'; mesh.userData.wallId = w.id; mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
    const top = new THREE.Mesh(new THREE.ShapeGeometry(shapeFrom(poly)), surfaceMaterial('wallTop', view));
    top.rotation.x = Math.PI / 2; top.position.y = M(w.height) + 0.002; top.name = 'wallTop'; top.userData.wallId = w.id; g.add(top);
    // 컷어웨이로 감춘 벽이 바닥에 남기는 밑동 윤곽(명세 9.3.2). 기본은 숨김, view3d가 필요할 때 켠다.
    const foot = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(poly.map(p => new THREE.Vector3(M(p[0]), 0.004, M(p[1])))), lineMaterial(COLOR.foot));
    foot.name = 'wallFoot'; foot.userData.wallId = w.id; foot.visible = false; g.add(foot);
    if (view.hiddenLine) {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), lineMaterial(COLOR.edge));
      edges.name = 'edges'; edges.userData.wallId = w.id; g.add(edges);
    }
  }
  return g;
}

// 그룹을 씬에서 뺀 뒤 GPU 자원을 해제한다. 재질은 모두 메시 전용(perMesh)이라 함께 dispose한다.
export function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material?.userData?.perMesh) o.material.dispose();
  });
}
