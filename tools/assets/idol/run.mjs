// Idol 한 장 → 닫힌 질감 메시(계획 20 Task 1 ← scratch/q/idol-run.mjs의 solid 경로 · 스플랫 파일·기본 SplatToMesh·ESRGAN 경로는 옮기지 않았다).
//   node tools/assets/idol/run.mjs <사진> <tag> [--seed 46] [--server http://192.168.11.65:8188] [--out tools/assets/incoming/exp]
//   → <out>/<tag>-meshx.glb(우리 노드 · 2만 면 · 2K 질감) · <tag>-input.png(Idol이 받은 1024 입력). 마지막 줄 '끝 N s'(batch.sh가 grep한다). 30~50초/건.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { uploadImage, submitPrompt, pollUntilDone, viewUrl, serverBase } from '../comfy-lib.mjs';
import { idolWorkflow } from './workflows.mjs';

const argv = process.argv.slice(2), opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const [photo, tag] = argv;
if (!photo || !tag || photo.startsWith('--') || tag.startsWith('--')) { console.error('사용법: node tools/assets/idol/run.mjs <사진> <tag> [--seed 46] [--server URL] [--out DIR]'); process.exit(1); }
const S = serverBase(opt('--server', 'http://192.168.11.65:8188')), OUT = opt('--out', 'tools/assets/incoming/exp');
const image = await uploadImage(fetch, S, { name: `idol-${basename(photo)}`, bytes: readFileSync(photo) });
const t0 = Date.now(), pid = await submitPrompt(fetch, S, idolWorkflow({ image, tag, seed: Number(opt('--seed', 46)) }));
console.log(`제출 ${pid}`);
const entry = await pollUntilDone(fetch, S, pid, { timeout: 1_200_000 });
mkdirSync(OUT, { recursive: true });
// 출력 파일 전부(GLB · 전처리 이미지) — ComfyUI가 붙이는 번호 꼬리(_00001_)를 뗀다.
for (const node of Object.values(entry?.outputs ?? {})) for (const list of Object.values(node ?? {})) {
  if (!Array.isArray(list)) continue;
  for (const f of list) {
    const file = typeof f === 'string' ? { filename: f.replace(/\\/g, '/').split('/').pop(), subfolder: f.replace(/\\/g, '/').split('/').slice(0, -1).join('/'), type: 'output' } : f;
    if (typeof file?.filename !== 'string' || file.type !== 'output') continue;
    const b = new Uint8Array(await (await fetch(viewUrl(S, file))).arrayBuffer());
    const name = file.filename.replace(/_\d+_?\./, '.');
    writeFileSync(`${OUT}/${name}`, b); console.log(`${name} ${(b.length / 1e6).toFixed(1)} MB`);
  }
}
console.log(`끝 ${((Date.now() - t0) / 1000).toFixed(0)} s`);
