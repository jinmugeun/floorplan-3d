// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { applyMaterial } from '../src/state/materialOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { wallMenuItems, roomMenuItems } from '../src/ui/surfaceMenu.js';
import { CURVED_WALL_TITLE } from '../src/ui/messages.js';
import { createSelectTool } from '../src/view2d/tools/selectTool.js';

const fakeView = { camera: { scale: 0.1 }, fit: () => {} };
function setup(actions = {}) {
  const store = createStore(createEmptyProject()), ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  const f = activeFloor(store.get());
  return {
    store, ui, actions, floor: () => activeFloor(store.get()),
    wallId: f.walls[0].id, roomId: f.rooms[0].id,
    t: createSelectTool({ store, ui, view: fakeView, surfaceActions: actions }),
  };
}
const mat = id => ({ id, offset: [0, 0], angle: 0 });
const labels = items => items.filter(x => x !== 'sep').map(x => x.label);
const pick = (items, label) => items.find(x => x !== 'sep' && x.label === label);

describe('벽·방 공용 메뉴', () => {
  test('벽 메뉴 항목과 순서(3D는 도면 뷰 전환이 더 붙는다)', () => {
    const a = setup();
    const items = wallMenuItems({ store: a.store, ui: a.ui, wallId: a.wallId, roomId: a.roomId });
    expect(labels(items)).toEqual(['벽 나누기', '곡선벽 전환', '재질 교체', '타일 배치', '마감재 복사', '마감재 방 전체 벽에 적용', '마감재 편집기로 이동', '삭제']);
    expect(pick(items, '곡선벽 전환')).toMatchObject({ disabled: true, title: CURVED_WALL_TITLE }); // 곡선벽은 범위 밖임을 메뉴로 알린다(I-20 · §15.14)
    const in3d = wallMenuItems({ store: a.store, ui: a.ui, wallId: a.wallId, roomId: a.roomId, in3d: true });
    expect(labels(in3d)).toContain('도면 뷰 전환');
    expect(wallMenuItems({ store: a.store, ui: a.ui, wallId: '없음' })).toBeNull();
  });

  // N-1: 메뉴는 편집 표면이라 **작성 상태**(explicitAssignmentOf)를 본다 — makeWall이 지금도 넣는
  // 레거시 material('paint-white')은 "아직 고르지 않은 면"이므로 픽스처를 비울 필요가 없다.
  // 레거시로 켜지면 한 번의 [방 전체 적용]이 고른 적 없는 값을 방의 모든 벽에 굳힌다(리뷰 I-2).
  test('재질이 없으면 마감재 복사·방 전체 적용은 꺼져 있다', () => {
    const a = setup();
    expect(a.floor().walls.find(w => w.id === a.wallId).material).toBe('paint-white');  // 레거시는 그대로 있다
    let items = wallMenuItems({ store: a.store, ui: a.ui, wallId: a.wallId, roomId: a.roomId, side: 'in' });
    expect(pick(items, '마감재 복사').disabled).toBe(true);
    expect(pick(items, '마감재 방 전체 벽에 적용').disabled).toBe(true);
    applyMaterial(a.store, { kind: 'wall', id: a.wallId, side: 'in' }, mat('brick-red'));
    items = wallMenuItems({ store: a.store, ui: a.ui, wallId: a.wallId, roomId: a.roomId, side: 'in' });
    expect(pick(items, '마감재 복사').disabled).toBe(false);
    pick(items, '마감재 복사').onSelect();
    expect(a.ui.get().matPick.assignment.id).toBe('brick-red');
    pick(items, '마감재 방 전체 벽에 적용').onSelect();
    expect(a.floor().walls.every(w => w.matIn.id === 'brick-red')).toBe(true);
  });

  test('actions가 없는 항목은 꺼지고, 있으면 그 대상으로 불린다', () => {
    const calls = [];
    const a = setup({ replaceMaterial: t => calls.push(['replace', t]), openEditor: (id, side) => calls.push(['editor', id, side]), toPlanView: () => calls.push(['plan']) });
    const plain = wallMenuItems({ store: a.store, ui: a.ui, wallId: a.wallId, actions: a.actions });
    expect(pick(plain, '재질 교체').disabled).toBe(false);
    pick(plain, '재질 교체').onSelect();
    pick(plain, '마감재 편집기로 이동').onSelect();
    expect(calls).toEqual([['replace', { kind: 'wall', id: a.wallId, side: 'in' }], ['editor', a.wallId, 'in']]);
    const none = wallMenuItems({ store: a.store, ui: a.ui, wallId: a.wallId });
    expect(pick(none, '벽 나누기').disabled).toBeUndefined();
    const b = setup();
    expect(pick(wallMenuItems({ store: b.store, ui: b.ui, wallId: b.wallId }), '재질 교체').disabled).toBe(true);
    expect(pick(roomMenuItems({ store: b.store, ui: b.ui, roomId: b.roomId }), '템플릿 적용하기').disabled).toBe(true);
  });

  test('벽 나누기와 삭제는 기존 동작을 그대로 한다', () => {
    const a = setup();
    const items = wallMenuItems({ store: a.store, ui: a.ui, wallId: a.wallId });
    pick(items, '벽 나누기').onSelect();
    expect(a.ui.get()).toMatchObject({ selection: { type: 'wall', id: a.wallId }, splitWall: true });
    pick(items, '삭제').onSelect();
    expect(a.floor().walls.some(w => w.id === a.wallId)).toBe(false);
  });

  test('방 메뉴 항목과 단일 공간 모드·방 복사·삭제 확인', async () => {
    const a = setup({ applyTemplate: vi.fn() });
    const items = roomMenuItems({ store: a.store, ui: a.ui, roomId: a.roomId });
    // '마감재 편집기'는 §17.12 이월(감사 §12)이 더한 항목이다 — 방에서도 편집기를 열 수 있어야 한다.
    expect(labels(items)).toEqual(['템플릿 적용하기', '방 복사', '마감재 복사', '재질 교체', '마감재 편집기', '단일 공간 모드', '삭제']);
    expect(pick(items, '방 복사').shortcut).toBeUndefined(); // M-10: Ctrl+C는 아이템 복사 전용이다
    pick(items, '단일 공간 모드').onSelect();
    expect(a.ui.get().soloRoom).toBe(a.roomId);
    pick(items, '방 복사').onSelect();
    expect(a.floor().rooms.length).toBe(2);
    pick(items, '삭제').onSelect();
    document.querySelector('.modal.confirm [name="cancel"]').click();
    await new Promise(r => setTimeout(r, 0));
    expect(a.floor().rooms.some(r => r.id === a.roomId)).toBe(true); // 취소하면 남는다
    pick(items, '삭제').onSelect();
    document.querySelector('.modal.confirm [name="ok"]').click();
    await new Promise(r => setTimeout(r, 0));
    expect(a.floor().rooms.some(r => r.id === a.roomId)).toBe(false); // 확인하면 지워진다
    // 방을 지운 뒤라 a.roomId로 물어도 null이 된다 — 없는 id로 묻는 뜻은 그대로다.
    expect(roomMenuItems({ store: a.store, ui: a.ui, roomId: '없음' })).toBeNull();
  });

  test('바닥 재질이 있으면 방 메뉴의 마감재 복사가 그 재질을 집는다', () => {
    const a = setup();
    applyMaterial(a.store, { kind: 'floor', id: a.roomId }, mat('wood-oak'));
    const items = roomMenuItems({ store: a.store, ui: a.ui, roomId: a.roomId });
    pick(items, '마감재 복사').onSelect();
    expect(a.ui.get().matPick.assignment).toEqual(mat('wood-oak'));
  });
});

describe('2D 마감재 적용 모드', () => {
  test('벽을 클릭하면 안·밖 재질이 함께 발리고 한 번에 되돌려진다', () => {
    const a = setup();
    a.ui.set({ matPick: { assignment: mat('brick-red') } });
    a.t.onPointerDown([2000, 0], {});      // 위쪽 벽 위
    a.t.onPointerUp([2000, 0], {});
    const w = a.floor().walls.find(x => x.id === a.wallId);
    expect(w.matIn.id).toBe('brick-red');
    expect(w.matOut.id).toBe('brick-red');
    expect(a.ui.get().matPick).not.toBeNull();  // 모드는 Esc까지 계속된다
    expect(a.ui.get().selection).toBeNull();    // 적용 모드에서는 선택이 바뀌지 않는다
    a.store.undo();
    const back = a.floor().walls.find(x => x.id === a.wallId);
    expect(back.matIn).toBeNull();
    expect(back.matOut).toBeNull();
  });

  test('방 안쪽을 클릭하면 바닥 재질이 발린다(소수 좌표)', () => {
    const a = setup();
    a.ui.set({ matPick: { assignment: mat('wood-walnut') } });
    a.t.onPointerDown([2000.5, 1500.25], {});
    a.t.onPointerUp([2000.5, 1500.25], {});
    expect(a.floor().rooms[0].floorMat.id).toBe('wood-walnut');
    a.ui.set({ matPick: null });
    a.t.onPointerDown([2000.5, 1500.25], {});  // 모드를 끄면 평소처럼 방이 선택된다
    a.t.onPointerUp([2000.5, 1500.25], {});
    expect(a.ui.get().selection.type).toBe('room');
  });

  test('빈 곳 클릭은 아무 일도 하지 않고 모드를 유지한다', () => {
    const a = setup();
    a.ui.set({ matPick: { assignment: mat('wood-oak') } });
    a.t.onPointerDown([-9000, -9000], {});
    a.t.onPointerUp([-9000, -9000], {});
    expect(a.ui.get().selection).toBeNull();
    expect(a.ui.get().matPick).not.toBeNull();
    expect(a.floor().rooms[0].floorMat).toBeNull();
  });

  test('선택 도구 우클릭이 공용 메뉴를 돌려준다', () => {
    const a = setup();
    expect(labels(a.t.onContextMenu([2000, 0], {}))).toContain('마감재 편집기로 이동');
    expect(a.ui.get().selection).toEqual({ type: 'wall', id: a.wallId });
    expect(labels(a.t.onContextMenu([2000.5, 1500.25], {}))).toContain('템플릿 적용하기');
    expect(a.ui.get().selection.type).toBe('room');
  });

  test('적용 모드에서 Esc는 선택 도구가 소비하지 않는다(앱이 모드를 끈다)', () => {
    const a = setup();
    a.ui.set({ matPick: { assignment: mat('wood-oak') } });
    expect(a.t.onKey({ key: 'Escape' })).toBe(false);
  });
});

// §13.3: "타일 배치"는 마감재 패널을 타일 카테고리로 열고 적용 모드를 켠다(actions가 실제 동작).
test('타일 배치는 actions.placeTile을 면 대상과 함께 부르고, 없으면 비활성이다', () => {
  const called = [];
  const a = setup({ placeTile: t => called.push(t) });
  const on = wallMenuItems({ store: a.store, ui: a.ui, wallId: a.wallId, side: 'in', actions: a.actions });
  const row = pick(on, '타일 배치');
  expect(row.disabled).toBeFalsy();
  row.onSelect();
  expect(called).toEqual([{ kind: 'wall', id: a.wallId, side: 'in' }]);
  const off = wallMenuItems({ store: a.store, ui: a.ui, wallId: a.wallId, side: 'in', actions: {} });
  expect(pick(off, '타일 배치').disabled).toBe(true);
});

// §15.6: 벽 우클릭 메뉴의 [삭제]도 같은 결과를 알린다(같은 상태 함수를 지나므로 동작도 같다).
test('벽 메뉴 삭제는 붙은 제품을 함께 지우고 알린다', async () => {
  const { createItem } = await import('../src/state/schema.js');
  const { addItem } = await import('../src/state/floorOps.js');
  const { productById } = await import('../src/products/catalog.js');
  const a = setup();
  const wall = a.floor().walls.find(w => w.a[1] === 0 && w.b[1] === 0);
  const id = addItem(a.store, createItem(productById('door-swing-900'), { wallId: wall.id, t: 0.5, pos: [2000, 0] }));
  const items = wallMenuItems({ store: a.store, ui: a.ui, wallId: wall.id, actions: a.actions });
  items.find(x => x !== 'sep' && x.label === '삭제').onSelect();
  expect(a.floor().items.find(x => x.id === id)).toBeUndefined();
  const texts = [...document.querySelectorAll('.toast')].map(t => t.textContent);
  expect(texts.at(-1)).toContain('붙어 있던 제품 1개를 삭제했습니다');
});

// §15.14(감사 §10): "곡선벽 전환"이 일반 항목처럼 보이고 눌러도 아무 일도 없었다.
test('곡선벽 전환은 비활성이고 사유를 말한다', () => {
  const a = setup();
  const item = wallMenuItems({ store: a.store, ui: a.ui, wallId: a.wallId, actions: a.actions }).find(x => x !== 'sep' && x.label === '곡선벽 전환');
  expect(item.disabled).toBe(true);
  expect(item.title).toBe('곡선벽은 아직 지원하지 않습니다');
  expect(item.onSelect).toBeUndefined();          // 누를 수 있는 것처럼 보이지도 않는다
});

// §16.5(감사 §19): 비활성 항목은 왜 못 쓰는지 말한다. 규칙을 한 항목씩 적는 대신 전수로 센다.
test('비활성 항목에는 모두 사유(title)가 있다', () => {
  const a = setup();                                  // actions = {} → 동작이 붙지 않은 항목이 모두 비활성
  const items = [
    ...wallMenuItems({ store: a.store, ui: a.ui, wallId: a.wallId, roomId: a.roomId, in3d: true, actions: a.actions }),
    ...roomMenuItems({ store: a.store, ui: a.ui, roomId: a.roomId, actions: a.actions }),
  ];
  const missing = items.filter(it => it !== 'sep' && it.disabled && !String(it.title ?? '').trim()).map(it => it.label);
  expect(missing).toEqual([]);
});

// N-1: detectRooms가 지금도 넣는 레거시 floorMaterial('wood-oak')은 **고른 값이 아니다** —
// 픽스처를 비우지 않아도 방 메뉴의 [마감재 복사]는 꺼져 있고, 실제로 바르면 켜진다.
test('마감재가 없으면 "마감재 복사"가 사유와 함께 비활성이다', () => {
  const a = setup();
  expect(a.floor().rooms.find(r => r.id === a.roomId).floorMaterial).toBe('wood-oak');  // 레거시는 그대로 있다
  const items = roomMenuItems({ store: a.store, ui: a.ui, roomId: a.roomId, actions: a.actions });
  const copy = pick(items, '마감재 복사');
  expect(copy.disabled).toBe(true);
  expect(copy.title).toBe('바른 마감재가 없음');
  // 화면에서 쓸 수 없는 항목은 같은 한 마디를 쓴다.
  expect(pick(items, '템플릿 적용하기').title).toBe('이 화면에서 쓸 수 없음');
  // 바른 뒤에는 켜지고 그 값을 집는다(두 상태를 같은 테스트가 본다).
  applyMaterial(a.store, { kind: 'floor', id: a.roomId }, mat('tile-white-300'));
  const after = pick(roomMenuItems({ store: a.store, ui: a.ui, roomId: a.roomId, actions: a.actions }), '마감재 복사');
  expect(after.disabled).toBe(false);
  after.onSelect();
  expect(a.ui.get().matPick.assignment).toEqual(mat('tile-white-300'));
});

// §17.12 이월(감사 §12): 마감재 편집기를 방에서 열 수 없었다(벽 속성 패널과 3D 벽 메뉴에서만).
test('방 메뉴에 "마감재 편집기"가 있고 actions가 없으면 사유로 꺼진다', () => {
  const a = setup();                                     // 이 파일의 기존 setup(방 하나)
  const on = roomMenuItems({ store: a.store, ui: a.ui, roomId: a.roomId, actions: { openEditor: () => {} } });
  const item = on.find(x => x !== 'sep' && x.label === '마감재 편집기');
  expect(item).toBeTruthy();
  expect(item.disabled).toBe(false);
  const off = roomMenuItems({ store: a.store, ui: a.ui, roomId: a.roomId, actions: {} });
  const dead = off.find(x => x !== 'sep' && x.label === '마감재 편집기');
  expect(dead.disabled).toBe(true);
  expect(dead.title).toBe('이 화면에서 쓸 수 없음');
});
