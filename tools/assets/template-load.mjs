// 신상중 템플릿 열기 성능(2026-11-06 · 계획 20 Task 10 · 명세 §7). 시작 화면에서 '경산 신상중 급식실'을 열고 3D로 바꿔 생성 모델이 모두 설 때까지의
// 시간 · 받은 GLB 바이트, 그리고 궤도 프레임 간격(끌었다 놓은 뒤 3 s · 맨 바깥 render 간격 중앙값)을 잰다. 헤드리스(창 없음).
// 비교 기준 = 같은 장면에서 GLB 요청을 막은 것(형상 — 모델 실패와 같은 길: 조합 형상으로 선다). 형상 실행은 형상 장면이 그려질 때까지 기다린다(waitShape).
//   npm run build && node tools/assets/template-load.mjs [URL] [--port 5198] [--runs 3]
// 판정(어기면 종료 1):
//   · 모델 합계 ≤ 12 MB — GLB 본문을 못 읽으면 NaN이라 실패한다(0 바이트로 치지 않는다).
//   · 궤도 간격 비 ≤ 1.25 — 실행 쌍 k(형상 k → 모델 k)마다 모델 ÷ 형상을 내고 그 중앙값을 본다. 장면별 중앙값끼리 나누면 세션 안의
//     기계 상태 흐름(2026-11-09: 형상 기준선이 18.4 → 21.4 ms로 흘렀다)이 섞인다. 놓은 뒤 프레임이 없는 실행은 비가 NaN이고 판정이 실패한다
//     (median은 NaN을 빼므로 따로 본다). 장면별 중앙값(model.gapMs · shape.gapMs)은 참고로 남긴다.
//     기준을 1.2에서 1.25로 올렸다(사용자 결정 2026-11-09). UHD 730에서 쌍 비 중앙값이 1.18–1.20(프레임당 3–4 ms)이었고, 사용자는 면을 더 줄이기보다
//     외관을 골랐다 — 큰 모델은 2만 면 그대로, 여러 대 놓이는 작은 기구 3종만 고르기 표 tris로 낮췄다.
//   · 페이지 오류 0.
//   · 모델 실행마다 GLB를 받았고(fetched) 형상 실행은 하나도 받지 않았다(blocked — 막기가 들었다).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import kitchenAssets from '../../src/products/kitchenAssets.js';
import { launchChrome, startPreview, threeHook, collectErrors, median } from './browser.mjs';
import { rememberRender, waitModel, waitShape } from './shots.mjs';

const argv = process.argv.slice(2), arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const RUNS = +arg('--runs', 3), MAX_BYTES = 12_000_000, MAX_RATIO = 1.25;   // 궤도 간격 비 기준(사용자 결정 2026-11-09 — 위 머리 주석)
const spec = JSON.parse(readFileSync(fileURLToPath(new URL('../../src/samples/sinsang.json', import.meta.url)), 'utf8'));
const expected = spec.floors[0].items.filter(i => kitchenAssets[i.productId]).length;

// 형상 실행에서 막은 GLB 요청은 크롬이 콘솔 오류('Failed to load resource: net::ERR_FAILED' · 위치 = 그 GLB)로 남긴다. 일부러 막은 것이라 세지 않는다
// (2026-11-09 첫 실행: GLB 22개 × 3회 = 오류 66으로 판정 실패). 앱은 이 실패를 경고('실사 모델 실패 …')로 처리한다 — 그 밖의 오류는 그대로 센다.
const GLB = /models\/[^/]+\.glb$/;

async function run(browser, url, models) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page), bodies = [];
  let aborted = 0;   // 일부러 막은 GLB의 콘솔 오류 수(checks.blocked와 다르다)
  if (!models) {
    await page.route(GLB, r => r.abort());
    page.on('console', m => { if (m.type() === 'error' && /^Failed to load resource/.test(m.text()) && GLB.test(m.location().url ?? '')) aborted++; });
  }
  page.on('response', r => { if (GLB.test(r.url()) && r.status() === 200) bodies.push(r.body().then(b => b.length, () => NaN)); });
  try {
    await page.addInitScript(threeHook); await page.addInitScript(rememberRender);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kvp.onboarded', '1'); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.click('[data-template="builtin-sinsang"]'); await page.waitForTimeout(2000);
    const t0 = Date.now();
    await page.click('[data-mode="iso"]');
    await (models ? waitModel : waitShape)(page, expected, 120000);
    const loadMs = Date.now() - t0;
    await page.waitForTimeout(1500);
    const box = await page.evaluate(() => { const r = document.querySelector('#c3d canvas').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.move(box.x, box.y); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + i * 40, box.y + i * 4);
    await page.evaluate(() => { window.__up = performance.now(); });
    await page.mouse.up(); await page.waitForTimeout(3000);
    const t = await page.evaluate(() => window.__renderTimes.filter(x => x >= window.__up).slice(0, 60));
    const gaps = t.slice(1).map((x, i) => x - t[i]);
    const bytes = (await Promise.all(bodies)).reduce((a, b) => a + b, 0);
    return { loadMs, bytes, glb: bodies.length, gapMs: median(gaps), frames: t.length, errors: errors.length - aborted };
  } finally { await page.close(); }
}

const server = await startPreview({ url: argv.find(a => /^https?:/.test(a)) ?? null, port: +arg('--port', 5198) });
const browser = await launchChrome({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const res = { model: [], shape: [] };
try {
  for (let k = 0; k < RUNS; k++) { res.shape.push(await run(browser, server.url, false)); res.model.push(await run(browser, server.url, true)); }
} finally { await browser.close(); await server.stop(); }
const r2 = (x, d = 2) => +x.toFixed(d);   // NaN은 그대로 NaN(JSON에서 null)
const sum = list => ({ loadMs: median(list.map(x => x.loadMs)), gapMs: r2(median(list.map(x => x.gapMs))), bytes: Math.max(...list.map(x => x.bytes)), glb: Math.max(...list.map(x => x.glb)), errors: list.reduce((a, x) => a + x.errors, 0) });
const m = sum(res.model), s = sum(res.shape);
const ratios = res.model.map((x, k) => x.gapMs / res.shape[k].gapMs);   // 판정은 반올림 전 값으로
const ratio = ratios.every(Number.isFinite) ? median(ratios) : NaN;
const pairs = res.model.map((x, k) => ({ model: r2(x.gapMs), shape: r2(res.shape[k].gapMs), frames: [x.frames, res.shape[k].frames], ratio: r2(ratios[k], 3) }));
const checks = {
  bytes: m.bytes <= MAX_BYTES,
  orbit: ratio <= MAX_RATIO,
  errors: m.errors === 0 && s.errors === 0,
  fetched: res.model.every(x => x.glb > 0),
  blocked: res.shape.every(x => x.glb === 0),
};
const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ expectedModels: expected, model: m, shape: s, pairs, ratio: r2(ratio, 3), verdict: { ok, ...checks } }, null, 1));
if (!ok) process.exit(1);
