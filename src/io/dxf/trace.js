// 원 도면을 PNG로 구워 **기존** project.background에 넣는다(§18.6 · 조사 §4-f 안 A).
// 저장 형식을 늘리지 않고 불투명도·표시·잠금 UI를 그대로 물려받는 것이 이 선택의 값어치다.
// DOM을 모른다(2026-10-13 · 계획 14 Task C · 사전 검토 I-5): 캔버스와 PNG 굽기는 부르는 쪽이 준다. 워커는 OffscreenCanvas +
// convertToBlob(비동기 · traceBackgroundAsync)로 굽고, 메인 폴백은 ui/dxfDialog.js의 DOM 캔버스 + toDataURL(동기)로 굽는다.
// 그래서 이 파일은 워커 import 사슬에 들어간다 — DOM 전역을 쓰면 tests/dxfClient.test.js의 사슬 검사가 막는다.
export const TRACE_MAX_BYTES = 1_200_000;   // 프로젝트 전체가 kvp.autosave로 localStorage에 들어가고 한도가 5 MB다
export const TRACE_COLOR = '#334155';

// 해상도 후보마다 한 장씩 그려 내준다: 한 번 그려 보고 한도를 넘으면 절반 해상도로 한 번 더(굽기는 부르는 쪽).
// 두 경로가 **같은 그리기 명령열**을 내는 것이 바이트 동일의 근거다(사전 검토 I-5 실측: 340,742 B 동일 · 픽셀 차 0).
// segs는 **앱 좌표**의 Float32Array(선분당 4 float)이거나 [[x0, y0, x1, y1], …]이고, box는 그 bbox다.
function* drafts(segs, box, { maxPx = 2048, minSeg = 60, makeCanvas } = {}) {
  const view = ArrayBuffer.isView(segs);
  const n = segs ? Math.floor((view ? segs.length : segs.length * 4) / 4) : 0;
  const [x0, y0, x1, y1] = box ?? [0, 0, 0, 0];
  const W = x1 - x0, H = y1 - y0;
  if (!n || !(W > 0) || !(H > 0) || typeof makeCanvas !== 'function') return;
  const at = (i, k) => (view ? segs[i * 4 + k] : segs[i][k]);
  for (const px of [maxPx, Math.floor(maxPx / 2)]) {
    const k = px / Math.max(W, H);
    const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    const cv = makeCanvas(w, h);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
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
    yield { cv, w, h, k, x0, y0 };
  }
}
// project.background 그대로의 모양(키 순서까지 — 저장 JSON이 바뀌지 않는다): 월드 = offset + 픽셀 × scale.
const finish = (d, src, opacity) => ({ src, width: d.w, height: d.h, scale: 1 / d.k, offset: [d.x0, d.y0], opacity, visible: true, locked: true });

// 메인 폴백(동기): 굽기가 던지면 배경 없이 간다(지금까지와 같다).
export function traceBackground(segs, box, { opacity = 0.35, encode = cv => cv.toDataURL('image/png'), ...opts } = {}) {
  for (const d of drafts(segs, box, opts)) {
    let src;
    try { src = encode(d.cv); } catch { return null; }
    if (src.length <= TRACE_MAX_BYTES) return finish(d, src, opacity);
  }
  return null;
}

// 워커(비동기 굽기 — OffscreenCanvas에는 toDataURL이 없다). 던짐은 삼키지 않는다: 워커가 받아 메인 폴백을 요청한다.
export async function traceBackgroundAsync(segs, box, { opacity = 0.35, encode, ...opts } = {}) {
  for (const d of drafts(segs, box, opts)) {
    const src = await encode(d.cv);
    if (src.length <= TRACE_MAX_BYTES) return finish(d, src, opacity);
  }
  return null;
}
