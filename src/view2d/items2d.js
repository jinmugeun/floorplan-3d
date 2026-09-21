import { itemCorners, itemAABB, RAD } from '../geom/items.js';
import { symbolParts } from '../products/symbols.js';
import { productById } from '../products/catalog.js';
import { norm, sub, add, mul } from '../geom/vec.js';
import { equipLabel } from '../vent/equipment.js';
import { LABEL_BG } from './ducts2d.js';

export const ITEM_COLORS = { line: '#3a4351', body: '#eef1f4', sel: '#8b5cf6', locked: '#e5484d', label: '#5b6775', rot: '#1f5fd0' };
export const HANDLE_PX = 7;      // 크기 핸들 한 변(화면 px)
export const HANDLE_HIT_PX = 9;  // 핸들 히트 반경(화면 px)
export const ROT_OFFSET_PX = 26; // 바운딩 박스 아래 회전 핸들까지(화면 px)

export const symbolOf = item => productById(item.productId)?.symbol ?? 'box';

// 위에서 본 도면에서 무엇이 위에 오는가(§13.7): 바닥 → 벽 → 천장. 천장 부착(후드·디퓨저)이
// 조리기구 위에 그려지고, 역순으로 순회하는 픽(itemDrag.pick)에서 먼저 잡힌다.
export const ATTACH_ORDER = { floor: 0, floorLay: 0, wall: 1, ceiling: 2 };
// 안정 정렬: 같은 순위는 배열 순서(= z 순서)를 지킨다(Array.prototype.sort는 ES2019부터 안정이다).
// 원본 배열은 바꾸지 않는다 — 호출자가 스토어 스냅샷을 그대로 넘긴다.
export function drawOrder(items) {
  return [...(items ?? [])].sort((a, b) => (ATTACH_ORDER[a?.attach] ?? 0) - (ATTACH_ORDER[b?.attach] ?? 0));
}
// itemDrag.getDrag().kind 중 "아이템을 끌고 있는" 것들. view2d가 실시간 충돌 계산을 건너뛸지
// 판단하는 데 쓴다(§13.5) — 영역 선택('box')이나 덕트 드래그는 여기 들지 않는다.
export const ITEM_DRAG_KINDS = new Set(['items', 'scale', 'rotate']);

// 2D(v2)와 3D(v3)가 같은 규칙을 쓴다.
export function itemVisible(item, flags = {}) {
  if (item.hidden) return false;
  if (item.kind === 'column' || item.kind === 'opening') return flags.structures !== false;
  if (item.attach === 'wall') return flags.wallItems !== false;
  if (item.attach === 'ceiling') return flags.ceilingItems !== false;
  return flags.floorItems !== false;
}

// 벽에 앉은 창·개구부는 평면에서 심벌을 그리지 않는다(§14.4): 벽 조각이 그 자리를 비우고
// walls2d가 벽 두께 기준으로 유리 두 줄 + 양끝 눈금을 그린다. 심벌까지 그리면 같은 구멍에
// body 채움 + ±깊이/6 유리선이 더해져 줄이 네 개가 되고(창), 개구부(kind 'opening')는 심벌이
// window라서 "빈 자리만"이어야 할 통로가 창처럼 보인다. 문(kind 'door')은 호가 도면의 뜻이라 그대로다.
// 라이브러리 썸네일(symbolSvg)과 3D(itemShapes)는 이 경로를 지나지 않아 그대로다.
export const WALL_GAP_KINDS = new Set(['window', 'opening']);
// 구멍을 뚫어 줄 벽이 실제로 있을 때만 건너뛴다. 벽이 지워져 wallId가 떠 있으면(구멍이 없다)
// 심벌이 남아야 아이템이 평면에서 사라지지 않는다. 배치 미리보기(placeTool)는 floor에 없으므로
// drawItems를 지나지 않고 — drawItem의 기본값 embedded = false로 심벌을 그대로 보여 준다.
export const drawnByWall = (item, walls = []) => WALL_GAP_KINDS.has(item?.kind)
  && item?.attach === 'wall' && !!item?.wallId && (walls ?? []).some(w => w?.id === item.wallId);

function drawPart(ctx, p, color) {
  ctx.beginPath();
  if (p.t === 'rect') ctx.rect(p.x, p.y, p.w, p.h);
  else if (p.t === 'line') { ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); }
  else if (p.t === 'circle') ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  else if (p.t === 'arc') ctx.arc(p.x, p.y, p.r, p.a0, p.a1);
  if (p.fill) { ctx.fillStyle = p.fill === 'solid' ? color : ITEM_COLORS.body; ctx.fill(); }
  ctx.stroke();
}

// 심벌의 글자 부품(설비 라벨)을 월드 좌표 + 화면 px 크기로. 글자를 아이템 로컬 좌표계에서 그리면
// 반전·회전에 따라 뒤집혀 읽을 수 없으므로, 위치만 월드로 옮기고 화면 좌표계에서 똑바로 그린다.
// drawItem과 labels2d.collectLabels가 같은 자리를 계산하도록 한 함수로 둔다(§14.5).
export function itemTextLabels(v, item) {
  const parts = symbolParts(symbolOf(item), item.size[0], item.size[1], { text: equipLabel(item) });
  const c = Math.cos(RAD(item.rot)), s = Math.sin(RAD(item.rot));
  return parts.filter(p => p.t === 'text').map(part => {
    const lx = (item.flipH ? -1 : 1) * part.x, ly = (item.flipV ? -1 : 1) * part.y;
    return {
      text: part.text,
      at: [item.pos[0] + lx * c - ly * s, item.pos[1] + lx * s + ly * c],
      size: Math.max(9, Math.min(28, part.size * v.camera.scale)),
    };
  });
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
export function drawItem(ctx, v, item, { alpha = 1, outline = null, showCode = false, labels = true, equipLabels = true, embedded = false } = {}) {
  const k = v.camera.scale, s = v.toScreen(item.pos);
  const showLabel = labels && equipLabels;
  // embedded = 벽이 이미 그린 자리(창·개구부): 부품은 하나도 없고 선택 외곽선·라벨만 남는다.
  const parts = embedded ? [] : symbolParts(symbolOf(item), item.size[0], item.size[1], { text: showLabel ? equipLabel(item) : null });
  if (parts.length) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(s[0], s[1]);
    ctx.rotate(RAD(item.rot));
    ctx.scale((item.flipH ? -1 : 1) * k, (item.flipV ? -1 : 1) * k);
    ctx.lineWidth = 1.4 / k;
    ctx.strokeStyle = ITEM_COLORS.line;
    for (const part of parts) if (part.t !== 'text') drawPart(ctx, part, item.color);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  if (showLabel) for (const t of itemTextLabels(v, item)) v.label(t.text, t.at, { size: t.size, color: ITEM_COLORS.label });
  if (outline) strokePoly(ctx, v, itemCorners(item), outline, 2);
  if (labels && showCode) {
    const box = itemAABB(item);
    v.label(`${item.name} ${item.code}`.trim(), [item.pos[0], box.max[1] + 12 / k], { size: 11, color: ITEM_COLORS.label, bg: LABEL_BG });
  }
}

// 드래그 중의 자리(§15.2). itemDrag가 만든 Map<id, item>을 그리기 경로에 얹는 유일한 방법이다:
// 뷰가 층 하나를 프리뷰 자리로 바꿔(previewFloor) 벽 개구부·라벨·충돌·선택 표시가 모두 같은
// 자리를 보게 한다 — 모듈마다 preview를 따로 받으면 어느 하나가 빠져 한 프레임 어긋난다.
export const previewed = (item, preview = null) => preview?.get?.(item?.id) ?? item;
// 프리뷰로 받을 수 있는 것은 itemDrag의 Map<id, item> 하나뿐이다. 그리기 도구(wall·room·duct·
// pathArray)의 getPreview()는 이름만 같은 고스트 정보(평범한 객체)라서, 뷰가 그것을 프리뷰로
// 착각하면 `[...preview.keys()]`가 매 프레임 터진다. 정규화를 한 자리에 두고 뷰가 여기로만
// 들어오게 한다: Map이 아니면 "프리뷰 없음"이다.
export const dragPreview = preview => (preview instanceof Map ? preview : null);
export function previewFloor(floor, preview = null) {
  const pv = dragPreview(preview);
  if (!pv?.size) return floor;
  return { ...floor, items: (floor.items ?? []).map(it => previewed(it, pv)) };
}

export function drawItems(ctx, v, floor, { sel = null, flags = {}, collisions = null, labels = true, dim = null, shown = null } = {}) {
  const selected = new Set(sel?.type === 'item' ? [sel.id] : sel?.type === 'multi' && sel.kind === 'item' ? sel.ids : []);
  for (const item of drawOrder(floor.items)) {
    if (!itemVisible(item, flags)) continue;
    const bad = collisions?.has(item.id);
    const on = selected.has(item.id);
    const outline = bad ? ITEM_COLORS.locked : on ? (item.locked ? ITEM_COLORS.locked : ITEM_COLORS.sel) : null;
    // shown이 오면 설비 라벨은 뷰의 라벨 패스가 그린다(겹치면 생략하는 LOD를 거치게 — §14.5).
    // shown이 오면 제품 코드 라벨도 뷰의 라벨 패스가 그린다(겹치면 생략 — §14.5, m-3).
    drawItem(ctx, v, item, { outline, showCode: !!flags.productCode && !shown, labels, equipLabels: flags.equipLabels !== false && !shown, alpha: dim ? dim(item) : 1, embedded: drawnByWall(item, floor.walls) });
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
