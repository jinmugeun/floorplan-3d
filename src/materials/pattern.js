// 마감재 무늬를 px 정사각 타일 안의 부품 목록으로 만든다(symbols.js와 같은 방식: 순수 함수라 테스트된다).
// 부품: { t:'rect', x, y, w, h, fill } | { t:'line', x1, y1, x2, y2, fill, lw } | { t:'circle', x, y, r, fill }
// 스와치(materialPanel)·텍스처(texture.js)·미리보기(materialEditor)가 같은 목록을 각자 그린다.
const rect = (x, y, w, h, fill) => ({ t: 'rect', x, y, w, h, fill });
const line = (x1, y1, x2, y2, fill, lw = 1) => ({ t: 'line', x1, y1, x2, y2, fill, lw });
const circle = (x, y, r, fill) => ({ t: 'circle', x, y, r, fill });

// 반점은 언제나 같은 자리에 있어야 한다(캐시된 텍스처와 스와치가 같은 그림이어야 하므로 난수를 쓰지 않는다).
const SPOTS = [[0.12, 0.18], [0.37, 0.08], [0.62, 0.22], [0.86, 0.14], [0.08, 0.46], [0.31, 0.58],
  [0.55, 0.44], [0.79, 0.62], [0.18, 0.77], [0.44, 0.88], [0.68, 0.81], [0.91, 0.9]];

export function patternParts(material, px = 64) {
  const m = material ?? {};
  const base = m.base ?? '#ffffff', accent = m.accent ?? '#d8dde3';
  const parts = [rect(0, 0, px, px, base)];
  const u = v => v * px;                       // 0~1 비율을 타일 px로
  const lw = div => Math.max(1, px / div);     // 타일 크기에 비례한 선 굵기(최소 1)
  switch (m.pattern) {
    case 'stripe':
      for (let i = 0; i < 4; i++) parts.push(rect(u(i / 4), 0, px / 8, px, accent));
      return parts;
    case 'tile':
      parts.push(line(0, px / 2, px, px / 2, accent, lw(32)), line(px / 2, 0, px / 2, px, accent, lw(32)));
      return parts;
    case 'plank':
      for (let i = 1; i < 4; i++) parts.push(line(0, u(i / 4), px, u(i / 4), accent, lw(48)));
      parts.push(line(px / 2, 0, px / 2, u(0.25), accent, lw(64)), line(u(0.25), u(0.5), u(0.25), u(0.75), accent, lw(64)));
      return parts;
    case 'brick':
      for (let r = 0; r < 4; r++) {
        parts.push(line(0, u(r / 4), px, u(r / 4), accent, lw(40)));
        const off = r % 2 ? 0 : px / 2;        // 한 줄씩 반 칸 엇물린다
        parts.push(line(off, u(r / 4), off, u((r + 1) / 4), accent, lw(40)));
      }
      return parts;
    case 'speckle':
      for (const [sx, sy] of SPOTS) parts.push(circle(u(sx), u(sy), lw(40), accent));
      return parts;
    case 'marble':
      parts.push(line(0, u(0.2), px, u(0.45), accent, lw(36)), line(u(0.1), px, u(0.7), 0, accent, lw(60)), line(0, u(0.8), px, u(0.62), accent, lw(60)));
      return parts;
    case 'concrete':
      parts.push(line(0, u(0.33), px, u(0.3), accent, lw(64)), line(0, u(0.72), px, u(0.75), accent, lw(64)));
      for (const [sx, sy] of SPOTS.slice(0, 6)) parts.push(circle(u(sx), u(sy), lw(56), accent));
      return parts;
    case 'carpet':
      for (let i = 0; i < 8; i++) {
        parts.push(line(u(i / 8), 0, u(i / 8), px, accent, lw(96)));
        parts.push(line(0, u(i / 8), px, u(i / 8), accent, lw(96)));
      }
      return parts;
    case 'steel':
      for (let i = 0; i < 12; i++) parts.push(line(u(i / 12), 0, u(i / 12), px, accent, lw(128)));
      return parts;
    default:
      return parts;                            // solid과 모르는 값
  }
}

export function drawPattern(ctx, material, px = 64) {
  for (const p of patternParts(material, px)) {
    if (p.t === 'rect') { ctx.fillStyle = p.fill; ctx.fillRect(p.x, p.y, p.w, p.h); continue; }
    if (p.t === 'circle') { ctx.fillStyle = p.fill; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); continue; }
    ctx.strokeStyle = p.fill; ctx.lineWidth = p.lw ?? 1;
    ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
  }
}
