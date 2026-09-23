import spec from './gangdang.json';
import { createEmptyProject, activeFloor, migrate, createItem } from '../state/schema.js';
import { normalizeDuct } from '../state/ductSchema.js';
import { rectWalls } from '../geom/walls.js';
import { normalizeWalls } from '../geom/normalize.js';
import { detectRooms, centroid } from '../geom/rooms.js';
import { productById } from '../products/catalog.js';
import { nearestWallPlacement, WALL_ATTACH_DIST } from '../geom/items.js';

const inside = (p, [x0, y0, x1, y1]) => p[0] > x0 && p[0] < x1 && p[1] > y0 && p[1] < y1;

// 설비 하나를 앱과 같은 경로로 앉힌다: 천장 부착은 기본으로 층 높이에서 높이를 빼 z를 잡되(배치 도구와 같은 규칙),
// JSON이 z를 명시하면 그 값을 따른다(후드처럼 천장에서 내려 다는 설비를 위한 예외 — 리뷰 I-3).
// 벽 부착(환기캡)은 nearestWallPlacement로 벽을 찾아 (wallId, t)에서 pos·rot을 만든다
// ("pos는 (wallId, t)의 결과"라는 2B 불변식을 샘플도 지킨다).
function seatEquip(floor, height, e) {
  const product = productById(e.product);
  const size = [...(e.size ?? product.size)];
  const patch = { id: e.id, pos: [...e.pos], rot: e.rot ?? 0, size, props: { ...product.equip, ...(e.props ?? {}) } };
  if (product.attach === 'ceiling') patch.z = e.z != null ? Math.round(e.z) : Math.max(0, Math.round(height - size[2]));
  else patch.z = e.z ?? product.zDefault ?? 0;
  if (product.attach === 'wall') {
    const hit = nearestWallPlacement(floor.walls, patch.pos, size, WALL_ATTACH_DIST);
    if (hit) Object.assign(patch, { wallId: hit.wallId, t: hit.t, side: hit.side, pos: [Math.round(hit.pos[0]), Math.round(hit.pos[1])], rot: hit.rot });
  }
  return createItem(product, patch);
}

// 기술서(방 사각형 목록 + 설비 + 덕트 + 설계 풍량)를 앱과 같은 경로로 프로젝트로 바꾼다:
// rectWalls → normalizeWalls(공유 벽 합치기) → detectRooms → 중심이 들어 있는 사각형에서 이름·타입·설계 풍량 부여
// → 설비 배치 → 덕트 정규화(있는 설비만 연결로 남는다).
export function buildSampleProject() {
  const p = createEmptyProject(spec.name);
  const f = activeFloor(p);
  f.name = spec.floorName;
  f.height = spec.floorHeight;
  f.walls = normalizeWalls(spec.rooms.flatMap(r => rectWalls([r.rect[0], r.rect[1]], [r.rect[2], r.rect[3]], spec.thickness, spec.floorHeight)));
  f.rooms = detectRooms(f.walls);
  for (const room of f.rooms) {
    const src = spec.rooms.find(x => inside(centroid(room.points), x.rect));
    if (!src) continue;
    room.name = src.name;
    room.type = src.type;
    room.height = spec.floorHeight;
    if (src.seats) room.seats = src.seats;
    if (spec.design?.[src.name]) room.design = { ...spec.design[src.name] };   // 실별 풍량 표(명세 §11.3)
  }
  f.items = (spec.equipment ?? []).map(e => seatEquip(f, spec.floorHeight, e));
  const itemIds = new Set(f.items.map(i => i.id));
  f.ducts = (spec.ducts ?? []).map(d => normalizeDuct(d, { itemIds })).filter(Boolean);
  return migrate(p); // 파생값(면적·후드 풍량 등)을 앱과 같은 규칙으로 다시 계산한다
}

// 프로젝트 교체는 되돌릴 단계가 아니다(§17.3): store.swap이 교체·히스토리 비우기·알림을 한 번에
// 한다(리뷰 I-2 — 잊을 수 있는 둘째 줄을 두지 않는다). 부르는 쪽은 view.fit()·onProjectSwap()만 묶는다.
export function loadSample(store) { store.swap(buildSampleProject()); }
