// 에셋 도구(tools/assets/ · 2026-10-13 · 계획 15 Task A): 정규화 수학 · manifest 게이트 · pack/check CLI.
// 규약(아키텍처 §19): 단위 m · 원점 = 바닥 중심 · +Y 위 · 정면 +Z(앱의 등받이가 −Z — 사전 검토 C-1) · 포장은 균일 배율(가장 큰 축 = 카탈로그 size).
import { test, expect } from 'vitest';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';               // zlib.crc32: Node ≥ 22.2 / 20.15 (CI Node 20 최신 20.x면 있음 · 사전 검토 S-11)
import { fileURLToPath } from 'node:url';
import { ASSET_BUDGET, ALLOWED_EXTENSIONS, FRONT_YAW, normalizeTransform, checkManifestEntry, manifestEntry } from '../tools/assets/lib.mjs';

test('normalizeTransform: +Y 위·정면 +Z 모델은 회전 0, 균일 배율은 가장 큰 축 기준, 원점은 바닥 중심', () => {
  // 모델 bbox(m): 가로 0.5 · 높이 1.0 · 깊이 0.4, 바닥이 y = 0.2에 떠 있고 중심이 x = 1
  const r = normalizeTransform({ bbox: { min: [0.75, 0.2, -0.2], max: [1.25, 1.2, 0.2] }, size: [500, 400, 900], front: '+z', up: 'y' });
  expect(r.rotation).toEqual([0, 0, 0]);
  expect(r.scale).toBeCloseTo(0.9, 6);                    // 높이 1.0 → 0.9(카탈로그 h 900): 가장 큰 축이 높이
  expect(r.translation[0]).toBeCloseTo(-1 * 0.9, 6);
  expect(r.translation[1]).toBeCloseTo(-0.2 * 0.9, 6);
  expect(r.translation[2]).toBeCloseTo(0, 6);
  expect(r.fit.map(f => +f.toFixed(3))).toEqual([0.9, 1, 0.9]);   // x 0.45/0.5 · y 1 · z 0.36/0.4
});

test('FRONT_YAW와 up: 정면 −Z 모델은 Y축 180°, 정면 +X는 Y축 −90°, Z-up은 X축 −90°(up 변환 뒤 정면 판정)', () => {
  expect(FRONT_YAW).toEqual({ '+z': 0, '-z': Math.PI, '+x': -Math.PI / 2, '-x': Math.PI / 2 });
  expect(normalizeTransform({ bbox: { min: [0, 0, 0], max: [1, 1, 1] }, size: [1000, 1000, 1000], front: '-z', up: 'y' }).rotation).toEqual([0, Math.PI, 0]);
  expect(normalizeTransform({ bbox: { min: [0, 0, 0], max: [1, 1, 1] }, size: [1000, 1000, 1000], front: '+x', up: 'y' }).rotation).toEqual([0, -Math.PI / 2, 0]);
  expect(normalizeTransform({ bbox: { min: [0, 0, 0], max: [1, 1, 1] }, size: [1000, 1000, 1000], front: '+z', up: 'z' }).rotation).toEqual([-Math.PI / 2, 0, 0]);
});

test('checkManifestEntry: 예산 안이면 ok, 넘거나 fit이 0.85 미만이면 문제 이름이 난다', () => {
  const ok = manifestEntry({ id: 'chair-dining', bytes: 400_000, tris: 6_000, textures: [{ w: 1024, h: 1024, format: 'image/webp' }], size: [450, 500, 900], fit: [0.89, 1, 0.98], extensions: ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_texture_webp'], source: { kind: 'polyhaven', url: 'https://polyhaven.com/a/painted_wooden_chair_01', license: 'CC0-1.0', author: 'Poly Haven' }, sha256: 'ab'.repeat(32) });
  expect(checkManifestEntry(ok)).toEqual({ ok: true, problems: [] });
  const bad = { ...ok, bytes: 2_000_000, tris: 20_000, textures: [{ w: 2048, h: 2048, format: 'image/png' }], fit: [0.5, 1, 1.05], extensions: ['KHR_materials_pbrSpecularGlossiness'] };
  expect(checkManifestEntry(bad).problems).toEqual(expect.arrayContaining(['bytes', 'tris', 'texture', 'fit', 'extension:KHR_materials_pbrSpecularGlossiness']));
  expect(ASSET_BUDGET).toEqual({ bytes: 1_500_000, tris: 10_000, texture: 1024, fitMin: 0.85 });
});

// ── pack CLI 통합(Step 6) — 사전 검토 scratch/p15/pkg/step6.test.js의 통과 코드(1 passed · 7,488 B · 24 삼각형)를 옮겼다.
const PACK = fileURLToPath(new URL('../tools/assets/pack.mjs', import.meta.url));
const io = () => new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
// sharp 없이 PNG(RGB) — 픽스처가 네이티브 모듈에 기대지 않게(sharp는 pack 안에서만 쓴다)
function png(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3, g = ((x >> 5) + (y >> 5)) & 1 ? 200 : 90; raw[o] = g; raw[o + 1] = 120; raw[o + 2] = 60; } }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// 축 정렬 상자 프리미티브(24 정점 · 12 삼각형 · 법선 · uv)
function boxPrim(doc, buf, [x0, y0, z0], [x1, y1, z1], material) {
  const P = [], N = [], U = [], I = [];
  const face = (a, b, c, d, n) => { const k = P.length / 3; P.push(...a, ...b, ...c, ...d); for (let i = 0; i < 4; i++) N.push(...n); U.push(0, 0, 1, 0, 1, 1, 0, 1); I.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  face([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]); face([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [-1, 0, 0]);
  face([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [0, 1, 0]); face([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
  face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]); face([x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0], [0, 0, -1]);
  const acc = (type, arr, T) => doc.createAccessor().setType(type).setArray(new T(arr)).setBuffer(buf);
  return doc.createPrimitive().setAttribute('POSITION', acc('VEC3', P, Float32Array)).setAttribute('NORMAL', acc('VEC3', N, Float32Array))
    .setAttribute('TEXCOORD_0', acc('VEC2', U, Float32Array)).setIndices(acc('SCALAR', I, Uint16Array)).setMaterial(material);
}
// 원본(z-up · 정면 +x): 깊이(x) 1.0 · 너비(y) 0.9 · 높이(z) 1.8 → 정규화 뒤 0.9 × 1.8 × 1.0 → chair-dining(450×500×900)에 배율 0.5로 꼭 맞는다(fit [1, 1, 1]).
// 표식(nose): 정면(+x) 위쪽의 작은 상자 → 정규화 뒤 +Z · 위쪽에 있어야 한다(정면·위 회전을 함께 검사 — 정육면체로는 회전 오류가 안 보인다 · 사전 검토 I-9).
async function packFixture(tmp) {
  const doc = new Document(); const buf = doc.createBuffer();
  const tex = doc.createTexture('body').setImage(png(512, 512)).setMimeType('image/png');
  const body = doc.createMaterial('body').setBaseColorTexture(tex), noseMat = doc.createMaterial('nose').setBaseColorFactor([1, 0, 0, 1]);
  const mesh = doc.createMesh('m').addPrimitive(boxPrim(doc, buf, [3, -0.45, 0.2], [4, 0.45, 2.0], body))   // 바닥 z = 0.2에 떠 있고 중심 x = 3.5
    .addPrimitive(boxPrim(doc, buf, [3.98, -0.1, 1.6], [4.0, 0.1, 1.8], noseMat));
  doc.createScene('s').addChild(doc.createNode('n').setMesh(mesh));
  const input = join(tmp, 'in.glb'); writeFileSync(input, await io().writeBinary(doc));
  const out = execFileSync(process.execPath, [PACK, input, '--product', 'chair-dining', '--front', '+x', '--up', 'z', '--out', tmp, '--manifest', join(tmp, 'manifest.json')], { encoding: 'utf8' });
  return { out, glb: join(tmp, 'chair-dining.glb'), manifest: join(tmp, 'manifest.json') };
}

test('pack: z-up · 정면 +X 상자(+ 앞·위 표식)를 chair-dining에 맞춘다 — 바닥 0 · 중심 0 · 정면 +Z · 위 +Y · 확장 허용 · manifest', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'p15-pack-'));
  try {
    const { out, glb, manifest } = await packFixture(tmp);
    expect(out.trim().split('\n')).toHaveLength(1);       // stdout = JSON 한 줄(gltf-transform 로그는 WARN 이상만 · stderr)
    const entry = JSON.parse(out);
    await MeshoptDecoder.ready;
    const back = await io().read(glb);
    const bb = getBounds(back.getRoot().listScenes()[0]);
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(0.45, 2); expect(bb.max[1] - bb.min[1]).toBeCloseTo(0.9, 2); expect(bb.max[2] - bb.min[2]).toBeCloseTo(0.5, 2);
    expect(bb.min[1]).toBeCloseTo(0, 3); expect((bb.min[0] + bb.max[0]) / 2).toBeCloseTo(0, 3); expect((bb.min[2] + bb.max[2]) / 2).toBeCloseTo(0, 3);
    const node = back.getRoot().listNodes().find(n => n.getMesh());
    const prim = node.getMesh().listPrimitives().find(p => p.getMaterial()?.getName() === 'nose');
    const M = node.getWorldMatrix(), pos = prim.getAttribute('POSITION'), v = [0, 0, 0]; let sy = 0, sz = 0;
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); sy += M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13]; sz += M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14]; }
    expect(sz / pos.getCount()).toBeGreaterThan(0.2);     // 정면 = +Z
    expect(sy / pos.getCount()).toBeGreaterThan(0.7);     // 위쪽
    expect(entry.extensions.every(e => ALLOWED_EXTENSIONS.includes(e))).toBe(true);
    expect(entry.extensions).toContain('EXT_meshopt_compression');
    expect(entry.textures).toEqual([{ w: 512, h: 512, format: 'image/webp' }]);   // 1024보다 작으면 키우지 않고 WebP로만
    expect(entry.tris).toBe(24);
    expect(entry.size).toEqual([450, 500, 900]);
    expect(entry.fit).toEqual([1, 1, 1]);
    expect(entry.bytes).toBe(readFileSync(glb).byteLength);
    expect(checkManifestEntry(entry)).toEqual({ ok: true, problems: [] });
    const man = JSON.parse(readFileSync(manifest, 'utf8'));
    expect(man.version).toBe(1);
    expect(man.products['chair-dining']).toEqual(entry);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}, 30000);

// ── check CLI(Step 7): manifest 항목마다 파일 존재 · bytes · sha256 · checkManifestEntry → 문제면 표 + 종료 1(게이트 `npm run assets:check`).
const CHECK = fileURLToPath(new URL('../tools/assets/check.mjs', import.meta.url));
const check = manifest => spawnSync(process.execPath, [CHECK, '--manifest', manifest], { encoding: 'utf8' });   // stdout·stderr를 모두 받는다(테스트 출력에 새지 않게)

test('check: 포장 직후 manifest는 종료 0, GLB 한 바이트를 바꾸면 sha256 문제 표 + 종료 1, 파일이 없으면 file', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'p15-check-'));
  try {
    const { glb, manifest } = await packFixture(tmp);
    const ok = check(manifest);
    expect([ok.status, ok.stderr]).toEqual([0, '']);
    const bytes = readFileSync(glb); bytes[bytes.length - 1] ^= 0xff; writeFileSync(glb, bytes);   // 크기는 그대로 · 내용만
    const bad = check(manifest);
    expect(bad.status).toBe(1);
    expect(bad.stdout).toMatch(/\| chair-dining \| sha256 \|/);
    rmSync(glb);
    expect(check(manifest)).toMatchObject({ status: 1, stdout: expect.stringMatching(/\| chair-dining \| file \|/) });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}, 30000);

test('check: 저장소의 빈 manifest(public/models/manifest.json)는 종료 0 — 게이트가 시드 전에도 돈다', () => {
  const man = fileURLToPath(new URL('../public/models/manifest.json', import.meta.url));
  expect(JSON.parse(readFileSync(man, 'utf8'))).toMatchObject({ version: 1 });
  expect(check(man).status).toBe(0);
});
