// 3D 덕트(명세 DT-03·DT-07). 구간마다 박스 하나, 연결마다 라이저 하나, 댐퍼마다 얇은 판 하나.
// 컷어웨이·단일 공간 모드는 이 그룹을 건드리지 않는다(자식에 wallId도 roomId도 없어
// cutawayMeshStyle·soloMeshVisible의 판정 밖이다) — v3.ducts 플래그로만 끈다.
import * as THREE from 'three';
import { toThree } from './build.js';
import { riser, damperPos, segmentLength } from '../geom/ducts.js';
import { ductVisible } from '../view2d/ducts2d.js';
import { FLOW_COLORS } from '../vent/equipment.js';

const M = v => v / 1000;
export const DUCT_COLOR3 = { supply: new THREE.Color(FLOW_COLORS.supply).getHex(), exhaust: new THREE.Color(FLOW_COLORS.exhaust).getHex() };
export const DUCT_OPACITY = 0.85;
export const DAMPER_COLOR3 = 0xf59e0b;
const DAMPER_THICKNESS = 0.02;   // m — 구간을 가로지르는 얇은 판

function ductMaterial(duct, { color = null, opacity = DUCT_OPACITY } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color ?? DUCT_COLOR3[duct.kind] ?? DUCT_COLOR3.exhaust), roughness: 0.6, metalness: 0.1 });
  m.opacity = opacity;
  m.transparent = opacity < 1;
  m.depthWrite = opacity >= 1;
  m.userData.perMesh = true;     // disposeGroup이 정리할 표시
  return m;
}
// 월드 각도 → three -Y 회전(아이템과 같은 규약).
const yawOf = (a, b) => -Math.atan2(b[1] - a[1], b[0] - a[0]);

export function segmentMesh(duct, i) {
  const a = duct.points[i], b = duct.points[i + 1], seg = duct.segments[i];
  const len = segmentLength(duct, i);
  if (!a || !b || !seg || !(len > 0)) return null;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(M(len), M(seg.h), M(seg.w)), ductMaterial(duct));
  mesh.position.copy(toThree([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, seg.z]));
  mesh.rotation.y = yawOf(a, b);
  mesh.name = 'duct';
  mesh.userData.ductId = duct.id;
  mesh.userData.segment = i;
  mesh.castShadow = true;
  return mesh;
}

export function riserMesh(item, duct, conn) {
  const r = riser(item, duct, conn);
  if (!r) return null;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(M(r.w), M(r.z1 - r.z0), M(r.h)), ductMaterial(duct));
  mesh.position.copy(toThree([r.pos[0], r.pos[1], (r.z0 + r.z1) / 2]));
  mesh.name = 'riser';
  mesh.userData.ductId = duct.id;
  mesh.userData.point = conn.point;
  return mesh;
}

export function damperMesh(duct, damper, index) {
  const p = damperPos(duct, damper);
  const a = duct.points[damper.segment], b = duct.points[damper.segment + 1];
  const seg = duct.segments[damper.segment];
  if (!p || !a || !b || !seg) return null;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(DAMPER_THICKNESS, M(damper.h), M(damper.w)), ductMaterial(duct, { color: DAMPER_COLOR3, opacity: 1 }));
  mesh.position.copy(toThree([p[0], p[1], seg.z]));
  mesh.rotation.y = yawOf(a, b);
  mesh.name = 'damper';
  mesh.userData.ductId = duct.id;
  mesh.userData.damper = index;
  return mesh;
}

export function buildDucts(floor, view = {}) {
  const g = new THREE.Group();
  g.name = 'ducts';
  const v3 = view.v3 ?? {};
  const items = floor.items ?? [];
  for (const duct of floor.ducts ?? []) {
    if (!ductVisible(duct, v3)) continue;
    for (let i = 0; i < duct.segments.length; i++) { const m = segmentMesh(duct, i); if (m) g.add(m); }
    for (const c of duct.connections) {
      const it = items.find(x => x.id === c.itemId);
      if (!it || it.hidden) continue;                 // 숨긴 설비에는 라이저를 세우지 않는다
      const m = riserMesh(it, duct, c);
      if (m) g.add(m);
    }
    duct.dampers.forEach((x, i) => { const m = damperMesh(duct, x, i); if (m) g.add(m); });
  }
  return g;
}
