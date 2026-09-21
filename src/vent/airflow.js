// 풍량 집계(명세 §11.3). 층 스냅샷만 읽는 순수 함수다 — 패널·방 속성 패널·시방서가 모두 여기를 부른다.
// 실별: 설비 중심이 든 방에 더한다. 계통별: 덕트 연결로 이어진 설비 + props.system이 같은 후드 + 팬 번호.
import { pointInPolygon } from '../geom/rooms.js';
import { equipType } from './equipment.js';

export const AIRFLOW_TOL = 0.05;     // 설계와 5% 이상 차이면 강조한다

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

export function roomAirflow(floor) {
  const list = (floor.rooms ?? []).map(r => ({
    room: r, roomId: r.id, name: r.name || '이름 없는 공간', EA: 0, SA: 0,
    design: { EA: r.design?.EA ?? 0, SA: r.design?.SA ?? 0 },
  }));
  for (const it of floor.items ?? []) {
    const a = equipAirflow(it);
    if (!a.EA && !a.SA) continue;
    const hit = list.find(x => pointInPolygon(it.pos, x.room.points ?? []));
    if (!hit) continue;             // 어느 방에도 들지 않는 설비는 실별 표에 세지 않는다
    hit.EA += a.EA; hit.SA += a.SA;
  }
  return list.map(({ room, ...r }) => ({ ...r, ratio: ratioOf(r.EA, r.SA), offEA: offOf(r.EA, r.design.EA), offSA: offOf(r.SA, r.design.SA) }));
}

export const UNNAMED_SYSTEM = '미지정';

export function systemAirflow(floor) {
  const items = floor.items ?? [];
  const byId = new Map(items.map(i => [i.id, i]));
  const groups = new Map();
  const bucket = name => {
    if (!groups.has(name)) groups.set(name, { system: name, EA: 0, SA: 0, itemIds: new Set(), ductIds: new Set() });
    return groups.get(name);
  };
  // 1) 덕트가 계통의 뼈대다: 그 덕트에 연결된 설비가 그 계통에 든다.
  for (const d of floor.ducts ?? []) {
    const g = bucket(String(d.system ?? '').trim() || UNNAMED_SYSTEM);
    g.ductIds.add(d.id);
    for (const c of d.connections ?? []) if (byId.has(c.itemId)) g.itemIds.add(c.itemId);
  }
  // 설비 하나는 계통 하나에만 든다: 덕트 연결이 있으면 그 덕트의 system이 이긴다.
  // (그러지 않으면 후드의 props.system과 그 후드에 붙은 덕트의 system이 다른 순간 같은 CMH가
  //  두 계통에 모두 합산되어 계통 합계의 총합이 전체 배기량을 넘는다.)
  const connected = new Set([...groups.values()].flatMap(g => [...g.itemIds]));
  // 2) 덕트에 아직 붙지 않은 설비만 props.system으로 계통에 넣는다(도면에 계통만 적힌 경우).
  for (const it of items) {
    const name = String(it.props?.system ?? '').trim();
    if (name && !connected.has(it.id)) bucket(name).itemIds.add(it.id);
  }
  // 3) 팬도 같다: 덕트에 붙지 않은 팬만 자기 팬 번호를 계통 이름으로 쓴다(F-2·F-3·F-4·FB).
  for (const it of items) {
    if (equipType(it) !== 'fan' || connected.has(it.id)) continue;
    const name = String(it.props.fanId ?? '').trim();
    if (name) bucket(name).itemIds.add(it.id);
  }
  return [...groups.values()].map(g => {
    let EA = 0, SA = 0;
    for (const id of g.itemIds) { const a = equipAirflow(byId.get(id)); EA += a.EA; SA += a.SA; }
    return { system: g.system, kind: EA && SA ? 'mixed' : SA ? 'supply' : 'exhaust', EA, SA, itemIds: [...g.itemIds], ductIds: [...g.ductIds] };
  }).sort((a, b) => a.system.localeCompare(b.system, 'ko'));
}

export function airflowSummary(floor) {
  const rooms = roomAirflow(floor);
  const systems = systemAirflow(floor);
  const totalEA = rooms.reduce((s, r) => s + r.EA, 0);
  const totalSA = rooms.reduce((s, r) => s + r.SA, 0);
  return { rooms, systems, totalEA, totalSA, ratio: ratioOf(totalEA, totalSA) };
}
