// 보관·운반 계열 형상(계획 17 Task 5): 캐비닛(냉장·냉동·보온·소독·사물함) · 선반·건조대 · 운반차.
import { clamp } from './parts.js';

// 캐비닛: 몸체 + 문 N짝(4짝 이상은 2단) + 손잡이(양문은 가운데 쪽) + 유리창(glass) + 위 조작판(panel) + 다리 또는 바퀴.
export function cabinet(P, o = {}) {
  const { w, h, hw, hh } = P.size;
  const foot = o.casters ? 0.1 : h > 1.2 ? 0.1 : 0.05, panel = o.panel && h > 1.4 ? Math.min(0.14, h * 0.08) : 0;
  P.body('steel', [w, h - foot], foot / 2);
  P.legs({ top: -hh + foot, leg: 0.04, inset: 0.05, foot: o.casters ? 0.08 : Math.min(foot, 0.04), casters: !!o.casters });
  if (panel) P.front('dark', [w * 0.5, panel * 0.6], [0, hh - panel / 2]);
  const n = clamp(Math.round(o.doors ?? 2), 1, 6), cols = n >= 4 ? Math.ceil(n / 2) : n, rows = n >= 4 ? 2 : 1;
  const top = hh - panel - 0.01, bottom = -hh + foot + 0.01, dw = (w - 0.02) / cols, dh = (top - bottom) / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = -hw + 0.01 + dw * (c + 0.5), y = bottom + dh * (r + 0.5);
    P.front('steel', [dw - 0.012, dh - 0.012], [x, y]);
    if (o.glass) P.front('glass', [dw * 0.7, dh * 0.72], [x, y], 1);
    const hx = cols > 1 && c % 2 === 1 ? x - dw / 2 + 0.05 : x + dw / 2 - 0.05;
    P.handle(hx, y, Math.min(0.35, dh * 0.4));
  }
}

// 선반·건조대: 기둥 4 + 선반 N단 + 바퀴(이동식) 또는 발.
export function rack(P, o = {}) {
  const { w, d, h, hw, hd, hh } = P.size;
  const n = clamp(Math.round(o.tiers ?? 4), 2, 8), post = 0.03, foot = o.casters ? 0.1 : 0.03;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    P.box('steel', [post, h - foot, post], [sx * (hw - post / 2), foot / 2, sz * (hd - post / 2)]);
    if (o.casters) P.cyl('dark', 0.045, 0.03, [sx * (hw - post / 2), -hh + 0.045, sz * (hd - 0.045)], { axis: 'x', seg: 12 });
    else P.cyl('dark', post / 2, foot, [sx * (hw - post / 2), -hh + foot / 2, sz * (hd - post / 2)], { seg: 10 });
  }
  const y0 = -hh + foot + 0.06, y1 = hh - 0.01;
  for (let i = 0; i < n; i++) P.box('steel', [w - 0.01, 0.02, d - 0.01], [0, y0 + ((y1 - y0) * i) / (n - 1), 0]);
}

// 운반차: 바닥판 + 바퀴 4 + 뒤 손잡이. round(돌리)는 원판 + 바구니 통.
export function cart(P, o = {}) {
  const { w, d, h, hw, hd, hh } = P.size;
  const deckY = -hh + Math.min(0.16, h * 0.3), wr = Math.min(0.05, (deckY + hh) / 2);
  if (o.round) {
    const r = Math.min(w, d) / 2;
    P.cyl('steel', r, 0.03, [0, deckY, 0], { seg: 32 });
    for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + Math.PI / 4; P.cyl('dark', wr, 0.03, [Math.cos(a) * r * 0.7, -hh + wr, Math.sin(a) * r * 0.7], { axis: 'x', seg: 12 }); }
    P.cyl('steel', r * 0.92, hh - deckY - 0.02, [0, (hh + deckY) / 2 + 0.005, 0], { seg: 32, open: true });
    return;
  }
  P.box('steel', [w, 0.03, d], [0, deckY, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.cyl('dark', wr, 0.03, [sx * (hw - 0.06), -hh + wr, sz * (hd - 0.06)], { axis: 'x', seg: 12 });
  const ht = hh - deckY;
  if (ht > 0.25) {
    for (const s of [-1, 1]) P.box('steel', [0.025, ht, 0.025], [s * (hw - 0.02), deckY + ht / 2, -hd + 0.02]);
    P.box('steel', [w - 0.02, 0.025, 0.025], [0, hh - 0.0125, -hd + 0.02]);
    if (ht > 0.55) P.box('steel', [w, 0.025, d - 0.06], [0, deckY + ht * 0.55, 0.03]);   // 중간 선반(양념운반카 · 다단식)
  }
}
