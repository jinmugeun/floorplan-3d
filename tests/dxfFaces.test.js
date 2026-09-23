// §18.3의 2·4·5·6·7단계. 합성 도면으로 규칙 하나하나를 못 박는다 — 실파일 검증은 Task 8이 한다.
import { test, expect } from 'vitest';
import { largestCluster, ROI_LINK, buildFaces, candidatePairs, thicknessModes, matchPairs, ivOverlap, ivLen, mergeIv } from '../src/io/dxf/faces.js';
import { DXF_PARAMS as P } from '../src/io/dxf/params.js';

const seg = (x0, y0, x1, y1, layer = 'WAL') => ({ a: [x0, y0], b: [x1, y1], layer, src: 'LINE' });
// 수평 면선 하나: y 오프셋과 x 구간들.
const row = (y, spans, layer = 'WAL') => spans.map(([x0, x1]) => seg(x0, y, x1, y, layer));
const offsets = faces => faces.map(f => Math.round(f.off * 100) / 100).sort((a, b) => a - b);

// 사전 검토 C-7: ROI는 **연결성**으로 고른다. 격자 점유만 보면 긴 벽 하나가 도면을 가른다.
test('largestCluster는 선분 연결과 500 mm 근접으로 가장 큰 덩어리를 고른다', () => {
  // 세 선분이 끝점으로 이어진다(가운데 이음매가 300 mm 벌어져 있어도 한 덩어리다).
  const near = [seg(0.5, 0.25, 4000.5, 0.25), seg(4000.5, 0.25, 4000.5, 9000.75), seg(4300.5, 9000.75, 9000.5, 9000.75)];
  const far = [seg(900000.5, 900000.25, 900100.5, 900000.25)];
  const c = largestCluster([...near, ...far]);
  expect(c.n).toBe(6);                       // 이어진 세 선분의 끝점 여섯 개
  expect([c.x0, c.y0]).toEqual([0.5, 0.25]); // bbox는 칸 경계가 아니라 **실제 끝점**이다
  expect([c.x1, c.y1]).toEqual([9000.5, 9000.75]);
  expect(largestCluster([])).toBe(null);
  // 규칙 ①: 12 m 벽은 가운데에 끝점이 없어도 자기 두 끝을 잇는다(격자 점유 규칙이 무너지던 자리).
  const span = largestCluster([seg(0.5, 0.25, 12000.5, 0.25), seg(12000.5, 0.25, 12000.5, 4000.25)]);
  expect(span.n).toBe(4);
  expect(span.x1).toBeCloseTo(12000.5, 6);
  // 이음 거리를 키우면 멀리 있던 것도 한 덩어리가 된다(규칙이 link 하나로 정해진다는 확인).
  expect(largestCluster([...near, ...far], 2000000).n).toBe(8);
  expect(ROI_LINK).toBe(500);
});

test('같은 직선 위 조각은 틈 ≤ faceGap으로 이어지고 그보다 멀면 구간이 갈린다', () => {
  // 세 조각: [0.5, 2000.5] · [3000.5, 5000.5](틈 1000) · [12000.5, 14000.5](틈 7000 > 5200)
  const faces = buildFaces(row(1000.25, [[0.5, 2000.5], [3000.5, 5000.5], [12000.5, 14000.5]]), P);
  expect(faces).toHaveLength(1);             // 오프셋이 같으므로 면선은 하나다
  const f = faces[0];
  expect(f.off).toBeCloseTo(1000.25, 6);
  expect(f.intervals.map(([a, b]) => [Math.round(a * 10) / 10, Math.round(b * 10) / 10]))
    .toEqual([[0.5, 5000.5], [12000.5, 14000.5]]);
  expect(f.span).toBeCloseTo(7000, 6);
  expect([...f.layers]).toEqual(['WAL']);
  // raw는 **틈을 잇지 않은** 원 구간이다 — Task 6의 openingGaps가 문 자리를 여기서 되찾는다(C-2).
  expect(f.raw.map(([a, b]) => [Math.round(a * 10) / 10, Math.round(b * 10) / 10]))
    .toEqual([[0.5, 2000.5], [3000.5, 5000.5], [12000.5, 14000.5]]);
  expect(mergeIv([[0, 10], [5, 12], [20, 25]])).toEqual([[0, 12], [20, 25]]);
  expect(mergeIv([[0, 10], [12, 20]], 5)).toEqual([[0, 20]]);
});

test('방향 bin은 0.75°로 갈리고 법선 오프셋은 6 mm로 묶인다', () => {
  const tilted = seg(0.5, 0.25, 3000.5, 105.0);      // 약 2.0° 기울기
  const flat = seg(0.5, 0.25, 3000.5, 0.25);
  expect(new Set(buildFaces([tilted, flat], P).map(f => f.key)).size).toBe(2);
  // 0.3° 안쪽은 같은 bin이고, 오프셋이 6 mm 안이면 한 면선으로 묶인다.
  const a = seg(0.5, 1000.25, 3000.5, 1000.25);
  const b = seg(0.5, 1004.25, 3000.5, 1004.25);      // 4 mm 차 → 한 면선
  const c = seg(0.5, 1020.25, 3000.5, 1020.25);      // 16 mm 차 → 다른 면선
  const faces = buildFaces([a, b, c], P);
  expect(faces).toHaveLength(2);
  expect(offsets(faces)).toEqual([1002.25, 1020.25]);  // 묶인 면선은 오프셋 평균이다
});

test('평행쌍은 90~500 mm · 겹침 ≥ 1000 mm이고 사이에 면선이 있으면 clear가 아니다', () => {
  const faces = buildFaces([
    ...row(1000.25, [[0.5, 5000.5]]),
    ...row(1200.25, [[0.5, 5000.5]]),
    ...row(1250.25, [[0.5, 3000.5]]),
  ], P);
  const pairs = candidatePairs(faces, P);
  expect(pairs.map(c => Math.round(c.d))).toEqual([200, 250]);   // 50 mm 쌍은 tMin 아래라 없다
  expect(pairs[0].clear).toBe(true);
  expect(pairs[1].clear).toBe(false);                            // 1200.25 면선이 사이에 있다
  expect(pairs[0].L).toBeCloseTo(5000, 6);
  expect(pairs[1].L).toBeCloseTo(3000, 6);
  expect(ivLen(ivOverlap([[0, 10]], [[4, 20]]))).toBe(6);
});

test('두께 히스토그램은 겹침 길이 가중이고 우세 두께로 스냅·가중한다', () => {
  const faces = buildFaces([
    ...row(1000.25, [[0.5, 5000.5]]),
    ...row(1200.25, [[0.5, 5000.5]]),
    ...row(1250.25, [[0.5, 3000.5]]),
  ], P);
  const m = thicknessModes(candidatePairs(faces, P), P);
  expect(m.hist[0][0]).toBe(200);                 // 겹침 5000 mm
  expect(m.hist[0][1]).toBeCloseTo(5000, 6);
  expect(m.hist[1][0]).toBe(250);                 // 사전 검토 M-4: 두 번째 성분을 자기 자신과 비교하지 않는다
  expect(m.hist[1][1]).toBeCloseTo(3000, 6);
  expect(m.modes.has(200)).toBe(true);
  expect(m.boost(200)).toBe(2.5);
  expect(m.boost(310)).toBe(1);
  expect(m.snap(205)).toBe(200);                  // 15 mm 안이면 끌어당긴다
  expect(m.snap(230)).toBe(230);                  // 200에서 30 · 250에서 20 → 그대로
});

test('탐욕 매칭은 이미 40 % 넘게 쓰인 면을 거절한다(한 면이 두 벽에 가지 않는다)', () => {
  const faces = buildFaces([
    ...row(0.25, [[0.5, 5000.5]]),
    ...row(200.25, [[0.5, 5000.5]]),
    ...row(400.25, [[0.5, 5000.5]]),
  ], P);
  const pairs = candidatePairs(faces, P);
  expect(pairs).toHaveLength(3);                  // (0,200) (0,400) (200,400)
  const accepted = matchPairs(pairs, thicknessModes(pairs, P), P);
  expect(accepted).toHaveLength(1);
  expect(Math.round(accepted[0].d)).toBe(200);
  expect(accepted[0].clear).toBe(true);
});

// §18.3-7: clear 규칙은 **tieBand(10 %) 안의 동점**에서만 작동한다. 점수가 크게 갈리면
// 겹침이 긴 쌍이 이긴다 — 그러지 않으면 9겹 외벽에서 가장 얇은 인접 쌍이 늘 이겨 오판이 굳는다.
test('tieBand 밖에서는 clear 규칙이 순서를 바꾸지 않는다', () => {
  const faces = buildFaces([
    ...row(0.25, [[0.5, 10000.5]]),
    ...row(200.25, [[0.5, 2000.5]]),              // 짧은 가운데 면선
    ...row(400.25, [[0.5, 10000.5]]),
  ], P);
  const pairs = candidatePairs(faces, P);
  const accepted = matchPairs(pairs, thicknessModes(pairs, P), P);
  expect(accepted).toHaveLength(1);
  expect(Math.round(accepted[0].d)).toBe(400);    // clear가 아니지만 겹침 10 m가 이긴다
  expect(accepted[0].clear).toBe(false);
});

// 🔴 리뷰 Critical: :69의 방향 정규화(dx ≥ 0 반평면)의 **절단면이 90° bin 한가운데를 지난다**.
// 서로 반대 방향으로 그린 두 수직 면선이 sub-mm 드리프트만 있어도 u = [+ε, +1]과 [+ε, −1]로
// 갈려 산술 평균이 [1, 0](수평)이 되고 수직 벽이 통째로 사라지던 자리다(span 0.2 · 쌍 0개).
test('90° bin은 반대 방향으로 그린 수직 면선이 섞여도 상쇄되지 않는다', () => {
  const faces = buildFaces([
    seg(1000.3, 6000.25, 1000.5, 0.25),          // 6 m 수직 면선 — 위→아래로 그렸고 0.2 mm 우측 드리프트
    seg(1200.3, 0.25, 1200.5, 6000.25),          // 짝 면선(200 mm) — 아래→위로 그렸고 같은 드리프트
  ], P);
  expect(faces).toHaveLength(2);
  expect(faces[1].u).toEqual(faces[0].u);        // 한 bin의 면선은 방향 하나를 나눠 쓴다
  const u = faces[0].u;
  expect(Math.abs(u[0])).toBeLessThan(1e-6);     // 부호 관례는 어느 쪽이든 좋다 — 둘이 같기만 하면 된다
  expect(Math.abs(u[1])).toBeCloseTo(1, 6);
  expect(faces[0].span).toBeCloseTo(6000, 6);
  expect(faces[1].span).toBeCloseTo(6000, 6);
  expect(Math.abs(faces[1].off - faces[0].off)).toBeCloseTo(200, 6);   // 오프셋 차가 그대로 두께다
  const pairs = candidatePairs(faces, P);
  expect(pairs).toHaveLength(1);
  expect(pairs[0].d).toBeCloseTo(200, 6);
  expect(pairs[0].L).toBeCloseTo(6000, 6);
});

// 완전 상쇄가 아니어도 같은 자리다. bin 전역 평균이라 위/아래 불균형이 남으면 방향이 기울고,
// 6 m 면선 끝에서 오프셋이 offTol(6 mm)을 훌쩍 넘겨 한 벽이 잘게 쪼개진다. 드리프트는 bin 반폭
// (0.375°)에 거의 닿는 0.29°로 잡아 부분 상쇄가 눈에 보이게 했다(고치기 전 실측 0.577° 기울기).
test('90° 양쪽에 걸친 면선들의 평균 방향이 수직에서 벗어나지 않는다', () => {
  const faces = buildFaces([
    seg(1000.3, 0.25, 1030.5, 6000.25),          // 아래→위, 오른쪽으로 30.2 mm 드리프트 (89.71°)
    seg(1200.3, 6000.25, 1230.5, 0.25),          // 위→아래, 같은 드리프트 (90.29° — 90°의 반대쪽)
    seg(1400.5, 0.25, 1400.5, 6000.25),          // 아래→위, 드리프트 0 (정확히 90°)
  ], P);
  expect(faces).toHaveLength(3);
  expect(new Set(faces.map(f => f.key)).size).toBe(1);                 // 셋 다 같은 90° bin이다
  const u = faces[0].u;
  const offVertical = Math.atan2(Math.abs(u[0]), Math.abs(u[1])) * 180 / Math.PI;
  expect(offVertical).toBeLessThan(0.01);
  expect(offsets(faces)).toEqual([-1400.5, -1200.3, -1000.3].sort((a, b) => a - b));
});

// 🟠 리뷰 Important: 좌표 하나가 NaN이면 bbox 네 값이 전부 NaN이 되고, 소비처의 `inRoi`는
// NaN 비교가 전부 false라 **모든 선분을 버린다** — 오류 없이 빈 평면도가 나온다. 던지지 않고 건너뛴다.
test('비유한 좌표를 가진 선분은 ROI 덩어리 계산에서 건너뛴다', () => {
  const c = largestCluster([seg(NaN, NaN, 1, 1), seg(0.5, 0.5, 400.5, 0.5)]);
  expect([c.x0, c.y0, c.x1, c.y1].every(v => Number.isFinite(v))).toBe(true);
  expect([c.x0, c.y0, c.x1, c.y1]).toEqual([0.5, 0.5, 400.5, 0.5]);
  expect(c.n).toBe(2);                                                 // 성한 선분의 끝점 둘만 센다
  // Infinity도 같다. 성한 선분이 하나도 없으면 빈 입력과 같은 null이다.
  expect(largestCluster([seg(0.5, Infinity, 900.5, 0.25), seg(0.5, 0.25, 900.5, 0.25)]).x1).toBe(900.5);
  expect(largestCluster([seg(NaN, 0.25, 900.5, 0.25)])).toBe(null);
  // 같은 선분은 buildFaces도 통과하지 못한다(영-길이 가드가 비유한 길이까지 막는다).
  expect(buildFaces([seg(NaN, 0.25, 900.5, 0.25), seg(0.5, Infinity, 900.5, 0.25)], P)).toEqual([]);
});
