// 검토 대화상자의 미리보기 캔버스(§18.6): 원 도면 옅은 회색 · 검출 방 파스텔 · 기구 옅은 사각형 ·
// 추출 벽 두께 폴리곤 · 구획선 점선 · **끊긴 끝점 빨간 ✚**. 색은 §18.6이 글자로 정한 값이다(기구 두 색만 계획 13이 더했다).
import { itemCorners, isEmbed } from '../geom/items.js';

export const PREVIEW_COLORS = {
  trace: '#dcdcdc', wall: '#475569', openEnd: '#dc2626',
  room: ['#fde68a', '#bfdbfe', '#bbf7d0', '#fbcfe8', '#ddd6fe', '#fecaca', '#a5f3fc', '#fed7aa', '#d9f99d', '#e9d5ff'],
  // 기구(2026-10-12 · 계획 13 Task 3): 벽(#475569)보다 훨씬 옅은 슬레이트 — 벽과 함께 보이되 벽으로 읽히지 않게. 테두리는 붙어 선 작업대가 한 덩이로 뭉치지 않게.
  item: '#cbd5e1', itemEdge: '#94a3b8',
};
// 미리보기에 그리는 아이템 = 가져온 기구(바닥·벽걸이·천장 후드). 문·창·개구부는 벽 속이고 기둥은 §18.6 그대로 그리지 않는다.
const isPreviewItem = it => Array.isArray(it?.pos) && Array.isArray(it?.size) && !isEmbed(it) && it.kind !== 'column';
export const OPEN_END_R = 6;

export function previewTransform(box, w, h, pad = 10) {
  const [x0, y0, x1, y1] = box;
  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  const k = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  const ox = (w - bw * k) / 2 - x0 * k, oy = (h - bh * k) / 2 - y0 * k;
  return { k, ox, oy, at: p => [p[0] * k + ox, p[1] * k + oy] };
}

export function boundsOf({ walls = [], trace = null } = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const w of walls) for (const p of [w.a, w.b]) {
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
    y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
  }
  if (trace?.box && Number.isFinite(trace.box[0])) {
    x0 = Math.min(x0, trace.box[0]); y0 = Math.min(y0, trace.box[1]);
    x1 = Math.max(x1, trace.box[2]); y1 = Math.max(y1, trace.box[3]);
  }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

export function drawDxfPreview(canvas, { trace = null, walls = [], rooms = [], items = [], openEnds = [], box = null } = {}) {
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return null;
  const b = box ?? boundsOf({ walls, trace });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!b) return null;
  const t = previewTransform(b, canvas.width, canvas.height);
  const segs = trace?.segs;
  if (segs?.length) {
    ctx.strokeStyle = PREVIEW_COLORS.trace;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i + 3 < segs.length; i += 4) {
      const a = t.at([segs[i], segs[i + 1]]), c = t.at([segs[i + 2], segs[i + 3]]);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]);
    }
    ctx.stroke();
  }
  rooms.forEach((r, i) => {
    if (!r.points?.length) return;
    ctx.fillStyle = PREVIEW_COLORS.room[i % PREVIEW_COLORS.room.length];
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    r.points.forEach((p, k) => { const q = t.at(p); if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  });
  // 기구(2026-10-12 · 계획 13 Task 3): 방 위 · 벽 아래에 rot대로 돈 사각형(geom/items.itemCorners — 3D와 같은 귀). 사동중 226개라 한 경로로 칠하고 긋는다.
  const equip = items.filter(isPreviewItem);
  if (equip.length) {
    ctx.fillStyle = PREVIEW_COLORS.item;
    ctx.strokeStyle = PREVIEW_COLORS.itemEdge;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (const it of equip) {
      itemCorners(it).forEach((p, k) => { const q = t.at(p); if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      ctx.closePath();
    }
    ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = PREVIEW_COLORS.wall;
  for (const w of walls) {
    if (w.virtual) continue;
    const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]], L = Math.hypot(d[0], d[1]) || 1;
    const n = [-d[1] / L * w.thickness / 2, d[0] / L * w.thickness / 2];
    const pts = [[w.a[0] + n[0], w.a[1] + n[1]], [w.b[0] + n[0], w.b[1] + n[1]], [w.b[0] - n[0], w.b[1] - n[1]], [w.a[0] - n[0], w.a[1] - n[1]]].map(p => t.at(p));
    ctx.beginPath();
    pts.forEach((p, k) => { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.closePath(); ctx.fill();
  }
  // 구획선(wall.virtual — 면적 표기·난간·실명으로 그은 것)은 몸통이 없으므로 2D 평면(view2d/walls2d.js)처럼 중심선 점선 한 줄이다(2026-10-12 · 계획 12
  // Task 6: 실명만으로 그은 구획선은 제안이라 사람이 미리보기에서 알아봐야 한다 — 20 mm 두께 폴리곤은 벽과 구별되지 않았다).
  const dividers = walls.filter(w => w.virtual);
  if (dividers.length) {
    ctx.strokeStyle = PREVIEW_COLORS.wall;
    ctx.lineWidth = 1;
    ctx.setLineDash?.([6, 4]);
    ctx.beginPath();
    for (const w of dividers) { const a = t.at(w.a), c = t.at(w.b); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); }
    ctx.stroke();
    ctx.setLineDash?.([]);
  }
  // 끊긴 끝점이 이 기능의 결론이다 — 마지막에 그려 아무것도 덮지 못하게 한다.
  ctx.strokeStyle = PREVIEW_COLORS.openEnd;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const p of openEnds) {
    const q = t.at(p);
    ctx.moveTo(q[0] - OPEN_END_R, q[1]); ctx.lineTo(q[0] + OPEN_END_R, q[1]);
    ctx.moveTo(q[0], q[1] - OPEN_END_R); ctx.lineTo(q[0], q[1] + OPEN_END_R);
  }
  ctx.stroke();
  return t;
}
