// 코퍼스 점수판: node tools/dxf-corpus/score.mjs [--update]
// 도면마다 지표를 내고 baseline.json(마지막으로 받아들인 값)과 견준다. 방향이 있는 지표(lib.WORSE)가 나빠지면
// 종료 코드 1 — 한 도면을 고치다 다른 도면을 망가뜨린 것이다. 의도한 변화면 --update로 기준을 새로 쓴다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { corpus, runDrawing, WORSE, DXF_DIR, rolesOption, loadRoles, dividersOption } from './lib.mjs';

const BASE = resolve(dirname(fileURLToPath(import.meta.url)), 'baseline.json');
const update = process.argv.includes('--update');
// --roles <dir>(2026-10-12 · 계획 12 Task 9): 도면 id별 역할표 `<dir>/<id>.json`을 파싱 옵션으로 넘겨 기준(규칙만)과 견준다. --update와 함께면 종료 코드 2.
const rolesArg = rolesOption(process.argv.slice(2));
if (rolesArg.error) { console.log(rolesArg.error); process.exit(2); }
// --dividers(2026-10-12 · 계획 12 Task 6): 실명만으로 구획선 옵션을 켜고 기준(꺼진 값)과 견준다. --update와 함께면 종료 코드 2.
const divArg = dividersOption(process.argv.slice(2));
if (divArg.error) { console.log(divArg.error); process.exit(2); }
const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : {};
const COLS = ['regions', 'walls', 'rooms', 'named', 'unmatched', 'openEnds', 'tiny', 'dimFit', 'areaOk', 'areaAll', 'doors', 'windows', 'passes', 'columns', 'opnAll', 'opnHit', 'opnWidth', 'opnKind', 'areaM2', 'ms'];
const detail = process.argv.includes('--areas');
const now = {};
let worse = 0, skipped = 0;
console.log(`DXF_DIR ${DXF_DIR}${rolesArg.dir ? ` · 역할표 ${resolve(rolesArg.dir)}` : ''}${divArg.on ? ' · 이름 구획선 켬(--dividers)' : ''}`);
console.log(['id'.padEnd(11), ...COLS.map(c => c.padStart(9))].join(''));
for (const entry of corpus()) {
  const r = await runDrawing(entry, { roles: await loadRoles(rolesArg.dir, entry.id), dividers: divArg.on });
  if (!r) { skipped++; console.log(`${entry.id.padEnd(11)} (파일 없음: *${entry.match}*.dxf)`); continue; }
  if (r.error) { worse++; console.log(`${entry.id.padEnd(11)} 오류 ${r.error}`); continue; }
  now[entry.id] = r.metrics;
  const b = base[entry.id];
  console.log([entry.id.padEnd(11), ...COLS.map(c => String(r.metrics[c] ?? '-').padStart(9))].join(''));
  if (detail) for (const a of r.areaRows) console.log(`${''.padEnd(11)}  ${a.ok ? '✓' : '✗'} ${String(a.name).padEnd(10)} 도면 ${String(a.label).padStart(7)} · 우리 ${String(a.got ?? '-').padStart(7)}${a.got != null ? ` (${(a.got - a.label >= 0 ? '+' : '') + (a.got - a.label).toFixed(2)})` : ''} ← 방 "${a.room ?? '없음'}"`);
  if (!b) continue;
  const diff = [];
  for (const c of COLS) {
    if (c === 'ms' || b[c] === r.metrics[c]) continue;
    const bad = WORSE[c] && Math.sign(r.metrics[c] - b[c]) === WORSE[c];
    if (bad) worse++;
    diff.push(`${c} ${b[c]} → ${r.metrics[c]}${bad ? ' ✗ 나빠짐' : WORSE[c] ? ' ✓' : ''}`);
  }
  if (diff.length) console.log(`${''.padEnd(11)}  기준 대비: ${diff.join(' · ')}`);
}
if (update) { writeFileSync(BASE, JSON.stringify({ ...base, ...now }, null, 1) + '\n'); console.log(`기준을 새로 썼습니다 (${Object.keys(now).length}개 도면)`); }
else if (worse) { console.log(`\n✗ 나빠진 지표 ${worse}개 — 의도한 변화면 --update`); process.exit(1); }
else console.log(`\n✓ 기준 대비 나빠진 지표 없음${skipped ? ` (건너뜀 ${skipped})` : ''}`);
