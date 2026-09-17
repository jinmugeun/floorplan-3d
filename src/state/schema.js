import { makeWall } from '../geom/walls.js';
import { detectRooms } from '../geom/rooms.js';

let counter = 0;
export const SCHEMA_VERSION = 1;

export function uid(prefix = 'id') {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

export function createFloor(name = 'Floor 1') {
  return { id: uid('f'), name, height: 2300, walls: [], rooms: [], items: [], ducts: [], guides: [], groups: [] };
}

export function createEmptyProject(name = '새 프로젝트') {
  return {
    version: SCHEMA_VERSION,
    name,
    units: 'mm',
    background: null,
    floors: [createFloor()],
    activeFloor: 0,
    camera: { mode: '2d', target: [0, 0], azimuth: 47, elevation: 35, zoom: 1 },
    view: { grid: true, labels: true, dimensions: true, cutaway: true, wallOpacity: 1, background: true, collision: true },
  };
}

export function migrate(p) {
  if (!p || typeof p !== 'object') throw new Error('프로젝트 파일이 아닙니다');
  if (p.version === SCHEMA_VERSION) return normalizeProject(p);
  if (p.version === undefined) return normalizeProject({ ...p, version: SCHEMA_VERSION });
  throw new Error(`지원하지 않는 파일 버전입니다: ${p.version}`);
}

// 값 정리 도우미: 숫자가 아니면 기본값, 범위를 벗어나면 잘라 준다.
const num = (v, def, min = -Infinity, max = Infinity) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const pair = (v, def = [0, 0]) => (Array.isArray(v) ? [num(v[0], def[0]), num(v[1], def[1])] : [...def]);
const arr = v => (Array.isArray(v) ? v : []);
const str = (v, def) => (typeof v === 'string' ? v : def);
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function normalizeWall(w) {
  const base = makeWall({ a: [0, 0], b: [0, 0] });
  const src = obj(w);
  return { ...base, ...src, id: str(src.id, base.id), a: pair(src.a), b: pair(src.b), thickness: num(src.thickness, base.thickness, 2, 1000), height: num(src.height, base.height, 2, 8000) };
}
function normalizeFloor(f, index) {
  const base = createFloor(`Floor ${index + 1}`);
  const src = obj(f);
  const walls = arr(src.walls).map(normalizeWall);
  const rooms = arr(src.rooms).filter(r => r && typeof r === 'object').map(r => ({ ...r, points: arr(r.points).map(p => pair(p)), wallIds: arr(r.wallIds) }));
  return {
    ...base, ...src,
    id: str(src.id, base.id), name: str(src.name, base.name), height: num(src.height, base.height, 2000, 8000),
    walls, rooms: detectRooms(walls, rooms), // 면적 등 파생값을 항상 숫자로 다시 계산한다
    items: arr(src.items), ducts: arr(src.ducts), guides: arr(src.guides), groups: arr(src.groups),
  };
}
function normalizeBackground(bg) {
  if (!bg || typeof bg !== 'object' || typeof bg.src !== 'string') return null;
  return {
    ...bg, src: bg.src,
    width: num(bg.width, 0, 0), height: num(bg.height, 0, 0), scale: num(bg.scale, 1, 1e-6), opacity: num(bg.opacity, 0.5, 0, 1),
    offset: pair(bg.offset), visible: bg.visible === undefined ? true : !!bg.visible, locked: bg.locked === undefined ? true : !!bg.locked,
  };
}

// 불러온/복원한 프로젝트를 앱이 기대하는 모양으로 맞춘다. 빠지거나 잘못된 값은 기본값으로 채우고 범위를 벗어나면 잘라 준다.
export function normalizeProject(p) {
  const def = createEmptyProject();
  const src = obj(p);
  const floors = arr(src.floors).map(normalizeFloor);
  if (!floors.length) floors.push(createFloor());
  const active = num(src.activeFloor, 0);
  return {
    ...src,
    version: SCHEMA_VERSION,
    name: str(src.name, def.name),
    units: 'mm',
    background: normalizeBackground(src.background),
    floors,
    activeFloor: Number.isInteger(active) && active >= 0 && active < floors.length ? active : 0,
    camera: { ...def.camera, ...obj(src.camera) },
    view: { ...def.view, ...obj(src.view) },
  };
}

export function activeFloor(p) {
  return p.floors[p.activeFloor ?? 0];
}
