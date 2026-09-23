import { wallNormal } from '../geom/walls.js';
import { centroid } from '../geom/rooms.js';
import { sub, dot, mul, norm } from '../geom/vec.js';

// 벽이 방 하나에만(또는 어느 방에도) 속하면 외벽, 둘 이상에 속하면 내벽(공유 벽)이다.
export function wallOwners(floor, wall) { return floor.rooms.filter(r => r.wallIds.includes(wall.id)); }
export function isExteriorWall(floor, wall) { return wallOwners(floor, wall).length <= 1; }

// 내벽 컷어웨이의 문턱: |cos(법선, 카메라 방향)|이 이보다 작으면(≈78° 이상 비스듬하면) 남긴다.
export const CUTAWAY_EDGE_COS = 0.2;

// 층 바운딩 박스 중심(월드 mm). 내벽 컷어웨이에서 "카메라 쪽 절반"을 가르는 기준선이다(§17.1 개정).
export function floorCenter(walls = []) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const w of walls) for (const p of [w.a, w.b]) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  return walls.length ? [(x0 + x1) / 2, (y0 + y1) / 2] : [0, 0];
}

export function hiddenWallIds(floor, camPos, elevationDeg, view) {
  const out = new Set();
  const v3 = view?.v3 ?? {};
  // 보기 옵션 "외벽 보기"/"내벽 보기"는 카메라와 무관하게 먼저 적용된다.
  if (v3.outerWalls === false || v3.innerWalls === false) {
    for (const w of floor.walls) {
      const ext = isExteriorWall(floor, w);
      if ((ext && v3.outerWalls === false) || (!ext && v3.innerWalls === false)) out.add(w.id);
    }
  }
  if (!view?.cutaway || elevationDeg >= 70 || camPos[2] <= 0) return out;
  const camXY = [camPos[0], camPos[1]], c = floorCenter(floor.walls);
  for (const w of floor.walls) {
    const owners = wallOwners(floor, w);
    const mid = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
    const toCam = sub(camXY, mid);
    // 외벽(소유 방 ≤ 1 = isExteriorWall)은 "바깥"이 정해진다: 방 중심의 반대쪽 법선이 카메라를
    // 향하면 숨긴다. 아직 방이 닫히지 않은 벽(소유 방 0)은 뒤집을 기준이 없으니 법선 그대로 **한쪽만**
    // 본다 — 양쪽으로 판정하면 그리는 중인 벽이 어느 각도에서나 사라지고, 둘러싼 방이 없어 그 벽이
    // 가리는 설비도 없다(리뷰 I-2 · §17.1의 isExteriorWall = owners.length <= 1).
    if (owners.length <= 1) {
      let n = wallNormal(w);
      if (owners[0] && dot(n, sub(centroid(owners[0].points), mid)) > 0) n = mul(n, -1); // 바깥쪽
      if (dot(n, toCam) > 0) out.add(w.id);
      continue;
    }
    // 내벽(방 2개 이상)은 "바깥"을 정할 수 없다(§17.1 · 감사 §1): 벽 법선의 **양쪽**으로 판정하되,
    // 도면 중심보다 카메라 쪽 절반에 있는 벽만 숨긴다(§17.1 개정 · 리뷰 I-3). 축 정렬 도면을 기본
    // iso(방위 47°·고도 35°)에서 보면 남북 벽도 동서 벽도 |cos| ≈ 0.7이라, 이 반쪽 규칙이 없으면
    // 내벽이 한꺼번에 사라져 3D가 밑동 윤곽(평면도)만 남는다. 먼 쪽 절반은 배경 골격으로 선다.
    if (dot(sub(mid, c), sub(camXY, c)) <= 0) continue;
    // CUTAWAY_EDGE_COS보다 비스듬히 보이는 벽(≈78° 이상)은 가리는 것이 없으므로 남긴다 —
    // 도면의 골격이 다 사라지지 않게 하는 둘째 안전장치다.
    if (Math.abs(dot(norm(wallNormal(w)), norm(toCam))) >= CUTAWAY_EDGE_COS) out.add(w.id);
  }
  return out;
}

// 컷어웨이가 벽 메시 하나에 주는 가시성과 불투명도(순수 규칙: three 없이 테스트된다).
// opacity가 null이면 재질을 건드리지 않는다(선/윗면).
export function cutawayMeshStyle(name, { isHidden = false, seeThrough = false, baseOpacity = 1 } = {}) {
  if (name === 'wallFoot') return { visible: isHidden && !seeThrough, opacity: null }; // 감춘 벽은 밑동 윤곽만 남긴다
  const visible = !isHidden || seeThrough; // wallTop·edges·wallFace도 "벽 투명화"를 따른다
  if (name === 'wall' || name === 'wallFace' || name === 'wallRegion') return { visible, opacity: isHidden && seeThrough ? 0.25 : baseOpacity };
  return { visible, opacity: null };
}

// 단일 공간 모드에서 메시 하나가 보여야 하는지(순수 규칙).
// room이 null이면 단일 공간 모드가 아니다: 벽은 컷어웨이 결과를 그대로 두고, 방 면은 다시 보이게 한다.
// mesh는 { name, visible, userData }만 읽는다.
export function soloMeshVisible(mesh, room, mode = 'iso') {
  const solo = room?.id ?? null;
  if (mesh.userData?.wallId) {
    if (!room) return mesh.visible;
    if (!room.wallIds.includes(mesh.userData.wallId)) return false;
    // wallFace는 방마다 하나씩 있으므로 이웃 방의 면은 숨긴다.
    if (mesh.name === 'wallFace') return mesh.visible && mesh.userData.roomId === solo;
    // wallRegion은 벽 면 전체를 덮는 것이라 방 소속이 없다: 벽 본체와 함께 보이고 숨는다.
    return mesh.visible;
  }
  if (!mesh.userData?.roomId) return mesh.visible;
  if (room) return mesh.userData.roomId === solo && mesh.name !== 'ceiling';
  return mesh.name === 'ceiling' ? mode === 'fp' : true; // 천장은 1인칭에서만 보인다
}

// 컷어웨이를 층 그룹의 벽 메시에 적용한다(§17.1). 바꾸는 것은 **visible과 opacity뿐**이고
// 손댄 메시 수를 돌려준다. view3d.js가 300줄 예산에 닿아 메시 루프를 여기로 옮겼다 — 그 덕에
// 렌더샷(입면도)도 같은 규칙을 쓸 수 있다(§17.4(2)의 shotCutaway).
export function applyCutawayTo(group, { hidden = new Set(), seeThrough = false, baseOpacity = 1 } = {}) {
  let n = 0;
  for (const m of group?.children ?? []) {
    const id = m.userData?.wallId;
    if (!id) continue;
    const { visible, opacity } = cutawayMeshStyle(m.name, { isHidden: hidden.has(id), seeThrough, baseOpacity });
    m.visible = visible;
    if (opacity !== null && m.material) { m.material.opacity = opacity; m.material.transparent = opacity < 1; m.material.depthWrite = opacity >= 1; }
    n += 1;
  }
  return n;
}

// 렌더샷의 컷어웨이(§17.4(2)): 촬영 카메라 기준으로 숨길 벽을 고른다. 고도는 0으로 본다
// (정면도·측면도는 눈높이 도면이다). null이면 컷어웨이 없이 모든 벽을 그린다:
// 천장 평면도('top')는 위에서 내려보므로 벽이 골격이고, 프리셋이 없는 렌더(= 현재 카메라)는
// 화면의 컷어웨이가 이미 적용된 그룹을 그대로 찍는다.
// camPos는 **월드 mm [x, y, z(높이)]**다: three 카메라는 [p.x * 1000, p.z * 1000, p.y * 1000]로 바꿔 넘긴다(M-1).
export function shotCutaway(floor, camPos, preset, view = {}) {
  if (!preset || preset === 'top') return null;
  return hiddenWallIds(floor, camPos, 0, { ...view, cutaway: true });
}
