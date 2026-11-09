// 학교 구입목록 엑셀 → 구입 제품 원자료(계획 20 Task 3). npm run purchase:gen [-- <엑셀 경로>] — 기본은 저장소 밖 ../신상중/02.기구구입목록_경산 신상중(261021).xlsx.
// 산출: src/products/purchaseData.js(한 줄 JSON.parse — kitchenData.js와 같은 꼴) · 표준 출력에 카탈로그와의 차이 표.
// 차이 표의 '형상'은 이름 규칙(shapeNames.shapeByName)이 카탈로그 형상과 다를 때다 — 대부분 이름 표기 차이이고, 정말 다른 제품이면 purchase-lib.mjs OVERRIDES에 더한다.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import data from '../../src/products/kitchenData.js';
import { SCHOOL, SHEET, HEAD_ROWS, OVERRIDES, purchaseRows, groupPurchase } from './purchase-lib.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const src = process.argv[2] ?? fileURLToPath(new URL('../../../신상중/02.기구구입목록_경산 신상중(261021).xlsx', import.meta.url));
const buf = readFileSync(src);
const ws = XLSX.read(buf).Sheets[SHEET];
if (!ws) throw new Error(`시트가 없다: ${SHEET}`);
const rows = purchaseRows(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).slice(HEAD_ROWS));
const { products, rows: outRows, diffs } = groupPurchase(rows, data);
const out = { version: 1, school: SCHOOL, source: src.split(/[\\/]/).pop(), sha256: createHash('sha256').update(buf).digest('hex'), generatedAt: new Date().toISOString().slice(0, 10),
  overrides: [...OVERRIDES], products, rows: outRows };
const head = '// 생성 파일 — tools/products/purchase-to-catalog.mjs(npm run purchase:gen)가 학교 구입목록 엑셀에서 만든다. 손으로 고치지 말 것(계획 20 Task 3).\n'
  + '// products = 제품(k-<식별번호> · 식별번호 없으면 ss-<번호>) — 카탈로그에 없거나 덮어쓰기(overrides)인 것만 크기·단가·세부품명을 든다 · rows = 구입목록 행(템플릿 짝짓기 · 도면번호) · 펼치기 = purchaseProducts.js.\n';
writeFileSync(`${ROOT}src/products/purchaseData.js`, `${head}export default JSON.parse(${JSON.stringify(JSON.stringify(out))});\n`);
for (const d of diffs) console.log(d.warn ? `경고 ${d.kid}: ${d.warn}` : `차이 ${d.no}번 ${d.kid} ${d.name} ↔ 카탈로그 ${d.catalog}: ${d.what.join(' · ')}${d.override ? ' → 구입목록 값(덮어쓰기)' : ''}`);
const n = f => products.filter(f).length;
console.log(`행 ${outRows.length} · 제품 ${products.length}(카탈로그 ${n(p => p.inCatalog && !p.override)} · 덮어쓰기 ${n(p => p.override)} · 새 ${n(p => !p.inCatalog)}) · 차이 ${diffs.length}`);
