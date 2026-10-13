// ComfyUI 일괄 생성 CLI(2026-10-13 · 계획 15 Task E): 제품 사진 → ComfyUI 네이티브 TRELLIS.2/Pixal3D → GLB를 제품마다 차례로 돌린다
// (사람이 88번 누르지 않는다 — 조사 2026-10-06-research-comfyui-trellis2.md §7). GPU가 있는 ComfyUI 서버(16 GB PC · RunPod 4090)에 붙는다 —
// 이 PC(인텔 UHD 730)에서는 서버를 띄울 수 없다. 절차·선택지·비용은 tools/assets/README.md.
//   npm run assets:comfy -- --server http://127.0.0.1:8188 --workflow <api.json> --images <사진 폴더> --products a,b,c
//        [--out tools/assets/incoming] [--pack [--front +z] [--author A] [--license L]]
// 제품마다: 사진 <images>/<id>.(png|jpg|jpeg|webp)를 POST /upload/image → patchWorkflow(LoadImage = 그 이름 · 저장 접두사 '3d/<id>') → POST /prompt
// → GET /history/<id> 2초 간격(30분 한도) → 출력 GLB를 GET /view로 → <out>/<id>.glb(원본 · 커밋하지 않는다 — .gitignore).
// --pack이면 곧바로 pack.mjs(--front · --source-kind generated · 작가 · 라이선스)로 public/models/<id>.glb + manifest + NOTICE까지.
// 주의: --pack은 이미 있는 모델(시드 포함)을 덮는다 — 시드와 비교만 할 제품은 --pack 없이 돌린다(README "첫 시험").
// 시작 전에 다 확인하고 멈춘다(제품 id · 사진 · 워크플로 형식·노드 · 서버 응답) — 돈 내는 GPU 시간을 오타로 버리지 않게.
// 하나가 실패해도 다음 제품으로 간다. 끝에 표와 "다시 돌릴 목록"을 찍고, 실패가 있으면 종료 1.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productById } from '../../src/products/catalog.js';
import { FRONT_YAW, checkManifestEntry } from './lib.mjs';
import { generateGlb, packArgs, patchWorkflow, serverBase, uploadImage } from './comfy-lib.mjs';

const fail = msg => { console.error(`comfy: ${msg}`); process.exit(1); };
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const server = serverBase(opt('--server', 'http://127.0.0.1:8188')), wfPath = opt('--workflow'), imagesDir = opt('--images');
// 기본 출력은 스크립트 자리 기준(어디서 불러도 같다) · 사용자가 준 경로는 cwd 기준(pack.mjs와 같다).
const outDir = resolve(opt('--out', fileURLToPath(new URL('./incoming', import.meta.url))));
const doPack = argv.includes('--pack'), front = opt('--front', '+z');
// 생성 모델의 NOTICE 칸: 작가 = 만든 도구, 라이선스 = 우리가 만든 것(가중치 MIT는 결과물에 권리를 주장하지 않는다 — 조사 §8). 사진 출처를 남기려면
// 그 제품만 assets:pack에 --source-url을 더해 다시 포장한다(README).
const author = opt('--author', 'ComfyUI TRELLIS.2/Pixal3D 생성'), license = opt('--license', '자체 생성물');
const ids = [...new Set((opt('--products') ?? '').split(',').map(s => s.trim()).filter(Boolean))];
const PACK = fileURLToPath(new URL('./pack.mjs', import.meta.url));
const POLL = { every: 2000, timeout: 1_800_000 };
// 요청 하나의 한도(폴링은 짧은 GET이고 사진·GLB는 수 MB) — 서버가 멎어도 CLI가 영원히 서지 않게.
const fetchT = (url, init = {}) => fetch(url, { signal: AbortSignal.timeout(300_000), ...init });

// ── 시작 전 확인
if (!wfPath || !existsSync(wfPath)) fail(`--workflow 파일이 없다: ${wfPath ?? '(없음)'} — ComfyUI에서 API 형식으로 저장한 JSON(README)`);
if (!imagesDir || !existsSync(imagesDir)) fail(`--images 폴더가 없다: ${imagesDir ?? '(없음)'}`);
if (!ids.length) fail('--products가 비었다(쉼표로 제품 id — 목록은 README)');
const unknown = ids.filter(id => !productById(id));
if (unknown.length) fail(`카탈로그에 없는 제품: ${unknown.join(', ')}`);
if (!Object.hasOwn(FRONT_YAW, front)) fail(`--front는 ${Object.keys(FRONT_YAW).join(' · ')} 중 하나: ${front}`);
let workflow;
try { workflow = JSON.parse(readFileSync(wfPath, 'utf8')); patchWorkflow(workflow, { image: 'x.png', prefix: '3d/x' }); } catch (e) { fail(`워크플로: ${e.message}`); }
const photoOf = id => ['png', 'jpg', 'jpeg', 'webp'].map(ext => join(imagesDir, `${id}.${ext}`)).find(existsSync);
const noPhoto = ids.filter(id => !photoOf(id));
if (noPhoto.length) fail(`사진이 없다(${imagesDir}/<id>.png|jpg|jpeg|webp): ${noPhoto.join(', ')}`);
try {
  const stats = await (await fetchT(`${server}/system_stats`, { signal: AbortSignal.timeout(15_000) })).json();
  const d = stats?.devices?.[0];
  console.log(`comfy: 서버 ${server} · ComfyUI ${stats?.system?.comfyui_version ?? '?'} · ${d ? `${d.name} · VRAM ${(d.vram_total / 2 ** 30).toFixed(1)} GB` : '장치 정보 없음'}`);
} catch (e) { fail(`서버에 닿지 않는다(${server}/system_stats): ${e.message} — ComfyUI가 떠 있는지 · RunPod면 8188 프록시 주소인지`); }

// ── 제품마다 차례로(서버 큐에 몰아 넣지 않는다 — 하나씩 결과를 받아 바로 저장 · 실패를 표에 남긴다)
mkdirSync(outDir, { recursive: true });
const kb = n => `${(n / 1024).toFixed(0)} KB`;
const rows = [], failed = [];
for (const [i, id] of ids.entries()) {
  const t0 = Date.now(), photo = photoOf(id);
  console.log(`comfy: [${i + 1}/${ids.length}] ${id} ← ${basename(photo)}`);
  try {
    const image = await uploadImage(fetchT, server, { name: basename(photo), bytes: readFileSync(photo) });
    const { promptId, file, bytes } = await generateGlb(fetchT, { server, workflow, id, image, ...POLL });
    const glb = join(outDir, `${id}.glb`);
    writeFileSync(glb, bytes);
    let packed = '—';
    if (doPack) {
      const r = spawnSync(process.execPath, [PACK, ...packArgs({ glb, id, front, author, license })], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`포장 실패 — ${(r.stderr || r.stdout || String(r.error)).trim()}`);
      const e = JSON.parse(r.stdout.trim().split('\n').pop()), { problems } = checkManifestEntry(e);
      packed = `${kb(e.bytes)} · ${e.tris.toLocaleString('en')} 삼각형 · fit ${e.fit.join('/')}`;
      if (problems.length) throw new Error(`예산 밖(${problems.join(', ')}) — ${packed} · npm run assets:check가 막는다`);
    }
    rows.push([id, promptId, `${file.subfolder}/${file.filename}`, kb(bytes.length), `${((Date.now() - t0) / 1000).toFixed(0)} s`, packed, '통과']);
  } catch (err) {
    failed.push(id);
    rows.push([id, '—', '—', '—', `${((Date.now() - t0) / 1000).toFixed(0)} s`, '—', `실패: ${err.message}`]);
  }
}
console.log(['| 제품 | prompt | 서버 출력 | 원본 | 시간 | 포장 | 결과 |', '|---|---|---|---|---|---|---|', ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n'));
console.log(`comfy: 원본 GLB → ${outDir}${doPack ? ' · 포장 → public/models(manifest·NOTICE 갱신)' : ' · 포장은 npm run assets:pack(README)'}`);
if (failed.length) console.log(`comfy: ${ids.length}종 중 ${failed.length}종 실패 — 다시: --products ${failed.join(',')}`);
process.exitCode = failed.length ? 1 : 0;
