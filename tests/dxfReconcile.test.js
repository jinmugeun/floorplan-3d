// 방 구조 맞추기(src/io/dxf/reconcile.js · 2026-10-02). 사동중: 도면의 실 면적 표기 11개 중 7개는 벽 좌표가 아니라
// **방의 구조**가 달라 어긋났다 — 벽 없이 트인 식당·조리실·세척실(533.56 한 방), 벽을 넘어 한 실로 센 전처리실
// (16.83 + 16.40 = 33.23) · 영양관리실(37.90 + 3.41 = 41.31), 건물 밖 지시선에 적힌 온수기실(3.84) · 소모품창고(6.00).
// 좌표는 앱 좌표(mm), 넓이는 m²다.
import { test, expect } from 'vitest';
import { addDividers, mergeAnnexes, claimOutside } from '../src/io/dxf/reconcile.js';
import { makeWall, rectWalls } from '../src/geom/walls.js';
import { normalizeWalls } from '../src/geom/normalize.js';
import { detectRooms } from '../src/geom/rooms.js';

const label = (text, x, y, area = null) => ({ text, p: [x, y], area, tier: 1 });
const wall = (x1, y1, x2, y2, thickness = 200) => makeWall({ a: [x1, y1], b: [x2, y2], thickness });
const hall = (...extra) => normalizeWalls([...rectWalls([0, 0], [10000, 6000]), ...extra]);
const areas = walls => detectRooms(walls).map(r => Math.round(r.areaCenter * 100) / 100).sort((a, b) => a - b);

test('구획선: 면적 표기가 둘 든 방은 끊긴 벽 끝을 벽 방향으로 이은 선으로 나눈다', () => {
  // 10 × 6 m 홀. x = 6000에 위·아래 벽 토막(끊긴 끝 둘) — 사이 4 m는 벽 없이 트였다(배식대).
  const walls = hall(wall(6000, 0, 6000, 1000), wall(6000, 6000, 6000, 5000));
  const labels = [label('식당', 3000, 3000, 36), label('조리실', 8000, 3000, 24)];
  expect(areas(walls)).toEqual([60]);
  const out = addDividers(walls, labels);
  const added = out.filter(w => w.virtual);
  expect(added).toHaveLength(1);
  expect([added[0].a, added[0].b]).toEqual([[6000, 1000], [6000, 5000]]);
  expect(areas(out)).toEqual([24, 36]);
  // 원래 벽은 그대로다(구획선만 는다)
  expect(out.filter(w => !w.virtual)).toHaveLength(walls.length);
});

test('구획선: 끝이 벽 몸통에 닿으면 그 벽을 나누고, 구획선은 이어 낸 벽의 기준선을 물려받는다', () => {
  const stub = wall(6000, 0, 6000, 1000); stub.axisShift = 16;            // +y 방향: 왼쪽 법선 −x → 기준선 x 5984
  const out = addDividers(hall(stub), [label('식당', 3000, 3000, 35.9), label('조리실', 8000, 3000, 24.1)]);
  const v = out.find(w => w.virtual);
  expect([v.a, v.b]).toEqual([[6000, 1000], [6000, 6000]]);
  expect(v.axisShift).toBe(16);
  expect(areas(out)).toEqual([24.1, 35.9]);                               // 5.984 × 6 · 4.016 × 6
  // 반대로 그린 토막이면 부호가 뒤집힌다
  const back = wall(6000, 1000, 6000, 0); back.axisShift = -16;
  expect(addDividers(hall(back), [label('식당', 3000, 3000, 35.9), label('조리실', 8000, 3000, 24.1)]).find(w => w.virtual).axisShift).toBe(16);
});

test('구획선: 근거가 없으면 긋지 않는다', () => {
  const walls = hall(wall(6000, 0, 6000, 1000));
  // 면적 표기가 없는 이름뿐 — 이름만으로는 긋지 않는다(기구 라벨·동선 글자가 방을 쪼갠다)
  expect(addDividers(walls, [label('식당', 3000, 3000), label('조리실', 8000, 3000)])).toHaveLength(walls.length);
  // 표기가 한쪽에만 몰려 있으면(나뉜 한쪽이 빈 방) 긋지 않는다
  expect(addDividers(walls, [label('식당', 3000, 2000, 20), label('조리실', 3000, 4000, 16)])).toHaveLength(walls.length);
  // 표기가 하나뿐인 방
  expect(addDividers(walls, [label('식당', 3000, 3000, 60)])).toHaveLength(walls.length);
});

test('구획선: 후보가 여럿이면 나뉜 넓이가 표기와 맞는 것을 고른다', () => {
  const walls = hall(wall(5000, 0, 5000, 800), wall(6000, 0, 6000, 1000));
  const out = addDividers(walls, [label('식당', 2000, 3000, 36), label('조리실', 8000, 3000, 24)]);
  const added = out.filter(w => w.virtual);
  expect(added).toHaveLength(1);
  expect(added[0].a[0]).toBe(6000);
});

test('딸린 방: 표기 넓이가 이웃한 이름 없는 방을 더해야 맞으면 사이 벽은 방을 나누지 않는다', () => {
  // 6 × 4 m. x = 4000 칸막이 — 왼쪽 16 m²(표기 24.00), 오른쪽 8 m²(이름 없음).
  const walls = normalizeWalls([...rectWalls([0, 0], [6000, 4000]), wall(4000, 0, 4000, 4000, 100)]);
  expect(areas(walls)).toEqual([8, 16]);
  const n = mergeAnnexes(walls, [label('전처리실', 2000, 2000, 24)]);
  expect(n).toBe(1);
  expect(walls.filter(w => w.noSplit).map(w => [w.a[0], w.b[0]])).toEqual([[4000, 4000]]);
  expect(areas(walls)).toEqual([24]);
  // 넓이가 맞지 않으면 그대로 둔다
  const other = normalizeWalls([...rectWalls([0, 0], [6000, 4000]), wall(4000, 0, 4000, 4000, 100)]);
  expect(mergeAnnexes(other, [label('전처리실', 2000, 2000, 23)])).toBe(0);
  expect(areas(other)).toEqual([8, 16]);
});

test('딸린 방: 건물 밖 표기가 가리키는 방 · 이름이 있는 방은 더하지 않는다', () => {
  const make = () => normalizeWalls([...rectWalls([0, 0], [6000, 4000]), wall(4000, 0, 4000, 4000, 100)]);
  // 오른쪽 8 m²는 밖에 적힌 "온수기실 (8.00m²)"의 방이다
  const a = make();
  expect(mergeAnnexes(a, [label('전처리실', 2000, 2000, 24), label('온수기실', 9000, 2000, 8)])).toBe(0);
  // 오른쪽에 이름(면적 표기 없는)이 있다
  const b = make();
  expect(mergeAnnexes(b, [label('전처리실', 2000, 2000, 24), label('창고', 5000, 2000)])).toBe(0);
});

test('claimOutside: 어느 방에도 들지 않은 표기는 넓이가 같은 이름 없는 방의 것이다 — 가장 가까운 방', () => {
  const walls = normalizeWalls([...rectWalls([0, 0], [6000, 4000]), wall(4000, 0, 4000, 4000, 100), wall(2000, 0, 2000, 4000, 100)]);
  const rooms = detectRooms(walls);                        // 8 · 8 · 8 m²
  const labels = [label('온수기실', 9000, 2000, 8), label('먼 방', 9000, 9000, 99), label('안쪽', 1000, 2000, 8)];
  const got = claimOutside(rooms, labels);
  expect(got.size).toBe(1);
  const [[room, l]] = [...got];
  expect(l.text).toBe('온수기실');
  expect(Math.min(...room.points.map(p => p[0]))).toBe(4000);     // 셋 중 가장 가까운(오른쪽) 방
});
