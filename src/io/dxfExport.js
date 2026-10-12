// 정규화 DXF 내보내기(2026-10-12 · 계획 12 Task 3). 왜: 사용자 지시 "선이 너무 많으면 도면 자체를 간편화" — 가져온(또는 고친)
// 프로젝트를 **레이어가 몇 개뿐인 깨끗한 DXF**로 내보내면, 사람이 CAD에서 틀린 벽만 고치고 다시 들여올 수 있다. 다시 들여올 때는
// 레이어가 WALL·COLUMN·OPENING·ROOM…뿐이라 레이어 판정이 깨질 수 없다. 그래서 이 파일의 계약은 "우리 가져오기가 **같은 것**을
// 다시 읽는다"이다(tests/dxfExport.test.js의 왕복 테스트 — 벽 수·두께·방 이름·문창 폭·기둥 수).
//  - 좌표: 앱 mm(y 아래) → DXF(y 위). y 부호만 뒤집고 원점은 그대로다 — 가져오기의 toApp(toProject.makeToApp)가 벽 상자 가운데를
//    0으로 잡으므로, 다시 들여오면 같은 앱 좌표가 나온다(벽 상자가 같으면).
//  - 벽(WALL): 몸통 윤곽선(이웃 벽과 겹친 부분을 지운 합집합 경계) + **중심선**. 중심선이 있어야 두께가 bandGap(520)보다 두꺼운
//    벽도 이웃 선 간격이 bandGap 안이라 한 띠로 선다(사동중 4·내곡중 6개 — 사전 검토 3). 구획선(virtual)은 DIVIDER(역할 '기타').
//  - 문·창(OPENING): 블록 INSERT 하나가 개구부 하나 — 이름은 가져오기의 blockKind가 읽는 꼴(DR-900-200 · WIN-1200-200 ·
//    POCKET-900-200 · SLIDING-900-200: 첫 3~4자리 수가 폭, 둘째가 벽 두께)이고, 도형은 폭 × 벽 두께 틀 사각형이다.
//    통로(opening-pass)는 블록 종류가 없다 — 벽 선을 그 폭만큼 끊어(문설주 선 둘) 가져오기의 벽 틈 경로가 다시 읽게 하고 X 표시(개구부
//    레이어)를 둔다. 가져오기가 그 자리·폭으로 읽지 못하는 통로는 끊지 않는다(dxfExportGeom.passReadable · skippedPasses).
//  - 방(ROOM): 닫힌 LWPOLYLINE(역할 '기타' — 벽이 아니다) + 실명·면적 MTEXT(ROOM-TEXT · 역할 '문자' · 높이 300/250 — roomLabels의
//    200~600 범위). 면적은 따로 적는다("12.34㎡") — 다시 들여올 때 구획선·딸린 방 맞추기(reconcile.js)와 면적 검사가 쓴다.
//  - 기둥(COLUMN · 역할 '벽'): 사각 기둥은 닫힌 사각형(가져오기의 findColumns가 벽 레이어에서 찾는다 — 너무 긴 것은 겹친 사각형 둘),
//    원형 기둥은 CIRCLE(다시 들여오면 기둥으로 읽히지 않는다 — 가져오기는 사각 윤곽만 기둥으로 본다).
//  - 기준선 치수(DIM · dxfExportDims.js): 벽마다 axisShift가 가리키는 선 — 방의 도면 기준 넓이(areaCenter)가 같게 돌아온다.
// 2026-10-12 실파일 왕복(가져오기 → 내보내기 → 다시 가져오기): 사동중 벽 94 → 91 · 방 14/14 · 실명 14/14 · 문 17 · 창 30 · 면적 13/14,
// 신상중 B 벽 77 → 77 · 실명 12/12, 신상중 A 실명 11/11, 내곡중 벽 116 → 103(얇게 비낀 벽·두꺼운 벽 무리 — 보고서). 두 번째 왕복은 거의 고정점이다.
// 이 파일은 DOM을 모른다.
import { dxfDocument, CENTER_LTYPE, PASS_LAYER, num } from './dxfExportTemplate.js';
import { roomArea } from '../geom/rooms.js';
import { wallOutline, interiorPoint } from './dxfExportGeom.js';
import { refDimensions } from './dxfExportDims.js';
import { DXF_PARAMS } from './dxf/params.js';
import { findColumns } from './dxf/columns.js';

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
function unboxed(lines, P = DXF_PARAMS) {
  const out = [...lines];
  for (const r of findColumns(out.map(([a, b]) => ({ a, b })), P)) {
    const i = r.segs.reduce((m, k) => (len(out[k]) > len(out[m]) ? k : m));
    const [a, b, layer] = out[i], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (len(out[i]) < 2 * (P.minSeg + 10)) continue;
    out.splice(i, 1, [a, m, layer]);
    out.push([m, b, layer]);
  }
  return out;
}
const len = ([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]);

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

// → { text, skippedPasses }. skippedPasses: 다시 들여오면 그 폭으로 읽히지 않아 벽을 끊지 않고 X 표시만 남긴 통로 수(내보내기 알림이 쓴다).
export function buildDxf(project, { floor: index = project?.activeFloor ?? 0 } = {}) {
  const floor = project?.floors?.[index] ?? project?.floors?.[0] ?? { walls: [], rooms: [], items: [] };
  const walls = (floor.walls ?? []).map(w => ({ id: w.id, a: D(w.a), b: D(w.b), t: Math.max(1, Number(w.thickness) || 200), virtual: !!w.virtual }));
  const solid = walls.filter(w => !w.virtual);
  const opens = openingsOf(floor, walls);
  const entities = [];
  // ① 벽: 몸통 윤곽(통로 자리는 끊고 문설주 선) + 중심선(같은 직선 위 조각은 한 선으로). 가져오기가 읽지 못하는 통로는 벽을 끊지 않는다(skipped).
  const passes = opens.filter(o => o.kind === 'PASS');
  const { faces, centers, jambs, skipped } = wallOutline(solid, passes);
  const cols = (floor.items ?? []).filter(it => it.kind === 'column' && it.productId !== 'column-round').map(it => columnRects(it));
  // 끊는 것은 벽 선 상자 밖으로 삐져나온 기둥(바깥벽 기둥)뿐이다 — 상자 안의 기둥은 이미 도면 상자(ROI) 안이다.
  const wb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [a, b] of faces) for (const p of [a, b]) { wb[0] = Math.min(wb[0], p[0]); wb[1] = Math.min(wb[1], p[1]); wb[2] = Math.max(wb[2], p[0]); wb[3] = Math.max(wb[3], p[1]); }
  const outside = p => p[0] < wb[0] - 1 || p[1] < wb[1] - 1 || p[0] > wb[2] + 1 || p[1] > wb[3] + 1;
  const corners = cols.map(rects => rects.flat()).filter(pts => pts.some(outside)), reach = DXF_PARAMS.colMax / 2 + 200;
  // 벽 선의 레이어는 WALL 또는 WALL-2(나란히 붙은 이웃 벽 — dxfExportGeom.colourWalls).
  for (const [a, b, layer] of unboxed([...splitNear(faces, corners, reach), ...jambs])) entities.push(line(layer, a, b));
  for (const [a, b, layer] of splitNear(centers, corners, reach)) entities.push(line(layer, a, b, CENTER_LTYPE));
  for (const w of walls.filter(x => x.virtual)) entities.push(line('DIVIDER', w.a, w.b));
  // 통로 표시(X · 레이어 '개구부' = 역할 개구부): 가져오기의 줄 잇기는 줄 끝 토막(짧고 두꺼운 run)을 문·창 **근거** 없는 다리로만 붙어
  // 있으면 떼어 버린다(bands.chainRuns · evidence.js) — 통로 틈 한가운데에 개구부 레이어 점이 있어야 그 다리가 근거를 갖는다.
  // 45° 짧은 선이라 어느 벽과도 나란하지 않아 창 구간(windowSpans)·벽 띠가 되지 않는다.
  for (const o of passes) {
    const k = Math.min(o.width, o.wall.t) / 2, n = [-o.u[1], o.u[0]];
    const p = (i, j) => [o.c[0] + (o.u[0] * i + n[0] * j) * k, o.c[1] + (o.u[1] * i + n[1] * j) * k];
    entities.push(line(PASS_LAYER, p(-1, -1), p(1, 1)), line(PASS_LAYER, p(-1, 1), p(1, -1)));
  }
  // ② 문·창: 종류·폭·두께마다 블록 하나(틀 사각형, 삽입점 = 개구부 가운데, 로컬 x = 벽 방향).
  const blocks = new Map();
  for (const o of opens.filter(x => x.kind !== 'PASS')) {
    const W = Math.round(o.width), T = Math.round(o.wall.t);
    const name = `${o.kind}-${W}-${T}`;
    if (!blocks.has(name)) blocks.set(name, { name, entities: [poly('0', [[-W / 2, -T / 2], [W / 2, -T / 2], [W / 2, T / 2], [-W / 2, T / 2]])] });
    entities.push(insert('OPENING', name, o.c, Math.atan2(o.u[1], o.u[0]) * 180 / Math.PI));
  }
  // ③ 기둥(사각 = columnRects · 원형 = CIRCLE).
  for (const rects of cols) for (const pts of rects) entities.push(poly('COLUMN', pts));
  for (const it of floor.items ?? []) {
    if (it.kind !== 'column' || it.productId !== 'column-round') continue;
    const c = D(it.pos);
    entities.push({ type: 'CIRCLE', layer: 'COLUMN', body: [[100, 'AcDbCircle'], [10, num(c[0])], [20, num(c[1])], [30, 0], [40, num((it.size?.[0] ?? 400) / 2)]] });
  }
  // ④ 방: 윤곽 + 실명·면적(실명이 있는 방만 — 이름 없는 방의 면적 글자는 가져오기에 실명 후보가 아니다).
  for (const room of floor.rooms ?? []) {
    const pts = (room.points ?? []).map(D);
    if (pts.length < 3) continue;
    entities.push(poly('ROOM', pts));
    if (!clean(room.name)) continue;
    const lines = nameLines(room.name), p = interiorPoint(pts);
    const top = p[1] + (lines.length - 1) * NAME_H * 0.75 + NAME_H * 0.6;
    lines.forEach((t, i) => entities.push(mtext('ROOM-TEXT', [p[0], top - i * NAME_H * 1.5], NAME_H, t)));
    const area = roomArea(room, project.areaMode === 'center' ? 'center' : 'net');
    if (area > 0) entities.push(mtext('ROOM-TEXT', [p[0], top - (lines.length - 1) * NAME_H * 1.5 - NAME_H * 1.2], AREA_H, `${area.toFixed(2)}㎡`));
  }
  // 상자: 벽·구획선의 끝점. 제목은 왼쪽 위 모서리에 붙여 위로 쓴다(삽입점이 상자 안이어야 가져오기의 ROI 문자로 남는다).
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const e of entities) if (e.type === 'LINE') for (const [i, j] of [[1, 2], [4, 5]]) {
    const x = +e.body[i][1], y = +e.body[j][1];
    box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
  }
  const any = Number.isFinite(box[0]);
  if (clean(project?.name) && any) entities.push(mtext('TITLE', [box[0], box[3]], TITLE_H, project.name, 7));
  if (!any) box.splice(0, 4, 0, 0, 0, 0);
  // ⑤ 기준선 치수(dxfExportDims.js) — 다시 들여온 방의 도면 기준 넓이가 같게.
  const dims = any ? refDimensions(floor.walls, box) : { blocks: [], entities: [] };
  return { text: dxfDocument({ blocks: [...blocks.values(), ...dims.blocks], entities: [...entities, ...dims.entities], box }), skippedPasses: skipped.length };
}
