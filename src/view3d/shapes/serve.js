// 배식·가구 계열 형상(계획 17 Task 5): 작업대 · 배식대 · 테이블(스툴 일체형 식탁) · 의자.
import { clamp } from './parts.js';

// 작업대: 상판 + 백스플래시(splash) + 하부 선반·다리, cabinet이면 하부 찬장(문 2짝). 받침대처럼 낮으면 선반 없이 다리만.
export function worktable(P, o = {}) {
  const { w, d, h, hw, hd, hh } = P.size;
  const splash = o.splash && h > 0.5 ? Math.min(0.1, h * 0.12) : 0, t = Math.min(0.04, h * 0.12), topY = hh - splash;
  P.box('steel', [w, t, d], [0, topY - t / 2, 0]);
  if (splash) P.box('steel', [w, splash, 0.015], [0, topY + splash / 2, -hd + 0.0075]);
  if (o.cabinet) {
    const foot = 0.08, ch = topY - t - (-hh + foot);
    P.body('steel', [w - 0.02, ch], -hh + foot + ch / 2);
    P.legs({ top: -hh + foot, leg: 0.04, inset: 0.05 });
    for (const s of [-1, 1]) { P.front('steel', [w / 2 - 0.02, ch - 0.03], [s * (w / 4), -hh + foot + ch / 2]); P.handle(s * 0.05, -hh + foot + ch * 0.6, Math.min(0.25, ch * 0.4)); }
    return;
  }
  P.legs({ top: topY - t, leg: 0.04, inset: 0.04, foot: Math.min(0.025, (topY - t + hh) * 0.3) });
  if (topY - t + hh > 0.4) P.slab('steel', -hh + Math.min(0.18, (topY - t + hh) * 0.3), 0.025, 0.04);
}

// 배식대: 몸체(밧드 깊이만큼 낮음) + 위 테두리 띠·칸막이 + 밧드 칸 N개(국·반찬 색을 번갈아) + 앞판 + 다리.
export function counter(P, o = {}) {
  const { w, d, h, hw, hd, hh } = P.size;
  const foot = 0.08, n = clamp(Math.round(o.wells ?? 3), 1, 8), depth = Math.min(0.12, h * 0.15), rim = 0.03;
  const bodyTop = hh - depth;
  P.body('steel', [w, bodyTop - (-hh + foot)], (bodyTop - hh + foot) / 2);
  P.legs({ top: -hh + foot, leg: 0.04, inset: 0.05 });
  P.front('steel', [w - 0.04, (bodyTop + hh - foot) * 0.75], [0, -hh + foot + (bodyTop + hh - foot) * 0.45]);
  const pd = Math.min(d * 0.6, 0.4), back = 0.04, z = -hd + back + pd / 2, front = d - back - pd;
  P.box('steel', [w, rim, back], [0, hh - rim / 2, -hd + back / 2]);
  P.box('steel', [w, rim, front], [0, hh - rim / 2, hd - front / 2]);
  const pw = (w - 0.02 * (n + 1)) / n;
  for (let i = 0; i <= n; i++) P.box('steel', [0.02, rim, pd], [-hw + 0.01 + i * (pw + 0.02), hh - rim / 2, z]);
  for (let i = 0; i < n; i++) {
    const x = -hw + 0.02 + pw / 2 + i * (pw + 0.02);
    P.basin('steel', [x, z], [pw, pd], hh, depth, 0.008);
    P.box(i % 2 ? 'greens' : 'food', [pw - 0.02, 0.01, pd - 0.02], [x, hh - depth * 0.45, z]);
  }
}

// 테이블: 상판 + 다리. stools(학교 식탁)는 가운데 보 + 양쪽 둥근 스툴(상판 아래, 바운딩 박스 안).
export function table(P, o = {}) {
  const { w, d, h, hw, hd, hh } = P.size;
  const t = Math.min(0.03, h * 0.05);
  P.box(o.stools ? 'accent' : 'steel', [w, t, d], [0, hh - t / 2, 0]);
  if (!o.stools) { P.legs({ top: hh - t, leg: 0.04, inset: 0.04, foot: 0.015 }); return; }
  const legX = Math.max(hw - 0.12, 0.05);
  for (const s of [-1, 1]) { P.box('steel', [0.05, h - t - 0.03, 0.05], [s * legX, -0.015 - t / 2, 0]); P.box('steel', [0.06, 0.03, d * 0.7], [s * legX, -hh + 0.015, 0]); }
  const beamY = -hh + Math.min(0.32, h * 0.4);
  P.box('steel', [w * 0.9, 0.04, 0.06], [0, beamY, 0]);
  const per = Math.max(1, Math.round(w / 0.6)), sr = Math.min(0.15, hd * 0.3), seatY = -hh + Math.min(0.44, h * 0.6);
  for (const sz of [-1, 1]) for (let i = 0; i < per; i++) {
    const x = -hw + (w * (i + 0.5)) / per, z = sz * (hd - sr - 0.01);
    P.cyl('accent', sr, 0.03, [x, seatY, z], { seg: 20 });
    P.box('steel', [0.03, 0.03, Math.abs(z)], [x, beamY, z / 2]);
    P.box('steel', [0.03, Math.max(seatY - beamY, 0.01), 0.03], [x, (seatY + beamY) / 2, z]);
  }
}

// 의자: 좌판 + 등판 + 다리 4.
export function chair(P) {
  const { w, d, h, hw, hd, hh } = P.size;
  const seatY = -hh + Math.min(0.46, h * 0.5), back = Math.min(0.04, d * 0.1);
  P.box('accent', [w, 0.04, d], [0, seatY, 0]);
  P.box('accent', [w, (hh - seatY) * 0.6, back], [0, hh - (hh - seatY) * 0.3, -hd + back / 2]);
  P.box('steel', [0.025, hh - seatY, 0.025], [-hw + 0.03, (hh + seatY) / 2, -hd + back + 0.0125]);
  P.box('steel', [0.025, hh - seatY, 0.025], [hw - 0.03, (hh + seatY) / 2, -hd + back + 0.0125]);
  P.legs({ top: seatY - 0.02, leg: 0.025, inset: 0.04, foot: 0.015 });
}
