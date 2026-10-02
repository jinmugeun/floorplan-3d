// 치수 기준선(src/io/dxf/refLines.js · 2026-10-02). 실파일 사동중의 실 면적 11개는 전부 **치수가 가리키는 좌표**로
// 잰 값이었다: 실내벽은 구조체 중심(마감까지 넣은 우리 띠의 중심에서 16~50 mm 비낀다), 외벽은 기둥 그리드
// (벽 안쪽 면보다 100 mm 실내 쪽 — 띠 밖이다). 좌표는 앱 좌표(mm)다.
import { test, expect } from 'vitest';
import { dimLines, axisShiftOf, inheritRefs, assignRefs } from '../src/io/dxf/refLines.js';
import { makeWall } from '../src/geom/walls.js';
import { DXF_PARAMS as P } from '../src/io/dxf/params.js';

const dim = (x1, y1, x2, y2, axis) => ({ p1: [x1, y1], p2: [x2, y2], axis });
const same = p => p;

test('dimLines는 축에 나란한 치수의 측정점 좌표를 축마다 모아 센다', () => {
  const lines = dimLines([
    dim(1000.2, 0, 3700.4, 0, 'x'), dim(3700.4, 0, 7700, 0, 'x'),       // 이어진 가로 치수 — 3700은 두 번
    dim(0, 500, 0, 6200, 'y'), dim(5, 5, 900, 900, null), { layer: 'DIM' },   // 기운 치수·측정점 없는 치수는 버린다
  ], same);
  expect([...lines.x].sort((a, b) => a[0] - b[0])).toEqual([[1000, 1], [3700, 2], [7700, 1]]);
  expect([...lines.y].sort((a, b) => a[0] - b[0])).toEqual([[500, 1], [6200, 1]]);
  // toApp으로 옮긴 좌표를 센다(앱은 y가 뒤집힌다)
  const flipped = dimLines([dim(0, 500, 0, 6200, 'y')], p => [p[0] - 100, -p[1]]);
  expect([...flipped.y.keys()].sort((a, b) => a - b)).toEqual([-6200, -500]);
});

test('벽 띠 안의 치수 좌표가 그 벽의 기준선이다 — 가장 가까운 것, 여럿이 재는 선이 먼저', () => {
  const lines = { x: new Map([[3016, 4], [3066, 2], [9000, 1]]), y: new Map() };
  // 세로 벽 x = 3000 · 두께 295 (띠 2852.5~3147.5). a → b 가 +y면 왼쪽 법선은 −x다: 기준선 3016 = 오른쪽 16 → −16.
  const up = makeWall({ a: [3000, 0], b: [3000, 5000], thickness: 295 });
  expect(axisShiftOf(up, lines, [], P)).toBe(-16);
  const down = makeWall({ a: [3000, 5000], b: [3000, 0], thickness: 295 });
  expect(axisShiftOf(down, lines, [], P)).toBe(16);
  // 띠 안에 한 번만 재는 선과 여럿이 재는 선이 함께 있으면 여럿이 재는 선이다(가까워도 문설주 좌표일 수 있다)
  expect(axisShiftOf(up, { x: new Map([[2990, 1], [3066, 3]]), y: new Map() }, [], P)).toBe(-66);
  // 띠 안에 좌표가 있으면 띠 밖의 그리드보다 먼저다(사동중 식품창고: 띠 안 1188702×2를 두고 241 mm 밖의 다른 벽 좌표
  // 1188452×4를 골라 면적이 0.71 m² 줄었다)
  expect(axisShiftOf(up, { x: new Map([[3009, 2], [2759, 4]]), y: new Map() }, [], P)).toBe(-9);
  // 한두 번만 재는 띠 안 좌표는 띠 중심 가까이(refCore)일 때만 그 벽의 구조체 중심이다 — 면 쪽에 붙은 좌표(옆 벽의 문설주)는
  // 아니다. 그때는 띠 밖의 그리드가 기준선이다(사동중 영양관리실 북쪽 벽: 띠 안 94 mm의 ×2 좌표를 골라 1.6 m² 어긋났다).
  expect(axisShiftOf(up, { x: new Map([[3094, 2], [3206, 3]]), y: new Map() }, [], P)).toBe(-206);
  expect(axisShiftOf(up, { x: new Map([[3094, 2]]), y: new Map() }, [], P)).toBe(0);
  // 띠 안에 아무것도 없으면 0(그려진 중심선 그대로)
  expect(axisShiftOf(up, { x: new Map([[9000, 5]]), y: new Map() }, [], P)).toBe(0);
  // 기운 벽은 축에 나란한 치수로 정할 수 없다
  expect(axisShiftOf(makeWall({ a: [0, 0], b: [3000, 3000], thickness: 200 }), lines, [], P)).toBe(0);
});

test('외벽: 띠 밖이어도 refOut 안에 여럿이 재는 선(그리드)이나 기둥 중심선이 있으면 그것이 기준선이다', () => {
  // 가로 벽 y = 1000 · 두께 400 (띠 800~1200). 그리드 y = 1307(띠에서 107 밖 · 여섯 번 잰다).
  const wall = makeWall({ a: [0, 1000], b: [20000, 1000], thickness: 400 });   // +x 방향: 왼쪽 법선 = perp([1,0]) = [0,1]
  expect(axisShiftOf(wall, { x: new Map(), y: new Map([[1307, 6]]) }, [], P)).toBe(307);
  // 한두 번만 재는 띠 밖 좌표(옆 벽의 문설주)는 기준선이 아니다
  expect(axisShiftOf(wall, { x: new Map(), y: new Map([[1307, 2]]) }, [], P)).toBe(0);
  // refOut보다 멀면 아니다
  expect(axisShiftOf(wall, { x: new Map(), y: new Map([[1500, 6]]) }, [], P)).toBe(0);
  // 치수가 없어도 벽에 박힌 기둥 둘 이상의 중심이 한 줄이면 그 줄이 기준선이다
  const cols = [{ pos: [2000, 1300], size: [500, 700], rot: 0 }, { pos: [9000, 1302], size: [500, 700], rot: 0 }, { pos: [5000, 9000], size: [500, 700], rot: 0 }];
  expect(axisShiftOf(wall, { x: new Map(), y: new Map() }, cols, P)).toBe(301);
  expect(axisShiftOf(wall, { x: new Map(), y: new Map() }, cols.slice(0, 1), P)).toBe(0);
  expect([P.refOut, P.refGrid, P.refCore]).toEqual([200, 3, 60]);
});

// 사동중 휴게실(여) 동쪽: 외벽(두께 345 · 기준선 = 그리드)이 창 옆에서 122 mm 꺾여 100 mm 토막(길이 0.5 m)이 됐다 —
// 토막의 띠에서는 그리드가 refOut 밖이라 기준선을 못 찾았고, 그만큼(0.36 × 0.54 m) 방이 넓어졌다.
// 기준선 없는 벽은 **끝이 이어진 나란한 이웃 벽**의 기준선을 물려받는다.
test('inheritRefs: 기준선 없는 토막은 이어진 나란한 이웃 벽의 기준선을 물려받는다', () => {
  const main = makeWall({ a: [5000, 0], b: [5000, 5000], thickness: 345 }); main.axisShift = 238;       // +y 방향: 왼쪽 법선 −x → 기준선 x 4762
  const jog = makeWall({ a: [5000, 5000], b: [5122, 5000], thickness: 100 });
  const stub = makeWall({ a: [5122, 5000], b: [5122, 5540], thickness: 100 });
  const far = makeWall({ a: [9000, 5000], b: [9000, 9000], thickness: 200 });
  inheritRefs([main, jog, stub, far], P);
  expect(stub.axisShift).toBe(360);            // 5122 − 4762, 같은 +y 방향
  expect(far.axisShift).toBeUndefined();       // 이웃이 아니다
  expect(jog.axisShift).toBeUndefined();       // 직각인 벽은 물려받지 않는다
  // 반대로 그린 토막은 부호가 뒤집힌다
  const back = makeWall({ a: [5122, 5540], b: [5122, 5000], thickness: 100 });
  inheritRefs([main, jog, back], P);
  expect(back.axisShift).toBe(-360);
  // 기준선이 너무 멀면(> 두께/2 + 2·refOut) 물려받지 않는다
  const off = makeWall({ a: [5600, 5000], b: [5600, 5540], thickness: 100 });
  inheritRefs([main, makeWall({ a: [5000, 5000], b: [5600, 5000], thickness: 100 }), off], P);
  expect(off.axisShift).toBeUndefined();
});

// 사동중 영양관리실 북쪽: 같은 벽 줄의 접합부 토막(두께 515)이 띠 중심 31 mm의 약한 좌표(×2)를 기준선으로 골랐는데,
// 이어진 옆 토막은 그리드(×3)였다 — 한 줄의 벽이 두 기준선으로 갈려 0.18 m² 어긋났다. 약한 기준선(한두 번만 재는
// 좌표)은 이어진 나란한 이웃의 **강한 기준선**(여럿이 재는 선·기둥 줄)에 진다.
test('assignRefs: 약한 기준선은 이어진 이웃의 강한 기준선에 진다', () => {
  const a = makeWall({ a: [0, 1000], b: [6000, 1000], thickness: 395 });          // 그리드 y = 1206 (×3) → 강함
  const jog = makeWall({ a: [6000, 1000], b: [6000, 875], thickness: 395 });
  const b = makeWall({ a: [6000, 875], b: [6600, 875], thickness: 515 });          // 띠 안 31 mm에 약한 좌표 y = 906 (×2)
  const lone = makeWall({ a: [20000, 875], b: [26000, 875], thickness: 515 });     // 이웃이 없으면 약한 기준선 그대로
  const lines = { x: new Map(), y: new Map([[1206, 3], [906, 2]]) };
  assignRefs([a, jog, b, lone], lines, [], P);
  expect(a.axisShift).toBe(206);
  expect(b.axisShift).toBe(331);               // 906이 아니라 1206
  expect(lone.axisShift).toBe(31);
  // 강한 기준선은 이웃이 무엇이든 바뀌지 않는다
  const s1 = makeWall({ a: [0, 1000], b: [6000, 1000], thickness: 395 }), s2 = makeWall({ a: [6000, 1000], b: [9000, 1000], thickness: 395 });
  assignRefs([s1, s2], { x: new Map(), y: new Map([[1206, 3]]) }, [], P);
  expect([s1.axisShift, s2.axisShift]).toEqual([206, 206]);
});
