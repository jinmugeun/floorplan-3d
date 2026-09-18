// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { applyMaterial } from '../src/state/materialOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { materialRowsHtml, mountSwatches, applyMaterialField, targetFor, MATERIAL_ROWS } from '../src/ui/materialRows.js';

function setup() {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  const f = activeFloor(store.get());
  return { store, floor: () => activeFloor(store.get()), wall: { type: 'wall', id: f.walls[0].id }, room: { type: 'room', id: f.rooms[0].id } };
}
const mat = (id, patch = {}) => ({ id, offset: [0, 0], angle: 0, ...patch });
const render = (floor, sel) => { const el = document.createElement('div'); el.innerHTML = materialRowsHtml(floor, sel, { detailsOpen: true }); mountSwatches(el, floor, sel); return el; };

describe('마감재 속성 행', () => {
  test('targetFor와 행 정의', () => {
    expect(MATERIAL_ROWS.wall.map(r => r[1])).toEqual(['내벽 재질', '외벽 재질']);
    expect(MATERIAL_ROWS.room.map(r => r[1])).toEqual(['바닥 재질', '천장 재질']);
    expect(targetFor({ type: 'wall', id: 'w1' }, 'out')).toEqual({ kind: 'wall', id: 'w1', side: 'out' });
    expect(targetFor({ type: 'room', id: 'r1' }, 'ceiling')).toEqual({ kind: 'ceiling', id: 'r1' });
    expect(targetFor({ type: 'room', id: 'r1' }, 'floor')).toEqual({ kind: 'floor', id: 'r1' });
    expect(targetFor(null, 'in')).toBeNull();
    expect(materialRowsHtml(activeFloor(createEmptyProject()), { type: 'item', id: 'i1' })).toBe('');
  });

  test('벽은 내벽·외벽 두 행에 스와치와 상세 설정을 갖는다', () => {
    const a = setup();
    applyMaterial(a.store, { kind: 'wall', id: a.wall.id, side: 'in' }, mat('brick-red', { offset: [120.5, 30], angle: 45 }));
    const el = render(a.floor(), a.wall);
    expect([...el.querySelectorAll('[data-mat-row]')].map(r => r.dataset.matRow)).toEqual(['in', 'out']);
    expect(el.textContent).toContain('적벽돌');
    expect(el.textContent).toContain('오늘의집');
    expect(el.textContent).toContain('미지정');                        // 외벽은 아직 없다
    expect(el.querySelector('[name="matU-in"]').value).toBe('120.5');
    expect(el.querySelector('[name="matV-in"]').value).toBe('30');
    expect(el.querySelector('[name="matA-in"]').value).toBe('45');
    expect(el.querySelectorAll('[name="matEditor"]')).toHaveLength(2);
    expect(el.querySelectorAll('canvas.swatch')).toHaveLength(2);
    expect(el.querySelector('[name="matReplace"]').dataset.side).toBe('in');
  });

  test('방은 바닥·천장 행을 갖고 마감재 편집기 버튼이 없다', () => {
    const a = setup();
    const el = render(a.floor(), a.room);
    expect([...el.querySelectorAll('[data-mat-row]')].map(r => r.dataset.matRow)).toEqual(['floor', 'ceiling']);
    expect(el.querySelectorAll('[name="matEditor"]')).toHaveLength(0);
  });

  test('오프셋·각도 입력이 그 면의 지정만 바꾼다(소수 값)', () => {
    const a = setup();
    applyMaterial(a.store, { kind: 'wall', id: a.wall.id, side: 'in' }, mat('brick-red'));
    applyMaterial(a.store, { kind: 'wall', id: a.wall.id, side: 'out' }, mat('paint-navy'));
    const el = render(a.floor(), a.wall);
    const u = el.querySelector('[name="matU-in"]');
    u.value = '250.5';
    expect(applyMaterialField(a.store, a.wall, u)).toBe(true);
    const ang = el.querySelector('[name="matA-out"]');
    ang.value = '90';
    expect(applyMaterialField(a.store, a.wall, ang)).toBe(true);
    const w = a.floor().walls.find(x => x.id === a.wall.id);
    expect(w.matIn).toEqual({ id: 'brick-red', offset: [250.5, 0], angle: 0 });
    expect(w.matOut).toEqual({ id: 'paint-navy', offset: [0, 0], angle: 90 });
    expect(applyMaterialField(a.store, a.wall, { name: 'thickness', value: '5' })).toBe(false);
  });

  // I-12: Number('')는 0이라 빈 칸을 걸러내지 않으면 0이 저장된다. 0이 아닌 값에서 확인한다.
  test('빈 칸은 처리했다고 보고하되 값을 바꾸지 않는다', () => {
    const a = setup();
    applyMaterial(a.store, { kind: 'wall', id: a.wall.id, side: 'in' }, mat('brick-red', { offset: [0, 200] }));
    const el = render(a.floor(), a.wall);
    const v = el.querySelector('[name="matV-in"]');
    expect(v.value).toBe('200');
    v.value = '';
    expect(applyMaterialField(a.store, a.wall, v)).toBe(true);
    expect(a.floor().walls.find(x => x.id === a.wall.id).matIn.offset[1]).toBe(200);
    expect(a.store.canUndo()).toBe(true);
    a.store.undo();                                                    // 빈 칸이 되돌림 단계를 만들지 않았다
    expect(a.floor().walls.find(x => x.id === a.wall.id).matIn).toBeNull();
  });

  test('재질이 없는 면의 오프셋 입력은 아무 일도 하지 않는다', () => {
    const a = setup();
    const el = render(a.floor(), a.wall);
    const u = el.querySelector('[name="matU-in"]');
    u.value = '500';
    expect(applyMaterialField(a.store, a.wall, u)).toBe(true);
    expect(a.floor().walls.find(x => x.id === a.wall.id).matIn).toBeNull();
  });

  test('방 바닥 오프셋도 같은 함수로 들어간다', () => {
    const a = setup();
    applyMaterial(a.store, { kind: 'floor', id: a.room.id }, mat('wood-oak'));
    const el = render(a.floor(), a.room);
    const v = el.querySelector('[name="matV-floor"]');
    v.value = '75.25';
    applyMaterialField(a.store, a.room, v);
    expect(a.floor().rooms[0].floorMat.offset[1]).toBeCloseTo(75.25);
  });
});
