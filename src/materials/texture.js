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

// 재질 하나의 텍스처(무늬 한 칸). 같은 id는 한 장만 만들어 캐시한다.
// 캐시 키는 id뿐이다 — 같은 id를 다른 makeCanvas로 다시 불러도 먼저 만든 텍스처가 돌아온다
// (makeCanvas는 document가 없는 node 테스트용 주입이라 한 세션에 한 종류만 쓴다. 바꾸려면 clearTextureCache).
export function materialTexture(id, { makeCanvas = null } = {}) {
  const m = materialById(id);
  if (!m) return null;
  if (cache.has(id)) return cache.get(id);
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
  cache.set(id, tex);
  return tex;
}

// 반복 횟수 = 면 크기(mm) ÷ 무늬 한 칸 크기(mm). 0 나누기를 막고 최소 0.05를 준다.
// worldUv: uv가 0~1이 아니라 "미터"인 지오메트리(ShapeGeometry는 정점 좌표를 그대로 uv로 쓰고, 벽 본체
// ExtrudeGeometry는 build.js가 벽 축으로 잰 거리를 uv에 넣는다)는 uv에 이미 면 크기가 들어 있다. 그래서 repeat은
// 면 크기와 무관한 "미터당 반복 수" = 1000 / scale(mm)이고, 실제 반복 수 = uv 범위(m) × repeat = 면 크기(mm) /
// scale(mm)로 0~1 uv와 같은 결과가 된다. 이 말은 uv가 면을 따라 잰 거리일 때만 참이다(build.js의 UVGenerator 참고).
export function faceRepeat(material, faceSizeMm, { worldUv = false } = {}) {
  const [sw, sh] = material?.scale ?? [1000, 1000];
  if (worldUv) return [Math.max(0.05, 1000 / (sw || 1000)), Math.max(0.05, 1000 / (sh || 1000))];
  const [fw, fh] = Array.isArray(faceSizeMm) ? faceSizeMm : [1000, 1000];
  return [Math.max(0.05, Math.abs(Number(fw) || 0) / (sw || 1000)), Math.max(0.05, Math.abs(Number(fh) || 0) / (sh || 1000))];
}

// three 재질 하나에 지정을 반영한다. 지정이 없거나 화이트 단색 모드면 map을 붙이지 않는다.
// uvShift(mm): 이 면이 무늬 원점에서 얼마나 떨어진 자리인가. uv가 면마다 0에서 다시 시작하는 조각(개구부로
// 쪼갠 벽 박스)이 옆 조각·벽 본체와 무늬 위상을 잇게 한다. 단위·부호·적용 시점은 assignment.offset과 똑같다.
export function applyAssignment(threeMaterial, assignment, faceSizeMm, { display = 'normal', makeCanvas = null, worldUv = false, uvShift = null } = {}) {
  if (!threeMaterial) return threeMaterial;
  threeMaterial.map = null;
  if (!assignment || display === 'white') return threeMaterial;
  const m = materialById(assignment.id);
  if (!m) return threeMaterial;
  const tex = materialTexture(assignment.id, { makeCanvas });
  if (!tex) { threeMaterial.color.set(m.base); return threeMaterial; }
  // 반복·오프셋·각도는 면마다 다르므로 캐시 원본을 복제해 쓴다(원본은 그림만 들고 있다).
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  const [rx, ry] = faceRepeat(m, faceSizeMm, { worldUv });
  t.repeat.set(rx, ry);
  // offset은 repeat을 곱한 뒤 더해지는 텍스처 공간 값이라 두 uv 모드에서 같은 식(offset mm ÷ 무늬 한 칸 mm)을 쓴다.
  const shift = Array.isArray(uvShift) ? uvShift : [0, 0];
  const shifted = i => (Number(assignment.offset?.[i]) || 0) + (Number(shift[i]) || 0);
  t.offset.set(shifted(0) / (m.scale[0] || 1000), shifted(1) / (m.scale[1] || 1000));
  t.center.set(0.5, 0.5);
  t.rotation = ((Number(assignment.angle) || 0) * Math.PI) / 180;
  t.userData.clone = true;                        // disposeGroup이 복제본만 정리한다
  t.needsUpdate = true;
  threeMaterial.map = t;
  threeMaterial.color.set('#ffffff');             // 무늬 색이 그대로 보이게 바탕을 흰색으로
  threeMaterial.needsUpdate = true;               // perMesh 표시는 재질을 만든 쪽(build.js)이 찍는다
  return threeMaterial;
}
