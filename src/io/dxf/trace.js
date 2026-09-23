// 원 도면을 PNG로 구워 **기존** project.background에 넣는다(§18.6 · 조사 §4-f 안 A).
// 저장 형식을 늘리지 않고 불투명도·표시·잠금 UI를 그대로 물려받는 것이 이 선택의 값어치다.
// 메인 스레드 전용이다 — 워커는 이 파일을 import하지 않는다(document를 쓴다).
export const TRACE_MAX_BYTES = 1_200_000;   // 프로젝트 전체가 kvp.autosave로 localStorage에 들어가고 한도가 5 MB다
export const TRACE_COLOR = '#334155';

const defaultCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// segs는 **앱 좌표**의 Float32Array(선분당 4 float)이거나 [[x0, y0, x1, y1], …]이고, box는 그 bbox다.
// 돌려주는 객체는 project.background 그대로의 모양이다: 월드 = offset + 픽셀 × scale.
export function traceBackground(segs, box, { maxPx = 2048, minSeg = 60, opacity = 0.35, makeCanvas = defaultCanvas } = {}) {
  const view = ArrayBuffer.isView(segs);
  const n = segs ? Math.floor((view ? segs.length : segs.length * 4) / 4) : 0;
  const [x0, y0, x1, y1] = box ?? [0, 0, 0, 0];
  const W = x1 - x0, H = y1 - y0;
  if (!n || !(W > 0) || !(H > 0)) return null;
  const at = (i, k) => (view ? segs[i * 4 + k] : segs[i][k]);
  // 한 번 그려 보고 한도를 넘으면 절반 해상도로 한 번 더. 그래도 넘으면 배경 없이 간다.
  for (const px of [maxPx, Math.floor(maxPx / 2)]) {
    const k = px / Math.max(W, H);
    const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    const cv = makeCanvas(w, h);
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = TRACE_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const ax = at(i, 0), ay = at(i, 1), bx = at(i, 2), by = at(i, 3);
      if (Math.hypot(bx - ax, by - ay) < minSeg) continue;   // SYM 해치 먼지를 빼야 그림이 읽힌다
      ctx.moveTo((ax - x0) * k, (ay - y0) * k);
      ctx.lineTo((bx - x0) * k, (by - y0) * k);
    }
    ctx.stroke();
    let src;
    try { src = cv.toDataURL('image/png'); } catch { return null; }
    if (src.length > TRACE_MAX_BYTES) continue;
    return { src, width: w, height: h, scale: 1 / k, offset: [x0, y0], opacity, visible: true, locked: true };
  }
  return null;
}
