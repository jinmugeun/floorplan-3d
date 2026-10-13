// 에셋 게이트(2026-10-13 · 계획 15 Task A): manifest의 모든 항목을 파일과 대조한다 — 존재 · bytes · sha256 · 예산(lib.checkManifestEntry).
// 문제가 하나라도 있으면 표를 찍고 종료 1(계획 15 공통 게이트 `npm run assets:check` 종료 0). 모델 파일은 manifest와 같은 폴더의 `<id>.glb`(pack.mjs 기본 배치 · 런타임 `models/<id>.glb`).
//   node tools/assets/check.mjs [--manifest public/models/manifest.json]
// 문제 이름: file(파일 없음) · file-bytes(파일 크기 ≠ 항목 bytes) · sha256(내용이 포장 뒤 바뀜) · id(키 ≠ 항목 id) · bytes·tris·texture(크기 초과·크기 없음·WebP 아님)·fit·extension:<이름>(예산 — lib.mjs).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkManifestEntry } from './lib.mjs';

const argv = process.argv.slice(2), at = argv.indexOf('--manifest');
// 기본은 저장소의 public/models/manifest.json — 스크립트 자리 기준이라 어디서 불러도 같다.
const manifestPath = resolve(at >= 0 ? argv[at + 1] : fileURLToPath(new URL('../../public/models/manifest.json', import.meta.url)));
const fail = msg => { console.log(`에셋 검사 실패: ${msg}`); process.exit(1); };
if (!existsSync(manifestPath)) fail(`manifest가 없다 — ${manifestPath}`);
const man = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (man.version !== 1 || !man.products || typeof man.products !== 'object') fail(`manifest 형식이 다르다(version 1 · products 필요) — ${manifestPath}`);

const rows = [];
for (const [key, entry] of Object.entries(man.products)) {
  const problems = [];
  if (entry.id !== key) problems.push('id');
  const file = join(dirname(manifestPath), `${key}.glb`);
  if (!existsSync(file)) problems.push('file');
  else {
    const buf = readFileSync(file);
    if (buf.byteLength !== entry.bytes) problems.push('file-bytes');
    if (createHash('sha256').update(buf).digest('hex') !== entry.sha256) problems.push('sha256');
  }
  problems.push(...checkManifestEntry(entry).problems);
  if (problems.length) rows.push(`| ${key} | ${problems.join(', ')} |`);
}
const count = Object.keys(man.products).length;
if (rows.length) {
  console.log(`에셋 검사: 제품 ${count}종 중 ${rows.length}종 문제 — ${manifestPath}\n| 제품 | 문제 |\n|---|---|\n${rows.join('\n')}`);
  process.exit(1);
}
console.log(`에셋 검사 통과: 제품 ${count}종 — ${manifestPath}`);
