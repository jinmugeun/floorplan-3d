// 정규화 DXF 내보내기(2026-10-12 · 계획 12 Task 3). 왜: 사용자 지시 "선이 너무 많으면 도면 자체를 간편화" — 가져온(또는 고친)
// 프로젝트를 **레이어가 몇 개뿐인 깨끗한 DXF**로 내보내면, 사람이 CAD에서 틀린 벽만 고치고 다시 들여올 수 있다. 다시 들여올 때는
// 레이어가 WALL·COLUMN·OPENING·ROOM…뿐이라 레이어 판정이 깨질 수 없다. 그래서 이 파일의 계약은 "우리 가져오기가 **같은 것**을
// 다시 읽는다"이다(tests/dxfExport.test.js의 왕복 테스트 — 벽 수·두께·방 이름·문창 폭·기둥 수).
//  - 좌표: 앱 mm(y 아래) → DXF(y 위). y 부호만 뒤집고 원점은 그대로다 — 가져오기의 toApp(toProject.makeToApp)가 벽 상자 가운데를
//    0으로 잡으므로, 다시 들여오면 같은 앱 좌표가 나온다(벽 상자가 같으면).
//  - 벽(WALL · 나란히 붙은 이웃 벽은 WALL-2): 몸통 윤곽선(이웃 벽과 겹친 부분을 지운 합집합 경계). **중심선은 두께가 bandGap(520)보다
//    두꺼운 벽에만** 긋는다 — 그런 벽은 두 면선 간격이 bandGap을 넘어 중심선이 있어야 이웃 선 간격이 bandGap 안이라 한 띠로 선다(사동중 4·
//    내곡중 6개 — 사전 검토 3). 얇은 벽에 중심선을 그으면 기둥 곁에서 기둥 마감선으로 먹혔다(Task 3 리뷰 M-1 · 2026-10-12 최종 리뷰 N3-1로 고친 주석).
//    구획선(virtual)은 DIVIDER(역할 '난간' — 다시 들여오면 railDividers가 구획선으로 다시 긋는다 · 최종 리뷰 X-1).
//  - 문·창·통로(OPENING): 블록 INSERT 하나가 개구부 하나 — 이름은 가져오기의 blockKind가 읽는 꼴(DR-900-200 · WIN-1200-200 ·
//    POCKET-900-200 · SLIDING-900-200 · PASS-1000-200: 첫 3~4자리 수가 폭, 둘째가 벽 두께)이고, 도형은 폭 × 벽 두께 틀 사각형이다.
//    통로(opening-pass)는 `PASS-` 블록에 더해 벽 선을 그 폭만큼 끊어(문설주 선 둘) X 표시(개구부 레이어)를 둔다. 가져오기가 그 자리·폭으로
//    읽지 못하는 통로는 끊지 않는다(dxfExportGeom.passReadable · uncutPasses) — 그래도 `PASS-` 블록으로 돌아온다(2026-10-12 리뷰 concern 2).
//  - 방(ROOM): 닫힌 LWPOLYLINE(역할 '기타' — 벽이 아니다) + 실명·면적 MTEXT(ROOM-TEXT · 역할 '문자' · 높이 300/250 — roomLabels의
//    200~600 범위). 면적은 따로 적는다("12.34㎡") — 다시 들여올 때 구획선·딸린 방 맞추기(reconcile.js)와 면적 검사가 쓴다.
//  - 기둥(COLUMN · 역할 '벽'): 사각 기둥은 닫힌 사각형(가져오기의 findColumns가 벽 레이어에서 찾는다 — 너무 긴 것은 겹친 사각형 둘),
//    원형 기둥은 CIRCLE(다시 들여오면 기둥으로 읽히지 않는다 — 가져오기는 사각 윤곽만 기둥으로 본다).
//  - 기준선 치수(DIM · dxfExportDims.js): 벽마다 axisShift가 가리키는 선 — 방의 도면 기준 넓이(areaCenter)가 같게 돌아온다.
// 2026-10-12 실파일 왕복(가져오기 → 내보내기 → 다시 가져오기 · 리뷰 수정 뒤): 사동중 벽 94 → 93 · 방·실명 14/14 · 문 17 · 창 30 · 통로 5 · 면적 14/14,
// 신상중 B 벽 77/77 끝점까지 · 통로 17/17, 신상중 A 실명 11/11, 내곡중 벽 116 → 113 · 방 22/22 · 실명 18/18(두꺼운 벽 무리 — 보고서).
// 두 번째 왕복에서 기둥 크기는 바뀌지 않는다(마감선 오라클 · liningOracle).
//  - 기구(EQUIP · dxfExportEquip.js · 2026-10-13 계획 14 Task E): 기구 하나 = `EQ-이름-WxDxH@제품` 블록 INSERT — 다시 들여오면 그대로 선다.
//    opts.equipment === false면 예전처럼 빼고 쓴다.
// 프로필(2026-10-13 · 계획 16 Task B): opts.profile 'archisketch'는 레이어 이름과 쓰는 요소만 바꾼다(dxfExportProfile.js) — 아키스케치 입력용이지 우리 왕복 형식이 아니다.
// 이 파일은 DOM을 모른다.
import { dxfDocument, CENTER_LTYPE, PASS_LAYER, num } from './dxfExportTemplate.js';
import { roomArea } from '../geom/rooms.js';
import { wallOutline, interiorPoint } from './dxfExportGeom.js';
import { rectify } from './dxfExportJoints.js';
import { refDimensions } from './dxfExportDims.js';
import { DXF_PARAMS } from './dxf/params.js';
import { findColumns, findPilasters, growLinings } from './dxf/columns.js';
import { equipExport } from './dxfExportEquip.js';
import { profileOf } from './dxfExportProfile.js';

const D = p => [p[0], -p[1]];                        // 앱 → DXF(y 위)
const NAME_H = 300, AREA_H = 250;                    // 실명·면적 글자 높이(mm) — roomLabels가 200~600만 실명으로 본다
const NAME_MAX = 20;                                 // roomLabels의 chars(20) — 넘으면 두 줄로 나눈다(앞줄이 '·'로 끝나면 이어 읽는다)
const TITLE_H = 1000;                                // 제목(≥ 600이어야 drawingTitle이 고른다 · 실명 범위 밖)

const line = (layer, a, b, ltype = null) => ({ type: 'LINE', layer, ltype, body: [[100, 'AcDbLine'], [10, num(a[0])], [20, num(a[1])], [30, 0], [11, num(b[0])], [21, num(b[1])], [31, 0]] });
const poly = (layer, pts, closed = true) => ({ type: 'LWPOLYLINE', layer, body: [[100, 'AcDbPolyline'], [90, pts.length], [70, closed ? 1 : 0], [43, 0], ...pts.flatMap(p => [[10, num(p[0])], [20, num(p[1])]])] });
const insert = (layer, name, p, rot) => ({ type: 'INSERT', layer, body: [[100, 'AcDbBlockReference'], [2, name], [10, num(p[0])], [20, num(p[1])], [30, 0], [41, 1], [42, 1], [43, 1], [50, num(rot)]] });
// MTEXT: 삽입점(10/20)이 붙임점 기준이라 CAD에서 다시 저장해도 그 점이 그대로다(TEXT는 가운데 맞춤이면 10/20이 왼쪽 아래로 다시 계산된다 —
// 가져오기는 10/20을 실명 자리로 읽는다). attach 5 = 가운데, 7 = 왼쪽 아래.
const clean = s => String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[\\{}]/g, '').trim();
const mtext = (layer, p, h, text, attach = 5) => ({ type: 'MTEXT', layer, body: [[100, 'AcDbMText'], [10, num(p[0])], [20, num(p[1])], [30, 0], [40, h], [41, 0], [71, attach], [72, 1], [1, clean(text)], [7, 'Standard']] });

const kindOf = id => (/^door-pocket/.test(id) ? 'POCKET' : /^door-slide/.test(id) ? 'SLIDING' : /^door-/.test(id) ? 'DR' : /^window-/.test(id) ? 'WIN' : id === 'opening-pass' ? 'PASS' : null);
const wallPoint = (w, t) => [w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t];

// 사각 기둥 → 닫힌 사각형(들). 가져오기의 기둥 찾기(columns.findColumns)는 짧은 변 ≥ colMin · 긴 변 ≤ colMax · 종횡비 ≤ colAspect만 본다 —
// 그보다 긴 기둥(사동중 650 × 1300 — 원래 구조체와 마감 윤곽이 합쳐진 것)은 **겹친 사각형 둘**로 그린다: 서로의 중심이 상대 윤곽(+50) 안이라
// mergeColumns가 바깥 윤곽 하나로 합친다(길이 L' ≥ (L − 50)/1.5). 그래도 안 되면 한 사각형(다시 들여오면 기둥으로 읽히지 않는다).
function columnRects(it, P = DXF_PARAMS) {
  const c = D(it.pos), [sw, sh] = it.size ?? [400, 400];
  const r = -(it.rot ?? 0) * Math.PI / 180, u = [Math.cos(r), Math.sin(r)], v = [-u[1], u[0]];
  const rect = (o, w, h) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [o[0] + u[0] * w / 2 * i + v[0] * h / 2 * j, o[1] + u[1] * w / 2 * i + v[1] * h / 2 * j]);
  const L = Math.max(sw, sh), S = Math.min(sw, sh), limit = Math.min(P.colMax, P.colAspect * S), Lp = Math.ceil((L - 50) / 1.5) + 1;
  if (L <= limit || Lp > limit) return [rect(c, sw, sh)];
  const along = sw >= sh ? u : v, k = (L - Lp) / 2;
  return [-1, 1].map(s => rect([c[0] + along[0] * k * s, c[1] + along[1] * k * s], sw >= sh ? Lp : sw, sw >= sh ? sh : Lp));
}

// 기둥 둘레에서 벽 선을 끊어 둔다(같은 직선 위 두 조각 — 가져오기의 면선은 그대로 한 면이다). 왜: 가져오기의 도면 덩어리(faces.clusters)는
// 선의 **끝점**으로 잇는데 정규화 벽 선은 기둥을 지나 길게 이어져, 바깥벽에 걸친 기둥 사각형이 다른 덩어리가 되고 도면 상자(ROI) 밖으로
// 삐져나온 변이 잘려 기둥이 사라졌다(2026-10-12 합성 평면 · 동쪽 벽 400 기둥). 기둥마다 **선에 가장 가까운 꼭짓점 하나**의 투영점에서만
// 끊는다 — 두 점에서 끊으면 기둥 면 길이만 한 조각이 생겨 가져오기가 그것을 기둥을 감은 마감선으로 보고 기둥을 키운다(columns.growLinings ·
// 사동중 790×855 → 790×971). 조각이 minSeg(150)보다 짧아지는 점도 건너뛴다 — 가져오기는 짧은 선을 버린다(신상중 B 꺾임 둘이 끊겼다).
// 두 조각 모두 기둥의 투영 범위(± LINING_SAFE)를 벗어난 끝을 가져야 한다 — 범위 안에 갇힌 조각은 마감선으로 읽힌다(growLinings · LINING_MAX 150).
const LINING_SAFE = 200;
function splitNear(lines, groups, reach, min = DXF_PARAMS.minSeg + 10) {
  const out = [];
  for (const [a, b, layer] of lines) {
    const d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(d[0], d[1]);
    const foot = p => { const t = ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / (L * L); return { t, dist: Math.hypot(a[0] + d[0] * t - p[0], a[1] + d[1] * t - p[1]) }; };
    const ts = groups.map(pts => {
      const fs = pts.map(foot), lo = Math.min(...fs.map(f => f.t)) * L - LINING_SAFE, hi = Math.max(...fs.map(f => f.t)) * L + LINING_SAFE;
      return lo > 0 && hi < L ? fs.sort((x, y) => x.dist - y.dist)[0] : null;
    }).filter(f => f && f.t * L >= min && f.t * L <= L - min && f.dist <= reach).map(f => f.t)
      .sort((x, y) => x - y);
    let prev = 0;
    for (const t of [...ts, 1]) {
      if (t < 1 && (t - prev) * L < min) continue;
      out.push([[a[0] + d[0] * prev, a[1] + d[1] * prev], [a[0] + d[0] * t, a[1] + d[1] * t], layer]);
      prev = t;
    }
  }
  return out;
}

// 벽 선 넷이 닫는 작은 사각형(작은 실·PS의 바깥·안쪽 윤곽, 통로 사이 기둥 꼴 토막의 면선 + 문설주)은 가져오기가 **기둥**으로 읽는다
// (columns.findColumns: 끝점이 맞물린 네 변 · 300~1200 · 종횡비 2.5 — 2026-10-12 내곡중 871 × 970 PS가 1041 × 1100 기둥이 되고 벽 넷이 사라졌다).
// 기둥은 COLUMN 레이어에만 그리므로 벽 선으로 닫힌 사각형은 모두 가짜다 — 가장 긴 변을 가운데에서 두 조각으로 끊는다(같은 직선 · 면은 그대로).
// 마주 보는 **두 변**을 끊는다(2026-10-12 · Task 3 리뷰 M-1 재측정): 한 변만 끊으면 남은 세 변이 ㄷ자가 되어 가져오기가 벽기둥(findPilasters)으로
// 읽고 옆 기둥과 합쳐 키웠다(내곡중 740×840 → 1100×1041). 두 변이 다 짧으면(< 2 × 160) 가장 긴 변 하나만 끊는다.
function unboxed(lines, P = DXF_PARAMS) {
  const out = [...lines], min = 2 * (P.minSeg + 10);
  const half = i => { const [a, b, layer] = out[i], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; out.splice(i, 1, [a, m, layer]); out.push([m, b, layer]); };
  for (const r of findColumns(out.map(([a, b]) => ({ a, b })), P)) {
    const [i, j, m1, m2] = r.segs, pairs = [[i, m1], [j, m2]].filter(p => p.every(k => len(out[k]) >= min));
    if (pairs.length) { pairs[0].forEach(half); continue; }
    const k = r.segs.reduce((m, x) => (len(out[x]) > len(out[m]) ? x : m));
    if (len(out[k]) >= min) half(k);
  }
  // 벽 선 셋이 이루는 ㄷ자(앞 변 + 같은 길이의 옆 변 둘)도 가져오기는 벽기둥(columns.findPilasters)으로 읽어 옆 기둥과 합친다 — 내곡중 PS 바깥 윤곽
  // 1100 × 1006이 그 안의 740×840 기둥을 키웠다. 정규화 DXF의 기둥은 모두 COLUMN 사각형이므로 벽 선 ㄷ자는 가짜다 — 앞 변을 반으로 끊는다.
  // 한 번에 찾은 ㄷ자는 옆 변을 나눠 갖는 다른 ㄷ자를 가린다(findPilasters가 쓴 변을 다시 쓰지 않는다) — 더 없을 때까지 되풀이한다.
  for (let round = 0; round < 8; round++) {
    const fronts = findPilasters(out.map(([a, b]) => ({ a, b })), new Set(), P).map(r => r.segs[0]).filter(k => len(out[k]) >= min);
    if (!fronts.length) break;
    fronts.forEach(half);
  }
  return out;
}
const len = ([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// 기둥 곁의 짧은 벽 면선(기둥 면 밖 150 mm 안 · 기둥 면 구간 ± 150 안에 통째로 든 선)은 가져오기가 기둥 마감선으로 먹어 기둥을 키운다
// (columns.growLinings — 2026-10-12 리뷰 M-1 재측정: 중심선을 빼고도 신상중 B 500×400 → 438, 내곡중 740×840 → 881 · 630 → 686 · 500 → 529가
// 실제 벽 면 때문에 컸다). 그 선의 가까운 끝을 그 구간 밖으로 조금(≤ LINING_PUSH) 늘린다 — 구간을 벗어난 선은 마감선이 아니다(lo < −반폭 − 150).
// 한쪽 면만 늘어나 그 자리에 띠는 서지 않는다. cols: 가져오기 꼴 { c, u, w, h }.
const LINING_PUSH = 160;
function unlined(lines, cols) {
  const grows = (c, a, b) => { const g = growLinings([c], [{ a, b }])[0]; return Math.abs(g.w - c.w) > 0.5 || Math.abs(g.h - c.h) > 0.5; };
  return lines.map(([a, b, layer]) => {
    for (const c of cols) {
      if (!grows(c, a, b)) continue;
      const L = len([a, b]), d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const along = Math.abs(d[0] * c.u[0] + d[1] * c.u[1]) > 0.7 ? c.w / 2 : c.h / 2;      // 이 선과 나란한 기둥 변의 반
      const m = (c.c[0] - a[0]) * d[0] + (c.c[1] - a[1]) * d[1], lo = m - along - 150 - 1, hi = m + along + 150 + 1;
      const pre = Math.max(0, -lo), post = Math.max(0, hi - L);                                // a 앞으로 · b 뒤로 늘릴 길이
      const [k, by] = pre <= post ? ['a', pre] : ['b', post];
      if (by > LINING_PUSH) continue;
      const na = k === 'a' ? [a[0] - d[0] * by, a[1] - d[1] * by] : a, nb = k === 'b' ? [b[0] + d[0] * by, b[1] + d[1] * by] : b;
      if (!grows(c, na, nb)) { a = na; b = nb; }
    }
    return [a, b, layer];
  });
}

// 벽에 붙은 개구부 → [{ kind, wall(DXF), c(DXF), u(벽 방향 단위), width }]. 같은 openingGroup(창 하나가 T자 칸막이에서 나뉜 조각들 —
// openings.js spanPieces)은 하나로 합친다: 원 도면도 INSERT 하나였고, 가져오기가 같은 자리에서 다시 나눈다.
function openingsOf(floor, walls) {
  const byId = new Map(walls.map(w => [w.id, w]));
  const raw = [];
  for (const it of floor.items ?? []) {
    const kind = kindOf(it.productId ?? '');
    const w = byId.get(it.wallId);
    if (!kind || !w || w.virtual) continue;
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (!L) continue;
    raw.push({ kind, wall: w, c: wallPoint(w, it.t ?? 0.5), u: [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L], width: it.size?.[0] ?? 900, group: it.openingGroup ?? null });
  }
  const out = [], groups = new Map();
  for (const o of raw) {
    if (!o.group) { out.push(o); continue; }
    const g = groups.get(o.group);
    if (!g) { groups.set(o.group, [o]); out.push(o); } else g.push(o);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const head = list[0], s = o => o.c[0] * head.u[0] + o.c[1] * head.u[1];
    const lo = Math.min(...list.map(o => s(o) - o.width / 2)), hi = Math.max(...list.map(o => s(o) + o.width / 2));
    const mid = (lo + hi) / 2 - s(head);
    Object.assign(head, { c: [head.c[0] + head.u[0] * mid, head.c[1] + head.u[1] * mid], width: hi - lo });
  }
  return out;
}

// 실명 → 줄들. NAME_MAX를 넘으면 '·'·'/'·',' 뒤에서 끊는다(roomLabels ③이 그런 줄을 아랫줄과 한 이름으로 잇는다).
function nameLines(name) {
  const out = [];
  let rest = clean(name);
  while (rest.length > NAME_MAX) {
    let cut = -1;
    for (let i = Math.min(NAME_MAX, rest.length - 1) - 1; i > 0; i--) if (/[·/,]/.test(rest[i])) { cut = i + 1; break; }
    if (cut < 0) break;
    out.push(rest.slice(0, cut)); rest = rest.slice(cut);
  }
  out.push(rest);
  return out;
}

// project → DXF 텍스트. floor: 층 번호(기본 = 지금 층).
export const exportDxf = (project, opts = {}) => buildDxf(project, opts).text;

// → { text, uncutPasses, equipment, profile }. uncutPasses: 가져오기가 틈을 그 자리·폭으로 읽지 못해 벽을 끊지 않은(블록만 있는) 통로 수. 옛 skippedPasses(다시
// 들여오면 사라지는 통로 수)는 모든 통로가 PASS 블록으로 돌아온 뒤로 늘 0이라 지웠다(2026-10-12 · 최종 리뷰 X-6 · N3-3). equipment: 내보낸 기구 INSERT 수.
// profile: 쓴 프로필 id('ours' | 'archisketch' — archisketch에서 uncutPasses는 파일에서 빠진 통로 수다: 블록도 틈도 없다).
export function buildDxf(project, { floor: index = project?.activeFloor ?? 0, equipment = true, profile = 'ours' } = {}) {
  const floor = project?.floors?.[index] ?? project?.floors?.[0] ?? { walls: [], rooms: [], items: [] };
  const prof = profileOf(profile), H = Math.round(Number(floor.height) || DXF_PARAMS.height);   // 프로필 = 레이어 이름·무엇을 쓸지(dxfExportProfile.js)
  // 거의 축에 나란한 벽은 정확히 맞춘다(rectify — 1 mm 안팎의 기울기가 다시 들여올 때 T자 접점을 갈라놓았다).
  const walls = rectify((floor.walls ?? []).map(w => ({ id: w.id, a: D(w.a), b: D(w.b), t: Math.max(1, Number(w.thickness) || 200), virtual: !!w.virtual, axisShift: w.axisShift })));
  const solid = walls.filter(w => !w.virtual);
  const opens = openingsOf(floor, walls);
  const entities = [];
  // ① 벽: 몸통 윤곽(통로 자리는 끊고 문설주 선) + 중심선(같은 직선 위 조각은 한 선으로). 가져오기가 읽지 못하는 통로는 벽을 끊지 않는다(skipped).
  const passes = opens.filter(o => o.kind === 'PASS');
  const square = (floor.items ?? []).filter(it => it.kind === 'column' && it.productId !== 'column-round');
  // 기둥을 가져오기 꼴({ c, u, w, h } · DXF)로 — 벽 선 중 기둥 마감선으로 먹힐 중심선·가운데 run 선을 고르는 오라클이 쓴다(리뷰 M-1).
  const asImported = square.map(it => { const r = -(it.rot ?? 0) * Math.PI / 180; return { c: D(it.pos), u: [Math.cos(r), Math.sin(r)], w: it.size?.[0] ?? 400, h: it.size?.[1] ?? 400 }; });
  const { faces, centers, jambs, skipped } = wallOutline(solid, passes, { columns: asImported });
  const cols = square.map(it => columnRects(it));
  // 끊는 것은 벽 선 상자 밖으로 삐져나온 기둥(바깥벽 기둥)뿐이다 — 상자 안의 기둥은 이미 도면 상자(ROI) 안이다.
  const wb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [a, b] of faces) for (const p of [a, b]) { wb[0] = Math.min(wb[0], p[0]); wb[1] = Math.min(wb[1], p[1]); wb[2] = Math.max(wb[2], p[0]); wb[3] = Math.max(wb[3], p[1]); }
  const outside = p => p[0] < wb[0] - 1 || p[1] < wb[1] - 1 || p[0] > wb[2] + 1 || p[1] > wb[3] + 1;
  const corners = cols.map(rects => rects.flat()).filter(pts => pts.some(outside)), reach = DXF_PARAMS.colMax / 2 + 200;
  // 벽 선의 레이어는 WALL 또는 WALL-2(나란히 붙은 이웃 벽 — dxfExportGeom.colourWalls).
  for (const [a, b, layer] of unlined(unboxed([...splitNear(faces, corners, reach), ...jambs]), asImported)) entities.push(line(prof.wall(layer, H), a, b));
  if (prof.centers) for (const [a, b, layer] of splitNear(centers, corners, reach)) entities.push(line(layer, a, b, CENTER_LTYPE));
  if (prof.dividers) for (const w of walls.filter(x => x.virtual)) entities.push(line('DIVIDER', w.a, w.b));
  // 통로 표시(X · 레이어 '개구부' = 역할 개구부): 가져오기의 줄 잇기는 줄 끝 토막(짧고 두꺼운 run)을 문·창 **근거** 없는 다리로만 붙어
  // 있으면 떼어 버린다(bands.chainRuns · evidence.js) — 통로 틈 한가운데에 개구부 레이어 점이 있어야 그 다리가 근거를 갖는다.
  // 45° 짧은 선이라 어느 벽과도 나란하지 않아 창 구간(windowSpans)·벽 띠가 되지 않는다.
  if (prof.passMarks) for (const o of passes) {
    const k = Math.min(o.width, o.wall.t) / 2, n = [-o.u[1], o.u[0]];
    const p = (i, j) => [o.c[0] + (o.u[0] * i + n[0] * j) * k, o.c[1] + (o.u[1] * i + n[1] * j) * k];
    entities.push(line(PASS_LAYER, p(-1, -1), p(1, 1)), line(PASS_LAYER, p(-1, 1), p(1, -1)));
  }
  // ② 문·창·통로: 종류·폭·두께마다 블록 하나(틀 사각형, 삽입점 = 개구부 가운데, 로컬 x = 벽 방향). 통로도 **모두** `PASS-폭-두께` 블록을 쓴다
  // (2026-10-12 · Task 3 리뷰 concern 2 — 가져오기의 blockKind 'pass'). 벽 틈은 가져오기가 그 자리·폭으로 읽을 때만 둔다(위 skipped) —
  // 같은 자리의 블록 통로와 틈 통로는 가져오기가 하나로 앉힌다(openings.js의 충돌 검사).
  const blocks = new Map();
  for (const o of opens) {
    if (o.kind === 'PASS' && !prof.passBlock) continue;          // 아키스케치: 통로는 끊은 벽 틈으로만(블록 정의도 남기지 않는다 — 사전 검토 9-9)
    const W = Math.round(o.width), T = Math.round(o.wall.t);
    const name = `${o.kind}-${W}-${T}`;
    if (!blocks.has(name)) blocks.set(name, { name, entities: [poly('0', [[-W / 2, -T / 2], [W / 2, -T / 2], [W / 2, T / 2], [-W / 2, T / 2]])] });
    entities.push(insert(prof.opening(o.kind), name, o.c, Math.atan2(o.u[1], o.u[0]) * 180 / Math.PI));
  }
  // ③ 기둥(사각 = columnRects · 원형 = CIRCLE).
  for (const rects of cols) for (const pts of rects) entities.push(poly(prof.column, pts));
  for (const it of floor.items ?? []) {
    if (it.kind !== 'column' || it.productId !== 'column-round') continue;
    const c = D(it.pos);
    entities.push({ type: 'CIRCLE', layer: prof.column, body: [[100, 'AcDbCircle'], [10, num(c[0])], [20, num(c[1])], [30, 0], [40, num((it.size?.[0] ?? 400) / 2)]] });
  }
  // ④ 방: 윤곽 + 실명·면적(실명이 있는 방만 — 이름 없는 방의 면적 글자는 가져오기에 실명 후보가 아니다).
  if (prof.rooms) for (const room of floor.rooms ?? []) {
    const pts = (room.points ?? []).map(D);
    if (pts.length < 3) continue;
    entities.push(poly('ROOM', pts));
    if (!clean(room.name)) continue;
    const lines = nameLines(room.name), p = interiorPoint(pts);
    const top = p[1] + (lines.length - 1) * NAME_H * 0.75 + NAME_H * 0.6;
    lines.forEach((t, i) => entities.push(mtext('ROOM-TEXT', [p[0], top - i * NAME_H * 1.5], NAME_H, t)));
    // 면적은 표시 방식(areaMode)과 상관없이 늘 도면 기준(벽 중심선) 넓이다(2026-10-12 · 최종 리뷰 X-6 · M3-1): 다시 들여오면 가져오기가 면적
    // 표기를 중심선 넓이로 읽는다(reconcile.fits) — 손으로 그린 프로젝트의 기본 'net'을 따르면 안목 넓이(합성 평면 24.00 → 21.50)가 적혔다.
    const area = roomArea(room, 'center');
    if (area > 0) entities.push(mtext('ROOM-TEXT', [p[0], top - (lines.length - 1) * NAME_H * 1.5 - NAME_H * 1.2], AREA_H, `${area.toFixed(2)}㎡`));
  }
  // 상자: 벽·구획선의 끝점. 제목은 왼쪽 위 모서리에 붙여 위로 쓴다(삽입점이 상자 안이어야 가져오기의 ROI 문자로 남는다).
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const e of entities) if (e.type === 'LINE') for (const [i, j] of [[1, 2], [4, 5]]) {
    const x = +e.body[i][1], y = +e.body[j][1];
    box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
  }
  const any = Number.isFinite(box[0]);
  if (prof.title && clean(project?.name) && any) entities.push(mtext('TITLE', [box[0], box[3]], TITLE_H, project.name, 7));
  if (!any) box.splice(0, 4, 0, 0, 0, 0);
  // ⑤ 기준선 치수(dxfExportDims.js) — 다시 들여온 방의 도면 기준 넓이가 같게.
  const dims = prof.dims && any ? refDimensions(walls.map(w => ({ ...w, a: D(w.a), b: D(w.b) })), box) : { blocks: [], entities: [] };
  const eq = equipment && prof.equipment ? equipExport(floor) : { blocks: [], entities: [], count: 0 };     // ⑥ 기구(EQUIP · dxfExportEquip.js)
  return { text: dxfDocument({ layers: prof.layers(H), blocks: [...blocks.values(), ...eq.blocks, ...dims.blocks], entities: [...entities, ...eq.entities, ...dims.entities], box }), uncutPasses: skipped.length, equipment: eq.count, profile: prof.id };
}
