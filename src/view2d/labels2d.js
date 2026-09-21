// 2D 라벨을 한 패스로 놓는다(§14.5). 규칙 셋:
// ① 자리는 화면 px로 잡는다 — 공간 이름은 방 중심 위 16 px, 면적은 중심 아래 4 px.
//    예전에는 이름을 면적에서 월드 250 mm 아래에 두어, 345 m² 도면을 화면에 맞추면 7 px이 되어 붙었다.
// ② 우선순위가 높은 것부터 화면 AABB로 자리를 잡고, 이미 놓인 것과 겹치면 생략한다.
// ③ 많이 축소하면(scale < LOD_SCALE) 공간 이름만 남긴다.
// 그리기는 기존 경로 그대로다: 뷰가 후보를 모아 placeLabels로 걸러 낸 뒤 drawLabels로 한 번에 그리고,
// ducts2d·items2d는 shown이 오면 자기 라벨을 그리지 않는다.
import { centroid } from '../geom/rooms.js';
import { wallLength } from '../geom/walls.js';
import { damperPos } from '../geom/ducts.js';
import { sub, norm, perp } from '../geom/vec.js';
import { fmtLen, fmtArea } from '../util/units.js';
import { sizeLabel, ductVisible, DUCT_COLORS } from './ducts2d.js';
import { itemVisible, itemTextLabels, ITEM_COLORS } from './items2d.js';

export const LABEL_PRIORITY = ['roomName', 'roomArea', 'wallDim', 'ductSize', 'damper', 'equip'];
export const LOD_SCALE = 0.02;      // px/mm. 이보다 작으면 공간 이름만 남긴다
export const ROOM_NAME_DY = 16;     // 방 중심에서 위로(화면 px)
export const ROOM_AREA_DY = 4;      // 방 중심에서 아래로(화면 px)
export const WALL_DIM_MIN_PX = 40;  // 이보다 짧게 보이는 벽에는 치수를 쓰지 않는다(기존 LOD 규칙)

// v.label이 그리는 배경 상자와 같은 크기로 잰다(폭 = 글자수 × size × 0.62 + 8, 높이 = size + 6).
// ctx.measureText를 쓰면 순수 함수가 아니게 되고 node 테스트에 캔버스가 필요해진다.
export function labelBox({ sp = [0, 0], text = '', size = 12 } = {}) {
  const w = String(text).length * size * 0.62 + 8, h = size + 6;
  return [sp[0] - w / 2, sp[1] - h / 2, sp[0] + w / 2, sp[1] + h / 2];
}
const hits = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

export function placeLabels(candidates, { priority = LABEL_PRIORITY, scale = null } = {}) {
  const rank = k => { const i = priority.indexOf(k); return i < 0 ? priority.length : i; };
  const pool = (candidates ?? []).filter(c => c && c.text !== '' && c.text != null
    && !(scale != null && scale < LOD_SCALE && c.kind !== 'roomName'));
  // 우선순위 → 입력 순서(같은 순위에서는 도면 배열 순서가 곧 안정된 순서다).
  const order = pool.map((c, i) => [c, i]).sort((a, b) => rank(a[0].kind) - rank(b[0].kind) || a[1] - b[1]);
  const placed = [], boxes = [];
  for (const [c] of order) {
    const box = labelBox(c);
    if (boxes.some(o => hits(o, box))) continue;
    boxes.push(box);
    placed.push(c);
  }
  return placed;
}

// 후보 목록. 플래그 판정은 지금 그리는 코드와 글자 그대로 같게 두었다(공간 이름·면적·치수는 truthy,
// 덕트·설비 라벨은 !== false) — 라벨을 옮기면서 보기 옵션의 뜻이 달라지지 않게 한다.
export function collectLabels(v, floor, { flags = {}, units = 'mm', showUnit = false, pyeong = false } = {}) {
  const out = [];
  const mm = n => n / (v.camera.scale || 1);
  const cand = (key, kind, text, at, { size = 12, color = v.COLORS.text, bg = null } = {}) =>
    ({ key, kind, text: String(text), at, sp: v.toScreen(at), size, color, bg });
  for (const r of floor.rooms ?? []) {
    const c = centroid(r.points);
    if (flags.roomName && r.name) out.push(cand(`room:${r.id}:name`, 'roomName', r.name, [c[0], c[1] - mm(ROOM_NAME_DY)], { size: 13, color: v.COLORS.dim }));
    if (flags.roomArea) out.push(cand(`room:${r.id}:area`, 'roomArea', fmtArea(r.area, { pyeong }), [c[0], c[1] + mm(ROOM_AREA_DY)]));
  }
  if (flags.dims) for (const w of floor.walls ?? []) {
    const len = wallLength(w);
    if (len * (v.camera.scale || 1) < WALL_DIM_MIN_PX) continue;
    out.push(cand(`wall:${w.id}`, 'wallDim', fmtLen(len, units, { unit: showUnit }), [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], { size: 11, color: v.COLORS.dim, bg: '#fff' }));
  }
  if (flags.ductLabels !== false) for (const d of floor.ducts ?? []) {
    if (!ductVisible(d, flags)) continue;
    for (let i = 0; i < d.segments.length; i++) {
      const a = d.points[i], b = d.points[i + 1];
      if (!a || !b) continue;
      out.push(cand(`duct:${d.id}:${i}`, 'ductSize', sizeLabel(d.segments[i]), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { size: 11, color: DUCT_COLORS.label, bg: '#fff' }));
    }
    (d.dampers ?? []).forEach((dm, i) => {
      const p = damperPos(d, dm), a = d.points[dm.segment], b = d.points[dm.segment + 1];
      if (!p || !a || !b) return;
      const n = perp(norm(sub(b, a)));
      const off = (d.segments[dm.segment]?.w ?? 200) / 2 + 400;   // 마커 반폭(+100)에서 300 mm 더 나간 자리
      out.push(cand(`damper:${d.id}:${i}`, 'damper', `${dm.type} ${Math.round(dm.w)}×${Math.round(dm.h)}`, [p[0] + n[0] * off, p[1] + n[1] * off], { size: 10, color: DUCT_COLORS.damper, bg: '#fff' }));
    });
  }
  if (flags.equipLabels !== false) for (const it of floor.items ?? []) {
    if (!itemVisible(it, flags)) continue;
    for (const t of itemTextLabels(v, it)) out.push(cand(`equip:${it.id}`, 'equip', t.text, t.at, { size: t.size, color: ITEM_COLORS.label }));
  }
  return out;
}

export function drawLabels(ctx, v, placed) {
  for (const c of placed ?? []) v.label(c.text, c.at, { size: c.size, color: c.color, bg: c.bg });
}
