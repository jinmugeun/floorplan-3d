// 에셋 검수 시트(snapshot.mjs)와 성능 측정(perf.mjs)의 브라우저 공용 부분(2026-10-13 · 계획 15 Task D).
// 프리뷰 서버 띄우기 · playwright-core 찾기 · 장면(프로젝트 JSON) 만들기 · 자동 저장본으로 복원하기 · three 렌더러·장면 잡기.
//
// 왜 자동 저장본 복원인가(사전 검토 I-4): window.__app은 개발 빌드에만 있다(main.js `import.meta.env.DEV`). 배포와 같은 프리뷰 빌드에서는
// localStorage 'kvp.autosave'에 프로젝트를 넣고 새로 고쳐 시작 화면 "이어서 작업"(data-start="restore")을 누른다 — 사전 검토의
// scratch/p15/perf-baseline.mjs가 이 길로 기준선(408 ms · 10.4 ms)을 쟀다.
// 왜 __THREE_DEVTOOLS__인가: three(0.169)는 WebGLRenderer·Scene을 만들 때 이 전역이 있으면 'observe' 이벤트로 자신을 넘긴다
// (three.module.js — 배포 번들에도 `__THREE_DEVTOOLS__<"u"&&…`로 남는다, 2026-10-13 dist 확인). 초기화 스크립트가 그 이벤트로
// 렌더러·장면을 잡으면 src를 고치지 않고 renderer.info.memory를 읽고 캔버스를 찍는다(앱 렌더러는 preserveDrawingBuffer: true — view3d.js:23).
// playwright-core는 의존성에 넣지 않았다(tools/dxf-corpus/e2e.mjs와 같다): 있으면 그것을, 없으면 PW_MODULES(npx 캐시 node_modules)에서 찾는다.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createEmptyProject, createItem } from '../../src/state/schema.js';
import { rectWalls } from '../../src/geom/walls.js';
import { detectRooms } from '../../src/geom/rooms.js';
import { productById } from '../../src/products/catalog.js';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PW_DEFAULT = 'C:/Users/User/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/';
const CHROME_FALLBACK = 'C:/Users/User/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launchChrome(opts = {}) {
  let chromium;
  try { chromium = (await import('playwright-core')).chromium; } catch { chromium = createRequire(process.env.PW_MODULES ?? PW_DEFAULT)('playwright-core').chromium; }
  return chromium.launch(opts).catch(() => chromium.launch({ ...opts, executablePath: process.env.PW_CHROME ?? CHROME_FALLBACK }));
}

// 포트에 무엇이든 듣고 있으면 참(2026-10-13 · 리뷰 I-2). localhost가 ::1·127.0.0.1 어느 쪽으로 풀릴지 몰라 둘 다 찔러 본다.
export function portBusy(port, timeoutMs = 500) {
  const one = host => new Promise(res => {
    const s = connect({ host, port });
    const done = v => { s.destroy(); res(v); };
    s.setTimeout(timeoutMs); s.once('connect', () => done(true)); s.once('error', () => done(false)); s.once('timeout', () => done(false));
  });
  return Promise.all(['127.0.0.1', '::1'].map(one)).then(r => r.some(Boolean));
}

// URL을 주면 그 서버를 쓰고, 없으면 dist를 `vite preview --strictPort`로 띄운다.
// node로 vite.js를 직접 띄운다(npx·셸 없이) — stop()이 자식 프로세스 하나만 끝내면 포트가 풀린다.
// 리뷰 I-2(2026-10-13): 예전에는 spawn 직후 그 포트를 fetch로 찔렀다 — 포트에 남의/낡은 서버(이전 실행의 고아 vite 등)가 있으면 vite가
// --strictPort로 죽기 전에 fetch가 성공해 그 서버로 쟀고 stop()은 아무것도 못 끝냈다. 그래서 ① spawn 전에 포트가 비었는지 보고(차 있으면 바로 실패)
// ② vite가 `Local:` 줄(자기가 포트를 잡았다는 출력)을 낸 뒤에만 probe한다. ③ 이 프로세스가 어떻게 끝나든(처리 안 된 거절로 finally를 못 돌아도)
// 자식을 끝내도록 'exit'에 건다 — 고아 서버가 다음 실행의 ①을 막지 않게.
export async function startPreview({ url = null, port = 5196 } = {}) {
  if (url) return { url, stop: async () => {} };
  if (!existsSync(`${ROOT}dist/index.html`)) throw new Error('dist가 없다 — 먼저 `npm run build`');
  if (await portBusy(port)) throw new Error(`포트 ${port}에 이미 서버가 있다 — 그 서버(이전 실행의 고아 vite일 수 있다)를 끄거나 --port로 다른 포트를 준다`);
  const vite = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url));
  const child = spawn(process.execPath, [vite, 'preview', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const kill = () => { if (child.exitCode === null) child.kill(); };
  process.once('exit', kill);
  let log = ''; child.stdout.on('data', d => { log += d; }); child.stderr.on('data', d => { log += d; });
  const stop = () => new Promise(res => { process.off('exit', kill); if (child.exitCode !== null) return res(); child.once('exit', () => res()); child.kill(); });
  const at = `http://localhost:${port}/`;
  const listening = () => /Local:\s+http/.test(log.replace(/\x1b\[[0-9;]*m/g, ''));   // vite는 'Local'을 굵게(ANSI) 찍는다 — 지우고 본다
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(`vite preview가 끝났다(포트 ${port}?) — ${log.trim().slice(-300)}`);
    if (listening()) try { if ((await fetch(at)).ok) return { url: at, stop }; } catch { /* 아직 응답 전 */ }
    await sleep(100);
  }
  await stop(); throw new Error(`vite preview가 15 s 안에 응답하지 않는다 — ${log.trim().slice(-300)}`);
}

// 페이지보다 먼저 도는 초기화 스크립트(addInitScript): three가 만드는 렌더러·장면을 window.__three에 모은다.
export function threeHook() {
  const T = window.__three = { renderers: [], scenes: [] };
  const hook = new EventTarget();
  hook.addEventListener('observe', e => { const o = e.detail; if (o?.isWebGLRenderer) T.renderers.push(o); else if (o?.isScene) T.scenes.push(o); });
  window.__THREE_DEVTOOLS__ = hook;
}

// 프로젝트 JSON(앱 스키마 함수로 — 손으로 쓴 JSON이 스키마와 어긋나지 않게). items: [{ productId, pos, rot?, z?, size? }].
// room: 정사각 방 한 변(mm, 벽 중심선 0..room) · wall: { thickness, height } · v3: 보기 플래그 덮어쓰기.
export function makeProject({ name = 'p15 task D', room, wall = { thickness: 200, height: 2400 }, items = [], v3 = {} }) {
  const p = createEmptyProject(name), f = p.floors[0];
  f.walls = rectWalls([0, 0], [room, room], wall.thickness, wall.height);
  f.rooms = detectRooms(f.walls);
  for (const it of items) {
    const prod = productById(it.productId);
    if (!prod) throw new Error(`카탈로그에 없는 제품 — ${it.productId}`);
    const z = it.z ?? (prod.attach === 'ceiling' ? Math.max(0, f.height - (it.size ?? prod.size)[2]) : prod.zDefault ?? 0);   // 천장 부착은 배치 도구처럼 천장에 매단다(placeTool.js)
    f.items.push(createItem(prod, { pos: it.pos, rot: it.rot ?? 0, z, ...(it.size ? { size: it.size } : {}) }));
  }
  p.view = { ...p.view, v3: { ...p.view.v3, ...v3 } };
  return p;
}

// 자동 저장본으로 복원 → 앱은 2D 화면이다. idleMs: 복원 뒤 유휴 셰이더 예열(rebuildGate warmup)이 끝나기를 기다리는 시간.
export async function restoreProject(page, url, project, { idleMs = 2500 } = {}) {
  await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(400);
  await page.evaluate(s => { localStorage.clear(); localStorage.setItem('kvp.onboarded', '1'); localStorage.setItem('kvp.autosave', s); localStorage.setItem('kvp.autosaveAt', String(Date.now())); }, JSON.stringify(project));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-start="restore"]', { timeout: 15000 });
  await page.click('[data-start="restore"]'); await page.waitForTimeout(idleMs);
}

// 페이지 오류 모으기(콘솔 error · pageerror). favicon 404는 프리뷰 서버의 잡음이라 뺀다.
export function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text() + JSON.stringify(m.location()))) errors.push(m.text().slice(0, 160)); });
  return errors;
}

export const median = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
