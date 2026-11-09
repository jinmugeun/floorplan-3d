// 에셋 포장 CLI(2026-10-13 · 계획 15 Task A): glTF/GLB 하나를 앱 규약(아키텍처 §19 — m · 바닥 중심 원점 · +Y 위 · 정면 +Z · 크기 = 카탈로그 size —
// 기본 균일은 가장 큰 축이 맞고, --fit axis는 세 축 모두 맞는다)으로 정규화한다. 입력 노드 변환은 그 전에 정점에 굽는다(계획 20 Task 2 Fix 1 — 아래 0).
// 그다음 감량 → 텍스처 WebP → meshopt 압축해 `<out>/<productId>.glb`로 쓰고 manifest 항목을 갱신한다. stdout은 항목 JSON 한 줄(seed.mjs·comfy-batch.mjs가 읽는다).
//   node tools/assets/pack.mjs <in.glb|.gltf> --product <id> [--front +z] [--up y] [--fit uniform|axis] [--tris 8000] [--tex 1024]   (생성 모델은 기본 20000 · 2048)
//        [--source-url U --license L --author A] [--source-kind polyhaven|generated|other] [--out public/models] [--manifest <out>/manifest.json]
// --source-kind(2026-10-13 · 계획 15 Task E): 주지 않으면 URL로 짐작한다(polyhaven.com → polyhaven, 그 밖 → other). ComfyUI 생성 모델은 URL이 없어
// comfy-batch.mjs가 `--source-kind generated`를 넘긴다 — 종류만 줘도 source가 생긴다(NOTICE의 생성 문장이 이 값을 본다).
// 저장소 manifest(public/models/manifest.json)를 쓸 때는 저장소 루트 NOTICE.md도 manifest에서 다시 만든다(계획 15 Task C · lib.noticeMarkdown).
// --front는 **up 변환 뒤**의 정면 축(+z · -z · +x · -x): Blender식 Z-up · 정면 −Y 모델은 X −90° 뒤 정면이 +Z라 `--up z --front +z`(사전 검토 C-1).
// 사전 검토 scratch/p15/pkg/pack-proto.mjs(gltf-transform 4.5.1 실측 — painted_wooden_chair_01 492 KB → 203 KB · dining_chair_02 22,013 → 9,499 삼각형)를 정식으로 옮겼다.
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, dequantize, flatten, getBounds, join, meshopt, prune, simplify, textureCompress, transformMesh, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join as pjoin, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productById } from '../../src/products/catalog.js';
import { ASSET_BUDGET, FRONT_YAW, SOURCE_KINDS, checkManifestEntry, manifestEntry, noticeMarkdown, normalizeTransform } from './lib.mjs';

const fail = msg => { console.error(`pack: ${msg}`); process.exit(1); };
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const input = argv[0], id = opt('--product'), front = opt('--front', '+z'), up = opt('--up', 'y'), sourceKind = opt('--source-kind');
// --fit(계획 20 D3): uniform(기본 · 비율 보존) | axis(축마다 카탈로그에 맞춤 — 생성 모델 · manifest에 rawFit을 남긴다).
const fitMode = opt('--fit', 'uniform');
// 감량·텍스처 기본값은 생성 모델(--source-kind generated)이면 생성 예산(2만 면 · 2048 — 워크플로 DecimateMesh · Texture Resolution과 같아 두 번 감량하지 않는다 ·
// README §4), 그 밖은 8천 · 1024. comfy-batch.mjs --pack은 --source-kind generated만 넘기므로 이 기본값을 탄다.
const gen = sourceKind === 'generated';
const maxTris = Number(opt('--tris', gen ? ASSET_BUDGET.trisGenerated : 8000)), tex = Number(opt('--tex', gen ? ASSET_BUDGET.textureGenerated : ASSET_BUDGET.texture));
// 기본 출력은 저장소의 public/models — 스크립트 자리 기준이라 어디서 불러도 같다(사용자가 준 경로는 보통처럼 cwd 기준).
const outDir = resolve(opt('--out', fileURLToPath(new URL('../../public/models', import.meta.url))));
const manifestPath = resolve(opt('--manifest', pjoin(outDir, 'manifest.json')));
if (!input || input.startsWith('--') || !existsSync(input)) fail(`입력 파일이 없다: ${input ?? '(없음)'} — 사용법은 파일 머리 주석`);
const product = productById(id);
if (!product) fail(`카탈로그에 없는 제품: ${id ?? '(--product 없음)'}`);
// 오타(`--front z`)가 조용히 회전 0으로 지나가면 모델이 벽을 본다 — 표에 있는 값만 받는다.
if (!Object.hasOwn(FRONT_YAW, front)) fail(`--front는 ${Object.keys(FRONT_YAW).join(' · ')} 중 하나: ${front}`);
if (up !== 'y' && up !== 'z') fail(`--up은 y 또는 z: ${up}`);
if (fitMode !== 'uniform' && fitMode !== 'axis') fail(`--fit은 uniform 또는 axis: ${fitMode}`);
if (sourceKind !== undefined && !SOURCE_KINDS.includes(sourceKind)) fail(`--source-kind는 ${SOURCE_KINDS.join(' · ')} 중 하나: ${sourceKind}`);
if (!(Number.isInteger(maxTris) && maxTris > 0 && Number.isInteger(tex) && tex > 0)) fail('--tris·--tex는 양의 정수');
const man = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { version: 1, products: {} };
if (man.version !== 1 || !man.products || typeof man.products !== 'object') fail(`manifest 형식이 다르다(version 1 · products 필요): ${manifestPath}`);

await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready, MeshoptDecoder.ready]);
// 로그는 WARN 이상만(stderr): INFO(`prune: Removed types…`)가 stdout에 섞이면 "JSON 한 줄" 계약이 깨진다(사전 검토 S-3). 디코더는 meshopt 압축된 입력용.
const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.WARN)).registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
// Draco·KTX2는 받지 않는다(런타임 디코더를 두지 않는다 — 사전 검토 I-10 · 필요하면 devDeps draco3dgltf로 포장 때 풀기 — 이월).
const doc = await io.read(input).catch(e => fail(`읽기 실패(Draco 압축 입력은 받지 않는다): ${e.message}`));
const root = doc.getRoot(), scene = root.getDefaultScene() ?? root.listScenes()[0];
const banned = root.listExtensionsUsed().map(e => e.extensionName).filter(n => n === 'KHR_draco_mesh_compression' || n === 'KHR_texture_basisu');
if (banned.length) fail(`받지 않는 확장: ${banned.join(', ')}`);

// 0) 굽기(계획 20 Task 2 Fix 1) — 입력 노드 변환(회전·배율·이동)을 정점에 굽고 장면의 모든 노드를 단위 변환으로 둔다. 아래 축별 배율(S)이 입력의
//    90° 배수가 아닌 회전(R)과 곱해지면 S·R에 밀림(shear)이 생기는데, flatten()은 월드 행렬을 TRS로 분해하며 밀림을 버린다(gltf-transform 4.5.1
//    clearNodeParent) — 모양이 비스듬히 늘어난다(Idol orient 노드는 90° 배수에서 최대 36° 벗어난다 · 식탁 4인 12.7° → [1.197, 0.728, 0.773] / 카탈로그 [1.2, 0.73, 0.75]).
//    굽고 나면 남는 회전은 asset-turn(90° 배수)뿐이다. 월드 행렬(getWorldMatrix)은 조상 행렬을 그대로 곱하므로 입력 계층의 밀림까지 담긴다.
//    여러 노드가 같은 메시를 쓰면 **굽기 전에** 둘째부터 메시를 복제한다 — transformMesh는 다른 메시와 나눈 primitive만 복제하고 접근자는 새로 만들지만,
//    이미 구운 메시를 복제하면 두 번 돌아간다. 균일 배율은 회전과 바뀌므로 균일 포장의 월드 형상은 예전과 같다.
//    (Fix 2) gltf-transform 4.5.1 transformMesh의 두 결함을 비켜 간다.
//    ① 정규화 정수 NORMAL·TANGENT를 되쓸 때 encodeNormalizedInt 대신 decodeNormalizedInt(v / 32767)를 불러 값이 모두 0이 된다
//       (포장한 GLB를 다시 포장하면 — KHR_mesh_quantization int16 — 개수대 법선 14,379/14,379가 0 → 검게 그려졌다) → 먼저 dequantize()로 모든 속성을 float32로 푼다.
//    ② applyTangentMatrix가 제자리 계산이다(x를 덮어쓴 뒤 y·z 계산에 다시 쓴다) — 회전이 있으면 float여도 접선이 틀어진다 → 굽는 동안 TANGENT를
//       이름(_PACK_TANGENT)만 바꿔 비켜 두고(compactPrimitive는 이름과 상관없이 모든 속성을 같이 재배열한다) 직접 돌린다: xyz = 3×3 · 정규화,
//       w(손잡이)는 행렬식이 음수(거울)면 뒤집는다 — 비탄젠트 = w·(N × T)가 M·B와 같은 쪽을 가리키게.
await doc.transform(dequantize());
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], TANGENT_ASIDE = '_PACK_TANGENT';
const sceneNodes = []; scene?.traverse(node => sceneNodes.push([node, node.getWorldMatrix()]));
const seenMeshes = new Set();
for (const [node] of sceneNodes) { const m = node.getMesh(); if (m && seenMeshes.has(m)) node.setMesh(m.clone()); else if (m) seenMeshes.add(m); }
const scenePrims = () => sceneNodes.flatMap(([node]) => node.getMesh()?.listPrimitives() ?? []);
for (const p of scenePrims()) { const t = p.getAttribute('TANGENT'); if (t) p.setAttribute(TANGENT_ASIDE, t).setAttribute('TANGENT', null); }
for (const [node, world] of sceneNodes) {
  const mesh = node.getMesh();
  if (!mesh || world.every((v, i) => v === IDENTITY[i])) continue;
  transformMesh(mesh, world);                                   // 이 메시의 primitive는 모두 새 접근자(compactPrimitive)라 아래 제자리 계산이 다른 메시에 새지 않는다
  const m = world, det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]), t = [0, 0, 0, 0];
  for (const p of mesh.listPrimitives()) {
    const a = p.getAttribute(TANGENT_ASIDE); if (!a) continue;
    for (let i = 0; i < a.getCount(); i++) {
      a.getElement(i, t);
      const x = m[0] * t[0] + m[4] * t[1] + m[8] * t[2], y = m[1] * t[0] + m[5] * t[1] + m[9] * t[2], z = m[2] * t[0] + m[6] * t[1] + m[10] * t[2], l = Math.hypot(x, y, z) || 1;
      a.setElement(i, [x / l, y / l, z / l, det < 0 ? -t[3] : t[3]]);
    }
  }
}
for (const p of scenePrims()) { const a = p.getAttribute(TANGENT_ASIDE); if (a) p.setAttribute('TANGENT', a).setAttribute(TANGENT_ASIDE, null); }
for (const [node] of sceneNodes) node.setMatrix(IDENTITY);
const bbox = scene && getBounds(scene);
if (!bbox || !bbox.min.every(Number.isFinite)) fail('장면에 메시가 없다');

// 1) 정규화 — 회전 노드(turn)에 장면 루트 노드들을 옮기고, 그 부모(wrap)에 축별 배율·이동을 건다: M = T·S·R(점은 먼저 돌고, 돈 뒤의 앱 축으로 늘어난다).
//    (0)에서 입력 노드는 모두 단위 변환이 됐으므로 S가 곱해지는 회전은 R(90° 배수)뿐이다 — 밀림이 생기지 않는다.
//    균일 배율이면 예전(한 노드 T·R·S)과 같은 변환이다. wrap·turn은 굽지 않아도 three가 노드 변환을 따르고, flatten()이 이 변환을 메시 노드로 내린다(사전 검토 §3).
//    회전은 Euler 'YXZ'(Z → X → Y 순서로 적용 = lib.mjs rotateBox와 같은 순서) → q = qY·qX·qZ.
const n = normalizeTransform({ bbox, size: product.size, front, up, fit: fitMode });
const axisQ = (axis, a) => { const q = [0, 0, 0, Math.cos(a / 2)]; q[axis] = Math.sin(a / 2); return q; };
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const [rx, ry, rz] = n.rotation;
const turn = doc.createNode('asset-turn').setRotation(qmul(qmul(axisQ(1, ry), axisQ(0, rx)), axisQ(2, rz)));
const wrap = doc.createNode('asset-normalize').setScale(n.axisScale).setTranslation(n.translation);
for (const c of scene.listChildren()) { scene.removeChild(c); turn.addChild(c); }
wrap.addChild(turn); scene.addChild(wrap);

// 2) 정리 → 감량 → 텍스처 → 압축. 삼각형 수 = 모든 primitive 인덱스/3(weld 뒤로는 늘 인덱스가 있다).
const triCount = () => root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, q) => a + (q.getIndices() ?? q.getAttribute('POSITION')).getCount() / 3, 0), 0);
await doc.transform(flatten(), join(), dedup(), prune(), weld());
// simplify의 ratio는 **정점** 비율이고 error가 작으면 목표에 못 미친다 — 0.001로 못 미치면 0.01 → 0.05로 올려 다시(사전 검토 §3: 22,013 → 9,499).
for (const error of [0.001, 0.01, 0.05]) {
  const tris = triCount(); if (tris <= maxTris) break;
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, maxTris / tris), error }));
}
// resize는 안쪽 맞춤(작으면 키우지 않는다) · 형식이 바뀌면 크기와 무관하게 WebP로 바꾼다(gltf-transform 4.5.1 compressTexture).
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex] }));
// meshopt()가 reorder + quantize까지 감싼다 — 별도 quantize()를 부르면 이중 양자화(사전 검토 S-3).
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

// 3) 쓰기 · 통계 · manifest
mkdirSync(outDir, { recursive: true });
const glb = await io.writeBinary(doc);
writeFileSync(pjoin(outDir, `${id}.glb`), glb);
const textures = await Promise.all(root.listTextures().map(async t => { const m = await sharp(t.getImage()).metadata(); return { w: m.width, h: m.height, format: t.getMimeType() }; }));
const url = opt('--source-url'), license = opt('--license'), author = opt('--author');
// 출처 종류는 --source-kind가 있으면 그것, 없으면 URL로 정한다 — seed.mjs(Task C)는 --source-url·--license·--author만 넘긴다.
const source = sourceKind || url || license || author
  ? { kind: sourceKind ?? (/^https?:\/\/(www\.)?polyhaven\.com\//.test(url ?? '') ? 'polyhaven' : 'other'), url: url ?? null, license: license ?? null, author: author ?? null } : null;
const entry = manifestEntry({ id, bytes: glb.byteLength, tris: triCount(), textures, size: [...product.size], fit: n.fit.map(f => +f.toFixed(4)),
  ...(fitMode === 'axis' ? { rawFit: n.rawFit.map(f => +f.toFixed(4)) } : {}),
  extensions: root.listExtensionsUsed().map(e => e.extensionName).sort(), source, sha256: createHash('sha256').update(glb).digest('hex'), packedAt: new Date().toISOString() });
// 제품 id 순으로 적는다 — 포장 순서가 달라도 manifest diff가 흔들리지 않게.
man.products = Object.fromEntries(Object.entries({ ...man.products, [id]: entry }).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
writeFileSync(manifestPath, JSON.stringify(man, null, 2) + '\n');
// NOTICE.md는 저장소 manifest와 짝이다(계획 15 Task C): 그것을 쓸 때만 다시 만든다 — 임시 manifest(테스트의 --manifest)가 저장소 NOTICE를 덮지 않게.
// relative() === ''로 같은 파일인지 본다(Windows 드라이브 글자 대소문자 차이를 견딘다).
if (relative(manifestPath, fileURLToPath(new URL('../../public/models/manifest.json', import.meta.url))) === '')
  writeFileSync(fileURLToPath(new URL('../../NOTICE.md', import.meta.url)), noticeMarkdown(man, pid => productById(pid)?.name));
const { problems } = checkManifestEntry(entry);
if (problems.length) console.error(`pack: 경고 — ${id} 예산 밖(${problems.join(', ')}) · npm run assets:check가 막는다`);
console.log(JSON.stringify(entry));
