// Idol 질감 메시에 스테인리스 B 반광 입히기(계획 20 Task 1 ← scratch/q/idol-mat.mjs · 2026-11-06 사용자 선택 B 반광).
//   node tools/assets/idol/steel.mjs <입력.glb> <출력.glb> ['<json 덮어쓰기>']
// 질감 색에서 '밝고 무채색'인 화소 = 스테인리스(금속 마스크 m) → 금속·거칠기 텍스처(G = 거칠기 · B = 금속) + 금속 부분 바탕색을 스테인리스 톤으로.
// 검은 조작부·바퀴·손잡이·색 라벨은 m ≈ 0이라 비금속으로 남는다. 다시 생성하지 않고 이미 만든 GLB에 덧입힌다.
//   metal·rough = 스테인리스 부분 금속값·거칠기 · roughOther = 나머지 거칠기 · steel = 스테인리스 바탕색(sRGB 0~1)
//   detail = 원래 질감 밝기 변화를 얼마나 남길지(0 = 고른 색 · 1 = 그대로 비례) · sat*·lum* = 마스크 경계(채도·밝기 smoothstep)
import { pathToFileURL } from 'node:url';

export const STEEL_B = Object.freeze({ metal: 0.9, rough: 0.4, roughOther: 0.6, steel: 0.78, detail: 0.3, satLo: 0.1, satHi: 0.25, lumLo: 0.18, lumHi: 0.35 });
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// data = RGBA 화소 n개 → { base: RGBA Buffer(바탕색), mr: RGB Buffer(금속·거칠기), metalShare(금속 마스크 평균), ref(스테인리스 밝기 중앙값) }.
export function steelTexels(data, n, o = STEEL_B) {
  const M = new Float32Array(n), L = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[4 * i] / 255, g = data[4 * i + 1] / 255, b = data[4 * i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    L[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    M[i] = (1 - ss(o.satLo, o.satHi, (mx - mn) / (mx + 1e-6))) * ss(o.lumLo, o.lumHi, L[i]);
  }
  // 스테인리스 부분 밝기 중앙값 = 기준 → 금속 바탕색 = steel × (L / 기준)^detail
  const ref = (() => { const a = []; for (let i = 0; i < n; i += 7) if (M[i] > 0.5) a.push(L[i]); a.sort((x, y) => x - y); return a.length ? a[a.length >> 1] : 0.7; })();
  const base = Buffer.alloc(n * 4), mr = Buffer.alloc(n * 3);
  let metal = 0;
  for (let i = 0; i < n; i++) {
    const m = M[i], s = Math.min(1, o.steel * Math.pow(Math.max(L[i], 1e-3) / ref, o.detail));
    for (let k = 0; k < 3; k++) base[4 * i + k] = Math.round(255 * ((1 - m) * data[4 * i + k] / 255 + m * s));
    base[4 * i + 3] = data[4 * i + 3];
    mr[3 * i] = 255; mr[3 * i + 1] = Math.round(255 * ((1 - m) * o.roughOther + m * o.rough)); mr[3 * i + 2] = Math.round(255 * o.metal * m);
    metal += m;
  }
  return { base, mr, metalShare: metal / n, ref };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [IN, OUT, J = '{}'] = process.argv.slice(2);
  if (!IN || !OUT) { console.error('사용법: node tools/assets/idol/steel.mjs <입력.glb> <출력.glb> [json]'); process.exit(1); }
  const { default: sharp } = await import('sharp');
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { MeshoptDecoder, MeshoptEncoder } = await import('meshoptimizer');
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const o = { ...STEEL_B, ...JSON.parse(J) };
  const doc = await io.read(IN), mat = doc.getRoot().listMaterials()[0], tex = mat?.getBaseColorTexture();
  if (!tex) throw new Error('바탕색 질감이 없음');
  const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, r = steelTexels(data, W * H, o);
  tex.setImage(await sharp(r.base, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer());
  const mrTex = doc.createTexture('metalRough').setMimeType('image/png').setImage(await sharp(r.mr, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer());
  mat.setMetallicRoughnessTexture(mrTex).setMetallicFactor(1).setRoughnessFactor(1);
  mat.getMetallicRoughnessTextureInfo().setTexCoord(mat.getBaseColorTextureInfo().getTexCoord());
  await io.write(OUT, doc);
  console.log(`${OUT.split(/[\\/]/).pop()} 금속 마스크 ${(r.metalShare * 100).toFixed(0)}%(질감 전체 대비) · 기준 밝기 ${r.ref.toFixed(2)}`);
}
