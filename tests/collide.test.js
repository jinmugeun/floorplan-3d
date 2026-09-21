import { describe, test, expect } from 'vitest';
import { obbOverlap, collidingIds, memoCollisions } from '../src/geom/collide.js';
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
  });
});
