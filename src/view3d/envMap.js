// 실사 에셋 재질용 환경 맵(2026-10-15 · 계획 15b). 생성 모델(ComfyUI TRELLIS.2)은 metallicFactor 1 + 금속·거칠기 텍스처로 스테인리스를
// '금속'으로 내보낸다 — 환경 맵이 없는 MeshStandardMaterial은 금속을 거의 검게 그린다(2026-10-15 실측: 세정대·가스레인지가 검은 덩어리였고
// RoomEnvironment PMREM을 걸자 스테인리스로 보였다 · app/.superpowers/sdd/scratch/p15-gen/compare/env-*.png).
// 왜 scene.environment가 아니라 에셋 재질별 envMap인가: scene.environment는 벽·바닥·상자(MeshStandardMaterial 전부)의 밝기와 반사를 바꾼다.
// 에셋 재질에만 걸어(itemAssets.setEnvMap) 나머지 화면·렌더샷·테스트 기준은 그대로 둔다. PMREM은 렌더러당 한 번(수십 ms) · 텍스처 하나 · destroy가 dispose.
// (계획 17부터는 형상 공유 재질 · 광택 마감 바닥·타일도 이 맵을 쓴다 — shapes/materials.js · build.surfaceMaterial.)
//
// 천정점 발광판을 뺀다(계획 17 평면 백색 포화 · 2026-10-20 · .superpowers/sdd/p17-wash-report.md): RoomEnvironment의 +Y 발광판(세기 100 —
// 옆 발광판 17~50의 2~6배)은 원점 바로 위라 환경 맵의 천정점에 앉는다. 위에서 곧장 내려다보는 직교 카메라(2D 투영 평면 · 렌더샷 평면 ·
// 시방서 천장 평면도)는 시선이 화면 전체에서 같아 모든 수평면의 반사 방향이 천정점이 된다 → 칩 에폭시 바닥(gloss 0.25)까지 1을 넘어
// 바닥·식탁·기구 윗면이 모두 #ffffff였다(톤 매핑 없음). 원근 화면에서는 반사가 천정점을 지나는 한 점(평면 모드 가운데 광택점)뿐이었다.
// 실측: 평면 투영 바닥 255 → 뺀 뒤 170~187(시선을 45~80°로 기울였을 때의 바닥 188과 같은 자리) · 원근 넓게/가깝게 평균 차 0.2/1.2(0~255) · 정면·측면 0.05.
// 남은 발광판 5개는 천정점에서 45~59°(수평선 위 31~45°)라 축 방향(±X·±Y·±Z) 어디에도 앉지 않는다 — 정면·측면 투영이 날지 않았던 까닭.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const ZENITH_DEG = 30;   // 천정점에서 이 각 안의 발광판을 뺀다(RoomEnvironment: +Y 판 0° · 나머지 45~59°)
const UP = new THREE.Vector3(0, 1, 0);

// 환경 장면의 발광판(MeshBasicMaterial 상자 — RoomEnvironment의 면광원)이 원점(PMREM을 굽는 자리)에서 보아 천정점 가까이에 있는가(순수 — 테스트 대상).
export function isZenithEmitter(o, maxDeg = ZENITH_DEG) {
  if (!o?.isMesh || !o.material?.isMeshBasicMaterial || o.position.lengthSq() === 0) return false;
  return o.position.angleTo(UP) < THREE.MathUtils.degToRad(maxDeg);
}

// 구울 환경 장면: RoomEnvironment에서 천정점 발광판만 뺀 것. 방을 밝히는 점광원·방·상자·옆 발광판은 그대로다.
export function roomScene() {
  const env = new RoomEnvironment();
  for (const o of env.children.filter(c => isZenithEmitter(c))) env.remove(o);
  return env;
}

export function createEnvMap(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(roomScene(), 0.04).texture;
  pmrem.dispose();
  return tex;
}
