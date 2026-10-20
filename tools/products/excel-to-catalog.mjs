// 엑셀 → 급식기구 원자료(계획 17 Task 2). npm run kitchen:gen [-- <엑셀 경로>] — 기본은 저장소 밖 작업 폴더의 ../식별번호(202608).xlsx.
// 산출: src/products/kitchenData.js(한 줄 JSON.parse — Node 도구가 import 속성 없이 읽도록 .json이 아니라 JS) · tools/products/skipped.csv(뺀 행과 이유).
// 시트 "2026년8월", 3행 머리글. 열: C 급식기구명 · D 규격 · F 단가 · H 계약방법 · J 세부품명 · K 물품식별번호 · M 종류 · N 업체 ·
// O/P/Q 냉수·온수·배수(배관 규격 '15A'만 배관 — kitchenRules.isPipe) · R/S/T 전기 1P 220·3P 380·4P 380(kW) · V 가스 소비량 · W 모델명.
// 같은 물품식별번호가 다시 나오면 첫 행을 쓴다(이름이 다르면 skipped.csv 이유가 '중복 id(다른 제품)'). 표(kitchenRules.SUB_CHIP)에 없는 세부품명이 나오면 멈춘다 — 표를 고친 뒤 다시 돌린다.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { skipReason, parseSpec, numOf, isPipe, normSub, SUB_CHIP } from '../../src/products/kitchenRules.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const src = process.argv[2] ?? fileURLToPath(new URL('../../../식별번호(202608).xlsx', import.meta.url));
const SHEET = '2026년8월';
const buf = readFileSync(src);
const ws = XLSX.read(buf).Sheets[SHEET];
if (!ws) throw new Error(`시트가 없다: ${SHEET}`);
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const rows = XLSX.utils.sheet_to_json(ws, { header: 'A', defval: '' }).slice(3).filter(r => clean(r.K));
const vendors = [], subs = [], at = (list, v) => { let i = list.indexOf(v); if (i < 0) { list.push(v); i = list.length - 1; } return i; };
const seen = new Map(), recs = [], skipped = [], unknown = new Set(); // seen: 물품식별번호 → 실은 행의 이름
for (const r of rows) {
  const kid = clean(r.K), name = clean(r.C);
  const why = seen.has(kid) ? (seen.get(kid) === name ? '중복 id' : '중복 id(다른 제품)') : skipReason({ kind: r.M, sub: r.J, name, spec: r.D });
  if (why) { skipped.push([kid, name, clean(r.D), clean(r.J), clean(r.M), why]); continue; }
  seen.set(kid, name);
  const sub = normSub(r.J);
  if (!(sub in SUB_CHIP)) unknown.add(sub);
  const { size, round } = parseSpec(r.D);
  const water = ['O', 'P', 'Q'].reduce((b, k, i) => b | (isPipe(clean(r[k])) ? 1 << i : 0), 0);
  const util = [water, numOf(r.R), numOf(r.S), numOf(r.T), numOf(r.V)];
  const rec = [kid, name, at(subs, sub), ...size, round ? 1 : 0, Math.round(numOf(r.F)), at(vendors, clean(r.N)), clean(r.W), clean(r.H)];
  if (util.some(Boolean)) rec.push(util);
  recs.push(rec);
}
if (unknown.size) { console.error(`표에 없는 세부품명: ${[...unknown].join(', ')} — src/products/kitchenRules.js의 SUB_CHIP·SUB_SHAPE에 더한 뒤 다시 돌린다`); process.exit(1); }
const data = { version: 1, source: src.split(/[\\/]/).pop(), sha256: createHash('sha256').update(buf).digest('hex'), generatedAt: new Date().toISOString().slice(0, 10), vendors, subs, rows: recs };
const head = '// 생성 파일 — tools/products/excel-to-catalog.mjs(npm run kitchen:gen)가 식별번호 엑셀에서 만든다. 손으로 고치지 말 것(계획 17 Task 2).\n'
  + '// 행 = [물품식별번호, 급식기구명, 세부품명 색인, W, D, H, Φ규격(0|1), 단가, 업체 색인, 모델명, 계약방법, 설비?] · 설비 = [급배수 비트(냉1·온2·배4), 1P kW, 3P kW, 4P kW, 가스 소비량] · 펼치기 = kitchenRules.expandRow.\n';
writeFileSync(`${ROOT}src/products/kitchenData.js`, `${head}export default JSON.parse(${JSON.stringify(JSON.stringify(data))});\n`);
const csv = [['물품식별번호', '급식기구명', '규격', '세부품명', '종류', '이유'], ...skipped].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
writeFileSync(`${ROOT}tools/products/skipped.csv`, `\ufeff${csv}\n`);
const byWhy = skipped.reduce((a, r) => ({ ...a, [r[5]]: (a[r[5]] ?? 0) + 1 }), {});
console.log(`제품 ${recs.length} · 제외 ${skipped.length} ${JSON.stringify(byWhy)} · 업체 ${vendors.length} · 세부품명 ${subs.length}`);
