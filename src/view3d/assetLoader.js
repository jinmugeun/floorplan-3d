// 실사 에셋 로더 청크(2026-10-13 · 계획 15 Task B · 사전 검토 I-2 · I-10). itemAssets.js가 처음 모델을 받을 때 **동적 import로 한 번** 부른다 —
// 정적 import는 이 파일에만 두어 GLTFLoader·MeshoptDecoder(wasm 내장 — 디코더 파일 복사 없음)가 한 청크로 묶이게 한다(요청 한 번).
// 로더 인스턴스도 하나만 만든다(에셋마다 새로 만들지 않는다). 런타임 Draco·KTX2는 받지 않는다(포장이 늘 meshopt + WebP).
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

let gltf = null;
export const loadScene = url => (gltf ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)).loadAsync(url).then(g => g.scene);
