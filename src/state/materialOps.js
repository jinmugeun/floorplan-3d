// 마감재 상태 변경은 모두 이 파일을 지난다(속성 패널·메뉴·면 피커·마감재 편집기가 같은 함수를 쓴다).
// target = { kind:'wall', id, side:'in'|'out' } | { kind:'floor', id } | { kind:'ceiling', id }
import { activeFloor, normalizeAssignment, normalizeRegion } from './schema.js';
import { wallLength } from '../geom/walls.js';
import { openingsOnWall } from '../geom/openings.js';

export const MAT_TARGET_LABELS = { in: '내벽 재질', out: '외벽 재질', floor: '바닥 재질', ceiling: '천장 재질' };
const matKey = side => (side === 'out' ? 'matOut' : 'matIn');
const sideKey = side => (side === 'out' ? 'out' : 'in');
// 지정을 문서에 넣기 전에 배열을 복사한다: store.dispatch는 mutate 전에 스냅샷을 복제하므로,
// 호출자가 준 offset·scale 배열을 그대로 넣으면 여러 면이 한 배열을 나눠 갖는다(§13.3).
const cloneAssign = a => (a ? { ...a, offset: [...a.offset], ...(a.scale ? { scale: [...a.scale] } : {}) } : null);

// assignment가 null이면 미지정으로 되돌린다. 카탈로그에 없는 id(예: 지워진 재질)는 아무것도
// 바꾸지 않는다 — normalizeAssignment가 그 경우도 null을 돌려주므로, 여기서 미리 구분해
// "명시적 해제"와 "잘못된 입력"을 분간한다(잘못된 입력은 dispatch 자체를 하지 않아 undo 단계도 안 쌓인다).
// opts는 store.dispatch로 그대로 넘어간다(트랜잭션 안에서 여러 면을 한 단계로 바꿀 때 { record: false }가 필요하다).
export function applyMaterial(store, target, assignment, opts = {}) {
  const a = assignment === null ? null : normalizeAssignment(assignment);
  if (assignment != null && !a) return store.get(); // 모르는 재질 id: no-op
  return store.dispatch(d => {
    const f = activeFloor(d);
    if (target?.kind === 'wall') {
      const w = f.walls.find(x => x.id === target.id);
      if (w) w[matKey(target.side)] = cloneAssign(a);
      return;
    }
    const r = f.rooms.find(x => x.id === target?.id);
    if (!r) return;
    if (target.kind === 'floor') r.floorMat = cloneAssign(a);
    if (target.kind === 'ceiling') r.ceilingMat = cloneAssign(a);
  }, opts);
}

// "마감재 방 전체 벽에 적용": 그 방이 소유한 벽의 내벽 재질을 한 dispatch로 바꾼다(undo 한 단계).
export function applyRoomWalls(store, roomId, assignment, opts = {}) {
  const a = assignment === null ? null : normalizeAssignment(assignment);
  if (assignment != null && !a) return store.get(); // 모르는 재질 id: no-op
  return store.dispatch(d => {
    const f = activeFloor(d);
    const r = f.rooms.find(x => x.id === roomId);
    if (!r) return;
    for (const w of f.walls) if (r.wallIds.includes(w.id)) w.matIn = cloneAssign(a);
  }, opts);
}

// 마감재 편집기의 [적용]. 벽 길이·높이로 범위를 자르고 잘못된 영역은 버린다.
export function setWallRegions(store, wallId, side, regions, opts = {}) {
  return store.dispatch(d => {
    const f = activeFloor(d);
    const w = f.walls.find(x => x.id === wallId);
    if (!w) return;
    const clean = (regions ?? []).map(r => normalizeRegion(r, { len: wallLength(w), height: w.height })).filter(Boolean);
    w.regions = { in: [...(w.regions?.in ?? [])], out: [...(w.regions?.out ?? [])] };
    w.regions[sideKey(side)] = clean;
  }, opts);
}

export function assignmentOf(floor, target) {
  if (!target) return null;
  if (target.kind === 'wall') return floor.walls.find(x => x.id === target.id)?.[matKey(target.side)] ?? null;
  const r = floor.rooms.find(x => x.id === target.id);
  if (!r) return null;
  return (target.kind === 'ceiling' ? r.ceilingMat : r.floorMat) ?? null;
}

// 읽기 전용: 상태 배열을 그대로 주지 않고 얕은 사본을 돌려준다(호출자가 push/splice해도
// dispatch 밖에서 상태가 바뀌지 않는다 — M1).
export function regionsOf(floor, target) {
  if (target?.kind !== 'wall') return [];
  return [...(floor.walls.find(x => x.id === target.id)?.regions?.[sideKey(target.side)] ?? [])];
}

// 면 면적(m²). 견적서가 쓴다. 벽은 중심선 길이 × 벽 높이, 방은 검출된 실면적.
// 기본은 총면적(gross)이다: 문·창 등 개구부를 빼지 않고, in/out(안쪽/바깥쪽 면)을 구분하지
// 않는다(둘 다 중심선 길이를 쓴다 — 바깥면은 모서리에서 두께만큼 더 길 수 있지만 반영하지 않는다).
// opts.netOpenings: true면 그 벽에 붙은 문·창(openingsOnWall)의 폭×높이를 빼 순면적(net)을 낸다.
export function faceArea(floor, target, opts = {}) {
  if (!target) return 0;
  if (target.kind === 'wall') {
    const w = floor.walls.find(x => x.id === target.id);
    if (!w) return 0;
    let gross = wallLength(w) * w.height;
    if (opts.netOpenings) {
      for (const o of openingsOnWall(floor.items, w)) gross -= Math.max(0, o.u1 - o.u0) * Math.max(0, o.z1 - o.z0);
    }
    return Math.max(0, gross) / 1e6;
  }
  const r = floor.rooms.find(x => x.id === target.id);
  return r ? Number(r.area) || 0 : 0;
}
