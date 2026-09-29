// 벽 띠 스윕(2026-09-29 정확도 수정). 좌표는 전부 소수다(정수 격자에 우연히 맞는 답을 거른다).
import { test, expect } from 'vitest';
import { wallBands, bandRuns, wallsOfRuns } from '../src/io/dxf/bands.js';
import { findColumns } from '../src/io/dxf/columns.js';
import { buildFaces } from '../src/io/dxf/faces.js';
import { DXF_PARAMS as P } from '../src/io/dxf/params.js';

const seg = (x0, y0, x1, y1, layer = 'WAL') => ({ a: [x0, y0], b: [x1, y1], layer, src: 'LINE' });
// 닫힌 직사각형 네 변(반시계)
const rect = (x0, y0, w, h, layer = '기존') => [
  seg(x0, y0, x0 + w, y0, layer), seg(x0 + w, y0, x0 + w, y0 + h, layer),
  seg(x0 + w, y0 + h, x0, y0 + h, layer), seg(x0, y0 + h, x0, y0, layer),
];
// 가로 면선들만 있는 한 bin의 띠 조각
const bandsOf = segs => wallBands(buildFaces(segs, P), P);

test('기둥은 벽 레이어 선분 넷이 닫는 작은 직사각형이고, 가늘고 긴 사각형은 기둥이 아니다', () => {
  const segs = [...rect(1000.5, 2000.25, 500, 700), ...rect(5000.5, 2000.25, 200, 950), seg(0.5, 0.25, 9000.5, 0.25)];
  const cols = findColumns(segs, P);
  expect(cols).toHaveLength(1);                                   // 200×950은 종횡비 4.75 — 벽 토막이다
  expect(cols[0].c[0]).toBeCloseTo(1250.5, 6);
  expect(cols[0].c[1]).toBeCloseTo(2350.25, 6);
  expect([...cols[0].segs].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  // 한 변이 빠진 ㄷ자는 닫히지 않았다
  expect(findColumns(rect(1000.5, 2000.25, 500, 700).slice(0, 3), P)).toEqual([]);
  // 한 변이 1,200 mm를 넘으면 기둥이 아니다(방이나 설비 윤곽이다)
  expect(findColumns(rect(0.5, 0.25, 900, 1300), P)).toEqual([]);
});

test('한 자리에 함께 있는 면선들이 한 띠가 된다 — 여러 겹 벽(마감·구조·마감)은 띠 하나다', () => {
  // 구조 200 + 양쪽 마감 25 = 250 mm 벽 하나를 네 선으로 그렸다
  const b = bandsOf([seg(0.5, 0.25, 5000.5, 0.25), seg(0.5, 25.25, 5000.5, 25.25), seg(0.5, 225.25, 5000.5, 225.25), seg(0.5, 250.25, 5000.5, 250.25)]);
  expect(b).toHaveLength(1);
  expect(b[0].t0).toBeCloseTo(0.5, 6);
  expect(b[0].t1).toBeCloseTo(5000.5, 6);
  expect(b[0].hi - b[0].lo).toBeCloseTo(250, 6);
  expect(b[0].n).toBe(4);
  // 900 mm 떨어진 두 선은 벽이 아니라 복도다 — 띠가 없다
  expect(bandsOf([seg(0.5, 0.25, 5000.5, 0.25), seg(0.5, 900.25, 5000.5, 900.25)])).toEqual([]);
  // 선 하나는 띠가 아니다
  expect(bandsOf([seg(0.5, 0.25, 5000.5, 0.25)])).toEqual([]);
});

// 2026-09-29 감사: 실파일 조리실 윗벽 — 외벽(240) 안쪽 200 mm에 실내벽(275)이 나란히 있어 무리 폭이 711로
// bandMax를 넘는다. "가장 큰 틈"에서 가르면 실내벽 **안쪽**(253)이 갈려 실내벽이 선 하나로 남아 버려졌다.
// bandMax를 넘는 무리를 어디서 가르나 — 실파일 세 사례. 한 자리만 보면 셋을 가를 수 없고(실내벽과 벽기둥은
// 모양이 같다) **바로 앞 구간의 띠와 가장 잘 이어지는** 자리에서 가른다. 앞 구간이 없으면 가장 큰 틈이다.
const slab = (t0, t1, ys) => ys.map(y => seg(t0, y, t1, y));
const bandsAt = (b, t) => b.filter(x => x.t0 <= t && t <= x.t1).map(x => [Math.round(x.lo), Math.round(x.hi)]).sort((p, q) => p[0] - q[0]);
test('bandMax를 넘는 무리는 앞 구간의 띠와 가장 잘 이어지는 자리에서 가른다', () => {
  // ① 조리실 윗벽: 외벽(0~240) 안쪽 200 mm에 실내벽(436~711)이 3~5.2 m에만 있다. 가장 큰 틈(253)은 실내벽 안쪽이다.
  const k = bandsOf([...slab(0.5, 10000.5, [0.25, 240.25]), ...slab(3000.5, 5200.5, [436.25, 458.25, 711.25])]);
  expect(bandsAt(k, 4000)).toEqual([[0, 240], [436, 711]]);
  // ② 식당 서쪽 벽의 벽기둥: 405 mm 벽(선 다섯) 앞면에 기둥 윤곽 선 하나(705)가 4~4.7 m에만 있다 — 벽 띠는 그대로다.
  const p = bandsOf([...slab(0.5, 10000.5, [0.25, 135.25, 160.25, 310.25, 405.25]), ...slab(4000.5, 4700.5, [705.25])]);
  expect(bandsAt(p, 4300)).toEqual([[0, 405]]);
  // ③ 조리실 서쪽 벽: 선 9개 357 mm 벽 옆 511 mm에 외톨이 선 — 앞 구간이 없어도 가장 큰 틈이라 벽이 온전하다.
  const s = bandsOf(slab(0.5, 5000.5, [0.25, 10.25, 20.25, 70.25, 95.25, 295.25, 320.25, 350.25, 357.25, 868.25]));
  expect(bandsAt(s, 2000)).toEqual([[0, 357]]);
});

// 실파일 조리실 윗벽: 외벽(기존 + 창틀 WIN) 안쪽 185 mm 공간 너머에 실내벽(FIN·WAL·WAL·FIN)이 있고, 실내벽 선이
// 축을 따라 하나씩 차례로 시작해 띠가 700을 넘기 전에 외벽 띠가 조금씩 부풀어 실내벽을 삼켰다. 반대로 식당 서쪽 벽의
// 구조체(WAL|WAL 200 mm)는 틈 크기가 같아도 한 벽이다 — 가르는 기준은 틈 양쪽 선의 **레이어**다.
test('150 mm 이상 틈이 레이어가 다른 두 선 사이에 있고 양쪽이 모두 벽이면 두 벽이다(벽 사이 공간)', () => {
  const at = (ys) => ys.map(([y, layer]) => seg(0.5, y, 5000.5, y, layer));
  const k = bandsOf(at([[0.25, '기존'], [125.25, 'WIN'], [250.25, 'WIN'], [435.25, 'FIN'], [460.25, 'WAL'], [660.25, 'WAL'], [685.25, 'FIN']]));
  expect(bandsAt(k, 2000)).toEqual([[0, 250], [435, 685]]);
  // 식당 서쪽 벽: 마감·구조체·마감·라이닝 — 가장 큰 틈(200)이 WAL|WAL이라 한 벽이다
  const w = bandsOf(at([[0.25, '기존'], [135.25, 'FIN'], [160.25, 'WAL'], [360.25, 'WAL'], [385.25, 'FIN'], [435.25, 'WAL-2'], [445.25, 'WAL-2'], [455.25, 'WAL-2']]));
  expect(bandsAt(w, 2000)).toEqual([[0, 455]]);
});

test('띠는 두 선이 **함께 있는 구간에만** 선다 — 멀리 떨어진 조각을 잇지 않는다(유령 벽 방지)', () => {
  // 아래 선은 0~10 m 전체, 위 선은 기둥 자리 둘(1~1.5 m, 6~6.5 m)에만 있다
  const b = bandsOf([seg(0.5, 0.25, 10000.5, 0.25), seg(1000.5, 200.25, 1500.5, 200.25), seg(6000.5, 200.25, 6500.5, 200.25)]);
  const spans = b.map(x => [Math.round(x.t0), Math.round(x.t1)]);
  expect(spans).toEqual([[1001, 1501], [6001, 6501]]);            // 1.5~6 m를 건너는 띠는 없다
});

test('띠 조각은 옆으로 겹치며 이어지는 동안 한 run이고, 대표 띠는 가장 긴 구성이다', () => {
  // 200 mm 벽 10 m 가운데 600 mm 구간만 앞에 선이 하나 더 있다(짧은 부풂)
  const segs = [seg(0.5, 0.25, 10000.5, 0.25), seg(0.5, 200.25, 10000.5, 200.25), seg(4000.5, 350.25, 4600.5, 350.25)];
  const runs = bandRuns(bandsOf(segs), P);
  expect(runs).toHaveLength(1);
  expect(runs[0].t0).toBeCloseTo(0.5, 6);
  expect(runs[0].t1).toBeCloseTo(10000.5, 6);
  expect(runs[0].lo).toBeCloseTo(0.25, 6);
  expect(runs[0].hi).toBeCloseTo(200.25, 6);
});

test('옆으로 어긋난 벽(단차)은 1 m 넘게 이어지면 run이 갈린다', () => {
  // 0~5 m는 y 0~200, 5~10 m는 y 400~600 — 5 m 지점에서 두 띠가 잠깐 한 무리로 겹친다
  const segs = [seg(0.5, 0.25, 5200.5, 0.25), seg(0.5, 200.25, 5200.5, 200.25), seg(4800.5, 400.25, 10000.5, 400.25), seg(4800.5, 600.25, 10000.5, 600.25)];
  const runs = bandRuns(bandsOf(segs), P).sort((a, b) => a.lo - b.lo);
  expect(runs).toHaveLength(2);
  expect(runs[0].hi).toBeCloseTo(200.25, 6);
  expect(runs[1].lo).toBeCloseTo(400.25, 6);
  expect(runs[1].t1).toBeCloseTo(10000.5, 6);
});

const run = (t0, t1, lo, hi) => ({ t0, t1, lo, hi });
const c = x => (x.lo + x.hi) / 2;

test('같은 띠의 run 사이 틈(문)은 한 구간으로 잇고 틈 자리를 개구부로 알린다', () => {
  const r = wallsOfRuns([run(0.5, 2500.5, 0.25, 200.25), run(3400.5, 6000.5, 0.25, 200.25)], P);
  expect(r.sections).toHaveLength(1);
  expect(r.jogs).toEqual([]);
  expect(r.sections[0].t0).toBeCloseTo(0.5, 6);
  expect(r.sections[0].t1).toBeCloseTo(6000.5, 6);
  expect(r.gaps).toHaveLength(1);
  expect(r.gaps[0].width).toBeCloseTo(900, 6);
  expect(r.gaps[0].t).toBeCloseTo(2950.5, 6);
  expect(r.gaps[0].off).toBeCloseTo(100.25, 6);
  // 양개문 1,800 mm도 잇는다
  expect(wallsOfRuns([run(0.5, 2000.5, 0.25, 200.25), run(3800.5, 6000.5, 0.25, 200.25)], P).gaps.map(g => Math.round(g.width))).toEqual([1800]);
  // bridge(3,000 mm)보다 먼 틈은 잇지 않는다
  expect(wallsOfRuns([run(0.5, 2000.5, 0.25, 200.25), run(5100.5, 6000.5, 0.25, 200.25)], P).sections).toHaveLength(2);
  // 옆으로 겹치지 않는 띠(다른 벽)는 잇지 않는다
  expect(wallsOfRuns([run(0.5, 2000.5, 0.25, 200.25), run(2900.5, 6000.5, 500.25, 700.25)], P).sections).toHaveLength(2);
  // 600 mm보다 좁은 틈은 이어도 개구부가 아니다(작도 이음매·기둥 자리)
  expect(wallsOfRuns([run(0.5, 2000.5, 0.25, 200.25), run(2400.5, 6000.5, 0.25, 200.25)], P).gaps).toEqual([]);
});

// 2026-09-29 감사: 실파일 식당 서쪽 벽은 위·아래가 405 mm(−13483~−13078), 가운데가 320 mm(−13348~−13028)다.
// 한 띠를 벽 전체에 씌우면 가운데가 92 mm 비껴 서고 라이닝 선이 벽 밖으로 빠진다 — 구간마다 제 띠를 쓰고
// 경계에 꺾임(jog)을 둔다.
test('두께가 바뀌는 벽(두 띠가 서로를 품지 않는다)은 구간마다 제 띠를 쓰고 경계를 꺾임으로 잇는다', () => {
  const r = wallsOfRuns([run(0.5, 5000.5, 0.25, 405.25), run(5600.5, 9000.5, 135.25, 455.25)], P);
  expect(r.sections).toHaveLength(2);
  const [A, B] = [...r.sections].sort((x, y) => x.t0 - y.t0);
  expect([A.lo, A.hi]).toEqual([0.25, 405.25]);
  expect([B.lo, B.hi]).toEqual([135.25, 455.25]);
  // 틈(600)은 얇은 쪽(B · 320)이 가진다 → 경계는 A의 끝
  expect(A.t1).toBeCloseTo(5000.5, 6);
  expect(B.t0).toBeCloseTo(5000.5, 6);
  expect(r.jogs).toHaveLength(1);
  expect(r.jogs[0].t).toBeCloseTo(5000.5, 6);
  expect(r.jogs[0].c0).toBeCloseTo(202.75, 6);
  expect(r.jogs[0].c1).toBeCloseTo(295.25, 6);
  expect(r.gaps.map(g => [Math.round(g.width), Math.round(g.off)])).toEqual([[600, 295]]);
  // 문 한쪽에만 벽기둥 윤곽이 더 있는 경우(450 · 350, 공통 200 ≥ 좁은 쪽 절반)도 같은 규칙이다
  const d = wallsOfRuns([run(0.5, 3000.5, 0.25, 450.25), run(4800.5, 9000.5, -149.75, 200.25)], P);
  expect(d.sections).toHaveLength(2);
  expect(d.jogs).toHaveLength(1);
  expect(d.gaps.map(g => Math.round(g.width))).toEqual([1800]);
  // 공통 부분이 좁은 쪽의 절반도 안 되면 다른 벽이다(꺾임으로 잇지 않는다)
  const far = wallsOfRuns([run(0.5, 3000.5, 0.25, 200.25), run(4000.5, 9000.5, 150.25, 350.25)], P);
  expect(far.sections).toHaveLength(2);
  expect(far.jogs).toEqual([]);
});

test('창이 많은 외벽: 벽·창틀·바깥선 조각이 번갈아도 띠가 줄지 않고 한 구간이다', () => {
  // 실파일 오른쪽 외벽: 온전한 벽 0~335 · 창틀 135~255 · 바깥 선만 235~335가 번갈아 나온다 — 창틀·바깥선
  // 구간은 양쪽 이웃 띠에 **품기므로** 개구부 자리이지 두께 변화가 아니다.
  const r = wallsOfRuns([
    run(0.5, 1600.5, 0.25, 335.25), run(1650.5, 2450.5, 135.25, 255.25), run(2500.5, 4000.5, 0.25, 335.25),
    run(4050.5, 4850.5, 135.25, 255.25), run(4900.5, 5900.5, 235.25, 335.25), run(5950.5, 8000.5, 0.25, 335.25),
  ], P);
  expect(r.sections).toHaveLength(1);
  expect(r.jogs).toEqual([]);
  expect(r.sections[0].t0).toBeCloseTo(0.5, 6);
  expect(r.sections[0].t1).toBeCloseTo(8000.5, 6);
  expect(r.sections[0].lo).toBeCloseTo(0.25, 6);
  expect(r.sections[0].hi).toBeCloseTo(335.25, 6);
});

test('벽기둥 부풂(짧고 이웃 띠를 품는 구간)은 이웃 띠를 따른다', () => {
  const r = wallsOfRuns([run(0.5, 3000.5, 0.25, 295.25), run(3100.5, 3600.5, 0.25, 570.25), run(3700.5, 8000.5, 0.25, 295.25)], P);
  expect(r.sections).toHaveLength(1);
  expect(r.jogs).toEqual([]);
  expect(r.sections[0].hi).toBeCloseTo(295.25, 6);
});

test('끝 구간이 얇아지면(이웃에 품기지만 샌드위치가 아니다) 진짜 두께 변화다', () => {
  const r = wallsOfRuns([run(0.5, 5000.5, 0.25, 405.25), run(5100.5, 6800.5, 0.25, 200.25)], P);
  expect(r.sections).toHaveLength(2);
  expect(r.jogs.map(j => [Math.round(j.c0), Math.round(j.c1)])).toEqual([[203, 100]]);
  // 가운데가 같은데 두께만 다르면 꺾임 없이 한 중심선이다
  const same = wallsOfRuns([run(0.5, 5000.5, 0.25, 200.25), run(5000.5, 9000.5, -99.75, 300.25)], P);
  expect(same.sections).toHaveLength(2);
  expect(same.jogs).toEqual([]);
  expect(same.sections.map(c)).toEqual([100.25, 100.25]);
});
