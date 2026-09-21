import * as THREE from 'three';
import { materialById } from './catalog.js';
import { drawPattern } from './pattern.js';

export const TEX_PX = 128;              // 무늬 한 칸을 그리는 캔버스 크기(반복은 repeat이 한다)

// 캔버스 만들기를 바꿔 끼울 수 있게 한다: node 테스트(document 없음)에서 가짜 캔버스를 넣는다.
let factory = null;
export function setCanvasFactory(fn) { factory = typeof fn === 'function' ? fn : null; clearTextureCache(); }
const defaultCanvas = () => (typeof document === 'undefined' ? null : document.createElement('canvas'));

const cache = new Map();
export function clearTextureCache() { for (const t of cache.values()) t?.dispose?.(); cache.clear(); }

// 타일 크기 덮어쓰기(§13.3): 마감재 배정이 쓸 수 있는 scale을 들고 있으면 재질의 기본 scale 대신 쓴다.
// 값 검사는 normalizeAssignment가 이미 했지만, 정규화를 지나지 않은 객체(미리보기·테스트)로도 불린다.
// 여기서 100~2000 mm 범위를 다시 자르지 않는다(정규화가 이미 했다) — 양수인지만 본다.
export function assignScale(assignment, material) {
  const s = assignment?.scale;
  if (Array.isArray(s) && Number(s[0]) > 0 && Number(s[1]) > 0) return [Number(s[0]), Number(s[1])];
  return material?.scale ? [...material.scale] : [1000, 1000];   // 카탈로그의 배열을 그대로 내주지 않는다(M-4)
}

// 재질 하나의 텍스처(무늬 한 칸). 같은 (id, scale)은 한 장만 만들어 캐시한다.
// 캐시 키는 id와 scale뿐이다 — 같은 키를 다른 makeCanvas로 다시 불러도 먼저 만든 텍스처가 돌아온다
// (makeCanvas는 document가 없는 node 테스트용 주입이라 한 세션에 한 종류만 쓴다. 바꾸려면 clearTextureCache).
export function materialTexture(id, { makeCanvas = null, scale = null } = {}) {
  const m = materialById(id);
  if (!m) return null;
  // 캐시 키에 scale을 넣는다(§13.3). 지금의 무늬 그림은 한 칸을 정사각 캔버스에 그려 scale과 무관하지만,
  // 키를 나눠 두면 무늬가 scale에 따라 달라지게 바뀌어도 옛 그림이 남지 않는다.
  const key = Array.isArray(scale) ? `${id}@${scale[0]}x${scale[1]}` : id;
  if (cache.has(key)) return cache.get(key);
  const canvas = (makeCanvas ?? factory ?? defaultCanvas)();
  if (!canvas) return null;                       // 캔버스를 만들 수 없으면 무늬 없이(바탕색만) 간다
  canvas.width = TEX_PX; canvas.height = TEX_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawPattern(ctx, m, TEX_PX);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;          // three 0.169
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

// 반복 횟수 = 면 크기(mm) ÷ 무늬 한 칸 크기(mm). 0 나누기를 막고 최소 0.05를 준다.
// worldUv: uv가 0~1이 아니라 "미터"인 지오메트리(ShapeGeometry는 정점 좌표를 그대로 uv로 쓰고, 벽 본체
// ExtrudeGeometry는 build.js가 벽 축으로 잰 거리를 uv에 넣는다)는 uv에 이미 면 크기가 들어 있다. 그래서 repeat은
// 면 크기와 무관한 "미터당 반복 수" = 1000 / scale(mm)이고, 실제 반복 수 = uv 범위(m) × repeat = 면 크기(mm) /
// scale(mm)로 0~1 uv와 같은 결과가 된다. 이 말은 uv가 면을 따라 잰 거리일 때만 참이다(build.js의 UVGenerator 참고).
export function faceRepeat(material, faceSizeMm, { worldUv = false, scale = null } = {}) {
  const [sw, sh] = scale ?? material?.scale ?? [1000, 1000];
  if (worldUv) return [Math.max(0.05, 1000 / (sw || 1000)), Math.max(0.05, 1000 / (sh || 1000))];
  const [fw, fh] = Array.isArray(faceSizeMm) ? faceSizeMm : [1000, 1000];
  return [Math.max(0.05, Math.abs(Number(fw) || 0) / (sw || 1000)), Math.max(0.05, Math.abs(Number(fh) || 0) / (sh || 1000))];
}

// three 재질 하나에 지정을 반영한다. 지정이 없거나 화이트 단색 모드면 map을 붙이지 않는다.
export function applyAssignment(threeMaterial, assignment, faceSizeMm, { display = 'normal', makeCanvas = null, worldUv = false } = {}) {
  if (!threeMaterial) return threeMaterial;
  threeMaterial.map = null;
  if (!assignment || display === 'white') return threeMaterial;
  const m = materialById(assignment.id);
  if (!m) return threeMaterial;
  const sc = assignScale(assignment, m);          // 배정의 scale이 있으면 그것이 무늬 한 칸의 크기다
  // 재질의 기본 크기와 같은 scale은 캐시 키에 넣지 않는다: 같은 그림을 두 장 들고 있지 않게(M-5).
  const own = Array.isArray(m.scale) && sc[0] === Number(m.scale[0]) && sc[1] === Number(m.scale[1]);
  const tex = materialTexture(assignment.id, { makeCanvas, scale: assignment?.scale && !own ? sc : null });
  if (!tex) { threeMaterial.color.set(m.base); return threeMaterial; }
  // 반복·오프셋·각도는 면마다 다르므로 캐시 원본을 복제해 쓴다(원본은 그림만 들고 있다).
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  const [rx, ry] = faceRepeat(m, faceSizeMm, { worldUv, scale: sc });
  t.repeat.set(rx, ry);
  // offset은 repeat을 곱한 뒤 더해지는 텍스처 공간 값이라 두 uv 모드에서 같은 식(offset mm ÷ 무늬 한 칸 mm)을 쓴다.
  const shifted = i => Number(assignment.offset?.[i]) || 0;
  t.offset.set(shifted(0) / (sc[0] || 1000), shifted(1) / (sc[1] || 1000));
  t.center.set(0, 0);                             // center 0.5는 setUvTransform에 repeat에 비례한 항을 넣어 위상을 깨뜨린다(원점 기준 회전)
  t.rotation = ((Number(assignment.angle) || 0) * Math.PI) / 180;
  t.userData.clone = true;                        // disposeGroup이 복제본만 정리한다
  t.needsUpdate = true;
  threeMaterial.map = t;
  threeMaterial.color.set('#ffffff');             // 무늬 색이 그대로 보이게 바탕을 흰색으로
  threeMaterial.needsUpdate = true;               // perMesh 표시는 재질을 만든 쪽(build.js)이 찍는다
  return threeMaterial;
}
