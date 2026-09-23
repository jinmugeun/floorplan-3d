// 벽·방 우클릭 메뉴 항목. 2D 선택 도구(selectTool)와 3D 면 피커(facePick)가 같은 함수를 쓴다.
// 실제 동작 중 UI가 필요한 것(재질 교체 패널·마감재 편집기·템플릿 대화상자·뷰 전환)은
// main.js가 넘기는 actions가 한다. actions에 없는 항목은 꺼 둔다(빈 메뉴 항목을 만들지 않는다).
import { activeFloor } from '../state/schema.js';
import { deleteWall, duplicateRoom } from '../state/floorOps.js';
// 메뉴는 **편집 표면**이다(리뷰 N-1 · §17.4(1)): 조회는 작성용 explicitAssignmentOf를 쓴다.
// assignmentOf(보고용)를 쓰면 makeWall·detectRooms가 지금도 넣는 레거시 문자열이 "고른 마감재"로
// 읽혀, 속성 패널이 '미지정'이라고 그리는 면에서 [마감재 복사]·[마감재 방 전체 벽에 적용]이
// 켜진다 — 한 번 누르면 고른 적 없는 값이 방의 모든 벽에 굳어 견적 총액이 0에서 뛴다(리뷰 I-2가
// 마감재 행에서 막은 바로 그 굳히기다).
import { applyRoomWalls, explicitAssignmentOf } from '../state/materialOps.js';
// 방 삭제는 ui/ 안의 roomActions에서 가져온다: ui/는 view2d/·view3d/·app/을 import하지 않는다(아키텍처 §9).
import { removeRoom } from './roomActions.js';
import { toast } from './toast.js';
import { WALL_DELETE_RESULT, ROOMS_GONE, CURVED_WALL_TITLE, WHY_NO_MATERIAL, WHY_NO_ROOM, WHY_NO_WALL, WHY_NO_ACTION } from './messages.js';
// 사유 하나가 disabled와 title을 함께 만든다(리뷰 I-3): 세 메뉴가 같은 헬퍼를 쓴다.
import { why } from './menuReason.js';

const copyItem = (ui, mat) => ({
  label: '마감재 복사', ...why(mat ? null : WHY_NO_MATERIAL),
  onSelect: () => ui.set({ matPick: { assignment: structuredClone(mat) } }),
});

export function wallMenuItems({ store, ui, wallId, roomId = null, side = 'in', in3d = false, actions = {} }) {
  const f = activeFloor(store.get());
  if (!f.walls.some(x => x.id === wallId)) return null;
  const target = { kind: 'wall', id: wallId, side: side === 'out' ? 'out' : 'in' };
  const mat = explicitAssignmentOf(f, target);
  const room = roomId ?? f.rooms.find(r => r.wallIds.includes(wallId))?.id ?? null;
  const items = [
    { label: '벽 나누기', onSelect: () => ui.set({ selection: { type: 'wall', id: wallId }, splitWall: true }) },
    // 2A가 정한 UI 약속: 곡선벽은 범위 밖임을 비활성 항목 + 사유로 알린다(§15.14 · 감사 §10).
    { label: '곡선벽 전환', ...why(CURVED_WALL_TITLE) },
    { label: '재질 교체', ...why(actions.replaceMaterial ? null : WHY_NO_ACTION), onSelect: () => actions.replaceMaterial?.(target) },
    // 타일은 크기를 면마다 정하고 여러 면에 연속으로 바르는 일이 많다: 재질 교체와 다른 항목이다(§13.3).
    { label: '타일 배치', ...why(actions.placeTile ? null : WHY_NO_ACTION), onSelect: () => actions.placeTile?.(target) },
    copyItem(ui, mat),
    // 사유는 한 마디다: 바른 마감재가 없는 쪽이 먼저고, 마감재는 있는데 방이 없으면 그것을 말한다.
    { label: '마감재 방 전체 벽에 적용', ...why(!mat ? WHY_NO_MATERIAL : !room ? WHY_NO_ROOM : null), onSelect: () => applyRoomWalls(store, room, mat) },
    { label: '마감재 편집기로 이동', ...why(actions.openEditor ? null : WHY_NO_ACTION), onSelect: () => actions.openEditor?.(wallId, target.side) },
  ];
  if (in3d) items.push({ label: '도면 뷰 전환', ...why(actions.toPlanView ? null : WHY_NO_ACTION), onSelect: () => actions.toPlanView?.() });
  // 결과 문구는 app/deleteActions.js와 같은 규칙이다(§15.6): 제품이 함께 사라지면 그것을,
  // 제품 없이 방만 줄면 방만 알린다.
  items.push('sep', { label: '삭제', shortcut: '⌫', danger: true, onSelect: () => {
    const r = deleteWall(store, wallId);
    if (r.items > 0) toast(WALL_DELETE_RESULT(r.walls, r.items, r.rooms));
    else if (r.rooms > 0) toast(ROOMS_GONE(r.rooms));
  } });
  return items;
}

// in3d는 방 메뉴에서는 쓰지 않는다(아키텍처 §10.4의 방 메뉴에 "도면 뷰 전환"이 없다).
// 인자는 두 함수의 호출 모양을 같게 두려고 받는다.
export function roomMenuItems({ store, ui, roomId, in3d = false, actions = {} }) {
  const f = activeFloor(store.get());
  if (!f.rooms.some(x => x.id === roomId)) return null;
  const target = { kind: 'floor', id: roomId };
  const mat = explicitAssignmentOf(f, target);
  const firstWall = f.rooms.find(x => x.id === roomId)?.wallIds?.[0] ?? null;
  return [
    { label: '템플릿 적용하기', ...why(actions.applyTemplate ? null : WHY_NO_ACTION), onSelect: () => actions.applyTemplate?.(roomId) },
    // M-10: Ctrl+C는 아이템 복사 전용이다(keymap.js의 itemCombo). 없는 단축키를 표기하지 않는다.
    { label: '방 복사', onSelect: () => duplicateRoom(store, roomId) },
    copyItem(ui, mat),
    { label: '재질 교체', ...why(actions.replaceMaterial ? null : WHY_NO_ACTION), onSelect: () => actions.replaceMaterial?.(target) },
    // §17.12 이월(감사 §12): 편집기가 벽 속성 패널과 3D 벽 메뉴에서만 열렸다. 방에서 여는 길을 준다
    // (방의 벽 하나를 골라 연다 — 편집기의 대상은 벽 한 면이다). 벽이 없는 방은 사유로 끈다(§16.5 ·
    // Task 12 리뷰 I-2): main.js의 openEditor가 `if (wallId)`로 조용히 삼켜 "켜져 있는데 눌러도
    // 아무 일이 없는" 항목이었다. detectRooms는 그런 방을 만들지 않지만 normalizeRoom이 wallIds를
    // []로 강제하므로 손으로 고친/깨진 저장 파일에서 도달할 수 있다.
    { label: '마감재 편집기', ...why(!actions.openEditor ? WHY_NO_ACTION : !firstWall ? WHY_NO_WALL : null), onSelect: () => actions.openEditor?.(firstWall, 'in') },
    { label: '단일 공간 모드', onSelect: () => ui.set({ selection: { type: 'room', id: roomId }, soloRoom: roomId }) },
    'sep',
    // 확인 뒤 재확인(방이 그 사이 사라졌는지)까지 removeRoom이 한다 — 삭제 도구·선택 삭제와 같은 자리다.
    { label: '삭제', shortcut: '⌫', danger: true, onSelect: () => removeRoom(store, ui, roomId) },
  ];
}
