import { makeWall } from '../geom/walls.js';
import { detectRooms, ROOM_FLOOR_COLOR, ROOM_CEILING_COLOR } from '../geom/rooms.js';

let counter = 0;
export const SCHEMA_VERSION = 1;
export const DEFAULT_SETTINGS = { pyeong: false, showUnit: false, background: '#f3f4f6' };

export const DEFAULT_VIEW = {
  cutaway: true, wallOpacity: 1, floorOpacity: 1, lockPlan: false,
  v2: { grid: true, guides: true, floorItems: true, wallItems: true, ceilingItems: true, structures: true, productCode: false, roomName: true, roomArea: true, dims: true, gapDims: true, measures: true, collision: true, background: true },
  v3: { floorItems: true, wallItems: true, ceilingItems: true, structures: true, outerWalls: true, innerWalls: true, wallTransparent: false, dims: false, gapDims: false, measures: false, collision: true },
  display: 'normal', hiddenLine: false, perfMode: 'display',
  projection: 'perspective', cameraPreset: { elevation: 35, azimuth: 47, fov: 60 },
  sun: { month: 6, hour: 12, intensity: 0.8, azimuth: 180, ambient: 0.6 },
};

export function uid(prefix = 'id') {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

export function createFloor(name = 'Floor 1') {
  return { id: uid('f'), name, height: 2300, slab: 0, walls: [], rooms: [], items: [], ducts: [], guides: [], measures: [], groups: [] };
}

export function createEmptyProject(name = '새 프로젝트') {
  return {
    version: SCHEMA_VERSION,
    name,
    units: 'mm',
    areaMode: 'net',
    settings: { ...DEFAULT_SETTINGS },
    background: null,
    floors: [createFloor()],
    activeFloor: 0,
    camera: { mode: '2d', target: [0, 0], azimuth: 47, elevation: 35, zoom: 1 },
    view: structuredClone(DEFAULT_VIEW),
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
const color = (v, def) => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : def);

function normalizeWall(w) {
  const base = makeWall({ a: [0, 0], b: [0, 0] });
  const src = obj(w);
  return { ...base, ...src, id: str(src.id, base.id), a: pair(src.a), b: pair(src.b), thickness: num(src.thickness, base.thickness, 2, 1000), height: num(src.height, base.height, 2, 8000), colorIn: color(src.colorIn, base.colorIn), colorOut: color(src.colorOut, base.colorOut) };
}
function normalizeFloor(f, index) {
  const base = createFloor(`Floor ${index + 1}`);
  const src = obj(f);
  const walls = arr(src.walls).map(normalizeWall);
  const rooms = arr(src.rooms).filter(r => r && typeof r === 'object').map(r => ({
    ...r, points: arr(r.points).map(p => pair(p)), wallIds: arr(r.wallIds),
    seats: Math.floor(num(r.seats, 0, 0, 999)), matchWallHeight: !!r.matchWallHeight,
    floorColor: color(r.floorColor, ROOM_FLOOR_COLOR), ceilingColor: color(r.ceilingColor, ROOM_CEILING_COLOR),
  }));
  return {
    ...base, ...src,
    id: str(src.id, base.id), name: str(src.name, base.name), height: num(src.height, base.height, 2000, 8000),
    slab: num(src.slab, base.slab, 0, 1000),
    walls, rooms: detectRooms(walls, rooms), // 면적 등 파생값을 항상 숫자로 다시 계산한다
    items: arr(src.items), ducts: arr(src.ducts), guides: arr(src.guides), groups: arr(src.groups),
    measures: arr(src.measures).filter(m => m && typeof m === 'object' && Array.isArray(m.a) && Array.isArray(m.b)).map(m => ({ id: str(m.id, uid('m')), a: pair(m.a), b: pair(m.b) })),
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
    units: src.units === 'ftin' ? 'ftin' : 'mm',
    areaMode: src.areaMode === 'gross' ? 'gross' : 'net',
    settings: normalizeSettings(src.settings),
    background: normalizeBackground(src.background),
    floors,
    activeFloor: Number.isInteger(active) && active >= 0 && active < floors.length ? active : 0,
    camera: { ...def.camera, ...obj(src.camera) },
    view: normalizeView(src.view, def.view),
  };
}

// 배경 색은 CSS 색 문자열만 허용한다(#rgb ~ #rrggbbaa). 그 밖의 값은 기본값으로 되돌린다.
function normalizeSettings(s) {
  const src = obj(s);
  return { pyeong: !!src.pyeong, showUnit: !!src.showUnit, background: color(src.background, DEFAULT_SETTINGS.background) };
}

const wrap360 = v => ((v % 360) + 360) % 360;
// 불리언 그룹(v2/v3): 정의된 키만 남기고, 없는 키는 기본값을 쓴다.
const boolGroup = (src, def) => Object.fromEntries(Object.keys(def).map(k => [k, src[k] === undefined ? def[k] : !!src[k]]));

function normalizeView(v, defView = DEFAULT_VIEW) {
  const src = obj(v);
  // 옛 평면 필드 이전: grid/labels/dimensions/background/collision → v2. (새 v2가 이미 있으면 v2 값이 우선이다.)
  const legacy = {};
  if (src.grid !== undefined) legacy.grid = !!src.grid;
  if (src.labels !== undefined) { legacy.roomName = !!src.labels; legacy.roomArea = !!src.labels; }
  if (src.dimensions !== undefined) legacy.dims = !!src.dimensions;
  if (src.background !== undefined) legacy.background = !!src.background;
  if (src.collision !== undefined) legacy.collision = !!src.collision;
  const v2src = obj(src.v2);
  const pick = (k, list) => (list.includes(src[k]) ? src[k] : defView[k]);
  const cp = obj(src.cameraPreset), sun = obj(src.sun);
  return {
    cutaway: src.cutaway === undefined ? defView.cutaway : !!src.cutaway,
    wallOpacity: num(src.wallOpacity, defView.wallOpacity, 0, 1),
    floorOpacity: num(src.floorOpacity, defView.floorOpacity, 0, 1),
    lockPlan: !!src.lockPlan,
    v2: boolGroup({ ...legacy, ...v2src }, defView.v2),
    v3: boolGroup(obj(src.v3), defView.v3),
    display: pick('display', ['normal', 'white', 'transparent']),
    hiddenLine: !!src.hiddenLine,
    perfMode: pick('perfMode', ['display', 'performance']),
    projection: pick('projection', ['perspective', 'ortho']),
    cameraPreset: {
      elevation: num(cp.elevation, defView.cameraPreset.elevation, 0, 89),
      azimuth: wrap360(num(cp.azimuth, defView.cameraPreset.azimuth)),
      fov: num(cp.fov, defView.cameraPreset.fov, 15, 120),
    },
    sun: {
      month: Math.round(num(sun.month, defView.sun.month, 1, 12)),
      hour: Math.round(num(sun.hour, defView.sun.hour, 0, 23)),
      intensity: num(sun.intensity, defView.sun.intensity, 0, 2),
      azimuth: wrap360(num(sun.azimuth, defView.sun.azimuth)),
      ambient: num(sun.ambient, defView.sun.ambient, 0, 2),
    },
  };
}

export function activeFloor(p) {
  return p.floors[p.activeFloor ?? 0];
}
