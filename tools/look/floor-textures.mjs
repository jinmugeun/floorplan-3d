// 바닥 코팅 텍스처 생성(계획 18) — 외부 다운로드 없음 · 시드 고정(같은 입력이면 같은 파일).
//   node tools/look/floor-textures.mjs [출력 폴더]   (기본 public/textures)
// 시안 app/.superpowers/sdd/scratch/floor-colors/gen.mjs(2026-10-21 시안 2판)를 옮긴 것이다. 견본 그림(사용자가 준 제조사 견본 캡처)은
// 저장소 밖이라, 시안 sample.mjs가 뽑은 팔레트(palette.json의 mma[].chips 중 생성에 쓰는 값)를 아래 MMA_PALETTE 상수로 둔다.
// - MMA 5색: 바탕색 + 칩 무리 d2·d1·l1·l2(색·덮임 비율)로 잘고 또렷한 칩 색 지도를 그린다 → mma-<색>/color.webp
// - mma-grit: 규사 알갱이 높이장 → 법선·거칠기(MMA 5색 + 그레이 칩 에폭시 공용)
// - ud200: 거의 흰 바탕 + 굵은 골재 요철 법선 + 높은 거칠기(UD200 5색 공용 · 색은 카탈로그 tint)
// 모든 높이장은 이음매 없이 반복된다(감싸는 좌표로 그리고 감싸는 흐림). 출처는 public/textures/NOTICE.md. 결과를 커밋한다 — 앱은 이 도구를 돌리지 않는다.
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = `${resolve(process.argv[2] ?? `${ROOT}public/textures`)}/`;

// 시안 palette.json mma[].chips(sample.mjs chipPalette) — 순수 바탕색 · 바탕 무리 밝기 σ · 칩 무리(rgb 평균 · frac 덮임 · core 진한 칩 심 색). 순서가 시드(3100 + i)다.
const MMA_PALETTE = [
  { id: 'mma-darkgray', pureBase: [131.4, 134.7, 142.9], baseSigma: 11.9,
    classes: { d2: { rgb: [59.9, 61.8, 65.4], frac: 0.0364, core: [49, 51, 54.1] },
               d1: { rgb: [89.1, 91.1, 96.1], frac: 0.0754 },
               l1: { rgb: [170.8, 175.3, 184.8], frac: 0.0828 },
               l2: { rgb: [202, 207.3, 215.9], frac: 0.0193, core: [212.4, 218.1, 226.2] } } },
  { id: 'mma-gray', pureBase: [195.7, 197, 203.2], baseSigma: 10.5,
    classes: { d2: { rgb: [96, 96.3, 99.2], frac: 0.0787, core: [65, 65.2, 67.1] },
               d1: { rgb: [159.5, 158.8, 162.6], frac: 0.061 },
               l1: { rgb: [223.3, 225.1, 230.9], frac: 0.044 },
               l2: { rgb: [247.9, 247, 248.4], frac: 0.0013, core: [252.1, 252, 252.8] } } },
  { id: 'mma-black', pureBase: [48.8, 48.9, 50.3], baseSigma: 14.8,
    classes: { d1: { rgb: [18.6, 18, 19], frac: 0.0005 },
               l1: { rgb: [111, 113.6, 120.6], frac: 0.1049 },
               l2: { rgb: [163.9, 168.1, 177.4], frac: 0.0705, core: [190.3, 194.1, 202.7] } } },
  { id: 'mma-beige', pureBase: [169.1, 132.6, 84.6], baseSigma: 16.3,
    classes: { d2: { rgb: [52.7, 44.2, 34.6], frac: 0.0211, core: [40.8, 34.5, 27.4] },
               d1: { rgb: [90.3, 75, 57], frac: 0.0803 },
               l1: { rgb: [199.9, 187.3, 175.5], frac: 0.1039 },
               l2: { rgb: [222.7, 221.8, 224.3], frac: 0.0036, core: [231.2, 231.2, 233.6] } } },
  { id: 'mma-yellow', pureBase: [197.5, 187.7, 174.5], baseSigma: 14.7,
    classes: { d2: { rgb: [82.3, 78.7, 74.6], frac: 0.0731, core: [59.9, 57.7, 55.1] },
               d1: { rgb: [142.5, 132.8, 121.3], frac: 0.0683 },
               l1: { rgb: [221.3, 219.9, 216.2], frac: 0.0187 } } },
];

// ── 공용 ─────────────────────────────────────────────
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const wrap = (i, n) => ((i % n) + n) % n;
function boxBlurWrap(src, W, H, r) {           // 가로·세로 상자 흐림(감쌈) 한 번
  if (r <= 0) return src;
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), k = 2 * r + 1;
  for (let y = 0; y < H; y++) { let s = 0; for (let i = -r; i <= r; i++) s += src[y * W + wrap(i, W)]; for (let x = 0; x < W; x++) { tmp[y * W + x] = s / k; s += src[y * W + wrap(x + r + 1, W)] - src[y * W + wrap(x - r, W)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let i = -r; i <= r; i++) s += tmp[wrap(i, H) * W + x]; for (let y = 0; y < H; y++) { out[y * W + x] = s / k; s += tmp[wrap(y + r + 1, H) * W + x] - tmp[wrap(y - r, H) * W + x]; } }
  return out;
}
const gaussWrap = (a, W, H, r, n = 3) => { let o = a; for (let i = 0; i < n; i++) o = boxBlurWrap(o, W, H, r); return o; };
function noise(W, H, r, rand) {                 // 흐린 흰 잡음 → 평균 0 · 표준편차 1
  const a = new Float32Array(W * H); for (let i = 0; i < a.length; i++) a[i] = rand() - 0.5;
  const b = r > 0 ? gaussWrap(a, W, H, r) : a; return normalize(b);
}
function normalize(a) { let m = 0; for (const v of a) m += v; m /= a.length; let s = 0; for (const v of a) s += (v - m) ** 2; s = Math.sqrt(s / a.length) || 1; const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = (a[i] - m) / s; return o; }
// 불규칙한 돌 모양 돔(감쌈). mode 'max' = 골재가 수지 위로 솟음, 'sub' = 패인 곳
function blob(h, W, H, cx, cy, r, amp, rand, mode = 'max', power = 0.8) {
  const p1 = rand() * 6.283, p2 = rand() * 6.283, a2 = 0.12 + rand() * 0.2, a3 = rand() * 0.15, R = Math.ceil(r * 1.4) + 1;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.hypot(dx, dy); if (d > R) continue;
    const th = Math.atan2(dy, dx), rr = r * (1 + a2 * Math.sin(2 * th + p1) + a3 * Math.sin(3 * th + p2));
    if (d >= rr) continue;
    const v = amp * (1 - (d / rr) ** 2) ** power, i = wrap(cy + dy, H) * W + wrap(cx + dx, W);
    if (mode === 'max') { if (v > h[i]) h[i] = v; } else h[i] -= v;
  }
}
// 높이(mm) → OpenGL 법선(+V = 그림 위쪽 = 초록). n = normalize(−dh/du, −dh/dv, 1). three 텍스처 flipY → 그림 행이 늘면 v가 준다.
function normalMap(h, W, H, texelMm, gain = 1) {
  const out = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (h[y * W + wrap(x + 1, W)] - h[y * W + wrap(x - 1, W)]) / (2 * texelMm);
    const drow = (h[wrap(y + 1, H) * W + x] - h[wrap(y - 1, H) * W + x]) / (2 * texelMm);
    let nx = -dx * gain, ny = drow * gain, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * W + x) * 3; out[o] = Math.round((nx * 0.5 + 0.5) * 255); out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255); out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
  }
  return out;
}
const gray = (a, f) => { const o = Buffer.alloc(a.length * 3); for (let i = 0; i < a.length; i++) { const v = Math.max(0, Math.min(255, Math.round(f(a[i], i) * 255))); o[i * 3] = o[i * 3 + 1] = o[i * 3 + 2] = v; } return o; };
function resizeF(a, W, H, W2) {                 // 정사각 평균 축소(정수 배)
  const k = W / W2, o = new Float32Array(W2 * W2);
  for (let y = 0; y < W2; y++) for (let x = 0; x < W2; x++) { let s = 0; for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) s += a[(y * k + j) * W + x * k + i]; o[y * W2 + x] = s / (k * k); }
  return o;
}
const sizes = [];
async function save(buf, W, H, dir, name, opts) {
  mkdirSync(`${OUT}${dir}`, { recursive: true });
  const out = `${OUT}${dir}/${name}.webp`;
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).webp({ effort: 6, ...opts }).toFile(out);
  const n = statSync(out).size; sizes.push([`${dir}/${name}.webp`, W, n]);
}

// ── 1. MMA 5색 — 절차적 '소금후추' 칩 ──────────────────
// 2배 크기(2048²)에 이음매 없이(감싸는 좌표) 각진 다각형 칩을 그린 뒤 2×2 평균으로 줄여 가장자리를 다듬는다. 한 장 = 1.2 m(mma-grit과 같은 반복).
// 칩 지름(로그정규 중앙값): 진한 칩 8 mm · 중간 칩 6 mm(3.5~16 mm) — 실물(1~3 mm)의 3~4배. 가까운 카메라(≈ 3.6 mm/화소)에서 참고 띠처럼 2~3화소 점으로 읽히게.
const MMA_PX = 1024, MMA_Q = 80, SS = 2;
const CHIP = { strongMed: 8, midMed: 6, spread: 0.35, min: 3.5, max: 16, grain: 0.55, shade: 0.07, coverScale: 1.25 };   // coverScale: 사진 흐림으로 문턱 밑에 묻힌 잔 칩 몫(참고 띠와 나란히 보고 정함)
const lumOf = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
function inPoly(x, y, vs) { let c = false; for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) { const [xi, yi] = vs[i], [xj, yj] = vs[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
{
  const W2 = MMA_PX * SS, pxmm = W2 / 1200;
  for (const [mi, m] of MMA_PALETTE.entries()) {
    const rand = rng(3100 + mi), C = m.classes, base = m.pureBase;
    const randn = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(6.2832 * rand());
    const img = new Float32Array(W2 * W2 * 3), label = new Uint8Array(W2 * W2);
    // 바탕 + 잔 모래결(바탕 무리 밝기 σ의 grain 배, 곱셈)
    const gr = noise(W2, W2, 2, rand), amp = CHIP.grain * m.baseSigma / Math.max(20, lumOf(base));
    for (let i = 0; i < W2 * W2; i++) for (let j = 0; j < 3; j++) img[i * 3 + j] = base[j] * (1 + amp * gr[i]);
    const KEYS = ['d1', 'l1', 'd2', 'l2'];          // 중간 칩 먼저, 진한 칩을 위에
    for (const [ki, k] of KEYS.entries()) {
      const c = C[k]; if (!c || c.frac < 0.002) continue;
      const strong = k === 'd2' || k === 'l2', col = strong ? (c.core ?? c.rgb) : c.rgb, med = strong ? CHIP.strongMed : CHIP.midMed, li = ki + 1;
      const target = c.frac * CHIP.coverScale * W2 * W2; let covered = 0;
      while (covered < target) {
        const d = Math.min(CHIP.max, Math.max(CHIP.min, Math.exp(Math.log(med) + CHIP.spread * randn()))), R = (d / 2) * pxmm;
        const asp = 0.55 + rand() * 0.45, rot = rand() * 6.2832, nv = 5 + Math.floor(rand() * 4), cr = Math.cos(rot), sr = Math.sin(rot);
        const vs = Array.from({ length: nv }, (_, q) => { const t = ((q + rand() * 0.7) / nv) * 6.2832, r = R * (0.65 + rand() * 0.35), x = Math.cos(t) * r, y = Math.sin(t) * r * asp; return [x * cr - y * sr, x * sr + y * cr]; });
        const sh = 1 + CHIP.shade * (rand() * 2 - 1), cx = Math.floor(rand() * W2), cy = Math.floor(rand() * W2), B = Math.ceil(R) + 1;
        for (let dy = -B; dy <= B; dy++) for (let dx = -B; dx <= B; dx++) {
          if (!inPoly(dx + 0.5, dy + 0.5, vs)) continue;
          const i = wrap(cy + dy, W2) * W2 + wrap(cx + dx, W2);
          if (label[i] !== li) { covered++; label[i] = li; }
          for (let j = 0; j < 3; j++) img[i * 3 + j] = col[j] * sh;
        }
      }
    }
    // 실제 덮임(나중 칩이 앞 칩을 덮은 뒤) — 보고용
    const cov = {}; for (const [ki, k] of KEYS.entries()) { let n = 0; for (let i = 0; i < label.length; i++) if (label[i] === ki + 1) n++; if (n) cov[k] = +(n / label.length).toFixed(4); }
    const buf = Buffer.alloc(MMA_PX * MMA_PX * 3);
    for (let y = 0; y < MMA_PX; y++) for (let x = 0; x < MMA_PX; x++) for (let j = 0; j < 3; j++) {
      let s = 0; for (let b = 0; b < SS; b++) for (let a = 0; a < SS; a++) s += img[((y * SS + b) * W2 + x * SS + a) * 3 + j];
      buf[(y * MMA_PX + x) * 3 + j] = Math.max(0, Math.min(255, Math.round(s / (SS * SS))));
    }
    // 품질은 80에서 시작해 250 KB 이하가 될 때까지 4씩 내린다(색 지도 하나 ≤ 250 KB 목표)
    for (let q = MMA_Q; ; q -= 4) { await save(buf, MMA_PX, MMA_PX, m.id, 'color', { quality: q, smartSubsample: true }); const last = sizes[sizes.length - 1]; if (last[2] <= 250000 || q <= 50) { last.push(q); break; } sizes.pop(); }
    console.log(`${m.id} 칩 덮임 목표 ${JSON.stringify(Object.fromEntries(KEYS.filter(k => C[k]).map(k => [k, C[k].frac])))} → 생성 ${JSON.stringify(cov)}`);
  }
}

// ── 2. MMA 규사 알갱이(5색 + 그레이 칩 에폭시 공용) — 1024² · 한 장 = 1.2 m → 1.17 mm/텍셀 ──────
{
  const W = 1024, texel = 1200 / W, rand = rng(1717);
  const h = new Float32Array(W * W);
  // 알갱이: 지름 ≈ 2~6 mm(실물 규사 0.5~1.5 mm의 약 3~4배 — 가까운 카메라에서 읽히게), 덮임 ≈ 55 %
  for (let n = 0; n < 70000; n++) { const r = 0.9 + rand() ** 1.5 * 1.7; blob(h, W, W, Math.floor(rand() * W), Math.floor(rand() * W), r, r * texel * (0.28 + rand() * 0.22), rand, 'max', 0.7); }
  const fine = noise(W, W, 1, rand), mid = noise(W, W, 6, rand);
  for (let i = 0; i < h.length; i++) h[i] += 0.06 * fine[i] + 0.05 * mid[i];
  const hs = gaussWrap(h, W, W, 1, 1);           // 수지 코팅이 모서리를 조금 덮는다
  await save(normalMap(hs, W, W, texel, 1), W, W, 'mma-grit', 'normal', { quality: 80 });
  // 거칠기: 알갱이 꼭대기(석영) 0.8 · 사이(수지) 1.0 — 재질 roughness가 곱한다
  const R2 = 256, hr = resizeF(hs, W, W, R2); let mx = 0; for (const v of hr) mx = Math.max(mx, v);
  await save(gray(hr, v => 1 - 0.2 * Math.max(0, Math.min(1, v / (mx * 0.8)))), R2, R2, 'mma-grit', 'rough', { quality: 80 });
}

// ── 3. Ucrete UD200(5색 공용) — 1024² · 한 장 = 1.0 m → 1 mm/텍셀 ──────
const UD = { lumps: 4200, rMin: 3.5, rSpan: 8, hMin: 0.35, hSpan: 0.3, power: 0.55, und: 0.3, mid: 0.2, albedoBump: 0.03, ao: 0.12 };
{
  const W = 1024, texel = 1000 / W, rand = rng(2026);
  const h = new Float32Array(W * W);
  // 골재 덩어리: 지름 ≈ 6~20 mm(실물 2~6 mm의 약 3배 — 가까운 카메라에서 2~6화소로 읽히게), 덮임 ≈ 35 %, 높이 ≈ 지름의 0.2~0.3
  for (let n = 0; n < UD.lumps; n++) { const r = UD.rMin + rand() ** 2 * UD.rSpan; blob(h, W, W, Math.floor(rand() * W), Math.floor(rand() * W), r, r * texel * (UD.hMin + rand() * UD.hSpan), rand, 'max', UD.power); }
  // 작은 알갱이(덩어리 사이 거친 바탕)
  for (let n = 0; n < 26000; n++) { const r = 1 + rand() * 1.5; blob(h, W, W, Math.floor(rand() * W), Math.floor(rand() * W), r, r * texel * 0.35, rand, 'max', 0.8); }
  // 핀홀·패인 곳
  for (let n = 0; n < 900; n++) { const r = 1.2 + rand() * 2; blob(h, W, W, Math.floor(rand() * W), Math.floor(rand() * W), r, 0.5 + rand() * 0.5, rand, 'sub', 1); }
  const und = noise(W, W, 22, rand), und2 = noise(W, W, 7, rand), fine = noise(W, W, 1, rand);
  const mid3 = noise(W, W, 3, rand);
  for (let i = 0; i < h.length; i++) h[i] += UD.und * und[i] + 0.3 * und2[i] + UD.mid * mid3[i] + 0.08 * fine[i];   // 흙손 물결 ±0.9 mm · 잔결
  const hs = gaussWrap(h, W, W, 1, 2);           // 수지가 골재 모서리를 감싼다
  await save(normalMap(hs, W, W, texel, 1), W, W, 'ud200', 'normal', { quality: 82 });
  // 바탕색(512²): 거의 흰색. 덩어리 꼭대기 조금 밝게 · 패인 곳 어둡게 · 작은 얼룩(골재 색) ±
  const C = 512, hc = resizeF(hs, W, W, C), hp = gaussWrap(hc, C, C, 6), speck = new Float32Array(C * C), r2 = rng(99);
  for (let n = 0; n < 5000; n++) blob(speck, C, C, Math.floor(r2() * C), Math.floor(r2() * C), 0.8 + r2() * 1.4, (r2() < 0.5 ? -1 : 1) * (0.04 + r2() * 0.08), r2, 'sub', 0.5);
  const mott = noise(C, C, 18, r2);
  const col = Buffer.alloc(C * C * 3);
  for (let i = 0; i < C * C; i++) {
    const hi = hc[i] - hp[i];                    // 높낮이(골재 위 +)
    const occ = Math.max(0, Math.min(1, -hi / 1.2));   // 골재 사이 골(주변보다 낮은 곳) — 굽힌 차폐로 요철이 멀리서도 읽힌다
    const v = 0.95 * (1 + UD.albedoBump * Math.tanh(hi / 0.8) + speck[i] + 0.025 * mott[i]) * (1 - UD.ao * occ);
    const s = Math.round(Math.max(0, Math.min(1, v)) * 255); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = s;
  }
  await save(col, C, C, 'ud200', 'color', { quality: 80 });
  // 거칠기(512²): 꼭대기 0.85(조금 닳음) · 바탕 0.98 — 시멘트계 반무광(꼭대기가 금속처럼 반짝이지 않게)
  const rough = gray(hc, (v, i) => 0.98 - 0.13 * Math.max(0, Math.min(1, (v - hp[i]) / 1.2)));
  await save(rough, C, C, 'ud200', 'rough', { quality: 80 });
}

let total = 0; for (const [f, w, n, q] of sizes) { total += n; if (q) process.stdout.write(`(q${q}) `); console.log(`${f.padEnd(26)} ${String(w).padStart(4)}²  ${n.toLocaleString().padStart(9)} B`); }
console.log(`합계 ${total.toLocaleString()} B → ${OUT}`);
