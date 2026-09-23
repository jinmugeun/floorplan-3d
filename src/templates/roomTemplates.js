// 방 템플릿(순수 데이터 + 순수 배치 계산).
// at     = 방 안쪽 폴리곤 bbox 안의 비율 0~1. 방이 커지면 함께 벌어지는 "자리"다.
// offset = 그 자리에서 mm로 재는 절대 거리. 방 크기와 무관하게 붙어 있어야 하는 "묶음"에 쓴다
//          (식탁-의자, 조리대 줄). 제품 치수는 고정이라 비율만 쓰면 작은 방에서 반드시 파고든다.
// roomType은 propsPanel의 ROOM_TYPES 값과 같다(none/cook/prep/cold/wash/dining/storage/office/etc).
import { activeFloor, createItem } from '../state/schema.js';
import { productById } from '../products/catalog.js';
import { roomInnerPolygon, pointInPolygon } from '../geom/rooms.js';
import { nearestWallPlacement, itemCorners, isEmbed, WALL_ATTACH_DIST } from '../geom/items.js';
import { obbOverlap } from '../geom/collide.js';
import { add, sub, mul, dot, norm, len } from '../geom/vec.js';
import { reattach, seatCopies, pruneDuctConnections } from '../state/floorInternal.js';

const T = (id, name, roomType, use, minArea, maxArea, budget, items) => ({ id, name, roomType, use, minArea, maxArea, budget, items });
const I = (productId, at, rot = 0, offset = [0, 0]) => ({ productId, at, rot, offset });
// rot 규약(바닥 제품): 0 = 북쪽 벽에 등, 90 = 동쪽 벽에 등, 180 = 남쪽, 270 = 서쪽.
// 같은 제품을 격자로 깔 때(교실 책상 20개). cols × rowsN 개를 at 자리 중심으로 pitch mm 간격으로 둔다.
// 같은 규칙을 스무 번 적지 않으려는 것이고, 만들어지는 항목은 I(...)와 똑같은 모양이다.
const grid = (productId, at, cols, rowsN, pitchX, pitchY, rot = 0) => {
  const out = [];
  for (let r = 0; r < rowsN; r++) {
    for (let c = 0; c < cols; c++) out.push(I(productId, at, rot, [(c - (cols - 1) / 2) * pitchX, (r - (rowsN - 1) / 2) * pitchY]));
  }
  return out;
};

export const ROOM_TEMPLATES = [
  T('cook-basic', '가열조리 기본', 'cook', '상업', 8, 30, 6000000, [
    I('range-gas-6', [0.2, 0.2]), I('worktable-1800', [0.2, 0.2], 0, [1550, 0]), I('hood-wall', [0.2, 0.05]),
    I('sink-single', [0.8, 0.82], 180), I('shelf-steel-4', [0.2, 0.85], 180),
  ]),
  T('cook-large', '가열조리 대형', 'cook', '상업', 25, 90, 12000000, [
    I('range-gas-6', [0.18, 0.18]), I('range-gas-6', [0.18, 0.18], 0, [1250, 0]), I('worktable-1800', [0.18, 0.18], 0, [3350, 0]),
    I('hood-wall', [0.18, 0.05]), I('sink-double', [0.75, 0.85], 180), I('shelf-steel-4', [0.2, 0.85], 180), I('light-fluorescent', [0.5, 0.5]),
  ]),
  T('prep-basic', '전처리 기본', 'prep', '상업', 8, 20, 4000000, [
    I('worktable-1800', [0.5, 0.18]), I('sink-double', [0.5, 0.82], 180), I('shelf-steel-4', [0.08, 0.5], 270), I('fridge-2door', [0.92, 0.5], 90),
  ]),
  T('prep-large', '전처리 확장', 'prep', '상업', 18, 60, 8000000, [
    I('worktable-1800', [0.3, 0.2]), I('worktable-1800', [0.3, 0.2], 0, [0, 1100]), I('sink-double', [0.75, 0.2]),
    I('fridge-2door', [0.9, 0.8], 180), I('fridge-kimchi', [0.55, 0.85], 180), I('shelf-steel-4', [0.15, 0.85], 180),
  ]),
  T('cold-basic', '비가열조리 기본', 'cold', '상업', 8, 20, 3500000, [
    I('worktable-1800', [0.42, 0.2]), I('sink-single', [0.35, 0.82], 180), I('fridge-2door', [0.9, 0.25], 90), I('shelf-steel-4', [0.78, 0.82], 180),
  ]),
  T('cold-large', '비가열조리 확장', 'cold', '상업', 15, 50, 7000000, [
    I('worktable-1800', [0.3, 0.2]), I('worktable-1800', [0.3, 0.2], 0, [0, 1100]), I('sink-single', [0.78, 0.2]),
    I('fridge-2door', [0.9, 0.8], 180), I('fridge-kimchi', [0.55, 0.85], 180), I('storage-box', [0.12, 0.88]),
  ]),
  T('wash-basic', '식기세척 기본', 'wash', '상업', 8, 20, 5000000, [
    I('sink-double', [0.45, 0.2]), I('dishwasher', [0.45, 0.2], 0, [1250, 0]), I('shelf-steel-4', [0.22, 0.85], 180), I('worktable-1800', [0.75, 0.85], 180),
  ]),
  T('wash-large', '식기세척 확장', 'wash', '상업', 15, 50, 9000000, [
    I('sink-double', [0.3, 0.2]), I('sink-double', [0.3, 0.2], 0, [1850, 0]), I('dishwasher', [0.85, 0.75]),
    I('shelf-steel-4', [0.2, 0.88], 180), I('shelf-steel-4', [0.2, 0.88], 180, [1250, 0]),
  ]),
  T('dining-basic', '식당 4인', 'dining', '상업', 8, 25, 1500000, [
    I('dining-4', [0.5, 0.5]), I('chair-dining', [0.5, 0.5], 0, [0, -700]), I('chair-dining', [0.5, 0.5], 180, [0, 700]),
    I('chair-dining', [0.5, 0.5], 270, [-900, 0]), I('chair-dining', [0.5, 0.5], 90, [900, 0]), I('light-pendant', [0.5, 0.5]),
  ]),
  T('dining-hall', '단체 식당 24석', 'dining', '상업', 30, 120, 6000000, [
    I('dining-6', [0.28, 0.3]), I('chair-dining', [0.28, 0.3], 0, [-450, -800]), I('chair-dining', [0.28, 0.3], 0, [450, -800]),
    I('dining-6', [0.72, 0.3]), I('chair-dining', [0.72, 0.3], 0, [-450, -800]), I('chair-dining', [0.72, 0.3], 0, [450, -800]),
    I('dining-6', [0.28, 0.75]), I('dining-6', [0.72, 0.75]), I('light-fluorescent', [0.35, 0.5]), I('light-fluorescent', [0.65, 0.5]),
  ]),
  T('storage-shelf', '창고 선반', 'storage', '상업', 6, 30, 900000, [
    I('shelf-steel-4', [0.22, 0.15]), I('shelf-steel-4', [0.22, 0.15], 0, [1300, 0]),
    I('shelf-steel-4', [0.22, 0.85], 180), I('storage-box', [0.22, 0.85], 180, [1300, 0]), I('storage-box', [0.22, 0.85], 180, [1900, 0]),
  ]),
  T('storage-cold', '냉장 창고', 'storage', '상업', 6, 20, 3000000, [
    I('fridge-2door', [0.25, 0.2]), I('fridge-2door', [0.25, 0.2], 0, [950, 0]), I('fridge-kimchi', [0.25, 0.2], 0, [1750, 0]), I('shelf-steel-4', [0.3, 0.85], 180),
  ]),
  T('office-1p', '1인 사무실', 'office', '주거', 4, 15, 1200000, [
    I('desk-1400', [0.5, 0.25]), I('chair-office', [0.5, 0.25], 180, [0, 700]), I('bookshelf', [0.88, 0.8], 180), I('light-ceiling', [0.5, 0.5]),
  ]),
  T('office-4p', '4인 사무실', 'office', '상업', 15, 60, 4500000, [
    I('desk-1400', [0.25, 0.22]), I('chair-office', [0.25, 0.22], 180, [0, 700]), I('desk-1400', [0.75, 0.22]), I('chair-office', [0.75, 0.22], 180, [0, 700]),
    I('desk-1400', [0.25, 0.78], 180), I('desk-1400', [0.75, 0.78], 180), I('bookshelf', [0.5, 0.95], 180), I('light-fluorescent', [0.5, 0.5]),
  ]),
  T('etc-restroom', '화장실', 'etc', '상업', 3, 15, 2500000, [
    I('toilet', [0.25, 0.3]), I('washbasin', [0.72, 0.06]), I('mirror-wall', [0.45, 0.04]), I('shower-booth', [0.78, 0.75]),
  ]),
  T('studio-basic', '원룸 기본', 'none', '주거', 12, 40, 3000000, [
    I('bed-queen', [0.25, 0.42]), I('wardrobe-1200', [0.85, 0.15]), I('desk-1400', [0.78, 0.8], 180),
    I('chair-office', [0.78, 0.8], 0, [0, -700]), I('light-ceiling', [0.5, 0.5]),
  ]),
  // 계획 5가 더한 6종(§13.9). 묶음은 offset(mm)으로 붙여 두고 at은 0.15~0.8 안에 둔다
  // (제품 치수는 고정이라 비율만 쓰면 작은 방에서 반드시 파고든다 — 2C와 같은 규칙).
  T('serve-line', '배식 라인', 'dining', '상업', 12, 60, 5000000, [
    I('serve-counter', [0.3, 0.3]), I('serve-counter', [0.3, 0.3], 0, [1850, 0]),
    I('warmer-cabinet', [0.3, 0.75], 180), I('warmer-cabinet', [0.3, 0.75], 180, [1000, 0]),
  ]),
  T('cafe-bar', '카페 바', 'dining', '상업', 12, 50, 8000000, [
    I('bar-counter', [0.5, 0.4]),
    I('coffee-machine', [0.5, 0.4], 0, [-1400, 800]),
    I('fridge-2door', [0.5, 0.4], 180, [1300, 800]),
    I('stool-round', [0.5, 0.4], 0, [-800, -650]), I('stool-round', [0.5, 0.4], 0, [0, -650]), I('stool-round', [0.5, 0.4], 0, [800, -650]),
  ]),
  T('laundry', '세탁실', 'etc', '주거', 6, 25, 2500000, [
    I('washer-drum', [0.3, 0.3]), I('dryer', [0.3, 0.3], 0, [700, 0]),
    I('shelf-steel-4', [0.3, 0.8], 180), I('storage-box', [0.8, 0.8], 180),
  ]),
  T('locker', '탈의·사물함', 'etc', '상업', 6, 30, 2000000, [
    I('locker-12', [0.3, 0.15]), I('locker-12', [0.3, 0.15], 0, [1000, 0]),
    I('bench-1200', [0.4, 0.6]), I('bench-1200', [0.4, 0.6], 0, [0, 500]),
  ]),
  T('meeting-8p', '회의실 8인', 'office', '상업', 15, 60, 5000000, [
    I('meeting-table-2400', [0.5, 0.5]),
    I('chair-office', [0.5, 0.5], 0, [-800, -1000]), I('chair-office', [0.5, 0.5], 0, [0, -1000]), I('chair-office', [0.5, 0.5], 0, [800, -1000]),
    I('chair-office', [0.5, 0.5], 180, [-800, 1000]), I('chair-office', [0.5, 0.5], 180, [0, 1000]), I('chair-office', [0.5, 0.5], 180, [800, 1000]),
    I('chair-office', [0.5, 0.5], 270, [-1800, 0]), I('chair-office', [0.5, 0.5], 90, [1800, 0]),
    I('light-fluorescent', [0.5, 0.5]),
  ]),
  T('class-20p', '교실 20인', 'office', '상업', 40, 120, 8000000, [
    ...grid('desk-student', [0.5, 0.55], 4, 5, 900, 900),
    I('lectern', [0.5, 0.55], 180, [0, -2700]),
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

// 이 방 벽에 붙은 아이템 중 "이 방 쪽을 보고 있는" 것만. 벽 제품의 pos는 side만큼 밀려 나 있어
// 자기 방 폴리곤(벽 중심선) 안에 들어온다 — 공유벽 반대쪽 이웃 방 가구는 여기서 걸러진다.
// 문·창·개구부는 벽 두께 안에 박혀 있어 양쪽 어디에도 들지 않으므로 wallId만 본다(건축 요소).
const facesRoom = (it, room, inner) => pointInPolygon(it.pos, inner) || pointInPolygon(it.pos, room.points);

// 방 안쪽 폴리곤 안(또는 그 방 벽에 이 방을 보고 붙어) 있는 아이템. replace가 지울 대상을 고르는 데 쓴다.
export function itemsInRoom(floor, room) {
  const inner = roomInnerPolygon(room, floor.walls);
  const walls = new Set(room.wallIds);
  return (floor.items ?? []).filter(it => (it.attach === 'wall' && it.wallId
    ? walls.has(it.wallId) && (isEmbed(it) || facesRoom(it, room, inner))
    : pointInPolygon(it.pos, inner)));
}

const FLOORISH = it => it.attach === 'floor' || it.attach === 'floorLay';
// 축 ax 위로 잰 회전 사각형의 반지름(지지함수).
const halfExtent = (it, ax) => Math.max(...itemCorners(it).map(c => Math.abs(dot(sub(c, it.pos), ax))));

// 몸통(회전 사각형의 네 꼭짓점)이 방 안쪽 bbox 안에 들어오도록 민다(§14.9 — 감사 #13).
// 지금까지는 "중심이 안쪽 폴리곤 안"만 봤기 때문에, 중심이 아슬아슬하게 들어온 제품은 몸통 절반이
// 벽을 넘어 3D에서 벽에 묻혔다. 판정을 폴리곤이 아니라 bbox로 하는 이유: 오목한 방에서 회전
// 사각형을 최적으로 밀어 넣는 문제는 이 계획의 범위 밖이고, 직사각형 방에서는 bbox = 안쪽 폴리곤이다.
// 방보다 큰 제품은 null(호출자가 건너뛴다).
function clampToRoom(item, box) {
  const c = itemCorners(item);
  const xs = c.map(q => q[0]), ys = c.map(q => q[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  if (maxX - minX > box.x1 - box.x0 || maxY - minY > box.y1 - box.y0) return null;
  const dx = Math.max(0, box.x0 - minX) - Math.max(0, maxX - box.x1);
  const dy = Math.max(0, box.y0 - minY) - Math.max(0, maxY - box.y1);
  return dx || dy ? { ...item, pos: [item.pos[0] + dx, item.pos[1] + dy] } : item;
}

// 이미 놓인 바닥 아이템과 겹치면 두 중심을 잇는 축(분리축 하나)으로 딱 떨어질 만큼 민다.
// 몇 번을 밀어도 못 풀거나 방 밖으로 나가면 null — 호출자가 그 항목을 생략한다(벽 제품의 freeT와 같은 사고).
// box를 주면(§14.9) 그 방향으로 밀면 몸통이 벽을 넘는 경우에만 축을 바꿔 본다: 좁고 긴 방에서
// 나란히 둔 묶음(세탁기+건조기)은 짧은 변으로 밀면 반드시 벽에 묻히고 긴 변으로 밀면 그대로 들어간다.
// 넘지 않는 경우에는 예전과 똑같이 두 중심 축으로만 민다 — 되던 배치의 자리를 흔들지 않는다.
function separate(item, others, inner, box = null) {
  let cur = item;
  for (let k = 0; k < 24; k++) {
    const hit = others.find(o => obbOverlap(o, cur, 1));
    if (!hit) return pointInPolygon(cur.pos, inner) ? cur : null;
    const d = sub(cur.pos, hit.pos);
    const base = len(d) < 1 ? [1, 0] : norm(d);
    const push = ax => {
      const s = Math.max(halfExtent(cur, ax) + halfExtent(hit, ax) + 2 - dot(d, ax), 1);
      return { s, p: { ...cur, pos: add(cur.pos, mul(ax, s)) } };
    };
    const inBox = c => !box || clampToRoom(c.p, box) === c.p;
    let next = push(base);
    if (!inBox(next)) next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(push).filter(inBox).sort((a, b) => a.s - b.s)[0] ?? next;
    cur = next.p;
  }
  return null;
}

// avoid: 이 방에 그대로 남을 아이템(잠긴 가구, replace:false의 기존 가구). 그 위에 겹쳐 놓지 않는다.
// stats: 주면 { moved, skipped }를 채운다(§14.9의 결과 토스트가 읽는다).
export function placeTemplate(floor, room, template, { avoid = [], stats = null } = {}) {
  if (!room || !template) return [];
  const inner = roomInnerPolygon(room, floor.walls);
  const xs = inner.map(p => p[0]), ys = inner.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const box = { x0, x1, y0, y1 };
  const bump = k => { if (stats) stats[k] = (stats[k] ?? 0) + 1; };
  // 벽을 찾는 거리에 상한을 둔다: 방 bbox 전체를 주면 몇 미터 떨어진 엉뚱한 벽에 조용히 붙는다.
  const reach = Math.min(Math.max(x1 - x0, y1 - y0), 5 * WALL_ATTACH_DIST);
  const roomWalls = floor.walls.filter(w => room.wallIds.includes(w.id));
  const taken = avoid.filter(FLOORISH);
  const out = [];
  for (const spec of template.items ?? []) {
    const p = productById(spec.productId);
    if (!p) continue;
    const off = spec.offset ?? [0, 0];
    const pos = [x0 + (x1 - x0) * spec.at[0] + off[0], y0 + (y1 - y0) * spec.at[1] + off[1]];
    const patch = { pos: [Math.round(pos[0]), Math.round(pos[1])], rot: spec.rot ?? 0 };
    if (p.attach === 'wall') {
      const near = nearestWallPlacement(roomWalls, pos, p.size, reach, { embed: false });
      if (!near) continue;                                   // 상한 안에 붙일 벽이 없으면 놓지 않는다
      Object.assign(patch, { wallId: near.wallId, t: near.t, side: near.side, pos: [Math.round(near.pos[0]), Math.round(near.pos[1])], rot: near.rot });
    } else if (!pointInPolygon(pos, inner)) continue;        // 방 밖으로 떨어지는 항목은 뺀다
    if (p.attach === 'ceiling') patch.z = Math.max(0, (room.height ?? 2300) - p.size[2]);
    const item = createItem(p, patch);
    if (!FLOORISH(item)) { out.push(item); continue; }
    // 중심은 방 안이지만 몸통이 벽에 걸친 제품을 안쪽으로 당긴다(§14.9). 벽 부착 제품은 벽 위에
    // 있어야 하므로(불변식 I-2) 여기 오지 않고, 천장 제품은 위에서 이미 out으로 빠진다.
    const fitted = clampToRoom(item, box);
    if (!fitted) { bump('skipped'); continue; }               // 방보다 큰 제품은 놓지 않는다
    const free = separate(fitted, taken, inner, box);
    if (!free) { bump('skipped'); continue; }                 // 밀어도 자리가 안 나면 생략
    const seated = clampToRoom(free, box) ?? free;            // 밀어낸 뒤에 벽으로 나갔으면 다시 당긴다
    // 당겨 온 자리가 이미 놓인 제품과 겹치면 놓지 않는다: 밀기(separate) ↔ 당기기(clamp)를
    // 왕복하지 않고 한 번에 끝낸다(겹친 채 놓는 것보다 빠지는 편이 낫다 — 충돌 0이 규칙이다).
    if (seated !== free && taken.some(o => obbOverlap(o, seated, 1))) { bump('skipped'); continue; }
    seated.pos = [Math.round(seated.pos[0]), Math.round(seated.pos[1])];
    if (seated.pos[0] !== patch.pos[0] || seated.pos[1] !== patch.pos[1]) bump('moved');
    taken.push(seated);
    out.push(seated);
  }
  return out;
}

const HOLES = ['door', 'window', 'opening'];

// 템플릿 [적용]이 지우는 것들(§16.10). 문·창·개구부는 건축 요소라서, 잠긴 아이템은 사용자가
// 지키라고 한 것이라서 남긴다(2B의 잠금 규칙). 경고 줄이 세는 수와 실제로 지워지는 수가
// 갈라지지 않게 판정은 이 한 함수만 지난다 — HOLES는 계속 비공개다.
export const replaceableInRoom = (floor, room) => itemsInRoom(floor, room).filter(it => !HOLES.includes(it.kind) && !it.locked);

// replace = true면 그 방 안 가구를 지우고 새로 놓는다(문·창·개구부는 건축 요소라 남긴다). 트랜잭션 1단계.
// 반환 { placed: 놓인 아이템 id[], skipped: 빠진 개수, moved: 벽에서 당겨 온 개수 }.
export function applyRoomTemplate(store, roomId, templateId, { replace = true } = {}) {
  const f = activeFloor(store.get());
  const room = f.rooms.find(r => r.id === roomId);
  const t = templateById(templateId);
  if (!room || !t) return { placed: [], skipped: 0, moved: 0 };
  const mine = itemsInRoom(f, room);
  // 문·창·개구부는 건축 요소라서, 잠긴 아이템은 사용자가 지키라고 한 것이라서 남긴다(2B의 잠금 규칙).
  const kill = replace ? new Set(replaceableInRoom(f, room).map(it => it.id)) : new Set();
  const stats = { moved: 0, skipped: 0 };
  const made = placeTemplate(f, room, t, { avoid: mine.filter(it => !kill.has(it.id)), stats });
  // 남겨 둔 문·창·기존 벽 제품과 같은 t에 앉지 않도록 seatCopies(freeT)를 지난다. id도 여기서 다시 매겨진다.
  // dispatch **앞에서** 센다(최종 리뷰 I-3c): 자리를 못 얻은 벽 제품은 keep에서 떨어지므로,
  // 실제로 놓이는 것이 하나도 없는지는 이 계산을 지나야 알 수 있다(made만 보면 알 수 없다 —
  // 포화된 방에 [기존 제품 유지하고 추가]를 하면 made는 1개인데 keep은 0개다). seatCopies는
  // ctx.items를 복사해 쓰므로 여기서 불러도 상태를 건드리지 않는다.
  const seated = seatCopies(made.map(m => structuredClone(m)), { walls: f.walls, items: f.items.filter(i => !kill.has(i.id)) });
  const keep = seated.filter((s, i) => !(made[i].attach === 'wall' && made[i].wallId && !s.wallId));
  // 지울 것도 놓을 것도 없고 방 타입도 그대로면 dispatch하지 않는다: 모든 제품이 자리가 없어
  // 건너뛰어진 [기존 제품 유지하고 추가]는 토스트가 "0개 배치"를 말하면서 되돌림 단계 하나를
  // 남겼다 — 전역 제약(빈 단계 금지) 위반이다. 방 타입을 채우는 일은 빈 단계가 아니므로 그때는
  // 그대로 지나간다(§14.9: 템플릿이 공간 타입의 기준이다).
  const typing = (!room.type || room.type === 'none') && !!(t.roomType && t.roomType !== 'none');
  if (!kill.size && !keep.length && !typing) return { placed: [], skipped: (t.items ?? []).length, moved: stats.moved };
  const placed = [];
  store.dispatch(d => {
    const g = activeFloor(d);
    if (kill.size) {
      g.items = g.items.filter(i => !kill.has(i.id));
      g.groups = (g.groups ?? []).map(gr => ({ ...gr, itemIds: gr.itemIds.filter(x => !kill.has(x)) })).filter(gr => gr.itemIds.length > 1);
    }
    g.items.push(...structuredClone(keep));
    placed.push(...keep.map(i => i.id));
    // 템플릿이 공간 타입의 기준이다(§14.9): 방에 타입이 없으면 템플릿의 roomType을 넣는다.
    const mineRoom = g.rooms.find(r => r.id === roomId);
    if (mineRoom && (!mineRoom.type || mineRoom.type === 'none') && t.roomType && t.roomType !== 'none') mineRoom.type = t.roomType;
    pruneDuctConnections(g);   // 템플릿이 지운 설비를 가리키는 덕트 연결도 함께 사라진다(아이템이 줄어드는 두 번째 경로다)
    reattach(g);   // 벽 부착 제품(후드·거울)의 pos·rot을 (wallId, t)에서 다시 만든다(floorInternal.js의 불변식)
  });
  return { placed, skipped: Math.max(0, (t.items ?? []).length - placed.length), moved: stats.moved };
}
