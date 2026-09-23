// 접힌 라벨의 점(●)은 스프라이트마다 그리지 않고 한 덩어리(THREE.Points)로 모은다(리뷰 I-3): 500개가
// 접혀도 드로우콜은 1개다. 글자가 없으니 텍스처는 흰 ● 하나면 되고(색은 정점 색으로 섞는다), 좌표는
// 라벨이 서 있던 자리 그대로라 앵커가 움직이지 않는다. 자리를 되찾으면 같은 Sprite가 다시 보인다.
// labels3d.js에서 그대로 떼어 낸 조각이다(최종 리뷰 I-3: 그 파일이 299/299라 주석 한 줄도 더할 수
// 없었다) — 동작은 한 줄도 바뀌지 않았다. 점의 상수 둘(글자·높이)도 여기 산다: 캐시를 가진 쪽이
// labelTexture.js(잎)라 labels3d → labelDots 한 방향만 남고 순환이 없다. labels3d.js가 이 이름들을
// 다시 내보내므로 부르는 쪽은 예전 그대로다.
import * as THREE from 'three';
import { cachedTexture } from './labelTexture.js';

export const LABEL_DOT_TEXT = '●';
export const LABEL_DOT_H = 0.18;   // 점 스프라이트의 높이(m). 기본 라벨 0.4의 절반 이하다.
export const LABEL_DOTS_NAME = 'labelDots';
const DOT_TEX_PX = 64;

function dotTexture() {
  const P = DOT_TEX_PX;
  return cachedTexture(`dots|${LABEL_DOT_TEXT}`, c => {
    const ctx = c.getContext?.('2d');
    if (!ctx) return null;
    c.width = P; c.height = P;
    ctx.clearRect(0, 0, P, P);
    ctx.fillStyle = '#ffffff';          // 흰 ●에 정점 색을 곱한다 — 라벨 상자와 달리 바탕이 없다
    ctx.font = `bold ${Math.round(P * 0.8)}px "IBM Plex Sans KR", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(LABEL_DOT_TEXT, P / 2, P / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}
// 자리는 라벨 수만큼 미리 잡고 drawRange로 실제 개수만 그린다(매 컬링마다 버퍼를 새로 만들지 않는다). disposeGroup은 Sprite가 아닌 geometry와 perMesh 재질을 버리므로 이 Points도 그 규칙을 탄다.
function makeDotPoints(group, capacity) {
  const map = dotTexture();
  if (!map) return null;
  const geo = new THREE.BufferGeometry();
  for (const k of ['position', 'color']) geo.setAttribute(k, new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
  const mat = new THREE.PointsMaterial({ map, size: LABEL_DOT_H, sizeAttenuation: true, vertexColors: true, transparent: true, depthTest: false, depthWrite: false });
  mat.userData.perMesh = true;
  const p = new THREE.Points(geo, mat);
  p.name = LABEL_DOTS_NAME; p.frustumCulled = false;   // 자리를 다 채우지 않은 버퍼라 경계구를 믿을 수 없다
  group.add(p);
  return p;
}
// dots = 접힌 스프라이트들. 점이 하나도 없으면 배치를 만들지도 않는다(기존 그룹 모양을 바꾸지 않게).
export function syncLabelDots(group, dots, capacity = dots.length, size = LABEL_DOT_H) {
  let p = (group?.children ?? []).find(o => o.name === LABEL_DOTS_NAME) ?? null;
  if (!p && !dots.length) return null;
  if (!p || p.geometry.getAttribute('position').count < capacity) {
    if (p) { group.remove(p); p.geometry.dispose(); p.material.dispose(); }
    p = makeDotPoints(group, Math.max(capacity, dots.length));
  }
  if (!p) return null;
  const pos = p.geometry.getAttribute('position'), col = p.geometry.getAttribute('color'), c = new THREE.Color();
  // Color.set이 sRGB → 작업 색공간 변환까지 맡는다(정점 색은 three가 변환해 주지 않는다).
  dots.forEach((s, i) => { pos.setXYZ(i, s.position.x, s.position.y, s.position.z); c.set(s.userData.color ?? '#1b2430'); col.setXYZ(i, c.r, c.g, c.b); });
  pos.needsUpdate = col.needsUpdate = true;
  p.geometry.setDrawRange(0, dots.length);
  p.material.size = size; p.visible = dots.length > 0;
  return p;
}
