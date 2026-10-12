// 언어 모델로 역할표 만들기(2026-10-12 · 계획 12 Task 9 ⓓ):
//   node tools/dxf-corpus/llm-roles.mjs --model claude-haiku-4-5 --in <id>.dump.json --out <id>.json
//   node tools/dxf-corpus/llm-roles.mjs --model claude-haiku-4-5 --in <id>.dump.json --print   보낼 요청 본문만 낸다(API·키 없음)
//   node tools/dxf-corpus/llm-roles.mjs --validate <id>.json                                    역할표 형식만 검사(0 = 문제없음 · 1 = 잘못된 칸)
// roles-dump.mjs의 덤프(레이어·블록·문자 표본의 이름과 통계) → Anthropic Messages API 한 번 → 역할표(형식은 src/io/dxf/roles.js · README "역할표").
// 드라이런 역할표(컨트롤러가 손으로 쓴 것)와 같은 형식이라 점수판 `--roles`로 똑같이 잰다.
// **도구 전용이다** — 앱 번들에는 키도 호출도 넣지 않는다(키 노출 · 서버 없음; 앱에서 실시간으로 부르는 중계 서버는 다음 계획).
// 모델은 **명시 인자로만** 받고 폴백이 없다(사용자 지시 2026-09-22: 과부하여도 다른 모델로 자동 대체하지 않는다) — `--model`이 없으면 종료 코드 2,
// `ANTHROPIC_API_KEY`가 없으면 "키 필요"로 종료 코드 2, API가 그 모델을 거절하면(404 등) 그 응답을 그대로 적고 종료 코드 1.
// 의존성 없이 node 22의 fetch로 부른다(계획 12: 새 npm 의존성 없음).
// ⓓ 비교 규칙(2026-10-12 · 계획 12 최종 리뷰 M9-7 — few-shot 누수): 프롬프트의 예시(SYSTEM)에 사동중·내곡중·신상중 A/B의 정답이 들어 있다.
// 그래서 모델 역할표와 드라이런 표·규칙의 비교는 **공개 5장**(2suite (1) · 4suite (9) · 4suite (10) · 6suite (6) · 6suite (8) — 도면별 정답이
// 프롬프트에 없는 도면)으로만 판단하고, 실파일 넷의 수치는 "참고(누수)"로 따로 적는다. 공개 5장도 완전한 홀드아웃은 아니다: `DOTE = grid` 예시는
// 2suite (1)·6suite (6)의 레이어이고 "Chinese apartments" 줄은 공개 코퍼스 전체의 레이어 관례다 — 그 칸(DOTE · WALL/WINDOW/PUB_*·栏杆 등)은
// 비교에서 맞혀도 세지 않는다. 일반화를 재려면 예시에서 뺀 도면을 쓰거나 예시를 다른 도면으로 바꾼다(코드 변경은 다음 계획 — 키가 없어 지금은 돌리지 않는다).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRoles, LAYER_ROLES, BLOCK_KINDS, TEXT_ROLES } from '../../src/io/dxf/roles.js';

const API = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_TOKENS = 16000;     // 레이어·블록 수백 + 문자 150의 분류 JSON이 들어가고, 비스트리밍 요청이 시간 초과에 걸리지 않는 크기

// 응답 스키마(구조화 출력 · `output_config.format` = { type: 'json_schema', schema }): 구조화 출력은 모든 객체에
// `additionalProperties: false`를 요구하고 그 밖의 값(이름이 정해지지 않은 키의 사전)을 받지 않는다 — 그래서 모델에게는 **배열 꼴**
// ([{ name, role }])로 받고 tableFromResponse가 역할표의 사전 꼴({ name: role })로 바꾼다.
export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    layers: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string', enum: [...LAYER_ROLES] } }, required: ['name', 'role'], additionalProperties: false } },
    blocks: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, kind: { type: 'string', enum: [...BLOCK_KINDS] }, width: { anyOf: [{ type: 'integer' }, { type: 'null' }] } }, required: ['name', 'kind', 'width'], additionalProperties: false } },
    texts: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, role: { type: 'string', enum: [...TEXT_ROLES] } }, required: ['text', 'role'], additionalProperties: false } },
  },
  required: ['layers', 'blocks', 'texts'],
  additionalProperties: false,
};

// 역할 정의 + 한국 도면·공개 도면의 예시(few-shot). 예시는 코퍼스에서 확인한 사실만 적는다(classify.js·blockOpenings.js 주석의 근거).
// pass 정의와 SLIDING-·PASS- 예시(2026-10-12 · 계획 12 최종 리뷰 X-3 · N3-6): 응답 스키마 enum(BLOCK_KINDS)에는 pass가 있는데 프롬프트가 정의하지
// 않았다 — 정규화 DXF(io/dxfExport.js)가 쓰는 두 이름이다.
// **누수 주의(M9-7)**: 아래 예시에 사동중·내곡중·신상중의 정답(벽 레이어 · 블록 종류 · 실명)이 그대로 들어 있다 — 이 세 도면(실파일 넷)의 ⓓ 수치는
// 일반화가 아니라 프롬프트 회상이다. 위 머리 주석과 README "역할표"의 비교 규칙을 따른다.
const SYSTEM =`You classify the layers, blocks and texts of one architectural floor-plan DXF so that a deterministic program can rebuild walls, rooms, doors and windows from it.
You receive a JSON dump: layer statistics, block statistics and a sample of distinct texts. Lengths are millimetres. Names may be Korean, Chinese or English; the same name can mean different things in different offices, so read the statistics, not only the name.

Layer roles (choose one per layer):
- wall: wall faces, structure, partitions, finishes, columns (long parallel line pairs 100-500 mm apart).
- opening: door and window geometry (frames, sashes, leaves, swing arcs, sliding arrows).
- text: room names, notes, titles. dim: dimensions and leaders.
- equip: furniture, kitchen equipment, sanitary fixtures. mep: electrical, plumbing, ducts, trenches.
- grid: axis / centre lines (often off, very long lines). hatch: hatch or poche patterns (thousands of tiny segments).
- rail: balcony railings / guard lines - not walls, but they close the balcony room boundary.
- other: anything else (symbols, stairs, landscape, title block, frames).
Block kinds: door (swing door), window, pocket (pocket sliding door, half of it inside the wall), slide (sliding door, not pocket, e.g. SLIDING-900-200), pass (doorless opening / passage with no leaf, e.g. PASS-1000-200), equip (furniture/equipment - a refrigerator "with two doors" is equip, not a door), symbol (annotation symbols, north arrow, section marks), column, other (whole-plan blocks, title blocks, details).
width: the nominal opening width in mm for door/window/pocket/slide/pass (usually the 3-4 digit number in the name, else bboxW); null for everything else or when unknown.
Text roles: room (a room / space name), area (an area label such as "(15.39m²)"), title (drawing or sheet title), label (equipment and annotation labels, notes), axis (grid bubble labels such as X12, Y3, A, 1), other.

Examples from drawings we have verified:
- Korean school kitchen (사동중): walls are on WAL, WAL-2, 기존, FIN, ST-PL, BLO, COL; 04창호 = opening (many tiny handle segments, still opening); 급식기구 = equip; 전기 = mep; CEN = grid; TEXT2 = text; HAT = hatch; SYM = other.
  Blocks: DR-900 = door 900, dr-1850 = door 1850, win-900-3 = window 900, WIN-2400-2 = window 2400, "문_슬라이딩 포켓 900" = pocket 900, 식탁6인 = equip, "보냉고 양문1260-800" = equip (not a door), 1f plan-1 = other.
  Texts: 식당, 조리실, 식품창고, "영양상담/" = room; "(15.39m²)" = area; "경산 사동중" = title; 퇴식동선, 온장고 = label; DN = other.
- Korean school (내곡중): every architectural line is on the single layer 건축 = wall (doors and windows there are blocks such as 미서기단창_1300 = window 1300, SD850 = door 850, "방음문(시창형)_2400" = door 2400; Korean schedule codes SD/FSD/SSD/AD/WD/PD+width are doors, AW/PW/SW/WW+width are windows).
- Korean school (신상중): WID = opening (windows: cyan colour 4, parallel frame lines), A-DOOR = opening (door leaves with sliding arrows), COL = wall.
- TArch drawings: DOTE = grid (axis lines, off, median length 3-18 m).
- Chinese apartments (public corpus): WALL = wall, WINDOW = opening, PUB_DIM = dim, PUB_TEXT = text, FUR = equip, STAIR = other, 栏杆 and 4-BACLONY = rail, BALCONY = wall (balcony parapets); texts 卧室, 客厅, 厨房, 卫生间, 阳台 = room.

Rules: return every layer and every block of the dump exactly once, with the exact name string; return every text of the sample exactly once, with the exact text string. Do not invent names. If unsure, keep the current rule result (currentRole / currentKind) when it is plausible.`;

// 덤프 → 요청 본문(모델은 부르는 쪽이 명시한 것 그대로).
export function buildRequest(dump, model) {
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Classify this drawing dump. Output JSON only.\n${JSON.stringify(dump)}` }],
    output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
  };
}

// 응답 JSON(배열 꼴) → 역할표(사전 꼴). 꼴이 틀리면 던진다(엄격 검사 — 구조화 출력이 지켜 주지만 믿지 않는다). 값의 검사는 checkRoles가 한다.
export function tableFromResponse(obj) {
  const arr = key => { if (!Array.isArray(obj?.[key])) throw new Error(`응답의 ${key}가 배열이 아니다`); return obj[key]; };
  const str = (v, what) => { if (typeof v !== 'string') throw new Error(`응답의 ${what}가 문자열이 아니다: ${JSON.stringify(v)}`); return v; };
  const table = { layers: {}, blocks: {}, texts: {} };
  for (const e of arr('layers')) table.layers[str(e?.name, 'layers[].name')] = e.role;
  for (const e of arr('blocks')) table.blocks[str(e?.name, 'blocks[].name')] = { kind: e.kind, width: typeof e.width === 'number' && e.width > 0 ? e.width : null };
  for (const e of arr('texts')) table.texts[str(e?.text, 'texts[].text')] = e.role;
  return table;
}

// checkRoles의 Map 표 → 파일에 쓰는 사전 꼴(잘못된 칸이 빠진 것).
const toJson = t => ({ layers: Object.fromEntries(t.layers), blocks: Object.fromEntries(t.blocks), texts: Object.fromEntries(t.texts) });

export function parseArgs(argv) {
  const val = f => { const i = argv.indexOf(f); if (i < 0) return undefined; const v = argv[i + 1]; return v == null || v.startsWith('--') ? null : v; };
  const validate = val('--validate');
  if (validate !== undefined) return validate ? { validate, error: null } : { error: '--validate에 값(역할표 파일)이 없다' };
  const model = val('--model'), inPath = val('--in'), outPath = val('--out'), print = argv.includes('--print');
  if (!model) return { error: '--model이 없다 — 모델은 명시 인자로만 받는다(예: --model claude-haiku-4-5 · 폴백 없음)' };
  if (!inPath) return { error: '--in(roles-dump의 <id>.dump.json)이 없다' };
  if (!outPath && !print) return { error: '--out(쓸 역할표 파일)이 없다' };
  return { model, inPath, outPath, print, error: null };
}

async function main(argv) {
  const a = parseArgs(argv);
  if (a.error) { console.log(a.error); return 2; }
  if (a.validate) {
    let raw;
    try { raw = JSON.parse(readFileSync(a.validate, 'utf8')); } catch (e) { console.log(`읽기 실패 ${a.validate}: ${e.message}`); return 1; }
    const { table, errors } = checkRoles(raw);
    for (const e of errors) console.log(`  ✗ ${e}`);
    if (table) console.log(`레이어 ${table.layers.size} · 블록 ${table.blocks.size} · 문자 ${table.texts.size}${errors.length ? ` · 잘못된 칸 ${errors.length}` : ' · 문제없음'}`);
    return table && !errors.length ? 0 : 1;
  }
  if (a.print) { console.log(JSON.stringify(buildRequest(JSON.parse(readFileSync(a.inPath, 'utf8')), a.model), null, 1)); return 0; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { console.log('키 필요: ANTHROPIC_API_KEY 환경 변수가 없다 — API를 부르지 않았다(역할표를 쓰지 않음)'); return 2; }
  const dump = JSON.parse(readFileSync(a.inPath, 'utf8'));
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': API_VERSION, 'content-type': 'application/json' },
    body: JSON.stringify(buildRequest(dump, a.model)),
  });
  const body = await res.text();
  if (!res.ok) { console.log(`API 오류 ${res.status} (모델 ${a.model} — 다른 모델로 바꾸지 않는다): ${body.slice(0, 800)}`); return 1; }
  const msg = JSON.parse(body);
  // 거절·길이 초과면 출력이 스키마를 지키지 않을 수 있다 — 쓰지 않는다.
  if (msg.stop_reason !== 'end_turn') { console.log(`응답이 끝나지 않았다(stop_reason ${msg.stop_reason}) — 역할표를 쓰지 않음`); return 1; }
  const text = (msg.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('');
  let table;
  try { table = tableFromResponse(JSON.parse(text)); } catch (e) { console.log(`응답이 역할표 JSON이 아니다: ${e.message}\n${text.slice(0, 400)}`); return 1; }
  // 덤프에 없는 이름은 버린다(모델이 지어낸 이름 · 표에 남아도 해는 없지만 측정이 흐려진다).
  const known = { layers: new Set(dump.layers.map(l => l.name)), blocks: new Set(dump.blocks.map(b => b.name)), texts: new Set(dump.texts.map(t => t.text)) };
  let invented = 0;
  for (const sec of ['layers', 'blocks', 'texts']) for (const name of Object.keys(table[sec])) if (!known[sec].has(name)) { delete table[sec][name]; invented++; }
  const { table: ok, errors } = checkRoles(table);
  for (const e of errors) console.log(`  ✗ ${e}`);
  const out = { meta: { model: msg.model, requested: a.model, dump: a.inPath, usage: msg.usage, invented, dropped: errors.length, at: new Date().toISOString() }, ...toJson(ok) };
  mkdirSync(dirname(resolve(a.outPath)), { recursive: true });
  writeFileSync(a.outPath, JSON.stringify(out, null, 1) + '\n');
  const missing = ['layers', 'blocks'].map(s => known[s].size - Object.keys(out[s]).length);
  console.log(`${a.outPath}: 레이어 ${ok.layers.size} · 블록 ${ok.blocks.size} · 문자 ${ok.texts.size} (빠진 레이어 ${missing[0]} · 블록 ${missing[1]} · 지어낸 이름 ${invented} · 잘못된 칸 ${errors.length})`);
  return 0;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
