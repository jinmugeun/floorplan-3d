import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addItem, deleteItems, addWalls, addFloor, selectionStillValid, pruneSelection } from '../src/state/floorOps.js';
import { productById } from '../src/products/catalog.js';
import { rectWalls } from '../src/geom/walls.js';
import { addDuct, updateDuct, deleteDucts, updateSegment, setAllSegments, moveDuctPoint, insertDuctPoint, deleteDuctPoint, translateDuct, addDamper, updateDamper, deleteDamper, connectDuct, disconnectDuct, ductById, ductsOf, movableDucts } from '../src/state/ductOps.js';

function setup() {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [8000, 6000], 200));
  const hood = addItem(store, createItem(productById('hood-box'), { pos: [2000.5, 1500.25], z: 1700 }));
  const id = addDuct(store, { points: [[2000.5, 1500.25], [6000, 1500.25], [6000, 4000]], segments: [{ w: 750, h: 400, z: 2650 }], connections: [{ point: 0, itemId: hood }] });
  return { store, hood, id, floor: () => activeFloor(store.get()) };
}

describe('덕트 액션', () => {
  test('추가·수정·삭제가 각각 한 단계로 되돌려진다', () => {
    const { store, id, floor } = setup();
    expect(floor().ducts).toHaveLength(1);
    expect(ductById(floor(), id).segments).toHaveLength(2);
    updateDuct(store, id, { kind: 'supply', system: 'F-3' });
    expect(ductById(floor(), id).kind).toBe('supply');
    store.undo();
    expect(ductById(floor(), id).kind).toBe('exhaust');
    deleteDucts(store, [id]);
    expect(floor().ducts).toHaveLength(0);
    store.undo();
    expect(floor().ducts).toHaveLength(1);
  });

  test('구간 단면은 하나만 또는 전부 한꺼번에 바꾼다(DT-04)', () => {
    const { store, id, floor } = setup();
    updateSegment(store, id, 1, { w: 500, h: 250 });
    expect(ductById(floor(), id).segments.map(s => s.w)).toEqual([750, 500]);
    setAllSegments(store, id, { z: 2500 });
    expect(ductById(floor(), id).segments.every(s => s.z === 2500)).toBe(true);
    updateSegment(store, id, 9, { w: 100 });                 // 없는 구간은 아무 일도 없다
    expect(ductById(floor(), id).segments).toHaveLength(2);
  });

  test('점 이동·삽입·삭제와 평행 이동. 잠긴 덕트는 움직이지 않는다', () => {
    const { store, id, floor } = setup();
    moveDuctPoint(store, id, 1, [6000.5, 1500.25]);
    expect(ductById(floor(), id).points[1]).toEqual([6000.5, 1500.25]);
    insertDuctPoint(store, id, 0, [4000, 1500.25]);
    expect(ductById(floor(), id).points).toHaveLength(4);
    expect(ductById(floor(), id).connections[0].point).toBe(0);
    deleteDuctPoint(store, id, 1);
    expect(ductById(floor(), id).points).toHaveLength(3);
    translateDuct(store, id, [100.5, -50.25]);
    expect(ductById(floor(), id).points[0]).toEqual([2101, 1450]);
    updateDuct(store, id, { locked: true });
    translateDuct(store, id, [1000, 0]);
    moveDuctPoint(store, id, 0, [0, 0]);
    expect(ductById(floor(), id).points[0]).toEqual([2101, 1450]);   // 잠긴 덕트는 그대로다
  });

  test('댐퍼 추가·수정·삭제', () => {
    const { store, id, floor } = setup();
    addDamper(store, id, { segment: 0, t: 0.3, type: 'VD' });
    expect(ductById(floor(), id).dampers[0]).toEqual({ segment: 0, t: 0.3, type: 'VD', w: 750, h: 400 });
    updateDamper(store, id, 0, { type: 'FVD', w: 800, h: 550 });
    expect(ductById(floor(), id).dampers[0]).toMatchObject({ type: 'FVD', w: 800, h: 550 });
    deleteDamper(store, id, 0);
    expect(ductById(floor(), id).dampers).toEqual([]);
  });

  test('연결은 점 하나에 하나이고 설비를 지우면 사라진다', () => {
    const { store, hood, id, floor } = setup();
    const other = addItem(store, createItem(productById('fan-exhaust-700'), { pos: [6000, 4000] }));
    connectDuct(store, id, 2, other);
    expect(ductById(floor(), id).connections).toHaveLength(2);
    connectDuct(store, id, 2, hood);                          // 같은 점에 다시 연결하면 갈아 끼운다
    expect(ductById(floor(), id).connections.filter(c => c.point === 2)).toHaveLength(1);
    disconnectDuct(store, id, 2);
    expect(ductById(floor(), id).connections.map(c => c.point)).toEqual([0]);
    deleteItems(store, [hood]);
    expect(ductById(floor(), id).connections).toEqual([]);    // pruneDuctConnections
  });

  test('선택 모델이 덕트를 검사하고 사라진 꼭짓점·구간을 비운다', () => {
    const { store, id } = setup();
    expect(selectionStillValid(store.get(), { type: 'duct', id, segment: null, vertex: 1 })).toBe(true);
    expect(selectionStillValid(store.get(), { type: 'duct', id: '없음', segment: null, vertex: null })).toBe(false);
    expect(pruneSelection(store.get(), { type: 'duct', id: '없음', segment: null, vertex: null })).toBeNull();
    deleteDuctPoint(store, id, 2);
    expect(pruneSelection(store.get(), { type: 'duct', id, segment: 1, vertex: 2 })).toEqual({ type: 'duct', id, segment: null, vertex: null });
    const keep = { type: 'duct', id, segment: 0, vertex: null };
    expect(pruneSelection(store.get(), keep)).toBe(keep);     // 그대로면 같은 객체
  });

  test('ductsOf·movableDucts는 잠금을 걸러 준다', () => {
    const { store, id } = setup();
    expect(ductsOf(store.get(), [id])).toHaveLength(1);
    updateDuct(store, id, { locked: true });
    expect(movableDucts(store.get(), [id])).toHaveLength(0);
  });

  test('층 전체 복사는 덕트 연결을 새 설비 id로 옮긴다', () => {
    const { store, hood, id, floor } = setup();
    addFloor(store, { copy: 'all' });
    const copied = floor().ducts[0];
    expect(copied.id).not.toBe(id);                                       // 사본은 새 덕트다
    expect(copied.connections).toHaveLength(1);
    expect(copied.connections[0].itemId).not.toBe(hood);                  // 옛 층의 설비를 가리키지 않는다
    expect(floor().items.some(i => i.id === copied.connections[0].itemId)).toBe(true);
  });
});
