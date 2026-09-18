import { wallNormal } from '../geom/walls.js';
import { centroid } from '../geom/rooms.js';
import { sub, dot, mul } from '../geom/vec.js';

// 벽이 방 하나에만(또는 어느 방에도) 속하면 외벽, 둘 이상에 속하면 내벽(공유 벽)이다.
export function wallOwners(floor, wall) { return floor.rooms.filter(r => r.wallIds.includes(wall.id)); }
export function isExteriorWall(floor, wall) { return wallOwners(floor, wall).length <= 1; }

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
  for (const w of floor.walls) {
    const owners = wallOwners(floor, w);
    if (owners.length !== 1) continue;
    const mid = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
    let n = wallNormal(w);
    if (dot(n, sub(centroid(owners[0].points), mid)) > 0) n = mul(n, -1); // 바깥쪽
    const toCam = sub([camPos[0], camPos[1]], mid);
    if (dot(n, toCam) > 0) out.add(w.id);
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
