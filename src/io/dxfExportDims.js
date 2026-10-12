// 정규화 DXF의 **기준선 치수**(2026-10-12 · 계획 12 Task 3). 왜: 가져온 방의 "도면 기준" 넓이(areaCenter)는 벽 중심선이 아니라
// 도면의 치수가 가리키는 선(벽마다 axisShift — io/dxf/refLines.js)으로 잰다. 치수를 내보내지 않으면 다시 들여올 때 axisShift가 0이 되어
// 실 면적이 바뀌고(사동중 면적 표기 14곳 중 0곳만 맞았다), 그 면적으로 맞추는 구획선·딸린 방(reconcile.js)도 달라진다.
// 그래서 축에 나란한 벽마다 그 기준선 좌표(중심 + axisShift · 왼쪽 법선)를 **연속 치수**로 적는다: x 좌표는 도면 아래·위,
// y 좌표는 왼쪽·오른쪽에 한 줄씩 + 전체 치수 하나 — 좌표마다 세 번 이상 재져 refLines의 "여럿이 재는 선"(refGrid 3 · 강한 기준선)이 된다.
// 치수선은 도면에서 DIM_OFF 떨어뜨리고 보조선을 짧게 둔다 — 붙어 있으면 선 덩어리가 이어져 도면 후보 상자(regions)가 넓어진다.
// DIMENSION은 그림 블록(*D…)이 있어야 CAD가 그린다 — 치수선·보조선·틱·숫자를 익명 블록에 넣는다(AC1021).
import { num } from './dxfExportTemplate.js';

const DIM_OFF = 2500;            // 도면 상자에서 치수선까지(mm) — 선 덩어리 잇기(ROI_LINK 500 · 이웃 칸)보다 멀리
const ROW = 600;                 // 같은 쪽 두 줄(연속 · 전체) 사이
const TEXT_H = 250;

// 앱 좌표의 벽 → 기준선 좌표 { x: [앱 x], y: [앱 y] }. refLines.refOf와 같은 규칙: 세로 벽(|dx| ≤ 1)은 x, 가로 벽(|dy| ≤ 1)은 y,
// 기준선 = a[i] + axisShift × 왼쪽 법선(−dy, dx)/L의 i 성분. 기운 벽·구획선은 재지 않는다.
export function refCoords(walls) {
  const xs = new Set(), ys = new Set();
  for (const w of walls ?? []) {
    if (w.virtual) continue;
    const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy);
    if (!L) continue;
    const s = Number(w.axisShift) || 0;
    if (Math.abs(dx) <= 1) xs.add(Math.round(w.a[0] + s * (-dy / L)));
    else if (Math.abs(dy) <= 1) ys.add(Math.round(w.a[1] + s * (dx / L)));
  }
  return { x: [...xs].sort((a, b) => a - b), y: [...ys].sort((a, b) => a - b) };
}

// 치수 하나: p, q(DXF) — 축 'x'면 가로로 x 거리를, 'y'면 세로로 y 거리를 잰다. at = 치수선 자리(x축이면 y값, y축이면 x값), side = 도면 쪽(±1).
function dimension(name, axis, p, q, at, side) {
  const X = axis === 'x', v = X ? q[0] - p[0] : q[1] - p[1];
  const P = X ? [p[0], at] : [at, p[1]], Q = X ? [q[0], at] : [at, q[1]];
  const mid = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2];
  const toward = X ? [0, side] : [side, 0];                 // 도면 쪽
  const line = (a, b) => ({ type: 'LINE', layer: '0', body: [[100, 'AcDbLine'], [10, num(a[0])], [20, num(a[1])], [30, 0], [11, num(b[0])], [21, num(b[1])], [31, 0]] });
  const off = (pt, k) => [pt[0] + toward[0] * k, pt[1] + toward[1] * k];
  const tick = pt => line([pt[0] - 70, pt[1] - 70], [pt[0] + 70, pt[1] + 70]);
  const text = { type: 'MTEXT', layer: '0', body: [[100, 'AcDbMText'], ...[off(mid, 80)].flatMap(t => [[10, num(t[0])], [20, num(t[1])], [30, 0]]), [40, TEXT_H], [41, 0], [71, 8], [72, 1], [1, String(Math.round(Math.abs(v)))], [7, 'Standard'], ...(X ? [] : [[11, 0], [21, 1], [31, 0]])] };
  const block = { name, anonymous: true, entities: [line(P, Q), line(off(P, 300), off(P, -100)), line(off(Q, 300), off(Q, -100)), tick(P), tick(Q), text] };
  const entity = { type: 'DIMENSION', layer: 'DIM', body: [
    [100, 'AcDbDimension'], [2, name], [10, num(Q[0])], [20, num(Q[1])], [30, 0], [11, num(off(mid, 80)[0])], [21, num(off(mid, 80)[1])], [31, 0],
    [70, 32], [71, 5], [42, num(Math.abs(v))], [3, 'Standard'],
    [100, 'AcDbAlignedDimension'], [13, num(off(P, 300)[0])], [23, num(off(P, 300)[1])], [33, 0], [14, num(off(Q, 300)[0])], [24, num(off(Q, 300)[1])], [34, 0],
    [50, X ? 0 : 90], [100, 'AcDbRotatedDimension'],
  ] };
  return { block, entity };
}

// 앱 좌표의 벽 + DXF 상자 → { blocks, entities }. 좌표가 둘 미만인 축은 재지 않는다.
export function refDimensions(walls, box) {
  const { x, y } = refCoords(walls);
  const blocks = [], entities = [];
  let k = 0;
  const add = (axis, a, b, at, side) => { const d = dimension(`*D${++k}`, axis, a, b, at, side); blocks.push(d.block); entities.push(d.entity); };
  // x: 앱 x = DXF x. 아래(y0 − DIM_OFF)와 위(y1 + DIM_OFF)에 연속 치수, 아래 바깥 줄에 전체 치수.
  if (x.length >= 2) {
    for (let i = 1; i < x.length; i++) for (const [at, side] of [[box[1] - DIM_OFF, 1], [box[3] + DIM_OFF, -1]]) add('x', [x[i - 1], 0], [x[i], 0], at, side);
    add('x', [x[0], 0], [x[x.length - 1], 0], box[1] - DIM_OFF - ROW, 1);
  }
  // y: 앱 y → DXF y = −앱 y. 왼쪽·오른쪽 연속 치수, 왼쪽 바깥 줄에 전체 치수.
  const Y = y.map(v => -v).sort((a, b) => a - b);
  if (Y.length >= 2) {
    for (let i = 1; i < Y.length; i++) for (const [at, side] of [[box[0] - DIM_OFF, 1], [box[2] + DIM_OFF, -1]]) add('y', [0, Y[i - 1]], [0, Y[i]], at, side);
    add('y', [0, Y[0]], [0, Y[Y.length - 1]], box[0] - DIM_OFF - ROW, 1);
  }
  return { blocks, entities };
}
