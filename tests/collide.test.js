import { describe, test, expect } from 'vitest';
import { obbOverlap, collidingIds } from '../src/geom/collide.js';
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
