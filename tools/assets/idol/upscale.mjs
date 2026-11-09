// 사진 업스케일 — SeedVR2 7B int8(계획 20 Task 1 ← scratch/q/seedvr-up.mjs의 seedvr2 경로 · Real-ESRGAN 비교 경로는 옮기지 않았다).
//   node tools/assets/idol/upscale.mjs <사진> <tag> [--mult N] [--server http://192.168.11.65:8188] [--out tools/assets/incoming/exp]  → <out>/<tag>-up.png
//   배율 기본 = 짧은 변이 1200 px 안팎이 되게 2~4(workflows.upscaleMult). 4~6초/장(5070 Ti).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import sharp from 'sharp';
import { uploadImage, submitPrompt, pollUntilDone, viewUrl, serverBase } from '../comfy-lib.mjs';
import { seedvrWorkflow, upscaleMult } from './workflows.mjs';

const argv = process.argv.slice(2), opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const [photo, tag] = argv;
if (!photo || !tag || photo.startsWith('--') || tag.startsWith('--')) { console.error('사용법: node tools/assets/idol/upscale.mjs <사진> <tag> [--mult N] [--server URL] [--out DIR]'); process.exit(1); }
const S = serverBase(opt('--server', 'http://192.168.11.65:8188')), OUT = opt('--out', 'tools/assets/incoming/exp');
const meta = await sharp(photo).metadata(), mult = Number(opt('--mult', upscaleMult(Math.min(meta.width, meta.height))));
const image = await uploadImage(fetch, S, { name: `up-${basename(photo)}`, bytes: readFileSync(photo) });
const t0 = Date.now(), pid = await submitPrompt(fetch, S, seedvrWorkflow({ image, tag, mult }));
const entry = await pollUntilDone(fetch, S, pid, { timeout: 900_000 });
mkdirSync(OUT, { recursive: true });
for (const list of Object.values(entry?.outputs?.['11'] ?? {})) for (const f of Array.isArray(list) ? list : []) {
  const b = new Uint8Array(await (await fetch(viewUrl(S, f))).arrayBuffer());
  writeFileSync(`${OUT}/${tag}-up.png`, b);
  const m = await sharp(b).metadata();
  console.log(`${tag}-up.png ${meta.width}x${meta.height} → ${m.width}x${m.height} (×${mult}) ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
