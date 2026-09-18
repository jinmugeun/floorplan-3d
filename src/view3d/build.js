import * as THREE from 'three';
import { activeFloor } from '../state/schema.js';
import { wallPolygon, wallLength } from '../geom/walls.js';
import { roomInnerPolygon } from '../geom/rooms.js';
import { add, mul, eq } from '../geom/vec.js';
import { openingsOnWall, wallPieces } from '../geom/openings.js';
import { wallAxis, RAD } from '../geom/items.js';
import { buildItems } from './items3d.js';
import { applyAssignment } from '../materials/texture.js';

const M = v => v / 1000;
export const toThree = p => new THREE.Vector3(M(p[0]), M(p[2] ?? 0), M(p[1]));
const COLOR = { wall: 0xe9e6e0, wallTop: 0x3a4351, floor: 0xc9a77a, ceiling: 0xf4f4f2, edge: 0x2b3440, foot: 0x3a4351 };
export const TRANSPARENT_OPACITY = { wall: 0.3, floor: 0.6, ceiling: 0.6 };
// 재질은 메시마다 새로 만든다(불투명도·색이 벽/방마다 다르다). perMesh 표시가 있는 재질만 dispose 대상이다.
function surfaceMaterial(kind, view, color = null, { assignment = null, faceSize = null } = {}) {
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
  if (assignment && faceSize) applyAssignment(m, assignment, faceSize, { display });
  return m;
}
// 폴리곤을 감싸는 사각형 크기(mm). 바닥·천장 무늬의 반복 횟수를 여기서 구한다.
function polySize(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}
const lineMaterial = color => { const m = new THREE.LineBasicMaterial({ color }); m.userData.perMesh = true; return m; };
const hex = (css, fallback) => (typeof css === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(css) ? new THREE.Color(css).getHex() : fallback);
// 좌표 규약: ShapeGeometry는 XY 평면에 만들어지고(shape y = 월드 남쪽), rotation.x = +π/2 로 눕히면
// (x, y, z) → (x, -z, y) 이므로 shape y가 three z(남쪽)로 간다. 이때 면 법선은 아래(-y)를 향하므로
// 위에서 보는 바닥과 벽 윗면은 DoubleSide, 아래에서 보는 천장은 FrontSide(기본)로 둔다.

function shapeFrom(pts) { const s = new THREE.Shape(); pts.forEach((p, i) => (i ? s.lineTo(M(p[0]), M(p[1])) : s.moveTo(M(p[0]), M(p[1])))); s.closePath(); return s; }

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
  return JSON.stringify([f.walls, f.rooms, f.items, state.activeFloor ?? 0, v.display, v.hiddenLine, v.wallOpacity, v.floorOpacity, v3.floorItems, v3.wallItems, v3.ceilingItems, v3.structures, v3.collision]);
}

// 벽 면의 일부만 다른 재질로 덮는 영역(마감재 편집기). 벽면에서 2 mm 앞으로 띄워 z-파이팅을 피한다.
// side 'in' = 벽 법선 +n 쪽, 'out' = -n 쪽. 두 방이 공유하는 벽의 안쪽 두 면을 따로 나누는 것은 범위 밖이다.
function addRegionMeshes(g, w, view) {
  const { dir, n, len, rot } = wallAxis(w);
  for (const side of ['in', 'out']) {
    const s = side === 'in' ? 1 : -1;
    for (const rg of w.regions?.[side] ?? []) {
      const u0 = rg.kind === 'band' ? 0 : rg.u0, u1 = rg.kind === 'band' ? len : rg.u1;
      const width = u1 - u0, height = rg.z1 - rg.z0;
      if (!(width > 0) || !(height > 0)) continue;
      const mat = surfaceMaterial('wall', view, null, { assignment: rg.mat, faceSize: [width, height] });
      mat.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(M(width), M(height)), mat);
      const c = add(w.a, mul(dir, (u0 + u1) / 2));
      const off = mul(n, s * (w.thickness / 2 + 2));
      mesh.position.copy(toThree([c[0] + off[0], c[1] + off[1], (rg.z0 + rg.z1) / 2]));
      mesh.rotation.y = -RAD(rot) + (s > 0 ? 0 : Math.PI); // 평면의 기본 법선(+z)을 벽 법선에 맞춘다
      mesh.name = 'wallRegion'; mesh.userData.wallId = w.id; mesh.userData.side = side; mesh.userData.regionId = rg.id;
      g.add(mesh);
    }
  }
}

export function buildFloorGroup(floor, view) {
  const g = new THREE.Group();
  for (const r of floor.rooms) {
    const inner = roomInnerPolygon(r, floor.walls);
    const shape = shapeFrom(inner);
    const roomSize = polySize(inner);
    const fl = new THREE.Mesh(new THREE.ShapeGeometry(shape), surfaceMaterial('floor', view, hex(r.floorColor, null), { assignment: r.floorMat, faceSize: roomSize }));
    fl.rotation.x = Math.PI / 2; fl.position.y = M(r.floorOffset); fl.name = 'floor'; fl.userData.roomId = r.id; fl.receiveShadow = true;
    g.add(fl);
    if (!r.hideCeiling) {
      const ce = new THREE.Mesh(new THREE.ShapeGeometry(shape), surfaceMaterial('ceiling', view, hex(r.ceilingColor, null), { assignment: r.ceilingMat, faceSize: roomSize }));
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
      const y0 = M(r.floorOffset), y1 = M(r.floorOffset + Math.min(r.height, w.height));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([
        M(p[0]), y0, M(p[1]), M(q[0]), y0, M(q[1]), M(q[0]), y1, M(q[1]), M(p[0]), y1, M(p[1]),
      ], 3));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      geo.computeVertexNormals();
      const faceW = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const face = new THREE.Mesh(geo, surfaceMaterial('wall', view, hex(w.colorIn, null), { assignment: w.matIn, faceSize: [faceW, Math.min(r.height, w.height)] }));
      face.name = 'wallFace'; face.userData.wallId = w.id; face.userData.roomId = r.id;
      // 방 폴리곤의 회전 방향이 반대로 나올 수 있어(법선이 밖을 향할 수 있어) 양면으로 둔다.
      face.material.side = THREE.DoubleSide;
      g.add(face);
    });
  }
  for (const w of floor.walls) {
    const poly = wallPolygon(w, floor.walls);
    const openings = openingsOnWall(floor.items, w);
    // 벽 본체 메시 하나(및 hiddenLine이면 그 엣지)를 그룹에 넣는다. 개구부가 있는 벽은 이 함수를
    // 조각마다 부른다 — 모두 같은 name: 'wall' / userData.wallId라 컷어웨이가 그대로 동작한다.
    const bodySize = [wallLength(w), w.height];
    const addWallMesh = (geo, pos = null, rotY = 0) => {
      const mesh = new THREE.Mesh(geo, surfaceMaterial('wall', view, hex(w.colorOut, null), { assignment: w.matOut, faceSize: bodySize }));
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
      const geo = new THREE.ExtrudeGeometry(shapeFrom(poly), { depth: M(w.height), bevelEnabled: false });
      geo.rotateX(Math.PI / 2); geo.translate(0, M(w.height), 0);
      addWallMesh(geo);
    } else {
      // 개구부가 있는 벽은 조각 박스로 쌓는다. 벽 접합(다른 벽이 끝점을 공유)만큼 범위를 늘려
      // 모서리에서 빈틈이 생기지 않게 한다(wallPolygon과 같은 규칙).
      const { dir, len, rot } = wallAxis(w);
      const joined = q => floor.walls.some(o => o.id !== w.id && (eq(o.a, q) || eq(o.b, q)));
      const start = joined(w.a) ? -w.thickness / 2 : 0;
      const end = len + (joined(w.b) ? w.thickness / 2 : 0);
      for (const pc of wallPieces(w, openings, { start, end })) {
        const geo = new THREE.BoxGeometry(M(pc.u1 - pc.u0), M(pc.z1 - pc.z0), M(w.thickness));
        const c = add(w.a, mul(dir, (pc.u0 + pc.u1) / 2));
        addWallMesh(geo, toThree([c[0], c[1], (pc.z0 + pc.z1) / 2]), -RAD(rot));
      }
    }
    const top = new THREE.Mesh(new THREE.ShapeGeometry(shapeFrom(poly)), surfaceMaterial('wallTop', view, null, { assignment: w.matOut, faceSize: [wallLength(w), w.thickness] }));
    top.rotation.x = Math.PI / 2; top.position.y = M(w.height) + 0.002; top.name = 'wallTop'; top.userData.wallId = w.id; g.add(top);
    // 컷어웨이로 감춘 벽이 바닥에 남기는 밑동 윤곽(명세 9.3.2). 기본은 숨김, view3d가 필요할 때 켠다.
    const foot = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(poly.map(p => new THREE.Vector3(M(p[0]), 0.004, M(p[1])))), lineMaterial(COLOR.foot));
    foot.name = 'wallFoot'; foot.userData.wallId = w.id; foot.visible = false; g.add(foot);
    addRegionMeshes(g, w, view);
  }
  g.add(buildItems(floor, view));
  return g;
}

// 그룹을 씬에서 뺀 뒤 GPU 자원을 해제한다. 재질은 모두 메시 전용(perMesh)이라 함께 dispose한다.
export function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material?.userData?.perMesh) {
      if (o.material.map?.userData?.clone) o.material.map.dispose(); // 캐시 원본은 남긴다
      o.material.dispose();
    }
  });
}
