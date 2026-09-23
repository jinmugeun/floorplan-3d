// §18.5(단위·원점)·§18.8(층고 한 칸). 이 파일이 "DXF가 평범한 프로젝트가 된다"를 못 박는다.
import { test, expect } from 'vitest';
import { INSUNITS_SCALE, unitScale, makeToApp, nameRooms, drawingTitle, DXF_DEFAULT_NAME, buildProject } from '../src/io/dxf/toProject.js';
import { normalizeProject, createItem } from '../src/state/schema.js';
import { productById } from '../src/products/catalog.js';

// DXF 좌표계(y 위쪽)의 이중선 사각형 중심선 넷.
const rect = (x0, y0, x1, y1, thickness = 200) => [
  { a: [x0, y0], b: [x1, y0], thickness },
  { a: [x1, y0], b: [x1, y1], thickness },
  { a: [x1, y1], b: [x0, y1], thickness },
  { a: [x0, y1], b: [x0, y0], thickness },
];
const txt = (x, y, h, text) => ({ p: [x, y], h, text, layer: 'A-SHE', depth: 0, block: null });

test('$INSUNITS 배율표와 0(미지정) 추정 규칙', () => {
  expect(INSUNITS_SCALE).toEqual({ 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 });
  expect(unitScale(4, 44054)).toEqual({ scale: 1, guessed: false });
  expect(unitScale(1, 1000)).toEqual({ scale: 25.4, guessed: false });
  expect(unitScale(2, 1000)).toEqual({ scale: 304.8, guessed: false });
  expect(unitScale(5, 1000)).toEqual({ scale: 10, guessed: false });
  expect(unitScale(6, 1000)).toEqual({ scale: 1000, guessed: false });
  // 0이면 도면 크기로 추정한다: 긴 변 ≥ 10,000이면 mm · 10~1,000이면 m · 그 밖은 1.
  expect(unitScale(0, 44054)).toEqual({ scale: 1, guessed: true });
  expect(unitScale(0, 44.05)).toEqual({ scale: 1000, guessed: true });
  expect(unitScale(0, 3000)).toEqual({ scale: 1, guessed: true });
  expect(unitScale(9, 44054).guessed).toBe(true);        // 모르는 값도 추정으로 떨어진다
});

test('makeToApp은 중심을 원점으로 옮기고 y를 뒤집고 정수로 반올림한다', () => {
  const { toApp, box, size } = makeToApp(rect(100.5, 200.25, 4100.5, 3200.25));
  expect(box).toEqual([100.5, 200.25, 4100.5, 3200.25]);
  expect(size).toEqual([4000, 3000]);
  expect(toApp([100.5, 200.25])).toEqual([-2000, 1500]);   // 좌하단(DXF) → 좌하단(앱, y 아래)
  expect(toApp([4100.5, 3200.25])).toEqual([2000, -1500]);
  expect(toApp([1100.7, 700.4])).toEqual([-1000, 1000]);   // 반올림
  // 배율은 좌표에 함께 곱해진다(인치 도면).
  const inch = makeToApp(rect(0, 0, 100, 50), 25.4);
  expect(inch.toApp([0, 0])).toEqual([-1270, 635]);
  expect(inch.size).toEqual([2540, 1270]);
});

test('drawingTitle은 가장 큰 문자 → 파일 이름 → 기본값 순서다', () => {
  expect(DXF_DEFAULT_NAME).toBe('DXF 가져오기');
  expect(drawingTitle([txt(0, 0, 300, '조리실'), txt(0, 0, 980, '경산 사동중')], 'x.dxf')).toBe('경산 사동중');
  expect(drawingTitle([txt(0, 0, 300, '조리실')], '1층 평면도.dxf')).toBe('1층 평면도');
  expect(drawingTitle([], '_޽ıⱸ.dxf')).toBe(DXF_DEFAULT_NAME);   // 디스크에서 이미 깨진 이름
  expect(drawingTitle([], '')).toBe(DXF_DEFAULT_NAME);
  expect(drawingTitle([txt(0, 0, 700, 'X'.repeat(60))], '')).toHaveLength(40);  // 40자로 자른다
  // 사전 검토 I-6: 높이만 보면 지시선 라벨이 이긴다. 실파일에서 `퇴식동선`(급식기구 · h 1725)이
  // `경산 사동중`(T · h 980)을 눌러 프로젝트 이름이 "퇴식동선"이 됐다 — 레이어 집합이 그것을 막는다.
  const mixed = [{ ...txt(0, 0, 1725, '퇴식동선'), layer: '급식기구' }, { ...txt(0, 0, 980, '경산 사동중'), layer: 'T' }];
  expect(drawingTitle(mixed, 'x.dxf')).toBe('퇴식동선');
  expect(drawingTitle(mixed, 'x.dxf', new Set(['T', 'TEXT2']))).toBe('경산 사동중');
  expect(drawingTitle(mixed, '평면도.dxf', new Set(['TEXT2']))).toBe('평면도');   // 남는 게 없으면 파일 이름
});

test('사각형 하나가 방 하나가 되고 층고 한 칸이 층·벽·방을 함께 정한다', () => {
  const { project, stats } = buildProject(rect(100.5, 200.25, 6100.5, 4200.25), { height: 3500 });
  const floor = project.floors[0];
  expect(project).toEqual(normalizeProject(project));           // normalizeProject를 그대로 통과한다
  expect(project.version).toBe(1);
  expect(project.units).toBe('mm');
  expect(floor.walls).toHaveLength(4);
  expect(floor.rooms).toHaveLength(1);
  expect(floor.height).toBe(3500);
  expect(floor.slab).toBe(0);
  expect(floor.walls.every(w => w.height === 3500)).toBe(true);
  expect(floor.rooms.every(r => r.height === 3500)).toBe(true);
  expect(floor.rooms.every(r => r.matchWallHeight === false)).toBe(true);
  expect(stats).toMatchObject({ walls: 4, rooms: 1, openEnds: [], items: 0, size: [6000, 4000] });
  expect(stats.areaM2).toBeCloseTo(22.0, 1);                    // (6000−200) × (4000−200) mm²
  expect(stats.thickness).toEqual([[200, 4]]);
});

// §18.4의 함정: normalizeFloor가 rooms를 다시 계산한다. 이름이 살아남는 유일한 길은
// detectRooms가 낸 객체(같은 wallIds)를 그대로 넘기는 것이다.
test('방 이름이 normalizeFloor의 재계산을 살아서 통과한다', () => {
  const texts = [txt(3100.5, 2200.25, 300, '조리실'), txt(99999, 99999, 300, '세척실')];
  const { project, stats } = buildProject(rect(100.5, 200.25, 6100.5, 4200.25), { texts, fileName: '평면도.dxf' });
  expect(project.floors[0].rooms[0].name).toBe('조리실');
  expect(stats.unmatchedNames).toEqual(['세척실']);             // 닫히지 않은 공간 1곳
  expect(project.name).toBe('평면도');                           // 높이 600 이상 문자가 없으면 파일 이름
  // 자동 이름을 끄면 아무 이름도 넣지 않는다.
  const off = buildProject(rect(100.5, 200.25, 6100.5, 4200.25), { texts, autoNames: false });
  expect(off.project.floors[0].rooms[0].name).toBe('');
  expect(off.stats.unmatchedNames).toEqual([]);
});

test('normalizeWalls로 T자를 쪼갠 뒤에 고립 덩어리를 버린다', () => {
  const stub = { a: [3100.5, 4200.25], b: [3100.5, 6200.25], thickness: 200 };   // 위쪽 벽에 붙는 가지
  const island = [
    { a: [90000.5, 0.25], b: [91000.5, 0.25], thickness: 200 },
    { a: [91000.5, 0.25], b: [91000.5, 900.25], thickness: 200 },
  ];
  const { project, stats } = buildProject([...rect(100.5, 200.25, 6100.5, 4200.25), stub, ...island]);
  expect(stats.walls).toBe(6);            // 사각형 4 → 위쪽 벽이 쪼개져 5 + 가지 1. 섬 2개는 사라진다
  expect(stats.rooms).toBe(1);
  expect(stats.openEnds).toHaveLength(1); // 가지의 자유로운 끝 하나
  expect(stats.thickness).toEqual([[200, 6]]);
});

// Task 7 리뷰 F1: 끊긴 끝점 키는 geom/rooms.js와 같은 반올림이어야 한다. 살짝 기운 벽에 T로 닿은 가지는
// normalizeWalls가 분할점을 소수 좌표로 만들어, 정확한 float 키로는 방 엔진이 이어 붙인 점이 끊긴 끝으로 보고됐다.
test('T 분할의 소수 좌표는 끊긴 끝점이 아니다(반올림 키)', () => {
  // 앱 좌표는 정수로 반올림되므로 기울기는 반올림 뒤에도 남을 만큼(6 m에 1 mm) 준다.
  // 가지가 닿는 분할점은 y = 1999.6(소수) · 가지 끝은 y = 2000 → 정확한 float 키면 서로 다른 점이다.
  const tilted = [
    { a: [100.5, 200.25], b: [6100.5, 201.25], thickness: 200 },   // 위쪽 벽이 1 mm 기울었다
    { a: [6100.5, 201.25], b: [6100.5, 4200.25], thickness: 200 },
    { a: [6100.5, 4200.25], b: [100.5, 4200.25], thickness: 200 },
    { a: [100.5, 4200.25], b: [100.5, 200.25], thickness: 200 },
    { a: [2500.5, 200.25], b: [2500.5, 1500.75], thickness: 200 },  // 위쪽 벽에 T로 닿는 가지
  ];
  const { stats } = buildProject(tilted);
  expect(stats.rooms).toBe(1);
  expect(stats.openEnds).toHaveLength(1);                          // 가지의 자유로운 끝 하나뿐(정확한 float 키면 2가 된다)
});

test('단위 배율은 좌표와 두께에 함께 곱해진다', () => {
  const { project, stats } = buildProject(rect(0, 0, 100, 50, 4), { scale: 25.4, height: 3500 });
  const floor = project.floors[0];
  expect(stats.size).toEqual([2540, 1270]);
  expect(floor.walls.every(w => w.thickness === 102)).toBe(true);   // 4 in × 25.4 = 101.6 → 102
  const xs = floor.walls.flatMap(w => [w.a[0], w.b[0]]);
  expect(Math.min(...xs)).toBe(-1270);
  expect(Math.max(...xs)).toBe(1270);
});

test('openings 콜백이 받은 벽으로 만든 아이템이 층에 실린다', () => {
  let seen = null;
  const { project, stats } = buildProject(rect(100.5, 200.25, 6100.5, 4200.25), {
    openings: ({ walls, toApp }) => {
      seen = { walls: walls.length, origin: toApp([3100.5, 2200.25]) };
      return [createItem(productById('door-swing-900'), { attach: 'wall', wallId: walls[0].id, t: 0.5, pos: [0, 1500], rot: 0 })];
    },
  });
  expect(seen).toEqual({ walls: 4, origin: [0, 0] });
  expect(project.floors[0].items).toHaveLength(1);
  expect(project.floors[0].items[0]).toMatchObject({ kind: 'door', productId: 'door-swing-900', attach: 'wall', t: 0.5 });
  expect(stats.items).toBe(1);
});

test('벽이 하나도 없으면 빈 층을 만들고 통계도 0이다', () => {
  const { project, stats } = buildProject([], { fileName: 'empty.dxf' });
  expect(project.floors[0].walls).toEqual([]);
  expect(project.floors[0].rooms).toEqual([]);
  expect(stats).toMatchObject({ walls: 0, rooms: 0, areaM2: 0, openEnds: [], size: [0, 0] });
  expect(project.name).toBe('empty');
});

test('닫힌 방 두 개가 벽 하나를 공유해도 각각 이름을 받는다', () => {
  const walls = [
    ...rect(0.5, 0.25, 8000.5, 4000.25),
    { a: [4000.5, 0.25], b: [4000.5, 4000.25], thickness: 200 },
  ];
  const texts = [txt(2000.5, 2000.25, 300, '조리실'), txt(6000.5, 2000.25, 300, '세척실')];
  const { project, stats } = buildProject(walls, { texts });
  expect(stats.rooms).toBe(2);
  expect(project.floors[0].rooms.map(r => r.name).sort()).toEqual(['세척실', '조리실']);
  expect(stats.unmatchedNames).toEqual([]);
  expect(stats.openEnds).toEqual([]);
});
