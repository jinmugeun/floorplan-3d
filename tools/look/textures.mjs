// CC0 텍스처 → public/textures(계획 17 Task 5). ambientCG 1K JPG zip을 풀어 둔 폴더에서 color·rough·normal WebP 1024²를 만든다.
//   node tools/look/textures.mjs <폴더>   — 폴더 안에 Metal009/ · Granite002A/ (각 <id>_1K-JPG_Color.jpg · _Roughness.jpg · _NormalGL.jpg)
// 받기(저장소 밖 빈 폴더에서): https://ambientcg.com/get?file=Metal009_1K-JPG.zip · https://ambientcg.com/get?file=Granite002A_1K-JPG.zip
// 출처는 public/textures/NOTICE.md(CC0 1.0 — 표기 의무는 없지만 남긴다). 결과를 커밋한다 — 앱은 이 도구를 돌리지 않는다.
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const src = process.argv[2];
if (!src) { console.error('사용법: node tools/look/textures.mjs <ambientCG 폴더>'); process.exit(1); }
const SETS = [['Metal009', 'metal-brushed'], ['Granite002A', 'granite-gray']];
const MAPS = [['Color', 'color'], ['Roughness', 'rough'], ['NormalGL', 'normal']];
let total = 0;
for (const [id, dir] of SETS) {
  mkdirSync(`${ROOT}public/textures/${dir}`, { recursive: true });
  for (const [key, name] of MAPS) {
    const out = `${ROOT}public/textures/${dir}/${name}.webp`;
    await sharp(`${src}/${id}/${id}_1K-JPG_${key}.jpg`).resize(1024, 1024).webp({ quality: name === 'normal' ? 90 : 82 }).toFile(out);
    const n = statSync(out).size; total += n;
    console.log(`${dir}/${name}.webp ${n.toLocaleString()} B`);
  }
}
console.log(`합계 ${total.toLocaleString()} B (게이트 2.5 MB)`);
