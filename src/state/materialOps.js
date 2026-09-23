// 마감재 상태 변경은 모두 이 파일을 지난다(속성 패널·메뉴·면 피커·마감재 편집기가 같은 함수를 쓴다).
// target = { kind:'wall', id, side:'in'|'out' } | { kind:'floor', id } | { kind:'ceiling', id }
import { activeFloor, normalizeAssignment, normalizeRegion } from './schema.js';
import { wallLength } from '../geom/walls.js';
import { openingsOnWall } from '../geom/openings.js';

export const MAT_TARGET_LABELS = { in: '내벽 재질', out: '외벽 재질', floor: '바닥 재질', ceiling: '천장 재질' };
// 새 형식(명시 지정)이 앉는 필드 이름 한 표. LEGACY_MAT_KEY와 같은 키를 쓴다(in·out·floor·ceiling).
export const MAT_KEY = { in: 'matIn', out: 'matOut', floor: 'floorMat', ceiling: 'ceilingMat' };
const sideKey = side => (side === 'out' ? 'out' : 'in');
const matKey = side => MAT_KEY[sideKey(side)];
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
// 정규화 결과가 지금 값과 같으면 dispatch하지 않는다(최종 리뷰 I-3d · ductOps.put()이 이미 쓰는
// 규칙과 같다): 편집기를 열고 아무것도 고치지 않은 채 [적용]하면 빈 되돌림 단계가 남았다.
export function setWallRegions(store, wallId, side, regions, opts = {}) {
  const w0 = activeFloor(store.get()).walls.find(x => x.id === wallId);
  if (!w0) return store.get();
  const clean = (regions ?? []).map(r => normalizeRegion(r, { len: wallLength(w0), height: w0.height })).filter(Boolean);
  if (JSON.stringify(clean) === JSON.stringify(w0.regions?.[sideKey(side)] ?? [])) return store.get();
  return store.dispatch(d => {
    const f = activeFloor(d);
    const w = f.walls.find(x => x.id === wallId);
    if (!w) return;
    w.regions = { in: [...(w.regions?.in ?? [])], out: [...(w.regions?.out ?? [])] };
    w.regions[sideKey(side)] = clean;
  }, opts);
}

// 새 형식(matIn·matOut·floorMat·ceilingMat)이 비어 있으면 **레거시 문자열 필드**로 떨어진다(§17.4(1)).
// 레거시 필드는 옛 파일만의 것이 아니다: geom/walls.js의 makeWall({ material = 'paint-white' })과
// geom/rooms.js의 floorMaterial · ceilingMaterial: 'paint-white'가 지금도 만든다.
// 값은 **읽기 전용 파생**이다 — 문서에 되쓰지 않는다(저장 형식 무변경).
// 레거시 값 중 'wood'는 **카탈로그에 없는 id**다(마루는 wood-oak·wood-walnut·wood-ash). 그래서
// 별칭 표를 카탈로그 조회 **앞에** 둔다: 옛 파일이 들고 있는 'wood'가 조용히 null이 되어 시방서
// 바닥 마감이 다시 `-`가 되는 것을 막는다. 가장 가까운 값은 오크 원목마루(WD-01)다.
// 별칭은 읽기 전용이다 — 문서의 문자열은 그대로 남는다(새 방의 기본값만 rooms.js가 고친다).
export const LEGACY_MAT_KEY = { in: 'material', out: 'material', floor: 'floorMaterial', ceiling: 'ceilingMaterial' };
export const LEGACY_MATERIAL = { wood: 'wood-oak' };
const legacyAssign = v => (typeof v === 'string' && v ? normalizeAssignment({ id: LEGACY_MATERIAL[v] ?? v }) : null);   // 모르는 id면 null

// 조회는 둘이다(리뷰 I-1). assignmentOf = **보고용 파생**: 레거시 문자열까지 읽어 "이 면은 무엇으로
// 마감되는가"를 답한다 — 시방서·"배치된 마감재"처럼 읽기만 하는 산출물이 쓴다.
export function assignmentOf(floor, target) {
  if (!target) return null;
  if (target.kind === 'wall') {
    const w = floor.walls.find(x => x.id === target.id);
    if (!w) return null;
    return explicitMat(w, sideKey(target.side)) ?? legacyAssign(w[LEGACY_MAT_KEY[sideKey(target.side)]]);
  }
  const r = floor.rooms.find(x => x.id === target.id);
  if (!r) return null;
  const k = target.kind === 'ceiling' ? 'ceiling' : 'floor';
  return explicitMat(r, k) ?? legacyAssign(r[LEGACY_MAT_KEY[k]]);
}

// explicitAssignmentOf = **작성 상태**: 새 형식만 본다(레거시도 별칭도 없다). 편집 표면과 물량이
// 쓴다 — 속성 패널의 마감재 행·색 선택기, 견적서의 칠한 면적, 3D의 무늬 판정. 이 셋이 assignmentOf를
// 읽으면 "패널은 무광 화이트 페인트를 보여 주는데 색 선택기도 같이 뜨고, 3D는 무늬 없이 칠하고,
// 견적서는 그 면적을 0으로 센다"가 된다(리뷰 I-1). 레거시 문자열은 **아직 고르지 않은 면**이다.
// explicitMat은 기록에서 바로 읽는 판이다(M-5): 면마다 walls.find를 돌지 않아도 규칙은 하나다.
export const explicitMat = (rec, key) => rec?.[MAT_KEY[key]] ?? null;
export function explicitAssignmentOf(floor, target) {
  if (!target) return null;
  if (target.kind === 'wall') return explicitMat(floor.walls.find(x => x.id === target.id), sideKey(target.side));
  return explicitMat(floor.rooms.find(x => x.id === target.id), target.kind === 'ceiling' ? 'ceiling' : 'floor');
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
