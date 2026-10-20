// 그 밖의 형상(계획 17 Task 5): 후드 · 기계(세척기·절단기·처리기 …) · 벽부착 · 판(매트·칸막이).

// 후드: 아래 띠(속 빈 사각 테) + 사다리꼴 갓 + 윗면 덮개 + 덕트 목 + 필터 판 2장. 아래에서 올려다보면 필터가 보인다.
export function hood(P) {
  const { w, d, h, hw, hd, hh } = P.size;
  const skirt = Math.min(0.2, h * 0.3), neck = Math.min(0.2, h * 0.3), t = 0.02, y0 = -hh + skirt, y1 = hh - neck;
  P.box('steel', [w, skirt, t], [0, -hh + skirt / 2, hd - t / 2]);
  P.box('steel', [w, skirt, t], [0, -hh + skirt / 2, -hd + t / 2]);
  for (const s of [-1, 1]) P.box('steel', [t, skirt, d - 2 * t], [s * (hw - t / 2), -hh + skirt / 2, 0]);
  P.frustum('steel', [w, d], [w * 0.6, d * 0.6], y0, y1);
  P.box('steel', [w * 0.6, 0.01, d * 0.6], [0, y1 - 0.005, 0]);
  P.box('steel', [w * 0.25, neck, d * 0.25], [0, hh - neck / 2, 0]);
  for (const s of [-1, 1]) P.box('dark', [w * 0.86, 0.01, d * 0.14], [0, -hh + skirt * 0.6, s * d * 0.28]);
}

// 기계: 몸체 + 상부 유닛(키가 크면) + 조작판·노브 + 발. round(Φ 규격 — 탈피기·잔반통)는 원통.
export function machine(P, o = {}) {
  const { w, d, h, hw, hd, hh } = P.size;
  if (o.round) {
    const r = Math.min(w, d) / 2;
    P.cyl('steel', r * 0.96, h - 0.05, [0, 0.025 - 0.0, 0], { seg: 32 });
    P.cyl('dark', r * 0.9, 0.03, [0, -hh + 0.015, 0], { seg: 32 });
    P.cyl('steel', r, 0.02, [0, hh - 0.01, 0], { seg: 32 });
    return;
  }
  const foot = Math.min(0.06, h * 0.1), unit = h > 0.8 ? Math.min(0.3, h * 0.25) : 0, bodyH = h - foot - unit;
  P.body('steel', [w, bodyH], -hh + foot + bodyH / 2);
  if (unit) P.box('steel', [w * 0.7, unit, d * 0.7], [0, hh - unit / 2, -hd * 0.1]);
  P.legs({ top: -hh + foot, leg: 0.04, inset: 0.05, foot: foot * 0.6 });
  const pw = Math.min(0.25, w * 0.3), ph = Math.min(0.12, bodyH * 0.2), py = -hh + foot + bodyH * 0.8;
  P.front('dark', [pw, ph], [hw - pw / 2 - 0.03, py]);
  P.knob(hw - pw / 2 - 0.03, py - ph / 2 - 0.04);
}

// 벽부착(에어커튼·손소독기·호스릴): 몸체 + 아래쪽 토출구(어두운 띠).
export function wallunit(P) {
  const { w, h, hh } = P.size;
  P.body('steel', [w, h], 0);
  const g = Math.min(h * 0.3, 0.06);
  P.front('dark', [w * 0.85, g], [0, -hh + g / 2 + 0.01]);
}

// 판: 가장 얇은 축이 높이면 바닥 매트(어두운 판), 깊이면 세운 칸막이(테두리 + 가운데 판).
export function panel(P) {
  const { w, d, h, hw, hh } = P.size;
  if (h <= Math.min(w, d)) { P.box('dark', [w, h, d], [0, 0, 0]); return; }
  const f = Math.min(0.03, w * 0.1, h * 0.1);
  P.box('accent', [w - 2 * f, h - 2 * f, d * 0.6], [0, 0, 0]);
  P.box('steel', [w, f, d], [0, hh - f / 2, 0]);
  P.box('steel', [w, f, d], [0, -hh + f / 2, 0]);
  for (const s of [-1, 1]) P.box('steel', [f, h - 2 * f, d], [s * (hw - f / 2), 0, 0]);
}
