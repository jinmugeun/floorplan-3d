// 실명만으로 구획선 제안(src/io/dxf/nameDividers.js · 2026-10-12 계획 12 Task 6) — **옵션, 기본 꺼짐**(사용자 결정 2026-10-02: 면적 표기 없이
// 자동으로 긋지 않는다). 공개 코퍼스의 개방형 거실·식당은 벽 없이 한 방으로 닫힌다. 한 방에 1층 실명이 둘 이상이고 면적 표기가 없으면, 두 실명을
// 잇는 선에 수직인(방의 벽 방향으로 맞춘) 가장 짧은 가로지르기를 구획선(virtual)으로 넣는다. 나뉜 조각이 dividerMinArea(2 m²) 미만이면 긋지 않는다.
// 좌표는 앱 좌표(mm · y 아래), 넓이는 m²(벽 중심선 기준)다.
import { test, expect } from 'vitest';
import { addDividersByNames, isRoomName } from '../src/io/dxf/nameDividers.js';
import { buildProject, nameRooms } from '../src/io/dxf/toProject.js';
import { DXF_PARAMS } from '../src/io/dxf/params.js';
import { makeWall } from '../src/geom/walls.js';
import { normalizeWalls } from '../src/geom/normalize.js';
import { detectRooms } from '../src/geom/rooms.js';

const label = (text, x, y, area = null, tier = 1) => ({ text, p: [x, y], area, tier });
const wall = (x1, y1, x2, y2, thickness = 200) => makeWall({ a: [x1, y1], b: [x2, y2], thickness });
// 꼭짓점 차례대로 벽을 둘러 닫은 방 하나.
const loop = pts => normalizeWalls(pts.map((p, i) => wall(...p, ...pts[(i + 1) % pts.length])));
// ㄱ자 방: 10 × 4 m 팔(아래) + 4 × 4 m 팔(왼쪽 위). 안쪽 모서리 (4000, 4000).
const ELL = [[0, 0], [10000, 0], [10000, 4000], [4000, 4000], [4000, 8000], [0, 8000]];
const areas = walls => detectRooms(walls).map(r => Math.round(r.areaCenter * 100) / 100).sort((a, b) => a - b);
const ends = w => [w.a, w.b].map(p => p.join(',')).sort();

test('ㄱ자 방에 실명 둘(면적 표기 없음) → 두 실명을 잇는 선에 수직인 가장 짧은 가로지르기 하나, 끝은 벽 몸통과 안쪽 모서리', () => {
  const walls = loop(ELL);
  expect(areas(walls)).toEqual([56]);
  // 客厅(아래 팔) ↔ 餐厅(위 팔): 잇는 선 (−5000, 4000)에 수직인 방향은 세로(x 일정) 쪽이 가깝다 — 세로 가로지르기 중 x ∈ [4000, 7000)은
  // 길이 4 m(안쪽 모서리까지), x < 4000은 8 m. 같은 길이면 끝이 벽 끝(꼭짓점)에 닿는 것 → x = 4000.
  const labels = [label('客厅', 7000, 2000), label('餐厅', 2000, 6000)];
  const { walls: out, added } = addDividersByNames(walls, labels);
  expect(added).toBe(1);
  const v = out.filter(w => w.virtual);
  expect(v.map(ends)).toEqual([['4000,0', '4000,4000']]);
  expect(v[0].thickness).toBe(20);
  expect(out.filter(w => !w.virtual)).toHaveLength(walls.length + 1);                  // 아래 벽만 T자 점에서 나뉜다
  const parts = areas(out);
  expect(parts).toEqual([24, 32]);
  expect(Math.min(...parts) * 1e6).toBeGreaterThanOrEqual(DXF_PARAMS.dividerMinArea);
  // 나뉜 방마다 실명 하나
  const rooms = detectRooms(out);
  nameRooms(rooms, [], null, { labels: labels.map(l => ({ ...l })) });
  expect(rooms.map(r => r.name).sort()).toEqual(['客厅', '餐厅']);
});

test('면적 표기가 든 방은 이 규칙이 긋지 않는다(면적 표기 구획선 addDividers의 몫)', () => {
  const walls = loop(ELL);
  const res = addDividersByNames(walls, [label('客厅', 7000, 2000, 24), label('餐厅', 2000, 6000)]);
  expect(res).toEqual({ walls, added: 0 });
});

test('세 실명 → 구획선 둘(이웃한 두 이름마다 · 벽 없는 사각 공간은 두 이름의 한가운데)', () => {
  const walls = loop([[0, 0], [12000, 0], [12000, 4000], [0, 4000]]);
  const labels = [label('客厅', 2000, 2000), label('餐厅', 6000, 2000), label('厨房', 10000, 2000)];
  const { walls: out, added } = addDividersByNames(walls, labels);
  expect(added).toBe(2);
  expect(out.filter(w => w.virtual).map(ends).sort()).toEqual([['4000,0', '4000,4000'], ['8000,0', '8000,4000']]);
  expect(areas(out)).toEqual([16, 16, 16]);
});

test('실명 후보: 두 글자 이상 · 숫자·기호·괄호·로마자 부호가 아닌 것 — 역할표의 room 문자는 늘 후보', () => {
  for (const t of ['客厅', '餐厅', '卫生间', '거실', '식당', '强电', 'Living']) expect(isRoomName(label(t, 0, 0))).toBe(true);
  for (const t of ['水', '电', '上', '1', '12', '3.5', 'A.C.', 'HB-2', 'B-1', "TC21'", 'YD', '（乙）', '(乙)', '--', ' 水 ']) expect(isRoomName(label(t, 0, 0))).toBe(false);
  expect(isRoomName(label('客厅', 0, 0, null, 2))).toBe(false);                             // 2층(벽·기타 레이어 글자)은 아니다
  expect(isRoomName({ ...label('水', 0, 0, null, 1), role: 'room' })).toBe(true);           // 역할표가 room이라 한 글자는 그대로 후보
  // 한 글자 기호와 함께면 실명이 하나뿐이라 긋지 않는다
  const walls = loop([[0, 0], [12000, 0], [12000, 4000], [0, 4000]]);
  expect(addDividersByNames(walls, [label('客厅', 2000, 2000), label('水', 10000, 2000), label('1', 6000, 2000)])).toEqual({ walls, added: 0 });
});

test('가장 짧은 가로지르기가 dividerMinArea(2 m²) 미만 조각을 남기면 긋지 않는다 — 방 한가운데를 대신 가르지도 않는다', () => {
  // 6 × 4 m 침실 + 왼쪽 위 1 × 1.5 m 벽감(1.5 m²)에 설비 글자 "强电"(두 글자라 실명 후보다).
  const walls = loop([[0, 0], [6000, 0], [6000, 4000], [1000, 4000], [1000, 5500], [0, 5500]]);
  const res = addDividersByNames(walls, [label('卧室', 3000, 2000), label('强电', 500, 4800)]);
  expect(res).toEqual({ walls, added: 0 });
  // 벽감이 2 m² 이상이면(1 × 2.5 m) 그 입구를 긋는다
  const big = loop([[0, 0], [6000, 0], [6000, 4000], [1000, 4000], [1000, 6500], [0, 6500]]);
  const { walls: out, added } = addDividersByNames(big, [label('卧室', 3000, 2000), label('储藏', 500, 5500)]);
  expect(added).toBe(1);
  expect(out.filter(w => w.virtual).map(ends)).toEqual([['0,4000', '1000,4000']]);
  expect(areas(out)).toEqual([2.5, 24]);
});

test('buildProject: 옵션 dividerByNames가 꺼져 있으면(기본) 긋지 않고, 켜면 stats.nameDividers로 따로 센다 — 저장 형식은 그냥 구획선', () => {
  // DXF 좌표(y 위)의 ㄱ자 방과 문자 레이어 실명 둘(높이 300).
  const raw = ELL.map((p, i) => ({ a: p, b: ELL[(i + 1) % ELL.length], thickness: 200 }));
  const texts = [{ text: '客厅', p: [7000, 2000], h: 300, layer: 'TEXT' }, { text: '餐厅', p: [2000, 6000], h: 300, layer: 'TEXT' }];
  const off = buildProject(raw, { texts });
  expect([off.stats.rooms, off.stats.nameDividers, off.stats.dividers]).toEqual([1, 0, 0]);
  const on = buildProject(raw, { texts, dividerByNames: true });
  expect([on.stats.rooms, on.stats.nameDividers, on.stats.dividers, on.stats.railDividers]).toEqual([2, 1, 0, 0]);
  const fl = on.project.floors[0];
  expect(fl.rooms.map(r => r.name).sort()).toEqual(['客厅', '餐厅']);
  expect(fl.walls.filter(w => w.virtual)).toHaveLength(1);
  expect(fl.walls.some(w => 'byName' in w)).toBe(false);                                 // 표지는 세고 지웠다
});

// 워커 배선: 추출 옵션 dividerByNames(검토 창 체크박스 · 점수판 --dividers)가 buildProject까지 간다. 이중선(벽 200) 12 × 6 m 방 하나와 문자 레이어 실명 둘.
const line = (x0, y0, x1, y1) => ['0', 'LINE', '8', 'WAL', '10', x0, '20', y0, '11', x1, '21', y1];
const box = (x0, y0, w, h) => [...line(x0, y0, x0 + w, y0), ...line(x0 + w, y0, x0 + w, y0 + h), ...line(x0 + w, y0 + h, x0, y0 + h), ...line(x0, y0 + h, x0, y0)];
const word = (x, y, s) => ['0', 'TEXT', '8', 'TEXT', '10', x, '20', y, '40', 400, '1', s];
const DXF = [
  '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1032', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '2', '0', 'LAYER', '2', 'WAL', '70', '0', '62', '2', '0', 'LAYER', '2', 'TEXT', '70', '0', '62', '7',
  '0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
  ...box(0.5, 0.25, 12000, 6000), ...box(200.5, 200.25, 11600, 5600), ...word(3000.5, 3000.25, '客厅'), ...word(9000.5, 3000.25, '餐厅'),
  '0', 'ENDSEC', '0', 'EOF', '',
].join('\r\n');

test('워커: 추출 옵션 dividerByNames가 없으면 긋지 않고, true면 이름 구획선 하나로 방이 둘이 된다', async () => {
  const posts = [];
  globalThis.self = { postMessage: m => posts.push(m), onmessage: null };
  await import('../src/io/dxf/worker.js');
  const handle = data => { posts.length = 0; globalThis.self.onmessage({ data }); return posts.at(-1); };
  const { summary } = handle({ type: 'parse', buf: new TextEncoder().encode(DXF), fileName: '거실 식당.dxf' });
  const opts = { layers: summary.checked, trace: false };
  const off = handle({ type: 'extract', opts });
  expect([off.stats.rooms, off.stats.nameDividers]).toEqual([1, 0]);
  const on = handle({ type: 'extract', opts: { ...opts, dividerByNames: true } });
  expect([on.stats.rooms, on.stats.nameDividers, on.stats.dividers]).toEqual([2, 1, 0]);
  expect(on.project.floors[0].rooms.map(r => r.name).sort()).toEqual(['客厅', '餐厅']);
});
