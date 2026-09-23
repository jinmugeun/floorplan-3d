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
