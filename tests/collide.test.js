import { describe, test, expect } from 'vitest';
import { obbOverlap, collidingIds, memoCollisions, collidingFor } from '../src/geom/collide.js';
import { createItem } from '../src/state/schema.js';
import { productById } from '../src/products/catalog.js';

const mk = (id, patch) => createItem(productById(id), patch);

describe('충돌 감지', () => {
  test('겹치면 참, 맞닿기만 하면 거짓(소수 좌표)', () => {
    const a = mk('dining-4', { pos: [0, 0] });            // 1200×800
    expect(obbOverlap(a, mk('dining-4', { pos: [1198, 0] }))).toBe(true);
    expect(obbOverlap(a, mk('dining-4', { pos: [1200, 0] }))).toBe(false);
    expect(obbOverlap(a, mk('dining-4', { pos: [1200.5, 0] }))).toBe(false);
  });

  test('회전한 사각형도 분리축으로 판정한다', () => {
    const a = mk('dining-4', { pos: [0, 0], rot: 45 });
    expect(obbOverlap(a, mk('dining-4', { pos: [1000, 0], rot: 45 }))).toBe(true);
    expect(obbOverlap(a, mk('dining-4', { pos: [1600, 0], rot: 45 }))).toBe(false); // 깊이 축 투영이 분리된다
  });

  test('collidingIds는 겹친 쌍의 id를 모은다', () => {
    const a = mk('dining-4', { pos: [0, 0] }), b = mk('dining-4', { pos: [500, 0] }), c = mk('dining-4', { pos: [5000, 0] });
    const ids = collidingIds([a, b, c]);
    expect(ids.has(a.id)).toBe(true);
    expect(ids.has(b.id)).toBe(true);
    expect(ids.has(c.id)).toBe(false);
  });

  test('벽·천장 부착과 숨긴 아이템은 세지 않는다', () => {
    const wallItem = mk('hood-wall', { pos: [0, 0] }), lamp = mk('light-ceiling', { pos: [0, 0] });
    const hidden = mk('dining-4', { pos: [0, 0], hidden: true }), shown = mk('dining-4', { pos: [0, 0] });
    expect(collidingIds([wallItem, lamp, hidden, shown]).size).toBe(0);
  });

  test('높이 구간이 겹치지 않으면 충돌이 아니다(테이블 위 소품)', () => {
    const table = mk('dining-4', { pos: [0, 0] });                       // z 0, 높이 750
    const box = mk('storage-box', { pos: [0, 0], z: 750 });              // 테이블 위
    expect(collidingIds([table, box]).size).toBe(0);
    const under = mk('storage-box', { pos: [0, 0], z: 300 });
    expect(collidingIds([table, under]).size).toBe(2);
  });
});

describe('충돌 계산 캐시(memoCollisions)', () => {
  test('같은 배열 참조는 같은 Set을 그대로 돌려준다(§13.5)', () => {
    const items = [mk('dining-4', { pos: [0.5, 0.25] }), mk('dining-4', { pos: [500.5, 0.25] }), mk('dining-4', { pos: [9000, 0] })];
    const first = memoCollisions(items);
    expect([...first].sort()).toEqual([items[0].id, items[1].id].sort());
    expect(memoCollisions(items)).toBe(first);          // 두 번째 호출은 계산하지 않는다(같은 객체)
    // 값은 collidingIds와 똑같다.
    expect([...memoCollisions(items)].sort()).toEqual([...collidingIds(items)].sort());
  });

  test('배열이 새로 만들어지면 다시 계산한다(드래그 중 updateItems가 매번 새 배열을 만든다)', () => {
    const a = mk('dining-4', { pos: [0, 0] }), b = mk('dining-4', { pos: [500, 0] });
    const before = memoCollisions([a, b]);
    const moved = [a, { ...b, pos: [9000, 0] }];        // 새 배열 + 멀리 옮긴 사본
    const after = memoCollisions(moved);
    expect(after).not.toBe(before);
    expect([...after]).toEqual([]);
  });

  test('tol이 다르면 같은 배열이어도 다시 계산하고, null·undefined도 안전하다', () => {
    const items = [mk('dining-4', { pos: [0, 0] }), mk('dining-4', { pos: [1196.5, 0] })];
    const tight = memoCollisions(items, { tol: 1 });
    expect(tight.size).toBe(2);
    const loose = memoCollisions(items, { tol: 5 });    // 겹침 3.5 mm는 tol 5에서 "맞닿았다"
    expect(loose).not.toBe(tight);
    expect(loose.size).toBe(0);
    expect(memoCollisions(items, { tol: 1 })).toBe(tight); // 원래 tol로 돌아오면 캐시가 그대로 있다
    expect([...memoCollisions(null)]).toEqual([]);
    expect([...memoCollisions(undefined)]).toEqual([]);
    expect([...memoCollisions({})]).toEqual([]);        // 배열이 아닌 객체도 던지지 않는다(M-2)
  });
});

// 계획 13 Task 5 · 사전 검토 I-5(2026-10-12): collidingIds에 넓은 단계(AABB · x 정렬 훑기)를 넣었다 — 쌍마다
// itemCorners·SAT를 돌던 N²가 아이템 330개(가져온 기구)에서 50~65 ms였다. 좁은 단계(obbOverlap)는 그대로이고,
// 결과는 옛 전수 비교와 **같은 Set**이어야 한다. 기준은 옛 구현을 그대로 옮긴 것이다(규칙: 바닥 부착 · 숨김 제외 · 높이 구간).
describe('collidingIds 넓은 단계(AABB 선거름)', () => {
  const FLOOR = new Set(['floor', 'floorLay']);
  function bruteIds(items, tol = 1) {   // 2026-10-12 이전 collidingIds 그대로
    const list = items.filter(i => !!i && !i.hidden && FLOOR.has(i.attach));
    const out = new Set();
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.z >= b.z + b.size[2] - tol || b.z >= a.z + a.size[2] - tol) continue;
      if (obbOverlap(a, b, tol)) { out.add(a.id); out.add(b.id); }
    }
    return out;
  }
  // 고정 씨앗 난수(mulberry32) — 실행마다 같은 배치.
  const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const randomItems = (seed, n, span) => {
    const r = rng(seed), pick = a => a[Math.floor(r() * a.length)];
    return Array.from({ length: n }, (_, i) => {
      // 격자에 맞춘 자리·크기를 섞는다: 맞닿음(겹침 0)·tol 경계(겹침 1 mm)가 실제로 나오게.
      const snap = r() < 0.4, size = [snap ? 100 * (3 + Math.floor(r() * 15)) : 300 + r() * 1700.5, snap ? 100 * (3 + Math.floor(r() * 10)) : 300 + r() * 1200.25, 300 + r() * 1500];
      const pos = snap ? [100 * Math.floor(r() * span / 100) + (r() < 0.2 ? 1 : 0), 100 * Math.floor(r() * span * 0.6 / 100)] : [r() * span, r() * span * 0.6];
      return mk('dining-4', {
        id: `r${seed}_${i}`, pos, size, z: r() < 0.15 ? 750 + r() * 300 : 0,
        rot: pick([0, 0, 0, 90, 180, 270, 37.5, 45, 77.1, -87.4, r() * 360]),
        attach: pick(['floor', 'floor', 'floor', 'floor', 'floorLay', 'wall', 'ceiling']), hidden: r() < 0.05,
      });
    });
  };
  const sorted = s => [...s].sort();

  test('무작위 200개(고정 씨앗 · 촘촘·성김 · 회전 섞임)에서 옛 전수 비교와 같은 Set이다', () => {
    let hits = 0;
    for (const [seed, span] of [[1, 8000], [7, 15000], [42, 30000], [2026, 6000], [1012, 45000]]) {
      const items = randomItems(seed, 200, span);
      for (const tol of [1, 5, 0]) {
        const want = bruteIds(items, tol);
        expect(sorted(collidingIds(items, { tol }))).toEqual(sorted(want));
        hits += want.size;
      }
    }
    expect(hits).toBeGreaterThan(500);                           // 표본이 실제로 충돌을 많이 담는다(빈 비교가 아니다)
  });

  test('맞닿음·tol 경계·같은 자리·크기 0에 가까운 것도 같다', () => {
    const items = [
      mk('dining-4', { id: 'a', pos: [0, 0] }), mk('dining-4', { id: 'b', pos: [1200, 0] }),          // 맞닿음(x)
      mk('dining-4', { id: 'c', pos: [0, 800] }), mk('dining-4', { id: 'd', pos: [1199, 800] }),      // 겹침 1 mm = tol(충돌 아님)
      mk('dining-4', { id: 'e', pos: [0, 1600] }), mk('dining-4', { id: 'f', pos: [1198.5, 1600] }),  // 겹침 1.5 mm
      mk('dining-4', { id: 'g', pos: [5000, 5000] }), mk('dining-4', { id: 'h', pos: [5000, 5000] }), // 같은 자리
      // 45° 둘: 상자(AABB)는 크게 겹치지만 깊이 축 겹침 800 − 1131/√2 = 0.26 mm ≤ tol → 충돌 아님(좁은 단계가 정한다).
      mk('dining-4', { id: 'i', pos: [9000, 0], rot: 45 }), mk('dining-4', { id: 'j', pos: [9000 + 1131, 0], rot: 45 }),
      mk('dining-4', { id: 'k', pos: [14000, 0], rot: 45 }), mk('dining-4', { id: 'l', pos: [14000 + 1100, 0], rot: 45 }),   // 22 mm 겹침
    ];
    expect(sorted(collidingIds(items))).toEqual(sorted(bruteIds(items)));
    expect(sorted(collidingIds(items))).toEqual(['e', 'f', 'g', 'h', 'k', 'l']);
  });

  test('축 정렬 330개(사동중 가져오기 크기)는 50 ms 안에 끝난다', () => {
    const p = productById('dining-6');
    const spread = Array.from({ length: 330 }, (_, i) => mk('dining-6', { pos: [(i * 7919) % 45000, (i * 104729) % 30000], size: [900, 600, 850] }));
    const grid = Array.from({ length: 330 }, (_, i) => createItem(p, { pos: [(i % 30) * 1500, Math.floor(i / 30) * 1400], size: [1800, 1326, 750], rot: 90 }));
    for (const items of [spread, grid]) {
      collidingIds(items);                                       // 데우기(JIT)
      let best = Infinity;
      for (let k = 0; k < 3; k++) { const t = performance.now(); collidingIds(items); best = Math.min(best, performance.now() - t); }
      expect(best).toBeLessThan(50);                             // 옛 전수 비교: 50~65 ms(사전 검토 실측) — 지금은 수 ms
    }
    expect(collidingIds(grid).size).toBe(330);                   // 격자는 이웃과 다 겹친다(결과도 그대로)
  });
});

// §15.2: 드래그 중에는 전체 N² SAT를 돌지 않는다 — 끌고 있는 것만 나머지와 비교한다.
describe('collidingFor(드래그 대상 기준)', () => {
  test('끌고 있는 것과 겹치는 쌍만 모은다(소수 좌표)', () => {
    const a = mk('dining-4', { pos: [0.5, 0.25] }), b = mk('dining-4', { pos: [500.5, 0.25] }), c = mk('dining-4', { pos: [5000, 0] });
    const all = [a, b, c];
    const hit = collidingFor(all, [a.id]);
    expect([...hit].sort()).toEqual([a.id, b.id].sort());
    expect(collidingFor(all, [c.id]).size).toBe(0);
    expect(collidingFor(all, []).size).toBe(0);
    expect(collidingFor(all, ['없는id']).size).toBe(0);
  });

  test('프리뷰 자리로 판정한다(스토어는 아직 옛 자리다)', () => {
    const a = mk('dining-4', { pos: [0, 0] }), b = mk('dining-4', { pos: [5000, 0] });
    const all = [a, b];
    expect(collidingFor(all, [a.id]).size).toBe(0);
    const preview = new Map([[a.id, { ...a, pos: [4800.5, 0.25] }]]);
    expect([...collidingFor(all, [a.id], preview)].sort()).toEqual([a.id, b.id].sort());
    // 프리뷰가 상대에게도 적용된다: 둘이 같이 움직이면 서로 겹치지 않는다.
    const together = new Map([[a.id, { ...a, pos: [4800, 0] }], [b.id, { ...b, pos: [9800, 0] }]]);
    expect(collidingFor(all, [a.id, b.id], together).size).toBe(0);
  });

  test('벽·천장 부착·숨김·높이 규칙은 collidingIds와 같다', () => {
    const table = mk('dining-4', { pos: [0, 0] });
    const wallItem = mk('hood-wall', { pos: [0, 0] });
    const hidden = mk('dining-4', { pos: [0, 0], hidden: true });
    const box = mk('storage-box', { pos: [0, 0], z: 750 });
    expect(collidingFor([table, wallItem, hidden, box], [table.id]).size).toBe(0);
    const under = mk('storage-box', { pos: [0, 0], z: 300 });
    expect(collidingFor([table, under], [under.id]).size).toBe(2);
  });
});
