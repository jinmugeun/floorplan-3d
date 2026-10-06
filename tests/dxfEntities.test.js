// MLINE(2026-10-06 · 계획 10 이월): 정점(11/21)마다 방향(12/22)·마이터(13/23)와 요소별 파라미터(74 개수 → 41 값들)가 반복된다.
// buildEntity는 LWPOLYLINE처럼 반복을 배열로 모은다. 픽스처는 DXF 참조 문서대로 손으로 만든 것이다(보유 도면에 MLINE 엔티티가 없다).
import { test, expect } from 'vitest';
import { buildEntity } from '../src/io/dxf/entities.js';
import { explode } from '../src/io/dxf/explode.js';
import { extractWalls } from '../src/io/dxf/walls.js';
import { buildProject } from '../src/io/dxf/toProject.js';

const S = Math.SQRT2;
// 9000 × 6000 직사각형 중심선, 요소 둘(오프셋 +100 · −100) → 안팎 두 사각형. 모서리 마이터는 대각(단위벡터), 파라미터 = ±100√2.
const V = [[0, 0], [9000, 0], [9000, 6000], [0, 6000]];
const MITER = [[-1 / S, -1 / S], [1 / S, -1 / S], [1 / S, 1 / S], [-1 / S, 1 / S]];      // 바깥 대각 방향
const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const MLINE_PAIRS = [8, 'WAL', 2, 'STANDARD', 40, '1', 70, '1', 71, '3', 72, '4', 73, '2', 10, '0', 20, '0',
  ...V.flatMap((p, k) => [11, String(p[0]), 21, String(p[1]), 12, String(DIR[k][0]), 22, String(DIR[k][1]), 13, String(MITER[k][0]), 23, String(MITER[k][1]),
    74, '2', 41, String(100 * S), 41, '0', 75, '0', 74, '2', 41, String(-100 * S), 41, '0', 75, '0'])];   // 참조 문서 순서: 요소마다 74·41…·75·42…

test('buildEntity는 MLINE의 정점·마이터·요소 파라미터를 배열로 모은다', () => {
  const e = buildEntity('MLINE', MLINE_PAIRS);
  expect(e).toMatchObject({ type: 'MLINE', layer: 'WAL', name: 'STANDARD', r: 1, just: 1, flags: 3, nVerts: 4, nElems: 2, x: 0, y: 0, closed: true });
  expect(e.verts).toEqual(V);
  expect(e.miters[1][0]).toBeCloseTo(1 / S, 9);
  expect(e.params).toHaveLength(4);
  expect(e.params[0]).toHaveLength(2);
  expect(e.params[0][0][0]).toBeCloseTo(100 * S, 9);
  expect(e.params[0][1][0]).toBeCloseTo(-100 * S, 9);
  // 다른 타입의 11/21·13/23·41·70은 예전 그대로다.
  expect(buildEntity('LINE', [10, '1', 20, '2', 11, '3', 21, '4'])).toMatchObject({ x: 1, y: 2, x2: 3, y2: 4 });
  expect(buildEntity('DIMENSION', [13, '1', 23, '2', 14, '3', 24, '4', 70, '1'])).toMatchObject({ x3: 1, y3: 2, x4: 3, y4: 4, flags: 1 });
  expect(buildEntity('INSERT', [41, '2', 42, '3'])).toMatchObject({ xscale: 2, yscale: 3 });
});

test('explode는 MLINE 요소마다 정점+마이터×첫 파라미터를 이어 선분을 내고, 그 선분으로 벽·방이 선다', () => {
  const doc = { blocks: new Map(), entities: [buildEntity('MLINE', MLINE_PAIRS)] };
  const ex = explode(doc);
  expect(ex.segs).toHaveLength(8);
  expect(ex.segs.every(s => s.src === 'MLINE' && s.layer === 'WAL')).toBe(true);
  const xs = ex.segs.flatMap(s => [s.a[0], s.b[0]]), ys = ex.segs.flatMap(s => [s.a[1], s.b[1]]);
  expect(Math.min(...xs)).toBeCloseTo(-100, 6); expect(Math.max(...xs)).toBeCloseTo(9100, 6);
  expect(Math.min(...ys)).toBeCloseTo(-100, 6); expect(Math.max(...ys)).toBeCloseTo(6100, 6);
  expect(ex.others.has('MLINE')).toBe(false);
  const r = extractWalls(ex, { wallLayers: new Set(['WAL']), thickness: 200 });
  const { stats } = buildProject(r.walls, { height: 3500 });
  expect(stats.walls).toBe(4);
  expect(stats.rooms).toBe(1);
  expect(stats.thickness[0][0]).toBe(200);
  // 열린(flags 1) 세 정점 MLINE은 요소마다 선분 둘 = 4개. 요소 0개·정점 1개는 건너뛰고 센다.
  const open = buildEntity('MLINE', MLINE_PAIRS.map((v, i) => (MLINE_PAIRS[i - 1] === 71 ? '1' : v)));
  open.verts = open.verts.slice(0, 3); open.miters = open.miters.slice(0, 3); open.params = open.params.slice(0, 3);
  expect(explode({ blocks: new Map(), entities: [open] }).segs).toHaveLength(4);
  const empty = explode({ blocks: new Map(), entities: [buildEntity('MLINE', [8, 'WAL', 73, '2', 11, '0', 21, '0'])] });
  expect(empty.segs).toHaveLength(0);
  expect(empty.skipped.get('mline-empty')).toBe(1);
});
