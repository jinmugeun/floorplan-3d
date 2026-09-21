import * as THREE from 'three';
import { activeFloor } from '../state/schema.js';
import { wallPolygon } from '../geom/walls.js';
import { roomInnerPolygon } from '../geom/rooms.js';
import { add, mul, eq } from '../geom/vec.js';
import { openingsOnWall, wallPieces, clipRectByOpenings } from '../geom/openings.js';
import { wallAxis, RAD } from '../geom/items.js';
import { buildItems } from './items3d.js';
import { buildDucts } from './ducts3d.js';
import { buildLabels } from './labels3d.js';
import { applyAssignment } from '../materials/texture.js';

const M = v => v / 1000;
export const toThree = p => new THREE.Vector3(M(p[0]), M(p[2] ?? 0), M(p[1]));
const COLOR = { wall: 0xe9e6e0, wallTop: 0x3a4351, floor: 0xc9a77a, ceiling: 0xf4f4f2, edge: 0x2b3440, foot: 0x3a4351 };
export const TRANSPARENT_OPACITY = { wall: 0.3, floor: 0.6, ceiling: 0.6 };
// 재질은 메시마다 새로 만든다(불투명도·색이 벽/방마다 다르다). perMesh 표시가 있는 재질만 dispose 대상이다.
// worldUv: uv가 월드 미터인 지오메트리(ShapeGeometry·ExtrudeGeometry)는 면 크기 대신 미터당 반복 수를 쓴다.
function surfaceMaterial(kind, view, color = null, { assignment = null, faceSize = null, worldUv = false } = {}) {
  const display = view.display ?? 'normal';
  const base = display === 'white' ? 0xffffff : (color ?? COLOR[kind]);
  const twoSided = kind === 'floor' || kind === 'wallTop';
  const m = new THREE.MeshStandardMaterial({ color: base, roughness: kind === 'wall' ? 0.9 : 1, side: twoSided ? THREE.DoubleSide : THREE.FrontSide });
  const key = kind === 'wallTop' ? 'wall' : kind; // 벽 윗면은 벽과 같은 불투명도를 쓴다
  let opacity = key === 'wall' ? (view.wallOpacity ?? 1) : key === 'floor' ? (view.floorOpacity ?? 1) : 1;
  if (display === 'transparent' && TRANSPARENT_OPACITY[key]) opacity = Math.min(opacity, TRANSPARENT_OPACITY[key]);
  m.opacity = opacity;
  m.transparent = opacity < 1; // 불투명 면은 투명 정렬 패스를 타지 않게 한다
  m.depthWrite = opacity >= 1; // 반투명 면이 깊이 버퍼를 쓰면 뒤 벽과 z-fighting이 난다
  m.userData.perMesh = true;
  // 마감재 지정이 있으면 무늬 텍스처를 붙인다(렌더 우선순위 region > mat > color).
  if (assignment && (faceSize || worldUv)) applyAssignment(m, assignment, faceSize, { display, worldUv });
  return m;
}
const lineMaterial = color => { const m = new THREE.LineBasicMaterial({ color }); m.userData.perMesh = true; return m; };
const hex = (css, fallback) => (typeof css === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(css) ? new THREE.Color(css).getHex() : fallback);
// 좌표 규약: ShapeGeometry는 XY 평면에 만들어지고(shape y = 월드 남쪽), rotation.x = +π/2 로 눕히면
// (x, y, z) → (x, -z, y) 이므로 shape y가 three z(남쪽)로 간다. 이때 면 법선은 아래(-y)를 향하므로
// 위에서 보는 바닥과 벽 윗면은 DoubleSide, 아래에서 보는 천장은 FrontSide(기본)로 둔다.

function shapeFrom(pts) { const s = new THREE.Shape(); pts.forEach((p, i) => (i ? s.lineTo(M(p[0]), M(p[1])) : s.moveTo(M(p[0]), M(p[1])))); s.closePath(); return s; }

// 벽 본체 ExtrudeGeometry의 측벽 uv를 벽 축으로 만든다. three 기본 WorldUVGenerator는 u로 정점의 x·y 중
// "지배 축" 하나를 그대로 써서, 기울어진 벽에서는 벽을 따라 잰 거리가 아니라 축에 투영한 거리가 된다
// (45° 벽에서 무늬가 1/cos45 = 1.414배 늘어나 230 mm 벽돌이 325 mm로 보였다).
// u = w.a에서 벽 방향으로 잰 거리(m), v = 바닥에서의 높이(m)로 두면 각도와 무관하게 "면 크기 ÷ scale"이 성립한다.
// 벽의 모든 면(본체·개구부 조각·방 안쪽 면·마감 영역)이 이 좌표를 쓴다 — 원점이 하나뿐이라 무늬 위상이 저절로 이어진다.
// 좌표: extrude 로컬 z는 0..height이고 rotateX(π/2) + translate(0, height, 0) 뒤 월드 높이 = height − z다.
// 캡(벽 윗면·밑면)은 기본대로 평면 좌표(m)를 쓴다 — 바닥 무늬와 이어진다.
function wallUVGenerator(w, dir) {
  const ax = M(w.a[0]), ay = M(w.a[1]), h = M(w.height);
  return {
    generateTopUV: (geo, v, a, b, c) => [a, b, c].map(i => new THREE.Vector2(v[i * 3], v[i * 3 + 1])),
    generateSideWallUV: (geo, v, a, b, c, d) => [a, b, c, d].map(i =>
      new THREE.Vector2((v[i * 3] - ax) * dir[0] + (v[i * 3 + 1] - ay) * dir[1], h - v[i * 3 + 2])),
  };
}

// 개구부 조각 BoxGeometry의 uv를 벽 축 미터(wallUVGenerator와 같은 규약)로 다시 쓴다.
// 조각마다 0~1 uv + uvShift로 위상을 맞추던 방식은 assignment.angle이 0이 아니면 깨진다 —
// 회전 중심이 조각의 uv 원점(조각 왼쪽·아래 모서리)이라 조각마다 다른 축으로 돌아, 30°에서
// 문 하나를 건너는 동안 무늬 반 칸까지 어긋났다. 좌표를 벽 원점 하나로 통일하면 repeat·offset·
// rotation이 벽의 모든 면에서 같은 값이 되어 위상이 저절로 맞는다.
// 로컬 x = 벽 방향, y = 위, z = 벽 법선. 앞뒤 면(±z)은 (u, 높이)를 그대로 쓰고,
// 개구부 단면(±x)과 인방 밑·창 밑(±y)은 앞면에서 두께만큼 이어 펼친 좌표를 쓴다.
function metricBoxUv(geo, { u0, u1, z0, z1 }, thickness) {
  const uc = (u0 + u1) / 2, zc = (z0 + z1) / 2, t = thickness / 2;
  const pos = geo.attributes.position, uv = geo.attributes.uv, idx = geo.index;
  for (const grp of geo.groups) {
    const mi = grp.materialIndex, s = mi === 0 || mi === 2 ? 1 : -1; // +x·+y는 바깥쪽으로 펼친다
    for (let k = grp.start; k < grp.start + grp.count; k++) {
      const i = idx.getX(k);
      const u = uc + pos.getX(i) * 1000, z = zc + pos.getY(i) * 1000, n = pos.getZ(i) * 1000;
      if (mi <= 1) uv.setXY(i, M(u + s * (t - n)), M(z));
      else if (mi <= 3) uv.setXY(i, M(u), M(z + s * (t - n)));
      else uv.setXY(i, M(u), M(z));
    }
  }
  uv.needsUpdate = true;
  return geo;
}

// 마감 영역 평면의 uv도 벽 축 미터로 다시 쓴다. 'out' 면은 평면을 180° 돌려 붙이므로
// 로컬 +x가 벽 끝점 쪽을 향한다(s = −1) — 그래도 uv는 늘 w.a에서 잰 u다.
function metricPlaneUv(geo, { u0, u1, z0, z1 }, s) {
  const uc = (u0 + u1) / 2, zc = (z0 + z1) / 2;
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, M(uc + s * pos.getX(i) * 1000), M(zc + pos.getY(i) * 1000));
  uv.needsUpdate = true;
  return geo;
}

// 방 폴리곤의 i번째 변(points[i] → points[i+1])에 대응하는 벽. roomInnerPolygon도 같은 순서를 쓴다.
function edgeWall(room, walls, i) {
  const a = room.points[i], b = room.points[(i + 1) % room.points.length];
  return walls.find(x => (eq(x.a, a) && eq(x.b, b)) || (eq(x.a, b) && eq(x.b, a))) ?? null;
}

// 3D 씬을 다시 만들어야 하는지 가리는 서명. buildFloorGroup이 읽는 값만 담는다:
// 여기 없는 값(sun, cameraPreset, projection, 벽 관련 v3 …)이 바뀌어도 씬을 다시 만들지 않는다. 아이템 표시 플래그(v3)는 아이템 메시를 만들 때 읽으므로 서명에 넣는다.
export function sceneSignature(state) {
  const f = activeFloor(state) ?? { walls: [], rooms: [] }; // 활성 층이 없어도 구독자가 예외를 던지지 않게
  const v = state.view ?? {};
  const v3 = v.v3 ?? {};
  return JSON.stringify([f.walls, f.rooms, f.items, f.ducts ?? [], state.activeFloor ?? 0, v.display, v.hiddenLine, v.wallOpacity, v.floorOpacity, v3.floorItems, v3.wallItems, v3.ceilingItems, v3.structures, v3.collision, v3.ducts, v3.ductLabels, v3.equipLabels]);
}

// 벽 면의 일부만 다른 재질로 덮는 영역(마감재 편집기). 벽면에서 2 mm 앞으로 띄워 z-파이팅을 피한다.
// side 'in' = 벽 법선 +n 쪽, 'out' = -n 쪽. 두 방이 공유하는 벽의 안쪽 두 면을 따로 나누는 것은 범위 밖이다.
// 영역도 벽 본체처럼 개구부를 피해 조각으로 쪼갠다 — 통판이면 문·창 구멍을 도로 막는다.
// 조각의 uv도 벽 축 미터라(metricPlaneUv) 무늬 위상이 영역 전체·벽 본체와 저절로 이어진다.
function addRegionMeshes(g, w, view, openings = []) {
  const { dir, n, len, rot } = wallAxis(w);
  for (const side of ['in', 'out']) {
    const s = side === 'in' ? 1 : -1;
    for (const rg of w.regions?.[side] ?? []) {
      const u0 = rg.kind === 'band' ? 0 : rg.u0, u1 = rg.kind === 'band' ? len : rg.u1;
      if (!(u1 - u0 > 0) || !(rg.z1 - rg.z0 > 0)) continue;
      if (!rg.mat) continue;                        // 재질 없는 영역은 벽면을 불투명 회색 판으로 덮지 않는다
      for (const pc of clipRectByOpenings({ u0, u1, z0: rg.z0, z1: rg.z1 }, openings)) {
        const width = pc.u1 - pc.u0, height = pc.z1 - pc.z0;
        const mat = surfaceMaterial('wall', view, null, { assignment: rg.mat, worldUv: true });
        mat.side = THREE.DoubleSide;
        const mesh = new THREE.Mesh(metricPlaneUv(new THREE.PlaneGeometry(M(width), M(height)), pc, s), mat);
        const c = add(w.a, mul(dir, (pc.u0 + pc.u1) / 2));
        const off = mul(n, s * (w.thickness / 2 + 2));
        mesh.position.copy(toThree([c[0] + off[0], c[1] + off[1], (pc.z0 + pc.z1) / 2]));
        mesh.rotation.y = -RAD(rot) + (s > 0 ? 0 : Math.PI); // 평면의 기본 법선(+z)을 벽 법선에 맞춘다
        mesh.name = 'wallRegion'; mesh.userData.wallId = w.id; mesh.userData.side = side; mesh.userData.regionId = rg.id;
        g.add(mesh);
      }
    }
  }
}

export function buildFloorGroup(floor, view) {
  const g = new THREE.Group();
  for (const r of floor.rooms) {
    const inner = roomInnerPolygon(r, floor.walls);
    const shape = shapeFrom(inner);
    // ShapeGeometry는 정점 좌표(미터)를 그대로 uv로 쓴다 → worldUv. 방 크기와 무관하게 무늬 한 칸이 같은 크기로 나온다.
    const fl = new THREE.Mesh(new THREE.ShapeGeometry(shape), surfaceMaterial('floor', view, hex(r.floorColor, null), { assignment: r.floorMat, worldUv: true }));
    fl.rotation.x = Math.PI / 2; fl.position.y = M(r.floorOffset); fl.name = 'floor'; fl.userData.roomId = r.id; fl.receiveShadow = true;
    g.add(fl);
    if (!r.hideCeiling) {
      const ce = new THREE.Mesh(new THREE.ShapeGeometry(shape), surfaceMaterial('ceiling', view, hex(r.ceilingColor, null), { assignment: r.ceilingMat, worldUv: true }));
      ce.rotation.x = Math.PI / 2; ce.position.y = M(r.floorOffset + r.height); ce.name = 'ceiling'; ce.userData.roomId = r.id; ce.visible = false; g.add(ce);
    }
    // 방 안쪽에서 보이는 벽면 색(colorIn). 내부 폴리곤보다 5 mm 더 들여 z-파이팅을 피한다.
    // 한 벽은 메시 하나다: colorOut은 벽 본체 전체(바깥면·개구부 단면), colorIn은 그 벽을 소유한 모든 방의
    // 안쪽 면에 같은 색으로 칠해진다. 방마다 다른 내벽 색은 2C(마감재)가 벽면을 방별로 나눌 때 가능해진다.
    const faces = roomInnerPolygon(r, floor.walls, 5);
    faces.forEach((p, i) => {
      const q = faces[(i + 1) % faces.length];
      const w = edgeWall(r, floor.walls, i);
      if (!w) return;
      const faceH = Math.min(r.height, w.height);
      const faceW = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (!(faceW > 0) || !(faceH > 0)) return;
      // 면의 두 끝 p·q를 벽 축에 투영해 이 면이 덮는 u 구간을 구한다(면은 벽과 평행하다).
      // 개구부 조각도 벽 축 u로 나오므로, 같은 좌표로 자른 뒤 p→q 위의 점으로 되돌린다.
      const { dir } = wallAxis(w);
      const proj = pt => (pt[0] - w.a[0]) * dir[0] + (pt[1] - w.a[1]) * dir[1];
      const uP = proj(p), uQ = proj(q), fwd = uQ >= uP;
      // 면 조각 하나. uA·uB는 조각 양 끝의 벽 축 u(mm), z는 벽 밑에서 잰 높이(mm)다.
      // uv는 벽 본체와 같은 벽 축 미터(u, 높이)다 — 원점이 벽 하나뿐이라 조각끼리도, 개구부 없는
      // 통면·본체와도 무늬 위상이 이어지고, 무늬를 회전시켜도(assignment.angle) 같은 축으로 돈다.
      const addFacePiece = (uA, uB, z0, z1) => {
        const at = u => { const s = (fwd ? u - uP : uP - u) / faceW; return [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s]; };
        const A = at(uA), B = at(uB), y0 = M(r.floorOffset + z0), y1 = M(r.floorOffset + z1);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([
          M(A[0]), y0, M(A[1]), M(B[0]), y0, M(B[1]), M(B[0]), y1, M(B[1]), M(A[0]), y1, M(A[1]),
        ], 3));
        geo.setIndex([0, 1, 2, 0, 2, 3]);
        // uv의 v는 벽 밑에서 잰 높이(z)를 쓴다 — 지오메트리 y(= floorOffset + z, 월드 높이)를 쓰면
        // floorOffset ≠ 0인 방에서 이 면의 무늬가 같은 벽의 본체(metricBoxUv)·개구부 단면·영역
        // (metricPlaneUv)과 floorOffset만큼 위상이 어긋난다. 모두 벽 밑 기준이라야 원점이 하나다.
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([M(uA), M(z0), M(uB), M(z0), M(uB), M(z1), M(uA), M(z1)], 2));
        geo.computeVertexNormals();
        const face = new THREE.Mesh(geo, surfaceMaterial('wall', view, hex(w.colorIn, null), { assignment: w.matIn, worldUv: true }));
        face.name = 'wallFace'; face.userData.wallId = w.id; face.userData.roomId = r.id;
        // 방 폴리곤의 회전 방향이 반대로 나올 수 있어(법선이 밖을 향할 수 있어) 양면으로 둔다.
        face.material.side = THREE.DoubleSide;
        g.add(face);
      };
      // 안쪽 면도 벽 본체와 같은 조각으로 낸다 — 통판이면 본체가 뚫어 놓은 문·창을 방 쪽에서 도로 막는다.
      const holes = openingsOnWall(floor.items, w);
      if (!holes.length) { addFacePiece(uP, uQ, 0, faceH); return; }
      for (const pc of wallPieces({ ...w, height: faceH }, holes, { start: Math.min(uP, uQ), end: Math.max(uP, uQ) })) {
        addFacePiece(fwd ? pc.u0 : pc.u1, fwd ? pc.u1 : pc.u0, pc.z0, pc.z1);
      }
    });
  }
  for (const w of floor.walls) {
    const poly = wallPolygon(w, floor.walls);
    const openings = openingsOnWall(floor.items, w);
    const { dir, len, rot } = wallAxis(w);
    // 벽 본체 메시 하나(및 hiddenLine이면 그 엣지)를 그룹에 넣는다. 개구부가 있는 벽은 이 함수를
    // 조각마다 부른다 — 모두 같은 name: 'wall' / userData.wallId라 컷어웨이가 그대로 동작한다.
    // 지오메트리는 모두 벽 축 미터 uv라 반복은 월드 uv(미터당 반복 수)로 잡는다.
    const addWallMesh = (geo, pos = null, rotY = 0) => {
      const mesh = new THREE.Mesh(geo, surfaceMaterial('wall', view, hex(w.colorOut, null), { assignment: w.matOut, worldUv: true }));
      if (pos) mesh.position.copy(pos);
      mesh.rotation.y = rotY;
      mesh.name = 'wall'; mesh.userData.wallId = w.id; mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh);
      if (view.hiddenLine) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), lineMaterial(COLOR.edge));
        edges.name = 'edges'; edges.userData.wallId = w.id; g.add(edges);
      }
    };
    if (!openings.length) {
      const geo = new THREE.ExtrudeGeometry(shapeFrom(poly), { depth: M(w.height), bevelEnabled: false, UVGenerator: wallUVGenerator(w, dir) });
      geo.rotateX(Math.PI / 2); geo.translate(0, M(w.height), 0);
      addWallMesh(geo);
    } else {
      // 개구부가 있는 벽은 조각 박스로 쌓는다. 벽 접합(다른 벽이 끝점을 공유)만큼 범위를 늘려
      // 모서리에서 빈틈이 생기지 않게 한다(wallPolygon과 같은 규칙).
      const joined = q => floor.walls.some(o => o.id !== w.id && (eq(o.a, q) || eq(o.b, q)));
      const start = joined(w.a) ? -w.thickness / 2 : 0;
      const end = len + (joined(w.b) ? w.thickness / 2 : 0);
      for (const pc of wallPieces(w, openings, { start, end })) {
        // uv를 벽 축 미터로 다시 써서 조각끼리도, 개구부 없는 벽과도 무늬가 이어진다(회전 각도가 있어도).
        const geo = metricBoxUv(new THREE.BoxGeometry(M(pc.u1 - pc.u0), M(pc.z1 - pc.z0), M(w.thickness)), pc, w.thickness);
        const c = add(w.a, mul(dir, (pc.u0 + pc.u1) / 2));
        addWallMesh(geo, toThree([c[0], c[1], (pc.z0 + pc.z1) / 2]), -RAD(rot));
      }
    }
    // 벽 윗면도 월드 uv(shape의 x/y)라 벽이 회전해 있어도 미터당 반복 수로 잡아야 크기가 맞는다.
    const top = new THREE.Mesh(new THREE.ShapeGeometry(shapeFrom(poly)), surfaceMaterial('wallTop', view, null, { assignment: w.matOut, worldUv: true }));
    top.rotation.x = Math.PI / 2; top.position.y = M(w.height) + 0.002; top.name = 'wallTop'; top.userData.wallId = w.id; g.add(top);
    // 컷어웨이로 감춘 벽이 바닥에 남기는 밑동 윤곽(명세 9.3.2). 기본은 숨김, view3d가 필요할 때 켠다.
    const foot = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(poly.map(p => new THREE.Vector3(M(p[0]), 0.004, M(p[1])))), lineMaterial(COLOR.foot));
    foot.name = 'wallFoot'; foot.userData.wallId = w.id; foot.visible = false; g.add(foot);
    addRegionMeshes(g, w, view, openings);
  }
  g.add(buildItems(floor, view));
  g.add(buildDucts(floor, view));
  g.add(buildLabels(floor, view));
  return g;
}

// 그룹을 씬에서 뺀 뒤 GPU 자원을 해제한다. 재질은 모두 메시 전용(perMesh)이라 함께 dispose한다.
export function disposeGroup(g) {
  g.traverse(o => {
    // 스프라이트의 지오메트리는 three가 모듈 수준에서 모든 스프라이트와 공유한다 — 층을 다시
    // 지을 때마다 공용 GPU 버퍼를 버리면 다음에 만드는 스프라이트가 버려진 버퍼를 쓴다.
    if (o.geometry && !o.isSprite) o.geometry.dispose();
    if (o.material?.userData?.perMesh) {
      if (o.material.map?.userData?.clone) o.material.map.dispose(); // 캐시 원본은 남긴다
      o.material.dispose();
    }
  });
}
