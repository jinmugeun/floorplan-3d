// 줄눈 규칙(계획 19 설계 §4.1 · 시안 tile-look/render.html groutPatch). 타일 색 지도(tile-<배열>/color.webp)는 면·줄눈 모두 무채색 0.80이라
// tint를 그대로 곱하면 줄눈까지 타일 색이 된다 — 검정 타일이면 밝은 그물이 사라진다(시안 tile-compare.png 맨 아래 줄).
// 타일 재질(카탈로그 tiles)만 map_fragment의 곱하기를 albedo = map.rgb × mix(groutColor, tint, 면 마스크)로 바꾼다. 마스크 = 거칠기 지도 R
// (1 면 · 0 줄눈 · 밉맵에서는 덮임 비율이라 먼 거리 평균색도 맞다). 알파는 곱하지 않는다(색 지도는 알파가 없다 — 반투명 벽은 opacity 그대로).
// 프로그램은 customProgramCacheKey(GROUT_KEY)로 한 번 나뉘고 타일 재질끼리는 같은 프로그램을 쓴다. groutColor는 재질마다 uniform이다.
// 윤곽선 법선 묶음(normalBatch.js)은 지오메트리 법선만 그리므로 이 패치와 무관하다. 셰이더 예열은 shaderWarm.warmFloor가 이 변형을 짓는다.
import * as THREE from 'three';
import { DEFAULT_GROUT } from './catalog.js';

export const GROUT_KEY = 'tile-grout-v1';
export const FACE_LIN = 0.8;   // 색 지도 면·줄눈의 기준 밝기(선형 — tools/look/tile-textures.mjs) → groutColor = lin(줄눈 sRGB) ÷ 0.80
export const GROUT_MAP_FRAGMENT = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  #ifdef USE_ROUGHNESSMAP
    float tileFace = texture2D( roughnessMap, vRoughnessMapUv ).r;
    diffuseColor.rgb = mix( groutColor, diffuseColor.rgb, tileFace ) * sampledDiffuseColor.rgb;
  #else
    diffuseColor.rgb *= sampledDiffuseColor.rgb;
  #endif
#endif`;
// sRGB 줄눈색 → 선형 ÷ 0.80(three Color는 sRGB 16진을 선형 작업 공간으로 읽는다). #d4d1ca → (0.823, 0.797, 0.738) — 시안 result.json groutTint.
export const groutLinear = hex => new THREE.Color(hex ?? DEFAULT_GROUT).multiplyScalar(1 / FACE_LIN);

const uniforms = new WeakMap();   // 재질 → { value: Color } — 같은 uniform 객체를 이어 써서 재사용 재질의 줄눈색이 바뀌어도 다음 그리기에 반영된다
const groutKey = () => GROUT_KEY;
export const groutUniform = material => uniforms.get(material) ?? null;
export function groutPatch(material, groutHex) {
  let u = uniforms.get(material);
  if (!u) { u = { value: new THREE.Color() }; uniforms.set(material, u); }
  u.value.copy(groutLinear(groutHex));
  material.onBeforeCompile = shader => {
    shader.uniforms.groutColor = u;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 groutColor;\nvoid main() {')
      .replace('#include <map_fragment>', GROUT_MAP_FRAGMENT);
  };
  material.customProgramCacheKey = groutKey;
  return material;
}
// 재사용 재질에서 패치를 뗀다(texture.applyAssignment 머리). 자기 속성을 지우면 Material.prototype의 기본 onBeforeCompile·customProgramCacheKey로 돌아간다.
export function clearGroutPatch(material) {
  if (Object.hasOwn(material, 'onBeforeCompile')) delete material.onBeforeCompile;
  if (Object.hasOwn(material, 'customProgramCacheKey')) delete material.customProgramCacheKey;
  uniforms.delete(material);
}
