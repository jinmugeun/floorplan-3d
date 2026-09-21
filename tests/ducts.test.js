import { describe, test, expect } from 'vitest';
import { segmentQuad, ductPolygons, hitDuct, movePoint, insertPoint, deletePoint, ductLength, segmentLength, connectionPoint, snapToEquipment, riser, damperPos, DUCT_SNAP_TOL } from '../src/geom/ducts.js';
import { normalizeDuct } from '../src/state/ductSchema.js';

const mk = patch => normalizeDuct({ points: [[0, 0], [3000, 0], [3000, 4000]], segments: [{ w: 600, h: 400, z: 2650 }], ...patch });

describe('덕트 기하', () => {
  test('구간 사각형은 폭 w의 띠이고 길이 0이면 없다', () => {
    // perp([1,0]) = [0,1] → 첫 두 점이 +y 쪽이다(ducts2d의 라벨·핸들 위치가 이 순서를 전제한다)
    expect(segmentQuad([0, 0], [1000, 0], 400)).toEqual([[0, 200], [1000, 200], [1000, -200], [0, -200]]);
    expect(segmentQuad([0, 0], [0, 0], 400)).toBeNull();
    // 소수 좌표: 45°에 가까운 구간도 폭이 정확히 w다.
    const q = segmentQuad([0, 0], [100.5, 100.5], 200);
    expect(Math.hypot(q[0][0] - q[3][0], q[0][1] - q[3][1])).toBeCloseTo(200, 9);
  });

  test('길이는 구간 합이고 소수 좌표에서도 맞는다', () => {
    expect(ductLength(mk())).toBe(7000);
    expect(segmentLength(mk(), 1)).toBe(4000);
    const d = normalizeDuct({ points: [[0.5, 0.25], [3.5, 4.25]] });
    expect(ductLength(d)).toBeCloseTo(5, 9);
    expect(ductPolygons(mk())).toHaveLength(2);
  });

  test('히트는 꼭짓점이 구간보다 먼저다', () => {
    const ducts = [mk({ id: 'd1' })];
    expect(hitDuct(ducts, [3000, 0], 150)).toEqual({ ductId: 'd1', vertex: 1 });
    const seg = hitDuct(ducts, [1500.5, 100], 20);
    expect(seg.ductId).toBe('d1');
    expect(seg.segment).toBe(0);
    expect(seg.t).toBeCloseTo(0.50016, 4);
    expect(hitDuct(ducts, [1500, 900], 20)).toBeNull();   // 띠 밖(폭 600 → 반폭 300)
    expect(hitDuct([mk({ id: 'd1', hidden: true })], [3000, 0], 150)).toBeNull();
  });

  test('점 이동·삽입·삭제가 구간·연결·댐퍼 인덱스를 함께 옮긴다', () => {
    const d = normalizeDuct({
      points: [[0, 0], [3000, 0], [3000, 4000]], segments: [{ w: 600, h: 400, z: 2650 }, { w: 500, h: 300, z: 2700 }],
      connections: [{ point: 2, itemId: 'i9' }], dampers: [{ segment: 1, t: 0.4, type: 'VD' }],
    });
    expect(movePoint(d, 1, [3000.5, -500.25]).points[1]).toEqual([3000.5, -500.25]);
    const ins = insertPoint(d, 0, [1500, 0]);
    expect(ins.points).toHaveLength(4);
    expect(ins.segments).toHaveLength(3);
    expect(ins.segments[1]).toEqual({ w: 600, h: 400, z: 2650 });  // 나눈 구간의 단면을 복제
    expect(ins.connections[0].point).toBe(3);
    expect(ins.dampers[0].segment).toBe(2);
    expect(ins.dampers[0].t).toBeCloseTo(0.4, 9);                   // 쪼개지지 않은 구간은 t가 그대로다
    const del = deletePoint(d, 1);
    expect(del.points).toEqual([[0, 0], [3000, 4000]]);
    expect(del.segments).toHaveLength(1);
    expect(del.connections[0].point).toBe(1);
    // 안쪽 점을 지우면 구간 0·1이 합쳐진다(길이 3000·4000). 옛 구간 1(t=0.4)의 댐퍼는 사라지지 않고
    // 합쳐진 구간 0으로 옮아 t' = (L1 + t·L2)/(L1+L2) = (3000 + 0.4·4000)/7000이 된다.
    expect(del.dampers).toHaveLength(1);
    expect(del.dampers[0]).toMatchObject({ segment: 0, type: 'VD' });
    expect(del.dampers[0].t).toBeCloseTo((3000 + 0.4 * 4000) / 7000, 9);
    expect(deletePoint(normalizeDuct({ points: [[0, 0], [1, 0]] }), 0)).toBeNull();
  });

  test('점을 끼우면 쪼개진 구간의 댐퍼는 t가 다시 스케일되어 같은 mm 위치에 남는다', () => {
    const d = normalizeDuct({ points: [[0, 0], [1000.4, 0]], dampers: [{ segment: 0, t: 0.8, type: 'VD' }] });
    const before = damperPos(d, d.dampers[0]);
    const ins = insertPoint(d, 0, [500.2, 0]);   // 구간 중점에 끼운다(ts = 0.5)
    expect(ins.points).toEqual([[0, 0], [500.2, 0], [1000.4, 0]]);
    // t=0.8 > ts=0.5 → 오른쪽 조각(구간 1)으로 넘어가고 t' = (0.8-0.5)/(1-0.5) = 0.6
    expect(ins.dampers[0]).toMatchObject({ segment: 1, type: 'VD' });
    expect(ins.dampers[0].t).toBeCloseTo(0.6, 9);
    const after = damperPos(ins, ins.dampers[0]);
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);

    // 왼쪽 조각에 남는 경우: t=0.2 < ts=0.5 → 구간 0에 남고 t' = 0.2/0.5 = 0.4
    const d2 = normalizeDuct({ points: [[0, 0], [1000.4, 0]], dampers: [{ segment: 0, t: 0.2, type: 'VD' }] });
    const before2 = damperPos(d2, d2.dampers[0]);
    const ins2 = insertPoint(d2, 0, [500.2, 0]);
    expect(ins2.dampers[0]).toMatchObject({ segment: 0, type: 'VD' });
    expect(ins2.dampers[0].t).toBeCloseTo(0.4, 9);
    const after2 = damperPos(ins2, ins2.dampers[0]);
    expect(after2[0]).toBeCloseTo(before2[0], 9);
    expect(after2[1]).toBeCloseTo(before2[1], 9);
  });

  test('안쪽 점을 지우면 합쳐진 구간의 댐퍼는 t가 다시 스케일되어 같은 mm 위치에 남는다', () => {
    // 일직선 3점 덕트(소수 좌표): 점 1을 지우면 구간 0·1이 곧은 구간 하나로 합쳐진다.
    const d = normalizeDuct({
      points: [[0, 0], [1000.4, 0], [3000.6, 0]],
      dampers: [{ segment: 0, t: 0.5, type: 'VD' }, { segment: 1, t: 0.5, type: 'FVD' }],
    });
    const beforeA = damperPos(d, d.dampers[0]);
    const beforeB = damperPos(d, d.dampers[1]);
    const del = deletePoint(d, 1);
    expect(del.points).toEqual([[0, 0], [3000.6, 0]]);
    expect(del.dampers).toHaveLength(2);
    const afterA = damperPos(del, del.dampers.find(x => x.type === 'VD'));
    const afterB = damperPos(del, del.dampers.find(x => x.type === 'FVD'));
    expect(afterA[0]).toBeCloseTo(beforeA[0], 9);
    expect(afterB[0]).toBeCloseTo(beforeB[0], 9);
  });

  test('설비 스냅은 가장 가까운 보이는 설비를 잡는다', () => {
    const items = [
      { id: 'h1', kind: 'equipment', pos: [1000.5, 500.25], size: [1600, 1200, 600], z: 2300 },
      { id: 'h2', kind: 'equipment', pos: [1200, 500], size: [600, 600, 100], z: 2800, hidden: true },
      { id: 'p1', kind: 'product', pos: [1010, 500] },
    ];
    expect(snapToEquipment(items, [1100, 520])).toEqual({ itemId: 'h1', pos: [1000.5, 500.25] });
    expect(snapToEquipment(items, [9000, 9000])).toBeNull();
    // h1 풋프린트(반폭 800×반깊이 600) 밖이면서 중심에서 tol도 넘는 점 — 어느 쪽으로도 스냅하지 않는다.
    expect(snapToEquipment(items, [1000.5, 500.25 + 600 + DUCT_SNAP_TOL + 1])).toBeNull();
    expect(connectionPoint(items[0])).toEqual([1000.5, 500.25]);
  });

  test('설비 스냅은 풋프린트 안이면 중심에서 멀어도 잡는다(DT-02 "설비 위를 클릭")', () => {
    // 1800×1100 후드(소수 좌표 중심): 반폭 900, 반깊이 550 — DUCT_SNAP_TOL(300)보다 훨씬 크다.
    const hood = { id: 'h1', kind: 'equipment', pos: [1000.5, 500.25], size: [1800, 1100, 600], z: 2300 };
    const items = [hood];
    // 중심에서 800 mm(> tol) 떨어졌지만 풋프린트(반폭 900) 안이므로 스냅한다.
    const inside = [hood.pos[0] + 800, hood.pos[1]];
    expect(snapToEquipment(items, inside)).toEqual({ itemId: 'h1', pos: [1000.5, 500.25] });
    // 풋프린트 가장자리(반폭 900)에서 350 mm 더 나간 점은 풋프린트 밖이고 tol도 넘으므로 스냅하지 않는다.
    const outside = [hood.pos[0] + 900 + 350, hood.pos[1]];
    expect(snapToEquipment(items, outside)).toBeNull();
    // 설비가 없는 자리는 null이다.
    expect(snapToEquipment(items, [9000, 9000])).toBeNull();
  });

  test('라이저는 설비 윗면과 구간 아랫면을 잇고 너무 짧으면 없다', () => {
    const duct = normalizeDuct({ points: [[1000, 500], [4000, 500]], segments: [{ w: 750, h: 400, z: 2650 }] });
    const fan = { id: 'f1', kind: 'equipment', pos: [1000, 500], size: [700, 700, 700], z: 0 };
    expect(riser(fan, duct, { point: 0, itemId: 'f1' })).toEqual({ pos: [1000, 500], z0: 700, z1: 2450, w: 400, h: 400 });
    const hood = { id: 'h1', kind: 'equipment', pos: [1000, 500], size: [1600, 1200, 600], z: 2300 };
    // 후드 윗면 2900이 구간 아랫면 2450보다 위다: 작은 쪽에서 큰 쪽으로 잇는다.
    expect(riser(hood, duct, { point: 0, itemId: 'h1' })).toEqual({ pos: [1000, 500], z0: 2450, z1: 2900, w: 400, h: 400 });
    // 윗면 2445가 구간 아랫면 2450에 거의 닿았다(5 mm): 라이저를 만들지 않는다.
    const flush = { id: 'x', kind: 'equipment', pos: [1000, 500], size: [600, 600, 100], z: 2345 };
    expect(riser(flush, duct, { point: 0, itemId: 'x' })).toBeNull();
  });

  test('댐퍼 위치는 구간 위의 t 지점이다', () => {
    const d = normalizeDuct({ points: [[0, 0], [1000.5, 0]], dampers: [{ segment: 0, t: 0.25, type: 'VD' }] });
    expect(damperPos(d, d.dampers[0])).toEqual([250.125, 0]);
    expect(damperPos(d, { segment: 7, t: 0.5 })).toBeNull();
  });
});
