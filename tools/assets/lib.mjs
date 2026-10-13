// 에셋 도구의 순수 부분(2026-10-13 · 계획 15 Task A). 규약(아키텍처 §19): 단위 m · 원점 = 바닥 중심 · +Y 위 · **정면 +Z**(앱의 등받이·헤드보드가 −Z — itemShapes.js:110 ·
// symbols.js:22-36 · 사전 검토 C-1) · 크기 = 카탈로그 size(w·d·h mm → x·z·y). 생성 모델·CC0 모델은 크기·축·원점이 제각각이라 이 정규화 없이는 앱에 못 넣는다(조사 §4.2 4).
// gltf-transform을 import하지 않는다 — 수학·판정만 두어 단위 테스트가 devDependency 없이도 돌고, pack.mjs·check.mjs(그리고 Task B~D)가 같은 이름을 쓴다.

// 예산(계획 15 Global Constraints): 한 파일 ≤ 1.5 MB · 삼각형 ≤ 10,000 · 텍스처 ≤ 1024² · 균일 맞춤 뒤 가장 작은 축 fit ≥ 0.85(시드 채택 기준 — 사전 검토 I-8).
export const ASSET_BUDGET = Object.freeze({ bytes: 1_500_000, tris: 10_000, texture: 1024, fitMin: 0.85 });
// 런타임(three 0.169 GLTFLoader + MeshoptDecoder)이 읽는 확장만 — Draco·KTX2(KHR_draco_mesh_compression·KHR_texture_basisu)는 런타임 디코더를 두지 않으므로 받지 않는다(사전 검토 I-10).
export const ALLOWED_EXTENSIONS = Object.freeze(['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_texture_webp', 'KHR_texture_transform',
  'KHR_materials_emissive_strength', 'KHR_materials_ior', 'KHR_materials_specular', 'KHR_materials_clearcoat', 'KHR_materials_transmission', 'KHR_materials_sheen', 'KHR_materials_volume']);
// up 변환(z-up → X −90°) **뒤**의 정면 축을 +Z로 돌리는 Y 회전. 계획 초안의 표('-z': 0 …)는 ±z와 ±x 항목이 서로 반대 방향을 앞으로 삼았다 —
// three로 돌려 보고 고친 판(사전 검토 C-1 · preflight.test.js: 네 항목 모두 정면이 [0, 0, 1]로 간다).
export const FRONT_YAW = Object.freeze({ '+z': 0, '-z': Math.PI, '+x': -Math.PI / 2, '-x': Math.PI / 2 });

// 적용 순서: X 먼저, 그다음 Y(three Euler 'YXZ'와 같다 — pack.mjs의 쿼터니언 qY·qX가 이 순서를 따른다). 90° 배수만 쓴다.
const rotX = ([x, y, z], a) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
const rotY = ([x, y, z], a) => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
function rotateBox({ min, max }, rx, ry) {
  const pts = []; for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) pts.push(rotY(rotX([x, y, z], rx), ry));
  const r = v => Math.round(v * 1e9) / 1e9;                       // 90° 배수 회전의 부동소수 찌꺼기(−0 · 1e-17)를 지운다
  return { min: [0, 1, 2].map(i => r(Math.min(...pts.map(p => p[i])))), max: [0, 1, 2].map(i => r(Math.max(...pts.map(p => p[i])))) };
}

// bbox(원본 좌표 m) · size(카탈로그 [w, d, h] mm) → 부모 노드에 걸 회전(라디안 [rx, ry, 0]) · 균일 배율 · 이동(배율 뒤 좌표)과 축별 fit.
// fit[i] = 맞춘 뒤 축 길이 / 카탈로그 축 길이(가장 큰 축 1) — 런타임은 아이템 size에 축별로 늘려 맞추므로(사전 검토 I-8) fit이 작을수록 모델이 많이 늘어난다.
export function normalizeTransform({ bbox, size, front = '+z', up = 'y' }) {
  const rx = up === 'z' ? -Math.PI / 2 : 0, ry = FRONT_YAW[front] ?? 0;
  const b = rotateBox(bbox, rx, ry), ext = [0, 1, 2].map(i => b.max[i] - b.min[i]);
  const target = [size[0] / 1000, size[2] / 1000, size[1] / 1000];           // x = w · y = h · z = d
  const k = Math.max(...ext.map((e, i) => e / target[i]));                   // 가장 큰 축이 카탈로그에 딱 맞게(균일 · 비율 보존)
  const scale = 1 / k;
  return { rotation: [rx, ry, 0], scale, translation: [-(b.min[0] + b.max[0]) / 2 * scale, -b.min[1] * scale, -(b.min[2] + b.max[2]) / 2 * scale], fit: ext.map((e, i) => (e * scale) / target[i]) };
}

// manifest 항목의 모양을 한곳에서 정한다(pack.mjs가 쓰고 check.mjs·런타임 로더(Task B)·NOTICE 생성(Task C)이 읽는다).
export const manifestEntry = e => ({ id: e.id, bytes: e.bytes, tris: e.tris, textures: e.textures ?? [], size: e.size, fit: e.fit ?? [1, 1, 1], extensions: e.extensions ?? [], source: e.source ?? null, sha256: e.sha256, packedAt: e.packedAt ?? null });

// 예산 판정 — 문제 이름 목록(bytes · tris · texture · fit · extension:<이름>). fit 상한 1.02는 균일 맞춤의 반올림 여유이고, 실제 뜻은 하한(fitMin) 검사다(사전 검토 I-8 · S-5).
// `!(x <= 한도)`로 쓴다: 값이 빠지거나 NaN이면 통과가 아니라 문제로 잡히게.
export function checkManifestEntry(e, budget = ASSET_BUDGET) {
  const problems = [];
  if (!(e.bytes <= budget.bytes)) problems.push('bytes');
  if (!(e.tris <= budget.tris)) problems.push('tris');
  if ((e.textures ?? []).some(t => t.w > budget.texture || t.h > budget.texture)) problems.push('texture');
  if ((e.fit ?? []).some(f => f < budget.fitMin || f > 1.02)) problems.push('fit');
  for (const x of e.extensions ?? []) if (!ALLOWED_EXTENSIONS.includes(x)) problems.push(`extension:${x}`);
  return { ok: problems.length === 0, problems };
}

// 검수 시트 격자(2026-10-13 · 계획 15 Task D): snapshot.mjs가 제품마다 여섯 장(투영 앞·뒤·좌·위 + 원근 앞·뒤 비스듬히)을 한 PNG로 붙인다 —
// 사람이 정면·구멍·뒤집힌 면을 한눈에 본다. 거의 정사각(열 = ⌈√n⌉)이라 여섯 장이면 3 × 2. 기본 1200 px · 칸 400 px 시트(1200 × 864)는
// 팔레트 PNG로 시드 7종 모두 200 KB(커밋 예산) 안이다(2026-10-13 실측 — tools/assets/snapshots/*.png).
export function sheetLayout(n, { width = 1200, maxCell = 400 } = {}) {
  if (!(Number.isInteger(n) && n >= 1)) throw new RangeError(`sheetLayout: 장 수는 1 이상의 정수여야 한다 — ${n}`);
  const cols = Math.ceil(Math.sqrt(n));
  return { cols, rows: Math.ceil(n / cols), cell: Math.min(maxCell, Math.floor(width / cols)) };
}

// 출처 종류별 라이선스 근거 URL. Poly Haven은 /info에 license 필드가 없고 사이트 전체가 CC0-1.0이라(사전 검토 I-5) 사이트 라이선스 쪽을 적는다.
export const LICENSE_URLS = Object.freeze({ polyhaven: 'https://polyhaven.com/license' });
// manifest source.kind 값(2026-10-13 · 계획 15 Task E): polyhaven(시드) · generated(ComfyUI 생성 — URL이 없어 pack에 --source-kind로 준다) · other.
// pack.mjs가 이 밖의 값을 거부한다(오타가 NOTICE에 그대로 남지 않게).
export const SOURCE_KINDS = Object.freeze(['polyhaven', 'generated', 'other']);

// NOTICE.md 본문(2026-10-13 · 계획 15 Task C): manifest의 출처를 제품 id 순 표로. pack.mjs가 저장소 manifest를 쓸 때마다 다시 만들고,
// tests/assetsCatalog.test.js가 파일 = 이 출력인지 본다 — 손으로 고치거나 포장 뒤 빠뜨리면 테스트가 잡는다. nameOf(제품 id → 이름)는
// 부르는 쪽이 준다(이 파일은 카탈로그를 읽지 않는 순수 모듈). 표 칸의 `|`는 이스케이프한다(작가 이름에 섞여도 표가 안 깨지게).
export function noticeMarkdown(man, nameOf = () => null) {
  const cell = v => String(v ?? '—').replace(/\|/g, '\\|');
  const rows = Object.entries(man.products ?? {}).map(([id, e]) => {
    const s = e.source ?? {}, licUrl = LICENSE_URLS[s.kind];
    return `| ${cell(id)} | ${cell(nameOf(id))} | ${cell(s.url)} | ${cell(s.author)} | ${cell(s.license && licUrl ? `${s.license} (${licUrl})` : s.license)} |`;
  });
  // 생성 모델 문장(2026-10-13 · 계획 15 Task E)은 generated 항목이 있을 때만 — 시드만인 지금은 NOTICE.md가 바이트 그대로다(assetsCatalog.test.js).
  // 근거: 조사 2026-10-06-research-comfyui-trellis2.md §8(가중치 MIT · 네이티브 노드라 nvdiffrast 없음) · tools/assets/README.md 입력 사진 규칙.
  const generated = Object.values(man.products ?? {}).some(e => e.source?.kind === 'generated')
    ? ['생성 모델(출처 종류 generated — 출처 칸 —)은 사진 한 장에서 ComfyUI 네이티브 TRELLIS.2/Pixal3D(가중치 MIT · nvdiffrast 없는 경로)로 만들어 같은 규약으로 포장한 것이다. 입력 사진은 쓸 권리가 있는 것(직접 찍은 사진 · CC0 · 허락받은 제조사 사진)만 쓴다 — `tools/assets/README.md`.'] : [];
  return ['# NOTICE — 제품 3D 모델 출처', '',
    '`public/models/`에 든 제품 3D 모델(GLB)의 출처·작가·라이선스다. `public/models/manifest.json`에서 `tools/assets/pack.mjs`가 만든다 — 손으로 고치지 않는다(`npm run assets:seed`·`assets:pack`이 다시 쓴다).',
    'Poly Haven 에셋은 사이트 전체가 CC0-1.0(퍼블릭 도메인 헌정)이다 — https://polyhaven.com/license . 표기 의무는 없지만 출처와 작가를 남긴다. 포장 때 크기·축·원점을 앱 규약에 맞추고, 삼각형이 많으면 줄이고, 텍스처를 WebP로 바꿨다.',
    ...generated, '', '| 제품 | 이름 | 출처 | 작가 | 라이선스 |', '|---|---|---|---|---|', ...rows, ''].join('\n');
}
