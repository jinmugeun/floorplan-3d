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
    const del = deletePoint(d, 1);
    expect(del.points).toEqual([[0, 0], [3000, 4000]]);
    expect(del.segments).toHaveLength(1);
    expect(del.connections[0].point).toBe(1);
    expect(del.dampers).toEqual([]);                                // 사라진 구간의 댐퍼도 사라진다
    expect(deletePoint(normalizeDuct({ points: [[0, 0], [1, 0]] }), 0)).toBeNull();
  });

  test('설비 스냅은 가장 가까운 보이는 설비를 잡는다', () => {
    const items = [
      { id: 'h1', kind: 'equipment', pos: [1000.5, 500.25], size: [1600, 1200, 600], z: 2300 },
      { id: 'h2', kind: 'equipment', pos: [1200, 500], size: [600, 600, 100], z: 2800, hidden: true },
      { id: 'p1', kind: 'product', pos: [1010, 500] },
    ];
    expect(snapToEquipment(items, [1100, 520])).toEqual({ itemId: 'h1', pos: [1000.5, 500.25] });
    expect(snapToEquipment(items, [9000, 9000])).toBeNull();
    expect(snapToEquipment(items, [1000.5 + DUCT_SNAP_TOL + 1, 500.25])).toBeNull();
    expect(connectionPoint(items[0])).toEqual([1000.5, 500.25]);
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
