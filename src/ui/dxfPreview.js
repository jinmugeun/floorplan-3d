// 검토 대화상자의 미리보기 캔버스(§18.6): 원 도면 옅은 회색 · 검출 방 파스텔 ·
// 추출 벽 두께 폴리곤 · **끊긴 끝점 빨간 ✚**. 색은 §18.6이 글자로 정한 값이다.
export const PREVIEW_COLORS = {
  trace: '#dcdcdc', wall: '#475569', openEnd: '#dc2626',
  room: ['#fde68a', '#bfdbfe', '#bbf7d0', '#fbcfe8', '#ddd6fe', '#fecaca', '#a5f3fc', '#fed7aa', '#d9f99d', '#e9d5ff'],
};
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

export function drawDxfPreview(canvas, { trace = null, walls = [], rooms = [], openEnds = [], box = null } = {}) {
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
  ctx.fillStyle = PREVIEW_COLORS.wall;
  for (const w of walls) {
    const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]], L = Math.hypot(d[0], d[1]) || 1;
    const n = [-d[1] / L * w.thickness / 2, d[0] / L * w.thickness / 2];
    const pts = [[w.a[0] + n[0], w.a[1] + n[1]], [w.b[0] + n[0], w.b[1] + n[1]], [w.b[0] - n[0], w.b[1] - n[1]], [w.a[0] - n[0], w.a[1] - n[1]]].map(p => t.at(p));
    ctx.beginPath();
    pts.forEach((p, k) => { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.closePath(); ctx.fill();
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
