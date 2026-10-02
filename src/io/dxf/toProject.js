// DXF 벽 목록 → 앱 프로젝트 하나(§18.5 · §18.8). 여기서 저장 형식이 결정되지만 **아무것도 늘리지
// 않는다**: normalizeProject()가 통과시키는 평범한 객체다. 워커가 이 파일을 import하므로 DOM·ui를
// 건드리지 않는다(geom/*·state/schema.js·products/catalog.js는 전부 DOM 없는 모듈이다).
import { makeWall } from '../../geom/walls.js';
import { normalizeWalls } from '../../geom/normalize.js';
import { detectRooms, pointInPolygon } from '../../geom/rooms.js';
import { createEmptyProject, createFloor, normalizeProject, createItem } from '../../state/schema.js';
import { productById } from '../../products/catalog.js';
import { dropTinyComponents } from './walls.js';
import { DXF_PARAMS } from './params.js';
import { dimLines, assignRefs } from './refLines.js';
import { addDividers, mergeAnnexes, claimOutside } from './reconcile.js';

// 점 p에서 선분 a–b까지의 거리.
const distSeg = (p, a, b) => {
  const d = [b[0] - a[0], b[1] - a[1]], L2 = d[0] * d[0] + d[1] * d[1];
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - d[0] * t, p[1] - a[1] - d[1] * t);
};

export const INSUNITS_SCALE = Object.freeze({ 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 });
export const DXF_DEFAULT_NAME = 'DXF 가져오기';
// 도면 제목·파일 이름으로 쓸 수 있는 글자(§18.4). 실파일의 이름은 디스크 수준에서 이미 깨져 있어
// (U+07BD·U+0131·U+2C78) 어떤 코드페이지로도 복구되지 않는다 — 그런 이름은 쓰지 않는다.
const NAME_OK = /^[0-9A-Za-z가-힣 ()\[\]._-]+$/;

// $MEASUREMENT·$LUNITS·$DIMSCALE은 읽지 않는다(축척은 도면 좌표에 이미 들어 있다 —
// 실파일의 $DIMSCALE 40은 출력 축척이다). 0(미지정)이면 도면 크기로 추정하고 머리에 알린다.
export function unitScale(insunits, longSide = 0) {
  const known = INSUNITS_SCALE[insunits];
  if (known) return { scale: known, guessed: false };
  if (longSide >= 10 && longSide <= 1000) return { scale: 1000, guessed: true };
  return { scale: 1, guessed: true };
}

// 벽 bbox 중심을 (0, 0)으로, y 부호를 뒤집어(DXF y↑ → 앱 y↓), 정수 mm로 반올림한다.
// 정수 반올림은 선택이 아니다: detectRooms의 노드 키가 `Math.round(x),Math.round(y)`라
// 끝점이 1 mm 안에서 정확히 같아야 방이 닫힌다.
export function makeToApp(walls, scale = 1) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const w of walls) for (const p of [w.a, w.b]) {
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
    y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
  }
  if (!Number.isFinite(x0)) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  // -0을 0으로 접는다(같은 점이 "0"과 "-0"으로 갈리면 노드 키가 갈릴 수 있다).
  const r = v => (Math.round(v) || 0);
  return { toApp: p => [r((p[0] - cx) * scale), r(-(p[1] - cy) * scale)], box: [x0, y0, x1, y1], size: [r((x1 - x0) * scale), r((y1 - y0) * scale)] };
}

// 방 이름(§18.4). **`detectRooms(walls)`가 낸 그 객체에 직접 넣는다** — normalizeFloor가
// `detectRooms(walls, rooms)`로 다시 계산하면서 matchPrevRooms의 wallIds 자카드로 이름을
// 물려주기 때문이다(직접 만든 폴리곤을 넣으면 이름이 조용히 사라진다).
//
// 2026-09-29 정확도 수정 — 실파일에서 식당+조리실 방이 급식기구 라벨 "온장고"로, 식품창고가 "평면형"으로,
// 계단 화살표 "DN"이 방 이름이 됐다(높이만 보고 아무 레이어의 첫 글자를 골랐다). 규칙:
//  ① 레이어 역할(nameRoles: 레이어 → classify 역할)로 층을 나눈다 — 1층 `text`, 2층 `wall`·`other`
//     (문자 레이어에 실명이 없는 방만), 나머지(기구·설비·치수·해치…)는 이름이 아니다. nameRoles가 없으면
//     모든 글자가 1층이다(역할을 모르는 부르는 쪽 — 옛 동작).
//  ② 면적·석수 라벨 "(…)" · "m²" · 계단 화살표 UP/DN · 숫자뿐 · 축선 기호(X12)는 이름이 아니다.
//  ③ "/"로 끝나는 실명은 바로 아랫줄(≤ 2.2줄)과 한 이름이고("영양상담/영양관리실"), 글자마다 띄운
//     실명은 붙인다("식 당" → "식당").
//  ④ 한 방에 든 실명이 여럿이면 아래(≤ 4줄)에 면적 라벨이 붙은 것들이 전부 이름이다(면적 큰 순 · "식당·조리실" —
//     배식대로만 나뉜 두 공간이 한 방으로 닫혔다는 뜻). 면적 라벨이 붙은 것이 없으면 방 중심에 가장
//     가까운 하나다(설비 라벨 "청소용수전"이 이름을 가로채지 않는다).
//  ⑤ unmatched = 어느 방에도 들지 못한 1층 실명뿐이다 — 검토 화면의 "닫히지 않은 공간 n곳"이 그 수다.
const NAME_TIER = { text: 1, wall: 2, other: 2 };
const AREA_LABEL = /m²|㎡|m2\b/i;
const notName = t => /^\(.*\)$/.test(t) || AREA_LABEL.test(t) || /^(up|dn|down)$/i.test(t) || /^[\d.,\s]+$/.test(t) || /^[A-Z]{1,2}\d{1,3}$/.test(t);
const unspace = t => (/^([가-힣] )+[가-힣]$/.test(t) ? t.replace(/ /g, '') : t);
const centerOf = pts => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

// 실명 후보: { text, p(앱 좌표), area(바로 아래 면적 표기 m² · 없으면 null), tier, h }.
export function roomLabels(texts, toApp, { min = 200, max = 600, chars = 20, nameRoles = null } = {}) {
  const tierOf = layer => (nameRoles ? NAME_TIER[nameRoles.get(layer)] ?? 0 : 1);
  const all = texts.filter(t => t.h >= min && t.h <= max)
    .map(t => ({ p: toApp(t.p), raw: String(t.text ?? '').trim(), h: t.h, tier: tierOf(t.layer) }));
  const areas = all.filter(c => AREA_LABEL.test(c.raw));
  let cand = all.filter(c => c.tier && c.raw.length >= 1 && c.raw.length <= chars && !notName(c.raw)).map(c => ({ ...c, text: unspace(c.raw) }));
  // ③ 두 줄 실명(앱 좌표는 y 아래쪽이다 — 아랫줄은 y가 크다)
  for (const c of cand) {
    if (c.drop || !/[/·,]$/.test(c.text)) continue;
    const next = cand.find(d => d !== c && !d.drop && d.tier === c.tier && d.p[1] > c.p[1] && d.p[1] - c.p[1] <= 2.2 * c.h && Math.abs(d.p[0] - c.p[0]) <= 4 * c.h);
    if (next) { c.text += next.text; c.tail = next.p; next.drop = true; }
  }
  cand = cand.filter(c => !c.drop);
  for (const c of cand) {
    const q = c.tail ?? c.p;
    const a = areas.find(x => x.p[1] > q[1] && x.p[1] - q[1] <= 4 * c.h && Math.abs(x.p[0] - q[0]) <= 4 * c.h);
    c.area = a ? parseFloat(a.raw.match(/\d+(?:\.\d+)?/)?.[0]) || 0 : null;
  }
  return cand;
}

export function nameRooms(rooms, texts, toApp, opts = {}) {
  const cand = opts.labels ?? roomLabels(texts, toApp, opts);
  let named = 0;
  for (const room of rooms) {
    const inside = cand.filter(c => !c.used && pointInPolygon(c.p, room.points));
    if (!inside.length) continue;
    const top = Math.min(...inside.map(c => c.tier));
    const cen = centerOf(room.points);
    const pool = inside.filter(c => c.tier === top)
      .sort((a, b) => Math.hypot(a.p[0] - cen[0], a.p[1] - cen[1]) - Math.hypot(b.p[0] - cen[0], b.p[1] - cen[1]));
    const withArea = pool.filter(c => c.area != null).sort((a, b) => b.area - a.area);   // 큰 공간이 앞
    room.name = (withArea.length ? withArea : [pool[0]]).map(c => c.text).join('·').slice(0, 40);
    for (const c of inside) c.used = true;
    named++;
  }
  // 건물 밖 지시선 끝에 적힌 실명(좁은 방): 넓이가 같은 이름 없는 방의 것이다(reconcile.js ③).
  for (const [room, c] of claimOutside(rooms, cand)) { room.name = c.text.slice(0, 40); c.used = true; named++; }
  return { named, unmatched: cand.filter(c => !c.used && c.tier === 1).map(c => c.text) };
}

// 프로젝트 이름 = ROI 안 문자 중 **높이가 가장 큰 것**(≥ 600 mm, 40자로 자름). 없으면 파일 이름,
// 그것도 쓸 수 없으면 기본값. texts는 부르는 쪽이 ROI로 걸러 넘긴다.
// `titleLayers`는 제목이 될 수 있는 레이어 이름 집합이다(사전 검토 I-6). 높이만 보면 실파일에서
// `급식기구` 레이어의 지시선 라벨 `퇴식동선`(h 1,725)이 이겨 프로젝트 이름이 그것이 된다 —
// 제목은 역할이 `text`·`other`인 레이어에만 있다(실파일의 제목은 레이어 `T`, h 980 `경산 사동중`).
export function drawingTitle(texts, fileName = '', titleLayers = null) {
  const big = texts.filter(t => t.h >= 600 && String(t.text ?? '').trim() && (!titleLayers || titleLayers.has(t.layer)))
    .sort((a, b) => b.h - a.h)[0];
  if (big) return String(big.text).trim().slice(0, 40);
  const base = String(fileName).replace(/\.[^.]*$/, '').trim();
  return base && NAME_OK.test(base) ? base.slice(0, 40) : DXF_DEFAULT_NAME;
}

export function buildProject(raw, {
  height = DXF_PARAMS.height, scale = 1, texts = [], fileName = '', autoNames = true,
  params: P = DXF_PARAMS, openings = () => [], titleTexts = null, titleLayers = null, nameRoles = null, columns = [], dims = [],
} = {}) {
  const { toApp, box, size } = makeToApp(raw, scale);
  // 순서가 계약이다: makeWall → normalizeWalls(T자 분할) → **그다음** 고립 덩어리 제거 → detectRooms.
  // 고립 제거를 앞에 두면 끝점이 아직 공유되지 않아 멀쩡한 벽이 통째로 잘린다.
  let walls = raw.map(w => makeWall({ a: toApp(w.a), b: toApp(w.b), thickness: Math.max(2, Math.round(w.thickness * scale)), height }));
  // 기둥에 닿은 벽은 그 기둥을 거쳐 본 네트워크에 이어진 것이다(기둥에 가로막혀 떨어진 실제 벽을 살린다).
  const colBox = columns.map(c => ({ p: toApp(c.c), r: Math.max(c.w, c.h) * scale / 2 }));
  const touching = w => colBox.flatMap((c, i) => (distSeg(c.p, w.a, w.b) <= c.r + w.thickness / 2 + 100 ? [i] : []));
  walls = dropTinyComponents(normalizeWalls(walls), P.minComp, P.minCompLen, colBox.length ? touching : null);
  // 기둥(walls.js가 고른 닫힌 작은 사각형) → 사각 기둥. w는 u 방향 변이고, 앱은 y가 뒤집혀 각도도 뒤집힌다.
  const colProduct = productById('column-square');
  const colItems = colProduct ? columns.map(c => createItem(colProduct, {
    pos: toApp(c.c), z: 0,
    rot: ((Math.atan2(-c.u[1], c.u[0]) * 180 / Math.PI) % 360 + 360) % 360,
    size: [Math.round(c.w * scale), Math.round(c.h * scale), height],
  })) : [];
  // 면적 기준선(refLines.js): 벽마다 치수가 가리키는 좌표(구조체 중심 · 기둥 그리드)를 기준선으로 단다 — 방의 areaCenter가 쓴다.
  assignRefs(walls, dimLines(dims, toApp), colItems, P);
  // 방 구조를 도면의 실명·면적 표기에 맞춘다(reconcile.js): 트인 공간의 구획선 · 한 실로 센 딸린 방.
  const labels = autoNames ? roomLabels(texts, toApp, { nameRoles }) : [];
  walls = addDividers(walls, labels);
  const annexes = mergeAnnexes(walls, labels);
  const rooms = detectRooms(walls);
  for (const room of rooms) room.height = height;      // §18.8: 층고 한 칸이 층·벽·방을 함께 정한다
  const unmatchedNames = autoNames ? nameRooms(rooms, texts, toApp, { labels }).unmatched : [];
  const items = [...(openings({ walls: walls.filter(w => !w.virtual), rooms, toApp }) ?? []), ...colItems];
  const project = normalizeProject({
    ...createEmptyProject(),
    name: drawingTitle(titleTexts ?? texts, fileName, titleLayers),
    areaMode: 'center',     // 도면의 실 면적은 벽·기둥 중심선 기준이다 — 가져온 도면은 그 기준으로 보여 준다
    floors: [{ ...createFloor('1F'), height, slab: 0, walls, rooms, items }],
  });
  const floor = project.floors[0];
  // 키는 geom/rooms.js의 nodeKey와 같은 반올림이다 — normalizeWalls의 T 분할이 소수 좌표를 만들어
  // 정확한 float 키로는 방 엔진이 이미 이어 붙인 점이 끊긴 끝점으로 보고된다(Task 7 리뷰 F1: 실파일 53 중 22가 허상).
  const deg = new Map();
  for (const w of floor.walls) for (const p of [w.a, w.b]) {
    const k = `${Math.round(p[0])},${Math.round(p[1])}`;
    const d = deg.get(k) ?? { n: 0, p };
    d.n++; deg.set(k, d);
  }
  const th = new Map();
  for (const w of floor.walls) th.set(w.thickness, (th.get(w.thickness) ?? 0) + 1);
  const atColumn = p => colItems.some(c => {
    const r = c.rot * Math.PI / 180, dx = p[0] - c.pos[0], dy = p[1] - c.pos[1];
    return Math.abs(dx * Math.cos(r) + dy * Math.sin(r)) <= c.size[0] / 2 + 100 && Math.abs(-dx * Math.sin(r) + dy * Math.cos(r)) <= c.size[1] / 2 + 100;
  });
  const stats = {
    walls: floor.walls.length,
    rooms: floor.rooms.length,
    areaM2: Math.round(floor.rooms.reduce((a, r) => a + r.area, 0) * 10) / 10,
    // 차수 1 노드 = 끊긴 끝점. 이 배열이 배너·2D 마커·[보기]의 원천이다(§18.6). 기둥 몸통(+100 mm) 안에서 끝나는
    // 벽은 기둥에 닿아 있으므로 끊긴 것이 아니다(실파일 조리실 실내벽 끝).
    openEnds: [...deg.values()].filter(d => d.n === 1 && !atColumn(d.p)).map(d => [...d.p]),
    thickness: [...th].sort((a, b) => b[1] - a[1] || a[0] - b[0]),
    unmatchedNames,
    items: floor.items.length,
    columns: colItems.length,
    dividers: floor.walls.filter(w => w.virtual).length, annexes,
    size,
    // DXF 좌표 → 앱 좌표의 원점·배율(앱 = (DXF − origin) × scale, y 뒤집기). 치수·면적선을 평면도와 맞댈 때 쓴다.
    origin: [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2],
    scale,
  };
  return { project, stats, toApp, walls: floor.walls, rooms: floor.rooms, box, size };
}
