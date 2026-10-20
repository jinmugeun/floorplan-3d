// 형상 공유 재질(계획 17 Task 4). 모든 스테인리스 형상 아이템이 재질 6개를 나눠 쓴다(perMesh 표시가 없어 disposeGroup이 지우지 않는다 —
// 충돌은 재질을 칠하지 않고 붉은 상자 선으로 보인다: items3d.paintItem의 shared 규칙). 사용자가 색을 바꾼 아이템만 tintedSteel(perMesh).
// 헤어라인 텍스처(public/textures/metal-brushed/ — ambientCG Metal009 CC0)는 DOM이 있을 때만 받는다(node 테스트는 바탕색).
// 받으면 재질에 붙이고 onReady 구독자에게 알린다(build.js가 itemAssets.assetsChanged로 넘겨 view3d가 다시 그린다).
// 환경 맵은 itemAssets가 가진 것(envMapNow · onEnvMap)을 쓴다 — 금속 재질은 환경 맵이 없으면 검게 보인다(envMap.js 머리).
import * as THREE from 'three';
import { envMapNow, onEnvMap } from '../itemAssets.js';

export const SHAPE_MATERIALS = ['steel', 'dark', 'glass', 'accent', 'food', 'greens'];
export const STEEL_BASE = '#c9ced3';          // 텍스처가 오기 전·node의 스테인리스 색
const STEEL_TINT = [1.28, 1.3, 1.33];         // 텍스처(어두운 회색 헤어라인)를 곱할 색 — 시안 proto.html steel 스타일 값
const TEX_DIR = 'textures/metal-brushed/', TEX_REPEAT = 2;   // 텍스처 한 장 = 0.5 m(uv는 merge.boxProjectUv의 미터)

let mats = null, loading = false;
const subs = new Set();
export const onShapeTexturesReady = cb => { subs.add(cb); return () => { subs.delete(cb); }; };

function make() {
  const std = (o) => { const m = new THREE.MeshStandardMaterial(o); m.userData.shapeShared = true; return m; };
  return {
    steel: std({ color: STEEL_BASE, metalness: 0.7, roughness: 0.55, envMapIntensity: 1, side: THREE.DoubleSide }),
    dark: std({ color: '#3a3f45', metalness: 0.2, roughness: 0.6, envMapIntensity: 0.5 }),
    glass: std({ color: '#9fb8c4', metalness: 0, roughness: 0.1, transparent: true, opacity: 0.45, envMapIntensity: 1 }),
    accent: std({ color: '#dfe3e7', metalness: 0.3, roughness: 0.45, envMapIntensity: 0.8 }),
    food: std({ color: '#d9a24a', metalness: 0, roughness: 0.8 }),
    greens: std({ color: '#5f8a3a', metalness: 0, roughness: 0.8 }),
  };
}
function applyEnv(tex) { if (!mats) return; for (const k of ['steel', 'dark', 'glass', 'accent']) { mats[k].envMap = tex ?? null; mats[k].needsUpdate = true; } }
onEnvMap(applyEnv);

function loadTextures() {
  if (loading || typeof document === 'undefined') return;
  loading = true;
  const L = new THREE.TextureLoader();
  Promise.all(['color', 'rough', 'normal'].map(k => L.loadAsync(`${TEX_DIR}${k}.webp`))).then(([map, roughnessMap, normalMap]) => {
    for (const t of [map, roughnessMap, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(TEX_REPEAT, TEX_REPEAT); t.anisotropy = 8; }
    map.colorSpace = THREE.SRGBColorSpace;
    Object.assign(mats.steel, { map, roughnessMap, normalMap, roughness: 0.75 });
    mats.steel.normalScale.set(0.15, 0.15);
    mats.steel.color.setRGB(...STEEL_TINT);
    mats.steel.needsUpdate = true;
    for (const cb of subs) cb();
  }).catch(e => console.warn(`스테인리스 텍스처 생략: ${e?.message ?? e}`));
}

export function shapeMaterial(name) {
  if (!mats) { mats = make(); applyEnv(envMapNow()); loadTextures(); }
  return mats[name] ?? mats.steel;
}

// 사용자가 색을 바꾼 아이템의 스테인리스: 공유 재질을 복제해 색만 바꾼다(아이템 전용 — disposeGroup이 지운다).
export function tintedSteel(color) {
  const m = shapeMaterial('steel').clone();
  m.color.set(color); m.userData = { perMesh: true };
  return m;
}

export function __resetShapeMaterials() { mats = null; loading = false; subs.clear(); }
