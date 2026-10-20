// 조리 계열 형상(계획 17 Task 5): 레인지 · 국솥 · 취반기 · 오븐 · 부침기. P = createParts(size) · o = shapeOpts(생성기가 이름에서 읽은 옵션).
import { clamp } from './parts.js';

// 레인지: 상판 + 백스플래시 + 화구 N개(가스면 삼발이) + 앞 조작 띠·노브 + 다리·하부 선반. 화구 4개 이상은 2줄.
export function range(P, o = {}) {
  const { w, d, h, hw, hd, hh } = P.size;
  const splash = Math.min(0.12, h * 0.14), top = Math.min(0.04, h * 0.06), band = Math.min(0.1, h * 0.12);
  const topY = hh - splash;                                   // 상판 윗면
  P.box('steel', [w, top, d - 0.02], [0, topY - top / 2, 0.01]);
  P.box('steel', [w, splash, 0.02], [0, topY + splash / 2, -hd + 0.01]);
  const n = clamp(Math.round(o.burners ?? 2), 1, 6), cols = n <= 3 ? n : Math.ceil(n / 2), rows = n <= 3 ? 1 : 2;
  const cw = w / cols, rd = (d - 0.06) / rows, r = Math.min(cw, rd) * 0.3;
  for (let i = 0; i < n; i++) {
    const x = -hw + cw * ((i % cols) + 0.5), z = rows === 1 ? 0.02 : -hd + 0.05 + rd * (Math.floor(i / cols) + 0.5);
    P.cyl('dark', r, 0.01, [x, topY + 0.005, z], { seg: 24 });
    if (o.gas !== false) { P.box('dark', [r * 2.1, 0.01, 0.012], [x, topY + 0.015, z]); P.box('dark', [0.012, 0.01, r * 2.1], [x, topY + 0.015, z]); }
  }
  const bandY = topY - top - band / 2;
  P.front('steel', [w, band], [0, bandY]);
  for (let i = 0; i < n; i++) P.knob(-hw + (w * (i + 0.5)) / n, bandY);
  const legTop = topY - top - band;
  P.box('steel', [w, band, d - 0.03], [0, bandY, -0.015]);    // 조작 띠 뒤의 몸통(앞판과 같은 높이)
  P.legs({ top: legTop, leg: 0.04, inset: 0.04 });
  if (legTop + hh > 0.3) P.slab('steel', -hh + Math.min(0.18, (legTop + hh) * 0.35), 0.025, 0.04);
}

// 국솥: 받침(조작판) + 둥근 솥(또는 사각 만능솥) + 테두리 + 국 표면 + 회전 핸들.
export function kettle(P, o = {}) {
  const { w, d, h, hw, hh } = P.size;
  const standH = h * 0.5, potH = h - standH - 0.01, potY0 = -hh + standH + 0.01;
  P.body('steel', [w, standH], -hh + standH / 2);
  if (o.square) {
    P.basin('steel', [0, 0], [w * 0.86, d * 0.86], hh, potH, 0.02);
    P.box('food', [w * 0.82, 0.01, d * 0.82], [0, hh - potH * 0.3, 0]);
  } else {
    const r = Math.min(w, d) * 0.4;
    P.cyl('steel', r, potH, [0, potY0 + potH / 2, 0], { seg: 32, open: true });
    P.cyl('steel', r, 0.01, [0, potY0 + 0.005, 0], { seg: 32 });
    P.cyl('food', r * 0.97, 0.01, [0, hh - potH * 0.3, 0], { seg: 32 });
    P.cyl('steel', r + 0.015, 0.025, [0, hh - 0.0125, 0], { seg: 32, open: true });
  }
  if (o.tilt) P.cyl('dark', Math.min(0.06, standH * 0.2), 0.02, [hw - 0.01, -hh + standH * 0.65, 0], { axis: 'x', seg: 16 });
  P.front('dark', [Math.min(0.24, w * 0.25), Math.min(0.1, standH * 0.25)], [-hw + Math.min(0.24, w * 0.25) / 2 + 0.05, -hh + standH * 0.7]);
  P.knob(-hw + 0.08, -hh + standH * 0.45); P.knob(-hw + 0.15, -hh + standH * 0.45);
}

// 취반기: 몸체 + 서랍 N단(손잡이) + 위 조작판 + 다리.
export function ricecooker(P, o = {}) {
  const { w, h, hh } = P.size;
  const n = clamp(Math.round(o.tiers ?? 3), 1, 6), foot = Math.min(0.08, h * 0.08), panel = Math.min(0.12, h * 0.1);
  P.body('steel', [w, h - foot], foot / 2);
  P.legs({ top: -hh + foot, leg: 0.04, inset: 0.05, foot: foot * 0.5 });
  const th = (h - foot - panel - 0.02) / n;
  for (let i = 0; i < n; i++) {
    const y = -hh + foot + 0.01 + th * (i + 0.5);
    P.front('accent', [w * 0.9, th * 0.86], [0, y]);
    P.handleH(0, y + th * 0.28, w * 0.4);
  }
  P.front('dark', [w * 0.6, panel * 0.6], [0, hh - panel / 2 - 0.01]);
}

// 오븐(콤비 스티머): 몸체 + 유리창 문 + 오른쪽 조작판·노브 + 받침대(낮은 오븐) 또는 다리.
export function oven(P, o = {}) {
  const { w, h, hw, hh } = P.size;
  const low = h < 1.2, standH = low ? Math.min(0.6, h * 0.45) : 0.12, bodyH = h - standH, y0 = -hh + standH, cy = y0 + bodyH / 2;
  P.body('steel', [w, bodyH], cy);
  if (low) { P.legs({ top: y0, leg: 0.04, inset: 0.05 }); P.slab('steel', -hh + Math.min(0.15, standH * 0.3), 0.025, 0.04); }
  else P.legs({ top: y0, leg: 0.05, inset: 0.06, foot: 0.03 });
  const pw = Math.min(0.26, w * 0.24), dw = w - pw - 0.03, dx = -hw + 0.015 + dw / 2;
  P.front('steel', [dw, bodyH * 0.9], [dx, cy]);
  P.front('glass', [dw * 0.72, bodyH * 0.62], [dx, cy + bodyH * 0.03], 1);
  P.handleH(dx, y0 + bodyH * 0.88, dw * 0.6);
  P.front('dark', [pw * 0.8, bodyH * 0.34], [hw - 0.015 - pw / 2, y0 + bodyH * 0.7]);
  P.knob(hw - 0.015 - pw / 2, y0 + bodyH * 0.4, 0.025);
}

// 부침기: 하부장 + 철판 + 3면 턱 + 노브. 후드형은 철판 위로 갓과 뒤판.
export function griddle(P, o = {}) {
  const { w, d, h, hw, hd, hh } = P.size;
  const hooded = !!o.hooded && h > 1.1;
  const workTop = hooded ? -hh + Math.min(h - 0.3, 0.9) : hh - 0.06, foot = 0.1;
  P.body('steel', [w, workTop - 0.03 - (-hh + foot)], (workTop - 0.03 - hh + foot) / 2);
  P.legs({ top: -hh + foot, leg: 0.04, inset: 0.05 });
  P.box('dark', [w - 0.06, 0.02, d - 0.1], [0, workTop - 0.02, 0.02]);
  P.box('steel', [w, 0.06, 0.02], [0, workTop, -hd + 0.01]);
  for (const s of [-1, 1]) P.box('steel', [0.02, 0.06, d - 0.02], [s * (hw - 0.01), workTop, 0.01]);
  P.knob(-hw + 0.1, workTop - 0.12); P.knob(-hw + 0.18, workTop - 0.12);
  if (hooded) {
    const capH = Math.min(0.25, hh - workTop - 0.05);
    P.box('steel', [w, capH, d * 0.7], [0, hh - capH / 2, -hd + d * 0.35]);
    P.box('steel', [w, hh - capH - workTop - 0.03, 0.02], [0, (hh - capH + workTop + 0.03) / 2, -hd + 0.01]);
  }
}
