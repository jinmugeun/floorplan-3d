// 벽·방 우클릭 메뉴 항목. 2D 선택 도구(selectTool)와 3D 면 피커(facePick)가 같은 함수를 쓴다.
// 실제 동작 중 UI가 필요한 것(재질 교체 패널·마감재 편집기·템플릿 대화상자·뷰 전환)은
// main.js가 넘기는 actions가 한다. actions에 없는 항목은 꺼 둔다(빈 메뉴 항목을 만들지 않는다).
import { activeFloor } from '../state/schema.js';
import { deleteWall, duplicateRoom } from '../state/floorOps.js';
import { applyRoomWalls, assignmentOf } from '../state/materialOps.js';
// 방 삭제는 ui/ 안의 roomActions에서 가져온다: ui/는 view2d/·view3d/·app/을 import하지 않는다(아키텍처 §9).
import { removeRoom } from './roomActions.js';

const copyItem = (ui, mat) => ({
  label: '마감재 복사', disabled: !mat,
  onSelect: () => ui.set({ matPick: { assignment: structuredClone(mat) } }),
});

export function wallMenuItems({ store, ui, wallId, roomId = null, side = 'in', in3d = false, actions = {} }) {
  const f = activeFloor(store.get());
  if (!f.walls.some(x => x.id === wallId)) return null;
  const target = { kind: 'wall', id: wallId, side: side === 'out' ? 'out' : 'in' };
  const mat = assignmentOf(f, target);
  const room = roomId ?? f.rooms.find(r => r.wallIds.includes(wallId))?.id ?? null;
  const items = [
    { label: '벽 나누기', onSelect: () => ui.set({ selection: { type: 'wall', id: wallId }, splitWall: true }) },
    { label: '곡선벽 전환', disabled: true, title: '미지원' }, // 2A가 정한 UI 약속: 곡선벽은 범위 밖임을 비활성 항목으로 알린다(I-20)
    { label: '재질 교체', disabled: !actions.replaceMaterial, onSelect: () => actions.replaceMaterial?.(target) },
    // 타일은 크기를 면마다 정하고 여러 면에 연속으로 바르는 일이 많다: 재질 교체와 다른 항목이다(§13.3).
    { label: '타일 배치', disabled: !actions.placeTile, onSelect: () => actions.placeTile?.(target) },
    copyItem(ui, mat),
    { label: '마감재 방 전체 벽에 적용', disabled: !room || !mat, onSelect: () => applyRoomWalls(store, room, mat) },
    { label: '마감재 편집기로 이동', disabled: !actions.openEditor, onSelect: () => actions.openEditor?.(wallId, target.side) },
  ];
  if (in3d) items.push({ label: '도면 뷰 전환', disabled: !actions.toPlanView, onSelect: () => actions.toPlanView?.() });
  items.push('sep', { label: '삭제', shortcut: '⌫', danger: true, onSelect: () => deleteWall(store, wallId) });
  return items;
}

// in3d는 방 메뉴에서는 쓰지 않는다(아키텍처 §10.4의 방 메뉴에 "도면 뷰 전환"이 없다).
// 인자는 두 함수의 호출 모양을 같게 두려고 받는다.
export function roomMenuItems({ store, ui, roomId, in3d = false, actions = {} }) {
  const f = activeFloor(store.get());
  if (!f.rooms.some(x => x.id === roomId)) return null;
  const target = { kind: 'floor', id: roomId };
  const mat = assignmentOf(f, target);
  return [
    { label: '템플릿 적용하기', disabled: !actions.applyTemplate, onSelect: () => actions.applyTemplate?.(roomId) },
    // M-10: Ctrl+C는 아이템 복사 전용이다(keymap.js의 itemCombo). 없는 단축키를 표기하지 않는다.
    { label: '방 복사', onSelect: () => duplicateRoom(store, roomId) },
    copyItem(ui, mat),
    { label: '재질 교체', disabled: !actions.replaceMaterial, onSelect: () => actions.replaceMaterial?.(target) },
    { label: '단일 공간 모드', onSelect: () => ui.set({ selection: { type: 'room', id: roomId }, soloRoom: roomId }) },
    'sep',
    // 확인 뒤 재확인(방이 그 사이 사라졌는지)까지 removeRoom이 한다 — 삭제 도구·선택 삭제와 같은 자리다.
    { label: '삭제', shortcut: '⌫', danger: true, onSelect: () => removeRoom(store, ui, roomId) },
  ];
}
