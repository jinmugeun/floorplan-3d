// 하단 바 접기 단계는 **현재 모드**가 정한다(§17.2 · 감사 §3·§32).
// shellHtml의 data-overflow 값은 2D 기준 단계로 남기고(마크업은 건드리지 않는다) 여기서 다시 매긴다.
// 2D: 3D 전용 묶음(카메라·햇빛·캡처·2D 투영·기즈모)이 먼저, 도면 잠금, 단위 순서.
// 3D: 도면 잠금이 먼저, 단위, 3D 묶음이 마지막. §14.3의 "모드·보기·줌은 늘 보인다"는 그대로이고
//     "단위는 늘 보인다"는 3D에서 2단계로 좁아진다 — 3D 화면에서는 mm/ft·in보다 카메라·기즈모가
//     먼저라는 것이 §17.2의 결정이다.
export const BOTTOM_TIERS = {
  '2d': { seg3d: 1, segCapture: 1, segPreset: 1, segGizmo: 1, segLock: 2, unitSeg: 3 },
  '3d': { segLock: 1, unitSeg: 2, seg3d: 3, segCapture: 3, segPreset: 3, segGizmo: 3 },
};
// 표에 없는 묶음은 1단계다(가장 먼저 접힌다): 새 묶음이 조용히 "늘 보이는 것"이 되지 않게.
export const tierOf = (id, mode) => BOTTOM_TIERS[mode === '2d' ? '2d' : '3d'][id] ?? 1;
