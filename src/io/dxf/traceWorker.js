// 트레이스 래스터 전용 **일회용** 워커(2026-10-13 · 계획 14 Task C · 사전 검토 I-5 · §18.6 개정). [가져오기] 때 메인이 extracted로 받은
// 선분을 보내면(transfer) OffscreenCanvas로 그리고 convertToBlob + FileReaderSync로 dataURL을 만든다 — 메인 캔버스의 toDataURL 한 번
// (사동 13,244선 · 2048×1294: 143~308 ms — 경로 그리기는 3~7 ms뿐)이 클릭을 막던 자리다. 같은 바이트다(340,742 B · 픽셀 차 0).
// DXF 워커(worker.js)가 굽지 않는 이유(실측): 오래 사는 DXF 워커가 GPU 2D 컨텍스트를 가지면, 대화상자를 닫을 때의 terminate가
// GpuChannel::DestroyCommandBuffer를 기다리고 메인의 DidTerminateWorkerThread가 그 끝을 기다린다 — 가져온 직후 첫 3D 프레임의
// 셰이더 링크 뒤에 줄을 서서 메인을 290~500 ms 막았다(래스터를 뺀 만큼 도로 막는다). 이 워커는 답하자마자 스스로 닫혀서
// GPU가 한가한 동안(swap 전) 컨텍스트를 푼다. 재추출마다 굽지 않는다(재추출 예산 1.0 s · 사전 검토 m-12) — [가져오기] 때 한 번.
// 이 파일과 그 import 사슬은 DOM을 모른다(OffscreenCanvas·FileReaderSync는 워커 전역이다 · tests/dxfClient.test.js의 사슬 검사).
import { traceBackgroundAsync } from './trace.js';

const canOffscreen = g => { try { return typeof g.FileReaderSync === 'function' && !!new g.OffscreenCanvas(1, 1).getContext('2d'); } catch { return false; } };

// 답 { type: 'traced', bg, fallback, segs } — 선분은 늘 돌려준다(transfer): 메인이 폴백으로 굽거나, 확인 창에서 취소하고 다시 누를 때 쓴다.
// fallback: 여기서 못 굽는다(OffscreenCanvas·2D·FileReaderSync가 없거나 굽기가 던졌다) → 메인이 지금 경로로 굽는다.
// 구웠는데 한도를 넘어 null이면 fallback이 아니다 — 메인에서 다시 구워도 같은 크기다(배경 없음 안내로 간다).
async function raster({ segs, box }) {
  const g = globalThis;
  let bg = null, fallback = !canOffscreen(g);
  if (!fallback) {
    try {
      bg = await traceBackgroundAsync(segs, box, {
        makeCanvas: (w, h) => new g.OffscreenCanvas(w, h),
        encode: async cv => new g.FileReaderSync().readAsDataURL(await cv.convertToBlob({ type: 'image/png' })),
      });
    } catch { bg = null; fallback = true; }
  }
  return { type: 'traced', bg, fallback, segs };
}

// raster는 던지지 않는다(굽기 실패는 fallback) — 답은 늘 하나이고, 그다음 닫힌다.
self.onmessage = async ev => {
  const out = await raster(ev.data ?? {});
  try { self.postMessage(out, out.segs?.buffer ? [out.segs.buffer] : []); }
  catch { self.postMessage({ type: 'traced', bg: out.bg, fallback: out.fallback, segs: null }); }   // 선분을 못 넘기면 배경만이라도
  self.close();
};
