// 2D 덕트 그리기(명세 DT-03·§11.4). 구간마다 단면 너비만큼의 띠 + 꼭짓점 + 단면 라벨 + 댐퍼 마커.
// 색은 급기 파랑·배기 빨강(FLOW_COLORS 한 곳에서 온다).
import { ductPolygons, damperPos } from '../geom/ducts.js';
import { FLOW_COLORS } from '../vent/equipment.js';
import { sub, norm, perp } from '../geom/vec.js';

export const DUCT_COLORS = { ...FLOW_COLORS, sel: '#8b5cf6', locked: '#e5484d', label: '#5b6775', damper: '#f59e0b' };
// 치수·덕트 단면·댐퍼 라벨의 배경 상자(§14.5 "반투명 상자"). 불투명 흰 상자는 벽선과 덕트 띠를
// 통째로 지웠다. labels2d가 여기서 가져다 쓰고 다시 내보낸다(의존 방향을 지키려고 정의만 여기 둔다).
export const LABEL_BG = 'rgba(255,255,255,0.85)';
export const DUCT_FILL_ALPHA = 0.35;
export const DUCT_HANDLE_PX = 7;
export const DUCT_DOT_PX = 2.5;        // 꼭짓점 점 반지름(§11.5) — 선택 핸들보다 작다
export const DUCT_DOT_ALPHA = 0.7;

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
  if (showLabel) v.label(`${damper.type} ${Math.round(damper.w)}×${Math.round(damper.h)}`, [p[0] + n[0] * (half + 300), p[1] + n[1] * (half + 300)], { size: 10, color: DUCT_COLORS.damper, bg: LABEL_BG });
}

// labels는 뷰의 옵션이다(미니맵은 labels:false로 그린다 — 글자가 층 전체를 덮지 않게).
// 보기 플래그 ductLabels는 그 위에서 덕트 라벨만 따로 끈다: 둘 중 하나라도 꺼지면 글자를 그리지 않는다.
export function drawDucts(ctx, v, floor, { sel = null, flags = {}, labels = true, shown = null } = {}) {
  const selId = sel?.type === 'duct' ? sel.id : null;
  // shown이 오면 단면·댐퍼 라벨은 뷰의 라벨 패스가 그린다(§14.5). 댐퍼 마커 선은 라벨과 무관하게 남는다.
  const showLabels = labels && flags.ductLabels !== false && !shown;
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
    // 꼭짓점 점(§11.5): 고른 덕트는 선택 도구가 큰 핸들을 그리므로 여기서는 나머지 덕트만 찍는다.
    // 얕은 꺾임이나 겹친 덕트에서 "여기가 꼭짓점"이라는 유일한 신호다.
    if (duct.id !== selId) {
      ctx.save();
      ctx.globalAlpha = DUCT_DOT_ALPHA; ctx.fillStyle = color;
      for (const p of duct.points) { const s = v.toScreen(p); ctx.beginPath(); ctx.arc(s[0], s[1], DUCT_DOT_PX, 0, Math.PI * 2); ctx.fill(); }
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
        v.label(sizeLabel(duct.segments[i]), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { size: 11, color: DUCT_COLORS.label, bg: LABEL_BG });
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
