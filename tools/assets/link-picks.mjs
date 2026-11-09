// 고르기 표 → 포장 · 연결(2026-11-06 · 계획 20 Task 5 · 명세 D1·D3·D5). 표에서 모델이 있는 제품마다 pack.mjs(--fit axis --source-kind generated)로
// public/models/<제품 id>.glb · manifest · NOTICE를 쓰고, 표에 있고 manifest에 든 제품 전부로 src/products/kitchenAssets.js를 다시 쓴다.
// 표에서 model: false인 제품이 manifest에 있으면 파일과 항목을 지운다(NOTICE도 다시). 표에 없는 manifest 항목(시드 · 계획 15b 생성 2종)은 건드리지 않는다.
//   node tools/assets/link-picks.mjs [--picks tools/assets/picks/sinsang.json] [--only k-1,k-2] [--dry]
// 표 항목: { src: 앱 루트 기준 GLB 경로, from: up-s1|up-s2|orig|trellis|reuse, url: 입력 사진 출처 URL, front?: '+z', author?, tris?, verdict?, note? } | { model: false, why }
// tris(양의 정수 ≤ ASSET_BUDGET.trisGenerated 20000 · 2026-11-09 계획 20 Task 10): 그 항목만 삼각형 예산을 낮춘다(pack.mjs --tris). 없으면 pack 기본(생성 모델 20000).
//   더 높이는 데는 쓰지 않는다 — 예산을 넘긴 GLB는 assets:check가 막는다.
//   템플릿에 여러 대 놓이는 작은 기구는 궤도 프레임이 삼각형 수에 묶인다(template-load.mjs — 윤곽선이 메시를 두 번 그린다).
// 실패(원본 없음 · pack 종료 1 · 표 오류)는 그 항목만 알리고 계속한다 — 하나라도 있으면 종료 1.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { productById } from '../../src/products/catalog.js';
import { ASSET_BUDGET, noticeMarkdown } from './lib.mjs';

export const AUTHOR = 'ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성';
export const LICENSE = '자체 생성물';

// 표 검사 + 할 일(순수). manProducts = manifest.products(지울 것 판정용).
export function planLinks(picks, manProducts, { exists = existsSync, known = id => !!productById(id) } = {}) {
  const pack = [], remove = [], problems = [];
  for (const [id, e] of Object.entries(picks)) {
    if (id.startsWith('_')) continue;
    if (!known(id)) { problems.push(`${id}: 카탈로그에 없는 제품`); continue; }
    if (e.model === false) {
      if (!e.why) problems.push(`${id}: model false에는 why가 필요하다`);
      if (manProducts[id]) remove.push(id);
      continue;
    }
    if (!e.src || !e.url) { problems.push(`${id}: src·url이 필요하다`); continue; }
    if (e.tris !== undefined && !(Number.isInteger(e.tris) && e.tris > 0)) { problems.push(`${id}: tris는 양의 정수여야 한다 — ${JSON.stringify(e.tris)}`); continue; }
    if (e.tris > ASSET_BUDGET.trisGenerated) { problems.push(`${id}: tris가 생성 모델 예산보다 크다 — ${e.tris} > ${ASSET_BUDGET.trisGenerated}(낮추는 데만 쓴다)`); continue; }
    if (!exists(e.src)) { problems.push(`${id}: 원본이 없다 — ${e.src}`); continue; }
    pack.push({ id, src: e.src, front: e.front ?? '+z', url: e.url, author: e.author ?? AUTHOR, ...(e.tris !== undefined ? { tris: e.tris } : {}) });
  }
  return { pack, remove, problems };
}

// 포장 항목 → pack.mjs 인자(순수). --tris는 표에 tris가 있을 때만 넘긴다(없으면 pack 기본 예산).
export const packArgs = x => [x.src, '--product', x.id, '--front', x.front, '--fit', 'axis', '--source-kind', 'generated',
  '--source-url', x.url, '--license', LICENSE, '--author', x.author, ...(x.tris !== undefined ? ['--tris', String(x.tris)] : [])];

export const assetsModule = assets => [
  '// 생성 파일 — tools/assets/link-picks.mjs가 고르기 표(tools/assets/picks/sinsang.json)에서 만든다. 손으로 고치지 말 것(계획 20 Task 5).',
  '// 제품 id → 에셋 id(public/models/<에셋 id>.glb · 둘은 같다 — tests/assetsCatalog.test.js). catalogKitchen.js가 읽어 제품에 asset을 붙인다.',
  `export default ${JSON.stringify(Object.fromEntries(Object.entries(assets).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), null, 2)};`,
  '',
].join('\n');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2), opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const at = rel => fileURLToPath(new URL(rel, import.meta.url));
  const PICKS = opt('--picks', at('./picks/sinsang.json')), MAN = at('../../public/models/manifest.json'), MODELS = at('../../public/models/');
  const PACK = at('./pack.mjs'), ASSETS = at('../../src/products/kitchenAssets.js'), NOTICE = at('../../NOTICE.md');
  const only = opt('--only', null)?.split(',').filter(Boolean) ?? null, dry = argv.includes('--dry');
  const picks = JSON.parse(readFileSync(PICKS, 'utf8'));
  const plan = planLinks(picks, JSON.parse(readFileSync(MAN, 'utf8')).products);
  const fails = [...plan.problems], todo = plan.pack.filter(x => !only || only.includes(x.id));
  console.log(`포장 ${todo.length} · 지움 ${plan.remove.length} · 표 문제 ${plan.problems.length}${dry ? ' (--dry: 쓰지 않음)' : ''}`);
  if (dry) { for (const x of todo) console.log(`  포장 ${x.id} ← ${x.src}${x.tris !== undefined ? ` · 삼각형 ≤ ${x.tris}` : ''}`); for (const id of plan.remove) console.log(`  지움 ${id}`); }
  else {
    for (const x of todo) {
      try {
        const out = execFileSync(process.execPath, [PACK, ...packArgs(x)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
        const e = JSON.parse(out.trim().split('\n').pop());
        console.log(`${x.id} ${Math.round(e.bytes / 1000)} KB · 삼각형 ${e.tris} · rawFit ${e.rawFit?.join('/')}`);
      } catch (err) { fails.push(`${x.id}: pack 실패 — ${String(err.message).split('\n')[0]}`); }
    }
    const man = JSON.parse(readFileSync(MAN, 'utf8'));   // pack이 고쳐 썼다
    for (const id of plan.remove) { delete man.products[id]; rmSync(`${MODELS}${id}.glb`, { force: true }); console.log(`${id} 지움(model false)`); }
    if (plan.remove.length) {
      writeFileSync(MAN, JSON.stringify(man, null, 2) + '\n');
      writeFileSync(NOTICE, noticeMarkdown(man, id => productById(id)?.name));
    }
    const linked = Object.fromEntries(Object.keys(picks).filter(id => !id.startsWith('_') && picks[id].model !== false && man.products[id]).map(id => [id, id]));
    writeFileSync(ASSETS, assetsModule(linked));
    console.log(`kitchenAssets.js ${Object.keys(linked).length}종`);
  }
  if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
}
