// 공기질 센서 함체(2026-10-26 · 사용자 CAD 그림 1~10 + 외형도 DXF 공기질센서함체_외형도.dxf — 외형 W510 × H310 × D217, 벽에 거는 함체).
// 몸체 재질은 스테인리스(사용자가 렌더 비교로 골랐다). 벽 쪽 몸체 + 앞 덮개 두 쪽(이음매 = 어두운 띠 · 깊이 가운데) · 앞면 관측창 410 × 130(R15, 나사 8)
// · 양옆 둥근 덮개 75 × 76(R12 → 5 mm 깎아 65 × 66 R7 — 외형도의 이중 테두리, 앞쪽 3 · 뒤쪽 위 1) · 오른쪽(+x) 경첩 2(36 × 80) · 왼쪽(−x) 잠금쇠
// · 바닥 통풍 슬롯 20(8 × 67, 앞쪽) + 슬롯 양끝 구멍 4 + 배선 구멍 3(Ø20, 뒤쪽). 벽에 붙는 배면(키홀 4)은 보이지 않아 그리지 않는다.
// 자리는 외형도 블록(AQ_BOX_FRONT · SIDE_R · SIDE_L · BOTTOM — 제3각법)의 mm 값을 상자 중심 원점으로 옮긴 것이고, 아이템 크기 비율로 늘인다(크기를 바꿔도 같은 꼴).
// 아이템 크기 = 외형(돌출 제외 510 × 217 × 310)이라 옆 덮개·경첩·잠금쇠의 돌출은 몸체 폭을 SIDE씩 줄여 바운딩 박스 안에 둔다(510 기준 몸체 500).
// 앞면의 창·나사는 FRONT, 바닥 슬롯·구멍은 FOOT 두께다. 덮개·경첩·잠금쇠의 돌출 높이는 외형도에 없다(“돌출 제외”) — SIDE 안의 값이다.
const CAD = [510, 217, 310];

export function enclosure(P) {
  const { w, d, h, hw, hd, hh } = P.size;
  const sx = w / (CAD[0] / 1000), sz = d / (CAD[1] / 1000), sy = h / (CAD[2] / 1000), s = Math.min(sx, sy, sz);
  const X = v => (v / 1000) * sx, Y = v => (v / 1000) * sy, Z = v => (v / 1000) * sz, R = v => (v / 1000) * s;
  const SIDE = Math.min(0.005, w * 0.02), FRONT = Math.min(0.002, d * 0.02), FOOT = Math.min(0.001, h * 0.01), GAP = Math.min(0.003, d * 0.02);
  const bx = hw - SIDE, zf = hd - FRONT, y0 = -hh + FOOT, bh = h - FOOT, yc = y0 + bh / 2;

  // 두 쪽: 뒤(벽 쪽, −hd … −GAP/2) · 앞(덮개, GAP/2 … zf). 이음매는 겉면과 같은 높이의 어두운 띠다 — 안으로 들이면 작은 깊이 차가
  // 윤곽선을 띄엄띄엄 그어(ISO에서 윗면 이음선이 점선) 오히려 덜 읽혔다.
  P.box('steel', [2 * bx, bh, hd - GAP / 2], [0, yc, (-hd - GAP / 2) / 2]);
  P.box('steel', [2 * bx, bh, zf - GAP / 2], [0, yc, (zf + GAP / 2) / 2]);
  P.box('dark', [2 * bx, bh, GAP], [0, yc, 0]);

  // 앞면(AQ_BOX_FRONT): 관측창(위로 40 mm 치우침) + 둘레 나사 8(위 3 · 아래 3 · 좌우 1, Ø5).
  P.plate('dark', [X(410), Y(130)], R(15), FRONT, [0, Y(40), zf + FRONT / 2], { taper: FRONT });   // 가장자리 45° — 얇은 옆 띠의 톱니 윤곽선을 없앤다
  for (const [vx, vy] of [[-150, 120], [0, 120], [150, 120], [-150, -40], [0, -40], [150, -40], [-220, 40], [220, 40]]) {
    P.cyl('dark', R(2.5), FRONT, [X(vx), Y(vy), zf + FRONT / 2], { axis: 'z', seg: 6 });
  }

  // 양옆 둥근 덮개(SIDE_R · SIDE_L): 앞쪽(z +63) 위·가운데·아래 · 뒤쪽(z −63) 위. 옆면 밖으로 SIDE의 0.8 · 가장자리 5 mm 깎음(윤곽선이 두 테두리를 다 긋는다).
  const bossT = SIDE * 0.8;
  for (const side of [-1, 1]) {
    for (const [vz, vy] of [[63, 97], [63, 0], [63, -97], [-63, 97]]) {
      P.plate('steel', [Z(75), Y(76)], R(12), bossT, [side * (bx + bossT / 2), Y(vy), Z(vz)], { face: side > 0 ? '+x' : '-x', taper: R(5) });
    }
  }

  // 오른쪽 경첩 2(SIDE_R — 이음매를 걸친 날개 36 × 80 + 축) · 왼쪽 잠금쇠(SIDE_L — 뒤쪽 받침 63.5 × 30 + 손잡이 44 × 16 · 앞쪽 걸이 20.5 × 20).
  for (const vy of [87, -87]) {
    P.box('accent', [SIDE * 0.3, Y(80), Z(36)], [bx + SIDE * 0.15, Y(vy), 0]);
    P.cyl('accent', Math.min(R(3), SIDE / 2), Y(80), [bx + SIDE / 2, Y(vy), 0], { seg: 8 });
  }
  P.box('accent', [SIDE * 0.6, Y(30), Z(63.5)], [-bx - SIDE * 0.3, 0, Z(-31.75)]);
  P.box('accent', [SIDE * 0.4, Y(16), Z(44)], [-bx - SIDE * 0.8, 0, Z(-28)]);
  P.box('accent', [SIDE * 0.6, Y(20), Z(20.5)], [-bx - SIDE * 0.3, 0, Z(10.25)]);

  // 바닥(AQ_BOX_BOTTOM): 앞쪽 통풍 슬롯 20(간격 20) + 양끝 구멍 4(Ø12) · 뒤쪽 배선 구멍 3(Ø20).
  for (let i = 0; i < 20; i++) P.box('dark', [X(8), FOOT, Z(67)], [X(-190 + i * 20), -hh + FOOT / 2, Z(54)]);
  for (const [vx, vz, r] of [[-215, 68.5, 6], [-215, 38.5, 6], [215, 68.5, 6], [215, 38.5, 6], [-185, -80.5, 10], [-135, -80.5, 10], [-85, -80.5, 10]]) {
    P.cyl('dark', R(r), FOOT, [X(vx), -hh + FOOT / 2, Z(vz)], { seg: 8 });
  }
}
