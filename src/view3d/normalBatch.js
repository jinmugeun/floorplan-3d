// 윤곽선 ② 법선·깊이 패스를 그리기 한 번으로(계획 17 성능 · .superpowers/sdd/p17-perf-report.md).
// 왜: 신상중 궤도 프레임은 GPU가 아니라 그리기 호출 수에 묶여 있었다 — ②가 메시 712개를 MeshNormalMaterial로 다시 그리며 메인 스레드 3.4 ms.
// 보이는 불투명 메시를 모두 한 지오메트리에 모으고(메시 로컬 좌표 + 메시 번호 slot) 메시별 모델뷰 행렬은 부동소수 텍스처로 넘긴다.
// 셰이더는 MeshNormalMaterial(DoubleSide)과 같은 값 — 시점 공간 법선 · 뒷면은 뒤집고 · 0.5 + 0.5 — 을 같은 깊이로 쓴다(③ 합성은 그대로).
// 지오메트리는 후보 메시·지오메트리·버전이 바뀔 때만(씬 리빌드·에셋 도착) 다시 짓고, 매 프레임은 행렬만 올린다(①이 갱신한 카메라로). 안 보이는 메시는 [15] = 0 → 화면 밖.
// 같은 훑기에서 겹침 뿌리(④)·조명(④가 그대로 쓴다)·그림자 서명(그림자 맵을 다시 그릴지 — outlinePass)도 모은다.
import * as THREE from 'three';

// ②에서 숨길 물체인가(순수 — 테스트 대상).
export function skipInNormalPass(o) {
  if (o.isTransformControlsRoot || o.isSprite || o.isPoints || o.isLine) return true;
  const m = o.material;
  if (!m) return false;
  const off = x => x.transparent || x.visible === false;
  return Array.isArray(m) ? m.some(off) : off(m);
}

// ④ 겹침인가: 라벨 Sprite · 접힌 점 Points · 기즈모 뿌리 — 모두 depthTest false라 깊이 버퍼 없이 합성 위에 그려도 그림이 같다.
export const isOverlay = o => !!(o.isSprite || o.isPoints || o.isTransformControlsRoot);

// 묶음이 그대로 그릴 수 있는 메시인가: 한 재질 · 전체 그리기 범위 · 위치·법선이 있다(인스턴스·스킨·모프는 MeshNormalMaterial 경로로).
export const batchable = m => {
  const g = m.geometry, a = g?.attributes;
  return !(m.isInstancedMesh || m.isSkinnedMesh || m.isBatchedMesh || Array.isArray(m.material)) && !!a?.position && !!a.normal
    && !g.morphAttributes?.position && g.drawRange.start === 0 && g.drawRange.count === Infinity;
};

export const sameList = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };

// 그림자 맵에 들어가는 것(WebGLShadowMap.renderObject): 던지는 메시·선·점의 행렬 · 지오메트리(와 내용 버전) · 재질 보임·면·알파 컷.
function casterSig(o, s) {
  const g = o.geometry, e = o.matrixWorld.elements;
  s.push(o.id, g?.id ?? -1, g?.attributes?.position?.version ?? -1);
  if (Array.isArray(o.material)) for (const m of o.material) matSig(m, s); else matSig(o.material, s);
  for (let i = 0; i < 16; i++) s.push(e[i]);
}
const matSig = (m, s) => s.push(m ? (m.visible ? 1 : 0) + m.side * 2 + (m.shadowSide ?? 3) * 8 : -1, m?.alphaTest ?? 0);
// 그림자를 던지는 조명: 자리·겨냥 · 그림자 카메라 범위 · 맵 크기.
function lightSig(l, s) {
  const c = l.shadow?.camera, e = l.matrixWorld.elements, t = l.target?.matrixWorld.elements ?? e;
  s.push(l.id, c?.left ?? 0, c?.right ?? 0, c?.top ?? 0, c?.bottom ?? 0, c?.near ?? 0, c?.far ?? 0, l.shadow?.mapSize.x ?? 0, l.shadow?.mapSize.y ?? 0, l.angle ?? 0, l.distance ?? 0);
  for (let i = 0; i < 16; i++) s.push(e[i], t[i]);
}

// 한 번 훑기(월드 행렬은 부른 쪽이 먼저 갱신한다). w = { over, lights, cand, vis, sig, odd } — 배열은 비우고 다시 채운다.
// three의 projectObject와 같은 규칙: 숨은 물체 아래는 그리지 않고, 층(layers)은 그 물체만 본다. ②는 겹침과 skipInNormalPass 물체(와 그 아래)를 뺀다.
export function sceneWalk(scene, layers, w) {
  w.over.length = w.lights.length = w.cand.length = w.vis.length = w.sig.length = 0; w.odd = false;
  (function walk(o, seen, skip) {
    seen = seen && o.visible;
    if (isOverlay(o)) { if (seen) w.over.push(o); return; }
    const on = seen && o.layers.test(layers);
    skip = skip || (seen && skipInNormalPass(o));
    if (on && o.isLight) { w.lights.push(o); if (o.castShadow) lightSig(o, w.sig); }
    if (o.isMesh) { const d = on && !skip; w.cand.push(o); w.vis.push(d); if (d && !batchable(o)) w.odd = true; }
    if (on && o.castShadow && (o.isMesh || o.isLine || o.isPoints)) casterSig(o, w.sig);
    for (const c of o.children) walk(c, seen, skip);
  })(scene, true, false);
  return w;
}

// 정점 속성 3개를 out[at..]에. 양자화(정규화)·인터리브 속성(압축 GLB)은 getX로 값을 풀어서.
function put(a, out, at) {
  if (!a.isInterleavedBufferAttribute && !a.normalized && a.itemSize === 3 && a.array instanceof Float32Array) { out.set(a.array.subarray(0, a.count * 3), at); return; }
  for (let i = 0; i < a.count; i++) { out[at + i * 3] = a.getX(i); out[at + i * 3 + 1] = a.getY(i); out[at + i * 3 + 2] = a.getZ(i); }
}

// 후보 메시들을 한 지오메트리로: position · normal(메시 로컬) · slot(후보 번호) · 인덱스(Uint32). 묶을 수 없는 메시는 정점 없이 번호만 차지한다.
export function buildBatch(cand) {
  let nv = 0, ni = 0;
  for (const m of cand) if (batchable(m)) { const g = m.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), slot = new Float32Array(nv), idx = new Uint32Array(ni);
  let v = 0, k = 0;
  cand.forEach((m, s) => {
    if (!batchable(m)) return;
    const g = m.geometry, n = g.attributes.position.count, ix = g.index?.array;
    put(g.attributes.position, pos, v * 3); put(g.attributes.normal, nor, v * 3); slot.fill(s, v, v + n);
    if (ix) for (let j = 0; j < ix.length; j++) idx[k++] = ix[j] + v;
    else for (let j = 0; j < n; j++) idx[k++] = v + j;
    v += n;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('slot', new THREE.BufferAttribute(slot, 1)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

// 보이면 모델뷰 행렬 16개(three처럼 CPU에서 배정밀도로 V·M — 깊이·화소 덮임이 MeshNormalMaterial과 같은 비트), 안 보이면 [15] = 0(셰이더가 화면 밖으로 보낸다).
const mv = new THREE.Matrix4();
export function writeMatrices(data, cand, vis, view) {
  for (let i = 0; i < cand.length; i++) { if (vis[i]) data.set(mv.multiplyMatrices(view, cand[i].matrixWorld).elements, i * 16); else data[i * 16 + 15] = 0; }
}

export const BATCH_ROW = 256;   // 행렬 텍스처 한 줄에 메시 256개(텍셀 1024)
// three(MeshNormalMaterial): gl_Position = P · (MV · p) · vNormal = normalize(normalMatrix · n), normalMatrix = MV⁻ᵀ ∝ 여인수 c(= det · MV⁻ᵀ) — 부호를 곱해 방향을 맞춘다.
// 거울 메시(det < 0 — 아이템 좌우 뒤집기)는 three가 앞면을 CW로 바꿔 그린다 → 묶음(CCW)에서는 gl_FrontFacing이 반대라 vF로 되돌린다.
const VERT = `attribute float slot; uniform highp sampler2D tM; varying vec3 vN; flat varying float vF;
void main() {
  int i = int(slot + .5); ivec2 b = ivec2(i % ${BATCH_ROW} * 4, i / ${BATCH_ROW});
  mat4 m = mat4(texelFetch(tM, b, 0), texelFetch(tM, b + ivec2(1, 0), 0), texelFetch(tM, b + ivec2(2, 0), 0), texelFetch(tM, b + ivec2(3, 0), 0));
  vN = vec3(0., 0., 1.); vF = 1.;
  if (m[3][3] == 0.) { gl_Position = vec4(2., 2., 2., 1.); return; }
  mat3 a = mat3(m), c = mat3(cross(a[1], a[2]), cross(a[2], a[0]), cross(a[0], a[1]));
  vF = sign(dot(a[0], c[0]));
  vN = normalize(c * normal * vF);
  gl_Position = projectionMatrix * (m * vec4(position, 1.));
}`;
const FRAG = `varying vec3 vN; flat varying float vF;
void main() { gl_FragColor = vec4(normalize(normalize(vN) * (gl_FrontFacing ? vF : -vF)) * .5 + .5, 1.); }`;

export function createNormalBatch() {
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, uniforms: { tM: { value: null } } });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); mesh.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(mesh);
  const ver = g => (g?.attributes?.position?.version ?? 0) + (g?.attributes?.normal?.version ?? 0) + (g?.index?.version ?? 0);
  let slots = [], tex = null, builds = 0;
  const same = cand => slots.length === cand.length && cand.every((m, i) => slots[i].m === m && slots[i].g === m.geometry && slots[i].v === ver(m.geometry));
  function sync(cand, vis, camera) {
    if (!same(cand)) {
      mesh.geometry.dispose(); mesh.geometry = buildBatch(cand); builds++;
      slots = cand.map(m => ({ m, g: m.geometry, v: ver(m.geometry) }));
      const rows = Math.max(1, Math.ceil(cand.length / BATCH_ROW));
      if (tex?.image.height !== rows) {
        tex?.dispose();
        tex = new THREE.DataTexture(new Float32Array(rows * BATCH_ROW * 16), BATCH_ROW * 4, rows, THREE.RGBAFormat, THREE.FloatType);
        mat.uniforms.tM.value = tex;
      }
    }
    writeMatrices(tex.image.data, cand, vis, camera.matrixWorldInverse); tex.needsUpdate = true;
  }
  return { scene, sync, get builds() { return builds; }, dispose() { mesh.geometry.dispose(); mat.dispose(); tex?.dispose(); slots = []; } };
}
