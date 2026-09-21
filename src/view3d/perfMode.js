// 성능 모드(§13.4). 보기 팝오버의 select가 고르는 값('display' | 'performance')이 실제로 하는 일을
// 한곳에 모았다. 'performance'는 ① 픽셀 비율 1, ② 그림자 없음, ③ 3D 라벨·제품 윤곽선을 렌더에서 생략.
// ③은 표시 플래그(v3.equipLabels/ductLabels/itemEdges)를 건드리지 않는다 — 모드를 되돌리면
// 사용자가 켜 둔 대로 그대로 돌아온다. 그래서 sceneSignature에 perfMode가 들어가고(build.js),
// 모드를 바꾸면 씬을 다시 짓는다.
// 안티앨리어싱은 WebGLRenderer를 만들 때 고정되는 값이라 손대지 않는다(컨텍스트를 새로 만들어야 한다).
// 자동 전환은 없다 — 사용자가 고른다.
export const PERF_SETTINGS = {
  display: { pixelRatio: null, shadows: true, labels: true, edges: true },
  performance: { pixelRatio: 1, shadows: false, labels: false, edges: false },
};

export const perfSettings = (perfMode = 'display') => PERF_SETTINGS[perfMode] ?? PERF_SETTINGS.display;

// pixelRatio가 null이면 "화면을 따른다": 디바이스 비율을 쓰되 2를 넘기지 않는다(계획 1의 규칙 그대로).
export const perfPixelRatio = (perfMode, dpr = 1) => perfSettings(perfMode).pixelRatio ?? Math.min(Number(dpr) || 1, 2);

// 렌더러·햇빛에 즉시 반영되는 것만 여기서 한다(라벨·윤곽선은 씬을 다시 지을 때 빠진다).
export function applyPerfMode(perfMode, { renderer = null, sun = null, dpr = 1 } = {}) {
  const s = perfSettings(perfMode);
  renderer?.setPixelRatio?.(perfPixelRatio(perfMode, dpr));
  if (renderer?.shadowMap) renderer.shadowMap.enabled = s.shadows;
  if (sun) sun.castShadow = s.shadows;
  return s;
}
