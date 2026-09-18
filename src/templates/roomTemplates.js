// 방 템플릿(순수 데이터 + 순수 배치 계산). at은 방 안쪽 폴리곤 bbox 안의 비율 0~1이다.
// roomType은 propsPanel의 ROOM_TYPES 값과 같다(none/cook/prep/cold/wash/dining/storage/office/etc).
import { activeFloor, createItem } from '../state/schema.js';
import { productById } from '../products/catalog.js';
import { roomInnerPolygon, pointInPolygon } from '../geom/rooms.js';
import { nearestWallPlacement } from '../geom/items.js';
import { reattach } from '../state/floorInternal.js';

const T = (id, name, roomType, use, minArea, maxArea, budget, items) => ({ id, name, roomType, use, minArea, maxArea, budget, items });
const I = (productId, at, rot = 0) => ({ productId, at, rot });

export const ROOM_TEMPLATES = [
  T('cook-basic', '가열조리 기본', 'cook', '상업', 8, 30, 6000000, [
    I('range-gas-6', [0.25, 0.22]), I('worktable-1800', [0.62, 0.22]), I('hood-wall', [0.25, 0.06]),
    I('sink-single', [0.82, 0.78], 180), I('shelf-steel-4', [0.12, 0.8]),
  ]),
  T('cook-large', '가열조리 대형', 'cook', '상업', 25, 90, 12000000, [
    I('range-gas-6', [0.2, 0.2]), I('range-gas-6', [0.45, 0.2]), I('worktable-1800', [0.72, 0.2]),
    I('hood-wall', [0.32, 0.06]), I('sink-double', [0.78, 0.8], 180), I('shelf-steel-4', [0.12, 0.8]), I('light-fluorescent', [0.5, 0.5]),
  ]),
  T('prep-basic', '전처리 기본', 'prep', '상업', 6, 20, 4000000, [
    I('worktable-1800', [0.3, 0.3]), I('sink-double', [0.75, 0.25]), I('shelf-steel-4', [0.2, 0.85]), I('fridge-2door', [0.85, 0.8], 180),
  ]),
  T('prep-large', '전처리 확장', 'prep', '상업', 18, 60, 8000000, [
    I('worktable-1800', [0.28, 0.28]), I('worktable-1800', [0.28, 0.6]), I('sink-double', [0.72, 0.25]),
    I('fridge-2door', [0.85, 0.75], 180), I('fridge-kimchi', [0.6, 0.85]), I('shelf-steel-4', [0.12, 0.85]),
  ]),
  T('cold-basic', '비가열조리 기본', 'cold', '상업', 6, 20, 3500000, [
    I('worktable-1800', [0.35, 0.3]), I('sink-single', [0.8, 0.3]), I('fridge-2door', [0.15, 0.8], 180), I('shelf-steel-4', [0.6, 0.85]),
  ]),
  T('cold-large', '비가열조리 확장', 'cold', '상업', 15, 50, 7000000, [
    I('worktable-1800', [0.3, 0.25]), I('worktable-1800', [0.3, 0.6]), I('sink-single', [0.78, 0.28]),
    I('fridge-2door', [0.85, 0.7], 180), I('fridge-kimchi', [0.6, 0.85]), I('storage-box', [0.12, 0.85]),
  ]),
  T('wash-basic', '식기세척 기본', 'wash', '상업', 6, 20, 5000000, [
    I('sink-double', [0.3, 0.3]), I('dishwasher', [0.65, 0.3]), I('shelf-steel-4', [0.2, 0.85]), I('worktable-1800', [0.7, 0.8], 180),
  ]),
  T('wash-large', '식기세척 확장', 'wash', '상업', 15, 50, 9000000, [
    I('sink-double', [0.25, 0.28]), I('sink-double', [0.55, 0.28]), I('dishwasher', [0.82, 0.3]),
    I('shelf-steel-4', [0.2, 0.85]), I('shelf-steel-4', [0.6, 0.85]),
  ]),
  T('dining-basic', '식당 4인', 'dining', '상업', 8, 25, 1500000, [
    I('dining-4', [0.5, 0.5]), I('chair-dining', [0.5, 0.28]), I('chair-dining', [0.5, 0.72], 180),
    I('chair-dining', [0.34, 0.5], 90), I('chair-dining', [0.66, 0.5], 270), I('light-pendant', [0.5, 0.5]),
  ]),
  T('dining-hall', '단체 식당 24석', 'dining', '상업', 30, 120, 6000000, [
    I('dining-6', [0.25, 0.25]), I('dining-6', [0.25, 0.65]), I('dining-6', [0.7, 0.25]), I('dining-6', [0.7, 0.65]),
    I('chair-dining', [0.25, 0.12]), I('chair-dining', [0.25, 0.42], 180), I('chair-dining', [0.7, 0.12]), I('chair-dining', [0.7, 0.42], 180),
    I('light-fluorescent', [0.35, 0.5]), I('light-fluorescent', [0.65, 0.5]),
  ]),
  T('storage-shelf', '창고 선반', 'storage', '상업', 4, 30, 900000, [
    I('shelf-steel-4', [0.15, 0.2]), I('shelf-steel-4', [0.45, 0.2]), I('shelf-steel-4', [0.75, 0.2]),
    I('storage-box', [0.3, 0.8]), I('storage-box', [0.6, 0.8]),
  ]),
  T('storage-cold', '냉장 창고', 'storage', '상업', 4, 20, 3000000, [
    I('fridge-2door', [0.2, 0.22]), I('fridge-2door', [0.5, 0.22]), I('fridge-kimchi', [0.78, 0.22]), I('shelf-steel-4', [0.4, 0.82]),
  ]),
  T('office-1p', '1인 사무실', 'office', '주거', 4, 15, 1200000, [
    I('desk-1400', [0.35, 0.28]), I('chair-office', [0.35, 0.48], 180), I('bookshelf', [0.82, 0.22]), I('light-ceiling', [0.5, 0.5]),
  ]),
  T('office-4p', '4인 사무실', 'office', '상업', 15, 60, 4500000, [
    I('desk-1400', [0.28, 0.25]), I('desk-1400', [0.28, 0.62]), I('desk-1400', [0.72, 0.25]), I('desk-1400', [0.72, 0.62]),
    I('chair-office', [0.28, 0.42], 180), I('chair-office', [0.72, 0.42], 180), I('bookshelf', [0.5, 0.85]), I('light-fluorescent', [0.5, 0.5]),
  ]),
  T('etc-restroom', '화장실', 'etc', '상업', 2, 15, 2500000, [
    I('toilet', [0.25, 0.3]), I('washbasin', [0.72, 0.08]), I('mirror-wall', [0.72, 0.04]), I('shower-booth', [0.75, 0.75]),
  ]),
  T('studio-basic', '원룸 기본', 'none', '주거', 12, 40, 3000000, [
    I('bed-queen', [0.3, 0.3]), I('wardrobe-1200', [0.8, 0.2], 180), I('desk-1400', [0.3, 0.8]),
    I('chair-office', [0.3, 0.65]), I('light-ceiling', [0.5, 0.5]),
  ]),
];

export const templateById = id => ROOM_TEMPLATES.find(t => t.id === id) ?? null;

// 면적 범위는 "겹치면 통과"로 본다(템플릿의 범위와 사용자가 준 범위가 겹치는지).
export function filterTemplates(list, { roomType = null, use = null, minArea = null, maxArea = null, budget = null } = {}) {
  return list.filter(t => (!roomType || t.roomType === roomType)
    && (!use || t.use === use)
    && (minArea === null || t.maxArea >= minArea)
    && (maxArea === null || t.minArea <= maxArea)
    && (budget === null || t.budget <= budget));
}

// 방 안쪽 폴리곤 안(또는 그 방 벽에 붙어) 있는 아이템. replace가 지울 대상을 고르는 데 쓴다.
export function itemsInRoom(floor, room) {
  const inner = roomInnerPolygon(room, floor.walls);
  const walls = new Set(room.wallIds);
  return (floor.items ?? []).filter(it => (it.attach === 'wall' && it.wallId ? walls.has(it.wallId) : pointInPolygon(it.pos, inner)));
}

export function placeTemplate(floor, room, template) {
  if (!room || !template) return [];
  const inner = roomInnerPolygon(room, floor.walls);
  const xs = inner.map(p => p[0]), ys = inner.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const span = Math.max(x1 - x0, y1 - y0);
  const roomWalls = floor.walls.filter(w => room.wallIds.includes(w.id));
  const out = [];
  for (const spec of template.items ?? []) {
    const p = productById(spec.productId);
    if (!p) continue;
    const pos = [x0 + (x1 - x0) * spec.at[0], y0 + (y1 - y0) * spec.at[1]];
    const patch = { pos: [Math.round(pos[0]), Math.round(pos[1])], rot: spec.rot ?? 0 };
    if (p.attach === 'wall') {
      const near = nearestWallPlacement(roomWalls, pos, p.size, span, { embed: false });
      if (!near) continue;                                   // 붙일 벽이 없으면 놓지 않는다
      Object.assign(patch, { wallId: near.wallId, t: near.t, side: near.side, pos: [Math.round(near.pos[0]), Math.round(near.pos[1])], rot: near.rot });
    } else if (!pointInPolygon(pos, inner)) continue;        // 방 밖으로 떨어지는 항목은 뺀다
    if (p.attach === 'ceiling') patch.z = Math.max(0, (room.height ?? 2300) - p.size[2]);
    out.push(createItem(p, patch));
  }
  return out;
}

// replace = true면 그 방 안 가구를 지우고 새로 놓는다(문·창·개구부는 건축 요소라 남긴다). 트랜잭션 1단계.
export function applyRoomTemplate(store, roomId, templateId, { replace = true } = {}) {
  const f = activeFloor(store.get());
  const room = f.rooms.find(r => r.id === roomId);
  const t = templateById(templateId);
  if (!room || !t) return [];
  const made = placeTemplate(f, room, t);
  const HOLES = ['door', 'window', 'opening'];
  // 문·창·개구부는 건축 요소라서, 잠긴 아이템은 사용자가 지키라고 한 것이라서 남긴다(2B의 잠금 규칙).
  const kill = replace ? new Set(itemsInRoom(f, room).filter(it => !HOLES.includes(it.kind) && !it.locked).map(it => it.id)) : new Set();
  store.dispatch(d => {
    const g = activeFloor(d);
    if (kill.size) {
      g.items = g.items.filter(i => !kill.has(i.id));
      g.groups = (g.groups ?? []).map(gr => ({ ...gr, itemIds: gr.itemIds.filter(x => !kill.has(x)) })).filter(gr => gr.itemIds.length > 1);
    }
    g.items.push(...made.map(m => structuredClone(m)));
    reattach(g);   // 벽 부착 제품(후드·거울·TV)의 pos·rot을 (wallId, t)에서 다시 만든다(floorInternal.js의 불변식)
  });
  return made.map(m => m.id);
}
