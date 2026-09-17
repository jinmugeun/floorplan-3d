import { test, expect } from 'vitest';
import { buildSampleProject, loadSample } from '../src/samples/gangdang.js';
import spec from '../src/samples/gangdang.json';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, SCHEMA_VERSION } from '../src/state/schema.js';
import { totalArea } from '../src/state/floorOps.js';

test('the descriptor covers the M-106 envelope with 11 named rooms', () => {
  expect(spec.rooms).toHaveLength(11);
  expect(spec.rooms.map(r => r.name)).toEqual(expect.arrayContaining(['가열조리실', '비가열조리실', '전처리실', '식기구세척실', '다용도실', '부식창고', '급식관리실', '휴게/탈의실', '복도', '식당', '보온고']));
  expect(Math.max(...spec.rooms.map(r => r.rect[2]))).toBe(18600); // X4
  expect(Math.max(...spec.rooms.map(r => r.rect[3]))).toBe(20000); // Y1
  for (const r of spec.rooms) expect(r.rect[2] - r.rect[0]).toBeGreaterThan(1000);
});

test('buildSampleProject yields 11 detected rooms with names, types and a sane total area', () => {
  const p = buildSampleProject();
  expect(p.version).toBe(SCHEMA_VERSION);
  const f = activeFloor(p);
  expect(f.rooms).toHaveLength(11);
  expect(f.rooms.every(r => r.name.length > 0)).toBe(true);
  expect(f.rooms.map(r => r.name).sort()).toEqual(spec.rooms.map(r => r.name).sort());
  expect(f.rooms.find(r => r.name === '가열조리실').type).toBe('cook');
  expect(f.rooms.find(r => r.name === '가열조리실').area).toBeCloseTo(8.0 * 10.2, 1);
  const gross = totalArea(f, 'gross');
  expect(gross).toBeGreaterThan(370);
  expect(gross).toBeLessThan(385); // 벽 바닥면적을 중심선 기준으로 교차부까지 중복 계산한다(18.8 x 20.2 = 379.8 m² 근처)
  expect(totalArea(f, 'net')).toBeCloseTo(345.6, 0);
  expect(f.walls.length).toBeGreaterThanOrEqual(28);
  expect(f.walls.every(w => w.thickness === spec.thickness)).toBe(true);
});

test('loading the sample replaces the project and can be undone', () => {
  const store = createStore(createEmptyProject());
  loadSample(store);
  expect(activeFloor(store.get()).rooms).toHaveLength(11);
  expect(store.get().name).toBe(spec.name);
  store.undo();
  expect(activeFloor(store.get()).rooms).toHaveLength(0);
});

test('every wall piece is axis aligned and no two pieces are duplicated', () => {
  const f = activeFloor(buildSampleProject());
  for (const w of f.walls) expect(w.a[0] === w.b[0] || w.a[1] === w.b[1]).toBe(true);
  const keys = f.walls.map(w => [w.a.join(','), w.b.join(',')].sort().join('|'));
  expect(new Set(keys).size).toBe(keys.length);
});
