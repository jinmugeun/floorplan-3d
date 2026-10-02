// 기둥 라이닝(src/io/dxf/columns.js growLinings · 2026-09-30). 실파일 식당 북서 모서리 기둥(500 × 700, zw$260D)은
// 벽 마감이 둘레를 감아 돈다: 기존 마감선(+25 mm)과 WAL-2 세 겹(+75·85·95 mm)이 ㄱ자로 기둥 남·동 면을 따라가고
// 다리 길이가 350·550으로 제각각이다(같은 다리의 ㄷ자만 찾던 findPilasters가 놓쳤다). 벽을 따라 길게 이어지는 선은
// 벽의 면이라 기둥을 넓히지 않는다.
import { test, expect } from 'vitest';
import { growLinings, findIslands } from '../src/io/dxf/columns.js';
import { DXF_PARAMS as P } from '../src/io/dxf/params.js';

const seg = (x0, y0, x1, y1, layer = 'WAL-2') => ({ a: [x0, y0], b: [x1, y1], layer });
// 기둥: x 0.5~500.5 · y 0.25~700.25 (중심 250.5, 350.25) — 서쪽 면은 서쪽 벽 속, 북쪽 면은 북쪽 벽 속이다.
const col = { c: [250.5, 350.25], u: [1, 0], w: 500, h: 700 };

test('기둥 면 밖 150 mm 안에서 그 면을 따라가는 짧은 선(라이닝)까지 기둥 윤곽을 넓힌다', () => {
  const lining = [
    seg(175.5, -24.75, 525.5, -24.75, '기존'), seg(525.5, -24.75, 525.5, 525.25, '기존'),     // 마감선 ㄱ자(+25)
    ...[75, 85, 95].flatMap(d => [seg(225.5, 0.25 - d, 500.5 + d, 0.25 - d), seg(500.5 + d, 0.25 - d, 500.5 + d, 550.25)]),
  ];
  const [g] = growLinings([col], lining);
  expect(g.w).toBeCloseTo(595, 6);                      // 동쪽 면 500.5 → 595.5
  expect(g.h).toBeCloseTo(795, 6);                      // 남쪽 면 0.25 → −94.75
  expect(g.c[0]).toBeCloseTo((0.5 + 595.5) / 2, 6);
  expect(g.c[1]).toBeCloseTo((-94.75 + 700.25) / 2, 6);
  expect(g.u).toEqual([1, 0]);
});

test('벽을 따라 길게 이어지는 선·면에서 먼 선·면과 조금만 겹치는 선은 라이닝이 아니다', () => {
  const others = [
    seg(175.5, -40.75, 4175.5, -40.75),          // 벽 면: 기둥 면 구간(± 150)을 크게 벗어난다
    seg(0.5, -300.75, 500.5, -300.75),           // 면에서 301 mm — 라이닝 두께가 아니다
    seg(450.5, -60.75, 640.5, -60.75),           // 면과 50 mm만 겹친다(짧은 쪽의 절반 미만)
    seg(200.5, 100.25, 200.5, 600.25),           // 기둥 속 선
  ];
  const [g] = growLinings([col], others);
  expect([g.w, g.h]).toEqual([500, 700]);
  expect(g.c).toEqual(col.c);
  // 기울어진 기둥에서도 기둥 축으로 잰다
  const r = Math.SQRT1_2, tilted = { c: [0, 0], u: [r, r], w: 400, h: 400 };
  const off = 260;                                      // 면(200) 밖 60 mm, 기둥 축 u를 따라가는 선
  const [t] = growLinings([tilted], [seg(-r * 150 - r * off * -1, -r * 150 + r * off * -1, r * 150 - r * off * -1, r * 150 + r * off * -1)]);
  expect(t.h).toBeCloseTo(460, 6);
  expect(t.w).toBeCloseTo(400, 6);
});

// 2026-10-02 내곡중(한 레이어 도면): 세척실 바닥 트렌치(200 × 6,400 닫힌 사각형)가 벽 띠가 됐다. 어디에도 닿지 않고
// 홀로 선 가늘고 긴 닫힌 사각형은 벽이 아니다(트렌치·작업대). 벽 토막은 끝이나 몸통에 다른 선이 와서 닿는다.
const rectOf = (x0, y0, w, h, layer = 'WAL-2') => [seg(x0, y0, x0 + w, y0, layer), seg(x0 + w, y0, x0 + w, y0 + h, layer), seg(x0 + w, y0 + h, x0, y0 + h, layer), seg(x0, y0 + h, x0, y0, layer)];
test('findIslands는 어디에도 닿지 않은 가늘고 긴 닫힌 사각형을 고른다', () => {
  const trench = rectOf(5000.5, 1000.25, 200, 6400);
  const room = [...rectOf(0.5, 0.25, 12000, 9000), ...rectOf(200.5, 200.25, 11600, 8600)];
  const found = findIslands([...room, ...trench], new Set(), P);
  expect(found).toHaveLength(1);
  expect(found[0].segs.sort((a, b) => a - b)).toEqual([8, 9, 10, 11]);
  expect([found[0].w, found[0].h].sort((a, b) => a - b)).toEqual([200, 6400]);
  // 다른 선의 끝이 사각형에 닿으면(모서리든 변 위든) 홀로 선 것이 아니다 — 벽 사이의 창 사이 벽 토막이 그렇다.
  expect(findIslands([...room, ...trench, seg(5200.5, 3000.25, 8000.5, 3000.25)], new Set(), P)).toHaveLength(0);
  expect(findIslands([...room, ...trench, seg(5100.5, 7400.25, 5100.5, 8200.25)], new Set(), P)).toHaveLength(0);
  // 닫힌 사각형이 아니어도 된다(내곡중 G.T: 긴 선 둘 + 안쪽 사각형 + 아래 막음선, 위는 열림) — 서로 이어진 선 묶음이
  // 가늘고 길며 다른 선과 닿지 않으면 같다.
  const gt = [seg(5000.5, 1000.25, 5000.5, 7900.25), seg(5350.5, 1000.25, 5350.5, 7900.25), seg(5000.5, 1000.25, 5350.5, 1000.25), ...rectOf(5075.5, 1075.25, 200, 6850)];   // 안쪽 윤곽이 위로 25 mm 삐져나온다
  const g = findIslands([...room, ...gt], new Set(), P);
  expect(g).toHaveLength(1);
  expect(g[0].segs).toHaveLength(7);
  // 기둥으로 쓴 선(used)에 닿은 묶음은 홀로 선 것이 아니다 — 두 기둥 사이의 실내벽(사동중 조리실)이 그렇다.
  const cols = [...rectOf(4800.5, 400.25, 600, 600), ...rectOf(4800.5, 7400.25, 600, 600)];
  const between = [seg(5000.5, 1000.25, 5000.5, 7400.25), seg(5200.5, 1000.25, 5200.5, 7400.25)];
  expect(findIslands([...room, ...cols, ...between], new Set([8, 9, 10, 11, 12, 13, 14, 15]), P)).toHaveLength(0);
  // 벽 띠가 될 수 없는 넓은 사각형(짧은 변 > bandGap — 조리대)과 이미 기둥으로 쓴 선은 고르지 않는다.
  expect(findIslands([...room, ...rectOf(5000.5, 1000.25, 700, 2400)], new Set(), P)).toHaveLength(0);
  expect(findIslands([...room, ...trench], new Set([8, 9, 10, 11]), P)).toHaveLength(0);
});
