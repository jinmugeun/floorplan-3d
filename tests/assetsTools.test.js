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
import { ASSET_BUDGET, ALLOWED_EXTENSIONS, FRONT_YAW, normalizeTransform, checkManifestEntry, manifestEntry, sheetLayout, perfVerdict } from '../tools/assets/lib.mjs';
import { roomFor, aimFor } from '../tools/assets/shots.mjs';
import { makeProject } from '../tools/assets/browser.mjs';
import { productById } from '../src/products/catalog.js';

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

test('normalizeTransform fit axis(계획 20 D3): 축마다 카탈로그에 맞춘다 — fit [1, 1, 1] · rawFit = 균일이었다면의 fit · 이동도 축별 배율', () => {
  const r = normalizeTransform({ bbox: { min: [0.75, 0.2, -0.2], max: [1.25, 1.2, 0.2] }, size: [500, 400, 900], front: '+z', up: 'y', fit: 'axis' });
  expect(r.axisScale.map(v => +v.toFixed(6))).toEqual([1, 0.9, 1]);    // x 0.5 → 0.5 · y 1.0 → 0.9 · z 0.4 → 0.4
  expect(r.fit).toEqual([1, 1, 1]);
  expect(r.rawFit.map(f => +f.toFixed(3))).toEqual([0.9, 1, 0.9]);
  expect(r.translation.map(v => +v.toFixed(6))).toEqual([-1, -0.18, 0]);
  const u = normalizeTransform({ bbox: { min: [0.75, 0.2, -0.2], max: [1.25, 1.2, 0.2] }, size: [500, 400, 900] });
  expect(u.axisScale.map(v => +v.toFixed(6))).toEqual([0.9, 0.9, 0.9]);
  expect(u.rawFit).toEqual(u.fit);
});

test('checkManifestEntry: 예산 안이면 ok, 넘거나 fit이 0.85 미만이면 문제 이름이 난다', () => {
  const ok = manifestEntry({ id: 'chair-dining', bytes: 400_000, tris: 6_000, textures: [{ w: 1024, h: 1024, format: 'image/webp' }], size: [450, 500, 900], fit: [0.89, 1, 0.98], extensions: ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_texture_webp'], source: { kind: 'polyhaven', url: 'https://polyhaven.com/a/painted_wooden_chair_01', license: 'CC0-1.0', author: 'Poly Haven' }, sha256: 'ab'.repeat(32) });
  expect(checkManifestEntry(ok)).toEqual({ ok: true, problems: [] });
  const bad = { ...ok, bytes: 2_000_000, tris: 20_000, textures: [{ w: 2048, h: 2048, format: 'image/png' }], fit: [0.5, 1, 1.05], extensions: ['KHR_materials_pbrSpecularGlossiness'] };
  expect(checkManifestEntry(bad).problems).toEqual(expect.arrayContaining(['bytes', 'tris', 'texture', 'fit', 'extension:KHR_materials_pbrSpecularGlossiness']));
  for (const fit of [[], [NaN, 1, 1], undefined]) expect(checkManifestEntry({ ...ok, fit }).problems, String(fit)).toContain('fit');
  for (const t of [{ format: 'image/webp' }, { w: 512, h: 512, format: 'image/png' }]) expect(checkManifestEntry({ ...ok, textures: [t] }).problems, t.format).toContain('texture');
  expect(ASSET_BUDGET).toEqual({ bytes: 1_500_000, tris: 10_000, texture: 1024, fitMin: 0.85, fitMinGenerated: 0.75, trisGenerated: 20_000, textureGenerated: 2048 });
  // 생성 모델(계획 15b)은 하한 0.75 — 시드는 0.85 그대로.
  const gen = { ...ok, fit: [1, 0.8, 0.78], source: { kind: 'generated', url: null, license: '자체 생성물', author: 'ComfyUI TRELLIS.2 생성' } };
  expect(checkManifestEntry(gen)).toEqual({ ok: true, problems: [] });
  expect(checkManifestEntry({ ...gen, fit: [1, 0.74, 1] }).problems).toContain('fit');
  expect(checkManifestEntry({ ...ok, fit: [1, 0.8, 0.78] }).problems).toContain('fit');
  // 생성 모델은 2만 면 · 2048²까지(2026-10-27 · 생성 품질) — 시드는 1만 · 1024² 그대로, 파일 1.5 MB는 둘 다.
  const tex = s => [{ w: s, h: s, format: 'image/webp' }];
  expect(checkManifestEntry({ ...gen, tris: 20_000, textures: tex(2048) })).toEqual({ ok: true, problems: [] });
  expect(checkManifestEntry({ ...gen, tris: 20_001, textures: tex(4096), bytes: 1_500_001 }).problems).toEqual(['bytes', 'tris', 'texture']);
  expect(checkManifestEntry({ ...ok, tris: 10_001, textures: tex(2048) }).problems).toEqual(['tris', 'texture']);
});

// 검수 시트 격자(2026-10-13 · 계획 15 Task D): snapshot.mjs가 제품마다 여섯 장(투영 앞·뒤·좌·위 + 원근 앞·뒤 비스듬히)을 한 장으로 붙일 때 쓴다.
// 열 = ⌈√n⌉ · 행 = ⌈n / 열⌉(거의 정사각) · 칸 = 시트 너비(기본 1200) / 열(정수 px, 칸 상한 400 이하). 장 수가 1 이상의 정수가 아니면 던진다.
test('sheetLayout: 6장은 3 × 2 · 칸 400 px, 1·4·5·16장과 너비 옵션, 0·NaN·2.5장은 오류', () => {
  expect(sheetLayout(6)).toEqual({ cols: 3, rows: 2, cell: 400 });
  expect(sheetLayout(4)).toEqual({ cols: 2, rows: 2, cell: 400 });
  expect(sheetLayout(1)).toEqual({ cols: 1, rows: 1, cell: 400 });            // 칸 상한 — 한 장이 시트 너비 전체로 커지지 않게
  expect(sheetLayout(5)).toEqual({ cols: 3, rows: 2, cell: 400 });
  expect(sheetLayout(16)).toEqual({ cols: 4, rows: 4, cell: 300 });
  expect(sheetLayout(4, { width: 601 })).toEqual({ cols: 2, rows: 2, cell: 300 });   // 정수 px로 내린다
  for (const n of [0, NaN, 2.5]) expect(() => sheetLayout(n)).toThrow(RangeError);
});

// 찍기 장면(2026-11-06 · 계획 20 Task 6 Fix 1): snapshot · compare-shape가 같이 쓰는 방 크기·원근 겨눔(shots.mjs). 겨눔 높이 z는 makeProject가 아이템을
// 놓는 높이와 같아야 한다 — 처음 compare-shape는 벽 부착만 zDefault를 써서 바닥 zDefault 제품(빌트인 오븐 850)과 천장 제품을 바닥 쪽으로 겨눴다.
test('roomFor · aimFor: 방 = 큰 변 + 600 올림(최소 2400) · z = makeProject 아이템 높이(바닥·벽 zDefault · 천장 층고 − 높이) · 겨눔 = 아이템 가운데', () => {
  expect(roomFor({ size: [1200, 750, 850] })).toBe(2400);
  expect(roomFor({ size: [2050, 900, 800] })).toBe(2700);    // 2650 → 100 mm 올림
  expect(roomFor({ size: [900, 3000, 800] })).toBe(3600);    // 깊이가 큰 변
  for (const [id, z] of [['oven-built', 850], ['sink-single', 0], ['cabinet-upper', 1500], ['light-pendant', 1700]]) {   // 바닥+zDefault · 바닥 · 벽 · 천장(2300 − 600)
    const p = productById(id), room = roomFor(p), c = room / 2, aim = aimFor(p, c);
    const item = makeProject({ room, wall: { thickness: 20, height: 2 }, items: [{ productId: id, pos: [c, c] }] }).floors[0].items[0];
    expect([aim.z, item.z]).toEqual([z, z]);
    expect(aim.target).toEqual([c / 1000, (z + p.size[2] / 2) / 1000, c / 1000]);
    expect(aim.ext).toBe(Math.max(...p.size) / 1000);
  }
  expect(aimFor({ attach: 'ceiling', size: [500, 500, 600] }, 1200, 2700).z).toBe(2100);   // 층고 인자(snapshot은 CEILING)
  expect(aimFor({ attach: 'ceiling', size: [500, 500, 3000] }, 1200).z).toBe(0);           // 층고보다 높으면 0 — makeProject의 Math.max(0, …)와 같다
});

// 성능 판정(2026-10-13 · 계획 15 Task D 리뷰 I-1): perf.mjs가 모델 첫 프레임 대기 타임아웃을 삼키면 modelMs가 null이 되고 `null <= 500`이 참이라
// 모델이 하나도 안 선 장면이 목표 3 "통과"를 찍었다(궤도도 상자 대 상자 비교). 판정은 유한수끼리만 비교하고, 에셋 장면은 모델 프레임 ·
// GLB 요청 ≥ 1 · 전송 > 0 · 지오메트리 감소(공유)가 있어야 측정이 성립한다. 값은 Task D 보고서의 vsync 끔 3회 중앙값.
const PERF_OK = {
  box: { firstMs: 327.5, modelMs: null, orbitGapMs: 11.7, geometries: 1210, glbCount: 0, glbBytes: 0, errors: 0 },
  cold: { firstMs: 353.3, modelMs: 561.2, orbitGapMs: 3.4, geometries: 11, glbCount: 1, glbBytes: 203480, errors: 0 },
  warm: { firstMs: 251.1, modelMs: 379.5, orbitGapMs: 3.9, geometries: 11, glbCount: 1, glbBytes: 203480, errors: 0 },
};
test('perfVerdict: 보고서 값은 통과(모델 첫 프레임 561 ms는 참고 — 판정에 넣지 않는다), 장면별 문제는 빈 목록', () => {
  expect(perfVerdict(PERF_OK)).toEqual({ ok: true, orbit: true, firstFrame: true, modelFrame: false, problems: { box: [], cold: [], warm: [] } });
  // 성능 모드 장면(perf)은 첫 프레임·궤도·오류만 본다(모델 판정은 cold·warm만 — 아래 표본은 최종 리뷰 전 규칙(상자)의 실측)
  const withPerf = perfVerdict({ ...PERF_OK, perf: { firstMs: 198.4, modelMs: null, orbitGapMs: 5.7, geometries: 610, glbCount: 0, glbBytes: 0, errors: 0 } });
  expect([withPerf.ok, withPerf.problems.perf]).toEqual([true, []]);
});

test('perfVerdict: 모델이 안 선 에셋 장면(modelMs null · GLB 0 · 지오메트리 그대로)은 실패 — 궤도가 상자 대 상자로 같아도', () => {
  const noModel = { ...PERF_OK.box, firstMs: 340, orbitGapMs: 11.7 };       // 리뷰 I-1: 모델 대기 타임아웃 → 장면은 조합 형상 그대로
  const v = perfVerdict({ ...PERF_OK, cold: noModel, warm: noModel });
  expect(v.ok).toBe(false);
  expect(v.modelFrame).toBe(false);
  expect(v.problems.cold).toEqual(['model', 'glb', 'glbBytes', 'geometries']);
  expect(v.problems.warm).toEqual(['model', 'glb', 'glbBytes', 'geometries']);
  expect(v.problems.box).toEqual([]);
  // GLB는 왔지만 모델 프레임만 못 잡은 경우도 실패
  expect(perfVerdict({ ...PERF_OK, warm: { ...PERF_OK.warm, modelMs: undefined } }).problems.warm).toEqual(['model']);
});

test('perfVerdict: non-finite(null · NaN · undefined)는 비교에서 통과가 아니라 실패, 장면이 빠지거나 오류가 있어도 실패', () => {
  const v = perfVerdict({ ...PERF_OK, box: { ...PERF_OK.box, orbitGapMs: null }, cold: { ...PERF_OK.cold, firstMs: NaN } });
  expect([v.ok, v.orbit, v.firstFrame]).toEqual([false, false, false]);
  expect(v.problems.box).toEqual(['orbitGapMs']);
  expect(v.problems.cold).toEqual(['firstMs']);
  expect(perfVerdict({ ...PERF_OK, warm: { ...PERF_OK.warm, orbitGapMs: undefined } }).orbit).toBe(false);
  expect(perfVerdict({ ...PERF_OK, cold: { ...PERF_OK.cold, firstMs: 501 } })).toMatchObject({ ok: false, firstFrame: false, problems: { cold: [] } });
  expect(perfVerdict({ ...PERF_OK, box: { ...PERF_OK.box, orbitGapMs: 3 } })).toMatchObject({ ok: false, orbit: false });   // 에셋이 상자보다 느리다
  const err = perfVerdict({ ...PERF_OK, warm: { ...PERF_OK.warm, errors: 2 } });
  expect([err.ok, err.problems.warm]).toEqual([false, ['errors']]);
  const missing = perfVerdict({ box: PERF_OK.box, cold: PERF_OK.cold });
  expect([missing.ok, missing.orbit, missing.problems.warm]).toEqual([false, false, ['missing']]);
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
// 축 정렬 상자 프리미티브(24 정점 · 12 삼각형 · 법선 · uv). tangent면 면마다 접선(첫 모서리 a → b 방향 · w 1)도 단다(Fix 2 — 다시 포장 검사).
function boxPrim(doc, buf, [x0, y0, z0], [x1, y1, z1], material, tangent = false) {
  const P = [], N = [], U = [], I = [], T = [];
  const face = (a, b, c, d, n) => {
    const k = P.length / 3; P.push(...a, ...b, ...c, ...d); for (let i = 0; i < 4; i++) N.push(...n); U.push(0, 0, 1, 0, 1, 1, 0, 1); I.push(k, k + 1, k + 2, k, k + 2, k + 3);
    const e = [0, 1, 2].map(i => b[i] - a[i]), l = Math.hypot(...e); for (let i = 0; i < 4; i++) T.push(e[0] / l, e[1] / l, e[2] / l, 1);
  };
  face([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]); face([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [-1, 0, 0]);
  face([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [0, 1, 0]); face([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
  face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]); face([x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0], [0, 0, -1]);
  const acc = (type, arr, T) => doc.createAccessor().setType(type).setArray(new T(arr)).setBuffer(buf);
  const prim = doc.createPrimitive().setAttribute('POSITION', acc('VEC3', P, Float32Array)).setAttribute('NORMAL', acc('VEC3', N, Float32Array))
    .setAttribute('TEXCOORD_0', acc('VEC2', U, Float32Array)).setIndices(acc('SCALAR', I, Uint16Array)).setMaterial(material);
  return tangent ? prim.setAttribute('TANGENT', acc('VEC4', T, Float32Array)) : prim;
}
// 원본(z-up · 정면 +x): 깊이(x) 1.0 · 너비(y) 0.9 · 높이(z) 1.8 → 정규화 뒤 0.9 × 1.8 × 1.0 → chair-dining(450×500×900)에 배율 0.5로 꼭 맞는다(fit [1, 1, 1]).
// 표식(nose): 정면(+x) 위쪽의 작은 상자 → 정규화 뒤 +Z · 위쪽에 있어야 한다(정면·위 회전을 함께 검사 — 정육면체로는 회전 오류가 안 보인다 · 사전 검토 I-9).
// tilt(계획 20 Task 2 Fix 1): 같은 상자를 90° 배수가 아닌 회전 노드(Y 30° → 그 안에 X 5°) 밑에 둔다 — Idol orient 노드처럼. 표식은 메시 하나를
//   두 노드가 나눠 쓰고(둘째는 몸통 안쪽으로 옮김), 굽기가 나눈 메시를 두 번 돌리면 둘째가 몸통 밖으로 나가 크기가 틀어진다.
// tangents(Fix 2): 상자에 TANGENT를 달고 몸통에 법선 맵을 건다(법선 맵이 없으면 prune()이 TANGENT를 지운다) — 포장 결과(meshopt · KHR_mesh_quantization ·
//   정규화 int NORMAL·TANGENT)를 다시 포장하는 검사용.
async function packFixture(tmp, { only = false, tilt = false, tangents = false } = {}) {
  const doc = new Document(); const buf = doc.createBuffer();
  const tex = doc.createTexture('body').setImage(png(512, 512)).setMimeType('image/png');
  const body = doc.createMaterial('body').setBaseColorTexture(tex), noseMat = doc.createMaterial('nose').setBaseColorFactor([1, 0, 0, 1]);
  if (tangents) body.setNormalTexture(tex);
  const bodyPrim = boxPrim(doc, buf, [3, -0.45, 0.2], [4, 0.45, 2.0], body, tangents);   // 바닥 z = 0.2에 떠 있고 중심 x = 3.5
  const nosePrim = boxPrim(doc, buf, [3.98, -0.1, 1.6], [4.0, 0.1, 1.8], noseMat, tangents);
  if (tilt) {
    const half = deg => deg * Math.PI / 360, nose = doc.createMesh('nose').addPrimitive(nosePrim);
    const inner = doc.createNode('tilt-x').setRotation([Math.sin(half(5)), 0, 0, Math.cos(half(5))])
      .addChild(doc.createNode('n').setMesh(doc.createMesh('m').addPrimitive(bodyPrim)))
      .addChild(doc.createNode('nose-a').setMesh(nose)).addChild(doc.createNode('nose-b').setMesh(nose).setTranslation([-0.5, 0, -0.5]));
    doc.createScene('s').addChild(doc.createNode('tilt-y').setRotation([0, Math.sin(half(30)), 0, Math.cos(half(30))]).addChild(inner));
  } else doc.createScene('s').addChild(doc.createNode('n').setMesh(doc.createMesh('m').addPrimitive(bodyPrim).addPrimitive(nosePrim)));
  const input = join(tmp, 'in.glb'); writeFileSync(input, await io().writeBinary(doc));
  if (only) return { input };
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

test('pack --fit axis: 같은 상자를 sofa-3(2100×900×800)에 축마다 맞춘다 — 크기 = 카탈로그 · fit [1, 1, 1] · rawFit 기록 · 정면 +Z 그대로', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'p20-pack-'));
  try {
    const { input } = await packFixture(tmp, { only: true });
    const out = execFileSync(process.execPath, [PACK, input, '--product', 'sofa-3', '--front', '+x', '--up', 'z', '--fit', 'axis', '--out', tmp, '--manifest', join(tmp, 'manifest.json')], { encoding: 'utf8' });
    const entry = JSON.parse(out);
    await MeshoptDecoder.ready;
    const back = await io().read(join(tmp, 'sofa-3.glb'));
    const bb = getBounds(back.getRoot().listScenes()[0]);
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(2.1, 2); expect(bb.max[1] - bb.min[1]).toBeCloseTo(0.8, 2); expect(bb.max[2] - bb.min[2]).toBeCloseTo(0.9, 2);
    expect(bb.min[1]).toBeCloseTo(0, 3); expect((bb.min[0] + bb.max[0]) / 2).toBeCloseTo(0, 3); expect((bb.min[2] + bb.max[2]) / 2).toBeCloseTo(0, 3);
    const node = back.getRoot().listNodes().find(n => n.getMesh());
    const prim = node.getMesh().listPrimitives().find(p => p.getMaterial()?.getName() === 'nose');
    const M = node.getWorldMatrix(), pos = prim.getAttribute('POSITION'), v = [0, 0, 0]; let sz = 0;
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); sz += M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14]; }
    expect(sz / pos.getCount()).toBeGreaterThan(0.4);     // 정면 = +Z(깊이 0.9의 앞쪽 끝)
    expect(entry.size).toEqual([2100, 900, 800]);
    expect(entry.fit).toEqual([1, 1, 1]);
    expect(entry.rawFit).toEqual([0.1905, 1, 0.4938]);    // 균일이면 높이 1.8 → 0.8(배율 0.444): 가로 0.4/2.1 · 깊이 0.444/0.9
    expect(checkManifestEntry(entry)).toEqual({ ok: true, problems: [] });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}, 30000);

test('pack --fit axis + 기운 노드(Fix 1): 입력 노드 변환을 먼저 굽는다 — 크기 = 카탈로그 · 바닥 0 · 중심 0 · 메시 노드에 기운 축이 남지 않는다', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'p20-tilt-'));
  try {
    const { input } = await packFixture(tmp, { only: true, tilt: true });
    execFileSync(process.execPath, [PACK, input, '--product', 'sofa-3', '--front', '+x', '--up', 'z', '--fit', 'axis', '--out', tmp, '--manifest', join(tmp, 'manifest.json')], { encoding: 'utf8' });
    await MeshoptDecoder.ready;
    const back = await io().read(join(tmp, 'sofa-3.glb'));
    const bb = getBounds(back.getRoot().listScenes()[0]);
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(2.1, 2); expect(bb.max[1] - bb.min[1]).toBeCloseTo(0.8, 2); expect(bb.max[2] - bb.min[2]).toBeCloseTo(0.9, 2);
    expect(bb.min[1]).toBeCloseTo(0, 3); expect((bb.min[0] + bb.max[0]) / 2).toBeCloseTo(0, 3); expect((bb.min[2] + bb.max[2]) / 2).toBeCloseTo(0, 3);
    // 월드 행렬의 세 열이 모두 축 하나만 가리킨다(90° 배수 회전 × 축별 배율) — 기운 회전 × 비균일 배율(밀림을 버린 TRS)이면 열이 비스듬하다.
    const meshNodes = back.getRoot().listNodes().filter(n => n.getMesh());
    expect(meshNodes.length).toBeGreaterThan(0);
    for (const n of meshNodes) {
      const M = n.getWorldMatrix();
      for (const c of [0, 4, 8]) { const col = [M[c], M[c + 1], M[c + 2]], len = Math.hypot(...col); expect(col.filter(v => Math.abs(v) > 1e-6 * len), `${n.getName()} 열 ${c / 4}`).toHaveLength(1); }
    }
    // 몸통만의 크기도 카탈로그와 같다 = 표식 둘(나눈 메시)이 몸통 안에 있다 — 나눈 메시를 두 번 구우면 표식이 몸통 밖으로 나가고, 축별 맞춤이 전체를 줄여 몸통이 작아진다.
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], v = [0, 0, 0];
    for (const n of meshNodes) {
      const M = n.getWorldMatrix();
      for (const p of n.getMesh().listPrimitives().filter(q => q.getMaterial()?.getName() === 'body')) {
        const pos = p.getAttribute('POSITION');
        for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); for (let k = 0; k < 3; k++) { const w = M[k] * v[0] + M[4 + k] * v[1] + M[8 + k] * v[2] + M[12 + k]; lo[k] = Math.min(lo[k], w); hi[k] = Math.max(hi[k], w); } }
      }
    }
    expect(hi[0] - lo[0]).toBeCloseTo(2.1, 2); expect(hi[1] - lo[1]).toBeCloseTo(0.8, 2); expect(hi[2] - lo[2]).toBeCloseTo(0.9, 2);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}, 30000);

test('pack 다시 포장(Fix 2): 포장한 GLB(meshopt · 양자화 · 정규화 int NORMAL·TANGENT · 노드 회전)를 --fit axis로 다시 — 법선·접선이 0이 아니고 단위 · 직교 · 바깥쪽 · 크기 = 카탈로그', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'p20-repack-'));
  try {
    const { glb } = await packFixture(tmp, { tangents: true });          // 1차: chair-dining(정면 +X · z-up → 메시 노드에 90° 회전 · 양자화 배율이 남는다)
    const again = join(tmp, 'again');
    execFileSync(process.execPath, [PACK, glb, '--product', 'sofa-3', '--fit', 'axis', '--out', again, '--manifest', join(again, 'manifest.json')], { encoding: 'utf8' });
    await MeshoptDecoder.ready;
    const back = await io().read(join(again, 'sofa-3.glb'));
    const bb = getBounds(back.getRoot().listScenes()[0]);
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(2.1, 2); expect(bb.max[1] - bb.min[1]).toBeCloseTo(0.8, 2); expect(bb.max[2] - bb.min[2]).toBeCloseTo(0.9, 2);
    // 저장 공간(노드 행렬 앞)에서 본다: 법선(M^-T)과 접선(M)의 내적, (점 − 중심)·법선의 부호는 노드 행렬을 걸어도 바뀌지 않는다.
    // 법선은 모든 primitive(단위 · 바깥쪽), 접선은 남은 것(법선 맵이 있는 몸통)만(단위 · 법선과 직교 · w ±1).
    const prims = back.getRoot().listMeshes().flatMap(m => m.listPrimitives()), n = [0, 0, 0], t = [0, 0, 0, 0], p = [0, 0, 0];
    expect(prims.filter(q => q.getAttribute('TANGENT')).map(q => q.getMaterial()?.getName())).toEqual(['body']);
    for (const q of prims) {
      const N = q.getAttribute('NORMAL'), T = q.getAttribute('TANGENT'), P = q.getAttribute('POSITION'), name = q.getMaterial()?.getName();
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];   // getMin/getMax는 정규화 정수를 풀지 않는다 — getElement로 잰다
      for (let i = 0; i < P.getCount(); i++) { P.getElement(i, p); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } }
      const c = lo.map((v, k) => (v + hi[k]) / 2);
      let badN = 0, badT = 0;
      for (let i = 0; i < N.getCount(); i++) {
        N.getElement(i, n); P.getElement(i, p);
        const ln = Math.hypot(...n), out = (p[0] - c[0]) * n[0] + (p[1] - c[1]) * n[1] + (p[2] - c[2]) * n[2];
        if (!(Math.abs(ln - 1) < 0.05 && out > 0)) badN++;
        if (!T) continue;
        T.getElement(i, t);
        const lt = Math.hypot(t[0], t[1], t[2]), dot = (n[0] * t[0] + n[1] * t[1] + n[2] * t[2]) / (ln * lt || 1);
        if (!(Math.abs(lt - 1) < 0.05 && Math.abs(dot) < 0.05 && Math.abs(t[3]) === 1)) badT++;
      }
      expect([badN, badT], `${name}: [법선 · 접선]이 틀린 정점 수 / ${N.getCount()}`).toEqual([0, 0]);
    }
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

test('check: 저장소 manifest(시드 7종)는 종료 0 — npm run assets:check 게이트와 같다', () => {
  const man = fileURLToPath(new URL('../public/models/manifest.json', import.meta.url));
  expect(JSON.parse(readFileSync(man, 'utf8'))).toMatchObject({ version: 1 });
  expect(check(man).status).toBe(0);
});
