// §18.3의 8·9·10단계와 추출 파이프라인. 좌표는 전부 소수다(정수 격자에 우연히 맞는 답을 거른다).
import { test, expect } from 'vitest';
import { centerlines, mergeCollinear, snapEndpoints, closeJunctions, bridgeGaps, dropTinyComponents, openingGaps, extractWalls, GAP_RANGE } from '../src/io/dxf/walls.js';
import { buildFaces, candidatePairs, thicknessModes, matchPairs } from '../src/io/dxf/faces.js';
import { DXF_PARAMS as P } from '../src/io/dxf/params.js';

const seg = (x0, y0, x1, y1, layer = 'WAL') => ({ a: [x0, y0], b: [x1, y1], layer, src: 'LINE' });
const wall = (x0, y0, x1, y1, thickness = 200) => ({ a: [x0, y0], b: [x1, y1], thickness });
const L = w => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
// 차수 1 노드(끊긴 끝점)의 수 — §18.6이 사람에게 보여 주는 바로 그 숫자다.
const openEnds = walls => {
  const deg = new Map();
  for (const w of walls) for (const p of [w.a, w.b]) { const k = `${Math.round(p[0])},${Math.round(p[1])}`; deg.set(k, (deg.get(k) ?? 0) + 1); }
  return [...deg.values()].filter(n => n === 1).length;
};
const exOf = segs => ({ segs, arcs: [], circles: [], texts: [], inserts: [], dims: [], hatches: [] });

test('centerlines는 겹침 구간마다 중앙선을 놓고 두께를 우세값으로 스냅한다', () => {
  const faces = buildFaces([
    seg(0.5, 1000.25, 6000.5, 1000.25),
    seg(0.5, 1205.25, 6000.5, 1205.25),     // 205 mm 차 — 봉우리가 205 하나뿐이라 205가 곧 우세값이다
  ], P);
  const pairs = candidatePairs(faces, P);
  const modes = thicknessModes(pairs, P);
  const raw = centerlines(matchPairs(pairs, modes, P), modes, P, 200);
  expect(raw).toHaveLength(1);
  expect(raw[0].thickness).toBe(205);       // 봉우리가 205 하나뿐이면 그 값이 곧 우세값이다
  expect(raw[0].a[1]).toBeCloseTo(1102.75, 6);
  expect(L(raw[0])).toBeCloseTo(6000, 6);
  // 겹침이 minOverlap(1000) 미만인 짧은 마주보기는 쌍이 되지 못하고, 중심선도 나오지 않는다.
  const tinyPairs = candidatePairs(buildFaces([seg(0.5, 0.25, 6000.5, 0.25), seg(3000.5, 200.25, 3100.5, 200.25)], P), P);
  expect(tinyPairs).toEqual([]);
  const tinyModes = thicknessModes(tinyPairs, P);
  expect(centerlines(matchPairs(tinyPairs, tinyModes, P), tinyModes, P, 200)).toEqual([]);
  expect(tinyModes.modeList).toEqual([]);                            // 우세 두께가 없으면 기본 두께를 쓴다
});

test('mergeCollinear는 같은 방향·오프셋·두께 계급을 틈 ≤ mergeGap으로 잇는다', () => {
  const u = [1, 0], n = [0, 1];
  const piece = (t0, t1, thickness = 200) => ({ a: [t0, 500.25], b: [t1, 500.25], thickness, u, n, off: 500.25 });
  const merged = mergeCollinear([piece(0.5, 2000.5), piece(3000.5, 5000.5), piece(12000.5, 14000.5)], P);
  expect(merged).toHaveLength(2);
  expect(merged.map(w => Math.round(L(w)))).toEqual([5000, 2000]);
  // 두께 계급(25 mm)이 다르면 잇지 않는다.
  expect(mergeCollinear([piece(0.5, 2000.5, 200), piece(2500.5, 4000.5, 300)], P)).toHaveLength(2);
});

test('snapEndpoints는 250 mm 안의 끝점을 무게중심으로 모은다', () => {
  const snapped = snapEndpoints([wall(0.5, 100.25, 3000.5, 100.25), wall(100.5, 0.25, 100.5, 3000.25)], P.snap);
  expect(snapped[0].a).toEqual(snapped[1].a);                 // 두 끝이 한 점이 된다
  expect(snapped[0].a[0]).toBeCloseTo(50.5, 6);
  expect(snapped[0].a[1]).toBeCloseTo(50.25, 6);
  expect(snapped[0].b).toEqual([3000.5, 100.25]);             // 멀리 있는 끝은 그대로
});

test('closeJunctions는 매달린 끝을 자기 방향으로만 연장한다(T자 닫기)', () => {
  const stub = wall(3000.5, 100.25, 3000.5, 1900.25);
  const beam = wall(0.5, 2000.25, 6000.5, 2000.25);
  const out = closeJunctions([stub, beam], P);
  expect(out[0].b[0]).toBeCloseTo(3000.5, 6);
  expect(out[0].b[1]).toBeCloseTo(2000.25, 6);                // 100 mm 앞으로 연장해 닿았다
  expect(out[0].a).toEqual([3000.5, 100.25]);                 // 반대쪽 끝은 뒤로 끌려가지 않는다
  // 뒤로 1,900 mm 점프하는 연장은 막는다(§18.3-10-②의 "자기 방향으로").
  const wide = closeJunctions([wall(0.5, 100.25, 2000.5, 100.25), wall(100.5, 0.25, 100.5, 4000.25)], P);
  expect(wide[0].b[0]).toBeCloseTo(2000.5, 6);
});

test('bridgeGaps는 마주보는 매달린 끝을 잇고 어긋난 끝은 잇지 않는다', () => {
  const bridged = bridgeGaps([wall(0.5, 100.25, 2500.5, 100.25, 200), wall(3400.5, 100.25, 6000.5, 100.25, 300)], P);
  expect(bridged).toHaveLength(3);
  const add = bridged[2];
  expect(add.bridged).toBe(true);
  expect(Math.round(L(add))).toBe(900);                       // 900 mm 문 틈
  expect(add.thickness).toBe(250);                            // 두 끝 벽 두께의 평균
  // 법선 어긋남이 bridgeOffTol(90)보다 크면 잇지 않는다.
  expect(bridgeGaps([wall(0.5, 100.25, 2500.5, 100.25), wall(3400.5, 300.25, 6000.5, 300.25)], P)).toHaveLength(2);
  // 틈이 bridge(3000)보다 넓어도 잇지 않는다.
  expect(bridgeGaps([wall(0.5, 100.25, 2500.5, 100.25), wall(6000.5, 100.25, 9000.5, 100.25)], P)).toHaveLength(2);
});

test('dropTinyComponents는 벽 4개 미만 덩어리를 버린다', () => {
  const rect = [wall(0.5, 0.25, 4000.5, 0.25), wall(4000.5, 0.25, 4000.5, 3000.25), wall(4000.5, 3000.25, 0.5, 3000.25), wall(0.5, 3000.25, 0.5, 0.25)];
  const island = [wall(90000.5, 0.25, 91000.5, 0.25), wall(91000.5, 0.25, 91000.5, 900.25)];
  expect(dropTinyComponents([...rect, ...island], P.minComp)).toHaveLength(4);
  expect(dropTinyComponents([...rect, ...island], 2)).toHaveLength(6);
});

// §18.11이 요구한 합성 도면: 900 mm 문 틈이 있는 이중선 사각형 → 벽 4 · 끊긴 끝점 0.
// 바깥 면선 (0.5, 0.25)~(6000.5, 4000.25), 안쪽 면선은 200 mm 안으로 들어온다.
const rectSegs = ({ doorGap = true, wide = false } = {}) => {
  const X1 = wide ? 12000.5 : 6000.5, Y1 = 4000.25;
  const bottomInner = doorGap
    ? [seg(0.5, 200.25, 2500.5, 200.25), seg(3400.5, 200.25, X1, 200.25)]      // 900 mm 문 틈
    : [seg(0.5, 200.25, X1, 200.25)];
  return [
    seg(0.5, 0.25, X1, 0.25), ...bottomInner,
    seg(0.5, Y1, X1, Y1), seg(0.5, Y1 - 200, X1, Y1 - 200),
    seg(0.5, 0.25, 0.5, Y1), seg(200.5, 0.25, 200.5, Y1),
    seg(X1, 0.25, X1, Y1), seg(X1 - 200, 0.25, X1 - 200, Y1),
  ];
};

test('이중선 사각형에서 벽 4개가 나오고 문 틈은 면선 잇기가 건너뛴다', () => {
  const r = extractWalls(exOf(rectSegs()), { wallLayers: new Set(['WAL']), params: P, thickness: 200 });
  expect(r.walls).toHaveLength(4);
  expect(r.walls.every(w => w.thickness === 200)).toBe(true);
  expect(openEnds(r.walls)).toBe(0);
  expect(r.guessed).toBe(false);
  // 중심선은 면선 사이 한가운데(100.25 / 3900.25 / 100.5 / 5900.5)이고, 끝점 스냅이 네 모서리를
  // 무게중심으로 모은다 → 바깥 테두리가 (50.5, 50.25) ~ (5950.5, 3950.25)이 된다.
  const xs = r.walls.flatMap(w => [w.a[0], w.b[0]]), ys = r.walls.flatMap(w => [w.a[1], w.b[1]]);
  expect(Math.min(...xs)).toBeCloseTo(50.5, 6);
  expect(Math.max(...xs)).toBeCloseTo(5950.5, 6);
  expect(Math.min(...ys)).toBeCloseTo(50.25, 6);
  expect(Math.max(...ys)).toBeCloseTo(3950.25, 6);
  expect(r.walls.map(w => Math.round(L(w))).sort((a, b) => a - b)).toEqual([3900, 3900, 5900, 5900]);
});

test('개구부 레이어의 700 mm 이상 면선이 끊긴 외벽을 대신 그린다(커튼월 보정)', () => {
  // 아래 바깥 면선을 2,000 mm만 남기고 나머지 10,000 mm를 WIN 레이어가 그린다.
  const base = rectSegs({ wide: true }).filter(s => !(s.a[1] === 0.25 && s.b[1] === 0.25));
  const cut = [seg(0.5, 0.25, 2000.5, 0.25, 'WAL'), seg(2000.5, 0.25, 12000.5, 0.25, 'WIN')];
  const opts = { wallLayers: new Set(['WAL']), params: P, thickness: 200 };
  const without = extractWalls(exOf([...base, ...cut]), opts);
  const withWin = extractWalls(exOf([...base, ...cut]), { ...opts, openFaceLayers: new Set(['WIN']) });
  expect(openEnds(withWin.walls)).toBe(0);
  expect(withWin.walls).toHaveLength(4);
  expect(openEnds(without.walls)).toBeGreaterThan(0);        // 보조 면선이 없으면 외곽이 닫히지 않는다
  // 짧은 멀리온·유리선(700 mm 미만)은 보조 면선이 아니다.
  const short = extractWalls(exOf([...base, seg(0.5, 0.25, 2000.5, 0.25, 'WAL'), seg(2000.5, 0.25, 2600.5, 0.25, 'WIN')]), { ...opts, openFaceLayers: new Set(['WIN']) });
  expect(openEnds(short.walls)).toBeGreaterThan(0);
});

test('벽 후보 레이어가 0개면 도형으로 추정하고 guessed를 켠다', () => {
  const segs = rectSegs().map(s => ({ ...s, layer: 'Layer 1' }));
  const r = extractWalls(exOf(segs), { wallLayers: new Set(['WAL']), params: P, thickness: 200 });
  expect(r.guessed).toBe(true);
  expect([...r.guessedLayers]).toEqual(['Layer 1']);
  expect(r.walls).toHaveLength(4);
  expect(openEnds(r.walls)).toBe(0);
});

// 사전 검토 C-2: 이 도면의 문은 미닫이라 스윙 호가 없다 — 문 자리는 **면선 쌍의 틈**이 알려 준다.
test('openingGaps는 면선 쌍이 둘 다 비는 600~1500 mm 구간을 개구부로 준다', () => {
  expect(GAP_RANGE).toEqual([600, 1500]);
  const r = extractWalls(exOf(rectSegs()), { wallLayers: new Set(['WAL']), params: P, thickness: 200 });
  expect(r.gaps).toHaveLength(1);
  expect(r.gaps[0].width).toBeCloseTo(900, 6);                 // 900 mm 문 틈
  expect(r.gaps[0].p[0]).toBeCloseTo(2950.5, 6);               // 틈의 중점이 중심선 위에 있다
  expect(r.gaps[0].p[1]).toBeCloseTo(100.25, 6);
  // 문 틈이 없으면 개구부도 없다(벽은 그대로 넷이다).
  const solid = extractWalls(exOf(rectSegs({ doorGap: false })), { wallLayers: new Set(['WAL']), params: P, thickness: 200 });
  expect(solid.walls).toHaveLength(4);
  expect(solid.gaps).toEqual([]);
  // 범위 밖 폭은 개구부가 아니다 — 위 벽에 3,000 mm 틈을 내도 gaps는 늘지 않는다.
  const wide = rectSegs().filter(s => !(s.a[1] === 4000.25 && s.b[1] === 4000.25));
  wide.push(seg(0.5, 4000.25, 1000.5, 4000.25), seg(4000.5, 4000.25, 6000.5, 4000.25));
  expect(extractWalls(exOf(wide), { wallLayers: new Set(['WAL']), params: P, thickness: 200 }).gaps).toHaveLength(1);
});
