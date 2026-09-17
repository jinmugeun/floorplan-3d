import spec from './gangdang.json';
import { createEmptyProject, activeFloor, migrate } from '../state/schema.js';
import { rectWalls } from '../geom/walls.js';
import { normalizeWalls } from '../geom/normalize.js';
import { detectRooms, centroid } from '../geom/rooms.js';

const inside = (p, [x0, y0, x1, y1]) => p[0] > x0 && p[0] < x1 && p[1] > y0 && p[1] < y1;

// 기술서(방 사각형 목록)를 앱과 같은 경로로 프로젝트로 바꾼다:
// rectWalls → normalizeWalls(공유 벽 합치기) → detectRooms → 중심이 들어 있는 사각형에서 이름·타입 부여.
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
  }
  return migrate(p); // 파생값(면적 등)을 앱과 같은 규칙으로 다시 계산한다
}

export function loadSample(store) { store.replace(buildSampleProject()); }
