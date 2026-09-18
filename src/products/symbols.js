// 2D 심벌을 아이템 로컬 mm 좌표(원점 = 중심, +x = 너비, +y = 깊이)의 부품 목록으로 한 번만 정의한다.
// 라이브러리 썸네일(SVG)과 2D 캔버스(Canvas 2D)가 같은 목록을 각자의 방식으로 그린다.
// 부품: { t:'rect', x, y, w, h, fill? } | { t:'line', x1, y1, x2, y2 } | { t:'circle', x, y, r, fill? } | { t:'arc', x, y, r, a0, a1 }
// fill: 'body' = 연한 채움, 'solid' = 아이템 색으로 채움, 없으면 선만.

const rect = (x, y, w, h, fill) => ({ t: 'rect', x, y, w, h, ...(fill ? { fill } : {}) });
const line = (x1, y1, x2, y2) => ({ t: 'line', x1, y1, x2, y2 });
const circle = (x, y, r, fill) => ({ t: 'circle', x, y, r, ...(fill ? { fill } : {}) });
const arc = (x, y, r, a0, a1) => ({ t: 'arc', x, y, r, a0, a1 });

export function symbolParts(symbol, w, d) {
  const hw = w / 2, hd = d / 2;
  const body = rect(-hw, -hd, w, d, 'body');
  const inset = Math.min(60, w * 0.12, d * 0.12);
  switch (symbol) {
    case 'bed': {
      const pw = w * 0.42, ph = d * 0.12, m = Math.min(w, d) * 0.04;
      return [body,
        rect(-hw + m, -hd + m, pw, ph),                 // 베개 왼쪽
        rect(hw - m - pw, -hd + m, pw, ph),             // 베개 오른쪽
        line(-hw, -hd + d * 0.3, hw, -hd + d * 0.3)];   // 이불선
    }
    case 'sofa': {
      const back = d * 0.25, armw = w * 0.12;
      return [body, rect(-hw, -hd, w, back), rect(-hw, -hd, armw, d), rect(hw - armw, -hd, armw, d)];
    }
    case 'table':
      return [body, rect(-hw + inset, -hd + inset, w - inset * 2, d - inset * 2)];
    case 'chair':
      return [body, rect(-hw, -hd, w, d * 0.2), rect(-hw + inset, -hd + d * 0.28, w - inset * 2, d * 0.62)];
    case 'door':
      return [line(-hw, -hd, -hw, hd), line(hw, -hd, hw, hd),  // 문틀
        line(-hw, 0, -hw, -w),                                  // 문짝(위쪽으로 열림)
        arc(-hw, 0, w, -Math.PI / 2, 0)];                       // 열림 궤적
    case 'window':
      return [body, line(-hw, -d / 6, hw, -d / 6), line(-hw, d / 6, hw, d / 6)];
    case 'column':
      return [rect(-hw, -hd, w, d, 'solid'), line(-hw, -hd, hw, hd), line(-hw, hd, hw, -hd)];
    case 'columnRound': {
      const r = Math.min(w, d) / 2;
      return [circle(0, 0, r, 'solid'), line(-r, -r, r, r), line(-r, r, r, -r)];
    }
    case 'circle':
      return [circle(0, 0, Math.min(w, d) / 2, 'body')];
    case 'sink': {
      const bw = w * 0.5, bh = d * 0.6;
      return [body, rect(-bw / 2, -bh / 2 + d * 0.08, bw, bh), circle(0, d * 0.08, Math.min(w, d) * 0.05),
        line(0, -hd + d * 0.08, 0, -hd + d * 0.22)];            // 수전
    }
    case 'range': {
      const rx = w * 0.22, ry = d * 0.22, r = Math.min(w, d) * 0.14;
      return [body, circle(-rx, -ry, r), circle(rx, -ry, r), circle(-rx, ry, r), circle(rx, ry, r)];
    }
    case 'fridge':
      return [body, line(-hw, -hd + d * 0.12, hw, -hd + d * 0.12), line(-w * 0.1, -hd + d * 0.12, -w * 0.1, hd)];
    case 'lamp': {
      const r = Math.min(w, d) / 2, k = r * 0.35;
      return [circle(0, 0, r, 'body'), line(-r - k, 0, -r, 0), line(r, 0, r + k, 0), line(0, -r - k, 0, -r), line(0, r, 0, r + k)];
    }
    default:
      return [body];
  }
}

export function symbolSvg(symbol, w, d, { box = 56, stroke = '#3a4351', body = '#eef1f4', solid = '#cfd4da' } = {}) {
  const parts = symbolParts(symbol, w, d);
  // 축척은 부품 목록의 실제 범위로 잡는다. 문 심벌은 열림 궤적(반지름 w)이 아이템 깊이 밖으로
  // 크게 나가므로 w·d만 보면 호가 잘린다.
  const span = (lo, hi) => Math.max(Math.abs(lo), Math.abs(hi)) * 2;
  let x0 = -w / 2, x1 = w / 2, y0 = -d / 2, y1 = d / 2;
  const grow = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (const p of parts) {
    if (p.t === 'rect') { grow(p.x, p.y); grow(p.x + p.w, p.y + p.h); }
    else if (p.t === 'line') { grow(p.x1, p.y1); grow(p.x2, p.y2); }
    else { grow(p.x - p.r, p.y - p.r); grow(p.x + p.r, p.y + p.r); }
  }
  const k = (box * 0.86) / Math.max(span(x0, x1), span(y0, y1), 1);
  const f = n => Number(Number(n).toFixed(2));
  const paint = fill => (fill === 'solid' ? solid : fill === 'body' ? body : 'none');
  const shapes = parts.map(p => {
    if (p.t === 'rect') return `<rect x="${f(p.x)}" y="${f(p.y)}" width="${f(p.w)}" height="${f(p.h)}" fill="${paint(p.fill)}"/>`;
    if (p.t === 'line') return `<line x1="${f(p.x1)}" y1="${f(p.y1)}" x2="${f(p.x2)}" y2="${f(p.y2)}"/>`;
    if (p.t === 'circle') return `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(p.r)}" fill="${paint(p.fill)}"/>`;
    const p0 = [p.x + p.r * Math.cos(p.a0), p.y + p.r * Math.sin(p.a0)];
    const p1 = [p.x + p.r * Math.cos(p.a1), p.y + p.r * Math.sin(p.a1)];
    return `<path d="M ${f(p0[0])} ${f(p0[1])} A ${f(p.r)} ${f(p.r)} 0 0 1 ${f(p1[0])} ${f(p1[1])}"/>`;
  }).join('');
  return `<svg class="tile-svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" aria-hidden="true">`
    + `<g transform="translate(${box / 2} ${box / 2}) scale(${f(k)})" fill="none" stroke="${stroke}" stroke-width="${f(1.6 / k)}" stroke-linejoin="round">${shapes}</g></svg>`;
}
