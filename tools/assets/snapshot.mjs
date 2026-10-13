// 에셋 검수 시트(2026-10-13 · 계획 15 Task D): 제품마다 아이템 하나를 앱 화면(프리뷰 빌드)에서 앞·뒤·좌·위 네 방향(2D 투영) + 원근 두 장으로 찍어
// tools/assets/snapshots/<id>.png 한 장(≤ 200 KB · 커밋)으로 붙인다. 사람이 본다 — 정면 방향 · 구멍 · 뒤집힌 면(뒷면이 비치는 곳).
//   npm run build && node tools/assets/snapshot.mjs [URL] [--only chair-dining,sofa-3] [--port 5196]
// URL을 주지 않으면 dist를 vite preview로 띄우고 끝에 내린다(browser.mjs). 결과는 제품마다 stdout JSON 한 줄, 실패가 있으면 종료 1.
//
// 왜 이 방식인가:
// - 장면은 자동 저장본 복원으로 넣고(window.__app은 개발 빌드 전용 — 사전 검토 I-4) 네 방향 카메라는 하단 바 `#viewPreset`(정면·배면·좌측·평면)이다 —
//   앱이 실제로 그리는 그대로(모델 맞춤·정면 규약·재질)를 본다. 모델 도착은 page.waitForResponse(models/<id>.glb) + 장면에 공유 메시(userData.shared)가 생겼는지로 본다.
// - 원근 두 장(앞·뒤 비스듬히)을 더한 이유: 정투영 앞·뒤는 단면 실루엣이라 앞뒤가 같은 모양인 제품의 정면을 못 가른다 — 2026-10-13 학생 책상(SchoolDesk_01)은
//   책 상자가 한쪽만 트였는데 정면도·배면도가 똑같았고, 원근으로 보니 트인 쪽(학생 자리)이 −Z라 sources.json front를 '-z'로 고쳐 다시 포장했다.
//   원근 카메라는 앱의 궤도(원근) 카메라를 clone해 제품 중심을 겨누고, 같은 장면을 같은 렌더러로 그린다.
// - 2D 투영은 벽을 모두 보인다(view3d prepFrame → showAllWalls): 정면도에서 앞벽이 제품을 가린다. 그래서 방의 벽은 높이 2 mm(스키마 하한)의
//   바닥 테두리로만 둔다 — 벽은 투영의 프레임(planBounds)과 바닥 판(방)을 만드는 데만 쓴다.
// - 천장 부착 제품(펜던트)은 천장이 보이지 않으므로(3D는 천장을 숨긴다) 바닥~천장 높이(층고 2300)의 가는 기둥을 옆(+X 300 · −Z 300 mm)에 세운다 —
//   기둥 윗면 = 천장이고 캐노피가 그 높이에 닿아야 한다. 투영 네 방향 어디서도 제품과 겹치지 않는 자리다.
// - 투영 자르기는 같은 장면에서 제품만 뺀 배경 장면과의 화소 차이로 잡는다(그림자 포함). 앱의 프레이밍 규칙(elevationFrame·planFrame·캔버스 비율)을
//   다시 계산하지 않아 그 규칙이 바뀌어도 어긋나지 않는다. 네 방향은 같은 화소 변(정사각)으로 잘라 축척을 맞춘다(입면과 평면 프레임은 수 % 다를 수 있다).
// - 캔버스 화소는 렌더러에서 직접 읽는다(__THREE_DEVTOOLS__로 잡은 렌더러로 같은 장면·카메라를 다시 그리고 toDataURL) — 요소 스크린샷은
//   캔버스 위의 DOM(버튼·토스트)까지 찍는다.
// - 시트는 sharp(devDependency · pack.mjs와 같다)로 붙이고 팔레트 PNG로 줄인다. 200 KB를 넘으면 색 수를 줄여 다시, 그래도 넘으면 실패.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { productById } from '../../src/products/catalog.js';
import { sheetLayout } from './lib.mjs';
import { launchChrome, startPreview, threeHook, makeProject, restoreProject, collectErrors } from './browser.mjs';

const argv = process.argv.slice(2), arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const OUT = fileURLToPath(new URL('./snapshots/', import.meta.url));
const MANIFEST = fileURLToPath(new URL('../../public/models/manifest.json', import.meta.url));
const MAX_BYTES = 200_000, CEILING = 2300;   // CEILING = createFloor 기본 층고(mm)
// 투영 네 방향 — 정면 규약(아키텍처 §19): 정면 +Z. 좌측도는 −X에서 +X를 보므로 화면 오른쪽이 +Z(정면), 평면도는 화면 위가 −Z라 정면이 아래다(pick3d DIRS·UPS).
const ORTHO = [
  ['front', '앞 — +Z에서 본다(정면)'], ['back', '뒤 — −Z에서 본다'],
  ['left', '좌 — −X에서 · 정면 → 화면 오른쪽'], ['top', '위 — 정면 ↓ 화면 아래'],
];
// 원근 두 장 [방위 °(0 = +Z 쪽에서 · 90 = +X 쪽에서), 고도 °, 이름].
const PERSP = [[35, 25, '앞 비스듬히 — 원근(+Z 쪽 · 위 25°)'], [215, 25, '뒤 비스듬히 — 원근(−Z 쪽 · 위 25°)']];
const LABELS = [...ORTHO.map(v => v[1]), ...PERSP.map(v => v[2])];
const man = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const only = arg('--only', null)?.split(',').filter(Boolean) ?? null;
const ids = Object.keys(man.products).filter(id => !only || only.includes(id));
if (!ids.length) { console.error(`snapshot: manifest에 해당 제품이 없다 — ${only?.join(', ')}`); process.exit(1); }

// 제품 하나 · 정사각 방(제품 큰 변 + 600 mm, 최소 2400) 가운데 · 회전 0. withItem=false면 배경(자르기 기준).
function sceneFor(id, withItem) {
  const p = productById(id), room = Math.max(2400, Math.ceil((Math.max(p.size[0], p.size[1]) + 600) / 100) * 100), c = room / 2;
  const items = withItem ? [{ productId: id, pos: [c, c] }] : [];
  if (p.attach === 'ceiling') items.push({ productId: 'column-square', pos: [c + 300, c - 300], size: [60, 60, CEILING] });
  const z = p.attach === 'ceiling' ? CEILING - p.size[2] : p.zDefault ?? 0;
  return { project: makeProject({ name: `snapshot ${id}`, room, wall: { thickness: 20, height: 2 }, items }), target: [c / 1000, (z + p.size[2] / 2) / 1000, c / 1000], ext: Math.max(...p.size) / 1000 };
}

// 렌더러의 마지막 render(장면, 카메라)를 기억한다(threeHook 뒤에 거는 초기화 스크립트). 원래 render는 __render로 남긴다(원근 그리기가 __last를 덮지 않게).
function rememberRender() {
  window.__THREE_DEVTOOLS__.addEventListener('observe', e => {
    const r = e.detail; if (!r?.isWebGLRenderer) return;
    const render = r.render.bind(r); r.__render = render; r.render = (s, c) => { r.__last = [s, c]; return render(s, c); };
  });
}
const png = url => { if (!url) throw new Error('렌더러가 아직 그리지 않았다'); return Buffer.from(url.split(',')[1], 'base64'); };
const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

// 투영: 프리셋을 고르고 두 프레임 기다린 뒤 렌더러가 마지막에 쓴 장면·카메라로 다시 그려 캔버스를 읽는다.
async function grabOrtho(page, view) {
  await page.selectOption('#viewPreset', view); await frames(page); await page.waitForTimeout(150);
  return png(await page.evaluate(() => {
    const r = window.__three.renderers.find(x => x.domElement.isConnected);
    return r.__last ? (r.__render(...r.__last), r.domElement.toDataURL('image/png')) : null;
  }));
}
// 원근: 앱 궤도 카메라의 clone(window.__persp)으로 제품 중심을 겨눠 캔버스 왼쪽 아래 정사각 영역에 그리고 그 영역만 읽는다(뷰포트는 되돌린다).
async function grabPersp(page, [az, el], target, ext) {
  return png(await page.evaluate(({ az, el, target, ext }) => {
    const r = window.__three.renderers.find(x => x.domElement.isConnected), cam = window.__persp.clone(), fov = 30;
    const a = az * Math.PI / 180, e = el * Math.PI / 180, d = (ext / (2 * Math.tan(fov * Math.PI / 360))) * 1.35;
    Object.assign(cam, { fov, aspect: 1, near: 0.05, far: 100, zoom: 1 });
    cam.position.set(target[0] + d * Math.sin(a) * Math.cos(e), target[1] + d * Math.sin(e), target[2] + d * Math.cos(a) * Math.cos(e));
    cam.lookAt(target[0], target[1], target[2]); cam.updateProjectionMatrix();
    const W = r.domElement.width, H = r.domElement.height, s = Math.min(W, H), pr = r.getPixelRatio();
    r.setViewport(0, 0, s / pr, s / pr); r.__render(r.__last[0], cam);
    const out = document.createElement('canvas'); out.width = out.height = s;
    out.getContext('2d').drawImage(r.domElement, 0, H - s, s, s, 0, 0, s, s);
    r.setViewport(0, 0, W / pr, H / pr);
    return out.toDataURL('image/png');
  }, { az, el, target, ext }));
}

async function shots(browser, url, id, withItem) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  const errors = collectErrors(page);
  try {
    await page.addInitScript(threeHook); await page.addInitScript(rememberRender);
    const { project, target, ext } = sceneFor(id, withItem);
    await restoreProject(page, url, project);
    let glb = null; const persp = [];
    if (withItem) {
      // 2D → 3D(원근): 첫 리빌드가 모델을 요청한다. 응답 대기와 클릭을 Promise.all로 묶는다(2026-10-13 · 리뷰 I-2) — 예전처럼 대기 약속을
      // 따로 만들어 두면 클릭이 실패할 때 그 약속의 거절이 처리되지 않아 Node가 finally(server.stop)를 못 돌고 끝나 vite가 고아로 남았다.
      const [r] = await Promise.all([page.waitForResponse(x => new RegExp(`models/${id}\\.glb$`).test(x.url()), { timeout: 30000 }), page.click('[data-mode="iso"]')]);
      glb = { status: r.status(), bytes: (await r.body()).length };
      if (glb.status !== 200) throw new Error(`models/${id}.glb HTTP ${glb.status}`);
      await page.waitForFunction(() => window.__three.scenes.some(s => { let n = 0; s.traverse(o => { if (o.isMesh && o.userData.shared) n++; }); return n > 0; }), null, { timeout: 15000 });
      await frames(page);
      const ok = await page.evaluate(() => { const r = window.__three.renderers.find(x => x.domElement.isConnected); window.__persp = r.__last?.[1]?.clone(); return !!window.__persp?.isPerspectiveCamera; });
      if (!ok) throw new Error('3D 궤도 카메라가 원근이 아니다');
      for (const v of PERSP) persp.push(await grabPersp(page, v, target, ext));
    }
    const ortho = [];
    for (const [v] of ORTHO) ortho.push(await grabOrtho(page, v));
    return { ortho, persp, glb, errors };
  } finally { await page.close(); }
}

// 배경과의 차이(RGB 합 > 36)가 있는 화소의 상자. 없으면 null.
function diffBox(a, b, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 36) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
const raw = async buf => { const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function sheet(id, item, bg) {
  const imgs = await Promise.all(item.ortho.map(raw)), bgs = await Promise.all(bg.ortho.map(raw));
  const boxes = imgs.map((m, i) => diffBox(m.data, bgs[i].data, m.w, m.h));
  if (boxes.some(b => !b)) throw new Error(`배경과 차이가 없는 방향 — ${ORTHO.filter((_, i) => !boxes[i]).map(v => v[0]).join(', ')}`);
  const { w, h } = imgs[0];
  const side = Math.min(w, h, Math.round(Math.max(...boxes.map(b => Math.max(b.x1 - b.x0, b.y1 - b.y0))) * 1.2 + 32));
  const { cols, rows, cell } = sheetLayout(LABELS.length), head = 64, W = cols * cell, H = head + rows * cell;
  const clamp = (v, max) => Math.max(0, Math.min(max - side, v));
  const tiles = await Promise.all([
    ...boxes.map((b, i) => sharp(item.ortho[i]).extract({ left: clamp(Math.round((b.x0 + b.x1 - side) / 2), w), top: clamp(Math.round((b.y0 + b.y1 - side) / 2), h), width: side, height: side }).resize(cell, cell).png().toBuffer()),
    ...item.persp.map(buf => sharp(buf).resize(cell, cell).png().toBuffer()),
  ]);
  const e = man.products[id], p = productById(id);
  const note = p.attach === 'ceiling' ? ` · 옆 기둥 윗면 = 천장(층고 ${CEILING})` : '';
  const text = (x, y, s, size = 15, fill = '#111', weight = 400) => `<text x="${x}" y="${y}" font-family="Malgun Gothic, Segoe UI, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(s)}</text>`;
  const at = i => [(i % cols) * cell, head + Math.floor(i / cols) * cell];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${text(10, 24, `${id} · ${p.name} · ${p.size.join('×')} mm (w×d×h)`, 18, '#111', 700)}
    ${text(10, 50, `${e.source?.url ?? ''} · 삼각형 ${e.tris} · ${Math.round(e.bytes / 1000)} KB · fit ${e.fit.join('/')} · sha256 ${e.sha256.slice(0, 8)}${note}`, 13, '#444')}
    ${LABELS.map((label, i) => text(at(i)[0] + 8, at(i)[1] + 20, label, 14, '#1d4ed8', 700)).join('')}
    ${Array.from({ length: cols - 1 }, (_, k) => `<line x1="${(k + 1) * cell}" y1="${head}" x2="${(k + 1) * cell}" y2="${H}" stroke="#9ca3af" stroke-width="2"/>`).join('')}
    ${Array.from({ length: rows }, (_, k) => `<line x1="0" y1="${head + k * cell}" x2="${W}" y2="${head + k * cell}" stroke="#9ca3af" stroke-width="2"/>`).join('')}
  </svg>`;
  const flat = await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
    .composite([...tiles.map((t, i) => ({ input: t, left: at(i)[0], top: at(i)[1] })), { input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer();
  for (const colors of [256, 128, 64]) {
    const out = await sharp(flat).png({ palette: true, colors, dither: 1, effort: 10, compressionLevel: 9 }).toBuffer();
    if (out.length <= MAX_BYTES) return { png: out, colors, side };
  }
  throw new Error(`시트가 ${MAX_BYTES} B를 넘는다(64색에서도)`);
}

const server = await startPreview({ url: argv.find(a => /^https?:/.test(a)) ?? null, port: +arg('--port', 5196) });
let failed = 0;
try {
  const browser = await launchChrome({ headless: true });
  try {
    mkdirSync(OUT, { recursive: true });
    for (const id of ids) {
      try {
        const bg = await shots(browser, server.url, id, false), it = await shots(browser, server.url, id, true);
        const { png: out, colors, side } = await sheet(id, it, bg);
        writeFileSync(`${OUT}${id}.png`, out);
        const errors = [...bg.errors, ...it.errors];
        if (errors.length) failed++;
        console.log(JSON.stringify({ id, sheet: `tools/assets/snapshots/${id}.png`, bytes: out.length, colors, cropPx: side, glb: it.glb, errors }));
      } catch (err) { failed++; console.log(JSON.stringify({ id, error: String(err?.message ?? err).slice(0, 300) })); }
    }
  } finally { await browser.close(); }
} finally { await server.stop(); }
process.exit(failed ? 1 : 0);
