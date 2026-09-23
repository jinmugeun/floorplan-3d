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
export function previewShapes(room, items = [], { size = PREVIEW_PX, pad = 4 } = {}) {
  const box = previewBox(room?.points);
  if (!box) return { outline: [], boxes: [] };
  const w = Math.max(1, box.x1 - box.x0), h = Math.max(1, box.y1 - box.y0);
  const span = size - pad * 2;
  const k = Math.min(span / w, span / h);
  const ox = pad + (span - w * k) / 2, oy = pad + (span - h * k) / 2;
  const at = p => [ox + (p[0] - box.x0) * k, oy + (p[1] - box.y0) * k];
  const boxes = items.map(it => {
    const a = itemAABB(it);
    const [x0, y0] = at(a.min), [x1, y1] = at(a.max);
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), color: it.color };
  });
  return { outline: room.points.map(at), boxes };
}

// 캔버스가 없거나 2D 컨텍스트를 못 얻는 환경(jsdom 기본)에서는 조용히 지나간다.
export function drawPreview(canvas, shapes) {
  const ctx = canvas?.getContext?.('2d');
  if (!ctx || !shapes?.outline?.length) return false;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  shapes.outline.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.fillStyle = FILL; ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1; ctx.stroke();
  for (const b of shapes.boxes) {
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
