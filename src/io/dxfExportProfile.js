// 내보내기 프로필(2026-10-13 · 계획 16 Task B). 'ours' = 정규화 DXF(우리 가져오기가 같은 것을 다시 읽는다 — dxfExport.js 머리 주석의 계약).
// 'archisketch' = 아키스케치(오늘의집 3D) CAD 업로드 규격(조사 docs/superpowers/plans/2026-10-13-research-rea-archisketch.md §1.1·§2.1·§2.2):
//  인식 레이어는 wall/door/window/column 넷뿐 · 벽은 wall 레이어의 맞닿은 면선(점검 팁 "Hatch가 한 번에 먹으면" = 면선이 닫힌 윤곽) · 문·창은 블록 ·
//  벽 높이는 레이어 이름 꼬리 wall_2800 · 단위 mm($INSUNITS 4 — 틀은 늘 4다) · 곡선 벽 없음. 아키스케치는 다른 레이어를 읽지 않으므로 방·실명·치수·구획선·
//  기구·제목을 쓰지 않고, **중심선·꺾임/이음 extra run도 쓰지 않는다**(면선 사이의 선이 Hatch 점검을 깬다 — 그래서 이 파일은 우리 앱의 왕복 형식이 아니다:
//  520 mm보다 두꺼운 벽은 중심선 없이 한 띠로 서지 못해 빠진다 — synthetic 벽 7→5 · 방 2→0 · 2026-10-13 최종 리뷰 F-3 정정). 통로(PASS)는 벽 선을 끊은 자리로만 남고, 끊지 못한 통로(uncutPasses)는 빠진다
//  (아키스케치 CAD 업로드에 통로 개념이 없다 — 문으로 올리면 없는 문이 생긴다). 나란히 붙은 두 벽의 WALL-2 구분은 우리 가져오기의 것이라 한 레이어로 합친다.
//  벽 높이는 층고(floor.height) 하나다 — 벽마다 다른 wall.height는 이 레이어 하나로 납작해진다(사전 검토 9-10 · 레이어별 높이는 범위 밖).
// 프로필은 **레이어 이름과 무엇을 쓸지**만 정한다 — 도형 계산(dxfExportGeom·Joints·Dims)은 같다. 예외 하나: jointGaps(두께가 바뀌는 이음에서 얇은 벽을
// 30 mm 앞에서 끊는 틈 — 우리 가져오기의 구간 표시)는 아키스케치에서 끈다 — 틈이 있으면 면선이 맞닿지 않아 아키스케치 입력·HATCH 점검이 깨진다
// (2026-10-13 · 계획 16 최종 리뷰 I-1 · F-1: 열린 끝점 사동중 53 → 0). 이 파일은 DOM을 모른다.
import { EXPORT_LAYERS } from './dxfExportTemplate.js';

export const ARCHI_LAYERS = Object.freeze({ door: 'door', window: 'window', column: 'column' });
export const archiWallLayer = h => `wall_${Math.round(Number(h) || 0)}`;

export const PROFILES = Object.freeze({
  ours: Object.freeze({
    id: 'ours', wall: layer => layer, opening: () => 'OPENING', column: 'COLUMN',
    passBlock: true, centers: true, dividers: true, passMarks: true, rooms: true, dims: true, title: true, equipment: true, jointGaps: true,
    layers: () => EXPORT_LAYERS,
  }),
  archisketch: Object.freeze({
    id: 'archisketch', wall: (layer, h) => archiWallLayer(h), opening: kind => (kind === 'WIN' ? ARCHI_LAYERS.window : ARCHI_LAYERS.door), column: ARCHI_LAYERS.column,
    passBlock: false, centers: false, dividers: false, passMarks: false, rooms: false, dims: false, title: false, equipment: false, jointGaps: false,
    // 색: 청록(ACI 4)은 쓰지 않는다(우리 가져오기가 기타 레이어의 청록을 창호로 올린다 — 여기 레이어는 기타가 아니지만 같은 습관을 지킨다).
    layers: h => Object.freeze([{ name: archiWallLayer(h), color: 7 }, { name: ARCHI_LAYERS.door, color: 3 }, { name: ARCHI_LAYERS.window, color: 5 }, { name: ARCHI_LAYERS.column, color: 8 }]),
  }),
});
// 제 키만 본다(2026-10-13 · 최종 리뷰 F-5): 'toString'·'__proto__' 같은 상속 키가 함수·Object.prototype을 돌려주면 buildDxf가 던졌다.
export const profileOf = id => (Object.hasOwn(PROFILES, id) ? PROFILES[id] : PROFILES.ours);
