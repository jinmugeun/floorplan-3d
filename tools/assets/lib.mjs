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
