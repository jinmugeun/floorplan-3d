// 벽 타일 배열 텍스처 생성(계획 19) — 외부 다운로드 없음 · 시드 고정(같은 입력이면 같은 파일).
//   node tools/look/tile-textures.mjs [출력 폴더]   (기본 public/textures — 승인본을 덮어쓴다. 재현 확인은 임시 폴더로)
// 시안 app/.superpowers/sdd/scratch/tile-look/gen.mjs(2026-10-21)를 옮긴 것이다. 바뀐 곳은 출력 폴더(인자 · tile-<배열>) · 끈 조정 손잡이
// (--only · DITHER · NENC — 승인본 설정으로 고정) · sizes.json 안 씀뿐이다. 난수 호출 순서와 수식은 그대로다.
// 섞음 색(MIXES)은 사용자가 준 쉬트라인 상품 페이지 사진에서 시안 sample.mjs가 뽑은 표본이다(사진은 저장소 밖 — 색 숫자만 여기와 카탈로그 tint에 남는다).
//
// 배열 하나 = 세 장(공용):
//   color.webp  — 거의 흰 무채색(선형 0.80) 면 + 조각마다 미세한 밝기 차 + 줄눈 자리(같은 0.80 × 줄눈 그늘). 색은 재질 tint가, 줄눈 색은 groutColor가 칠한다
//                 (src/materials/grout.js: albedo = map.rgb × mix(groutColor, tint, 면 마스크)).
//   normal.webp — 높이장(mm) → OpenGL 법선. 줄눈은 depth만큼 패이고, 조각 테두리는 반지름 edgeR의 사분원으로 둥글게 내려가며, 면은 pillow만큼 살짝 부풀고
//                 조각마다 tilt(°)만큼 기울어(시트에 붙인 조각이 조금씩 다른 각도) 광택 반사가 조각마다 갈린다.
//   rough.webp  — R = 면 마스크(1 면 · 0 줄눈) · G = 거칠기(면 0.10 × 조각 차 · 줄눈 0.95) · B = 면 마스크(금속 재질의 metalnessMap). 무손실.
//                 three는 roughness × map.g를 1로 자르므로 재질 roughness R = 면 거칠기 ÷ 0.10 (유광 1 → 0.10 · 무광 5.5 → 0.55)이고
//                 줄눈은 R ≥ 1이면 언제나 min(1, 0.95R) ≥ 0.95다 — 한 장으로 유광·무광을 다 낸다.
// 모든 장은 이음매 없이 반복된다(감싸는 좌표 · 감싸는 흐림). 2배로 그려 2×2 평균으로 줄인다(테두리 계단 방지). 출처는 public/textures/NOTICE.md.
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = `${resolve(process.argv[2] ?? `${ROOT}public/textures`)}/`;

const FACE_LIN = 0.80;          // 색 지도 면·줄눈의 기준 밝기(선형) — sRGB 231. tint·groutColor = 원하는 선형 색 ÷ 0.80
const FACE_ROUGH = 0.10;        // 거칠기 지도의 면 값 — 재질 roughness가 곱해진다
const GROUT_ROUGH = 0.95;

// 한 장에 든 조각 수는 텍스처 화소(1024)를 2의 거듭제곱으로 나누게 고른다(조각 64·128·256 px · 육각 열·행 128 px): 밉맵을 반씩 줄여도 줄눈 주기가 화소에
// 맞아떨어져 먼 거리 밉 단계에 물결무늬(맥놀이)가 구워지지 않는다(시안 v3 방 보기에서 12조각/1024 px = 85.3 px의 25 mm가 계단 무늬를 냈다).
// 배열 정의. pitch = 조각 중심 간격(mm, 조각 + 줄눈) · n = 한 장(텍스처 반복)에 든 조각 수 · grout = 줄눈 폭 · depth = 줄눈 깊이 · edgeR = 테두리 둥근 반지름 ·
// cornerR = 평면에서 본 모서리 반지름 · pillow = 면 부풂(mm) · tilt = 조각 기울기 σ(°) · jitter = 조각 자리 흔들림 σ(mm) · tone = 조각 밝기 차 σ ·
// ao = 줄눈 그늘(테두리 쪽 어두움) · seed. 카탈로그의 scale(조각 간격) × tiles(한 장의 조각 수)가 한 장 크기다(src/materials/catalog.js LAYOUT).
const LAYOUTS = {
  sq25: { kind: 'square', pitch: [25, 25], n: [16, 16], px: 1024, grout: 2.0, depth: 1.0, edgeR: 1.4, cornerR: 1.6, pillow: 0.12, tilt: 0.3, jitter: 0.22, tone: 0.03, ao: 0.32, seed: 2501 },
  sq48: { kind: 'square', pitch: [50, 50], n: [8, 8], px: 1024, grout: 2.0, depth: 1.2, edgeR: 1.8, cornerR: 2.0, pillow: 0.2, tilt: 0.2, jitter: 0.28, tone: 0.02, ao: 0.32, seed: 4801 },
  sq97: { kind: 'square', pitch: [100, 100], n: [8, 8], px: 1024, grout: 3.0, depth: 1.4, edgeR: 2.0, cornerR: 2.5, pillow: 0.25, tilt: 0.22, jitter: 0.35, tone: 0.02, ao: 0.3, seed: 9701 },
  // 육각: 평평한 변이 위·아래(쉬트라인 G09·G10 사진과 같은 방향). 맞변 거리 F = 50(제품 '5 × 5.8 cm') · 줄눈 2.5 → 맞변 간격 52.5 · 열 간격 1.5 × 52.5/√3 = 45.47
  hex50: { kind: 'hex', F: 50, grout: 2.5, cols: 8, rows: 8, px: 1024, depth: 1.2, edgeR: 1.6, cornerR: 1.6, pillow: 0.18, tilt: 0.3, jitter: 0.28, tone: 0.025, ao: 0.32, seed: 5001 },
  // 대형: 줄눈 2 mm · 얕게 · 모서리 미세 면취(정사각 컷 포세린)
  lg300: { kind: 'square', pitch: [300, 300], n: [2, 2], px: 1024, grout: 2.0, depth: 0.8, edgeR: 0.9, cornerR: 0.6, pillow: 0.06, tilt: 0.06, jitter: 0.2, tone: 0.012, ao: 0.2, seed: 30001 },
  lg600: { kind: 'square', pitch: [600, 600], n: [2, 2], px: 1024, grout: 2.0, depth: 0.8, edgeR: 0.7, cornerR: 0.6, pillow: 0.08, tilt: 0.05, jitter: 0.2, tone: 0.01, ao: 0.2, seed: 60001, speckle: true },
};
// 섞음 색 지도(조각 배치는 배열과 같다 — 같은 시드로 같은 조각 번호). colors = sRGB(쉬트라인 사진 표본) · frac = 비율 · rule 'random' | 'check'
const MIXES = {
  'sq25-bluemix': { layout: 'sq25', rule: 'random', colors: [['#467daa', 0.3], ['#78aec7', 0.35], ['#b0cdd5', 0.35]], seed: 777 },   // A07 C25MB01 k-평균 세 무리
  'sq48-check': { layout: 'sq48', rule: 'check', colors: [['#0c0c08', 0.5], ['#e7e8ef', 0.5]], seed: 778 },                              // B05 4802-18 (흰색은 밝기만 240으로)
};
const MIX_SCALE = 0.9;          // 섞음 지도: 선형 색 × 0.9로 넣고 tint(회색 1/0.9)로 노출을 맞춘다

// ── 공용(floor-textures.mjs와 같은 것) ─────────────────────
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const wrap = (i, n) => ((i % n) + n) % n;
function boxBlurWrap(src, W, H, r) {
  if (r <= 0) return src;
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), k = 2 * r + 1;
  for (let y = 0; y < H; y++) { let s = 0; for (let i = -r; i <= r; i++) s += src[y * W + wrap(i, W)]; for (let x = 0; x < W; x++) { tmp[y * W + x] = s / k; s += src[y * W + wrap(x + r + 1, W)] - src[y * W + wrap(x - r, W)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let i = -r; i <= r; i++) s += tmp[wrap(i, H) * W + x]; for (let y = 0; y < H; y++) { out[y * W + x] = s / k; s += tmp[wrap(y + r + 1, H) * W + x] - tmp[wrap(y - r, H) * W + x]; } }
  return out;
}
const gaussWrap = (a, W, H, r, n = 3) => { let o = a; for (let i = 0; i < n; i++) o = boxBlurWrap(o, W, H, r); return o; };
function normalize(a) { let m = 0; for (const v of a) m += v; m /= a.length; let s = 0; for (const v of a) s += (v - m) ** 2; s = Math.sqrt(s / a.length) || 1; const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = (a[i] - m) / s; return o; }
function noise(W, H, r, rand) { const a = new Float32Array(W * H); for (let i = 0; i < a.length; i++) a[i] = rand() - 0.5; return normalize(r > 0 ? gaussWrap(a, W, H, r) : a); }
const randnOf = rand => () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(6.2832 * rand());
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const toLin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb8 = v => { v = clamp(v, 0, 1); return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255); };
const hexLin = h => [1, 3, 5].map(i => toLin(parseInt(h.slice(i, i + 2), 16)));
// 높이(mm) → OpenGL 법선(+V = 그림 위쪽 = 초록). 텍셀 크기를 축마다 따로(육각 장은 1 % 직사각).
// 8비트 반올림 전에 ±1/2 LSB 삼각 잡음 — 매끈한 부풂(±2단계)이 거울 같은 금속 반사에서 등고선(띠)으로 보이지 않게(시안 v2 메탈 띠)
function normalMap(h, W, H, tx, ty) {
  const out = Buffer.alloc(W * H * 3), dr = rng(31337), dz = () => dr() - dr();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (h[y * W + wrap(x + 1, W)] - h[y * W + wrap(x - 1, W)]) / (2 * tx);
    const drow = (h[wrap(y + 1, H) * W + x] - h[wrap(y - 1, H) * W + x]) / (2 * ty);
    let nx = -dx, ny = drow, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * W + x) * 3; out[o] = clamp(Math.round((nx * 0.5 + 0.5) * 255 + dz()), 0, 255); out[o + 1] = clamp(Math.round((ny * 0.5 + 0.5) * 255 + dz()), 0, 255); out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
  }
  return out;
}
const sizes = {};
async function save(buf, W, H, dir, name, opts) {
  mkdirSync(`${OUT}${dir}`, { recursive: true });
  const out = `${OUT}${dir}/${name}.webp`;
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).webp({ effort: 6, ...opts }).toFile(out);
  const n = statSync(out).size; (sizes[dir] ??= {})[name] = n; return n;
}

// ── 조각 SDF(mm, 안쪽 +) ────────────────────────────────
function sdRoundRect(x, y, hw, hh, rc) {          // 바깥 +
  const qx = Math.abs(x) - (hw - rc), qy = Math.abs(y) - (hh - rc);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rc;
}
function sdHexFlatTop(px, py, a) {                // iq sdHexagon: 맞변 반 거리(내접원 반지름) a · 평평한 변이 위·아래 · 바깥 +
  const kx = -0.866025404, ky = 0.5, kz = 0.577350269;
  let x = Math.abs(px), y = Math.abs(py);
  const d = 2 * Math.min(kx * x + ky * y, 0); x -= d * kx; y -= d * ky;
  x -= clamp(x, -kz * a, kz * a); y -= a;
  return Math.hypot(x, y) * Math.sign(y);
}

// ── 배열 하나 ─────────────────────────────────────────
// 돌려주는 것: 최종 해상도의 높이(mm)·면 마스크·조각 번호(가장 가까운 조각)·면 안쪽 거리, 그리고 색·거칠기 지도를 칠하는 데 쓰는 2배 해상도 표본
function buildLayout(key, L) {
  const SS = 2, W = L.px, H = L.px, W2 = W * SS, H2 = H * SS, rand = rng(L.seed), randn = randnOf(rand);
  const pieces = [];
  let sizeX, sizeY, cand;
  const tiltRad = d => (d * Math.PI) / 180;
  const jit = () => clamp(L.jitter * randn(), -2 * L.jitter, 2 * L.jitter);
  const pieceProps = () => ({ tx: Math.tan(tiltRad(L.tilt * clamp(randn(), -2.2, 2.2))), ty: Math.tan(tiltRad(L.tilt * clamp(randn(), -2.2, 2.2))), tone: 1 + L.tone * clamp(randn(), -2.2, 2.2), rough: 1 + 0.08 * clamp(randn(), -2, 2), size: 0.12 * clamp(randn(), -2, 2) });
  if (L.kind === 'square') {
    const [px, py] = L.pitch, [nx, ny] = L.n; sizeX = px * nx; sizeY = py * ny;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pieces.push({ i, j, cx: (i + 0.5) * px + jit(), cy: (j + 0.5) * py + jit(), hw: (px - L.grout) / 2, hh: (py - L.grout) / 2, ...pieceProps() });
    cand = (x, y) => { const ci = Math.floor(x / px), cj = Math.floor(y / py), out = []; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) out.push(pieces[wrap(cj + dj, ny) * nx + wrap(ci + di, nx)]); return out; };
  } else {
    const Fp = L.F + L.grout, Rp = Fp / Math.sqrt(3), cp = 1.5 * Rp, cols = L.cols, rows = L.rows; sizeX = cp * cols; sizeY = Fp * rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pieces.push({ i: c, j: r, cx: c * cp + jit(), cy: r * Fp + (c % 2 ? Fp / 2 : 0) + jit(), a: L.F / 2, ...pieceProps() });
    cand = (x, y) => { const c0 = Math.round(x / cp), out = []; for (let dc = -1; dc <= 1; dc++) { const c = c0 + dc, off = wrap(c, cols) % 2 ? Fp / 2 : 0, r0 = Math.round((y - off) / Fp); for (let dr = -1; dr <= 1; dr++) out.push(pieces[wrap(r0 + dr, rows) * cols + wrap(c, cols)]); } return out; };
  }
  pieces.forEach((p, k) => { p.k = k; });
  const mmx = sizeX / W2, mmy = sizeY / H2;
  const wd = (v, s) => { v = ((v % s) + s) % s; return v > s / 2 ? v - s : v; };   // 감싸는 차이
  // 2배 표본: d(안쪽 거리 mm) · 조각 번호 · 조각 안 좌표(정규화) · 높이
  const D = new Float32Array(W2 * H2), PID = new Int32Array(W2 * H2), HT = new Float32Array(W2 * H2);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const X = (x + 0.5) * mmx, Y = (y + 0.5) * mmy;
    let best = -1e9, bp = null, blx = 0, bly = 0;
    for (const p of cand(X, Y)) {
      const lx = wd(X - p.cx, sizeX), ly = wd(Y - p.cy, sizeY);
      const d = L.kind === 'square' ? -sdRoundRect(lx, ly, p.hw + p.size, p.hh + p.size, L.cornerR) : -(sdHexFlatTop(lx, ly, p.a + p.size - L.cornerR) - L.cornerR);
      if (d > best) { best = d; bp = p; blx = lx; bly = ly; }
    }
    const i = y * W2 + x; D[i] = best; PID[i] = bp.k;
    let h;
    if (best > 0) {
      const R = L.edgeR, e = best >= R ? 0 : -(R - Math.sqrt(Math.max(0, R * R - (R - best) ** 2)));
      const pil = L.kind === 'square' ? (1 - (blx / bp.hw) ** 2) * (1 - (bly / bp.hh) ** 2) : Math.max(0, 1 - (Math.hypot(blx, bly) / bp.a) ** 2);
      h = Math.max(e, -L.depth) + L.pillow * Math.max(0, pil) + bp.tx * blx - bp.ty * bly;   // 그림 행(y)이 늘면 v가 준다 → 기울기 부호
    } else {
      h = -L.depth - 0.15 * smooth(0, L.grout / 2, -best);                                      // 흙손 자국: 줄눈 가운데가 조금 더 낮다
    }
    HT[i] = h;
  }
  return { key, L, W, H, W2, H2, SS, sizeX, sizeY, mmx, mmy, pieces, D, PID, HT, rand };
}

const down = (A, B, W, H, SS) => { const o = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let b = 0; b < SS; b++) for (let a = 0; a < SS; a++) s += A[(y * SS + b) * B + x * SS + a]; o[y * W + x] = s / (SS * SS); } return o; };

// 2배 표본에서 색(선형 RGB)을 칠하고 줄여서 sRGB 버퍼로
function paintColor(G, faceColorOf, { speckle = false } = {}) {
  const { W, H, W2, H2, SS, D, PID, L, pieces } = G, r2 = rng(L.seed + 7);
  const sand = noise(W2, H2, 1, r2), mott = noise(W2, H2, 24, r2), fine = speckle ? noise(W2, H2, 1, r2) : null;
  const specks = speckle ? new Float32Array(W2 * H2) : null;
  if (speckle) for (let n = 0; n < W2 * H2 * 0.004; n++) { const x = Math.floor(r2() * W2), y = Math.floor(r2() * H2), s = r2() < 0.6 ? -0.18 : 0.1, rr = r2() < 0.3 ? 1 : 0; for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) specks[wrap(y + dy, H2) * W2 + wrap(x + dx, W2)] = s; }
  const C = [new Float32Array(W2 * H2), new Float32Array(W2 * H2), new Float32Array(W2 * H2)];
  for (let i = 0; i < W2 * H2; i++) {
    const d = D[i], p = pieces[PID[i]];
    let c;
    if (d > 0) {
      const base = faceColorOf(p), bevel = 1 - 0.04 * (1 - Math.min(1, d / L.edgeR));
      let v = p.tone * bevel * (1 + 0.006 * mott[i]);
      if (speckle) v *= 1 + 0.02 * fine[i] + specks[i] + 0.012 * mott[i];
      c = base.map(b => b * v);
    } else {
      const g = FACE_LIN * (1 - L.ao * (1 - smooth(0, L.grout * 0.5, -d))) * (1 + 0.035 * sand[i]);
      c = [g, g, g];
    }
    C[0][i] = c[0]; C[1][i] = c[1]; C[2][i] = c[2];
  }
  const ch = C.map(a => down(a, W2, W, H, SS)), buf = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) for (let j = 0; j < 3; j++) buf[i * 3 + j] = toSrgb8(ch[j][i]);
  return buf;
}

const t00 = Date.now();
for (const [key, L] of Object.entries(LAYOUTS)) {
  const mixKeys = Object.entries(MIXES).filter(([, m]) => m.layout === key).map(([k]) => k);
  const t0 = Date.now();
  const G = buildLayout(key, L);
  const { W, H, W2, SS, D, PID, HT, pieces } = G;
  const tx = G.sizeX / W, ty = G.sizeY / H, dir = `tile-${key}`;
  // 면 마스크 · 거칠기(2배 → 평균)
  const M2 = new Float32Array(D.length), R2 = new Float32Array(D.length);
  for (let i = 0; i < D.length; i++) { const f = D[i] > 0 ? 1 : 0; M2[i] = f; R2[i] = f ? FACE_ROUGH * pieces[PID[i]].rough : GROUT_ROUGH; }
  const mask = down(M2, W2, W, H, SS), rough = down(R2, W2, W, H, SS);
  const h = gaussWrap(down(HT, W2, W, H, SS), W, H, 1, 1);   // 한 번 살짝 흐림(유약이 모서리를 감싼다 · 법선 계단 방지)
  // 1) 법선(손실 q90 · 디더)
  await save(normalMap(h, W, H, tx, ty), W, H, dir, 'normal', { quality: 90, smartSubsample: false });
  // 2) 거칠기(R = 마스크 · G = 거칠기 · B = 마스크) 무손실
  const rbuf = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { const m = Math.round(mask[i] * 255); rbuf[i * 3] = m; rbuf[i * 3 + 1] = Math.round(clamp(rough[i], 0, 1) * 255); rbuf[i * 3 + 2] = m; }
  await save(rbuf, W, H, dir, 'rough', { lossless: true });
  // 3) 색(무채색 면 + 조각 밝기 차 + 줄눈 그늘)
  await save(paintColor(G, () => [FACE_LIN, FACE_LIN, FACE_LIN], { speckle: !!L.speckle }), W, H, dir, 'color', { quality: 82, smartSubsample: true });
  // 4) 섞음 색 지도(같은 조각 배치)
  for (const mk of mixKeys) {
    const mx = MIXES[mk], mr = rng(mx.seed), cols = mx.colors.map(([hx, f]) => [hexLin(hx).map(v => v * MIX_SCALE), f]);
    const pick = new Map();
    for (const p of pieces) {
      let c;
      if (mx.rule === 'check') c = cols[(p.i + p.j) % 2][0];
      else { let u = mr(), k = 0; while (k < cols.length - 1 && u > cols[k][1]) { u -= cols[k][1]; k++; } c = cols[k][0]; }
      pick.set(p, c);
    }
    // 섞음은 조각 밝기 차를 절반으로(색 차가 이미 크다)
    const mbuf = paintColor({ ...G, pieces: pieces.map(p => ({ ...p, tone: 1 + (p.tone - 1) * 0.5, _c: pick.get(p) })) }, p => p._c);
    await save(mbuf, W, H, `tile-${mk}`, 'color', { quality: 82, smartSubsample: true });
  }
  // 5) 엠보메탈 법선(sq48): 면 위에 두드린 금속 주름(유약 대신 금속박)
  if (key === 'sq48') {
    const r3 = rng(4848), n1 = noise(W, H, 2, r3), n2 = noise(W, H, 5, r3), n3 = noise(W, H, 1, r3);
    const md = down(D, W2, W, H, SS), he = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) { const f = smooth(L.edgeR * 0.5, L.edgeR * 1.5, md[i]); he[i] = h[i] + f * (0.16 * Math.abs(n1[i]) + 0.12 * n2[i] + 0.03 * n3[i]); }
    await save(normalMap(he, W, H, tx, ty), W, H, 'tile-sq48-emboss', 'normal', { quality: 86, smartSubsample: false });   // 주름은 잡음이라 손실 압축(무손실은 1 MB 넘음)
  }
  console.log(`${key.padEnd(6)} ${G.sizeX.toFixed(2)} × ${G.sizeY.toFixed(2)} mm · ${W}² · ${(W / G.sizeX).toFixed(2)} px/mm · 조각 ${pieces.length} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
let total = 0;
for (const [dir, f] of Object.entries(sizes)) { const s = Object.values(f).reduce((a, b) => a + b, 0); total += s; console.log(`${dir.padEnd(17)} ${Object.entries(f).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(' · ')}  = ${s.toLocaleString()} B`); }
console.log(`합계 ${total.toLocaleString()} B · ${((Date.now() - t00) / 1000).toFixed(1)} s → ${OUT}`);
