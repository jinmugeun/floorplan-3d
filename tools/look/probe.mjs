// 급식실 룩 측정(계획 17 Task 1·10). 신상중 템플릿(src/samples/sinsang.json)을 프리뷰 빌드에 자동 저장본으로 띄우고 3D로 바꿔
//  ① 3D 첫 프레임(클릭 → 첫 3D 프레임 끝) ② 궤도 프레임 간격 중앙값·p90(감쇠 60프레임 · vsync 끔) ③ 프레임당 draw 수를 재고
//  ④ 첫 회에 넓게(기본 프레이밍) · 근접(화면 맞추기 → Shift+끌기 이동 → 휠 5번 — 고정 순서) 스크린샷 두 장을 찍는다.
//   npm run build && node tools/look/probe.mjs [URL] [--runs 3] [--save baseline] [--compare baseline] [--port 5197] [--shots <폴더>]
// --save 이름: tools/look/<이름>.json에 중앙값을 쓴다 · --compare 이름: 그 기준과 게이트 판정(probeLib.probeVerdict) — 실패면 종료 1.
// 측정 방식은 tools/assets/perf.mjs와 같다(초기화 스크립트가 WebGL draw*와 rAF를 감싼다 — 같은 PC에서 비교가 되게). 회마다 새 브라우저.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { migrate } from '../../src/state/schema.js';
import { launchChrome, startPreview, threeHook, restoreProject, collectErrors, ROOT } from '../assets/browser.mjs';
import { median, p90, summarize, probeVerdict } from './probeLib.mjs';

const argv = process.argv.slice(2), arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const runs = +arg('--runs', 3), save = arg('--save', null), compare = arg('--compare', null);
const shots = arg('--shots', `${ROOT}.superpowers/sdd/scratch/p17-shots`), tag = save ?? compare ?? 'probe';
const project = () => migrate(JSON.parse(readFileSync(`${ROOT}src/samples/sinsang.json`, 'utf8')));

function INIT() {
  const ctxs = []; let draws = 0;
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const c = orig.call(this, type, attrs);
    if (c && /webgl/.test(String(type)) && !ctxs.includes(c)) {
      ctxs.push(c);
      for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const o = c[fn].bind(c); c[fn] = (...a) => { draws++; return o(...a); }; }
    }
    return c;
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.__frames = []; window.__finish = false; window.__gl = () => ctxs[0];
  window.requestAnimationFrame = cb => raf(ts => {
    const d0 = draws, t0 = performance.now(); cb(ts);
    if (draws > d0) { if (window.__finish) ctxs[0]?.finish(); window.__frames.push({ start: t0, total: performance.now() - t0, draws: draws - d0 }); }
  });
}

async function once(url, i) {
  const browser = await launchChrome({ headless: false, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
    const errors = collectErrors(page);
    await page.addInitScript(threeHook); await page.addInitScript(INIT);
    await restoreProject(page, url, project());
    await page.evaluate(() => { window.__finish = true; window.__frames.length = 0; document.querySelector('[data-mode="iso"]').addEventListener('click', () => { window.__click = performance.now(); }, { capture: true, once: true }); });
    await page.click('[data-mode="iso"]');
    await page.waitForFunction(() => window.__frames.some(x => x.start >= window.__click), null, { timeout: 15000 });
    const first = await page.evaluate(() => { const f = window.__frames.find(x => x.start >= window.__click); return { ms: f.start + f.total - window.__click, draws: f.draws }; });
    await page.waitForTimeout(3000);   // 텍스처(헤어라인·칩 바닥) 도착 → 리빌드 · 셰이더 예열
    const canvas = await page.$('#c3d canvas'), box = await canvas.boundingBox(), c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    if (i === 0) { mkdirSync(shots, { recursive: true }); await canvas.screenshot({ path: `${shots}/${tag}-wide.png` }); }
    await page.evaluate(() => { window.__finish = false; window.__frames.length = 0; });
    await page.mouse.move(c.x, c.y); await page.mouse.down();
    for (let k = 1; k <= 8; k++) await page.mouse.move(c.x + k * 40, c.y + k * 4);
    await page.evaluate(() => { window.__up = performance.now(); });
    await page.mouse.up(); await page.waitForTimeout(3000);
    const orbit = await page.evaluate(() => { const fr = window.__frames.filter(x => x.start >= window.__up).slice(0, 60); return { gaps: fr.slice(1).map((x, j) => x.start - fr[j].start), draws: fr.map(x => x.draws) }; });
    if (i === 0) {
      await page.keyboard.press('0'); await page.waitForTimeout(800);
      // Shift+왼쪽 끌기 = OrbitControls 이동(우클릭은 앱의 방 메뉴를 연다) — 조리 구역(도면 왼쪽)이 가운데로 오게
      await page.keyboard.down('Shift'); await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 120, c.y - 30, { steps: 10 }); await page.mouse.up(); await page.keyboard.up('Shift');
      await page.keyboard.press('Escape');
      for (let k = 0; k < 5; k++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(80); }
      await page.waitForTimeout(1500);
      await canvas.screenshot({ path: `${shots}/${tag}-close.png` });
    }
    const gpu = await page.evaluate(() => { const gl = window.__gl(); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : String(gl); });
    return { gpu, firstMs: first.ms, firstDraws: first.draws, orbitGapMs: median(orbit.gaps), orbitP90Ms: p90(orbit.gaps), draws: median(orbit.draws), errors };
  } finally { await browser.close(); }
}

const server = await startPreview({ url: argv.find(a => /^https?:/.test(a)) ?? null, port: +arg('--port', 5197) });
const all = [];
try { for (let i = 0; i < runs; i++) { const r = await once(server.url, i); all.push(r); console.log(`run ${i + 1}`, JSON.stringify({ ...r, errors: r.errors.length })); } }
finally { await server.stop(); }
const S = { date: new Date().toISOString().slice(0, 10), gpu: all[0]?.gpu ?? null, ...summarize(all) };
console.log(JSON.stringify(S, null, 2));
console.log(`스크린샷: ${shots}/${tag}-wide.png · ${tag}-close.png`);
if (save) { writeFileSync(`${ROOT}tools/look/${save}.json`, `${JSON.stringify(S, null, 2)}\n`); console.log(`저장: tools/look/${save}.json`); }
if (compare) {
  const f = `${ROOT}tools/look/${compare}.json`;
  if (!existsSync(f)) { console.error(`기준 없음: ${f}`); process.exit(1); }
  const v = probeVerdict(JSON.parse(readFileSync(f, 'utf8')), S);
  console.log(v.ok ? `게이트 통과(한도 ${v.limit} ms)` : `게이트 실패: ${v.problems.join(' · ')}`);
  if (!v.ok) process.exit(1);
} else if (S.errors) process.exit(1);
