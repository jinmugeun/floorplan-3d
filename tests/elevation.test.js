// §17.4(2) 개정(§17.15 채택) · 리뷰 I-3·M-7 · 감사 §37: 입면 프레임 규칙의 단위 테스트.
// 규칙이 io/specSheet.js(인쇄물 포매터) 안에 살던 동안 3D 카메라가 그 모듈을 import했다 —
// 이제 geom/ 한 곳이고, 인쇄물·카메라·비트맵이 모두 여기서 같은 값을 받는다.
import { describe, test, expect } from 'vitest';
import { elevationAspect, elevationFrame, planBounds, planExtent, planFrame, planSize, topViewAspect, ELEV_ASPECT_MIN, ELEV_ASPECT_MAX, ELEV_MARGIN } from '../src/geom/elevation.js';
import { rectWalls } from '../src/geom/walls.js';

describe('입면 그림 비율(elevationAspect)', () => {
  test('내용 비율을 16:9와 6:1 사이로 자른다', () => {
    expect(ELEV_ASPECT_MIN).toBeCloseTo(16 / 9, 12);
    expect(ELEV_ASPECT_MAX).toBe(6);
    // 세로로 긴 도면(4.0 × 2.3 m)은 아래 한계에 붙는다: 그림이 더 커지지 않게 막는다.
    expect(elevationAspect({ extent: 4000, height: 2300 })).toBeCloseTo(16 / 9, 12);
    // 그 사이는 그대로 내용 비율이다(샘플 20.0 m · 층고 3.5 m → 5.714).
    expect(elevationAspect({ extent: 20000, height: 3500 })).toBeCloseTo(20000 / 3500, 12);
    expect(elevationAspect({ extent: 8400.5, height: 3500.25 })).toBeCloseTo(8400.5 / 3500.25, 12);
    // 아주 긴 도면은 위 한계에 붙는다(6:1보다 납작하면 본문 폭에서 그림 높이가 128 px 아래로 떨어진다).
    expect(elevationAspect({ extent: 44100, height: 3500 })).toBe(6);
    // 망가진 입력도 답을 준다: 층고 0은 가장 납작한 쪽, 아주 작은 도면은 최소 크기로.
    expect(elevationAspect({ extent: 0, height: 0 })).toBe(6);
    expect(elevationAspect({ extent: 100, height: 2300 })).toBeCloseTo(16 / 9, 12);
  });
});

describe('입면 프레임(elevationFrame)', () => {
  // 개정의 핵심: 16:9 고정 아래에서 20 m 도면의 세로 채움은 27%가 최대였다(재리뷰 1 §2의 상한
  // 계산). 비율을 내용에 맞추면 같은 건물이 **같은 크기로 인쇄되면서** 빈 종이만 사라진다.
  test('비율을 안 넘기면 내용 비율을 쓰고 건물이 그림의 87%를 채운다', () => {
    const fr = elevationFrame({ extent: 20000.5, height: 3500.25 });
    expect(fr.aspect).toBeCloseTo(20000.5 / 3500.25, 12);
    expect(fr.fill).toBeCloseTo(1 / ELEV_MARGIN, 12);            // 0.8696 — 여백 15%가 남은 전부다
    expect(fr.fill).toBeGreaterThanOrEqual(0.8);
    expect(fr.halfW * 2).toBeCloseTo((20000.5 * ELEV_MARGIN) / 1000, 9);   // 폭은 그대로 다 들어간다
    expect(fr.floorFrac + fr.ceilFrac).toBeCloseTo(1, 12);
    expect(fr.floorFrac - fr.ceilFrac).toBeCloseTo(fr.fill, 12);
    // 16:9로 고정했을 때보다 세로 채움이 3.2배다(예전 그림의 73%가 빈 종이였다).
    const old = elevationFrame({ extent: 20000.5, height: 3500.25, aspect: 16 / 9 });
    expect(fr.fill / old.fill).toBeGreaterThan(3);
  });

  // 샘플 모양이되 6:1보다 긴 도면(44.1 m × 층고 3.5 m = 12.6:1). 비율은 6에서 잘리고, 그 대신
  // **폭을 지킨다**: 건물이 그림 폭의 87%를 채우고 세로 채움은 41%로 내려간다(6 / (12.6 × 1.15)).
  // 세로까지 0.8을 채우려면 그림을 12.6:1로 만들거나 벽 절반을 잘라내야 하는데, 앞은 인쇄에서
  // 읽히지 않고(높이 61 px) 뒤는 입면도가 아니다 — 잘린 구간에서는 폭 채움이 그 자리를 대신한다.
  test('6:1보다 긴 도면은 비율이 잘리고 폭 채움이 0.8을 넘는다', () => {
    const fr = elevationFrame({ extent: 44100, height: 3500 });
    expect(fr.aspect).toBe(6);                                   // clamp(12.6, 16/9, 6)
    expect(fr.halfW / fr.halfH).toBeCloseTo(6, 12);
    expect((44100 / 1000) / (2 * fr.halfW)).toBeCloseTo(1 / ELEV_MARGIN, 12);   // 폭 채움 0.8696
    expect((44100 / 1000) / (2 * fr.halfW)).toBeGreaterThanOrEqual(0.8);
    expect(fr.fill).toBeCloseTo(6 / (12.6 * ELEV_MARGIN), 12);
    // 잘려도 예전 16:9보다는 3.4배 크다.
    expect(fr.fill / elevationFrame({ extent: 44100, height: 3500, aspect: 16 / 9 }).fill).toBeCloseTo(6 / (16 / 9), 9);
    // 비율을 6까지만 여는 것이 세로 채움을 포기하는 대가라는 것을 수식으로 남긴다.
    expect(elevationFrame({ extent: 44100, height: 3500, aspect: 12.6 }).fill).toBeCloseTo(1 / ELEV_MARGIN, 12);
  });

  test('넘긴 비율이 이기고(화면 캔버스), 도면 폭은 어느 비율에서도 잘리지 않는다', () => {
    for (const aspect of [0.5, 1, 16 / 9, 6, 12.6]) {
      const fr = elevationFrame({ extent: 8400.5, height: 3500.25, aspect });
      expect(fr.halfW / fr.halfH).toBeCloseTo(aspect, 9);
      expect(fr.halfW * 2 + 1e-9).toBeGreaterThanOrEqual(8.4005);
      expect(fr.centerY).toBeCloseTo(1.750125, 12);
    }
    // 망가진 비율(0·NaN)은 내용 비율로 떨어진다 — 던지지 않는다.
    expect(elevationFrame({ extent: 20000, height: 3500, aspect: 0 }).aspect).toBeCloseTo(20000 / 3500, 12);
    expect(elevationFrame({ extent: 20000, height: 3500, aspect: NaN }).aspect).toBeCloseTo(20000 / 3500, 12);
    // 층고 0인 층도 숫자를 준다(NaN이 CSS에 새지 않는다).
    const zero = elevationFrame({ extent: 20000, height: 0 });
    expect(Number.isFinite(zero.halfH) && Number.isFinite(zero.ceilFrac)).toBe(true);
    expect(zero.fill).toBe(0);
  });
});

test('planExtent는 도면의 가로·세로 중 큰 쪽이다(소수 좌표)', () => {
  expect(planExtent(rectWalls([0, 0], [4000.5, 3000.25], 200))).toBeCloseTo(4000.5, 9);
  expect(planExtent(rectWalls([0, 0], [3000.25, 4000.5], 200))).toBeCloseTo(4000.5, 9);
  expect(planExtent([])).toBe(8000);                             // 벽이 없는 층의 기본값은 planBounds 한 곳에서 나온다
  expect(planExtent()).toBe(8000);
});

test('planSize는 가로·세로를 따로 준다(소수 좌표)', () => {
  const s = planSize(rectWalls([0, 0], [4000.5, 3000.25], 200));
  expect(s.width).toBeCloseTo(4000.5, 9);
  expect(s.depth).toBeCloseTo(3000.25, 9);
  // 최종 리뷰 I-5: 빈 층의 기본값은 view3d.bounds()가 쓰던 [8000, 6000]이다(전에는 여기만 8000×8000이라
  // 주석의 "bounds()와 같다"가 거짓이었다 — m-4). 이 값이 곧 빈 층의 3D 프레이밍이라 바꾸면 회귀다.
  expect(planSize([])).toEqual({ width: 8000, depth: 6000 });
  expect(planSize()).toEqual({ width: 8000, depth: 6000 });
});

// 재리뷰 2 N-2: 천장 평면도(top)는 입면이 아니라 평면이다. 입면 비율을 물려받던 동안 20.0 × 18.6 m
// 평면이 5.71:1 띠 한가운데 117 × 108 px로 인쇄돼(선 길이 3.2배 축소) 방 윤곽이 5 px였다.
describe('천장 평면도 비율(topViewAspect)', () => {
  test('층고가 아니라 평면 자신의 가로/세로가 정하고, 한계는 입면과 같다', () => {
    expect(topViewAspect(rectWalls([0, 0], [20000.5, 6000.25], 200))).toBeCloseTo(20000.5 / 6000.25, 9);
    // 샘플 평면(20.0 × 18.6 m)은 거의 정사각이라 아래 한계에 붙는다 — 1530 × 861, 파동 1과 같은 그림.
    expect(topViewAspect(rectWalls([0, 0], [20000, 18600], 200))).toBeCloseTo(ELEV_ASPECT_MIN, 12);
    // 세로로 긴 평면도 아래 한계다(그림이 세로로 쓸데없이 커지지 않는다).
    expect(topViewAspect(rectWalls([0, 0], [6000, 20000], 200))).toBeCloseTo(ELEV_ASPECT_MIN, 12);
    // 아주 납작한 평면은 6:1에서 잘린다(그 아래로는 높이가 128 px 밑이다).
    expect(topViewAspect(rectWalls([0, 0], [44100, 3500], 200))).toBe(ELEV_ASPECT_MAX);
    // 같은 평면이면 층고가 달라도 같은 값이다 — 입면 비율과 갈라지는 지점이 바로 여기다.
    const walls = rectWalls([0, 0], [20000.5, 6000.25], 200);
    expect(topViewAspect(walls)).not.toBeCloseTo(elevationAspect({ extent: 20000.5, height: 3500.25 }), 6);
  });

  test('벽이 없거나 한 줄인 도면에서도 숫자를 준다', () => {
    expect(topViewAspect([])).toBeCloseTo(ELEV_ASPECT_MIN, 12);   // 8000 × 6000 → 1.33:1 → 아래 한계
    expect(topViewAspect()).toBeCloseTo(ELEV_ASPECT_MIN, 12);
    expect(topViewAspect([{ a: [0, 0], b: [20000, 0] }])).toBe(ELEV_ASPECT_MAX);   // 깊이 0 → 최소 깊이로 잰다
    expect(topViewAspect([{ a: [0, 0], b: [0, 0] }])).toBeCloseTo(ELEV_ASPECT_MIN, 12);
  });
});

// 최종 리뷰 I-5: 같은 bbox를 view3d.bounds()와 planSize가 각자 셌고 **빈 층의 기본값만** 달랐다.
// 이제 정본은 planBounds 하나이고 bounds()는 그것을 그대로 돌려준다.
test('planBounds는 중심·큰 쪽·두 변을 한 번에 준다(소수 좌표)', () => {
  const b = planBounds(rectWalls([1000.5, 2000.25], [5001, 5000.75], 200));
  expect(b.center[0]).toBeCloseTo(3000.75, 9);
  expect(b.center[1]).toBeCloseTo(3500.5, 9);
  expect(b.size[0]).toBeCloseTo(4000.5, 9);
  expect(b.size[1]).toBeCloseTo(3000.5, 9);
  expect(b.extent).toBeCloseTo(4000.5, 9);
  // 빈 층의 기본값은 예전 bounds()의 값 그대로다(3D 프레이밍 무변경).
  expect(planBounds([])).toEqual({ center: [4000, 3000], extent: 8000, size: [8000, 6000] });
  expect(planBounds()).toEqual({ center: [4000, 3000], extent: 8000, size: [8000, 6000] });
  expect(planExtent(rectWalls([0, 0], [4000.5, 3000.25], 200))).toBeCloseTo(planBounds(rectWalls([0, 0], [4000.5, 3000.25], 200)).extent, 12);
});

// 최종 리뷰 I-6(Task 10 N-4): 평면 투영의 절두체가 max(가로, 세로)라 폭 20 m · 깊이 5 m 도면이
// 가로·세로 모두 22%만 찼다. 이제 세로는 깊이에서 나오고 가로는 비율만큼만 넓힌다.
describe('평면 프레임(planFrame)', () => {
  test('가로로 납작한 도면이 그림을 가득 채운다(소수 좌표)', () => {
    const width = 20000.5, depth = 5000.25, aspect = topViewAspect(rectWalls([0, 0], [width, depth], 0));
    const fr = planFrame({ width, depth, aspect });
    expect(fr.halfH).toBeCloseTo(Math.max((depth * ELEV_MARGIN) / 2000, (width * ELEV_MARGIN) / 2000 / aspect), 12);
    expect(fr.halfW).toBeCloseTo(fr.halfH * aspect, 12);
    // 채움률: 예전 규칙은 가로·세로 모두 ≈22%였다(halfH = 11.5 m · halfW = 46 m).
    expect(width / 1000 / (2 * fr.halfW)).toBeGreaterThanOrEqual(0.8);
    expect(depth / 1000 / (2 * fr.halfH)).toBeGreaterThanOrEqual(0.8);
    // 여백은 입면과 같은 ELEV_MARGIN이다: 채움률의 상한이 1 / 1.15다.
    expect(width / 1000 / (2 * fr.halfW)).toBeLessThanOrEqual(1 / ELEV_MARGIN + 1e-12);
  });
  test('세로로 긴 도면·아주 작은 도면·이상한 비율에서도 잘라 내지 않는다', () => {
    const tall = planFrame({ width: 5000, depth: 20000, aspect: 16 / 9 });
    expect(tall.halfH).toBeCloseTo((20000 * ELEV_MARGIN) / 2000, 12);   // 세로가 이긴다
    expect(5000 / 1000 / (2 * tall.halfW)).toBeLessThanOrEqual(1);      // 가로는 남는다(잘리지 않는다)
    const tiny = planFrame({ width: 0, depth: 0, aspect: 1 });
    expect(tiny.halfH).toBeCloseTo((2000 * ELEV_MARGIN) / 2000, 12);    // ELEV_MIN_EXTENT 하한
    expect(planFrame({ width: 8000, depth: 6000, aspect: 0 }).aspect).toBe(1);
    expect(Number.isFinite(planFrame({ width: 8000, depth: 6000, aspect: NaN }).halfW)).toBe(true);
  });
});
