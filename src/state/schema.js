import { makeWall } from '../geom/walls.js';
import { detectRooms, ROOM_FLOOR_COLOR, ROOM_CEILING_COLOR } from '../geom/rooms.js';
import { materialById } from '../materials/catalog.js';
import { normalizeEquipProps, hoodCmh } from '../vent/equipment.js';
import { normalizeDuct } from './ductSchema.js';

let counter = 0;
export const SCHEMA_VERSION = 1;
export const DEFAULT_SETTINGS = { pyeong: false, showUnit: false, background: '#f3f4f6' };

export const DEFAULT_VIEW = {
  cutaway: true, wallOpacity: 1, floorOpacity: 1, lockPlan: false,
  v2: { grid: true, guides: true, floorItems: true, wallItems: true, ceilingItems: true, structures: true, productCode: false, roomName: true, roomArea: true, dims: true, gapDims: true, measures: true, collision: true, collisionLive: true, background: true, ducts: true, ductLabels: true, equipLabels: true },
  v3: { floorItems: true, wallItems: true, ceilingItems: true, structures: true, outerWalls: true, innerWalls: true, wallTransparent: false, dims: false, gapDims: false, measures: false, collision: true, itemEdges: true, ducts: true, ductLabels: true, equipLabels: true },
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
  const a = pair(src.a), b = pair(src.b);
  const thickness = num(src.thickness, base.thickness, 2, 1000);
  const height = num(src.height, base.height, 2, 8000);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const rg = obj(src.regions);
  const side = list => arr(list).map(r => normalizeRegion(r, { len, height })).filter(Boolean);
  return {
    ...base, ...src, id: str(src.id, base.id), a, b, thickness, height,
    colorIn: color(src.colorIn, base.colorIn), colorOut: color(src.colorOut, base.colorOut),
    matIn: normalizeAssignment(src.matIn), matOut: normalizeAssignment(src.matOut),
    regions: { in: side(rg.in), out: side(rg.out) },
  };
}
export const ITEM_RANGE = { size: [10, 5000], rot: [0, 360], z: [-1000, 8000], t: [0, 1] };
// 각도 정규화(0 이상 360 미만). ui/propsApply가 "쓰일 값"으로 비교하려고 같은 함수를 쓴다(§16.1).
export const deg360 = v => { const n = Number(v); return Number.isFinite(n) ? ((n % 360) + 360) % 360 : 0; };
const ATTACH = ['floor', 'floorLay', 'wall', 'ceiling'];

// 아이템 하나를 앱이 기대하는 모양으로 맞춘다(아키텍처 §8). 모르는 필드는 그대로 남긴다.
export function normalizeItem(it) {
  const src = obj(it);
  const size = Array.isArray(src.size) ? src.size : [];
  const out = {
    ...src,
    id: str(src.id, uid('i')),
    kind: str(src.kind, 'product'),
    productId: str(src.productId, ''),
    name: str(src.name, ''),
    code: str(src.code, ''),
    color: str(src.color, '#cfd4da'),
    pos: pair(src.pos),
    z: num(src.z, 0, ITEM_RANGE.z[0], ITEM_RANGE.z[1]),
    rot: deg360(src.rot),
    size: [0, 1, 2].map(i => num(size[i], 600, ITEM_RANGE.size[0], ITEM_RANGE.size[1])),
    attach: ATTACH.includes(src.attach) ? src.attach : 'floor',
    wallId: typeof src.wallId === 'string' ? src.wallId : null,
    t: num(src.t, 0, ITEM_RANGE.t[0], ITEM_RANGE.t[1]),
    side: src.side === -1 ? -1 : 1,
    flipH: !!src.flipH, flipV: !!src.flipV, locked: !!src.locked, hidden: !!src.hidden,
  };
  // 설비(kind: 'equipment')만 props를 갖는다(아키텍처 §11.1). 후드 풍량은 표시 전용 파생값이라
  // 크기·면풍속이 바뀔 때마다 여기서 다시 계산한다 — updateItems도 이 함수를 지나므로 어긋날 수 없다.
  if (out.kind === 'equipment') {
    out.props = normalizeEquipProps(src.props);
    if (out.props.type === 'hood') out.props.cmh = hoodCmh(out);
  }
  return out;
}

export const MAT_RANGE = { offset: [0, 1000], angle: [0, 360], scale: [100, 2000] };

// 마감재 지정 한 칸. 카탈로그에 없는 id는 미지정(null)으로 만든다(옛 파일·지워진 재질).
// scale(타일 크기 덮어쓰기, §13.3)은 선택 필드다: 쓸 수 있는 값이면 100~2000 mm로 자르고,
// 없으면 **필드를 만들지 않는다** — 옛 파일이 그대로 열리고 그대로 저장된다(저장 형식 무변경 원칙).
export function normalizeAssignment(a) {
  const src = obj(a);
  const id = str(src.id, '');
  if (!materialById(id)) return null;
  const off = Array.isArray(src.offset) ? src.offset : [];
  const out = {
    id,
    offset: [num(off[0], 0, MAT_RANGE.offset[0], MAT_RANGE.offset[1]), num(off[1], 0, MAT_RANGE.offset[0], MAT_RANGE.offset[1])],
    angle: deg360(src.angle),
  };
  const sc = Array.isArray(src.scale) && src.scale.length === 2 ? src.scale : null;
  if (sc && Number.isFinite(Number(sc[0])) && Number.isFinite(Number(sc[1]))) {
    out.scale = [num(sc[0], 300, MAT_RANGE.scale[0], MAT_RANGE.scale[1]), num(sc[1], 300, MAT_RANGE.scale[0], MAT_RANGE.scale[1])];
  }
  return out;
}
// 벽 면의 일부를 덮는 영역. band는 벽 전체 폭이라 u0/u1을 무시하고 0~len으로 채운다.
// 재질이 없거나 범위가 뒤집혔으면 null(호출자가 걸러낸다).
export function normalizeRegion(r, { len = 0, height = 0 } = {}) {
  const src = obj(r);
  const mat = normalizeAssignment(src.mat);
  if (!mat) return null;
  const kind = src.kind === 'rect' ? 'rect' : 'band';
  const z0 = num(src.z0, 0, 0, height), z1 = num(src.z1, height, 0, height);
  if (!(z1 > z0)) return null;
  const u0 = kind === 'band' ? 0 : num(src.u0, 0, 0, len);
  const u1 = kind === 'band' ? len : num(src.u1, len, 0, len);
  if (!(u1 > u0)) return null;
  return { id: typeof src.id === 'string' && src.id ? src.id : uid('rg'), kind, u0, u1, z0, z1, mat };
}

// 방의 설계 풍량(명세 §11.3의 실별 풍량 표). 값이 없거나 이상하면 0으로 떨어뜨린다.
export function normalizeRoomDesign(d) {
  const src = obj(d);
  return { EA: Math.round(num(src.EA, 0, 0, 1e7)), SA: Math.round(num(src.SA, 0, 0, 1e7)) };
}

// 카탈로그 제품에서 아이템을 만든다. 천장 부착의 z는 배치 도구가 층 높이에서 다시 계산한다.
export function createItem(product, patch = {}) {
  return normalizeItem({
    id: uid('i'), kind: product.kind ?? 'product', productId: product.id, name: product.name, code: product.code,
    pos: [0, 0], z: product.zDefault ?? 0, rot: 0, size: [...product.size], attach: product.attach,
    wallId: null, t: 0, side: 1, flipH: false, flipV: false, locked: false, hidden: false,
    color: product.color ?? '#cfd4da',
    ...(product.equip ? { props: { ...product.equip } } : {}),
    ...patch,
  });
}
function normalizeFloor(f, index) {
  const base = createFloor(`Floor ${index + 1}`);
  const src = obj(f);
  const walls = arr(src.walls).map(normalizeWall);
  const items = arr(src.items).map(normalizeItem);
  const itemIds = new Set(items.map(i => i.id));
  // 조리기구의 "상단 후드"는 아이템 id 참조다: 사라진 아이템이나 후드가 아닌 것을 가리키면 로드 때 비운다
  // (§12.5 — 후드를 지우고 저장한 파일이 유령 참조를 들고 다니지 않게. 덕트 연결은 normalizeDuct가 이미 거른다).
  const hoodIds = new Set(items.filter(i => i.kind === 'equipment' && i.props?.type === 'hood').map(i => i.id));
  for (let i = 0; i < items.length; i++) {
    const p = items[i].props;
    if (p?.hoodId && !hoodIds.has(p.hoodId)) items[i] = { ...items[i], props: { ...p, hoodId: null } };
  }
  const rooms = arr(src.rooms).filter(r => r && typeof r === 'object').map(r => ({
    ...r, points: arr(r.points).map(p => pair(p)), wallIds: arr(r.wallIds),
    seats: Math.floor(num(r.seats, 0, 0, 999)), matchWallHeight: !!r.matchWallHeight,
    floorColor: color(r.floorColor, ROOM_FLOOR_COLOR), ceilingColor: color(r.ceilingColor, ROOM_CEILING_COLOR),
    floorMat: normalizeAssignment(r.floorMat), ceilingMat: normalizeAssignment(r.ceilingMat),
    design: normalizeRoomDesign(r.design),
  }));
  return {
    ...base, ...src,
    id: str(src.id, base.id), name: str(src.name, base.name), height: num(src.height, base.height, 2000, 8000),
    slab: num(src.slab, base.slab, 0, 1000),
    walls, rooms: detectRooms(walls, rooms), // 면적 등 파생값을 항상 숫자로 다시 계산한다
    // 덕트는 점 2개 미만이면 버리고, 없는 설비를 가리키는 연결도 버린다.
    items, ducts: arr(src.ducts).map(d => normalizeDuct(d, { itemIds })).filter(Boolean), guides: arr(src.guides),
    // 그룹은 실제로 있는 아이템만 가리키고, 2개 미만이면 그룹이 아니다.
    groups: arr(src.groups).filter(g => g && Array.isArray(g.itemIds)).map(g => ({ id: str(g.id, uid('g')), itemIds: g.itemIds.filter(x => typeof x === 'string' && itemIds.has(x)) })).filter(g => g.itemIds.length >= 2),
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
