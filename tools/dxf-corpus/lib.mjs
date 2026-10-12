// DXF 코퍼스 도구의 공통부(2026-10-02). 도면 여러 장을 **앱과 같은 코드**(io/dxf/worker.js)로 돌려 채점한다.
// 한 도면에 맞춘 규칙이 다른 사무소 도면을 망가뜨리는지 고칠 때마다 확인하려는 것이다 — 실파일은 저장소 밖에 둔다
// (기본 ../dxf · DXF_DIR로 바꾼다). 워커는 node에 self가 없으므로 가짜 self를 심고 import한다(tests/의 관례).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP = resolve(HERE, '../..');
export const DXF_DIR = process.env.DXF_DIR ?? resolve(APP, '../dxf');
export const corpus = () => JSON.parse(readFileSync(resolve(HERE, 'corpus.json'), 'utf8'));
// 코퍼스 항목 → 실파일 경로(없으면 null — 그 도면은 건너뛴다).
export function fileOf(entry) {
  if (!existsSync(DXF_DIR)) return null;
  const name = readdirSync(DXF_DIR).find(f => /\.dxf$/i.test(f) && f.includes(entry.match));
  return name ? resolve(DXF_DIR, name) : null;
}

let onmessage = null;
const posts = [];
// 워커 메시지 한 번 → 마지막 응답(진행률 빼고). roles-dump.mjs도 쓴다(2026-10-12).
export async function worker() {
  if (!onmessage) {
    globalThis.self = { postMessage: m => posts.push(m), onmessage: null };
    await import('../../src/io/dxf/worker.js');
    onmessage = globalThis.self.onmessage;
  }
  return data => { posts.length = 0; onmessage({ data }); return posts.filter(m => m.type !== 'progress').at(-1); };
}

// 역할표 `--roles <dir>`(2026-10-12 · 계획 12 Task 9): 도면 id마다 `<dir>/<id>.json`(형식은 src/io/dxf/roles.js · README "역할표")을 읽어
// 파싱 옵션으로 넘긴다 — 표가 점수판을 얼마나 바꾸는지 재는 측정이다. 그래서 `--update`와 함께 쓰지 않는다(기준은 규칙만의 값이다).
// → { dir, error } (error가 있으면 부르는 쪽이 종료 코드 2로 멈춘다).
export function rolesOption(argv) {
  const i = argv.indexOf('--roles');
  if (i < 0) return { dir: null, error: null };
  const dir = argv[i + 1];
  if (dir == null || dir.startsWith('--')) return { dir: null, error: '--roles에 값(역할표 폴더)이 없다' };
  if (argv.includes('--update')) return { dir, error: '--update는 --roles와 함께 쓰지 않는다 — 기준은 역할표 없는 규칙의 값이다' };
  return { dir, error: null };
}
// `--dividers`(2026-10-12 · 계획 12 Task 6): 실명만으로 구획선(옵션 dividerByNames)을 켜고 잰다 — 측정이라 `--update`와 함께면 error(종료 코드 2 ·
// 기준은 꺼진 값이다 — 사용자 결정 2026-10-02: 면적 표기 없이 자동으로 긋지 않는다).
export function dividersOption(argv) {
  const on = argv.includes('--dividers');
  return { on, error: on && argv.includes('--update') ? '--update는 --dividers와 함께 쓰지 않는다 — 기준은 옵션이 꺼진 값이다' : null };
}
// `<dir>/<id>.json` → 원 JSON(워커가 checkRoles로 검사한다). 없으면 null이고 그 사실을 한 줄로 알린다(규칙만으로 돈다).
// 형식 오류가 있으면 버려지는 칸 수를 한 줄로 알린다(그 이름들은 규칙으로 간다).
export async function loadRoles(dir, id) {
  if (!dir) return null;
  const path = resolve(dir, `${id}.json`);
  if (!existsSync(path)) { console.log(`  (역할표 없음: ${path} — 규칙만)`); return null; }
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const { checkRoles } = await import('../../src/io/dxf/roles.js');
  const { table, errors } = checkRoles(raw);
  if (errors.length) console.log(`  (역할표 ${id}: 잘못된 칸 ${errors.length}개 버림 — ${errors.slice(0, 3).join(' · ')}${errors.length > 3 ? ' …' : ''})`);
  if (table) console.log(`  (역할표 ${id}: 레이어 ${table.layers.size} · 블록 ${table.blocks.size} · 문자 ${table.texts.size})`);
  return raw;
}

// DIMENSION 원문 스캔(ENTITIES 섹션만 — 블록 안 치수는 블록 좌표라 쓸 수 없다): 측정점 13/23 · 14/24, 회전 50, 종류 70.
export function scanDimensions(txt) {
  const L = txt.split(/\r?\n/), out = [];
  let section = null;
  for (let i = 0; i + 1 < L.length; i += 2) {
    const c = L[i].trim(), v = L[i + 1].trim();
    if (c === '0' && v === 'SECTION') { section = L[i + 3]?.trim(); continue; }
    if (c !== '0' || v !== 'DIMENSION' || section !== 'ENTITIES') continue;
    const k = {};
    for (let j = i + 2; j + 1 < L.length && L[j].trim() !== '0'; j += 2) k[L[j].trim()] ??= L[j + 1].trim();
    const type = (+k[70] || 0) & 7, p13 = [+k[13], +k[23]], p14 = [+k[14], +k[24]];
    if (type > 1 || ![...p13, ...p14].every(Number.isFinite)) continue;      // 선형·정렬 치수만
    const a = (+(k[50] ?? 0)) * Math.PI / 180;
    const geo = type === 0 ? Math.abs((p14[0] - p13[0]) * Math.cos(a) + (p14[1] - p13[1]) * Math.sin(a)) : Math.hypot(p14[0] - p13[0], p14[1] - p13[1]);
    if (geo >= 50) out.push({ p13, p14, geo });
  }
  return out;
}

// 실파일 원문 → 전개(DXF 좌표 · 단위 배율 전). 정답 자료(면적 표기·창·문 블록)가 같이 쓴다 — 디코드·파싱·전개는 한 번만(2026-10-06).
export async function explodeRaw(raw) {
  const { decodeDxf } = await import('../../src/io/dxf/decode.js');
  const { parseDxf } = await import('../../src/io/dxf/parse.js');
  const { explode } = await import('../../src/io/dxf/explode.js');
  return explode(parseDxf(decodeDxf(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)).txt), { arcSteps: 12 });
}

// 도면에 적힌 실 면적 표기("(15.39m²)")와 그 위의 실명 → [{ name, value, p }] (DXF 좌표). 정답 자료다. ex = explodeRaw(raw).
const AREA = /^\(?\s*(\d+(?:\.\d+)?)\s*(?:m²|㎡|m2)\s*\)?$/i;
export async function areaLabels(ex) {
  const clean = t => String(t.text ?? '').replace(/\s+/g, ' ').trim();
  const labels = ex.texts.filter(t => AREA.test(clean(t)));
  const names = ex.texts.filter(t => /[가-힣A-Za-z]/.test(clean(t)) && !AREA.test(clean(t)) && !/^\(\d+석\)$/.test(clean(t)));
  return labels.map(a => {
    let best = null;
    for (const n of names) { const d = Math.hypot(n.p[0] - a.p[0], n.p[1] - a.p[1]); if (n.p[1] > a.p[1] && d < 1500 && n.layer === a.layer && (!best || d < best.d)) best = { n, d }; }
    return { name: best ? clean(best.n).replace(/\s+/g, '') : null, value: +clean(a).match(AREA)[1], p: a.p };
  });
}

// 창·문 블록 정답(2026-10-06): 종류·호칭 폭·전개 도형 bbox와 그 중심(DXF 좌표). 3차 수정의 scratch 채점기(사동중 44개)가 저장소 도구로 왔다.
// 중심(c)은 도면 상자 안인지 가리는 데만, 적합 판정은 상자(box)로 한다.
// byName(2026-10-12 · Task 9): 정답은 이름 정규식만 쓴다 — 워커가 세운 역할표 블록 종류(모듈 수준 표)가 정답을 움직이지 않게.
// 폭(2026-10-12 · 계획 13 Task 6(b)): 이름의 숫자가 블록 도형 **전체**(상자의 긴 변 · k = 단위 배율로 mm)보다 NAME_FIT 위끝(1.1배) 넘게 넓으면
// 도형 폭이다(포켓은 그 절반 — 파이프라인 blockOpenings와 같은 규칙). 내곡중 `미서기단창_5200`은 3900, `_7800`은 5200으로 그려졌고(INSERT 배율 1)
// 벽 면선이 정확히 그 폭에서 끊긴다(문설주 선 37832·41732 / 39878·45078 — scratch p13t6-faces.mjs) — 이름이 틀렸다. 어느 축이 벽 방향인지
// 정답은 모르므로(문은 로컬 y로 그린 것도 있다 — 방음문 로컬 x 1317) 아래끝(0.4배)은 쓰지 않는다: 긴 변보다 넓은 이름만 고친다.
export async function blockTruth(ex, k = 1) {
  const { blockBoxes, NAME_FIT } = await import('../../src/io/dxf/blockOpenings.js');
  return blockBoxes(ex, { byName: true }).map(b => {
    const D = k * Math.max(b.box[2] - b.box[0], b.box[3] - b.box[1]);
    const width = D > 0 && b.width > NAME_FIT[1] * D ? Math.round(b.kind === 'pocket' ? D / 2 : D) : b.width;
    return { name: b.name, kind: b.kind, width, box: b.box, c: [(b.box[0] + b.box[2]) / 2, (b.box[1] + b.box[3]) / 2] };
  });
}

// 손으로 단 개구부 정답(2026-10-12 · 계획 12 Task 2): 창·문 블록이 없는 도면(신상중 — 문·창이 풀어진 선)은 blockTruth가 0개라
// 개구부 지표가 아무것도 재지 못한다. truth/<코퍼스 id>.json의 openings[]({ kind, width, c: 원 DXF 좌표, along: 벽 방향 축 'x'|'y' })를
// blockTruth와 같은 꼴로 내고, 상자는 벽 방향 ±폭/2 · 가로 ±MANUAL_ACROSS다(블록 정답과 같은 상자까지 거리 규칙으로 잰다).
// 이 파일은 코퍼스 주인이 도면에서 단 값이다 — 파이프라인 결과에 맞추려고 고치지 않는다.
const MANUAL_ACROSS = 150;
export function manualTruth(id) {
  const path = resolve(HERE, 'truth', `${id}.json`);
  if (!existsSync(path)) return [];
  return (JSON.parse(readFileSync(path, 'utf8')).openings ?? []).map((o, i) => {
    const h = o.width / 2, [x, y] = o.c;
    const box = o.along === 'x' ? [x - h, y - MANUAL_ACROSS, x + h, y + MANUAL_ACROSS] : [x - MANUAL_ACROSS, y - h, x + MANUAL_ACROSS, y + h];
    return { name: `manual:${id}#${i + 1}`, kind: o.kind, width: o.width, box, c: [x, y] };
  });
}

// 개구부 적합 허용 거리(mm, 2026-10-06): 우리 개구부 중심에서 정답 블록 **상자**까지(상자 안이면 0). 처음엔 상자 **중심**까지를
// max(300, 폭/2 + 50) 안에서 봤는데, 포켓(절반이 벽 속 주머니)과 여닫이(열린 문짝까지 그림)는 상자 중심이 개구부 중심에서 ≈ 폭/2
// 비껴 있어 여유가 없었고(사동중 포켓 453~460·502 mm / 허용 500, 내곡중 SD850 446 / 475), 긴 창은 거꾸로 너무 느슨했다(4800 창은
// 2450 mm 안의 무엇이든). 상자까지 재면 포켓의 개구부 중심은 상자 안, 여닫이의 개구부 중심은 문틀 쪽 상자 변 위라 폭/2 비낌이
// 사라지고 긴 창은 엄격해진다. 200은 벽 중심선과 블록 틀의 어긋남 여유다: 150 → 200(2026-10-06)으로 상자에서 138 mm인 사동중
// 포켓 하나에 62 mm, 내곡중 FSD800에 100 mm 여유를 두고도 가장 가까운 진짜 빗나감(473 mm)보다 273 mm 아래다.
export const OPN_TOL = 200;

// opnKind의 종류 맞음(정답 종류 kind ↔ 우리 아이템 제품 id): 문·포켓·미닫이 정답에 door-*, 창 정답에 window-*, 통로 정답에 opening-pass.
// slide·pass(2026-10-12 · 계획 12 최종 리뷰 X-3): aa2b710이 블록 종류에 더한 뒤로도 여기는 door·pocket·window만 알아, 그 정답은 opnKind를 얻을 수
// 없었다. 코퍼스에는 slide·pass 정답이 0개라(신상중 손 정답 일곱은 door) 점수는 그대로다 — 정규화 DXF를 코퍼스로 쓸 때를 위한 것이다.
export const kindOk = (kind, id) => ((kind === 'door' || kind === 'pocket' || kind === 'slide') && id.startsWith('door-'))
  || (kind === 'window' && id.startsWith('window-')) || (kind === 'pass' && id === 'opening-pass');

// 한 도면을 앱과 같은 순서로 돌린다 → { summary, project, stats, metrics }. roles = 역할표 원 JSON(loadRoles · 없으면 규칙만).
// dividers = 실명만으로 구획선 옵션(dividersOption · 기본 꺼짐).
export async function runDrawing(entry, { roles = null, dividers = false } = {}) {
  const path = fileOf(entry);
  if (!path) return null;
  const handle = await worker();
  const raw = readFileSync(path);
  const t0 = performance.now();
  const parsed = handle({ type: 'parse', buf: raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), fileName: path.split(/[\\/]/).pop(), ...(roles ? { roles } : {}) });
  if (parsed.type !== 'parsed') return { error: parsed.code ?? 'parse', path };
  const { summary } = parsed;
  const ex = handle({ type: 'extract', opts: { layers: summary.checked, region: entry.region ?? 0, trace: false, ...(dividers ? { dividerByNames: true } : {}) } });
  if (ex.type !== 'extracted') return { error: ex.code ?? 'extract', path, summary };
  const ms = Math.round(performance.now() - t0);
  const { project, stats } = ex, fl = project.floors[0];
  // 치수 적합: 측정점(앱 좌표로 옮김)이 벽 면·중심선이나 기둥 면·중심에서 5 mm 안에 드는 비율. 도면 상자 안의 치수만.
  // DXF 원 좌표 → 앱 좌표: 워커가 전개를 unitScale배로 mm로 만든 뒤(2026-10-06) origin을 뺀다. 실파일 넷은 전부 mm(배율 1)다.
  // 배율은 추출이 실제로 쓴 stats.unitScale을 먼저 본다(없으면 parse 요약 · 2026-10-06 최종 리뷰).
  const k = stats.unitScale ?? summary.unitScale ?? 1;
  const toApp = p => [(p[0] * k - stats.origin[0]) * stats.scale, -(p[1] * k - stats.origin[1]) * stats.scale];
  const cols = fl.items.filter(i => i.kind === 'column');
  let ends = 0, hit = 0;
  const half = [stats.size[0] / 2 + 3000, stats.size[1] / 2 + 3000];
  const near = p => Math.abs(p[0]) <= half[0] && Math.abs(p[1]) <= half[1];
  for (const d of scanDimensions(new TextDecoder().decode(raw))) {
    const p = [toApp(d.p13), toApp(d.p14)];
    if (!p.every(near)) continue;
    const ax = Math.abs(p[1][0] - p[0][0]) >= Math.abs(p[1][1] - p[0][1]) ? 0 : 1;
    for (const q of p) {
      ends++;
      const c = [];
      for (const w of fl.walls) { if (Math.abs(w.a[ax] - w.b[ax]) > 2) continue; c.push(w.a[ax], w.a[ax] - w.thickness / 2, w.a[ax] + w.thickness / 2); }
      for (const k of cols) { const turned = Math.abs(Math.sin((k.rot ?? 0) * Math.PI / 180)) > 0.5, h = (ax === 0 ? (turned ? k.size[1] : k.size[0]) : (turned ? k.size[0] : k.size[1])) / 2; c.push(k.pos[ax], k.pos[ax] - h, k.pos[ax] + h); }
      if (c.some(f => Math.abs(f - q[ax]) <= 5)) hit++;
    }
  }
  // 면적 적합: 도면의 면적 표기 ↔ 그 자리(또는 그 이름)의 방의 "도면 기준" 넓이. ±0.05 m² 안이면 맞은 것이다.
  const { pointInPolygon } = await import('../../src/geom/rooms.js');
  const exRaw = await explodeRaw(raw);
  const labels = (await areaLabels(exRaw)).filter(a => near(toApp(a.p)));
  const bare = s => String(s ?? '').replace(/\s+/g, '');
  let areaOk = 0;
  const areaRows = labels.map(a => {
    const room = fl.rooms.find(r => pointInPolygon(toApp(a.p), r.points)) ?? fl.rooms.find(r => a.name && bare(r.name) === a.name);
    const got = room ? room.areaCenter : null, ok = got != null && Math.abs(got - a.value) <= 0.05;
    if (ok) areaOk++;
    return { name: a.name, label: a.value, got: got == null ? null : Math.round(got * 100) / 100, room: room?.name ?? null, ok };
  });
  // 개구부 적합: 정답 블록 상자에서 OPN_TOL 안에 우리 개구부(문·창·개구부 아이템) 중심이 있는가, 있으면 폭이 50 mm 안인가
  // (이름에 폭이 없는 블록은 폭 검사를 늘 통과한다). 정답 = 블록 정답 + 손 정답(truth/<id>.json · 2026-10-12).
  const opens = fl.items.filter(i => /^(door-|window-|opening-pass)/.test(i.productId));
  const truth = [...(await blockTruth(exRaw, k)), ...manualTruth(entry.id)].filter(t => near(toApp(t.c)));
  // opnKind(2026-10-12): 맞힌 정답 중 가장 가까운 아이템의 **종류**도 맞는 수(kindOk — 아래 모듈 수준).
  // 자리 적중(opnHit)은 창이 문 자리를 차지해도 세므로 종류는 따로 센다
  // (신상중 외미닫이 일곱 자리는 규칙 전에도 opnHit 7/7이었다 — 전부 창·통로였다).
  let opnHit = 0, opnWidth = 0, opnKind = 0;
  for (const t of truth) {
    // 상자 네 귀를 앱 좌표로 옮긴 뒤 min·max를 다시 잡는다 — toApp는 y를 뒤집는다.
    const P = [[t.box[0], t.box[1]], [t.box[2], t.box[1]], [t.box[0], t.box[3]], [t.box[2], t.box[3]]].map(toApp);
    const x0 = Math.min(...P.map(p => p[0])), x1 = Math.max(...P.map(p => p[0])), y0 = Math.min(...P.map(p => p[1])), y1 = Math.max(...P.map(p => p[1]));
    const c = toApp(t.c);
    const dBox = i => Math.hypot(Math.max(x0 - i.pos[0], 0, i.pos[0] - x1), Math.max(y0 - i.pos[1], 0, i.pos[1] - y1));
    const dMid = i => Math.hypot(i.pos[0] - c[0], i.pos[1] - c[1]);
    // 가장 가까운 것: 상자까지의 거리, 같으면(둘 다 상자 안 — 긴 창이 둘로 나뉜 자리) 상자 중심에 가까운 것.
    const it = opens.filter(i => dBox(i) <= OPN_TOL).sort((a, b) => dBox(a) - dBox(b) || dMid(a) - dMid(b))[0];
    if (!it) continue;
    opnHit++;
    // 폭(2026-10-12 · 계획 12 Task 7 — 사동중 win-4800-3 둘째(T자 칸막이)): 블록 개구부 하나가 같은 선 위 벽 조각들에 나뉘어 앉으면
    // 조각들이 같은 openingGroup 표지를 갖는다 — 가장 가까운 아이템의 무리 전체 폭을 더해 정답 폭과 맞댄다(무리가 없으면 그 아이템 폭).
    const w = it.openingGroup ? opens.filter(i => i.openingGroup === it.openingGroup).reduce((a, i) => a + i.size[0], 0) : it.size[0];
    if (!t.width || Math.abs(w - t.width) <= 50) opnWidth++;
    if (kindOk(t.kind, it.productId)) opnKind++;
  }
  const count = re => fl.items.filter(i => re.test(i.productId)).length;
  const metrics = {
    regions: summary.regions.length,
    walls: stats.walls, rooms: stats.rooms, areaM2: stats.areaM2,
    named: fl.rooms.filter(r => r.name).length, unmatched: stats.unmatchedNames.length,
    openEnds: stats.openEnds.length, tiny: fl.rooms.filter(r => r.area < 1.5).length,
    dimFit: ends ? Math.round(100 * hit / ends) : null, dimEnds: ends,
    areaOk, areaAll: labels.length,
    opnAll: truth.length, opnHit, opnWidth, opnKind,
    doors: count(/^door-/), windows: count(/^window-/), passes: count(/^opening-pass/), columns: cols.length,
    guessed: !!stats.guessed, ms,
  };
  return { path, summary, project, stats, metrics, areaRows };
}

// 방향이 있는 지표: 값이 이쪽으로 가면 나빠진 것이다(벽·방 수 같은 나머지는 바뀌면 알리기만 한다).
export const WORSE = { named: -1, unmatched: +1, openEnds: +1, tiny: +1, dimFit: -1, areaOk: -1, opnHit: -1, opnWidth: -1, opnKind: -1 };
