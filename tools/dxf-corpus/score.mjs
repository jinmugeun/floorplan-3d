// 코퍼스 점수판: node tools/dxf-corpus/score.mjs [--update] [--areas] [--equip]
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
// 기구 열(2026-10-12 · 계획 13 Task 4): equip(배치) · equipProd(제품 매칭) · equipClash(벽·기둥 겹침) — 회귀 지표 · equipHit/equipAll — 손 정답(truth/<id>-equip.json).
const COLS = ['regions', 'walls', 'rooms', 'named', 'unmatched', 'openEnds', 'tiny', 'dimFit', 'areaOk', 'areaAll', 'doors', 'windows', 'passes', 'columns', 'opnAll', 'opnHit', 'opnWidth', 'opnKind',
  'equip', 'equipProd', 'equipClash', 'equipHit', 'equipAll', 'areaM2', 'ms'];
const detail = process.argv.includes('--areas');
// --equip(2026-10-12 · 계획 13 Task 4): 기구 손 정답마다 가장 가까운 기구 아이템(블록 이름 · 거리 · 긴 변)을 찍는다 — 빗나간 까닭을 보려고.
const equipDetail = process.argv.includes('--equip');
const now = {};
let worse = 0, skipped = 0;
console.log(`DXF_DIR ${DXF_DIR}${rolesArg.dir ? ` · 역할표 ${resolve(rolesArg.dir)}` : ''}${divArg.on ? ' · 이름 구획선 켬(--dividers)' : ''}`);
// 칸 너비: 9, 열 이름이 그보다 길면 이름 + 1(2026-10-12 — equipProd·equipClash가 이웃 열 이름과 붙어 읽히지 않았다).
const W = c => Math.max(9, c.length + 1);
console.log(['id'.padEnd(11), ...COLS.map(c => c.padStart(W(c)))].join(''));
for (const entry of corpus()) {
  const r = await runDrawing(entry, { roles: await loadRoles(rolesArg.dir, entry.id), dividers: divArg.on });
  if (!r) { skipped++; console.log(`${entry.id.padEnd(11)} (파일 없음: *${entry.match}*.dxf)`); continue; }
  if (r.error) { worse++; console.log(`${entry.id.padEnd(11)} 오류 ${r.error}`); continue; }
  now[entry.id] = r.metrics;
  const b = base[entry.id];
  console.log([entry.id.padEnd(11), ...COLS.map(c => String(r.metrics[c] ?? '-').padStart(W(c)))].join(''));
  if (detail) for (const a of r.areaRows) console.log(`${''.padEnd(11)}  ${a.ok ? '✓' : '✗'} ${String(a.name).padEnd(10)} 도면 ${String(a.label).padStart(7)} · 우리 ${String(a.got ?? '-').padStart(7)}${a.got != null ? ` (${(a.got - a.label >= 0 ? '+' : '') + (a.got - a.label).toFixed(2)})` : ''} ← 방 "${a.room ?? '없음'}"`);
  if (equipDetail) for (const e of r.equipRows) console.log(`${''.padEnd(11)}  ${e.ok ? '✓' : '✗'} ${e.name.slice(0, 28).padEnd(28)} 정답 긴 변 ${String(e.want).padStart(5)} · 가장 가까운 ${e.got ?? '없음'} ${e.d ?? '-'} mm · 긴 변 ${e.long ?? '-'}`);
  if (!b) continue;
  const diff = [], fresh = [];
  for (const c of COLS) {
    if (c === 'ms' || b[c] === r.metrics[c]) continue;
    // 기준에 없는 열(형식 변경 — 2026-10-12 기구 열): 나빠짐으로 세지 않고 이름만 알린다 → --update가 기록한다.
    if (!(c in b)) { fresh.push(c); continue; }
    const bad = WORSE[c] && Math.sign(r.metrics[c] - b[c]) === WORSE[c];
    if (bad) worse++;
    diff.push(`${c} ${b[c]} → ${r.metrics[c]}${bad ? ' ✗ 나빠짐' : WORSE[c] ? ' ✓' : ''}`);
  }
  if (diff.length) console.log(`${''.padEnd(11)}  기준 대비: ${diff.join(' · ')}`);
  if (fresh.length) console.log(`${''.padEnd(11)}  기준에 없는 열(--update로 기록): ${fresh.join(' · ')}`);
}
if (update) { writeFileSync(BASE, JSON.stringify({ ...base, ...now }, null, 1) + '\n'); console.log(`기준을 새로 썼습니다 (${Object.keys(now).length}개 도면)`); }
else if (worse) { console.log(`\n✗ 나빠진 지표 ${worse}개 — 의도한 변화면 --update`); process.exit(1); }
else console.log(`\n✓ 기준 대비 나빠진 지표 없음${skipped ? ` (건너뜀 ${skipped})` : ''}`);
