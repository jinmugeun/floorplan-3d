// 방 구조 맞추기(2026-10-02). 벽 좌표가 정확해도 **방의 구조**가 설계자의 것과 다르면 실 면적이 어긋난다 — 사동중의
// 면적 표기 11개 중 7개가 그랬다. 도면에 적힌 실명 + 면적 표기("(33.23m²)")를 근거로 세 가지를 맞춘다:
//  ① 구획선(addDividers): 벽 없이 트인 공간(식당 | 배식대 | 조리실)은 한 방으로 닫힌다. 면적 표기가 둘 이상 든 방을
//     **끊긴 벽 끝에서 벽 방향으로 이은 선**(virtual 벽 — 방만 나누고 몸통이 없다)으로 나눈다. 나뉜 양쪽에 표기가
//     하나 이상 있어야 하고, 후보가 여럿이면 나뉜 넓이가 표기와 맞는 것이 먼저다. 표기가 없으면 긋지 않는다.
//  ② 딸린 방(mergeAnnexes): 설계자는 넓은 통로로 이어진 칸·실 안의 청소 칸을 그 실에 넣어 센다. 표기 넓이가
//     이웃한 이름 없는 방(들)을 더해야 맞으면 사이 벽에 noSplit을 단다(벽은 그대로 그리되 방을 나누지 않는다).
//  ③ 밖에 적힌 표기(claimOutside): 좁은 방의 이름은 건물 밖 지시선 끝에 있다 — 넓이가 같은 이름 없는 방의 것이다.
// labels는 toProject.roomLabels의 것이다: { text, p, area(m² 또는 null), tier }. 좌표는 앱 좌표(mm).
import { detectRooms, pointInPolygon, polygonArea, centroid } from '../../geom/rooms.js';
import { normalizeWalls } from '../../geom/normalize.js';
import { makeWall } from '../../geom/walls.js';

const AREA_TOL = 0.05;        // m² — 표기는 소수 둘째 자리다
const RAY_MIN = 300;          // mm — 이보다 가까운 벽은 구획선이 아니라 벽 잇기(joinEnds)의 몫이다
const CLAIM_REACH = 20000;    // mm — 밖에 적힌 표기와 그 방의 거리
const ANNEX_MAX = 3;          // 한 실에 딸린 방 수
const key = p => `${Math.round(p[0])},${Math.round(p[1])}`;
const within = (labels, room) => labels.filter(l => pointInPolygon(l.p, room.points));
const fits = (room, l) => Math.abs(room.areaCenter - l.area) <= AREA_TOL;

// 반직선 e + t·d 가 선분 a–b 와 만나는 점(끝점 1.5 mm 안이면 끝점 그대로 — 노드가 갈리지 않게).
function rayHit(e, d, a, b) {
  const v = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(v[0], v[1]);
  if (!L) return null;
  const den = d[0] * v[1] - d[1] * v[0], q = [a[0] - e[0], a[1] - e[1]];
  if (Math.abs(den) < 1e-9 * L) {                                   // 나란하다: 같은 직선 위면 가까운 끝점
    if (Math.abs(q[0] * d[1] - q[1] * d[0]) > 1) return null;
    const ts = [a, b].map(p => ({ t: (p[0] - e[0]) * d[0] + (p[1] - e[1]) * d[1], p })).filter(x => x.t > 0).sort((x, y) => x.t - y.t);
    return ts[0] ?? null;
  }
  const t = (q[0] * v[1] - q[1] * v[0]) / den, s = (q[0] * d[1] - q[1] * d[0]) / den * L;      // s: a에서 잰 거리(mm)
  if (t <= 0 || s < -1.5 || s > L + 1.5) return null;
  if (s <= 1.5) return { t, p: a };
  if (s >= L - 1.5) return { t, p: b };
  return { t, p: [Math.round(e[0] + d[0] * t), Math.round(e[1] + d[1] * t)] };
}

// 끊긴 벽 끝(차수 1)마다 벽 방향으로 쏜 반직선이 처음 만나는 벽까지 → 구획선 후보.
function rays(walls) {
  const deg = new Map();
  for (const w of walls) for (const p of [w.a, w.b]) deg.set(key(p), (deg.get(key(p)) ?? 0) + 1);
  const out = [];
  for (const w of walls) {
    if (w.virtual) continue;
    for (const [e, o] of [[w.b, w.a], [w.a, w.b]]) {
      if (deg.get(key(e)) !== 1) continue;
      const L = Math.hypot(e[0] - o[0], e[1] - o[1]);
      if (!L) continue;
      const d = [(e[0] - o[0]) / L, (e[1] - o[1]) / L];
      let best = null;
      for (const x of walls) { const h = x === w ? null : rayHit(e, d, x.a, x.b); if (h && h.t >= RAY_MIN && (!best || h.t < best.t)) best = h; }
      if (best) out.push({ from: e, to: best.p, len: best.t, src: w, same: e === w.b });
    }
  }
  return out;
}

function divider(r) {
  const v = makeWall({ a: r.from, b: r.to, thickness: 20, height: r.src.height });
  v.virtual = true;
  if (r.src.axisShift) v.axisShift = r.same ? r.src.axisShift : -r.src.axisShift;      // 이어 낸 벽과 같은 기준선
  return v;
}

export function addDividers(walls, labels) {
  const strong = labels.filter(l => l.area > 0);
  if (strong.length < 2) return walls;
  let list = walls;
  for (let guard = 0; guard < 12; guard++) {
    let pick = null;
    const cands = rays(list);
    for (const room of detectRooms(list)) {
      const own = within(strong, room);
      if (own.length < 2) continue;
      const whole = Math.abs(polygonArea(room.points));
      for (const r of cands) {
        if (!pointInPolygon([(r.from[0] + r.to[0]) / 2, (r.from[1] + r.to[1]) / 2], room.points)) continue;
        const next = normalizeWalls([...list, divider(r)]);
        const parts = detectRooms(next).filter(x => own.some(l => pointInPolygon(l.p, x.points)));
        // 표기가 두 방으로 갈리고, 그 방들의 넓이 합이 원래 방과 같아야 한다(표기 없는 조각이 떨어져 나가지 않았다).
        if (parts.length < 2 || Math.abs(parts.reduce((s, x) => s + Math.abs(polygonArea(x.points)), 0) - whole) > whole * 1e-6 + 1) continue;
        const exact = parts.filter(x => { const o = within(own, x); return o.length === 1 && fits(x, o[0]); }).length;
        if (!pick || exact > pick.exact || (exact === pick.exact && r.len < pick.len)) pick = { next, exact, len: r.len };
      }
    }
    if (!pick) break;
    list = pick.next;
  }
  return list;
}

// 어느 방에도 들지 않은 면적 표기 → 넓이가 같은 이름 없는 방(가장 가까운 것). Map(room → label).
export function claimOutside(rooms, labels) {
  const empty = rooms.filter(r => !r.name && !within(labels, r).length), out = new Map();
  for (const l of labels) {
    if (!(l.area > 0) || l.tier !== 1 || rooms.some(r => pointInPolygon(l.p, r.points))) continue;
    const near = r => { const c = centroid(r.points); return Math.hypot(c[0] - l.p[0], c[1] - l.p[1]); };
    const room = empty.filter(r => !out.has(r) && fits(r, l) && near(r) <= CLAIM_REACH).sort((a, b) => near(a) - near(b))[0];
    if (room) out.set(room, l);
  }
  return out;
}

// 표기 넓이 = 그 방 + 이웃한 이름 없는 방(들)이면 사이 벽에 noSplit을 단다(walls를 고친다). → 합친 실의 수.
export function mergeAnnexes(walls, labels) {
  const rooms = detectRooms(walls), strong = labels.filter(l => l.area > 0);
  const claimed = claimOutside(rooms, labels);
  const free = new Set(rooms.filter(r => !within(labels, r).length && !claimed.has(r)));
  const shared = (a, b) => a.wallIds.filter(id => b.wallIds.includes(id));
  let merged = 0;
  for (const room of rooms) {
    const own = within(strong, room);
    if (own.length !== 1) continue;
    const need = own[0].area - room.areaCenter;
    if (need <= AREA_TOL) continue;
    // 방에 이어 붙는 이름 없는 방의 묶음을 작은 것부터 찾는다(넓이 합 = 모자란 넓이).
    const grow = (set, sum) => {
      if (Math.abs(sum - need) <= AREA_TOL) return set;
      if (set.length > ANNEX_MAX || sum > need + AREA_TOL) return null;
      for (const r of free) {
        if (set.includes(r) || !set.some(x => shared(x, r).length)) continue;
        const got = grow([...set, r], sum + r.areaCenter);
        if (got) return got;
      }
      return null;
    };
    const set = grow([room], 0);
    if (!set) continue;
    const ids = new Set(set.flatMap((a, i) => set.slice(i + 1).flatMap(b => shared(a, b))));
    for (const w of walls) if (ids.has(w.id)) w.noSplit = true;
    for (const r of set) free.delete(r);
    merged++;
  }
  return merged;
}
