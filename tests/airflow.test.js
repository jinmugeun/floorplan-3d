import { describe, test, expect } from 'vitest';
import { equipAirflow, roomAirflow, systemAirflow, airflowSummary, AIRFLOW_TOL } from '../src/vent/airflow.js';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem, updateItem, updateRoom } from '../src/state/floorOps.js';
import { addDuct } from '../src/state/ductOps.js';
import { productById } from '../src/products/catalog.js';
import { rectWalls } from '../src/geom/walls.js';
import { normalizeWalls } from '../src/geom/normalize.js';

function setup() {
  const store = createStore(createEmptyProject());
  // 방 두 개: 서쪽 조리실(0~6000) / 동쪽 세척실(6000~10000.5). 소수 좌표를 하나 넣는다.
  addWalls(store, normalizeWalls([...rectWalls([0, 0], [6000, 5000], 200), ...rectWalls([6000, 0], [10000.5, 5000], 200)]));
  const f = activeFloor(store.get());
  const cook = f.rooms.find(r => r.points.some(p => p[0] === 0)).id;
  const wash = f.rooms.find(r => r.id !== cook).id;
  updateRoom(store, cook, { name: '가열조리실', design: { EA: 8000, SA: 6000 } });
  updateRoom(store, wash, { name: '식기구세척실', design: { EA: 3300, SA: 3000 } });
  const hood = addItem(store, createItem(productById('hood-box'), { pos: [2000, 2000], size: [1800, 1100, 600], props: { type: 'hood', no: 1, faceVelocity: 0.7, system: 'F-4' } }));
  const diff = addItem(store, createItem(productById('diffuser-650'), { pos: [4000, 2000], props: { type: 'diffuser', symbol: '가', flow: 'supply', a: 650, b: 650, cmh: 3200 } }));
  const out = addItem(store, createItem(productById('diffuser-500-350'), { pos: [8000, 2000], props: { type: 'diffuser', symbol: '라', flow: 'exhaust', a: 500, b: 350, cmh: 1000 } }));
  const fan = addItem(store, createItem(productById('fan-exhaust-700'), { pos: [8000, 4000], props: { type: 'fan', fanId: 'F-4', flow: 'exhaust', chamber: [700, 700, 700], cmh: 0 } }));
  const stray = addItem(store, createItem(productById('diffuser-650'), { pos: [50000, 50000] }));   // 어느 방에도 없다
  const duct = addDuct(store, { system: 'F-4', kind: 'exhaust', points: [[2000, 2000], [8000, 4000]], segments: [{ w: 800, h: 500, z: 2600 }], connections: [{ point: 0, itemId: hood }, { point: 1, itemId: fan }] });
  return { store, cook, wash, hood, diff, out, fan, stray, duct, floor: () => activeFloor(store.get()) };
}

describe('설비 하나의 풍량', () => {
  test('후드는 배기, 디퓨저·팬은 flow를 따르고 나머지는 0이다', () => {
    expect(equipAirflow({ kind: 'equipment', props: { type: 'hood', cmh: 4990 } })).toEqual({ EA: 4990, SA: 0 });
    expect(equipAirflow({ kind: 'equipment', props: { type: 'diffuser', flow: 'supply', cmh: 3200 } })).toEqual({ EA: 0, SA: 3200 });
    expect(equipAirflow({ kind: 'equipment', props: { type: 'diffuser', flow: 'exhaust', cmh: 1000 } })).toEqual({ EA: 1000, SA: 0 });
    expect(equipAirflow({ kind: 'equipment', props: { type: 'fan', flow: 'supply', cmh: 6000 } })).toEqual({ EA: 0, SA: 6000 });
    expect(equipAirflow({ kind: 'equipment', props: { type: 'appliance', kind: 'range' } })).toEqual({ EA: 0, SA: 0 });
    expect(equipAirflow({ kind: 'equipment', props: { type: 'ventcap', dia: 150 } })).toEqual({ EA: 0, SA: 0 });
    expect(equipAirflow({ kind: 'product', productId: 'sofa-3' })).toEqual({ EA: 0, SA: 0 });
  });
});

describe('실별 풍량', () => {
  test('설비 중심이 든 방에 더해지고 비율·설계 편차가 나온다', () => {
    const { floor, cook, wash } = setup();
    const rows = roomAirflow(floor());
    const c = rows.find(r => r.roomId === cook);
    expect(c.name).toBe('가열조리실');
    expect(c.EA).toBe(4990);                    // 1.98 m² × 0.7 × 3600
    expect(c.SA).toBe(3200);
    expect(c.design).toEqual({ EA: 8000, SA: 6000 });
    expect(c.ratio).toBeCloseTo(64.1, 1);       // 3200 / 4990
    expect(c.offEA).toBeCloseTo((4990 - 8000) / 8000, 6);
    expect(Math.abs(c.offEA)).toBeGreaterThan(AIRFLOW_TOL);
    const w = rows.find(r => r.roomId === wash);
    expect(w.EA).toBe(1000);
    expect(w.SA).toBe(0);
    expect(w.ratio).toBe(0);
    expect(rows).toHaveLength(2);               // 방 밖 설비는 어느 줄에도 없다
  });

  test('EA가 0이면 비율은 null, 설계가 0이면 편차는 null이다', () => {
    const store = createStore(createEmptyProject());
    addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
    const rows = roomAirflow(activeFloor(store.get()));
    expect(rows[0]).toMatchObject({ EA: 0, SA: 0, ratio: null, offEA: null, offSA: null });
  });
});

describe('계통별 풍량', () => {
  test('덕트 연결과 props.system과 팬 번호가 한 계통으로 모인다', () => {
    const { floor, hood, fan, duct } = setup();
    const rows = systemAirflow(floor());
    const f4 = rows.find(r => r.system === 'F-4');
    expect(f4.EA).toBe(4990);                   // 후드 하나(팬 cmh는 0이다)
    expect(f4.SA).toBe(0);
    expect(f4.kind).toBe('exhaust');
    expect(new Set(f4.itemIds)).toEqual(new Set([hood, fan]));
    expect(f4.ductIds).toEqual([duct]);
  });

  test('계통 이름이 없는 덕트는 "미지정"으로 모이고 목록은 이름순이다', () => {
    const { store, floor } = setup();
    addDuct(store, { points: [[0, 0], [1000, 0]], segments: [{ w: 300, h: 200, z: 2700 }] });
    addDuct(store, { system: 'FB', kind: 'supply', points: [[1000, 1000], [2000, 1000]] });
    const rows = systemAirflow(floor());
    expect(new Set(rows.map(r => r.system))).toEqual(new Set(['F-4', 'FB', '미지정']));
    expect(rows.map(r => r.system)).toEqual([...rows.map(r => r.system)].sort((a, b) => a.localeCompare(b, 'ko')));  // 이름순
    expect(rows.find(r => r.system === '미지정').itemIds).toEqual([]);
    expect(rows.find(r => r.system === '미지정').ductIds).toHaveLength(1);
  });

  test('급기와 배기가 섞인 계통은 kind가 mixed다', () => {
    const { store, floor, diff, duct } = setup();
    addDuct(store, { system: 'F-4', kind: 'supply', points: [[4000, 2000], [5000, 2000]], connections: [{ point: 0, itemId: diff }] });
    const f4 = systemAirflow(floor()).find(r => r.system === 'F-4');
    expect(f4.kind).toBe('mixed');
    expect(f4.SA).toBe(3200);
    expect(f4.ductIds).toHaveLength(2);
    expect(f4.ductIds).toContain(duct);
  });

  test('설비 하나는 계통 하나에만 든다 — 덕트에 붙었으면 덕트의 system이 이긴다', () => {
    const { store, floor, hood } = setup();
    // 후드의 props.system을 덕트의 계통(F-4)과 다르게 고쳐도 같은 CMH가 두 계통에 세어지지 않는다.
    const before = floor().items.find(i => i.id === hood).props;
    updateItem(store, hood, { props: { ...before, system: 'F-9' } });
    const rows = systemAirflow(floor());
    expect(rows.some(r => r.system === 'F-9')).toBe(false);
    expect(rows.find(r => r.system === 'F-4').itemIds).toContain(hood);
    const s = airflowSummary(floor());
    expect(rows.reduce((a, r) => a + r.EA, 0)).toBeLessThanOrEqual(s.totalEA);
    expect(rows.reduce((a, r) => a + r.SA, 0)).toBeLessThanOrEqual(s.totalSA);
  });
});

describe('요약', () => {
  test('합계와 전체 급기율', () => {
    const { floor } = setup();
    const s = airflowSummary(floor());
    expect(s.totalEA).toBe(5990);               // 4990 + 1000
    expect(s.totalSA).toBe(3200);
    expect(s.ratio).toBeCloseTo(53.4, 1);
    expect(s.rooms).toHaveLength(2);
    expect(s.systems.some(x => x.system === 'F-4')).toBe(true);
  });
});
