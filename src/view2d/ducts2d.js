// 2D 덕트 그리기(명세 DT-03·§11.4). 구간마다 단면 너비만큼의 띠 + 꼭짓점 + 단면 라벨 + 댐퍼 마커.
// 색은 급기 파랑·배기 빨강(FLOW_COLORS 한 곳에서 온다).
import { ductPolygons, damperPos } from '../geom/ducts.js';
import { FLOW_COLORS } from '../vent/equipment.js';
import { sub, norm, perp } from '../geom/vec.js';

export const DUCT_COLORS = { ...FLOW_COLORS, sel: '#8b5cf6', locked: '#e5484d', label: '#5b6775', damper: '#f59e0b' };
export const DUCT_FILL_ALPHA = 0.35;
export const DUCT_HANDLE_PX = 7;

// 2D(v2)와 3D(v3)가 같은 규칙을 쓴다(itemVisible과 같은 자리).
export const ductVisible = (duct, flags = {}) => !duct.hidden && flags.ducts !== false;
export const sizeLabel = seg => `${Math.round(seg?.w ?? 0)}×${Math.round(seg?.h ?? 0)}`;
const colorOf = duct => (duct.kind === 'supply' ? DUCT_COLORS.supply : DUCT_COLORS.exhaust);

function path(ctx, v, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => { const s = v.toScreen(p); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); });
  ctx.closePath();
}

// 댐퍼 마커: 구간에 직교하는 짧은 선 + "VD 550×450" 라벨(명세 DT-06).
function drawDamper(ctx, v, duct, damper, showLabel) {
  const p = damperPos(duct, damper);
  const a = duct.points[damper.segment], b = duct.points[damper.segment + 1];
  if (!p || !a || !b) return;
  const n = perp(norm(sub(b, a)));
  const half = (duct.segments[damper.segment]?.w ?? 200) / 2 + 100;
  const s0 = v.toScreen([p[0] + n[0] * half, p[1] + n[1] * half]);
  const s1 = v.toScreen([p[0] - n[0] * half, p[1] - n[1] * half]);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]);
  ctx.strokeStyle = DUCT_COLORS.damper; ctx.lineWidth = 3; ctx.stroke();
  ctx.restore();
  if (showLabel) v.label(`${damper.type} ${Math.round(damper.w)}×${Math.round(damper.h)}`, [p[0] + n[0] * (half + 300), p[1] + n[1] * (half + 300)], { size: 10, color: DUCT_COLORS.damper, bg: '#fff' });
}

export function drawDucts(ctx, v, floor, { sel = null, flags = {} } = {}) {
  const selId = sel?.type === 'duct' ? sel.id : null;
  const showLabels = flags.ductLabels !== false;
  for (const duct of floor.ducts ?? []) {
    if (!ductVisible(duct, flags)) continue;
    const color = colorOf(duct);
    for (const quad of ductPolygons(duct)) {
      ctx.save();
      path(ctx, v, quad);
      ctx.globalAlpha = DUCT_FILL_ALPHA; ctx.fillStyle = color; ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    // 설비에 연결된 꼭짓점은 작은 원으로 표시한다(연결됐다는 유일한 2D 신호다).
    for (const c of duct.connections) {
      const p = duct.points[c.point];
      if (!p) continue;
      const s = v.toScreen(p);
      ctx.save();
      ctx.beginPath(); ctx.arc(s[0], s[1], 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
    if (showLabels) {
      for (let i = 0; i < duct.segments.length; i++) {
        const a = duct.points[i], b = duct.points[i + 1];
        v.label(sizeLabel(duct.segments[i]), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { size: 11, color: DUCT_COLORS.label, bg: '#fff' });
      }
    }
    for (const d of duct.dampers) drawDamper(ctx, v, duct, d, showLabels);
    if (duct.id === selId) {   // 선택 윤곽만 여기서 그린다(핸들은 선택 도구가 그린다)
      ctx.save();
      for (const quad of ductPolygons(duct)) { path(ctx, v, quad); ctx.strokeStyle = duct.locked ? DUCT_COLORS.locked : DUCT_COLORS.sel; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.restore();
    }
  }
}

// 고른 덕트의 꼭짓점 핸들. 고른 구간은 굵게, 고른 꼭짓점은 채워서 표시한다.
export function drawDuctSelection(ctx, v, duct, sel = null) {
  const color = duct.locked ? DUCT_COLORS.locked : DUCT_COLORS.sel;
  ctx.save();
  ductPolygons(duct).forEach((quad, i) => {
    path(ctx, v, quad);
    ctx.strokeStyle = color; ctx.lineWidth = sel?.segment === i ? 3 : 2; ctx.stroke();
  });
  duct.points.forEach((p, i) => {
    const s = v.toScreen(p), r = DUCT_HANDLE_PX / 2;
    ctx.beginPath(); ctx.rect(s[0] - r, s[1] - r, DUCT_HANDLE_PX, DUCT_HANDLE_PX);
    ctx.fillStyle = sel?.vertex === i ? color : '#fff'; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
  });
  ctx.restore();
}
