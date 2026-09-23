import { test, expect } from 'vitest';
import { buildSampleProject, loadSample } from '../src/samples/gangdang.js';
import spec from '../src/samples/gangdang.json';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, SCHEMA_VERSION } from '../src/state/schema.js';
import { totalArea } from '../src/state/floorOps.js';
import { roomAirflow, systemAirflow, airflowSummary } from '../src/vent/airflow.js';
import { equipType } from '../src/vent/equipment.js';
import { ductLength, riser } from '../src/geom/ducts.js';
import { collidingIds } from '../src/geom/collide.js';

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

test('loading the sample replaces the project and leaves no undo step', () => {
  const store = createStore(createEmptyProject());
  loadSample(store);
  expect(activeFloor(store.get()).rooms).toHaveLength(11);
  expect(store.get().name).toBe(spec.name);
  expect(store.canUndo()).toBe(false);            // §17.3: 프로젝트 교체는 되돌릴 단계가 아니다
  expect(store.undo()).toBe(false);
  expect(activeFloor(store.get()).rooms).toHaveLength(11);
});

test('every wall piece is axis aligned and no two pieces are duplicated', () => {
  const f = activeFloor(buildSampleProject());
  for (const w of f.walls) expect(w.a[0] === w.b[0] || w.a[1] === w.b[1]).toBe(true);
  const keys = f.walls.map(w => [w.a.join(','), w.b.join(',')].sort().join('|'));
  expect(new Set(keys).size).toBe(keys.length);
});

test('샘플에 설비 39개가 종류별로 들어간다', () => {
  const f = activeFloor(buildSampleProject());
  expect(f.items).toHaveLength(39);
  const count = t => f.items.filter(i => equipType(i) === t).length;
  expect([count('hood'), count('appliance'), count('diffuser'), count('fan'), count('ventcap')]).toEqual([10, 3, 20, 4, 2]);
  expect(f.items.every(i => i.kind === 'equipment')).toBe(true);
  expect(new Set(f.items.map(i => i.id)).size).toBe(39);
});

test('후드 10개의 풍량이 M-106 규격표와 같다', () => {
  const f = activeFloor(buildSampleProject());
  const hoods = f.items.filter(i => equipType(i) === 'hood');
  expect(hoods.map(h => h.props.cmh).sort((a, b) => a - b)).toEqual([396, 3326, 3326, 3456, 3600, 4590, 4590, 4990, 4990, 6426]);
  expect(hoods.every(h => h.attach === 'ceiling' && h.z === 1900)).toBe(true);   // 천장 3500에 밀착하지 않고 z 1900(상단 2500)에 건다
  const h3 = hoods.find(h => h.props.no === 3);
  expect(h3.pos).toEqual([14350, 12700]);
  expect(h3.rot).toBe(90);
  expect(h3.props.system).toBe('F-3');
});

test('디퓨저·팬·환기캡이 제자리에 앉는다', () => {
  const f = activeFloor(buildSampleProject());
  const diffs = f.items.filter(i => equipType(i) === 'diffuser');
  expect(diffs.every(d => d.z === 3400)).toBe(true);                            // 3500 − 100
  expect(diffs.filter(d => d.props.symbol === '가')).toHaveLength(6);
  expect(diffs.filter(d => d.props.flow === 'exhaust')).toHaveLength(5);        // 라 2개 + 바 3개
  expect(f.items.filter(i => equipType(i) === 'fan').map(i => i.props.fanId).sort()).toEqual(['F-2', 'F-3', 'F-4', 'FB']);
  const caps = f.items.filter(i => equipType(i) === 'ventcap');
  expect(caps.every(c => c.attach === 'wall' && typeof c.wallId === 'string')).toBe(true);
  expect(caps.map(c => c.props.dia).sort()).toEqual([100, 150]);
  // 조리기구는 후드 아래에 붙는다(hoodId가 실제 후드를 가리킨다)
  const app = f.items.filter(i => equipType(i) === 'appliance');
  expect(app.every(a => f.items.some(h => h.id === a.props.hoodId && equipType(h) === 'hood'))).toBe(true);
});

test('덕트 10개가 추정 표시와 함께 들어가고 연결이 모두 살아 있다', () => {
  const f = activeFloor(buildSampleProject());
  expect(f.ducts).toHaveLength(10);
  expect(f.ducts.every(d => d.estimated === true)).toBe(true);
  expect(f.ducts.every(d => d.segments.length === d.points.length - 1)).toBe(true);
  const ids = new Set(f.items.map(i => i.id));
  for (const d of f.ducts) for (const c of d.connections) expect(ids.has(c.itemId), `${d.id}/${c.point}`).toBe(true);
  expect(f.ducts.filter(d => d.kind === 'supply')).toHaveLength(4);
  expect(f.ducts.filter(d => d.kind === 'exhaust')).toHaveLength(6);
  expect(f.ducts.reduce((s, d) => s + d.connections.length, 0)).toBe(35);
  expect(f.ducts.reduce((s, d) => s + d.dampers.length, 0)).toBe(11);
  const east = f.ducts.find(d => d.id === 'duct_f3_east');
  expect(east.segments.map(s => s.w)).toEqual([1000, 1000, 1000, 800, 800]);    // 한 폴리라인 안에서 축소된다(DT-04)
  expect(Math.round(ductLength(east))).toBe(21650);                             // 13650 + 2300 + 1700 + 2000 + 2000
});

// 리뷰 I-3: 후드가 천장(3500)에 밀착하지 않고 z 1900(상단 2500)에 걸려 덕트(중심 z 2900) 아래에
// 여유를 두므로, riser()가 모든 연결에서 실제로 쓸모 있는 라이저(≥10mm)를 만들고 설비 박스와
// 덕트 구간 박스가 z 방향으로 겹치지 않는다(둘 중 하나가 온전히 위/아래에 있다 — fractional-safe로 1mm 여유를 둔다).
test('덕트-설비 연결 35곳 전부에서 라이저가 서고 박스가 겹치지 않는다', () => {
  const f = activeFloor(buildSampleProject());
  const byId = new Map(f.items.map(i => [i.id, i]));
  let checked = 0;
  for (const d of f.ducts) {
    for (const c of d.connections) {
      const item = byId.get(c.itemId);
      expect(item, `${d.id}/${c.point} -> ${c.itemId}`).toBeTruthy();
      const seg = d.segments[Math.min(c.point, d.segments.length - 1)];
      const r = riser(item, d, c);
      expect(r, `${d.id}/${c.point} riser`).toBeTruthy();
      expect(r.z1 - r.z0).toBeGreaterThanOrEqual(10);
      const itemBottom = Number(item.z) || 0;
      const itemTop = itemBottom + (Number(item.size?.[2]) || 0);
      const segBottom = seg.z - seg.h / 2;
      const segTop = seg.z + seg.h / 2;
      // 설비와 덕트 구간이 z로 겹치지 않는다: 설비가 온전히 아래(장바닥 팬)거나 온전히 위(천장 디퓨저)거나,
      // 후드처럼 아래 걸려도 상단이 덕트 하단보다 낮다.
      const noOverlap = itemTop <= segBottom + 1e-6 || itemBottom >= segTop - 1e-6;
      expect(noOverlap, `${d.id}/${c.point} item[${itemBottom},${itemTop}] vs seg[${segBottom},${segTop}]`).toBe(true);
      checked++;
    }
  }
  expect(checked).toBe(35);
  // 후드 10개는 모두 상단 2500, 연결된 구간 하단이 그보다 최소 150mm 위(가장 좁은 F-4 구간 기준)다.
  const hoods = f.items.filter(i => equipType(i) === 'hood');
  expect(hoods.every(h => h.z + h.size[2] === 2500)).toBe(true);
  for (const d of f.ducts) {
    for (const c of d.connections) {
      const item = byId.get(c.itemId);
      if (equipType(item) !== 'hood') continue;
      const seg = d.segments[Math.min(c.point, d.segments.length - 1)];
      expect(seg.z - seg.h / 2 - 2500).toBeGreaterThanOrEqual(10);
    }
  }
});

test('샘플 풍량이 M-106 실별·계통별 표와 맞는다', () => {
  const f = activeFloor(buildSampleProject());
  const rooms = roomAirflow(f);
  const at = name => rooms.find(r => r.name === name);
  expect(at('가열조리실')).toMatchObject({ EA: 32642, SA: 19200, design: { EA: 32641, SA: 24000 } });
  expect(at('식기구세척실')).toMatchObject({ EA: 7048, SA: 6000, design: { EA: 7049, SA: 6000 } });
  expect(at('비가열조리실')).toMatchObject({ EA: 2000, SA: 2000 });
  expect(at('전처리실')).toMatchObject({ EA: 3000, SA: 3000 });
  const sys = Object.fromEntries(systemAirflow(f).map(s => [s.system, s]));
  expect(sys['F-2'].EA).toBe(7048);
  expect(sys['F-3'].EA).toBe(24062);
  expect(sys['F-4'].EA).toBe(13580);
  expect(sys.FB.SA).toBe(6000);
  expect(sys.OA.SA).toBe(24200);
  const s = airflowSummary(f);
  expect(s.totalEA).toBe(44690);
  expect(s.totalSA).toBe(30200);
});

test('바닥 설비가 서로 겹치지 않고 샘플이 빠르게 만들어진다', () => {
  const f = activeFloor(buildSampleProject());
  expect([...collidingIds(f.items)]).toEqual([]);            // 조리기구·팬 발자국이 겹치지 않는다
  const t0 = performance.now();
  buildSampleProject();
  expect(performance.now() - t0).toBeLessThan(100);          // 시작 화면이 샘플을 즉시 띄운다
});

test('샘플 불러오기가 설비 39개·덕트 10개를 되돌릴 단계 없이 넣는다', () => {
  const store = createStore(createEmptyProject());
  loadSample(store);
  expect(activeFloor(store.get()).items).toHaveLength(39);
  expect(activeFloor(store.get()).ducts).toHaveLength(10);
  expect(store.canUndo()).toBe(false);            // §17.3
  store.undo();
  expect(activeFloor(store.get()).items).toHaveLength(39);
  expect(activeFloor(store.get()).ducts).toHaveLength(10);
});
