// 형상 대 모델 비교 그림(2026-11-06 · 계획 20 Task 6 · 명세 D2). 고르기 표에서 모델이 연결된 제품마다 아이템 하나를 앱 화면(프리뷰 빌드)에서
// [지금 형상(실사 모델 끔) 앞 | 생성 모델 앞 | 지금 형상 뒤 | 생성 모델 뒤]로 찍어 8개씩 한 장(PNG)으로 붙인다 — 사람이 고른다(외관 결정은 렌더 비교).
//   npm run build && node tools/assets/compare-shape.mjs <출력 접두사> [--picks tools/assets/picks/sinsang.json] [--only k-1,k-2] [--port 5197]
//   → <접두사>-1.png … · 줄 머리 = 번호 · 제품 id · 이름 · 규격 · 판정(표 verdict) · rawFit(< 0.5면 '크게 늘어남').
// 원근 카메라·다시 그리기는 snapshot.mjs와 같은 길이다(shots.mjs). 형상 칸은 v3.assets false(실사 제품 모델 끔 — 보기 옵션)로 같은 장면을 찍는다.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { productById } from '../../src/products/catalog.js';
import { launchChrome, startPreview, threeHook, makeProject, restoreProject, collectErrors } from './browser.mjs';
import { roomFor, aimFor, rememberRender, frames, grabPersp, waitModel, waitShape, capturePersp } from './shots.mjs';

const argv = process.argv.slice(2), arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const OUT = argv[0];
if (!OUT || OUT.startsWith('--')) { console.error('사용법: node tools/assets/compare-shape.mjs <출력 접두사> [--picks P] [--only a,b] [--port 5197]'); process.exit(1); }
// 출력 폴더는 찍기 전에 본다 — 제품 29종을 다 찍은 뒤 writeFileSync에서 죽지 않게.
const OUT_DIR = dirname(resolve(OUT));
if (!existsSync(OUT_DIR) || !statSync(OUT_DIR).isDirectory()) { console.error(`compare-shape: 출력 폴더가 없다 — ${OUT_DIR}(접두사 ${OUT})`); process.exit(1); }
const picks = JSON.parse(readFileSync(arg('--picks', fileURLToPath(new URL('./picks/sinsang.json', import.meta.url))), 'utf8'));
const man = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/models/manifest.json', import.meta.url)), 'utf8'));
const only = arg('--only', null)?.split(',').filter(Boolean) ?? null;
const ids = Object.keys(picks).filter(id => !id.startsWith('_') && picks[id].model !== false && man.products[id] && productById(id)?.asset && (!only || only.includes(id)));
if (!ids.length) { console.error('compare-shape: 비교할 제품이 없다 — 표에 모델이 있고 manifest·카탈로그 asset이 있어야 한다(link-picks 뒤 npm run build)'); process.exit(1); }
const VIEWS = [[35, 20], [215, 20]], CELL = 320, HEAD = 30, LH = 26, PER = 8;
const HEADS = ['지금 형상 · 앞', '생성 모델 · 앞', '지금 형상 · 뒤', '생성 모델 · 뒤'];

// 제품 하나 · 정사각 방 가운데 · 회전 0 → 원근 두 장. assets = 실사 모델 켬/끔. 방 크기·겨눔(아이템 높이)은 snapshot과 같은 shots.mjs roomFor · aimFor.
async function shoot(browser, url, id, assets) {
  const p = productById(id), room = roomFor(p), c = room / 2, { target, ext } = aimFor(p, c);
  const project = makeProject({ name: `compare ${id}`, room, wall: { thickness: 20, height: 2 }, items: [{ productId: id, pos: [c, c] }], v3: { assets } });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  const errors = collectErrors(page);
  try {
    await page.addInitScript(threeHook); await page.addInitScript(rememberRender);
    await restoreProject(page, url, project);
    if (assets) {
      const [r] = await Promise.all([page.waitForResponse(x => x.url().endsWith(`models/${id}.glb`), { timeout: 30000 }), page.click('[data-mode="iso"]')]);
      if (r.status() !== 200) throw new Error(`models/${id}.glb HTTP ${r.status()}`);
      await waitModel(page);
    } else { await page.click('[data-mode="iso"]'); await waitShape(page); }
    await frames(page);
    if (!(await capturePersp(page))) throw new Error('3D 궤도 카메라가 원근이 아니다');
    const out = []; for (const v of VIEWS) out.push(await grabPersp(page, v, target, ext));
    return { shots: out, errors };
  } finally { await page.close(); }
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const bar = (w, h, txt, bg, fg, size = 14) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/><text x="8" y="${h - 8}" font-family="Malgun Gothic, Segoe UI, sans-serif" font-size="${size}" font-weight="700" fill="${fg}">${esc(txt)}</text></svg>`);

const server = await startPreview({ url: argv.find(a => /^https?:/.test(a)) ?? null, port: +arg('--port', 5197) });
const browser = await launchChrome({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const rows = [], fails = [];
try {
  for (const [k, id] of ids.entries()) {
    try {
      const shape = await shoot(browser, server.url, id, false), model = await shoot(browser, server.url, id, true);
      const errors = [...shape.errors, ...model.errors];
      if (errors.length) fails.push(`${id}: 페이지 오류 ${errors.slice(0, 2).join(' | ')}`);
      const p = productById(id), e = man.products[id], raw = e.rawFit ?? e.fit, stretched = Math.min(...raw) < 0.5;
      rows.push({ head: `${k + 1}. ${id} · ${p.name} · ${p.size.join('×')} · ${picks[id].verdict ?? ''} · rawFit ${raw.join('/')}${stretched ? ' · 크게 늘어남' : ''}`, stretched,
        tiles: [shape.shots[0], model.shots[0], shape.shots[1], model.shots[1]] });
      // 페이지 오류가 있으면 그림 줄은 남기되(사람이 본다) ok는 거짓 — 종료 1
      console.log(JSON.stringify(errors.length ? { id, ok: false, errors } : { id, ok: true }));
    } catch (err) { fails.push(`${id}: ${err.message}`); console.log(JSON.stringify({ id, ok: false, error: String(err?.message ?? err).slice(0, 300) })); }
  }
} finally { await browser.close(); await server.stop(); }
for (let s = 0; s * PER < rows.length; s++) {
  const part = rows.slice(s * PER, s * PER + PER), W = 4 * CELL, comp = [];
  comp.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HEAD}"><rect width="${W}" height="${HEAD}" fill="#fff"/>${HEADS.map((t, i) => `<text x="${i * CELL + CELL / 2}" y="21" font-size="15" font-weight="700" text-anchor="middle" font-family="Malgun Gothic, Segoe UI, sans-serif">${t}</text>`).join('')}</svg>`), left: 0, top: 0 });
  for (const [j, r] of part.entries()) {
    const top = HEAD + j * (LH + CELL);
    comp.push({ input: bar(W, LH, r.head, r.stretched ? '#9a3412' : '#1e293b', '#fff'), left: 0, top });
    for (const [i, t] of r.tiles.entries()) comp.push({ input: await sharp(t).resize(CELL, CELL).png().toBuffer(), left: i * CELL, top: top + LH });
  }
  const file = `${OUT}-${s + 1}.png`;
  writeFileSync(file, await sharp({ create: { width: W, height: HEAD + part.length * (LH + CELL), channels: 3, background: '#ffffff' } }).composite(comp).png().toBuffer());
  console.log(`그림 ${file}`);
}
if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
