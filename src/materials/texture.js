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

// 사진 마감재(계획 17 Task 7): 카탈로그 항목의 photo = public/textures/<photo>/ 폴더. 색·법선·거칠기 3장을 종류당 한 번 받아 캐시한다.
// three r169: 로드가 끝나기 전에 clone한 텍스처는 영영 올라가지 않는다 — 도착 전에는 null을 돌려(쓰는 쪽은 바탕색) 붙이지 않게 하고,
// 도착하면 onPhotoReady 구독자(build.js → itemAssets.assetsChanged → view3d 리빌드)에게 알린다. node(document 없음)는 늘 null이고
// 캐시에도 넣지 않는다(뒤에 가짜 document를 깐 테스트가 받을 수 있게). 실패는 한 번 경고하고 그 종류는 다시 받지 않는다(바탕색으로 남는다).
const photos = new Map(), photoSubs = new Set();
export const PHOTO_MAPS = ['map', 'normalMap', 'roughnessMap'];
export const PHOTO_TINT = [0.72, 0.72, 0.71];   // 선형 색 곱 — 시안(scratch/look/proto.html floorPhoto)에서 사진 그대로는 바닥이 떠 보였다
export const onPhotoReady = cb => { photoSubs.add(cb); return () => { photoSubs.delete(cb); }; };
export function photoTextures(material) {
  const dir = material?.photo;
  if (!dir) return null;
  if (photos.has(dir)) return photos.get(dir).maps;
  if (typeof document === 'undefined') return null;
  const entry = { maps: null };
  photos.set(dir, entry);
  const loader = new THREE.TextureLoader();
  Promise.all(['color', 'normal', 'rough'].map(k => loader.loadAsync(`textures/${dir}/${k}.webp`))).then(([map, normalMap, roughnessMap]) => {
    for (const t of [map, normalMap, roughnessMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
    map.colorSpace = THREE.SRGBColorSpace;
    entry.maps = { map, normalMap, roughnessMap };
    notifyPhoto(dir);
  }).catch(e => console.warn(`사진 마감재 생략(${dir}): ${e?.message ?? e}`));
  return null;
}
// 구독자마다 따로 감싼다(리뷰 Fix 1-4): 하나가 던져도 나머지는 알림을 받고, 받기 실패 경고("생략")로 새지 않는다. 경고는 구독자당 한 번.
const warnedSubs = new WeakSet();
function notifyPhoto(dir) {
  for (const cb of photoSubs) {
    try { cb(dir); } catch (e) {
      if (!warnedSubs.has(cb)) { warnedSubs.add(cb); console.warn(`사진 마감재 도착 알림 오류(${dir}) — 이 구독자만 건너뜀: ${e?.message ?? e}`); }
    }
  }
}
// 배치별 공유 복제본(리뷰 Fix 1-1): three 0.169의 Texture.copy()는 needsUpdate = true로 **공유 source.version**을 올린다 —
// 면마다 새로 복제하면 리빌드마다 1024² 사진 3장을 GPU에 다시 올리고 밉맵을 다시 만든다. 같은 (폴더 · 반복 · 오프셋 · 각도)는
// 같은 복제본 3장을 나눠 쓰고(반복·오프셋·각도는 uniform이라 GPU 텍스처는 원본과 하나다), disposeGroup은 이것을 버리지 않는다
// (userData.photoShared — clone 표시가 없다). 배치 종류만큼 JS 객체가 남는다(GPU 메모리는 늘지 않는다).
const photoClones = new Map();   // 키 → { map, normalMap, roughnessMap }
function sharedPhotoMaps(dir, maps, rx, ry, ox, oy, rot) {
  const key = `${dir}|${rx}|${ry}|${ox}|${oy}|${rot}`;
  let set = photoClones.get(key);
  if (set) return set;
  set = {};
  for (const k of PHOTO_MAPS) {
    const t = maps[k].clone();                    // 도착한 뒤의 복제라 올라간다(r169) · clone이 needsUpdate를 이미 켠다
    t.repeat.set(rx, ry);
    t.offset.set(ox, oy);
    t.center.set(0, 0);                           // 원점 기준 회전(무늬 갈래와 같다)
    t.rotation = rot;
    t.userData.photoShared = true;
    set[k] = t;
  }
  photoClones.set(key, set);
  return set;
}
// 테스트용 — 사진 캐시와 공유 복제본을 비운다(복제본은 dispose). 구독(build.js의 모듈 구독)은 남긴다.
export function __resetPhotos() {
  for (const set of photoClones.values()) for (const k of PHOTO_MAPS) set[k].dispose();
  photoClones.clear(); photos.clear();
}

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
  if ('normalMap' in threeMaterial) { threeMaterial.normalMap = null; threeMaterial.roughnessMap = null; }   // 사진 갈래가 붙였던 것(재사용 재질)
  if (!assignment || display === 'white') return threeMaterial;
  const m = materialById(assignment.id);
  if (!m) return threeMaterial;
  const sc = assignScale(assignment, m);          // 배정의 scale이 있으면 그것이 무늬 한 칸의 크기다
  if (m.photo) return applyPhoto(threeMaterial, m, assignment, faceSizeMm, sc, worldUv);
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

// applyAssignment의 사진 갈래. 반복·오프셋·각도 규칙은 무늬 갈래와 같다(같은 faceRepeat · 원점 기준 회전 · offset mm ÷ 한 장 mm).
// 사진이 아직 안 왔으면 바탕색만 칠한다 — 도착 알림이 장면을 다시 짓는다(photoTextures 머리).
function applyPhoto(threeMaterial, m, assignment, faceSizeMm, sc, worldUv) {
  const maps = photoTextures(m);
  if (!maps) { threeMaterial.color.set(m.base); return threeMaterial; }
  const [rx, ry] = faceRepeat(m, faceSizeMm, { worldUv, scale: sc });
  const shifted = i => Number(assignment.offset?.[i]) || 0;
  const rot = ((Number(assignment.angle) || 0) * Math.PI) / 180;
  const set = sharedPhotoMaps(m.photo, maps, rx, ry, shifted(0) / (sc[0] || 1000), shifted(1) / (sc[1] || 1000), rot);
  for (const key of PHOTO_MAPS) threeMaterial[key] = set[key];   // 같은 배치는 같은 복제본 — 리빌드가 GPU 재업로드를 부르지 않는다
  threeMaterial.normalScale?.set(0.5, 0.5);
  threeMaterial.roughness = 0.9;
  threeMaterial.color.setRGB(...PHOTO_TINT);      // 선형 값 — 시안의 THREE.Color(0.72, 0.72, 0.71)과 같다
  threeMaterial.needsUpdate = true;
  return threeMaterial;
}
