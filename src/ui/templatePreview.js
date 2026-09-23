// 템플릿 카드의 축소 평면(§16.10 · 감사 §14). 방 폴리곤 하나와 제품 발자국 몇 개를 96 px
// 정사각 안에 종횡비를 지켜 넣는다. 정규화(순수)와 그리기(캔버스)를 나눠 두어 좌표 규칙을
// 캔버스 없이 테스트한다 — ui/는 view2d/를 import할 수 없으므로(아키텍처 §9) 여기서 직접 그린다.
import { itemAABB } from '../geom/items.js';

export const PREVIEW_PX = 96;
const OUTLINE = '#5b6775';
const FILL = 'rgba(31,95,208,0.10)';

export function previewBox(points) {
  if (!points?.length) return null;
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

// 방 폴리곤과 제품을 0~size 좌표로 옮긴다. 긴 변이 (size − 2·pad)를 채우고 짧은 변은 가운데에 둔다.
// bbox → 0~size 좌표 변환 하나. 두 진입점(방 하나 · 층 전체)이 같은 규칙을 쓴다.
function fitTransform(box, size, pad) {
  const w = Math.max(1, box.x1 - box.x0), h = Math.max(1, box.y1 - box.y0);
  const span = size - pad * 2;
  const k = Math.min(span / w, span / h);
  const ox = pad + (span - w * k) / 2, oy = pad + (span - h * k) / 2;
  return p => [ox + (p[0] - box.x0) * k, oy + (p[1] - box.y0) * k];
}
const itemBoxes = (items, at) => items.map(it => {
  const a = itemAABB(it);
  const [x0, y0] = at(a.min), [x1, y1] = at(a.max);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), color: it.color };
});

export function previewShapes(room, items = [], { size = PREVIEW_PX, pad = 4 } = {}) {
  const box = previewBox(room?.points);
  if (!box) return { outline: [], boxes: [] };
  const at = fitTransform(box, size, pad);
  return { outline: room.points.map(at), boxes: itemBoxes(items, at) };
}

// 층 전체의 축소 도면(§16.12): 시작 화면 카드가 "어떤 도면인가"를 보여 준다. bbox는 방 폴리곤과
// 벽 끝점을 함께 본다.
export function projectShapes(floor, { size = PREVIEW_PX, pad = 4 } = {}) {
  const rooms = floor?.rooms ?? [];
  const walls = floor?.walls ?? [];
  const pts = [...rooms.flatMap(r => r.points ?? []), ...walls.flatMap(w => [w.a, w.b])];
  const box = previewBox(pts);
  if (!box) return { outline: [], rooms: [], boxes: [] };
  const at = fitTransform(box, size, pad);
  const polys = rooms.map(r => (r.points ?? []).map(at)).filter(p => p.length > 2);
  // 방이 검출되지 않은 도면(열린 벽만 남은 자동 저장본)은 벽 선을 그려야 카드가 비지 않는다(리뷰 I-2).
  // 방이 있으면 폴리곤이 이미 벽 자리를 보여 주므로 선을 겹쳐 그리지 않는다(96 px에서는 잡음이다).
  return { outline: polys[0] ?? [], rooms: polys, walls: polys.length ? [] : walls.map(w => [at(w.a), at(w.b)]), boxes: itemBoxes(floor?.items ?? [], at) };
}

// 캔버스가 없거나 2D 컨텍스트를 못 얻는 환경(jsdom 기본)에서는 조용히 지나간다.
export function drawPreview(canvas, shapes) {
  const ctx = canvas?.getContext?.('2d');
  // 방이 하나도 없어도 벽·제품이 있으면 그린다(리뷰 I-2): outline만 보던 가드가 방이 검출되지
  // 않은 도면(열린 벽·제품만)의 카드를 통째로 비워 두었다.
  if (!ctx || !(shapes?.rooms?.length || shapes?.outline?.length || shapes?.walls?.length || shapes?.boxes?.length)) return false;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  // 방이 여러 개면 전부 그린다(projectShapes). 방 하나짜리(previewShapes)는 outline 하나다.
  for (const poly of (shapes.rooms ?? [shapes.outline]).filter(p => p?.length > 2)) {
    ctx.beginPath();
    poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fillStyle = FILL; ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1; ctx.stroke();
  }
  // 방 없는 도면의 벽 선(projectShapes가 그때만 채운다).
  for (const seg of shapes.walls ?? []) {
    ctx.beginPath();
    ctx.moveTo(seg[0][0], seg[0][1]); ctx.lineTo(seg[1][0], seg[1][1]);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1; ctx.stroke();
  }
  for (const b of shapes.boxes ?? []) {
    ctx.fillStyle = b.color ?? '#9aa4b2';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.5;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
  return true;
}

// 카드가 다시 그려진 뒤 캔버스를 채운다(materialRows.mountSwatches와 같은 자리).
// shapesFor(id) → previewShapes의 결과. null을 돌려주면 그 카드는 비워 둔다.
export function mountPreviews(root, shapesFor) {
  for (const canvas of root?.querySelectorAll?.('canvas[data-tpl]') ?? []) {
    canvas.width = PREVIEW_PX; canvas.height = PREVIEW_PX;
    drawPreview(canvas, shapesFor(canvas.dataset.tpl));
  }
}

// 도면이 없는 시작 화면 카드의 축소 그림(§17.12(1) · 감사 §25): 빈 격자와 도면 사진 자리표시.
// 새 그리기 코드를 만들지 않는다 — drawPreview가 받는 shape 배열로 만든다.
export function placeholderShapes(kind, { size = PREVIEW_PX, pad = 8 } = {}) {
  const a = pad, b = size - pad;
  if (kind === 'upload') {
    // 사진 틀 + 대각선 둘. 틀은 rooms에도 넣어야 그려진다: drawPreview의 `shapes.rooms ?? [outline]`은
    // 빈 **배열**을 통과시키므로(?? 는 null·undefined만 본다) rooms: []이면 틀이 사라진다.
    const frame = [[a, a], [b, a], [b, b], [a, b]];
    return { outline: frame, rooms: [frame], walls: [[[a, a], [b, b]], [[a, b], [b, a]]], boxes: [] };
  }
  const step = (b - a) / 4, walls = [];
  for (let i = 0; i <= 4; i++) { walls.push([[a + i * step, a], [a + i * step, b]]); walls.push([[a, a + i * step], [b, a + i * step]]); }
  return { outline: [], rooms: [], walls, boxes: [] };
}
