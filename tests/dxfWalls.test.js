// §18.3 추출 파이프라인(2026-09-29 벽 띠 스윕). 좌표는 전부 소수다(정수 격자에 우연히 맞는 답을 거른다).
import { test, expect } from 'vitest';
import { joinEnds, pruneSpurs, dropTinyComponents, extractWalls } from '../src/io/dxf/walls.js';
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
// 축에서 벗어난 각(°) — 축 정렬 입력에서 0이어야 한다(옛 스냅은 실파일 벽 31개를 최대 9° 기울였다).
const skew = w => { const a = Math.abs(Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]) * 180 / Math.PI) % 90; return Math.min(a, 90 - a); };
const exOf = segs => ({ segs, arcs: [], circles: [], texts: [], inserts: [], dims: [], hatches: [] });
const opts = { wallLayers: new Set(['WAL']), params: P, thickness: 200 };
const rect = (x0, y0, w, h, layer = 'WAL') => [
  seg(x0, y0, x0 + w, y0, layer), seg(x0 + w, y0, x0 + w, y0 + h, layer),
  seg(x0 + w, y0 + h, x0, y0 + h, layer), seg(x0, y0 + h, x0, y0, layer),
];

test('joinEnds는 매달린 끝을 자기 축 위에서만 늘이고(T자) 반대쪽 끝은 끌지 않는다', () => {
  const stub = wall(3000.5, 100.25, 3000.5, 1900.25);
  const beam = wall(0.5, 2000.25, 6000.5, 2000.25);
  const out = joinEnds([stub, beam], P);
  expect(out[0].b).toEqual([3000.5, 2000.25]);                // 100 mm 앞으로 늘여 중심선에 닿았다
  expect(out[0].a).toEqual([3000.5, 100.25]);
  // 뒤로 1,900 mm 점프하는 접합은 막는다(되당김은 상대 두께/2 + 내 두께까지다).
  const wide = joinEnds([wall(0.5, 100.25, 2000.5, 100.25), wall(100.5, 0.25, 100.5, 4000.25)], P);
  expect(wide[0].b[0]).toBeCloseTo(2000.5, 6);
  // 리뷰 F2: 200 mm 바 두 줄(y = 2000.25 · 2100.25) 사이에 낀 길이 400 가벽. 뒤로 당겨 minWall 아래로
  // 줄면 지워지므로 그런 후보는 받지 않는다 — 가까운 바로 **앞으로** 닿는 것만 남는다.
  const pinched = joinEnds([
    wall(3000.5, 2000.25, 3000.5, 2400.25),
    wall(0.5, 2000.25, 6000.5, 2000.25), wall(0.5, 2100.25, 6000.5, 2100.25),
  ], P);
  expect(L(pinched[0])).toBeGreaterThanOrEqual(P.minWall);
  // 살짝 지나친 끝(300.5 mm)은 되당긴다 — 벽이 minWall 위로 남기 때문이다.
  const over = joinEnds([wall(3000.5, 0.25, 3000.5, 2300.75), wall(0.5, 2000.25, 6000.5, 2000.25)], P);
  expect(over[0].b).toEqual([3000.5, 2000.25]);
  expect(over[0].a).toEqual([3000.5, 0.25]);
});

test('joinEnds는 L 모서리의 두 끝을 두 중심선의 교점 하나로 모은다(어느 벽도 기울지 않는다)', () => {
  // 가로 벽은 모서리 100 mm 앞에서, 세로 벽은 150 mm 앞에서 끝났다
  const out = joinEnds([wall(200.5, 100.25, 5000.5, 100.25), wall(100.5, 250.25, 100.5, 4000.25)], P);
  expect(out[0].a).toEqual([100.5, 100.25]);
  expect(out[1].a).toEqual([100.5, 100.25]);
  expect(out.map(skew)).toEqual([0, 0]);
  expect(openEnds(out)).toBe(2);                              // 남은 두 끝은 원래 끝(모서리가 아니다)
});

test('joinEnds는 이미 이어진 상대 끝을 끌어오지 않는다', () => {
  // 세로 벽의 아래 끝은 다른 가로 벽과 이미 만난다 — 매달린 가로 벽이 그 끝을 옮기면 접합이 깨진다
  const base = wall(100.5, 0.25, 3000.5, 0.25);
  const post = wall(100.5, 0.25, 100.5, 3000.25);
  const dang = wall(-3000.5, -400.25, -300.5, -400.25);     // 연장선이 post 몸통 밖(아래)을 지난다
  const out = joinEnds([base, post, dang], P);
  expect(out[1].a).toEqual([100.5, 0.25]);
  expect(out[2].b).toEqual([-300.5, -400.25]);
});

test('pruneSpurs는 한쪽 끝이 매달린 짧은 토막만 지우고, 긴 벽·양끝이 이어진 짧은 벽은 남긴다', () => {
  const box = [wall(0.5, 0.25, 4000.5, 0.25), wall(4000.5, 0.25, 4000.5, 3000.25), wall(4000.5, 3000.25, 0.5, 3000.25), wall(0.5, 3000.25, 0.5, 0.25)];
  const spur = wall(2000.5, 0.25, 2000.5, 555.25);             // 벽기둥 면에서 나온 555 mm 토막(한 끝 매달림)
  const wing = wall(2000.5, 3000.25, 2000.5, 1500.25);        // 1.5 m 날개벽(매달렸지만 길다)
  const out = pruneSpurs([...box, spur, wing], P);
  expect(out).toHaveLength(5);
  expect(out).not.toContain(spur);
  expect(out).toContain(wing);
  // 짧아도 양끝이 다른 벽에 닿아 있으면 칸막이다 — 남긴다
  const link = wall(4000.5, 1000.25, 4800.5, 1000.25);
  const post = wall(4800.5, 0.25, 4800.5, 3000.25);
  expect(pruneSpurs([...box, post, link], P)).toContain(link);
});

test('벽기둥 토막에 먼저 붙은 끝은 토막을 지운 뒤 진짜 벽까지 다시 늘인다', () => {
  // 가로 벽(y 2000.25) 아래 250 mm에서 끝난 세로 벽 + 그 끝에서 오른쪽으로 난 555 mm 토막
  // (방이 12 m로 넓어 토막 끝이 4 m 안에서 닿을 벽이 없다 — 실파일 식당 서쪽 벽의 모양이다.)
  const r = extractWalls(exOf([
    ...rectSegs({ doorGap: false, wide: true }),
    seg(2900.5, 3800.25, 2900.5, 2200.25), seg(3100.5, 3800.25, 3100.5, 2200.25),   // 세로 칸막이 200
    seg(3000.5, 2150.25, 3555.5, 2150.25), seg(3000.5, 2250.25, 3555.5, 2250.25),   // 토막(두께 100)
    seg(200.5, 1900.25, 11800.5, 1900.25), seg(200.5, 2100.25, 11800.5, 2100.25),   // 가로 벽 200
  ]), opts);
  expect(r.walls.some(w => w.thickness === 100)).toBe(false);          // 토막은 지워졌다
  const post = r.walls.find(w => w.a[0] === w.b[0] && Math.abs(w.a[0] - 3000.5) < 1);
  // (T자 접합은 normalizeWalls가 나중에 쪼갠다 — 여기서는 끝이 두 가로 벽의 중심선 위에 있으면 된다.)
  expect([post.a[1], post.b[1]].sort((a, b) => a - b)).toEqual([2000.25, 3900.25]);
});

// 2026-09-29 감사: 도면에 삽입된 트럭(탑차 블록, FIN 레이어)이 벽 6개(9.2 m)가 됐다. 벽은 벽 선 대부분이 든
// 주 평면 블록에서만 세운다 — 기호 블록(트럭·조경·싱크대)의 벽 레이어 선은 벽이 아니다(기둥 찾기에는 쓴다).
test('벽 레이어 선이 적은 기호 블록(트럭 등)은 벽을 만들지 않고, 기둥 블록의 사각형은 기둥이 된다', () => {
  const inBlock = (segs, block) => segs.map(x => ({ ...x, block }));
  const truck = inBlock([seg(34000.5, 1000.25, 38000.5, 1000.25, 'FIN'), seg(34000.5, 1150.25, 38000.5, 1150.25, 'FIN'),
    seg(34000.5, 2800.25, 38000.5, 2800.25, 'FIN'), seg(34000.5, 2950.25, 38000.5, 2950.25, 'FIN'),
    seg(34000.5, 1000.25, 34000.5, 2950.25, 'FIN'), seg(34150.5, 1000.25, 34150.5, 2950.25, 'FIN')], '탑차');
  // 주 평면은 30 m × 20 m + 칸막이(벽 선 240 m), 트럭은 선 20 m(8 %) — 실파일은 2.3 %다
  const big = (X, Y) => [seg(0.5, 0.25, X, 0.25), seg(0.5, 200.25, X, 200.25), seg(0.5, Y, X, Y), seg(0.5, Y - 200, X, Y - 200),
    seg(0.5, 0.25, 0.5, Y), seg(200.5, 0.25, 200.5, Y), seg(X, 0.25, X, Y), seg(X - 200, 0.25, X - 200, Y)];
  const plan = inBlock([...big(30000.5, 20000.25), seg(12000.5, 0.25, 12000.5, 20000.25), seg(12200.5, 0.25, 12200.5, 20000.25)], '1f plan-1');
  const col = inBlock(rect(3000.5, 200.25, 500, 700, 'WAL'), 'zw$260D');
  // 트럭을 건물에 이어 붙여(ROI 한 덩어리) 둔다 — 떨어져 있으면 ROI가 알아서 빼 버려 이 규칙을 못 본다
  const link = inBlock([seg(30000.5, 0.25, 34000.5, 1000.25, 'Layer 1')], '1f plan-1');   // 건물 모서리 → 트럭 모서리(ROI 한 덩어리)
  const r = extractWalls(exOf([...plan, ...col, ...truck, ...link]), { ...opts, wallLayers: new Set(['WAL', 'FIN']) });
  expect(r.walls).toHaveLength(5);                                    // 사각형 넷 + 가운데 칸막이
  expect(r.walls.every(w => Math.max(w.a[0], w.b[0]) <= 30000.5)).toBe(true);
  expect(r.columns).toHaveLength(1);
  expect(r.columns[0].c[0]).toBeCloseTo(3250.5, 6);
});

test('기둥은 벽에 닿은 사각형과, 떨어져 있어도 그와 같은 크기인 사각형이다', () => {
  const touching = rect(3000.5, 200.25, 500, 700);                 // 아래 벽 안쪽 면에 붙은 기둥
  const same = rect(6000.5, 2000.25, 500, 700);                    // 방 한가운데 — 같은 모듈의 독립 기둥
  const odd = rect(9000.5, 2000.25, 710, 710);                     // 크기가 다른 떨어진 사각형(설비 뚜껑 등)
  const r = extractWalls(exOf([...rectSegs({ doorGap: false, wide: true }), ...touching, ...same, ...odd]), opts);
  expect(r.columns.map(c => Math.round(c.c[0])).sort((a, b) => a - b)).toEqual([3251, 6251]);
});

// 2026-09-29 감사: 실파일 식당 위·아래 벽의 벽기둥(500×700)은 벽 면을 네 번째 변으로 삼는 ㄷ자로 그려졌다 —
// 닫힌 사각형 규칙에 안 걸려 기둥이 서지 않았다.
test('열린 쪽이 벽 몸통에 닿은 ㄷ자(벽기둥)도 기둥이고, 허공에 뜬 ㄷ자는 아니다', () => {
  // 아래 벽 안쪽 면(y 200.25)에서 방 안으로 700 나온 500 폭 벽기둥: 옆 변 둘 + 앞 변 하나
  const u = [seg(3000.5, 200.25, 3000.5, 900.25), seg(3000.5, 900.25, 3500.5, 900.25), seg(3500.5, 900.25, 3500.5, 200.25)];
  const floating = [seg(7000.5, 2000.25, 7000.5, 2700.25), seg(7000.5, 2700.25, 7500.5, 2700.25), seg(7500.5, 2700.25, 7500.5, 2000.25)];
  const r = extractWalls(exOf([...rectSegs({ doorGap: false, wide: true }), ...u, ...floating]), opts);
  expect(r.columns).toHaveLength(1);
  expect(r.columns[0].c[0]).toBeCloseTo(3250.5, 6);
  expect(r.columns[0].c[1]).toBeCloseTo(550.25, 6);                // 벽 면 ~ 앞 변의 가운데
  expect([Math.round(Math.min(r.columns[0].w, r.columns[0].h)), Math.round(Math.max(r.columns[0].w, r.columns[0].h))]).toEqual([500, 700]);
  expect(r.walls).toHaveLength(4);                                 // 벽기둥은 벽을 늘리지 않는다
});

// 실파일 식당 벽기둥: 구조체 닫힌 사각형(500×700) + ㄷ자(550) + 마감 라이닝 ㄷ자(650·670·690)가 한 자리에 겹쳐
// 그려졌다 — 기둥 아이템 여럿이 겹치면 안 되고, 벽처럼 **가장 바깥 윤곽**이 기둥이다.
test('한 자리에 겹쳐 그린 기둥 윤곽들(구조체·ㄷ자·라이닝)은 바깥 윤곽의 기둥 하나다', () => {
  const core = rect(3000.5, 200.25, 500, 700);                                    // 구조체(닫힘)
  const lining = [seg(2900.5, 250.25, 2900.5, 1000.25), seg(2900.5, 1000.25, 3600.5, 1000.25), seg(3600.5, 1000.25, 3600.5, 250.25)];   // 700 폭 라이닝 ㄷ자(열린 끝이 벽 면에서 50 떠 혼자서는 기둥이 아니다)
  const r = extractWalls(exOf([...rectSegs({ doorGap: false, wide: true }), ...core, ...lining]), opts);
  expect(r.columns).toHaveLength(1);
  const c = r.columns[0];
  expect([Math.round(Math.min(c.w, c.h)), Math.round(Math.max(c.w, c.h))]).toEqual([700, 800]);   // 벽 면(200) ~ 라이닝 앞 변(1000)
  expect(c.c[0]).toBeCloseTo(3250.5, 6);
  expect(c.c[1]).toBeCloseTo(600.25, 6);
});

test('큰 윤곽 안에 포갠 작은 윤곽들(실파일 경사로 끝: 450×1100 안에 400×500 둘)도 기둥 하나다', () => {
  const outer = rect(3000.5, 200.25, 450, 1100);
  const inner1 = rect(3025.5, 200.25, 400, 500), inner2 = rect(3025.5, 750.25, 400, 500);
  const r = extractWalls(exOf([...rectSegs({ doorGap: false, wide: true }), ...outer, ...inner1, ...inner2]), opts);
  expect(r.columns).toHaveLength(1);
  expect([Math.round(Math.min(r.columns[0].w, r.columns[0].h)), Math.round(Math.max(r.columns[0].w, r.columns[0].h))]).toEqual([450, 1100]);
});

test('dropTinyComponents는 벽 4개 미만 덩어리를 버린다', () => {
  const box = [wall(0.5, 0.25, 4000.5, 0.25), wall(4000.5, 0.25, 4000.5, 3000.25), wall(4000.5, 3000.25, 0.5, 3000.25), wall(0.5, 3000.25, 0.5, 0.25)];
  const island = [wall(90000.5, 0.25, 91000.5, 0.25), wall(91000.5, 0.25, 91000.5, 900.25)];
  expect(dropTinyComponents([...box, ...island], P.minComp)).toHaveLength(4);
  expect(dropTinyComponents([...box, ...island], 2)).toHaveLength(6);
  // 2026-09-29: 기둥에 가로막혀 본 네트워크와 떨어진 실제 벽(실파일 조리실 윗벽 토막+실내벽, 3.8 m)은 남긴다 —
  // 버리는 것은 벽 수도 적고 **짧기도 한** 조각(minCompLen 미만)이다.
  const chase = [wall(90000.5, 0.25, 92200.5, 0.25), wall(90000.5, 0.25, 90000.5, 1700.25)];
  expect(dropTinyComponents([...box, ...chase], P.minComp, P.minCompLen)).toHaveLength(6);
  expect(dropTinyComponents([...box, wall(90000.5, 0.25, 90700.5, 0.25)], P.minComp, P.minCompLen)).toHaveLength(4);
});

// §18.11이 요구한 합성 도면: 900 mm 문 틈이 있는 이중선 사각형 → 벽 4 · 끊긴 끝점 0.
// 바깥 면선 (0.5, 0.25)~(6000.5, 4000.25), 안쪽 면선은 200 mm 안으로 들어온다.
const rectSegs = ({ doorGap = true, wide = false, door = [2500.5, 3400.5] } = {}) => {
  const X1 = wide ? 12000.5 : 6000.5, Y1 = 4000.25;
  // 900 mm 문 틈은 **두 면선을 모두** 끊는다(실제 개구부가 그렇다 — 한쪽만 끊긴 것은 작도 오류다).
  const bottom = y => (doorGap
    ? [seg(0.5, y, door[0], y), seg(door[1], y, X1, y)]
    : [seg(0.5, y, X1, y)]);
  return [
    ...bottom(0.25), ...bottom(200.25),
    seg(0.5, Y1, X1, Y1), seg(0.5, Y1 - 200, X1, Y1 - 200),
    seg(0.5, 0.25, 0.5, Y1), seg(200.5, 0.25, 200.5, Y1),
    seg(X1, 0.25, X1, Y1), seg(X1 - 200, 0.25, X1 - 200, Y1),
  ];
};

test('이중선 사각형에서 벽 4개가 나오고, 모서리는 중심선의 교점이며, 문 틈은 이어진다', () => {
  const r = extractWalls(exOf(rectSegs()), opts);
  expect(r.walls).toHaveLength(4);
  expect(r.walls.every(w => w.thickness === 200)).toBe(true);
  expect(openEnds(r.walls)).toBe(0);
  expect(r.guessed).toBe(false);
  expect(r.walls.map(skew)).toEqual([0, 0, 0, 0]);
  // 중심선은 면선 사이 한가운데(100.25 / 3900.25 / 100.5 / 5900.5)이고 네 모서리는 그 교점이다
  // (옛 무게중심 스냅은 모서리를 (50.5, 50.25)로 끌어 벽 몸통 밖에 세웠다).
  const xs = r.walls.flatMap(w => [w.a[0], w.b[0]]), ys = r.walls.flatMap(w => [w.a[1], w.b[1]]);
  expect(Math.min(...xs)).toBeCloseTo(100.5, 6);
  expect(Math.max(...xs)).toBeCloseTo(5900.5, 6);
  expect(Math.min(...ys)).toBeCloseTo(100.25, 6);
  expect(Math.max(...ys)).toBeCloseTo(3900.25, 6);
  expect(r.walls.map(w => Math.round(L(w))).sort((a, b) => a - b)).toEqual([3800, 3800, 5800, 5800]);
  // 900 mm 문 틈이 개구부 하나로 알려진다 — 점은 중심선 위 틈의 중점이다.
  expect(r.gaps).toHaveLength(1);
  expect(r.gaps[0].width).toBeCloseTo(900, 6);
  expect(r.gaps[0].p[0]).toBeCloseTo(2950.5, 6);
  expect(r.gaps[0].p[1]).toBeCloseTo(100.25, 6);
  expect(extractWalls(exOf(rectSegs({ doorGap: false })), opts).gaps).toEqual([]);
});

test('여러 겹으로 그린 벽(마감·구조·라이닝)은 벽 하나이고 두께는 바깥 선에서 안쪽 선까지다', () => {
  // 아래 벽을 다섯 선으로 그렸다: 마감 0.25 · 구조 25.25~225.25 · 마감 250.25 · 라이닝 300.25
  const extra = y => [seg(0.5, y, 6000.5, y)];
  const segs = [...rectSegs({ doorGap: false }), ...extra(25.25), ...extra(225.25), ...extra(300.25)]
    .filter(s => !(s.a[1] === 200.25 && s.b[1] === 200.25));
  const r = extractWalls(exOf(segs), opts);
  const bottoms = r.walls.filter(w => w.a[1] === w.b[1] && w.a[1] < 1000);
  expect(bottoms).toHaveLength(1);                             // 평행 중심선이 2~4개 겹치지 않는다
  expect(bottoms[0].thickness).toBe(300);
  expect(bottoms[0].a[1]).toBeCloseTo(150.25, 6);
  expect(openEnds(r.walls)).toBe(0);
});

test('외벽 안쪽에 붙은 기둥은 벽을 만들지 않는다(기둥 면끼리 잇는 유령 벽 없음)', () => {
  // 12 m 사각형 아래 벽 안쪽에 500×700 기둥 셋이 5.5 m 간격으로 붙어 있다
  const cols = [1000.5, 6500.5, 11000.25 - 500].flatMap(x => rect(x, 200.25, 500, 700));
  const r = extractWalls(exOf([...rectSegs({ doorGap: false, wide: true }), ...cols]), opts);
  expect(r.columns).toHaveLength(3);
  expect(r.walls).toHaveLength(4);
  expect(openEnds(r.walls)).toBe(0);
  expect(r.walls.map(skew)).toEqual([0, 0, 0, 0]);
  expect(r.gaps).toEqual([]);
});

test('칸막이는 T자로 닿고 모든 벽이 축을 지킨다', () => {
  // 사각형 가운데를 가르는 100 mm 칸막이(x 2950.5~3050.5) — 양 끝은 긴 벽 안쪽 면에서 끝난다
  const part = [seg(2950.5, 200.25, 2950.5, 3800.25), seg(3050.5, 200.25, 3050.5, 3800.25)];
  const r = extractWalls(exOf([...rectSegs({ doorGap: false }), ...part]), opts);
  expect(r.walls).toHaveLength(5);
  const p = r.walls.find(w => w.thickness === 100);
  expect(p.a[0]).toBeCloseTo(3000.5, 6);
  expect([p.a[1], p.b[1]].sort((a, b) => a - b)).toEqual([100.25, 3900.25]);   // 두 긴 벽의 중심선까지
  expect(r.walls.map(skew)).toEqual([0, 0, 0, 0, 0]);
});

test('개구부 레이어의 700 mm 이상 면선이 끊긴 외벽을 대신 그린다(커튼월 보정)', () => {
  // 아래 바깥 면선을 2,000 mm만 남기고 나머지 10,000 mm를 WIN 레이어가 그린다.
  const base = rectSegs({ wide: true }).filter(s => !(s.a[1] === 0.25 && s.b[1] === 0.25));
  const cut = [seg(0.5, 0.25, 2000.5, 0.25, 'WAL'), seg(2000.5, 0.25, 12000.5, 0.25, 'WIN')];
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
  const r = extractWalls(exOf(segs), opts);
  expect(r.guessed).toBe(true);
  expect([...r.guessedLayers]).toEqual(['Layer 1']);
  expect(r.walls).toHaveLength(4);
  expect(openEnds(r.walls)).toBe(0);
});

test('틈 판정은 "둘 다 비는" 구간이다 — 한쪽 면선만 끊긴 작도 오류는 문이 아니다 (리뷰 F1)', () => {
  const outer = (x0, x1) => (x0 === null ? [seg(0.5, 0.25, 6000.5, 0.25)] : [seg(0.5, 0.25, x0, 0.25), seg(x1, 0.25, 6000.5, 0.25)]);
  const inner = (x0, x1) => (x0 === null ? [seg(0.5, 200.25, 6000.5, 200.25)] : [seg(0.5, 200.25, x0, 200.25), seg(x1, 200.25, 6000.5, 200.25)]);
  const gapsOf = segs => extractWalls(exOf(segs), opts).gaps;
  // (a) 바깥 면선은 멀쩡하고 안쪽만 끊겼다 → 띠는 끊겼다가 이어지지만(선 하나는 띠가 아니다) 그 틈을
  //     바깥 선이 덮고 있으니 개구부가 아니다.
  expect(gapsOf([...outer(null), ...inner(2500.5, 3400.5)])).toEqual([]);
  // (b) 끊긴 자리가 어긋나 **둘 다 비는** 구간이 없다 → 0개(옛 판정 전에는 유령 문 둘).
  expect(gapsOf([...outer(4000.5, 4900.5), ...inner(2500.5, 3400.5)])).toEqual([]);
  // (c) 둘 다 같은 900 mm 구간이 비면 개구부 하나 — 폭은 둘 다 비는 구간, 점은 중심선 위 중점이다.
  const one = gapsOf([...outer(2500.5, 3400.5), ...inner(2500.5, 3400.5)]);
  expect(one.map(g => Math.round(g.width))).toEqual([900]);
  expect(one[0].p[0]).toBeCloseTo(2950.5, 6);
  expect(one[0].p[1]).toBeCloseTo(100.25, 6);
  // (d) 둘 다 비는 구간이 500 mm면 개구부가 아니다(문보다 좁다 · gapMin 600).
  expect(gapsOf([...outer(2500.5, 3000.5), ...inner(2500.5, 3000.5)])).toEqual([]);
  // (e) 1,800 mm 양개문 자리도 개구부다(옛 판정은 1,500 mm에서 잘라 식당 양개문을 놓쳤다).
  // (합성 두 선만으로는 1.8 m 틈이 ROI 덩어리를 갈라 놓으므로 사각형 안에서 잰다.)
  expect(extractWalls(exOf(rectSegs({ door: [2500.5, 4300.5] })), opts).gaps.map(g => Math.round(g.width))).toEqual([1800]);
});
