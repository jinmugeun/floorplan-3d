// 실사 에셋 재질용 환경 맵(2026-10-15 · 계획 15b). 생성 모델(ComfyUI TRELLIS.2)은 metallicFactor 1 + 금속·거칠기 텍스처로 스테인리스를
// '금속'으로 내보낸다 — 환경 맵이 없는 MeshStandardMaterial은 금속을 거의 검게 그린다(2026-10-15 실측: 세정대·가스레인지가 검은 덩어리였고
// RoomEnvironment PMREM을 걸자 스테인리스로 보였다 · app/.superpowers/sdd/scratch/p15-gen/compare/env-*.png).
// 왜 scene.environment가 아니라 에셋 재질별 envMap인가: scene.environment는 벽·바닥·상자(MeshStandardMaterial 전부)의 밝기와 반사를 바꾼다.
// 에셋 재질에만 걸어(itemAssets.setEnvMap) 나머지 화면·렌더샷·테스트 기준은 그대로 둔다. PMREM은 렌더러당 한 번(수십 ms) · 텍스처 하나 · destroy가 dispose.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function createEnvMap(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return tex;
}
