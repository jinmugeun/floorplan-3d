// 자세 보정(계획 20 Task 1 ← scratch/q/rc-orient.mjs): node tools/assets/idol/orient.mjs <입력.glb> <출력.glb> [추가 Y 돌림°] → <출력>.glb + 회전 <출력>.json
//   상자형 기구 가정 — 면 넓이 가중 법선이 몰리는 세 직교 방향 중 +Y에 가까운 것을 위, +Z(카메라 쪽)에 가까운 것을 앞으로 돌린다.
//   Idol은 앞면이 +X로 나와 −90°를 준다(batch.sh). 질감이 있으면 정점색(COLOR_0)을 지운다(three가 질감 × 정점색으로 그려 검은 얼룩).
import { writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { normals } from '@gltf-transform/functions';
const [IN, OUT, YAW = '0'] = process.argv.slice(2);
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(IN), root = doc.getRoot();
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(...a); return a.map(x => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// 면 법선(넓이 가중), 월드 좌표
const N = [];
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const m = node.getWorldMatrix(), tf = v => [0, 1, 2].map(k => m[k] * v[0] + m[4 + k] * v[1] + m[8 + k] * v[2] + m[12 + k]);
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
    for (let t = 0; t < idx.length; t += 3) {
      const A = tf(pos.getElement(idx[t], a)), B = tf(pos.getElement(idx[t + 1], b)), C = tf(pos.getElement(idx[t + 2], c));
      const n = cross([B[0] - A[0], B[1] - A[1], B[2] - A[2]], [C[0] - A[0], C[1] - A[1], C[2] - A[2]]), w = Math.hypot(...n);
      if (w > 0) N.push([n[0] / w, n[1] / w, n[2] / w, w]);
    }
  }
}
// 축 찾기: seed 근처(±, 30° 안) 법선의 가중 평균을 반복 — perp가 있으면 그 축에 직교하게 유지
function axis(seed, perp) {
  let d = norm(seed);
  for (let it = 0; it < 20; it++) {
    const s = [0, 0, 0];
    for (const [x, y, z, w] of N) { const c = x * d[0] + y * d[1] + z * d[2], g = Math.sign(c); if (Math.abs(c) > Math.cos(Math.PI / 6)) { s[0] += g * w * x; s[1] += g * w * y; s[2] += g * w * z; } }
    if (perp) { const k = dot(s, perp); for (let i = 0; i < 3; i++) s[i] -= k * perp[i]; }
    d = norm(s);
  }
  return d;
}
const up = axis([0, 1, 0]);
const seedF = [0, 0, 1].map((v, i) => v - up[2] * up[i]);
const front = axis(seedF, up), right = cross(up, front);
// 회전 R: 행 = [right; up; front] → 월드 벡터를 (x,y,z) = (right·v, up·v, front·v)로
const R = [right, up, front];
const tr = R[0][0] + R[1][1] + R[2][2];
let q;   // 회전 행렬 → 사원수(x,y,z,w)
if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(R[2][1] - R[1][2]) / s, (R[0][2] - R[2][0]) / s, (R[1][0] - R[0][1]) / s, s / 4]; }
else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) { const s = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2; q = [s / 4, (R[0][1] + R[1][0]) / s, (R[0][2] + R[2][0]) / s, (R[2][1] - R[1][2]) / s]; }
else if (R[1][1] > R[2][2]) { const s = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2; q = [(R[0][1] + R[1][0]) / s, s / 4, (R[1][2] + R[2][1]) / s, (R[0][2] - R[2][0]) / s]; }
else { const s = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2; q = [(R[0][2] + R[2][0]) / s, (R[1][2] + R[2][1]) / s, s / 4, (R[1][0] - R[0][1]) / s]; }
// 추가 Y 돌림(모델마다 앞면 규칙이 다름 — Idol은 앞면이 +X라 -90°): q = qY · q
{ const h = (+YAW) * Math.PI / 360, [x, y, z, w] = q, c = Math.cos(h), s = Math.sin(h); q = [c * x + s * z, c * y + s * w, c * z - s * x, c * w - s * y]; }
const scene = root.getDefaultScene() ?? root.listScenes()[0];
const holder = doc.createNode('orient').setRotation(q);
for (const c of scene.listChildren()) { scene.removeChild(c); holder.addChild(c); }
scene.addChild(holder);
// 질감이 있는 재질이면 정점색(COLOR_0) 제거 — three.js가 질감 × 정점색으로 그려, 우리 노드의 겉면 정점색(색 볼륨 밖 = 검정)이 얼룩이 됨
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives())
  if (prim.getMaterial()?.getBaseColorTexture() && prim.getAttribute('COLOR_0')) prim.setAttribute('COLOR_0', null);
await doc.transform(normals({ overwrite: false }));   // 법선 없는 메시(SplatToMesh)는 계산해 넣음
await io.write(OUT, doc);
writeFileSync(OUT.replace(/.glb$/, '.json'), JSON.stringify({ q, up, front }));   // 같은 회전을 스플랫에도 쓰려고
const deg = v => (Math.acos(Math.min(1, Math.abs(v))) * 180 / Math.PI).toFixed(1);
console.log(`${IN.split('/').pop()} → 위축 기울기 ${deg(up[1])}° · 앞축 돌림 ${deg(dot(front, norm(seedF)))}° (법선 ${N.length})`);
