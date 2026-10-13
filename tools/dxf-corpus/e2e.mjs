// 코퍼스 브라우저 테스트: node tools/dxf-corpus/e2e.mjs [URL] [--only id]
// 도면마다 **실제 화면에서** 올리기 → 검토 창 → (도면 고르기) → 가져오기 → 2D·3D를 돌리고, 검토 창의 숫자가
// 점수판(같은 워커 코드를 node에서 돌린 값)과 같은지 본다. 스크립트 채점만으로는 검토 창의 동작이 검증되지 않는다 —
// 2026-10-02 내곡중: 체크는 켜져 보이는데 결과는 추정 폴백의 것이었고, 화면에서 올려 보기 전에는 몰랐다.
// URL 기본값은 로컬 미리보기(npm run build && npx vite preview --port 5173). 화면 캡처는 out/<id>/ 에 남는다.
// playwright-core는 의존성에 넣지 않았다: 있으면 그것을, 없으면 PW_MODULES(node_modules 경로)에서 찾는다.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { corpus, runDrawing, fileOf } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const URL_ = args.find(a => /^https?:/.test(a)) ?? 'http://localhost:5173/';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
// 가져온 직후 2D 렌더샷의 drawn 하한(아래 · 2026-10-13 최종 리뷰 X-10). 실측(SwiftShader): 사동 0.7156 · 신상B 0.4232 · 신상A 0.6305 · 내곡 0.3627.
// 리뷰가 제안한 nonBg ≥ 0.95(배경·바닥색이 아닌 화소)는 쓰지 않는다: renderImage를 gate.fresh 없이 부르게 바꾼 변형 빌드(숨은 3D가 짓지 않고 찍음)의
// 빈 한 색 그림이 nonBg 1.0으로 통과했다 — drawn(가장 흔한 색에서 먼 불투명 화소)은 그 그림이 0이다(실패).
const SHOT_MIN = 0.2;
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
    // 기구 알림(2026-10-12 · 계획 13 Task 4): 검토 창 알림의 "기구 n개 배치 — 제품 p · 일반 g"가 점수판(열 equip·equipProd · stats.equipment.generic)과
    // 같아야 한다 — 체크박스 기본 켬 = 점수판의 runDrawing 기본(equipment: true). 배치가 0이면 알림에 기구 문구가 없어야 한다(dxfDialog notes).
    const note = await page.evaluate(() => { const e = document.querySelector('#dxfDialog [name="notice"]'); return e && !e.hidden ? e.textContent : ''; });
    // 충돌 수(2026-10-12 · 최종 리뷰 F-3): 알림의 "충돌 c건"은 stats.equipment.colliding(완성된 아이템의 collidingIds)이고, 가져온 뒤 앱 배너와 같아야 한다(아래).
    // 충돌이 0이면 알림에 그 칸이 없다(2026-10-13 · 계획 14 Task D) — 없는 칸은 0으로 읽는다(충돌이 있는데 칸이 빠지면 0 ≠ c로 걸린다).
    // 기둥 면에 맞춰 줄인 수(2026-10-13 · 계획 14 최종 리뷰 X-3)는 알림 **맨 끝** 칸이다 — 위 정규식은 그대로 맞고, 칸이 없으면 0으로 읽어 stats.equipment.trimmed와 견준다.
    const em = note.match(/기구 (\d+)개 배치 — 제품 (\d+) · 일반 (\d+)(?: · 충돌 (\d+)건)?/), generic = scored.stats.equipment?.generic ?? 0;
    const colliding = scored.stats.equipment?.colliding ?? 0, trimmed = scored.stats.equipment?.trimmed ?? 0, tm = +(note.match(/ · 기둥 면에 맞춰 줄임 (\d+)$/)?.[1] ?? 0);
    check('검토 창 기구 알림 = 점수판', want.equip > 0 ? !!em && +em[1] === want.equip && +em[2] === want.equipProd && +em[3] === generic && +(em[4] ?? 0) === colliding && tm === trimmed : !em,
      `화면 "${em?.[0] ?? '기구 문구 없음'}"${tm ? ` … 줄임 ${tm}` : ''} · 점수판 배치 ${want.equip} 제품 ${want.equipProd} 일반 ${generic} 충돌 ${colliding} 줄임 ${trimmed}`);
    // 화면의 체크 그대로 다시 추출해도 같은 값이어야 한다(표시 = 계산): 관계없는 옵션을 껐다 켠다.
    for (let k = 0; k < 2; k++) { await page.click('#dxfDialog [name="trace"]'); await page.waitForTimeout(700); await ready(); }
    const again = await page.evaluate(() => document.querySelector('#dxfDialog [name="nums"]')?.textContent ?? '');
    check('표시 = 계산(다시 추출해도 같다)', again === nums, again === nums ? '' : `"${nums}" → "${again}"`);
    await page.screenshot({ path: resolve(out, '1-dialog.png') });
    await page.click('#dxfDialog [name="import"]'); await page.waitForTimeout(2500);
    check('검토 창이 닫힌다', !(await page.$('#dxfDialog')));
    // 가져온 직후 배너(2026-10-12 · 최종 리뷰 F-2 · F-3): 끊긴 끝점이 있으면 그 안내와 [보기]가 보이고(충돌이 가리지 않는다), 충돌 수는 검토 창 알림과 같다.
    const bn = await page.evaluate(() => { const b = document.querySelector('#banner'); return { text: b && !b.hidden ? b.textContent : '', view: !!document.querySelector('#banner #btnOpenEnds') }; });
    const bc = +(bn.text.match(/충돌 (\d+)건/)?.[1] ?? 0);
    check('가져온 뒤 배너: 끊긴 끝점 안내 + 충돌 수 = 알림', (want.openEnds > 0 ? /이어지지 않은 곳이 \d+군데/.test(bn.text) && bn.view : true) && bc === colliding,
      `배너 "${bn.text.slice(0, 90)}" · 끊긴 끝점 ${want.openEnds} · 알림 충돌 ${colliding}`);
    await page.screenshot({ path: resolve(out, '2-2d.png') });
    // 가져온 직후 2D에서 렌더샷(2026-10-13 · 계획 14 최종 리뷰 X-10 · Task B 리뷰 M-B1): 2D를 보는 동안 3D 리빌드를 보류하므로(Task B) 숨긴 채 찍는 렌더샷은
    // gate.fresh로 먼저 짓고 컷어웨이·라벨 컬링을 한 뒤 그린다 — 첫 구현에서 이 길이 빠져 앞 벽·라벨 접힘이 없었다(지금은 소스 정규식만 지켰다).
    // 1280×720 미리보기 PNG가 비어 있지 않은지(가장 흔한 색에서 먼 불투명 화소 비율 drawn ≥ SHOT_MIN — 위 SHOT_MIN 주석)와 콘솔 오류 0(아래)을 본다.
    // 캡처는 out/<id>/2b-render-2d.png. nonBg(Task B 리뷰의 판정)는 보고만 한다.
    // 한계(X-6 · 이전부터 · 회귀 아님 · 계획 15): 가져온 뒤에는 2D만 맞추고(view.fit) 3D 카메라는 시작 때의 빈 프로젝트 프레이밍에 남는다 — 이 그림은 도면
    // 한 귀퉁이만 보이고, 라벨은 숨은 컨테이너(1×1)로 재서 모두 점이다. drawn은 그런 그림도 통과한다(사동 0.72). 프레이밍·라벨 검사는 X-6을 고친 뒤에.
    await page.click('#btnRender'); await page.waitForTimeout(200);
    await page.selectOption('.modal.render [name="size"]', '1280×720');
    await page.click('.modal.render [name="render"]');
    await page.waitForFunction(() => { const i = document.querySelector('.modal.render [data-part="preview"]'); return i && !i.hidden && i.src.startsWith('data:image/png'); }, { timeout: 30000 });
    const shot = await page.evaluate(async () => {
      const src = document.querySelector('.modal.render [data-part="preview"]').src, img = new Image();
      img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data, n = d.length / 4;
      let other = 0, opaque = 0;   // nonBg: 배경(0xeef1f4)·바닥(0xdfe4e9) 근처가 아닌 화소(Task B 리뷰 측정과 같은 판정 — 보고용)
      const bins = new Map();       // drawn: 불투명 화소 중 가장 흔한 색(채널당 16단계로 묶은 칸)에서 먼 화소 — 빈 그림(한 색·투명)은 0이다
      for (let i = 0; i < d.length; i += 4) {
        const near = (r, gg, b) => Math.abs(d[i] - r) + Math.abs(d[i + 1] - gg) + Math.abs(d[i + 2] - b) < 24;
        if (!near(0xee, 0xf1, 0xf4) && !near(0xdf, 0xe4, 0xe9)) other++;
        if (d[i + 3] < 255) continue;
        opaque++;
        const k = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4), e = bins.get(k) ?? bins.set(k, [0, 0, 0, 0]).get(k);
        e[0]++; e[1] += d[i]; e[2] += d[i + 1]; e[3] += d[i + 2];
      }
      const top = [...bins.values()].sort((a, b) => b[0] - a[0])[0] ?? [1, 0, 0, 0], m = top.slice(1).map(v => v / top[0]);
      let drawn = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 255 && Math.abs(d[i] - m[0]) + Math.abs(d[i + 1] - m[1]) + Math.abs(d[i + 2] - m[2]) >= 24) drawn++;
      return { src, w: c.width, h: c.height, nonBg: +(other / n).toFixed(4), opaque: +(opaque / n).toFixed(4), drawn: +(drawn / n).toFixed(4) };
    });
    writeFileSync(resolve(out, '2b-render-2d.png'), Buffer.from(shot.src.split(',')[1], 'base64'));
    check('가져온 직후 2D 렌더샷이 비어 있지 않다', shot.w === 1280 && shot.h === 720 && shot.drawn >= SHOT_MIN,
      `${shot.w}×${shot.h} · ${shot.src.length} B · drawn ${shot.drawn} · opaque ${shot.opaque} · nonBg ${shot.nonBg}`);
    await page.click('.modal.render [name="close"]'); await page.waitForTimeout(200);
    await page.mouse.move(700, 380); for (let k = 0; k < 5; k++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(100); }
    await page.waitForTimeout(400); await page.screenshot({ path: resolve(out, '3-2d-zoom.png') });
    const b3 = await page.$('button:has-text("3D")');
    if (b3) { await b3.click(); await page.waitForTimeout(3000); await page.screenshot({ path: resolve(out, '4-3d.png') }); }
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500);
    check('새로고침 뒤 이어서 작업', /이어서 작업/.test(await page.evaluate(() => document.querySelector('#startScreen')?.innerText ?? '')));
    // 원 도면 배경(2026-10-13 · 계획 14 Task C): 트레이스(기본 켬)가 project.background(PNG dataURL)로 들어가 자동 저장본에 남는다 —
    // 워커 OffscreenCanvas 경로든 메인 폴백이든 같은 모양이다. 해시는 보고만 한다(같은 브라우저에서 두 경로가 같은 바이트 — 사전 검토 I-5).
    const bg = await page.evaluate(() => {
      try {
        const j = JSON.parse(localStorage.getItem('kvp.autosave')), b = (j?.project ?? j)?.background;
        if (!b?.src) return null;
        let h = 0; for (let i = 0; i < b.src.length; i++) h = (Math.imul(h, 31) + b.src.charCodeAt(i)) >>> 0;
        return { w: b.width, h: b.height, len: b.src.length, png: b.src.startsWith('data:image/png;base64,'), hash: h.toString(16) };
      } catch { return null; }
    });
    check('원 도면 배경이 붙었다', !!bg?.png && bg.w > 0 && bg.h > 0, bg ? `${bg.w}×${bg.h} · ${bg.len} B · #${bg.hash}` : '배경 없음');
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
