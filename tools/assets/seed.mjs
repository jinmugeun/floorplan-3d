// 시드 에셋 받기(2026-10-13 · 계획 15 Task C): tools/assets/sources.json의 Poly Haven 짝(사전 검토 p15-preflight §4 · 할 일 14)을 받아
// md5를 맞춰 보고 pack.mjs로 포장한다 → public/models/<id>.glb · manifest.json · NOTICE.md(pack이 저장소 manifest에서 다시 만든다).
//   node tools/assets/seed.mjs [--only chair-dining,sofa-3] [--keep]      (--keep: 받은 원본 임시 폴더를 지우지 않고 경로를 찍는다)
// 왜 이 구조인가(사전 검토 I-5 실측): /files/<id>는 gltf[res].gltf = { url, md5, include: { '<상대 경로>': { url, md5 } } }라 상대 경로대로
// 임시 폴더에 두면 .gltf가 그대로 읽힌다. /info/<id>에는 license 필드가 없고 사이트 전체가 CC0-1.0이다(https://polyhaven.com/license)
// → 라이선스는 상수, 작가는 /info.authors의 키. 고유 User-Agent를 붙인다(Poly Haven API 요청 사항). 받는 곳은 Poly Haven 호스트뿐이다
// (계획 15 Global Constraints: 네트워크는 Poly Haven만) — 응답이 다른 호스트 URL을 주면 받지 않는다.
// 실패한 항목(받기 · md5 · 포장 · 예산)은 건너뛰고 끝에 표로 보고하며 종료 1. pack.mjs는 예산을 넘어도 종료 0이라 항목을 checkManifestEntry로 다시 본다
// (예산 밖 항목은 manifest에 남으므로 `npm run assets:check`도 막는다 — 게이트를 늦추지 말고 표의 숫자로 판단한다).
// 예비 짝(사전 검토 표 #9 · dining-4 ← wooden_table_02)은 fit .89/.83/1로 하한 0.85 밖이라 sources.json에 넣지 않았다.
// 정면 축: Poly Haven glTF는 Y-up · 정면 +Z(등받이 −Z — 2종 실측, 나머지는 같은 Blender 내보내기 관례로 추정). Task D 스냅샷에서 틀린 것이
// 나오면 sources.json의 front를 고치고 `--only <id>`로 그 제품만 다시 포장한다.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkManifestEntry } from './lib.mjs';

const API = 'https://api.polyhaven.com', LICENSE = 'CC0-1.0';
const UA = 'kvp-assets-seed/1.0 (+https://github.com/jinmugeun/floorplan-3d)';
const HOSTS = new Set(['api.polyhaven.com', 'dl.polyhaven.org']);
const PACK = fileURLToPath(new URL('./pack.mjs', import.meta.url));
const argv = process.argv.slice(2);
const only = argv.includes('--only') ? (argv[argv.indexOf('--only') + 1] ?? '').split(',').filter(Boolean) : null;
const keep = argv.includes('--keep');
const sources = JSON.parse(readFileSync(new URL('./sources.json', import.meta.url), 'utf8'));
const unknown = (only ?? []).filter(id => !Object.hasOwn(sources, id));
if (unknown.length || only?.length === 0) { console.error(`seed: sources.json에 없는 제품 — ${unknown.join(', ') || '(--only 값 없음)'}`); process.exit(1); }

async function get(url, json = false) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !HOSTS.has(u.hostname)) throw new Error(`Poly Haven 밖의 URL: ${url}`);
  const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return json ? r.json() : Buffer.from(await r.arrayBuffer());
}

// 파일 하나: md5가 맞아야 쓴다(md5가 없으면 검증할 수 없으니 거부). 상대 경로가 폴더 밖(.. · 절대 경로)을 가리켜도 거부.
async function download(dir, rel, { url, md5 }) {
  const path = resolve(dir, rel);
  if (!path.startsWith(dir + sep)) throw new Error(`폴더 밖 경로: ${rel}`);
  if (!md5) throw new Error(`md5 없음: ${rel}`);
  const buf = await get(url), got = createHash('md5').update(buf).digest('hex');
  if (got !== md5) throw new Error(`md5 불일치: ${rel} (${got} ≠ ${md5})`);
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, buf);
  return buf.byteLength;
}

async function seedOne(id, s, tmp) {
  if (s.kind !== 'polyhaven') throw new Error(`지원하지 않는 출처 종류: ${s.kind}`);
  const res = s.resolution ?? '1k', asset = encodeURIComponent(s.asset);
  const [files, info] = await Promise.all([get(`${API}/files/${asset}`, true), get(`${API}/info/${asset}`, true)]);
  const g = files?.gltf?.[res]?.gltf;
  if (!g?.url) throw new Error(`/files에 gltf ${res}가 없다`);
  const author = Object.keys(info?.authors ?? {}).join(', ');
  if (!author) throw new Error('/info에 authors가 없다');
  const dir = join(tmp, s.asset), main = `${s.asset}_${res}.gltf`;
  mkdirSync(dir, { recursive: true });
  let bytes = await download(dir, main, g);
  for (const [rel, f] of Object.entries(g.include ?? {})) bytes += await download(dir, rel, f);
  const r = spawnSync(process.execPath, [PACK, join(dir, main), '--product', id, '--front', s.front ?? '+z', '--up', s.up ?? 'y',
    '--source-url', `https://polyhaven.com/a/${s.asset}`, '--license', LICENSE, '--author', author], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`포장 실패 — ${(r.stderr || r.stdout || String(r.error)).trim()}`);
  const entry = JSON.parse(r.stdout.trim().split('\n').pop());
  return { bytes, entry, problems: checkManifestEntry(entry).problems };
}

const kb = n => `${(n / 1024).toFixed(0)} KB`;
const tmp = mkdtempSync(join(tmpdir(), 'kvp-seed-'));
const rows = [];
let failed = 0;
try {
  // 하나씩 차례로 받는다(Poly Haven에 동시 요청을 몰지 않는다 · 7종 합 ≈ 6 MB).
  for (const [id, s] of Object.entries(sources)) {
    if (only && !only.includes(id)) continue;
    try {
      const { bytes, entry: e, problems } = await seedOne(id, s, tmp);
      if (problems.length) failed += 1;
      const tex = e.textures.length ? `${e.textures.length} × ${Math.max(...e.textures.map(t => Math.max(t.w, t.h)))}²` : '0';
      rows.push([id, s.asset, kb(bytes), `${e.bytes.toLocaleString('en')} B`, e.tris.toLocaleString('en'), tex, e.fit.join(' / '), problems.length ? `예산 밖: ${problems.join(', ')}` : '통과']);
    } catch (err) {
      failed += 1;
      rows.push([id, s.asset, '—', '—', '—', '—', '—', `실패: ${err.message}`]);
    }
  }
} finally {
  if (keep) console.log(`seed: 받은 원본 — ${tmp}`); else rmSync(tmp, { recursive: true, force: true });
}
console.log(['| 제품 | Poly Haven | 원본 | 포장 | 삼각형 | 텍스처 | fit x / y / z | 결과 |', '|---|---|---|---|---|---|---|---|', ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n'));
if (failed) console.log(`seed: ${rows.length}종 중 ${failed}종 실패·예산 밖 — 위 표`);
process.exitCode = failed ? 1 : 0;
