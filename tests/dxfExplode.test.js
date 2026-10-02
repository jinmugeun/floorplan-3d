// §18.1의 INSERT 전개. 문서 객체는 parse.js가 내는 모양 그대로 손으로 만든다
// ({ blocks: Map, entities: [] }) — 파서를 다시 통과시키지 않아야 이 파일의 실패가 전개의 실패다.
import { test, expect } from 'vitest';
import { explode, mat, matMul, apply, scaleOf, rotOf, mirrored, bulgeToArc, arcSteps } from '../src/io/dxf/explode.js';

const block = (name, entities, base = [0, 0]) => [name, { name, base, layer: '0', flags: 0, start: 0, end: 0, inserts: new Set(), entities }];
const line = (layer, x, y, x2, y2) => ({ type: 'LINE', layer, x, y, x2, y2 });
const insert = (name, layer, x, y, extra = {}) => ({ type: 'INSERT', name, layer, x, y, ...extra });

test('행렬 도우미는 배율·회전·거울을 분리해 읽는다(소수 배율)', () => {
  const m = mat(1000.5, 2000.25, 0.5, 0.5, 0);
  // `toEqual`은 -0과 +0을 구분한다 — mat이 -0을 접어야 이 줄이 통과한다(사전 검토 I-1).
  expect(m).toEqual([0.5, 0, 0, 0.5, 1000.5, 2000.25]);
  expect(Object.is(m[2], -0)).toBe(false);
  expect(apply(m, [100.5, 200.25])).toEqual([1050.75, 2100.375]);
  const r = mat(0, 0, 2, 2, 45);
  expect(scaleOf(r)).toBeCloseTo(2, 9);
  expect(rotOf(r)).toBeCloseTo(45, 9);
  expect(mirrored(r)).toBe(false);
  expect(mirrored(mat(0, 0, -1, 1, 0))).toBe(true);
  // 합성은 왼쪽이 바깥이다: matMul(부모, 자식)
  expect(matMul(mat(0, 0, 2, 2, 0), mat(10.5, 0, 1, 1, 0))).toEqual([2, 0, 0, 2, 21, 0]);
});

test('bulge는 현 분할 수 공식 그대로 쪼갠다(반원 = 12조각)', () => {
  const arc = bulgeToArc([0, 0], [100.5, 0], 1);      // bulge 1 = tan(45°) → 스윕 180°
  expect(arc.sweep).toBeCloseTo(180, 6);
  expect(arc.r).toBeCloseTo(50.25, 6);
  expect(arcSteps(180, 12)).toBe(12);
  expect(arcSteps(90, 12)).toBe(6);
  expect(arcSteps(1, 12)).toBe(2);                    // 최소 2조각
  expect(bulgeToArc([0, 0], [0, 0], 1)).toBe(null);   // 길이 0 현
});

test('깊이 3 중첩 INSERT의 행렬이 합성되고 레이어 0이 상속된다', () => {
  const doc = {
    blocks: new Map([
      block('A', [insert('B', '0', 0, 5.5, { a0: 90 })]),
      block('B', [insert('C', '0', 10.25, 0, { xscale: 2, yscale: 2 })]),
      block('C', [line('0', 0, 0, 100.5, 0)]),
    ]),
    entities: [insert('A', 'WAL', 1000.5, 2000.25, { xscale: 0.5, yscale: 0.5 })],
  };
  const ex = explode(doc);
  expect(ex.segs).toHaveLength(1);
  const s = ex.segs[0];
  // 0.5 × 2 = 배율 1, 90° 회전 → 가로 선분이 세로가 된다.
  expect(s.a[0]).toBeCloseTo(1000.5, 6); expect(s.a[1]).toBeCloseTo(2008.125, 6);
  expect(s.b[0]).toBeCloseTo(1000.5, 6); expect(s.b[1]).toBeCloseTo(2108.625, 6);
  expect(s.layer).toBe('WAL');            // 블록 안 '0'이 INSERT의 레이어를 상속한다(규칙 ①)
  expect(s.depth).toBe(3);
  expect(s.block).toBe('C');
  expect(ex.inserts).toHaveLength(3);
  expect(ex.skipped.size).toBe(0);
});

// 2026-09-30: 창·문 블록 INSERT 하나 = 개구부 하나다. 블록 로컬 좌표가 base에서 수십 km 떨어져 있어 INSERT 점은
// 쓸 수 없으므로(실파일 DR-1800) 전개된 도형이 **어느 INSERT에서 왔는지** 달아 인서트별 월드 도형을 모은다.
test('전개된 도형은 바로 위 INSERT 번호(ins)를, INSERT는 부모 INSERT 번호(parent)를 단다', () => {
  const doc = {
    blocks: new Map([
      block('PLAN', [insert('WIN-900', '0', 100.5, 0), insert('WIN-900', '0', 2000.5, 0), line('WAL', 0, 0, 5000.5, 0)]),
      block('WIN-900', [line('WIN', 0, 0, 900.5, 0), { type: 'ARC', layer: 'WIN', x: 0, y: 0, r: 900, a0: 0, a1: 90 }, insert('HANDLE', '0', 450.5, 0)]),
      block('HANDLE', [line('WIN', 0, 0, 30.5, 0)]),
    ]),
    entities: [insert('PLAN', '0', 0, 0), line('WAL', 0, -500.25, 100.5, -500.25)],
  };
  const ex = explode(doc);
  expect(ex.inserts.map(i => [i.name, i.parent])).toEqual([['PLAN', undefined], ['WIN-900', 0], ['HANDLE', 1], ['WIN-900', 0], ['HANDLE', 3]]);
  const insOf = s => [s.block, s.ins];
  expect(ex.segs.map(insOf)).toEqual([['WIN-900', 1], ['HANDLE', 2], ['WIN-900', 3], ['HANDLE', 4], ['PLAN', 0], ['*Model_Space', undefined]]);
  expect(ex.arcs.map(a => a.ins)).toEqual([1, 3]);
});

test('블록 base point는 INSERT 점으로 보정된다(규칙 ②)', () => {
  const doc = {
    blocks: new Map([block('D', [line('WAL', 10.5, 20.25, 110.5, 20.25)], [10.5, 20.25])]),
    entities: [insert('D', 'FIN', 500.5, 600.25)],
  };
  const s = explode(doc).segs[0];
  expect(s.a).toEqual([500.5, 600.25]);   // base point가 INSERT 점에 온다
  expect(s.b).toEqual([600.5, 600.25]);
  expect(s.layer).toBe('WAL');            // '0'이 아닌 레이어는 상속하지 않는다
});

// §18.1 ④의 정정(이 태스크 머리 참고). 순수 x 거울은 rotOf = 180이고, 각은 φ − θ로 간다.
test('거울(음수 xscale)에서 ARC 각이 뒤집히고 시작·끝이 바뀐다', () => {
  const arcEnt = { type: 'ARC', layer: '04창호', x: 0, y: 0, r: 100.5, a0: 30, a1: 120 };
  const doc = { blocks: new Map([block('M', [arcEnt])]), entities: [insert('M', '04창호', 0, 0, { xscale: -1, yscale: 1 })] };
  const a = explode(doc).arcs[0];
  expect(a.a0).toBeCloseTo(60, 6);
  expect(a.a1).toBeCloseTo(150, 6);
  expect(a.r).toBeCloseTo(100.5, 6);
  expect(a.c[0]).toBeCloseTo(0, 6); expect(a.c[1]).toBeCloseTo(0, 6);
  // 거울이 아니면 회전만 더한다.
  const plain = { blocks: new Map([block('M', [arcEnt])]), entities: [insert('M', '04창호', 0.5, 0.25, { xscale: 2, yscale: 2, a0: 45 })] };
  const b = explode(plain).arcs[0];
  expect(b.a0).toBeCloseTo(75, 6);
  expect(b.a1).toBeCloseTo(165, 6);
  expect(b.r).toBeCloseTo(201, 6);
});

test('bulge 선분은 src에 :bulge를 달고 분할 수 공식을 따른다', () => {
  const doc = {
    blocks: new Map(),
    entities: [{ type: 'LWPOLYLINE', layer: 'FIN', pts: [[0.5, 0.25], [100.5, 0.25]], bulges: [1], closed: false }],
  };
  const ex = explode(doc);
  expect(ex.segs).toHaveLength(12);                              // 반원 = 12조각
  expect(ex.segs.every(s => s.src === 'LWPOLYLINE:bulge')).toBe(true);
  expect(ex.segs[0].a).toEqual([0.5, 0.25]);
  const last = ex.segs[11].b;
  expect(last[0]).toBeCloseTo(100.5, 6); expect(last[1]).toBeCloseTo(0.25, 6);
  // 분할 수를 줄이면 조각도 줄어든다(워커가 이 값을 만지지는 않지만 규칙이 하나임을 못 박는다).
  expect(explode(doc, { arcSteps: 4 }).segs).toHaveLength(4);
});

// 2026-09-29: 실파일의 여닫이문(WID 레이어 DR-900·DR-1800 블록)은 문 궤적을 ARC가 아니라 **폴리선 bulge**로
// 그렸다 — ARC만 보던 문 판정이 전부 놓쳤다. bulge 호는 선분으로 쪼개는 것과 별개로 polyArcs에도 남긴다.
test('bulge 호는 polyArcs에 월드 좌표의 중심·반지름·반시계 시작/끝 각으로 남는다(거울 INSERT 포함)', () => {
  // 블록 안: (900.5, 0.25)→(0.5, 900.25)를 잇는 90° 호(bulge = tan(22.5°)) — 중심 (0.5, 0.25)에서 반시계로 돈다
  const b = Math.tan(Math.PI / 8);
  const leaf = { type: 'LWPOLYLINE', layer: 'WID', pts: [[900.5, 0.25], [0.5, 900.25]], bulges: [b], closed: false };
  const doc = { blocks: new Map([block('DR-900', [leaf])]), entities: [insert('DR-900', 'WID', 1000.5, 2000.25)] };
  const ex = explode(doc);
  expect(ex.arcs).toEqual([]);                          // 레이어 통계(arcs)는 그대로다
  expect(ex.polyArcs).toHaveLength(1);
  const a = ex.polyArcs[0];
  expect(a.block).toBe('DR-900');
  expect(a.layer).toBe('WID');
  expect(a.r).toBeCloseTo(900, 3);
  expect(a.c[0]).toBeCloseTo(1001, 3);
  expect(a.c[1]).toBeCloseTo(2000.5, 3);
  expect(a.a0).toBeCloseTo(0, 3);
  expect(a.a1).toBeCloseTo(90, 3);
  // 거울(xscale −1)이면 호가 y축 반대편으로 가고 반시계 표현은 90°→180°다
  const mir = explode({ blocks: doc.blocks, entities: [insert('DR-900', 'WID', 1000.5, 2000.25, { xscale: -1 })] }).polyArcs[0];
  expect(mir.c[0]).toBeCloseTo(1000, 3);
  expect(((mir.a0 % 360) + 360) % 360).toBeCloseTo(90, 3);
  expect(((mir.a1 % 360) + 360) % 360).toBeCloseTo(180, 3);
});

test('깊이 초과와 없는 블록은 skipped에 센다', () => {
  const doc = {
    blocks: new Map([
      block('A', [insert('B', '0', 0, 0)]),
      block('B', [insert('C', '0', 0, 0)]),
      block('C', [line('WAL', 0.5, 0.25, 10.5, 0.25)]),
    ]),
    entities: [insert('A', 'WAL', 0, 0), insert('NOPE', 'WAL', 1.5, 2.5)],
  };
  const deep = explode(doc, { maxDepth: 2 });
  expect(deep.segs).toHaveLength(0);                             // C까지 내려가지 못한다
  expect(deep.skipped.get('maxDepth')).toBe(1);
  expect(deep.skipped.get('missing-block:NOPE')).toBe(1);
  expect(explode(doc).segs).toHaveLength(1);                     // 기본 maxDepth 8이면 닿는다
});

test('SPLINE·ELLIPSE는 others에만 세고 HATCH·DIMENSION은 자기 자리로 간다', () => {
  const doc = {
    blocks: new Map(),
    entities: [
      { type: 'SPLINE', layer: '급식기구' }, { type: 'SPLINE', layer: '급식기구' }, { type: 'ELLIPSE', layer: '급식기구' },
      { type: 'HATCH', layer: 'SYM' }, { type: 'DIMENSION', layer: 'DIMENSION' },
      { type: 'CIRCLE', layer: 'COL', x: 1.5, y: 2.5, r: 300.25 },
      { type: 'TEXT', layer: 'A-SHE', x: 10.5, y: 20.25, r: 300, text: '조리실' },
      { type: 'LINE', layer: 'CEN', paper: true, x: 0, y: 0, x2: 1, y2: 1 },
    ],
  };
  const ex = explode(doc);
  expect(ex.others.get('SPLINE')).toBe(2);
  expect(ex.others.get('ELLIPSE')).toBe(1);
  expect(ex.segs).toHaveLength(0);                               // 페이퍼스페이스 선은 전개하지 않는다
  expect(ex.hatches).toHaveLength(1);
  expect(ex.dims).toHaveLength(1);
  expect(ex.circles[0].r).toBeCloseTo(300.25, 6);
  expect(ex.texts[0]).toMatchObject({ h: 300, text: '조리실', layer: 'A-SHE' });
});

test('중첩 INSERT 안의 문자·원호도 같은 행렬로 옮겨진다', () => {
  const doc = {
    blocks: new Map([block('T', [{ type: 'TEXT', layer: '0', x: 10.5, y: 0.25, r: 300, text: '화장실(남)' }])]),
    entities: [insert('T', 'TEXT2', 1000.5, 2000.25, { xscale: 2, yscale: 2 })],
  };
  const t = explode(doc).texts[0];
  expect(t.p[0]).toBeCloseTo(1021.5, 6);
  expect(t.p[1]).toBeCloseTo(2000.75, 6);
  expect(t.h).toBeCloseTo(600, 6);
  expect(t.layer).toBe('TEXT2');
});


// 최종 리뷰 M-4: INSERT의 rot은 **합성 행렬**의 각이다. 거울은 각을 더하지 않고 φ − θ로 보내므로
// (e.a0 + rotOf(m))은 거울 부모 아래에서 어긋난다(실파일 INSERT 659개 중 67개가 그 자리다).
test('거울 부모 아래 INSERT의 rot은 합성 행렬의 각이다', () => {
  const nested = outer => ({
    blocks: new Map([block('OUT', [insert('IN', '0', 0, 0, { a0: 30 })]), block('IN', [line('WAL', 0, 0, 100.5, 0)])]),
    entities: [insert('OUT', 'WAL', 0.5, 0.25, outer)],
  });
  const mirror = explode(nested({ xscale: -1, yscale: 1 })).inserts.find(i => i.name === 'IN');
  expect(mirror.mirrored).toBe(true);
  expect(mirror.rot).toBeCloseTo(150, 6);                        // 예전 값은 30 + 180 = 210(60° 어긋났다)
  // 거울이 아니면 두 식이 같다 — 값이 바뀌지 않는다.
  const plain = explode(nested({ xscale: 1, yscale: 1, a0: 20 })).inserts.find(i => i.name === 'IN');
  expect(plain.mirrored).toBe(false);
  expect(plain.rot).toBeCloseTo(50, 6);
});
// 2026-10-02: 레이어 판정이 선의 실제 색을 본다(청록 = 창호). 색은 엔티티에 적힌 값(1~255)만 옮기고,
// ByLayer(256·없음)·ByBlock(0)은 비워 둔다 — 그때의 실제 색은 레이어 색이다(classify.layerStats).
test('전개된 선분·호는 엔티티에 적힌 색(1~255)을 달고, ByLayer·ByBlock은 비운다', () => {
  const doc = {
    blocks: new Map([block('W', [{ ...line('WID', 0, 0, 900.5, 0), color: 4 }, { ...line('WID', 0, 100.5, 900.5, 100.5), color: 0 },
      { type: 'LWPOLYLINE', layer: 'WID', pts: [[0, 0], [10.5, 0], [10.5, 10.5]], bulges: [0, 1], color: 9 }, { type: 'ARC', layer: 'WID', x: 0, y: 0, r: 5, a0: 0, a1: 90, color: 4 }])]),
    entities: [insert('W', 'WID', 0, 0), { ...line('WAL', 0, 0, 5.5, 0), color: 256 }, line('WAL', 0, 0, 7.5, 0)],
  };
  const ex = explode(doc);
  expect(ex.segs.filter(s => s.src === 'LINE').map(s => s.color)).toEqual([4, undefined, undefined, undefined]);
  expect(ex.segs.filter(s => s.src.startsWith('LWPOLYLINE')).every(s => s.color === 9)).toBe(true);
  expect(ex.polyArcs[0].color).toBe(9);
  expect(ex.arcs[0].color).toBe(4);
});

// 2026-10-02: 치수(DIMENSION)의 측정점은 설계자가 실제로 재는 선(벽·기둥 중심선)을 가리킨다 — 면적 기준선의 근거다.
// 선형 치수(종류 0 · 회전각 50)와 정렬 치수(종류 1)의 두 측정점(13/23 · 14/24)을 월드 좌표로 옮기고, 재는 축을 단다.
test('치수는 두 측정점(월드 좌표)과 재는 축을 단다', () => {
  const dim = (x3, y3, x4, y4, extra = {}) => ({ type: 'DIMENSION', layer: 'DIM', x3, y3, x4, y4, flags: 0, ...extra });
  const doc = {
    blocks: new Map([block('B', [dim(0, 0, 4500.5, 0)])]),
    entities: [
      dim(1000.5, 2000.25, 6700.5, 2000.25),                       // 가로 치수(회전 0): x를 잰다
      dim(1000.5, 2000.25, 1000.5, 5200.25, { a0: 90 }),           // 세로 치수(회전 90): y를 잰다
      dim(0.5, 0.25, 3000.5, 4000.25, { flags: 1 }),               // 정렬 치수(기운 선) — 축 없음
      dim(0.5, 0.25, 3000.5, 4.25, { flags: 33 }),                 // 정렬 치수지만 거의 가로 → x
      { type: 'DIMENSION', layer: 'DIM', flags: 3 },               // 지름 치수 · 측정점 없음 — 세기만 한다
      insert('B', '0', 10000.5, 500.25, { a0: 90 }),               // 블록 안 치수: 90° 돌아 y를 잰다
    ],
  };
  const d = explode(doc).dims;
  expect(d).toHaveLength(6);
  expect(d.map(x => x.axis)).toEqual(['x', 'y', null, 'x', undefined, 'y']);
  expect([d[0].p1, d[0].p2]).toEqual([[1000.5, 2000.25], [6700.5, 2000.25]]);
  expect(d[5].p1[0]).toBeCloseTo(10000.5, 6); expect(d[5].p1[1]).toBeCloseTo(500.25, 6);
  expect(d[5].p2[0]).toBeCloseTo(10000.5, 6); expect(d[5].p2[1]).toBeCloseTo(5000.75, 6);
  expect(d[4].p1).toBeUndefined();
});
