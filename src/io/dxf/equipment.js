// 기구 블록 → 아이템(2026-10-12 · 계획 13 Task 2). 세 도면은 "급식기구 배치도"인데 지금 가져오기는 기구를 전부 버린다(역할 equip = 벽 추출에서
// 빼기만) — 블록 하나가 기구 하나이고(Task 1 진단 p13-task-1-report.md), 이름이 **품명 + 크기**라 자리·크기·이름을 그대로 세울 수 있다.
//  - 후보: 영역(roi · 워커의 도면 상자, DXF mm) 안의 최상위 INSERT 중 창·문 블록이 아닌 것(사전 검토 C-1: 신상중 A·B는 한 파일의 두 도면이라
//    영역 없이 세면 B를 가져올 때 A의 기구 ~250개가 건물 밖에 선다). 역할표 블록 종류 equip은 이름이 문이어도 후보, symbol·other·column은 제외.
//  - 자리: 인서트의 전개 상자 중심(insertBoxes — INSERT 점은 블록 base라 멀다). 크기: 이름 치수를 상자 방향에 맞춰(긴 변끼리 — 사전 검토 I-3:
//    이름 W-D 순서가 로컬 축과 21 % 반대), 이름 긴 변이 상자 긴 변과 20 % 넘게 다르면 상자. 식탁은 카탈로그 크기(상자가 의자를 품는다).
//    축 정렬이 아닌 인서트(이동 카트·작업대 14개)만 rot을 쓰고 크기는 로컬 상자(앱 rot = −DXF rot — 앱 y가 뒤집혀 기둥과 같은 부호).
//  - 이름: item.name = 도면 이름 정리본(제품명으로 덮지 않는다 — 사람이 도면과 대조한다), item.code = 제품 코드.
//  - 겹침: 벽 띠·기둥과 equipClash 이상 겹쳐도 **세우고** 센다(자동으로 옮기지 않는다 — 사람이 본다). 아이템끼리 겹침도 센다(사전 검토 I-4).
// 이 파일도 워커의 import 사슬이다: DOM·ui를 건드리지 않는다. 앱 좌표의 벽(walls)·기둥 아이템(columns)과 DXF → 앱 변환(toApp)을 받는다.
import { createItem } from '../../state/schema.js';
import { productById } from '../../products/catalog.js';
import { placeOnWall, wallAxis, itemAABB, pointInItem, normDeg } from '../../geom/items.js';
import { nearestWall } from './openingSeat.js';
import { blockKindByName, OPEN_BLOCK } from './blockOpenings.js';
import { classifyLayer } from './classify.js';
import { DXF_PARAMS } from './params.js';
import { matchEquip, skipReason, cleanName, sizeInName, isAnonymous } from './equipVocab.js';
import { topOwner, insertBoxes, insertParts, arcEnds } from './insertBoxes.js';

const GEN = 'equip-generic';
const AXIS_TOL = 2;        // rot mod 90이 이 안(°)이면 축 정렬 — 월드 상자를 쓴다(Task 1: 축 아닌 14개 중 5개가 3° 안 · 사동 소쿠리 운반차 272.61°는 축 아님)
const NAME_FIT = 0.2;      // 이름 긴 변과 상자 긴 변이 이 비율 안이면 이름 치수(Task 1: 166개 중 150 · 사전 검토: 171개 중 155)
const WALL_GAP = 300;      // 벽 부착: 상자 → 벽 면 거리 상한(Task 1: 벽 부착형 51개의 거리 0 mm 28 · ≤ 100 18 · ≤ 300 1 · > 300 4 — 기둥에 건 워터릴 4,468 등)
const THIN = 200;          // 짧은 변이 이 이하이고 벽 겹침 ≥ equipClash면 벽 위의 판넬(사동 zw$A460 1760×150 · zw$BCDB · 신상 zw$CC0A "각종스위치")
const DUP = 50;            // 같은 이름 · 중심이 이 안이면 같은 기구(Task 1: 네 도면 0쌍 — 겹쳐 그린 도면을 위한 방어)
const XBOX_MIN = 600;      // X-상자 후드의 짧은 변 하한(실측 1000~1800 · 사동 8 · 신상 A 3)
const SWING = [500, 1.35]; // 익명 블록의 문: 반지름 ≥ 500인 4분원(80~100°)이 있고 상자 긴 변 ≤ 1.35 r(신상 zw$FCE6 r 1040 · 내곡 adafdsaf r 1091)
const PIECE = [100, 4000]; // 벽 레이어 위 벽 조각 블록: 선 ≥ 100 · 긴 변 > 4 m(내곡 1층_방풍실_식당 1140×6900)
const SAMPLE = 20;         // 겹침 비율 표본 격자(20×20)
const DEFAULT_H = 850, WALL_Z = 900;
const HOLES = new Set(['door', 'window', 'pocket', 'slide', 'pass']);
const NOT_EQUIP = new Set(['symbol', 'other', 'column']);
const NOTE_ROLES = new Set(['dim', 'text', 'grid', 'hatch']);   // 이름 있는 블록도 여기 있고 어휘에 없으면 기호다(사전 검토 m-8)
const HOOD = { productId: 'hood-box', height: 600, attach: 'ceiling', z: 0 };

const look = (tbl, key) => (tbl instanceof Map ? tbl.get(key) : tbl && Object.prototype.hasOwnProperty.call(tbl, key) ? tbl[key] : undefined);
const r0 = v => Math.round(v) || 0;     // -0을 접는다(toEqual이 -0과 +0을 가른다 — explode.js 머리 주석)
const emptyStats = () => ({
  placed: 0, product: 0, generic: 0, anonymous: 0, named: 0, namedProduct: 0, wallMounted: 0, ceiling: 0, offAxis: 0, clash: 0, overlap: 0, overlapPairs: 0,
  skipped: { opening: 0, fixture: 0, symbol: 0, frame: 0, composite: 0, layer: 0, wallPiece: 0, big: 0, small: 0, dup: 0 },
});

// 인서트의 틀: 축 정렬이면 null(월드 축), 아니면 로컬 축 u(= 블록 로컬 x의 월드 방향 · 거울이어도 rotOf가 낸 x축)과 v.
function frameOf(it) {
  const r = it.rot ?? 0, m = ((r % 90) + 90) % 90;
  if (Math.min(m, 90 - m) <= AXIS_TOL) return null;
  const a = r * Math.PI / 180;
  return { r, u: [Math.cos(a), Math.sin(a)], v: [-Math.sin(a), Math.cos(a)] };
}
const toFrame = (f, p) => (f ? [p[0] * f.u[0] + p[1] * f.u[1], p[0] * f.v[0] + p[1] * f.v[1]] : p);
const fromFrame = (f, q) => (f ? [q[0] * f.u[0] + q[1] * f.v[0], q[0] * f.u[1] + q[1] * f.v[1]] : q);

// 상자(틀 좌표) [x0, y0, x1, y1] — 축 정렬이면 insertBoxes의 월드 상자, 아니면 같은 재료(선분 끝 + ARC 양 끝점)를 로컬 축에 투영한 상자.
function frameBox(f, g, part) {
  if (!f || !part.segs.length) return g.box;
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const add = p => { const q = toFrame(f, p); b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); };
  for (const s of part.segs) { add(s.a); add(s.b); }
  for (const c of part.arcs) arcEnds(c).forEach(add);
  return b;
}

// 사각형 + 대각선 둘(선 6개)인 익명 블록 = 후드 표기(사전 검토 반영 3 · Task 1 §4-3).
function isXBox(f, b, segs) {
  const w = b[2] - b[0], d = b[3] - b[1];
  if (segs.length !== 6 || Math.min(w, d) < XBOX_MIN) return false;
  const tol = Math.max(20, 0.02 * Math.hypot(w, d)), C = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol;
  const L = segs.map(s => [toFrame(f, s.a), toFrame(f, s.b)]);
  const joins = (i, j) => L.some(([a, e]) => (near(a, C[i]) && near(e, C[j])) || (near(a, C[j]) && near(e, C[i])));
  const edge = ([a, e]) => (Math.abs(a[1] - e[1]) <= tol && (Math.abs(a[1] - b[1]) <= tol || Math.abs(a[1] - b[3]) <= tol))
    || (Math.abs(a[0] - e[0]) <= tol && (Math.abs(a[0] - b[0]) <= tol || Math.abs(a[0] - b[2]) <= tol));
  return joins(0, 2) && joins(1, 3) && L.filter(edge).length === 4;
}

// 익명 블록이 문인가: 큰 4분원 스윙 또는 안쪽 글자가 창·문 기호(내곡 A$C754401BD "ASD 1,500").
function anonOpening(part, long) {
  const swing = [...part.arcs, ...part.polyArcs].some(c => { const sw = (((c.a1 ?? 0) - (c.a0 ?? 0)) % 360 + 360) % 360; return sw >= 80 && sw <= 100 && c.r >= SWING[0] && long <= SWING[1] * c.r; });
  return swing || part.texts.some(t => OPEN_BLOCK.test(String(t.text ?? '').replace(/,/g, '').trim()));
}

// 익명 블록의 품명 단서(Task 1 순서): 어휘에 걸리는 자식 INSERT가 하나뿐 → 안쪽 글자 → X-상자 모양.
function anonMatch(kidNames, part, f, b) {
  const kids = kidNames.map(n => (skipReason(n) ? null : matchEquip(n))).filter(Boolean);
  if (kids.length === 1) return kids[0];
  for (const t of part.texts) { const v = matchEquip(String(t.text ?? '').trim()); if (v) return v; }
  return isXBox(f, b, part.segs) ? HOOD : null;
}

// 벽 부착 자리: 가장 가까운 벽(openingSeat.nearestWall — 중심선)의 면이 상자에서 WALL_GAP 안이면 placeOnWall(뒷면을 벽 면에).
// size[0]은 벽 방향 폭이다 — 상자 방향(rot)을 벽 방향으로 투영해 다시 잡는다(이름 순서가 아니라 — 사전 검토 m-5).
function wallSeat(walls, pos, rot, size) {
  const hit = walls.length ? nearestWall(walls, pos, Infinity) : null;
  if (!hit) return null;
  const { wall } = hit, ax = wallAxis(wall), dr = (rot - ax.rot) * Math.PI / 180;
  const c = Math.abs(Math.cos(dr)), s = Math.abs(Math.sin(dr));
  const sz = [r0(c * size[0] + s * size[1]), r0(s * size[0] + c * size[1]), size[2]];
  if (hit.dist - wall.thickness / 2 - sz[1] / 2 > WALL_GAP) return null;
  const off = (pos[0] - wall.a[0]) * ax.n[0] + (pos[1] - wall.a[1]) * ax.n[1], side = off >= 0 ? 1 : -1;
  const at = placeOnWall(wall, hit.t, side, sz);
  return { attach: 'wall', wallId: wall.id, t: hit.t, side, size: sz, pos: at.pos.map(r0), rot: at.rot };
}

// 바닥 상자 중 벽 띠(중심선 ± 두께/2)·기둥 아이템 안에 드는 비율(표본 격자).
function coverage(it, bands, cols) {
  const bb = itemAABB(it), cut = q => q.bb.min[0] <= bb.max[0] && q.bb.max[0] >= bb.min[0] && q.bb.min[1] <= bb.max[1] && q.bb.max[1] >= bb.min[1];
  const W = bands.filter(cut), K = cols.filter(cut);
  if (!W.length && !K.length) return 0;
  const a = it.rot * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), [w, d] = it.size;
  let n = 0;
  for (let i = 0; i < SAMPLE; i++) for (let j = 0; j < SAMPLE; j++) {
    const x = ((i + 0.5) / SAMPLE - 0.5) * w, y = ((j + 0.5) / SAMPLE - 0.5) * d, p = [it.pos[0] + x * cs - y * sn, it.pos[1] + x * sn + y * cs];
    if (W.some(q => { const t = (p[0] - q.a[0]) * q.dir[0] + (p[1] - q.a[1]) * q.dir[1], o = (p[0] - q.a[0]) * q.n[0] + (p[1] - q.a[1]) * q.n[1]; return t >= 0 && t <= q.len && Math.abs(o) <= q.h; })
      || K.some(q => pointInItem(p, q.c))) n++;
  }
  return n / (SAMPLE * SAMPLE);
}

// → { items, stats }. ex = 전개(mm), roi = { x0, y0, x1, y1 }(DXF mm · null이면 전부), walls = 앱 좌표 벽, columns = 앱 좌표 기둥 아이템,
// roles = 역할표(roles.checkRoles의 table — blocks·layers는 Map 또는 평범한 객체), layerRoles = 레이어 → 역할(검토 창 rows · 없으면 표 → 이름 규칙),
// height = 층고(후드 z = 층고 − 높이 — 배치 도구 placeTool의 천장 규칙).
export function equipItems(ex, { roi = null, walls = [], columns = [], toApp = p => p, P = DXF_PARAMS, roles = null, layerRoles = null, height = P.height } = {}) {
  const stats = emptyStats(), items = [];
  const ins = ex?.inserts ?? [];
  if (!ins.length) return { items, stats };
  const owner = topOwner(ins), boxes = insertBoxes(ex, owner);
  const o0 = toApp([0, 0]), o1 = toApp([1e6, 0]), sc = Math.hypot(o1[0] - o0[0], o1[1] - o0[1]) / 1e6 || 1;
  const inRoi = c => !roi || (c[0] >= roi.x0 && c[0] <= roi.x1 && c[1] >= roi.y0 && c[1] <= roi.y1);
  const roleOf = layer => look(layerRoles, layer) ?? look(roles?.layers, layer) ?? classifyLayer(layer);
  // ① 후보: 최상위 · 도형 있음 · 영역 안 · 창·문 블록 아님(역할표가 이기고, 표에 없으면 이름 규칙).
  const cand = [];
  ins.forEach((it, k) => {
    const g = owner[k] === k ? boxes.get(k) : null;
    if (!g || !inRoi([(g.box[0] + g.box[2]) / 2, (g.box[1] + g.box[3]) / 2])) return;
    const kind = look(roles?.blocks, it.name)?.kind ?? null;
    if (kind ? HOLES.has(kind) : blockKindByName(it.name)) return;
    cand.push({ k, it, g, kind });
  });
  const parts = insertParts(ex, cand.map(x => x.k), owner);
  const kidNames = new Map(cand.map(x => [x.k, []]));
  ins.forEach(it => { if (it.parent != null) kidNames.get(it.parent)?.push(it.name); });
  const seen = new Map();     // 이름 → 이미 세운 중심(DXF)
  const bands = (walls ?? []).filter(w => !w.virtual).map(w => { const a = wallAxis(w); return { a: w.a, dir: a.dir, n: a.n, len: a.len, h: w.thickness / 2, bb: itemAABB({ pos: [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], size: [a.len + w.thickness, w.thickness], rot: a.rot }) }; });
  const cols = (columns ?? []).map(c => ({ c, bb: itemAABB(c) }));
  const solid = (walls ?? []).filter(w => !w.virtual);
  const skip = why => { stats.skipped[why]++; };
  let hoods = 0;
  for (const { k, it, g, kind } of cand) {
    // ② 제외: 역할표 기호 → 제외 어휘(역할표 equip보다 이긴다 — 사전 검토 m-9: sinsang-A 표가 육가·그레이팅을 equip으로 적었다) → 크기 → 벽 조각.
    if (kind && NOT_EQUIP.has(kind)) { skip('symbol'); continue; }
    const why = skipReason(it.name);
    if (why) { skip(why); continue; }
    const part = parts.get(k), f = frameOf(it), b = frameBox(f, g, part);
    const bw = (b[2] - b[0]) * sc, bd = (b[3] - b[1]) * sc, long = Math.max(bw, bd);
    if (long < P.equipMin) { skip('small'); continue; }
    if (long > P.equipMax) { skip('big'); continue; }
    const role = roleOf(it.layer), anon = isAnonymous(it.name), forced = kind === 'equip';
    if (role === 'wall' && g.n >= PIECE[0] && long > PIECE[1]) { skip('wallPiece'); continue; }
    // ③ 품명: 이름 어휘, 익명이면 자식·글자·모양. 단서 없는 익명이 기구·벽 레이어 밖이면 기호(창 블록·발판·지시선 — Task 1 §4-2 (a) 34개).
    let v = anon ? null : matchEquip(it.name);
    if (anon) {
      if (!forced && anonOpening(part, long)) { skip('opening'); continue; }
      v = anonMatch(kidNames.get(k), part, f, b);
      if (!v && !forced && role !== 'equip' && role !== 'wall') { skip('layer'); continue; }
    } else if (!v && !forced && NOTE_ROLES.has(role)) { skip('layer'); continue; }
    const c = fromFrame(f, [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
    if ((seen.get(it.name) ?? []).some(q => Math.hypot(q[0] - c[0], q[1] - c[1]) <= DUP)) { skip('dup'); continue; }
    seen.set(it.name, [...(seen.get(it.name) ?? []), c]);
    if (v?.maxLong && long > v.maxLong) v = { productId: GEN, height: v.height, attach: 'floor', z: 0 };   // 위생 기구 묶음 블록(사전 검토 I-8)
    // ④ 크기·자리
    let size = [bw, bd];
    const nd = anon ? null : sizeInName(it.name);
    if (v?.size === 'product') {
      // 식탁: 카탈로그 크기, 길이는 블록 로컬 x(Task 1 §3: 6인·4인 모두 로컬 x = 식탁 길이 · 4인은 상자 긴 변이 의자 방향이라 상자 방향을 쓰면 90° 돈다).
      const p = productById(v.productId).size, alongY = !f && Math.round((it.rot ?? 0) / 90) % 2 !== 0;
      size = alongY ? [p[1], p[0]] : [p[0], p[1]];
    } else if (nd) {
      const nl = Math.max(nd[0], nd[1]), ns = Math.min(nd[0], nd[1]);
      if (Math.abs(nl - long) / nl <= NAME_FIT) size = bw >= bd ? [nl, ns] : [ns, nl];
    }
    size = [r0(size[0]), r0(size[1]), r0(nd?.[2] || v?.height || DEFAULT_H)];
    const pos = toApp(c).map(r0), rot = f ? normDeg(-f.r) : 0;
    const pid = v?.productId ?? GEN, product = productById(pid);
    let patch = { name: cleanName(it.name) || it.name, pos, rot, size, attach: v?.attach ?? 'floor', z: 0 };
    const floorCover = patch.attach === 'floor' ? coverage(patch, bands, cols) : 0;
    const thin = patch.attach === 'floor' && Math.min(size[0], size[1]) <= THIN && floorCover >= P.equipClash;
    if (patch.attach === 'wall' || thin) {
      const z = v?.attach === 'wall' ? v.z : WALL_Z;
      patch = { ...patch, z, ...(wallSeat(solid, pos, rot, size) ?? { attach: 'floor' }) };
    } else if (patch.attach === 'ceiling') patch.z = Math.max(0, r0(height - size[2]));
    // 후드 번호 1..n(놓는 차례 — 사전 검토 m-1: 번호가 모두 1이면 라벨이 전부 ①이다).
    if (product.equip?.type === 'hood') patch.props = { ...product.equip, no: Math.min(99, ++hoods) };
    const item = createItem(product, patch);
    items.push(item);
    stats.placed++;
    if (pid === GEN) stats.generic++; else stats.product++;
    if (anon) stats.anonymous++; else { stats.named++; if (pid !== GEN) stats.namedProduct++; }
    if (item.attach === 'wall') stats.wallMounted++;
    if (item.attach === 'ceiling') stats.ceiling++;
    if (f) stats.offAxis++;
    if (item.attach === 'floor' && !thin && floorCover >= P.equipClash) stats.clash++;
  }
  // ⑤ 바닥 아이템끼리 겹침(AABB · 1 mm 넘게) — 앱이 3D에서 빨갛게 칠할 후보(사전 검토 I-4). 자리는 도면 그대로 둔다.
  const floor = items.filter(i => i.attach === 'floor').map(i => itemAABB(i)), hitSet = new Set();
  for (let i = 0; i < floor.length; i++) for (let j = i + 1; j < floor.length; j++) {
    const a = floor[i], q = floor[j];
    if (Math.min(a.max[0], q.max[0]) - Math.max(a.min[0], q.min[0]) > 1 && Math.min(a.max[1], q.max[1]) - Math.max(a.min[1], q.min[1]) > 1) { hitSet.add(i); hitSet.add(j); stats.overlapPairs++; }
  }
  stats.overlap = hitSet.size;
  return { items, stats };
}
