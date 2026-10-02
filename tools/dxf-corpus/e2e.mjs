// 코퍼스 브라우저 테스트: node tools/dxf-corpus/e2e.mjs [URL] [--only id]
// 도면마다 **실제 화면에서** 올리기 → 검토 창 → (도면 고르기) → 가져오기 → 2D·3D를 돌리고, 검토 창의 숫자가
// 점수판(같은 워커 코드를 node에서 돌린 값)과 같은지 본다. 스크립트 채점만으로는 검토 창의 동작이 검증되지 않는다 —
// 2026-10-02 내곡중: 체크는 켜져 보이는데 결과는 추정 폴백의 것이었고, 화면에서 올려 보기 전에는 몰랐다.
// URL 기본값은 로컬 미리보기(npm run build && npx vite preview --port 5173). 화면 캡처는 out/<id>/ 에 남는다.
// playwright-core는 의존성에 넣지 않았다: 있으면 그것을, 없으면 PW_MODULES(node_modules 경로)에서 찾는다.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { corpus, runDrawing, fileOf } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const URL_ = args.find(a => /^https?:/.test(a)) ?? 'http://localhost:5173/';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
async function loadPlaywright() {
  try { return (await import('playwright-core')).chromium; } catch { /* 아래 경로에서 찾는다 */ }
  const base = process.env.PW_MODULES ?? 'C:/Users/User/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/';
  return createRequire(base)('playwright-core').chromium;
}
const chromium = await loadPlaywright();
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader'] })
  .catch(() => chromium.launch({ executablePath: 'C:/Users/User/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe', args: ['--use-gl=angle', '--use-angle=swiftshader'] }));
let failed = 0;
for (const entry of corpus()) {
  if (only && entry.id !== only) continue;
  const file = fileOf(entry);
  if (!file) { console.log(`${entry.id}: 파일 없음 — 건너뜀`); continue; }
  const scored = await runDrawing(entry), want = scored.metrics;
  const out = resolve(HERE, 'out', entry.id); mkdirSync(out, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [], checks = [];
  const check = (name, ok, detail = '') => { checks.push(`${ok ? '✓' : '✗'} ${name}${detail ? ` (${detail})` : ''}`); if (!ok) failed++; };
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text() + JSON.stringify(m.location()))) errors.push(m.text().slice(0, 160)); });
  try {
    await page.goto(URL_, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(600);
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kvp.onboarded', '1'); });
    await page.goto(URL_, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200);
    await page.click('#startScreen [data-start="dxf"]'); await page.waitForTimeout(300);
    const ready = () => page.waitForFunction(() => { const b = document.querySelector('#dxfDialog [name="import"]'); return b && !b.disabled; }, { timeout: 90000 });
    await page.setInputFiles('#dxfDialog input[name="file"]', file);
    await ready();
    const region = entry.region ?? 0;
    const shown = await page.evaluate(() => { const r = document.querySelector('#dxfDialog [name="regionRow"]'); return !!r && !r.hidden; });
    check('도면 선택 칸', shown === want.regions > 1, `후보 ${want.regions}개 · 칸 ${shown ? '보임' : '숨김'}`);
    if (region > 0) { await page.selectOption('#dxfDialog [name="region"]', String(region)); await page.waitForTimeout(600); await ready(); }
    const nums = await page.evaluate(() => document.querySelector('#dxfDialog [name="nums"]')?.textContent ?? '');
    const m = nums.match(/벽 (\d+) · 방 (\d+) · 면적 ([\d.]+)/) ?? [];
    check('검토 창 숫자 = 점수판', +m[1] === want.walls && +m[2] === want.rooms && +m[3] === want.areaM2, `화면 "${nums}" · 점수판 벽 ${want.walls} 방 ${want.rooms} 면적 ${want.areaM2}`);
    // 화면의 체크 그대로 다시 추출해도 같은 값이어야 한다(표시 = 계산): 관계없는 옵션을 껐다 켠다.
    for (let k = 0; k < 2; k++) { await page.click('#dxfDialog [name="trace"]'); await page.waitForTimeout(700); await ready(); }
    const again = await page.evaluate(() => document.querySelector('#dxfDialog [name="nums"]')?.textContent ?? '');
    check('표시 = 계산(다시 추출해도 같다)', again === nums, again === nums ? '' : `"${nums}" → "${again}"`);
    await page.screenshot({ path: resolve(out, '1-dialog.png') });
    await page.click('#dxfDialog [name="import"]'); await page.waitForTimeout(2500);
    check('검토 창이 닫힌다', !(await page.$('#dxfDialog')));
    await page.screenshot({ path: resolve(out, '2-2d.png') });
    await page.mouse.move(700, 380); for (let k = 0; k < 5; k++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(100); }
    await page.waitForTimeout(400); await page.screenshot({ path: resolve(out, '3-2d-zoom.png') });
    const b3 = await page.$('button:has-text("3D")');
    if (b3) { await b3.click(); await page.waitForTimeout(3000); await page.screenshot({ path: resolve(out, '4-3d.png') }); }
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500);
    check('새로고침 뒤 이어서 작업', /이어서 작업/.test(await page.evaluate(() => document.querySelector('#startScreen')?.innerText ?? '')));
    // 화면이 보여 주는 넓이 = 도면의 면적 표기(±0.05 m²): 가져온 도면은 '도면 기준'으로 열리고, 저장된 방의 넓이가 표기와 같아야 한다.
    if (want.areaAll) {
      const saved = await page.evaluate(() => { try { const j = JSON.parse(localStorage.getItem('kvp.autosave')); return j?.project ?? j; } catch { return null; } });
      const rooms = saved?.floors?.[0]?.rooms ?? [];
      const ok = scored.areaRows.filter(a => rooms.some(r => r.name === a.room && Math.abs(r.areaCenter - a.label) <= 0.05)).length;
      check('면적 표기 = 화면 넓이', saved?.areaMode === 'center' && ok === want.areaAll, '기준 ' + saved?.areaMode + ' · ' + ok + '/' + want.areaAll);
    }
    check('콘솔 오류 0', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) { check('실행', false, String(e.message).split('\n')[0]); }
  await page.close();
  console.log(`\n${entry.id} — ${entry.note}\n  ${checks.join('\n  ')}`);
}
await browser.close();
console.log(failed ? `\n✗ 실패 ${failed}개` : '\n✓ 모두 통과');
process.exit(failed ? 1 : 0);
