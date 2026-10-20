// 세척 계열 형상(계획 17 Task 5): 싱크(세정대·손세정대·잔반 처리대) · 식기세척기(도어형 · 컨베이어형).
import { clamp } from './parts.js';

// 싱크: 상판 테두리 + 볼 N개(칸막이) + 수전 + 백스플래시 + 다리·하부 선반. 담금(deep)은 볼이 깊다.
export function sink(P, o = {}) {
  const { w, d, h, hw, hd, hh } = P.size;
  const n = clamp(Math.round(o.bowls ?? 1), 1, 4), splash = Math.min(0.15, h * 0.15), rim = 0.035;
  const topY = hh - splash, depth = Math.min(o.deep ? 0.4 : 0.28, (topY + hh) * 0.45);
  const bw = (w - 0.06 - 0.04 * (n - 1)) / n, bd = d - 0.1;
  P.box('steel', [w, rim, 0.05], [0, topY - rim / 2, hd - 0.025]);
  P.box('steel', [w, rim, 0.05], [0, topY - rim / 2, -hd + 0.025]);
  for (const s of [-1, 1]) P.box('steel', [0.03, rim, d - 0.1], [s * (hw - 0.015), topY - rim / 2, 0]);
  for (let i = 0; i < n; i++) {
    const x = -hw + 0.03 + bw / 2 + i * (bw + 0.04);
    P.basin('steel', [x, 0], [bw, bd], topY, depth);
    if (i < n - 1) P.box('steel', [0.04, rim, bd], [x + bw / 2 + 0.02, topY - rim / 2, 0]);
    P.faucet(x, topY, -hd + 0.05);
  }
  P.box('steel', [w, splash, 0.02], [0, topY + splash / 2, -hd + 0.01]);
  P.legs({ top: topY - depth, leg: 0.04, inset: 0.04 });
  if (topY - depth + hh > 0.35) P.slab('steel', -hh + Math.min(0.18, (topY - depth + hh) * 0.35), 0.025, 0.04);
}

// 식기세척기: 컨베이어형 = 아래 탱크 + 가운데 터널(위 덮개) + 양끝 레일 + 커튼 · 도어형 = 아래 장 + 위 후드 상자 + 손잡이.
export function dishwasher(P, o = {}) {
  const { w, d, h, hw, hd, hh } = P.size;
  const foot = 0.1;
  if (o.conveyor) {
    const tunnelH = Math.min(h * 0.5, 0.9), railY = hh - tunnelH, tw = w * 0.62;
    P.body('steel', [w, railY - 0.03 - (-hh + foot)], (railY - 0.03 - hh + foot) / 2);
    P.legs({ top: -hh + foot, leg: 0.05, inset: 0.06 });
    P.box('steel', [w, 0.03, d], [0, railY - 0.015, 0]);
    P.box('steel', [tw, tunnelH, d], [0, hh - tunnelH / 2, 0]);
    for (const s of [-1, 1]) P.box('dark', [0.01, tunnelH * 0.55, d * 0.8], [s * (tw / 2 + 0.006), railY + tunnelH * 0.3, 0]);
    P.front('dark', [Math.min(0.3, tw * 0.3), Math.min(0.12, tunnelH * 0.2)], [tw / 2 - Math.min(0.3, tw * 0.3) / 2 - 0.03, hh - tunnelH * 0.2]);
    return;
  }
  const lowH = h * 0.5;
  P.body('steel', [w, lowH - foot], -hh + foot + (lowH - foot) / 2);
  P.legs({ top: -hh + foot, leg: 0.04, inset: 0.05 });
  P.box('steel', [w, h - lowH, d], [0, hh - (h - lowH) / 2, 0]);
  P.handleH(0, -hh + lowH + (h - lowH) * 0.2, w * 0.6);
  P.front('dark', [w * 0.5, Math.min(0.08, lowH * 0.15)], [0, -hh + lowH - Math.min(0.08, lowH * 0.15)]);
}
