// 에셋 성능 측정(2026-10-13 · 계획 15 Task D · 목표 3): 같은 자리의 제품 n개(기본 chair-dining 100개)를 실사 모델(v3.assets 켬)과
// 조합 형상(v3.assets=false)으로 앱 화면(프리뷰 빌드 · 헤드 Chrome)에 띄워 잰다 → 표 + 목표 3 판정(에셋 ≤ 상자 · 첫 프레임 ≤ 500 ms).
//   npm run build && node tools/assets/perf.mjs [URL] [--vsync off|on] [--runs 3] [--n 100] [--product chair-dining] [--port 5196] [--perf-mode]
// 목표 3 실패 · 측정 검사 실패(에셋 장면에 모델·GLB가 없는 등 — lib perfVerdict · 리뷰 I-1) · 페이지 오류가 있으면 종료 1.
// URL을 주지 않으면 dist를 vite preview로 띄우고 끝에 내린다(browser.mjs). 회마다 ① 상자 ② 에셋 · 새 세션(모델·로더 청크를 처음 받는다)
// ③ 에셋 · 캐시 뒤(②와 같은 브라우저·컨텍스트의 두 번째 페이지 — HTTP 캐시)를 잰다. --perf-mode면 ④ 성능 모드(view.perfMode = 'performance' —
// 지금 규칙으로는 모델 대신 상자 · 윤곽선·그림자·라벨 없음 · 픽셀 비율 1)도 잰다.
//
// 재는 것(사전 검토 p15-preflight §5의 perf-baseline.mjs 방식 그대로 — 기준선 비교가 되게):
// - 초기화 스크립트가 WebGL draw*와 requestAnimationFrame을 감싼다: draw가 있었던 rAF 콜백 = 3D 프레임(2D·미니맵은 Canvas 2D라 섞이지 않는다).
// - 첫 프레임 = [3D] 버튼 클릭(캡처 리스너 시각) → 클릭 뒤 첫 3D 프레임 끝(콜백 + gl.finish — ANGLE에서 finish는 GPU를 기다리지 않는다 · 사전 검토).
//   에셋 장면의 첫 프레임은 **상자로** 선다(템플릿이 아직 없다 — items3d.itemMesh는 요청만 걸고 조합 형상). 그래서 에셋은 "모델 첫 프레임"
//   (클릭 → draw 수가 첫 프레임의 절반 아래로 떨어진 첫 프레임 끝 = 모델로 다시 지은 프레임)과 GLB 응답 끝(Resource Timing)도 잰다.
// - 궤도 = 캔버스를 세게 끌었다 놓아 OrbitControls 감쇠가 스스로 이어 그리는 60프레임의 프레임 간격 중앙값(vsync 끔이라 16.7 ms에 묶이지 않는다).
// - 전송량 = models/*.glb 응답 본문 합 · 메모리 = renderer.info.memory(geometries·textures — 공유 복제면 종류당 지오메트리 한 벌).
//   렌더러는 __THREE_DEVTOOLS__ 'observe'로 잡는다(browser.mjs threeHook — src 변경 없음).
// 기준선(사전 검토 · 같은 PC · 같은 장면 · 계획 15 전 코드): 3D 첫 프레임 408 ms(vsync 끔) / 278 ms(vsync 켬) · 궤도 간격 10.4 ms(vsync 끔) · draw 1,436.
import { productById } from '../../src/products/catalog.js';
import { perfVerdict } from './lib.mjs';
import { launchChrome, startPreview, threeHook, makeProject, restoreProject, collectErrors, median } from './browser.mjs';

const argv = process.argv.slice(2), arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const vsync = arg('--vsync', 'off') === 'on', runs = +arg('--runs', 3), n = +arg('--n', 100), pid = arg('--product', 'chair-dining');
const withPerf = argv.includes('--perf-mode');
if (!productById(pid)?.asset) { console.error(`perf: 에셋이 있는 제품이 아니다 — ${pid}`); process.exit(1); }
const BASELINE = { firstMs: vsync ? 278 : 408, orbitGapMs: vsync ? 16.7 : 10.4 };   // vsync 켬은 화면 주사율(16.7 ms)에 묶인다

// 사전 검토 make-scene.mjs와 같은 장면: ⌈√n⌉ 격자 · 간격 700 mm · 회전 0/90/180/270 · 방 한 변 = 열 × 700 + 2200(벽 200 · 높이 2400).
// kind: 'box'(v3.assets=false) · 'asset'(기본 보기) · 'perf'(성능 모드).
function scene(kind) {
  const cols = Math.ceil(Math.sqrt(n)), gap = 700;
  const items = Array.from({ length: n }, (_, i) => ({ productId: pid, pos: [1100 + (i % cols) * gap + gap / 2, 1100 + Math.floor(i / cols) * gap + gap / 2], rot: (i % 4) * 90 }));
  const p = makeProject({ name: `perf ${pid} ×${n}`, room: cols * gap + 2200, items, v3: kind === 'box' ? { assets: false } : {} });
  if (kind === 'perf') p.view.perfMode = 'performance';
  return p;
}

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
    if (draws > d0) { const t1 = performance.now(); if (window.__finish) ctxs[0]?.finish(); window.__frames.push({ start: t0, cb: t1 - t0, total: performance.now() - t0, draws: draws - d0 }); }
  });
}

async function measure(context, url, kind) {
  const page = await context.newPage();
  const errors = collectErrors(page), bodies = [];
  page.on('response', r => { if (/models\/[^/]+\.glb$/.test(r.url())) bodies.push(r.body().then(b => b.length, () => NaN)); });
  try {
    await page.addInitScript(threeHook); await page.addInitScript(INIT);
    await restoreProject(page, url, scene(kind));
    const gpu = await page.evaluate(() => { const gl = window.__gl(); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : String(gl); });
    // ① 3D 전환 첫 프레임(에셋이면 모델 첫 프레임까지)
    await page.evaluate(() => { window.__finish = true; window.__frames.length = 0; document.querySelector('[data-mode="iso"]').addEventListener('click', () => { window.__click = performance.now(); }, { capture: true, once: true }); });
    await page.click('[data-mode="iso"]');
    await page.waitForFunction(() => window.__frames.some(x => x.start >= window.__click), null, { timeout: 15000 });
    const first = await page.evaluate(() => { const f = window.__frames.find(x => x.start >= window.__click); return { ms: f.start + f.total - window.__click, draws: f.draws }; });
    let model = null;
    if (kind === 'asset') {
      // 타임아웃은 여기서 삼키고 model = null로 남긴다 — 측정은 끝까지 하고, 판정(lib perfVerdict · 리뷰 I-1)이 그 장면을 'model' 문제로 실패시킨다.
      await page.waitForFunction(d => window.__frames.some(x => x.start >= window.__click && x.draws <= d / 2), first.draws, { timeout: 20000 }).catch(() => {});
      model = await page.evaluate(d => {
        const f = window.__frames.find(x => x.start >= window.__click && x.draws <= d / 2);
        const glb = performance.getEntriesByType('resource').filter(e => /models\/[^/]+\.glb$/.test(e.name)).map(e => e.responseEnd - window.__click);
        return f ? { ms: f.start + f.total - window.__click, draws: f.draws, glbDoneMs: glb.length ? Math.max(...glb) : null } : null;
      }, first.draws);
    }
    await page.waitForTimeout(1500);
    const mem = await page.evaluate(() => { const r = window.__three.renderers.find(x => x.domElement.isConnected); return { geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs?.length ?? null }; });
    // ② 궤도: 끌었다 놓은 뒤 감쇠 프레임 60개의 간격(finish 없음)
    const box = await page.evaluate(() => { const r = document.querySelector('#c3d canvas').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.evaluate(() => { window.__finish = false; window.__frames.length = 0; });
    await page.mouse.move(box.x, box.y); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + i * 40, box.y + i * 4);
    await page.evaluate(() => { window.__up = performance.now(); });
    await page.mouse.up(); await page.waitForTimeout(3000);
    const orbit = await page.evaluate(() => {
      const fr = window.__frames.filter(x => x.start >= window.__up).slice(0, 60), gaps = fr.slice(1).map((x, i) => x.start - fr[i].start);
      return { n: fr.length, gaps, cb: fr.map(x => x.cb), draws: fr.map(x => x.draws) };
    });
    const glbBytes = (await Promise.all(bodies)).reduce((a, b) => a + b, 0);
    return { gpu, first, model, mem, glbBytes, glbCount: bodies.length, orbit: { n: orbit.n, gapMs: median(orbit.gaps), p90: [...orbit.gaps].sort((a, b) => a - b)[Math.floor(orbit.gaps.length * 0.9)], cbMs: median(orbit.cb), draws: median(orbit.draws) }, errors };
  } finally { await page.close(); }
}

// 브라우저를 측정 묶음마다 새로 띄운다(2026-10-13 실측): 한 브라우저에서 상자 → 에셋 순으로 재니 에셋의 첫 프레임(같은 조합 형상인데도)이
// 422 → 251 ms로 빨랐다 — GPU 프로세스의 셰이더 캐시가 앞 페이지 몫을 물려받는다. 상자·에셋 새 세션·성능 모드는 각자 새 브라우저(임시 프로필 —
// 디스크 셰이더 캐시도 빔)에서, 에셋 · 캐시 뒤는 새 세션과 같은 브라우저·컨텍스트의 두 번째 페이지에서 잰다. 순서는 회마다 돌린다.
async function session(url, kind) {
  const browser = await launchChrome({ headless: false, args: vsync ? [] : ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const a = await measure(context, url, kind);
    return kind === 'asset' ? { cold: a, warm: await measure(context, url, kind) } : { [kind]: a };
  } finally { await browser.close(); }
}

const r1 = x => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const KINDS = withPerf ? ['box', 'asset', 'perf'] : ['box', 'asset'];
const server = await startPreview({ url: argv.find(a => /^https?:/.test(a)) ?? null, port: +arg('--port', 5196) });
const rows = { box: [], cold: [], warm: [], perf: [] };
try {
  for (let i = 0; i < runs; i++) {
    const order = KINDS.map((_, k) => KINDS[(k + i) % KINDS.length]), got = {};
    for (const kind of order) Object.assign(got, await session(server.url, kind));
    for (const [k, v] of Object.entries(got)) rows[k].push(v);
    const brief = m => ({ first: r1(m.first.ms), firstDraws: m.first.draws, model: r1(m.model?.ms), glbDone: r1(m.model?.glbDoneMs), gap: r1(m.orbit.gapMs), p90: r1(m.orbit.p90), cb: r1(m.orbit.cbMs), draws: m.orbit.draws, mem: m.mem, glbBytes: m.glbBytes, errors: m.errors });
    console.log(`run ${i + 1} (${order.join(' → ')})`, JSON.stringify(Object.fromEntries(Object.entries(got).map(([k, v]) => [k, brief(v)]))));
  }
} finally { await server.stop(); }

const m = (k, f) => r1(median(rows[k].map(f)));
const sum = k => ({
  firstMs: m(k, x => x.first.ms), modelMs: m(k, x => x.model?.ms), glbDoneMs: m(k, x => x.model?.glbDoneMs),
  orbitGapMs: m(k, x => x.orbit.gapMs), orbitP90Ms: m(k, x => x.orbit.p90), orbitCbMs: m(k, x => x.orbit.cbMs), draws: m(k, x => x.orbit.draws),
  geometries: m(k, x => x.mem.geometries), textures: m(k, x => x.mem.textures), programs: m(k, x => x.mem.programs), glbBytes: m(k, x => x.glbBytes), glbCount: m(k, x => x.glbCount),
  errors: rows[k].reduce((a, x) => a + x.errors.length, 0),
});
const S = Object.fromEntries(['box', 'cold', 'warm', ...(withPerf ? ['perf'] : [])].map(k => [k, sum(k)]));
// 판정은 lib의 순수 함수(리뷰 I-1 · 2026-10-13): 예전 `S.cold.modelMs <= 500`은 모델이 안 서 null이어도 참이었고 종료 코드는 콘솔 오류만 셌다.
// 이제 비교는 유한수끼리만, 에셋 장면은 모델 프레임·GLB·지오메트리 감소가 있어야 하고, 장면 문제가 하나라도 있거나 목표 3이 실패면 종료 1.
const verdict = perfVerdict(S);
const PROBLEM_NOTE = { model: '모델 프레임 없음(대기 타임아웃)', glb: 'GLB 요청 0', glbBytes: 'GLB 전송 0·읽기 실패', geometries: '지오메트리가 상자보다 줄지 않음(공유 안 됨)', firstMs: '첫 프레임 값 없음', orbitGapMs: '궤도 값 없음', errors: '페이지 오류', missing: '장면 없음' };
const cell = v => (v == null ? '—' : String(v));
const check = k => (verdict.problems[k].length ? `**실패**(${verdict.problems[k].join(', ')})` : '통과');
const line = (name, k) => `| ${name} | ${cell(S[k].firstMs)} | ${cell(S[k].modelMs)} | ${cell(S[k].glbDoneMs)} | ${cell(S[k].orbitGapMs)} (p90 ${cell(S[k].orbitP90Ms)}) | ${cell(S[k].orbitCbMs)} | ${cell(S[k].draws)} | ${cell(S[k].geometries)} / ${cell(S[k].textures)} | ${cell(S[k].glbBytes)} (${cell(S[k].glbCount)}) | ${check(k)} |`;
const seen = [...new Set(Object.values(verdict.problems).flat())];
console.log([
  '', `${pid} ×${n} · vsync ${vsync ? '켬' : '끔'} · ${runs}회 중앙값 · GPU ${rows.box[0]?.gpu}`,
  '| 장면 | 3D 첫 프레임 ms | 모델 첫 프레임 ms | GLB 도착 ms | 궤도 간격 ms | 궤도 JS ms | draw/프레임 | geometries / textures | models 전송 B(요청 수) | 측정 검사 |',
  '|---|---|---|---|---|---|---|---|---|---|',
  line('상자(v3.assets=false)', 'box'), line('에셋 · 새 세션', 'cold'), line('에셋 · 캐시 뒤', 'warm'),
  ...(withPerf ? [line('성능 모드(perfMode=performance)', 'perf')] : []),
  `| 기준선(사전 검토 · 계획 15 전) | ${BASELINE.firstMs} | — | — | ${BASELINE.orbitGapMs} | — | 1,436 | — | — | — |`,
  ...(seen.length ? ['', `측정 검사 문제: ${seen.map(p => `${p} = ${PROBLEM_NOTE[p] ?? p}`).join(' · ')}`] : []),
  '', `목표 3 ${verdict.ok ? '통과' : '**실패**'}: 궤도 에셋 ≤ 상자 ${verdict.orbit ? '통과' : '실패'} · 3D 첫 프레임 ≤ 500 ms ${verdict.firstFrame ? '통과' : '실패'} · 측정 검사 ${seen.length ? '실패' : '통과'} · (참고) 모델 첫 프레임 ≤ 500 ms ${verdict.modelFrame ? '예' : '아니오'}`,
].join('\n'));
console.log(JSON.stringify({ product: pid, n, vsync, runs, gpu: rows.box[0]?.gpu, summary: S, verdict }));
process.exit(verdict.ok ? 0 : 1);
