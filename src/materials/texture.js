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

// 면 크기(mm) ÷ 무늬 한 칸 크기(mm) = 반복 횟수. 0 나누기를 막고 최소 0.05를 준다.
export function faceRepeat(material, faceSizeMm) {
  const [fw, fh] = Array.isArray(faceSizeMm) ? faceSizeMm : [1000, 1000];
  const [sw, sh] = material?.scale ?? [1000, 1000];
  return [Math.max(0.05, Math.abs(Number(fw) || 0) / (sw || 1000)), Math.max(0.05, Math.abs(Number(fh) || 0) / (sh || 1000))];
}

// three 재질 하나에 지정을 반영한다. 지정이 없거나 화이트 단색 모드면 map을 붙이지 않는다.
export function applyAssignment(threeMaterial, assignment, faceSizeMm, { display = 'normal', makeCanvas = null } = {}) {
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
  const [rx, ry] = faceRepeat(m, faceSizeMm);
  t.repeat.set(rx, ry);
  t.offset.set((Number(assignment.offset?.[0]) || 0) / (m.scale[0] || 1000), (Number(assignment.offset?.[1]) || 0) / (m.scale[1] || 1000));
  t.center.set(0.5, 0.5);
  t.rotation = ((Number(assignment.angle) || 0) * Math.PI) / 180;
  t.userData.clone = true;                        // disposeGroup이 복제본만 정리한다
  t.needsUpdate = true;
  threeMaterial.map = t;
  threeMaterial.color.set('#ffffff');             // 무늬 색이 그대로 보이게 바탕을 흰색으로
  threeMaterial.userData.perMesh = true;
  threeMaterial.needsUpdate = true;
  return threeMaterial;
}
