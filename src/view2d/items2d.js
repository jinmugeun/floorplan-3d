import { itemCorners, itemAABB, RAD } from '../geom/items.js';
import { symbolParts } from '../products/symbols.js';
import { productById } from '../products/catalog.js';
import { norm, sub, add, mul } from '../geom/vec.js';

export const ITEM_COLORS = { line: '#3a4351', body: '#eef1f4', sel: '#8b5cf6', locked: '#e5484d', label: '#5b6775', rot: '#1f5fd0' };
export const HANDLE_PX = 7;      // 크기 핸들 한 변(화면 px)
export const HANDLE_HIT_PX = 9;  // 핸들 히트 반경(화면 px)
export const ROT_OFFSET_PX = 26; // 바운딩 박스 아래 회전 핸들까지(화면 px)

export const symbolOf = item => productById(item.productId)?.symbol ?? 'box';

// 2D(v2)와 3D(v3)가 같은 규칙을 쓴다.
export function itemVisible(item, flags = {}) {
  if (item.hidden) return false;
  if (item.kind === 'column' || item.kind === 'opening') return flags.structures !== false;
  if (item.attach === 'wall') return flags.wallItems !== false;
  if (item.attach === 'ceiling') return flags.ceilingItems !== false;
  return flags.floorItems !== false;
}

function drawPart(ctx, p, color) {
  ctx.beginPath();
  if (p.t === 'rect') ctx.rect(p.x, p.y, p.w, p.h);
  else if (p.t === 'line') { ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); }
  else if (p.t === 'circle') ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  else if (p.t === 'arc') ctx.arc(p.x, p.y, p.r, p.a0, p.a1);
  if (p.fill) { ctx.fillStyle = p.fill === 'solid' ? color : ITEM_COLORS.body; ctx.fill(); }
  ctx.stroke();
}

function strokePoly(ctx, v, pts, color, lw = 2, dash = null) {
  ctx.save();
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  pts.forEach((p, i) => { const s = v.toScreen(p); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); });
  ctx.closePath(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
  ctx.restore();
}

// 캔버스는 (translate → rotate → scale)로 아이템 로컬 mm 좌표계를 세운 뒤 심벌 부품을 그린다.
// 월드→화면 변환이 회전 없는 균일 축척이라 이렇게 겹쳐도 어긋나지 않는다.
export function drawItem(ctx, v, item, { alpha = 1, outline = null, showCode = false, labels = true } = {}) {
  const k = v.camera.scale, s = v.toScreen(item.pos);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(s[0], s[1]);
  ctx.rotate(RAD(item.rot));
  ctx.scale((item.flipH ? -1 : 1) * k, (item.flipV ? -1 : 1) * k);
  ctx.lineWidth = 1.4 / k;
  ctx.strokeStyle = ITEM_COLORS.line;
  for (const part of symbolParts(symbolOf(item), item.size[0], item.size[1])) drawPart(ctx, part, item.color);
  ctx.restore();
  ctx.globalAlpha = 1;
  if (outline) strokePoly(ctx, v, itemCorners(item), outline, 2);
  if (labels && showCode) {
    const box = itemAABB(item);
    v.label(`${item.name} ${item.code}`.trim(), [item.pos[0], box.max[1] + 12 / k], { size: 11, color: ITEM_COLORS.label, bg: '#fff' });
  }
}

export function drawItems(ctx, v, floor, { sel = null, flags = {}, collisions = null, labels = true, dim = null } = {}) {
  const selected = new Set(sel?.type === 'item' ? [sel.id] : sel?.type === 'multi' && sel.kind === 'item' ? sel.ids : []);
  for (const item of floor.items) {
    if (!itemVisible(item, flags)) continue;
    const bad = collisions?.has(item.id);
    const on = selected.has(item.id);
    const outline = bad ? ITEM_COLORS.locked : on ? (item.locked ? ITEM_COLORS.locked : ITEM_COLORS.sel) : null;
    drawItem(ctx, v, item, { outline, showCode: !!flags.productCode, labels, alpha: dim ? dim(item) : 1 });
  }
}

// 핸들 0 = 좌상, 시계 방향으로 8개(짝수 = 코너, 홀수 = 변 중앙). 회전 핸들은 로컬 아래쪽으로 나간다.
export function itemHandles(item, pxPerMm) {
  const c = itemCorners(item);
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const handles = [c[0], mid(c[0], c[1]), c[1], mid(c[1], c[2]), c[2], mid(c[2], c[3]), c[3], mid(c[3], c[0])];
  const bottom = mid(c[3], c[2]);
  const outDir = norm(sub(bottom, item.pos));
  return { corners: c, handles, rotHandle: add(bottom, mul(outDir, ROT_OFFSET_PX / pxPerMm)), center: [...item.pos] };
}

export function drawItemSelection(ctx, v, item, { locked = false } = {}) {
  const color = locked ? ITEM_COLORS.locked : ITEM_COLORS.sel;
  const h = itemHandles(item, v.camera.scale);
  strokePoly(ctx, v, h.corners, color, 2);
  ctx.save();
  for (const p of h.handles) {
    const s = v.toScreen(p);
    ctx.beginPath(); ctx.rect(s[0] - HANDLE_PX / 2, s[1] - HANDLE_PX / 2, HANDLE_PX, HANDLE_PX);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
  }
  if (!locked && !(item.attach === 'wall' && item.wallId)) { // 회전 핸들: 아래쪽 파란 호 + 손잡이(벽 부착 제품은 벽 방향에 고정이라 없다)
    const s = v.toScreen(h.rotHandle);
    ctx.beginPath(); ctx.arc(s[0], s[1], HANDLE_PX, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = ITEM_COLORS.rot; ctx.lineWidth = 2; ctx.stroke();
    const b = v.toScreen(h.handles[5]);
    ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(s[0], s[1]); ctx.strokeStyle = ITEM_COLORS.rot; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.restore();
}
