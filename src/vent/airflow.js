// 풍량 집계(기능 명세 §11.3 / 아키텍처 §11.7). 층 스냅샷만 읽는 순수 함수다 — 패널·방 속성 패널·시방서가 모두 여기를 부른다.
// 실별: 설비 중심이 든 방에 더한다(경계 위에 놓인 벽 부착 설비는 허용치로 받는다). 어느 방도 아니면 '미배치' 묶음에 남는다.
// 계통별: 덕트 연결로 이어진 설비 + props.system이 같은 후드 + 팬 번호. 설비 하나는 계통 하나에만 든다.
// 숨긴 설비 규칙: item.hidden인 설비는 실별·계통별·합계 어디에도 세지 않는다(레이어에서 감춘 설비는
// 도면에서 뺀 것으로 본다). 숨긴 덕트(duct.hidden)도 같다 — 계통의 뼈대가 되지 못하므로 그 덕트의
// 연결도 세지 않고 계통 줄도 만들지 않는다(견적의 숨김 규칙 "풍량과 같은 규칙"이 이것을 가리킨다).
// 잠금(locked)은 편집 제한일 뿐이라 풍량에는 영향이 없다.
import { pointInPolygon } from '../geom/rooms.js';
import { distToSegment } from '../geom/walls.js';
import { eq } from '../geom/vec.js';
import { equipType } from './equipment.js';

export const AIRFLOW_TOL = 0.05;     // 설계와 5% 이상 차이면 강조한다
export const UNPLACED_ROOM = '미배치';
const EDGE_TOL = 120;                // 방 변에 맞는 벽을 못 찾았을 때 쓰는 경계 허용치(mm)

// 설비 하나가 만드는 급배기(CMH). 후드는 늘 배기(후드 cmh는 면적×면풍속×3600의 파생값이다),
// 디퓨저·팬은 flow에 따른다. 조리기구·환기캡은 0이다(도면에 풍량 값이 없다).
export function equipAirflow(item) {
  const t = equipType(item);
  const p = item?.props ?? {};
  if (t === 'hood') return { EA: Math.round(Number(p.cmh) || 0), SA: 0 };
  if (t === 'diffuser' || t === 'fan') {
    const v = Math.round(Number(p.cmh) || 0);
    return p.flow === 'supply' ? { EA: 0, SA: v } : { EA: v, SA: 0 };
  }
  return { EA: 0, SA: 0 };
}

const ratioOf = (EA, SA) => (EA > 0 ? Math.round((SA / EA) * 1000) / 10 : null);
const offOf = (now, design) => (design > 0 ? (now - design) / design : null);
const visibleItems = floor => (floor.items ?? []).filter(it => !it?.hidden);

// 방 폴리곤은 벽 중심선이라 벽 부착 설비(벽팬·환기캡)의 중심이 방 경계선 위에 놓인다.
// pointInPolygon의 ray 판정은 경계에서 비대칭이어서(같은 팬이 남/서 벽에서는 세어지고 북/동 벽에서는
// 사라진다) 중심이 안에 들지 않은 설비만 2차로 거리 판정한다 — 그 변의 벽 두께 절반 + 1 mm 안이면 그 방이다.
function boundaryTol(a, b, walls) {
  const w = walls.find(x => (eq(x.a, a) && eq(x.b, b)) || (eq(x.a, b) && eq(x.b, a)));
  const t = Number(w?.thickness);
  return Number.isFinite(t) && t > 0 ? t / 2 + 1 : EDGE_TOL;
}
function onBoundary(pos, room, walls) {
  const pts = room?.points ?? [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (distToSegment(pos, a, b) <= boundaryTol(a, b, walls)) return true;
  }
  return false;
}

// 점 하나가 어느 방에 드는지 — 실별 풍량의 판정을 그대로 쓴다(폴리곤 내부 우선, 안에 들지 않으면
// 경계 허용치로 2차 판정). "이 설비가 선 방"을 말하는 자리는 모두 이 함수를 쓴다 — 지금 쓰는 곳은
// roomAirflow(아래), 후드 라벨의 방 이름(ui/equipRows.js:25), 레이어 트리의 방별 묶음과 덕트 묶음
// (ui/layersPanel.js:13, 25). 두 곳이 다르게 판정하면 경계에 놓인 후드가 라벨·레이어 트리에는 방 이름이
// 없으면서 풍량 표에는 그 방에 세어지는 어긋남이 생긴다. 없으면 null이다.
export function roomAt(pos, rooms, walls = []) {
  const list = rooms ?? [];
  return list.find(r => pointInPolygon(pos, r?.points ?? []))
    ?? list.find(r => onBoundary(pos, r, walls))
    ?? null;
}

export function roomAirflow(floor) {
  const walls = floor.walls ?? [];
  const list = (floor.rooms ?? []).map(r => ({
    room: r, roomId: r.id, name: r.name || '이름 없는 공간', EA: 0, SA: 0,
    design: { EA: r.design?.EA ?? 0, SA: r.design?.SA ?? 0 },
  }));
  // 어느 방에도 들지 않는 설비를 담는 묶음(layersPanel의 '미지정'과 같은 규칙).
  // 이 줄이 있어야 totalEA = Σ equipAirflow(보이는 설비).EA 불변식이 지켜지고, 잘못 놓인 설비가 눈에 보인다.
  const unplaced = { room: null, roomId: null, name: UNPLACED_ROOM, EA: 0, SA: 0, design: { EA: 0, SA: 0 } };
  for (const it of visibleItems(floor)) {
    const a = equipAirflow(it);
    if (!a.EA && !a.SA) continue;
    const room = roomAt(it.pos, floor.rooms ?? [], walls);
    const hit = (room && list.find(x => x.roomId === room.id)) || unplaced;
    hit.EA += a.EA; hit.SA += a.SA;
  }
  const rows = unplaced.EA || unplaced.SA ? [...list, unplaced] : list;   // '미배치'는 있을 때만, 늘 맨 끝에
  return rows.map(({ room, ...r }) => ({ ...r, ratio: ratioOf(r.EA, r.SA), offEA: offOf(r.EA, r.design.EA), offSA: offOf(r.SA, r.design.SA) }));
}

export const UNNAMED_SYSTEM = '미지정';

// 계통 구분: 설비 풍량(EA/SA)과 덕트 자신의 kind를 합집합으로 본다. 한쪽만 나오면 그쪽,
// 둘 다면 '급·배기', 아무 단서도 없으면 배기로 둔다(덕트 kind 기본값이 exhaust다).
function systemKind(kinds, EA, SA) {
  const all = new Set(kinds);
  if (EA) all.add('exhaust');
  if (SA) all.add('supply');
  if (all.size > 1) return 'mixed';
  return all.size === 1 ? [...all][0] : 'exhaust';
}

export function systemAirflow(floor) {
  const items = visibleItems(floor);
  const byId = new Map(items.map(i => [i.id, i]));
  const groups = new Map();
  const bucket = name => {
    if (!groups.has(name)) groups.set(name, { system: name, EA: 0, SA: 0, kinds: new Set(), itemIds: new Set(), ductIds: new Set() });
    return groups.get(name);
  };
  // 설비 하나는 계통 하나에만 든다: itemId → 그 설비를 먼저 집은 덕트의 계통(덕트 순서 = floor.ducts 순서라 결정적).
  // (그러지 않으면 같은 후드가 서로 다른 system의 덕트 두 개에 붙는 순간 같은 CMH가 두 계통에 모두
  //  합산되어 계통 합계의 총합이 전체 배기량을 넘는다. ductIds는 양쪽에 그대로 남긴다.)
  const owner = new Map();
  // 1) 덕트가 계통의 뼈대다: 그 덕트에 연결된 설비가 그 계통에 든다.
  // 숨긴 덕트는 건너뛴다(숨긴 설비와 같은 규칙): 계통 줄도 만들지 않고 그 연결도 세지 않는다.
  // 그래서 숨긴 덕트에만 붙어 있던 설비는 2)·3)의 props.system·팬 번호로 다시 갈 곳을 찾는다
  // (설비 자신이 보이는 한 그 풍량은 어딘가에는 남아야 한다 — 계통 합계 ≤ 전체 합계 불변식).
  for (const d of floor.ducts ?? []) {
    if (d?.hidden) continue;
    const g = bucket(String(d.system ?? '').trim() || UNNAMED_SYSTEM);
    g.ductIds.add(d.id);
    g.kinds.add(d.kind === 'supply' ? 'supply' : 'exhaust');
    for (const c of d.connections ?? []) {
      if (!byId.has(c.itemId) || owner.has(c.itemId)) continue;
      owner.set(c.itemId, g.system);
      g.itemIds.add(c.itemId);
    }
  }
  // 2) 덕트에 아직 붙지 않은 설비만 props.system으로 계통에 넣는다(도면에 계통만 적힌 경우).
  for (const it of items) {
    const name = String(it.props?.system ?? '').trim();
    if (name && !owner.has(it.id)) { owner.set(it.id, name); bucket(name).itemIds.add(it.id); }
  }
  // 3) 팬도 같다: 덕트에 붙지 않은 팬만 자기 팬 번호를 계통 이름으로 쓴다(F-2·F-3·F-4·FB).
  for (const it of items) {
    if (equipType(it) !== 'fan' || owner.has(it.id)) continue;
    const name = String(it.props.fanId ?? '').trim();
    if (name) { owner.set(it.id, name); bucket(name).itemIds.add(it.id); }
  }
  return [...groups.values()].map(g => {
    let EA = 0, SA = 0;
    for (const id of g.itemIds) { const a = equipAirflow(byId.get(id)); EA += a.EA; SA += a.SA; }
    return { system: g.system, kind: systemKind(g.kinds, EA, SA), EA, SA, itemIds: [...g.itemIds], ductIds: [...g.ductIds] };
  }).sort((a, b) => a.system.localeCompare(b.system, 'ko'));
}

export function airflowSummary(floor) {
  const rooms = roomAirflow(floor);
  const systems = systemAirflow(floor);
  const totalEA = rooms.reduce((s, r) => s + r.EA, 0);
  const totalSA = rooms.reduce((s, r) => s + r.SA, 0);
  return { rooms, systems, totalEA, totalSA, ratio: ratioOf(totalEA, totalSA) };
}
