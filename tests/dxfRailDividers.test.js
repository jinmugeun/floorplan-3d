// 난간 선 → 구획선(src/io/dxf/railDividers.js · 2026-10-12 계획 12 Task 5). 공개 코퍼스의 발코니는 건물 벽 + 난간(栏杆·阳台·4-BACLONY 레이어)
// 으로 둘러싸이는데 난간이 벽 레이어가 아니라 방이 닫히지 않았다. 난간 선이 벽 끝·몸통 사이를 이으면 구획선(virtual · 두께·3D·견적 없음)으로 넣는다.
// 좌표는 앱 좌표(mm · y 아래), 넓이는 m²(벽 중심선 기준)다.
import { test, expect } from 'vitest';
import { railDividers } from '../src/io/dxf/railDividers.js';
import { buildProject } from '../src/io/dxf/toProject.js';
import { makeWall } from '../src/geom/walls.js';
import { normalizeWalls } from '../src/geom/normalize.js';
import { detectRooms } from '../src/geom/rooms.js';

const wall = (x1, y1, x2, y2, thickness = 200) => makeWall({ a: [x1, y1], b: [x2, y2], thickness });
const line = (x1, y1, x2, y2) => ({ a: [x1, y1], b: [x2, y2] });
const areas = walls => detectRooms(walls).map(r => Math.round(r.areaCenter * 100) / 100).sort((a, b) => a - b);
const ends = w => [w.a, w.b];
// 6 m 발코니 자리: 건물 벽(y = 0) + 양옆 벽(x = 0 · 6000, 길이 side) — 앞(y = 1600)은 난간뿐이라 방이 닫히지 않는다.
const bay = (side = 1600, width = 6000) => normalizeWalls([wall(-2000, 0, width + 2000, 0), wall(0, 0, 0, side), wall(width, 0, width, side)]);
// 벽 끝·몸통에서 끊긴 끝(차수 1) 수 — 구획선이 끊긴 끝을 늘리면 안 된다.
const openEnds = walls => {
  const deg = new Map();
  for (const w of walls) for (const p of ends(w)) { const k = `${Math.round(p[0])},${Math.round(p[1])}`; deg.set(k, (deg.get(k) ?? 0) + 1); }
  return [...deg.values()].filter(n => n === 1).length;
};

test('양옆 벽 끝을 잇는 난간 선 → 구획선 하나, 발코니가 방으로 닫힌다', () => {
  const walls = bay();
  expect(areas(walls)).toEqual([]);
  const { walls: out, added } = railDividers(walls, [line(100, 1600, 5900, 1600)]);   // 양옆 벽 면에서 면까지
  expect(added).toBe(1);
  const v = out.filter(w => w.virtual);
  expect(v.map(ends)).toEqual([[[0, 1600], [6000, 1600]]]);                             // 끝은 축 위로 옮겨 벽 중심선 끝에
  expect([v[0].thickness, v[0].rail]).toEqual([20, true]);
  expect(out.filter(w => !w.virtual)).toHaveLength(walls.length);                       // 벽은 그대로
  expect(areas(out)).toEqual([9.6]);
  expect(openEnds(out)).toBe(openEnds(walls) - 2);                                      // 양옆 벽의 끊긴 끝이 닫혔다
});

test('두 줄로 그린 난간(간격 100)과 기둥에서 끊긴 같은 직선 조각 → 가운데 한 줄의 구획선 하나', () => {
  const rails = [line(100, 1550, 3000, 1550), line(3100, 1550, 5900, 1550), line(100, 1650, 5900, 1650)];
  const { walls: out, added } = railDividers(bay(), rails);
  expect(added).toBe(1);
  expect(out.filter(w => w.virtual).map(ends)).toEqual([[[0, 1600], [6000, 1600]]]);
  expect(areas(out)).toEqual([9.6]);
});

test('떠 있는 난간 · 벽을 따라 그린 난간 · railMin보다 짧은 난간은 아무것도 만들지 않는다', () => {
  const walls = bay();
  // 어느 벽에도 닿지 않는 난간(실외기 받침 앞 난간이 따로 떠 있는 꼴)
  expect(railDividers(walls, [line(100, 5000, 5900, 5000)])).toEqual({ walls, added: 0 });
  // 건물 벽(y = 0 · 두께 200) 면을 따라 그린 난간 — 벽이 이미 닫는다(같은 직선 위에 구획선을 겹치지 않는다)
  expect(railDividers(walls, [line(200, 150, 5800, 150), line(200, -150, 5800, -150)])).toEqual({ walls, added: 0 });
  // 폭 500 칸의 300 mm 난간 < railMin 600
  const narrow = bay(1600, 500);
  expect(railDividers(narrow, [line(100, 1600, 400, 1600)])).toEqual({ walls: narrow, added: 0 });
  // 난간이 없으면 받은 배열 그대로
  expect(railDividers(walls, [])).toEqual({ walls, added: 0 });
});

test('ㄱ자 난간(두 줄): 모서리는 두 줄의 교점 하나로 만나고, 되돌아온 끝은 건물 벽 몸통에 붙는다', () => {
  const walls = normalizeWalls([wall(-2000, 0, 8000, 0), wall(0, 0, 0, 1600)]);           // 옆 벽은 왼쪽 하나뿐
  const rails = [
    line(100, 1550, 5950, 1550), line(100, 1650, 6050, 1650),                            // 앞 난간(안 · 밖)
    line(5950, 100, 5950, 1550), line(6050, 100, 6050, 1650),                            // 오른쪽 되돌림(안 · 밖)
  ];
  const { walls: out, added } = railDividers(walls, rails);
  expect(added).toBe(2);
  const v = out.filter(w => w.virtual).map(ends).map(e => e.map(p => p.join(',')).sort());
  expect(v.sort()).toEqual([['0,1600', '6000,1600'], ['6000,0', '6000,1600']]);
  expect(areas(out)).toEqual([9.6]);
  expect(openEnds(out)).toBe(openEnds(walls) - 1);                                      // 옆 벽 끝이 닫혔고 새 끊긴 끝은 없다
  // 되돌림이 건물 벽에 못 미치면(끝이 railSnap + 두께/2보다 멀다) 묶음 전체를 버린다 — 떠 있는 끝을 만들지 않는다.
  const short = [rails[0], rails[1], line(5950, 1000, 5950, 1550), line(6050, 1000, 6050, 1650)];
  expect(railDividers(walls, short)).toEqual({ walls, added: 0 });
});

test('난간끼리 T자: 두 발코니 사이 칸막이 난간은 앞 난간 몸통에 붙고, 앞 난간이 나뉜다', () => {
  const walls = bay(1600, 12000);
  const rails = [line(100, 1600, 11900, 1600), line(6000, 100, 6000, 1550)];             // 앞 난간 · 가운데 칸막이 난간(앞에서 50 모자람)
  const { walls: out, added } = railDividers(walls, rails);
  expect(added).toBe(2);
  expect(areas(out)).toEqual([9.6, 9.6]);
  expect(out.filter(w => w.virtual)).toHaveLength(3);                                   // 앞 난간이 T자 점에서 둘로 나뉜다
  expect(out.filter(w => !w.virtual)).toHaveLength(walls.length + 1);                   // 건물 벽도 칸막이 끝에서 나뉜다
  expect(openEnds(out)).toBe(openEnds(walls) - 2);
});

test('양옆 벽이 난간보다 짧으면(벽 끝이 난간 축 옆) 축은 그대로 두고 벽 끝까지 짧은 연결선을 단다', () => {
  const walls = bay(1500);                                                              // 옆 벽 끝 y = 1500, 난간 y = 1600
  const { walls: out, added } = railDividers(walls, [line(100, 1600, 5900, 1600)]);
  expect(added).toBe(3);                                                                // 난간 하나 + 연결선 둘
  const v = out.filter(w => w.virtual).map(ends).map(e => e.map(p => p.join(',')).sort()).sort();
  expect(v).toEqual([['0,1500', '0,1600'], ['0,1600', '6000,1600'], ['6000,1500', '6000,1600']]);
  expect(areas(out)).toEqual([9.6]);
});

// 2026-10-12 · 계획 12 최종 재리뷰 R-1: 정규화 DXF의 DIVIDER가 난간 경로로 돌아온 뒤로, 벽을 일직선으로 이어 낸 면적 표기 구획선이 그 벽의
// 기준선(axisShift)을 잃어 방의 도면 기준 넓이가 바뀌었다(사동중 식당 386.12 → 385.86 · 조리실 102.30 → 102.52). 예전 길(reconcile.divider)처럼
// 벽 끝에서 같은 직선으로 이어지는 구획선은 그 벽의 axisShift를 받는다 — 같은 방향이면 그대로, 거꾸로면 부호를 뒤집는다(같은 절대 기준선).
test('벽 끝에서 같은 직선으로 이어지는 난간 구획선은 그 벽의 기준선(axisShift)을 받는다 — 방향이 거꾸로면 부호를 뒤집는다', () => {
  const room = () => [wall(0, 0, 12000, 0), wall(12000, 0, 12000, 8000), wall(12000, 8000, 0, 8000), wall(0, 8000, 0, 0)];
  const run = (stub, at = 6000) => {
    const { walls: out, added } = railDividers(normalizeWalls([...room(), stub]), [line(at, 2100, at, 7900)]);
    expect(added).toBe(1);
    return { v: out.filter(w => w.virtual), out };
  };
  // 벽 a→b가 구획선 쪽(+y)으로 · 같은 기준선을 거꾸로 적은 벽(b→a · −40): 구획선(+y)은 둘 다 +40, 넓이도 같다.
  const fwd = run({ ...wall(6000, 0, 6000, 2000), axisShift: 40 });
  const rev = run({ ...wall(6000, 2000, 6000, 0), axisShift: -40 });
  for (const { v } of [fwd, rev]) {
    expect(v.map(ends)).toEqual([[[6000, 2000], [6000, 8000]]]);
    const d = v[0].b[1] - v[0].a[1];
    expect(Math.sign(d) * v[0].axisShift).toBe(40);                                        // +y로 읽으면 +40(같은 절대 기준선)
  }
  expect(areas(rev.out)).toEqual(areas(fwd.out));
  expect(areas(fwd.out)).not.toEqual(areas(run(wall(6000, 0, 6000, 2000)).out));              // 기준선이 넓이를 옮긴다(기준선 없는 벽과 다르다)
  expect(run(wall(6000, 0, 6000, 2000)).v[0].axisShift).toBeUndefined();                    // 기준선 없는 벽 → 구획선도 없음(예전과 같다)
  // 벽 끝에 닿아도 같은 직선이 아니면(직각으로 붙는 난간) 기준선을 받지 않는다.
  const side = bay().map(w => (w.a[0] === w.b[0] ? { ...w, axisShift: 30 } : w));
  expect(railDividers(side, [line(100, 1600, 5900, 1600)]).walls.filter(w => w.virtual).map(w => w.axisShift)).toEqual([undefined]);
});

// 2026-10-12 · 계획 13 Task 7(계획 12 Task 5 리뷰 M5-2 · 고정 테스트): 이미 닫힌 방 안에서 벽에서 벽까지 이은 난간은 **지금** 그 방을 가른다.
// "난간 전에 센 방 하나 안에 통째로 든 묶음은 건너뛴다" 가드를 재 보니 공개 roomHit −5 · falseRooms −4 · splitRooms −1(감소 5 = 손실 5)이라
// 넣지 않았다(railDividers.js 머리 주석 ⑤). 한국 계단 난간 위험은 남는다 — 이 동작을 바꾸려면 이 테스트와 함께 다시 재고 바꾼다.
test('닫힌 방 안 난간은 방을 가른다(가드 미채택 — 고정) · 바깥 발코니를 닫는 난간은 그대로 발코니를 닫는다', () => {
  // 6 × 4 m 방(닫힘) + 앞 발코니 자리(y 4000 → 5600 · 양옆 벽만).
  const walls = normalizeWalls([
    wall(0, 0, 6000, 0), wall(6000, 0, 6000, 5600), wall(0, 5600, 0, 0), wall(0, 4000, 6000, 4000),
  ]);
  expect(areas(walls)).toEqual([24]);
  const inside = line(2000, 100, 2000, 3900);                                            // 방 안 · 위 벽 면에서 아래 벽 면까지(계단 난간 꼴)
  const balcony = line(100, 5600, 5900, 5600);                                           // 발코니 앞 · 양옆 벽 끝을 잇는다
  const { walls: out, added } = railDividers(walls, [inside, balcony]);
  expect(added).toBe(2);
  expect(out.filter(w => w.virtual).map(ends).map(e => e.map(p => p.join(',')).sort()).sort())
    .toEqual([['0,5600', '6000,5600'], ['2000,0', '2000,4000']]);
  expect(areas(out)).toEqual([8, 9.6, 16]);                                              // 24 m² 방이 8 + 16으로 갈렸다
});

test('buildProject: 워커가 넘긴 난간 선(DXF 좌표)으로 발코니가 닫히고, stats.railDividers로 따로 센다 — 저장 형식은 그냥 구획선', () => {
  // DXF 좌표(y 위): 건물 벽 y = 1600, 양옆 벽이 아래(y = 0)로 1.6 m, 앞 난간 y = 0.
  const raw = [
    { a: [-2000, 1600], b: [8000, 1600], thickness: 200 },
    { a: [0, 1600], b: [0, 0], thickness: 200 }, { a: [6000, 1600], b: [6000, 0], thickness: 200 },
  ];
  const without = buildProject(raw);
  expect([without.stats.rooms, without.stats.railDividers, without.stats.dividers]).toEqual([0, 0, 0]);
  const { project, stats } = buildProject(raw, { rails: [line(100, 50, 5900, 50), line(100, -50, 5900, -50)] });
  expect([stats.rooms, stats.railDividers, stats.dividers]).toEqual([1, 1, 0]);
  const fl = project.floors[0];
  expect(Math.round(fl.rooms[0].areaCenter * 100) / 100).toBe(9.6);
  expect(fl.walls.filter(w => w.virtual)).toHaveLength(1);
  expect(fl.walls.some(w => 'rail' in w)).toBe(false);                                  // 표지는 세고 지웠다
});
