// 실명만으로 구획선 제안(2026-10-12 · 계획 12 Task 6) — **옵션, 기본 꺼짐**. 사용자 결정(2026-10-02): 면적 표기가 없는 도면에서는 구획선을
// 자동으로 긋지 않는다 → 검토 창 체크박스·점수판 `--dividers`로 켤 때만 돈다(buildProject의 dividerByNames).
// 왜: 공개 코퍼스(중국 아파트 39쌍)의 거실·식당·복도는 벽 없이 트여 한 방으로 닫힌다 — 놓친 정답 방의 약 340/468(계획 12 진단). 면적 표기
// 구획선(reconcile.addDividers)은 표기가 둘 이상 든 방만 가르므로 표기가 없는 이 도면들에서는 돌지 않는다.
// 규칙: 한 방 폴리곤 안에 1층 실명 후보(isRoomName)가 둘 이상이고 면적 표기가 없으면, 이웃한 두 실명(넓게 퍼진 축으로 정렬)마다 두 점을 잇는
// 선에 **수직인 가장 짧은 가로지르기**를 구획선(virtual · 2D 점선 · 3D·견적 없음)으로 넣는다.
//  ① 수직 방향은 방 변의 방향 중 가장 가까운 것으로 맞춘다 — 두 이름이 비스듬히 놓이면 정확한 수직은 사선 구획선이 된다(도면에 없는 꼴).
//  ② 자리는 두 이름 사이(그 방향의 법선 축 위)에 고르게 SAMPLES곳 + 방 꼭짓점이 비치는 자리. 각 자리의 직선이 방 안을 지나는 구간(경계에
//     처음 닿는 곳까지)이 가로지르기다 — 양 끝은 방 경계 = 벽 중심선(벽 끝·몸통)이다. 두 이름을 서로 다른 조각에 두는 것만 후보다.
//  ③ 가장 짧은 것(railSnap 안은 같은 길이로 본다 — 난간 끝을 벽 끝에 붙이는 거리와 같은 "붙임" 폭), 같으면 끝이 꼭짓점(벽 끝·모서리)에 닿는
//     수가 많은 것, 그다음 두 이름의 한가운데에 가까운 것. 고른 가로지르기가 dividerMinArea 미만 조각을 남기면 **그 짝은 긋지 않는다**
//     (`强电`·`水井` 같은 설비 글자가 벽감에 있을 때 — 대신 방 한가운데를 가르지 않는다).
//  ④ 한 바퀴에 방마다 하나씩 긋고 방을 다시 센다(세 이름이면 두 바퀴).
//  ⑤ 끝이 문·창 자리(구획선 없이 먼저 앉힌 개구부 폭 + OPENING_EDGE) 안인 가로지르기는 후보가 아니다 — 그 점에서 벽이 나뉘어 개구부가
//     앉지 못한다(아래 inOpening).
//  ⑥ 위아래 두 줄로 쓴 한 실명은 한 이름이다(아래 stacked · 리뷰 M-1).
// 좌표는 앱 좌표(mm · 정수 — makeToApp)다. 반환 { walls(정규화한 새 배열 · 넣은 것이 없으면 받은 배열 그대로), added(그은 구획선 수) }.
// 만든 구획선에는 byName 표지를 단다(toProject가 세고 지운다 — 저장 형식은 그냥 구획선이다).
import { makeWall } from '../../geom/walls.js';
import { normalizeWalls } from '../../geom/normalize.js';
import { detectRooms, pointInPolygon, polygonArea } from '../../geom/rooms.js';
import { DXF_PARAMS } from './params.js';
import { OPENING_EDGE } from './openingSeat.js';

const SAMPLES = 9;          // 두 이름 사이에 고르게 놓아 보는 가로지르기 자리 수(+ 방 꼭짓점 자리 — 계산은 방 변 수에 비례할 뿐이다)
const EPS = 0.5;            // mm — 꼭짓점이 가로지르기 직선 위에 있다고 볼 거리(좌표는 정수 mm다)
const PASSES = 8;           // 한 방에 이름 아홉까지(한 바퀴에 방마다 하나)
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const near = (p, q) => Math.abs(p[0] - q[0]) <= 1 && Math.abs(p[1] - q[1]) <= 1;
const rnd = p => p.map(v => Math.round(v) || 0);
const distSeg = (p, a, b) => {
  const d = [b[0] - a[0], b[1] - a[1]], L2 = dot(d, d);
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - d[0] * t, p[1] - a[1] - d[1] * t);
};

// 실명 후보: 역할표의 문자 역할이 room인 글자는 한 글자여도 늘 후보다. 아니면 1층(문자 레이어) 글자 중 — 앞뒤 공백을 뺀 글자 수 ≥ 2, 숫자·기호·공백뿐이 아니고,
// 괄호로 감싼 표지("（乙）" 방화문 등급)가 아니고, 로마자 부호(숫자가 든 "HB-2"·"TC21'" · 로마자 셋 이하 "YD"·"A.C.")가 아닌 것.
// 공개 코퍼스 1층 문자에 `水`·`电`·`上`·`下`(한 글자 설비·계단 기호)와 창호·평면형 부호가 섞여 있다(2026-10-12 진단). 두 글자 설비 `强电`·`弱电`·
// `水井`은 실명 꼴이라 여기서 거르지 않고 최소 조각 넓이(dividerMinArea)가 거른다.
const ASCII = /^[\x20-\x7e]+$/;
export function isRoomName(l) {
  if (l?.role === 'room') return true;
  if (l?.tier !== 1) return false;
  const t = String(l.text ?? '').trim();
  if ([...t].length < 2 || /^[\d\s\p{P}\p{S}]+$/u.test(t) || /^[(（].*[)）]$/.test(t)) return false;
  return !(ASCII.test(t) && (/\d/.test(t) || (t.match(/[A-Za-z]/g) ?? []).length <= 3));
}

// 방 변의 방향 묶음(같은 직선의 두 방향은 하나 · angTol 안은 한 묶음).
function edgeDirs(poly, P) {
  const tol = Math.sin(P.angTol * Math.PI / 180), out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1) continue;
    let u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    if (u[0] < -1e-9 || (Math.abs(u[0]) <= 1e-9 && u[1] < 0)) u = [-u[0], -u[1]];
    if (!out.some(o => Math.abs(o[0] * u[1] - o[1] * u[0]) <= tol)) out.push(u);
  }
  return out;
}

// 직선 { p : dot(p, n) = s }(방향 d)이 방 안을 지나는 구간들 — 경계에 닿는 점(변과의 교점 · 꼭짓점)마다 끊고, 가운데가 방 안이며 변을 따라
// 겹치지 않는 구간만. → [{ a, b, len }].
function chords(poly, d, n, s) {
  const ts = [], flat = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const sp = dot(p, n) - s, sq = dot(q, n) - s, tp = dot(p, d), tq = dot(q, d);
    if (Math.abs(sp) <= EPS && Math.abs(sq) <= EPS) { ts.push(tp, tq); flat.push([Math.min(tp, tq), Math.max(tp, tq)]); continue; }
    if (Math.abs(sp) <= EPS) { ts.push(tp); continue; }
    if (Math.abs(sq) > EPS && (sp > 0) !== (sq > 0)) ts.push(tp + (tq - tp) * sp / (sp - sq));   // q가 직선 위면 다음 변의 p로 센다
  }
  ts.sort((x, y) => x - y);
  const u = [];
  for (const t of ts) if (!u.length || t - u[u.length - 1] > EPS) u.push(t);
  const at = t => [d[0] * t + n[0] * s, d[1] * t + n[1] * s], out = [];
  for (let k = 0; k + 1 < u.length; k++) {
    const t0 = u[k], t1 = u[k + 1], tm = (t0 + t1) / 2;
    if (t1 - t0 < 1 || flat.some(([f0, f1]) => tm > f0 && tm < f1) || !pointInPolygon(at(tm), poly)) continue;
    out.push({ a: rnd(at(t0)), b: rnd(at(t1)), len: t1 - t0 });
  }
  return out;
}

// 고리에 a·b를 끼워 a–b로 가른 두 조각. 같은 좌표가 두 번 나오는 고리(방 안 벽 가지를 오가는 면)도 있어 끼울 자리를 모두 해 보고, 두 조각의
// 넓이 부호가 원래 방과 같은 첫 짝을 쓴다. 없으면 null.
function split(poly, a, b) {
  const ring = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    ring.push(p, ...[a, b].filter(x => !near(x, p) && !near(x, q) && distSeg(x, p, q) <= 1)
      .sort((x, y) => Math.hypot(x[0] - p[0], x[1] - p[1]) - Math.hypot(y[0] - p[0], y[1] - p[1])));
  }
  const at = x => ring.flatMap((p, i) => (near(p, x) ? [i] : []));
  const sign = Math.sign(polygonArea(poly));
  for (const i of at(a)) for (const j of at(b)) {
    if (i === j) continue;
    const lo = Math.min(i, j), hi = Math.max(i, j);
    const one = ring.slice(lo, hi + 1), two = [...ring.slice(hi), ...ring.slice(0, lo + 1)];
    if (one.length >= 3 && two.length >= 3 && polygonArea(one) * sign > 1 && polygonArea(two) * sign > 1) return [one, two];
  }
  return null;
}

// 가로지르기가 방 안에 떠 있는 벽(섬 — 방 경계가 아니다)을 끝 1 mm 밖에서 지나는가. 나란한 벽(같은 직선 위의 섬 포함)은 지나는 것이 아니다.
// 2026-10-12 · 계획 12 최종 리뷰 N6-1(Task 6 재리뷰 n-1): 0905219가 더한 "같은 직선 위에서 겹치면 지난다" 분기를 되돌렸다 — 그 분기는 섬을 따라
// 자르는 더 나은 자리(x 6000 → [24, 24])를 막아 x 6800([20.8, 27.2] · 섬이 방 안에 떠 있다)으로 비끼게 했다. 그 근거("정규화가 섬을 구획선
// 조각으로 나눈다")도 틀렸다: 구획선이 나중에 들어가므로 normalizeWalls는 겹친 구간을 앞의 섬에게 맡기고, 섬은 벽 그대로다.
function crosses(ch, walls) {
  const d = [ch.b[0] - ch.a[0], ch.b[1] - ch.a[1]], L = Math.hypot(d[0], d[1]);
  return walls.some(w => {
    const e = [w.b[0] - w.a[0], w.b[1] - w.a[1]], den = d[0] * e[1] - d[1] * e[0], Lw = Math.hypot(e[0], e[1]);
    if (Math.abs(den) < 1e-9 * L * Lw) return false;
    const q = [w.a[0] - ch.a[0], w.a[1] - ch.a[1]];
    const t = (q[0] * e[1] - q[1] * e[0]) / den, u = (q[0] * d[1] - q[1] * d[0]) / den;
    return t * L > 1 && (1 - t) * L > 1 && u * Lw >= -1 && (1 - u) * Lw >= -1;
  });
}

// ⑤ 가로지르기 끝이 문·창 자리(그 벽에 앉을 개구부 폭 + 양쪽 OPENING_EDGE) 안인가 — 문 가운데에서 끝나는 구획선은 "벽 끝·몸통"에 닿은
// 것이 아니고, 그 점에서 벽이 나뉘어 개구부가 앉지 못한다(2026-10-12 실측: 내곡중 남자 화장실 문 1000 · 창 1300이 그렇게 사라지거나 둘로 갈렸다).
// spans = [{ wall, t, width }](개구부를 구획선 없이 먼저 앉힌 결과 — toProject).
function inOpening(e, spans) {
  return spans.some(({ wall: w, t, width }) => {
    const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]], L = Math.hypot(d[0], d[1]);
    if (!L) return false;
    const u = [d[0] / L, d[1] / L], q = [e[0] - w.a[0], e[1] - w.a[1]];
    return Math.abs(q[0] * u[1] - q[1] * u[0]) <= w.thickness / 2 + 1 && Math.abs(dot(q, u) - t * L) < width / 2 + OPENING_EDGE;
  });
}

// 두 실명 A·B를 가르는 구획선(②·③) 또는 null.
function pairCut(poly, A, B, walls, P, spans) {
  const v = [B.p[0] - A.p[0], B.p[1] - A.p[1]], L = Math.hypot(v[0], v[1]);
  if (L < 1) return null;
  const perp = [-v[1] / L, v[0] / L];
  const dirs = edgeDirs(poly, P).map(d => ({ d, c: Math.abs(dot(d, perp)) }));
  const top = Math.max(...dirs.map(x => x.c));
  const cands = [];
  for (const { d } of dirs.filter(x => x.c >= top - 1e-3)) {
    const n = [-d[1], d[0]];
    const sA = dot(A.p, n), sB = dot(B.p, n), lo = Math.min(sA, sB), hi = Math.max(sA, sB), mid = (lo + hi) / 2;
    const offs = new Set();
    for (let k = 1; k <= SAMPLES; k++) offs.add(Math.round(lo + (hi - lo) * k / (SAMPLES + 1)));
    for (const p of poly) { const s = dot(p, n); if (s > lo + EPS && s < hi - EPS) offs.add(s); }
    for (const s of offs) for (const ch of chords(poly, d, n, s)) {
      const parts = split(poly, ch.a, ch.b);
      if (!parts) continue;
      const iA = parts.findIndex(q => pointInPolygon(A.p, q)), iB = parts.findIndex(q => pointInPolygon(B.p, q));
      if (iA < 0 || iB < 0 || iA === iB || inOpening(ch.a, spans) || inOpening(ch.b, spans) || crosses(ch, walls)) continue;
      cands.push({ ...ch, ends: [ch.a, ch.b].filter(e => poly.some(p => near(p, e))).length, off: Math.abs(s - mid), small: Math.min(...parts.map(q => Math.abs(polygonArea(q)))) });
    }
  }
  if (!cands.length) return null;
  const Lmin = Math.min(...cands.map(c => c.len));
  const pick = cands.filter(c => c.len <= Lmin + P.railSnap).sort((x, y) => y.ends - x.ends || x.off - y.off)[0];
  return pick.small >= P.dividerMinArea ? pick : null;
}

// ⑥ 두 줄로 쓴 한 실명(2026-10-12 리뷰 M-1): 내곡중 "남자" 위 · "화장실" 아래(h 250 · dy 425 = 1.7h · dx 174), 3suite (10) "空中/花园"·"入户/花园"
// (dy 1.66h)는 두 방이 아니다 — roomLabels ③은 "/·,"로 끝나는 윗줄만 잇는다. 그 사이를 가르면 한 방이 거짓으로 둘이 된다(222개 중 5개).
// 같은 방의 두 후보가 |dx| ≤ 2h이고 0.8h ≤ dy ≤ 2.2h(h = 둘 중 큰 글자 높이)이면 한 이름이다: 자리는 윗줄(앱 좌표는 y 아래 — 작은 y),
// 글자는 이어 붙인다. dx 4h(③의 폭)는 600 mm 글자로 나란히 쓴 두 실명까지 묶어 정답 3개를 잃는다(리뷰 시제품). 높이를 모르면 묶지 않는다.
function stacked(own) {
  const sorted = [...own].sort((a, b) => a.p[1] - b.p[1]), used = new Set(), out = [];
  for (const c of sorted) {
    if (used.has(c)) continue;
    used.add(c);
    const below = sorted.filter(d => !used.has(d) && c.h > 0 && d.h > 0).map(d => ({ d, h: Math.max(c.h, d.h), dx: Math.abs(d.p[0] - c.p[0]), dy: d.p[1] - c.p[1] }))
      .filter(x => x.dx <= 2 * x.h && x.dy >= 0.8 * x.h && x.dy <= 2.2 * x.h).sort((x, y) => x.dy - y.dy)[0];
    if (below) used.add(below.d);
    out.push(below ? { ...c, text: c.text + below.d.text } : c);
  }
  return out;
}

// 한 방의 구획선 하나: 이웃한 실명 짝(넓게 퍼진 축으로 정렬) 중 가장 짧은 것.
function roomCut(poly, own, walls, P, spans) {
  const span = ax => Math.max(...own.map(l => l.p[ax])) - Math.min(...own.map(l => l.p[ax]));
  const ax = span(0) >= span(1) ? 0 : 1;
  const sorted = [...own].sort((a, b) => a.p[ax] - b.p[ax]);
  let best = null;
  for (let i = 0; i + 1 < sorted.length; i++) {
    const c = pairCut(poly, sorted[i], sorted[i + 1], walls, P, spans);
    if (c && (!best || c.len < best.len)) best = c;
  }
  return best;
}

// openings: 구획선 없이 먼저 앉힌 개구부 [{ wall, t, width }](⑤ — 없으면 문 자리를 모른 채 긋는다).
export function addDividersByNames(walls, labels, { params: P = DXF_PARAMS, height = P.height, openings = [] } = {}) {
  const names = (labels ?? []).filter(isRoomName), marked = (labels ?? []).filter(l => l.area > 0);
  if (names.length < 2) return { walls, added: 0 };
  let list = walls, added = 0;
  const seen = new Set();      // 같은 자리에 두 번 긋지 않는다(정규화가 끝을 못 이어 방이 안 갈렸을 때 — 무한 반복 막기)
  for (let pass = 0; pass < PASSES; pass++) {
    const cuts = [];
    for (const room of detectRooms(list)) {
      const own = stacked(names.filter(l => pointInPolygon(l.p, room.points)));
      if (own.length < 2 || marked.some(l => pointInPolygon(l.p, room.points))) continue;
      const cut = roomCut(room.points, own, list, P, openings);
      const key = cut && [cut.a, cut.b].map(p => p.join(',')).sort().join('|');
      if (cut && !seen.has(key)) { seen.add(key); cuts.push(cut); }
    }
    if (!cuts.length) break;
    list = normalizeWalls([...list, ...cuts.map(c => {
      const w = makeWall({ a: c.a, b: c.b, thickness: 20, height });
      w.virtual = true;
      w.byName = true;
      return w;
    })]);
    added += cuts.length;
  }
  return { walls: list, added };
}
