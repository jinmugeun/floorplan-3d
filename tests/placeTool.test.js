import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { createPlaceTool } from '../src/view2d/tools/placeTool.js';

const fakeView = { camera: { scale: 0.1 } };
function setup(productId) {
  const store = createStore(createEmptyProject()), ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  let done = 0;
  const t = createPlaceTool({ store, ui, view: fakeView, product: productById(productId), onDone: () => { done += 1; } });
  return { store, ui, t, floor: () => activeFloor(store.get()), done: () => done };
}

describe('배치 도구', () => {
  test('안내 문구에 제품 이름이 들어간다', () => {
    const { t } = setup('sofa-3');
    expect(t.hint).toBe('3인 소파을(를) 배치할 위치를 클릭해주세요. 메시지를 누르거나 [Esc]를 누르면 취소됩니다.');
    expect(t.name).toBe('place');
  });

  test('고스트가 커서를 따라오고 벽면에 스냅한다', () => {
    const { t } = setup('sofa-3');
    t.onPointerMove([2000, 1500], {});
    expect(t.getGhost().item.pos).toEqual([2000, 1500]);
    t.onPointerMove([2000, 560], {});
    expect(t.getGhost().item.pos[1]).toBeCloseTo(550); // 깊이 900 → 위 모서리가 벽 안쪽 면 100에 붙는다
    expect(t.getGhost().guides).toEqual([{ type: 'h', y: 100 }]);
  });

  test('Ctrl을 누르면 스냅하지 않는다', () => {
    const { t } = setup('sofa-3');
    t.onPointerMove([2000, 560], { ctrlKey: true });
    expect(t.getGhost().item.pos).toEqual([2000, 560]);
    expect(t.getGhost().guides).toEqual([]);
  });

  test('클릭하면 아이템이 들어가고 선택된 뒤 선택 도구로 돌아간다', () => {
    const { store, ui, t, floor, done } = setup('sofa-3');
    t.onPointerMove([2000, 1500], {});
    t.onPointerDown([2000, 1500], {});
    t.onPointerUp([2000, 1500], {});
    expect(floor().items).toHaveLength(1);
    expect(ui.get().selection).toEqual({ type: 'item', id: floor().items[0].id });
    expect(done()).toBe(1);
    store.undo();
    expect(floor().items).toHaveLength(0);
  });

  test('벽 부착 제품은 300mm 안의 가장 가까운 벽에 붙는다', () => {
    const { t, floor } = setup('door-swing-900');
    const top = floor().walls.find(w => w.a[1] === 0 && w.b[1] === 0);
    t.onPointerMove([1200.5, 120], {});
    const g = t.getGhost().item;
    expect(g.wallId).toBe(top.id);
    expect(g.rot).toBe(0);
    expect(g.pos[1]).toBe(0);            // 문은 벽 두께 안에 박힌다(embed)
    expect(g.t).toBeCloseTo(1200.5 / 4000);
    expect(g.side).toBe(1);
  });

  test('아래쪽 벽의 문은 방 안을 보고, 벽 반대쪽에서 놓으면 side -1로 180° 돌아간다', () => {
    const { t, floor } = setup('door-swing-900');
    // rectWalls는 시계 방향이라 아래쪽 벽은 a = [4000, 3000] → b = [0, 3000](벽 각도 180°)
    const bottom = floor().walls.find(w => w.a[1] === 3000 && w.b[1] === 3000);
    t.onPointerMove([1200.5, 2880], {});      // 방 안쪽
    const inside = t.getGhost().item;
    expect(inside.wallId).toBe(bottom.id);
    expect(inside.side).toBe(1);
    expect(inside.rot).toBe(180);             // 벽 방향 그대로 — 열림 방향이 방 안쪽을 본다
    t.onPointerMove([1200.5, 3120], {});      // 방 밖에서 같은 벽에 붙이면 반대편
    const outside = t.getGhost().item;
    expect(outside.wallId).toBe(bottom.id);
    expect(outside.side).toBe(-1);
    expect(outside.rot).toBe(0);              // side -1이면 180°를 더해 뒷면이 벽을 본다
  });

  test('벽 끝에 가까우면 아이템 절반만큼 벽 안으로 미끄러진다', () => {
    const { t } = setup('door-double-1800');   // 폭 1800 → 절반 900
    t.onPointerMove([700, 100], {});           // 왼쪽 벽까지는 600mm라 위쪽 벽이 이긴다
    const g = t.getGhost().item;
    expect(g.pos[0]).toBeCloseTo(900);
    expect(g.t).toBeCloseTo(0.225);
  });

  test('벽에서 먼 곳을 클릭한 벽 부착 제품은 벽 없이 놓인다', () => {
    const { t } = setup('hood-wall');
    t.onPointerMove([2000, 1500], {});
    expect(t.getGhost().item.wallId).toBeNull();
    expect(t.getGhost().item.z).toBe(1500); // 카탈로그의 바닥으로부터 높이
  });

  test('천장 부착 제품은 층 높이에서 제품 높이를 뺀 z로 매달린다', () => {
    const { t, floor } = setup('light-pendant');
    t.onPointerMove([2000, 1500], {});
    expect(t.getGhost().item.z).toBe(floor().height - 600);
    expect(t.getGhost().guides).toEqual([]);
  });

  test('Esc와 안내 문구 클릭이 배치를 취소한다', () => {
    const { t, floor, done } = setup('sofa-3');
    expect(t.onKey({ key: 'Escape' })).toBe(true);
    t.onHintClick();
    expect(done()).toBe(2);
    expect(floor().items).toHaveLength(0);
  });
});
