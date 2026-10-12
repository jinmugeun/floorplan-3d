// 공개 정답 코퍼스: node tools/dxf-corpus/public.mjs [--fetch] [--update] [--only "<도면 이름>"] [--ends "<도면 이름>"]
// (--only는 파일 이름 전체 · 확장자 없이, 예 "2suite (10)". --update는 --only와 함께 쓰지 못한다 — 종료 코드 2.)
// --ends는 그 도면 하나만 돌리고(--only와 같다) 끊긴 끝점마다 원 DXF 좌표와 300 mm 안의 선분을 레이어별로 낸다(아래 endsReport).
// WeiyaChen/CAD_rule_checker(MIT)의 아파트 평면 유효 39쌍(40 파일, 6suite (5)는 정답 없음) — 원본 DXF와 사람이 단 정답 DXF
// (GT_<공간> 레이어의 폴리선 = 방, GT_门 = 문). 우리 파이프라인(worker.js와 같은 순서)을 원본에 돌리고 정답과 견준다. 다른 사무소·
// 다른 나라 관례에서 벽·방·문이 얼마나 서는지의 **측정**이다.
// 파일은 저장소 밖 ../dxf-public(DXF_PUBLIC_DIR)에 캐시한다. --fetch가 없는 파일만 받는다(80 파일 · 약 82 MB).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { APP, OPN_TOL, explodeRaw, rolesOption, loadRoles, dividersOption } from './lib.mjs';
import { roomScores } from './roomScore.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = process.env.DXF_PUBLIC_DIR ?? resolve(APP, '../dxf-public');
const BASE = resolve(HERE, 'public-baseline.json');
const REPO = 'WeiyaChen/CAD_rule_checker';
const RAW = `https://raw.githubusercontent.com/${REPO}/main/input_data`;
const argv = process.argv.slice(2);
const flag = f => argv.includes(f);
const ends = flag('--ends');
const hasOnly = flag('--only') || ends;
const only = hasOnly ? argv[argv.indexOf(ends ? '--ends' : '--only') + 1] : null;   // 파일 이름 전체(확장자 없이)
// 2026-10-06 최종 리뷰: 값이 없는 --only(다음 인자가 없거나 --로 시작)와 맞는 도면이 없는 --only(아래)는 종료 코드 2다 — 오타로
// 0개를 채점하고 "나빠진 지표 없음"으로 통과하지 않게. --only와 --update를 함께 쓰면 거절한다: 일부만 돌린 결과로 기준을 쓰지
// 않는다(아래 병합이 안전망이고, 이 거절이 정책이다).
if (hasOnly && (only == null || only.startsWith('--'))) { console.log(`해당 도면 없음: ${only ?? '(값 없음)'}`); process.exit(2); }
if (hasOnly && flag('--update')) { console.log('--update는 --only와 함께 쓰지 않는다 — 기준은 전체 실행으로만 쓴다'); process.exit(2); }
// --roles <dir>(2026-10-12 · 계획 12 Task 9): 도면마다 `<dir>/<도면 이름>.json` 역할표(예 `2suite (1).json`)를 파싱 옵션으로 넘긴다 —
// 측정이라 --update와 함께면 종료 코드 2(--only와 같은 정책).
const rolesArg = rolesOption(argv);
if (rolesArg.error) { console.log(rolesArg.error); process.exit(2); }
// --dividers(2026-10-12 · 계획 12 Task 6): 실명만으로 구획선 옵션을 켜고 잰다 — 측정이라 --update와 함께면 종료 코드 2(기준은 꺼진 값).
const divArg = dividersOption(argv);
if (divArg.error) { console.log(divArg.error); process.exit(2); }
const UA = { headers: { 'User-Agent': 'floorplan-3d dxf-corpus' } };

// `<n>suite (k).dxf`만 쓴다: sample.dxf는 2suite (6)과 같은 파일이고 정답 이름 꼴(sample_Annotated)이 다르다. 숫자 순.
const usable = names => names.filter(n => /^\d+suite \(\d+\)\.dxf$/i.test(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
async function list() {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/contents/input_data/dxf`, UA);
    if (!r.ok) throw new Error(`목록 ${r.status}`);
    return usable((await r.json()).map(f => f.name));
  } catch (e) {
    // 오프라인·API 한도: 캐시된 파일로 간다 — 점수판은 네트워크 없이도 돌아야 한다(Task 10 게이트).
    if (!existsSync(DIR)) throw e;
    console.log(`목록을 못 받아 캐시를 쓴다(${e.message})`);
    return usable(readdirSync(DIR).filter(n => !/_annotated/i.test(n)));
  }
}
const gtName = n => n.replace(/^(\S+) /, '$1_annotated ');
async function fetchPair(name) {
  mkdirSync(DIR, { recursive: true });
  for (const [sub, file] of [['dxf', name], ['dxf_gt', gtName(name)]]) {
    const out = resolve(DIR, file);
    if (existsSync(out)) continue;
    const r = await fetch(`${RAW}/${sub}/${encodeURIComponent(file)}`, UA);
    if (!r.ok) throw new Error(`${file} ${r.status}`);
    writeFileSync(out, Buffer.from(await r.arrayBuffer()));
    console.log(`받음 ${file}`);
  }
}

let onmessage = null;
const posts = [];
async function worker() {
  if (!onmessage) { globalThis.self = { postMessage: m => posts.push(m), onmessage: null }; await import('../../src/io/dxf/worker.js'); onmessage = globalThis.self.onmessage; }
  return data => { posts.length = 0; onmessage({ data }); return posts.filter(m => m.type !== 'progress').at(-1); };
}

// 정답(DXF 좌표): `GT_*` 레이어의 LWPOLYLINE 중 점이 3개 이상인 것 — 닫힘 플래그·페이퍼스페이스는 보지 않는다(2026-10-06 최종 리뷰).
// 레이어가 GT_门이면 문, 나머지 GT_*는 방이다.
async function groundTruth(path) {
  const { decodeDxf } = await import('../../src/io/dxf/decode.js');
  const { parseDxf } = await import('../../src/io/dxf/parse.js');
  const raw = readFileSync(path);
  const doc = parseDxf(decodeDxf(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)).txt);
  const polys = doc.entities.filter(e => e.type === 'LWPOLYLINE' && /^GT_/.test(e.layer ?? '') && (e.pts?.length ?? 0) >= 3).map(e => ({ layer: e.layer, pts: e.pts }));
  return { rooms: polys.filter(p => p.layer !== 'GT_门'), doors: polys.filter(p => p.layer === 'GT_门') };
}
const bbox = pts => pts.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
// IoU 근사: 두 상자의 합집합을 200 mm 격자로 표본해 안팎을 센다.
function iou(a, b, pip, step = 200) {
  const A = bbox(a), B = bbox(b);
  if (Math.min(A[2], B[2]) <= Math.max(A[0], B[0]) || Math.min(A[3], B[3]) <= Math.max(A[1], B[1])) return 0;
  let both = 0, either = 0;
  for (let x = Math.min(A[0], B[0]) + step / 2; x < Math.max(A[2], B[2]); x += step) for (let y = Math.min(A[1], B[1]) + step / 2; y < Math.max(A[3], B[3]); y += step) {
    const p = [x, y], ia = pip(p, a), ib = pip(p, b);
    if (ia && ib) both++;
    if (ia || ib) either++;
  }
  return either ? both / either : 0;
}

async function score(name) {
  const path = resolve(DIR, name), gtPath = resolve(DIR, gtName(name));
  if (!existsSync(path) || !existsSync(gtPath)) return { name, error: '파일 없음(--fetch)' };
  const handle = await worker();
  const roles = await loadRoles(rolesArg.dir, name.replace(/\.dxf$/i, ''));
  const raw = readFileSync(path);
  const t0 = performance.now();
  const parsed = handle({ type: 'parse', buf: raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), fileName: name, ...(roles ? { roles } : {}) });
  if (parsed.type !== 'parsed') return { name, error: parsed.code ?? 'parse' };
  const ex = handle({ type: 'extract', opts: { layers: parsed.summary.checked, region: 0, trace: false, ...(divArg.on ? { dividerByNames: true } : {}) } });
  if (ex.type !== 'extracted') return { name, error: ex.code ?? 'extract', summary: parsed.summary };
  const ms = Math.round(performance.now() - t0);
  const { stats, project } = ex, fl = project.floors[0];
  const k = stats.unitScale ?? parsed.summary.unitScale ?? 1;   // 추출이 실제로 쓴 배율이 먼저(lib.mjs와 같다 · 2026-10-06 최종 리뷰)
  const toApp = p => [(p[0] * k - stats.origin[0]) * stats.scale, -(p[1] * k - stats.origin[1]) * stats.scale];
  const { pointInPolygon } = await import('../../src/geom/rooms.js');
  const gt = await groundTruth(gtPath);
  const gtRooms = gt.rooms.map(r => r.pts.map(toApp)), gtDoors = gt.doors.map(d => d.pts.map(toApp));
  // IoU 표(정답 방 × 우리 방)를 한 번만 재고 roomHit·falseRooms·splitRooms(roomScore.mjs — 뜻과 문턱은 거기)가 같은 표를 읽는다(2026-10-12 ·
  // 계획 13 Task 7: splitRooms가 행 전체를 봐야 해서 예전의 열마다 따로 잰 some() 단락을 한 표로 모았다 · 같은 iou라 앞의 두 열 값은 그대로다).
  const M = gtRooms.map(g => fl.rooms.map(r => iou(g, r.points, pointInPolygon)));
  const { roomHit, falseRooms, splitRooms } = roomScores(M, fl.rooms.length);
  const opens = fl.items.filter(i => /^(door-|window-|opening-pass)/.test(i.productId));
  // 문 적합은 로컬 점수판의 opnHit와 같은 규칙이다: 우리 개구부 중심에서 정답 문 **상자**까지(상자 안이면 0) OPN_TOL 안.
  // 상자 **중심**까지 재면 안 된다 — GT_门 상자는 대개 여닫이 궤적까지 그린 정사각형(900×900 · 800×800)이라 중심이 개구부
  // 중심에서 ≈ 폭/2 비껴 있다(2026-10-06: 중심 400 mm 규칙 712/1505 · 앉힌 문 489개를 못 셌다).
  // 상자는 앱 좌표로 옮긴 꼭짓점의 min·max다(toApp가 y를 뒤집는다). 있고 없음만 센다 — 폭을 보지 않으니 가장 가까운 것을 고를
  // 까닭이 없다(2026-10-06 최종 리뷰: 정렬은 결과에 쓰이지 않았다).
  const doorHit = gtDoors.filter(d => {
    const [x0, y0, x1, y1] = bbox(d);
    const dBox = i => Math.hypot(Math.max(x0 - i.pos[0], 0, i.pos[0] - x1), Math.max(y0 - i.pos[1], 0, i.pos[1] - y1));
    return opens.some(i => dBox(i) <= OPN_TOL);
  }).length;
  if (ends) await endsReport(raw, stats, fl, k, parsed.summary.layers);
  return { name, walls: stats.walls, rooms: stats.rooms, openEnds: stats.openEnds.length, gtRooms: gtRooms.length, roomHit, falseRooms, splitRooms, gtDoors: gtDoors.length, doorHit, guessed: !!stats.guessed, ms };
}

// --ends(2026-10-12 · 계획 12 Task 4 진단): 끊긴 끝점(stats.openEnds · 앱 좌표)을 toApp의 역으로 원 DXF 좌표에 되돌리고, 그 점에서
// ENDS_R 안의 원본 선분(explodeRaw · 단위 배율 전)을 레이어별로 묶는다 — 선 수 · 길이 중앙값 · 끝의 벽 방향과 10° 안으로 나란한 선의
// 벽 중심선에서의 가로 거리(5 mm 계급 · 겹치는 값은 한 번) · 그 선들이 끝 너머로 뻗은 가장 먼 거리(ahead). 2suite (1)·4suite (9)·
// 6suite (6)의 끊긴 끝이 WINDOW 선 옆인지, 그 선이 벽 면에서 얼마나 비껴 있는지 재려고 만들었다.
const ENDS_R = 300;
async function endsReport(raw, stats, fl, k, rows) {
  const fromApp = p => [(p[0] / stats.scale + stats.origin[0]) / k, (-p[1] / stats.scale + stats.origin[1]) / k];
  const role = new Map(rows.map(r => [r.name, r.role]));
  const ex = await explodeRaw(raw);
  const key = p => `${Math.round(p[0])},${Math.round(p[1])}`;
  const dSeg = (p, a, b) => {
    const d = [b[0] - a[0], b[1] - a[1]], L2 = d[0] * d[0] + d[1] * d[1];
    const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L2)) : 0;
    return Math.hypot(p[0] - a[0] - d[0] * t, p[1] - a[1] - d[1] * t);
  };
  const med = xs => { const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.floor(s.length / 2)]); };
  stats.openEnds.forEach((pa, i) => {
    const w = fl.walls.find(x => key(x.a) === key(pa) || key(x.b) === key(pa));
    const q = fromApp(pa), o = w && fromApp(key(w.a) === key(pa) ? w.b : w.a);
    const L = o ? Math.hypot(q[0] - o[0], q[1] - o[1]) : 0;
    const u = L ? [(q[0] - o[0]) / L, (q[1] - o[1]) / L] : null;   // 끝이 향하는 쪽(원 DXF 좌표)
    const by = new Map();
    for (const s of ex.segs) {
      if (dSeg(q, s.a, s.b) * k > ENDS_R) continue;
      const g = by.get(s.layer) ?? by.set(s.layer, { lens: [], offs: new Set(), ahead: -Infinity }).get(s.layer);
      const d = [s.b[0] - s.a[0], s.b[1] - s.a[1]], Ls = Math.hypot(d[0], d[1]);
      g.lens.push(Ls * k);
      if (!u || !Ls || Math.abs(u[0] * d[1] - u[1] * d[0]) / Ls > Math.sin(Math.PI / 18)) continue;
      const m = [(s.a[0] + s.b[0]) / 2 - q[0], (s.a[1] + s.b[1]) / 2 - q[1]];
      g.offs.add(Math.round((m[1] * u[0] - m[0] * u[1]) * k / 5) * 5);
      for (const p of [s.a, s.b]) g.ahead = Math.max(g.ahead, ((p[0] - q[0]) * u[0] + (p[1] - q[1]) * u[1]) * k);
    }
    const dir = u ? (Math.abs(u[0]) >= Math.abs(u[1]) ? (u[0] > 0 ? '+x' : '-x') : (u[1] > 0 ? '+y' : '-y')) : '?';
    console.log(`#${i + 1} DXF (${Math.round(q[0])}, ${Math.round(q[1])}) 끝 방향 ${dir} · 두께 ${w?.thickness ?? '-'} · 벽 길이 ${Math.round(L * k)}`);
    for (const [layer, g] of [...by].sort((a, b) => b[1].lens.length - a[1].lens.length)) {
      const par = g.offs.size ? ` · 나란한 선 가로 [${[...g.offs].sort((a, b) => a - b).join(', ')}] · 너머 ${Math.round(g.ahead)}` : '';
      console.log(`    ${layer}(${role.get(layer) ?? '?'}) ${g.lens.length}개 · 길이 중앙값 ${med(g.lens)}${par}`);
    }
  });
}

const names = (await list()).filter(n => !hasOnly || n.replace(/\.dxf$/i, '') === only);
if (hasOnly && !names.length) { console.log(`해당 도면 없음: ${only}`); process.exit(2); }
// 한 쌍이 실패해도(404 · 네트워크) 나머지는 받는다 — 실패는 표의 "파일 없음"으로 드러난다.
if (flag('--fetch')) for (const n of names) { try { await fetchPair(n); } catch (e) { console.log(`받기 실패 ${n}: ${e.message}`); } }
const COLS = ['walls', 'rooms', 'openEnds', 'gtRooms', 'roomHit', 'falseRooms', 'splitRooms', 'gtDoors', 'doorHit', 'ms'];
const WORSE = { roomHit: -1, falseRooms: +1, splitRooms: +1, doorHit: -1 };
const SUMS = ['gtRooms', 'roomHit', 'falseRooms', 'splitRooms', 'gtDoors', 'doorHit'];   // 합계 줄 Σ의 칸(falseRooms가 null인 도면은 0으로 더한다)
const zeroSum = () => Object.fromEntries([...SUMS, 'errors'].map(c => [c, 0]));      // 합계 칸은 SUMS 한 곳에서 — 기준 Σ와 표 Σ가 어긋나지 않게
const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : {};
const now = {}, sum = zeroSum();
let worse = 0;
const cw = c => Math.max(9, c.length + 1);   // 열 폭(이름이 9자를 넘는 falseRooms도 한 칸 띄운다)
console.log(['도면'.padEnd(22), ...COLS.map(c => c.padStart(cw(c)))].join(''));
for (const n of names) {
  const r = await score(n);
  const id = n.replace(/\.dxf$/i, '');
  if (r.error) {
    sum.errors++; now[id] = { error: r.error }; console.log(`${id.padEnd(22)} 오류 ${r.error}`);
    if (base[id] && !base[id].error) { worse++; console.log(`${''.padEnd(22)}  기준에서는 됐다 ✗`); }   // 되던 도면이 안 되면 나빠진 것이다
    continue;
  }
  const { ms: _ms, ...keep } = r;   // 시간은 표에만 — 기준 파일은 지표가 바뀔 때만 바뀐다
  now[id] = keep;
  for (const c of SUMS) sum[c] += r[c] ?? 0;
  console.log([id.padEnd(22), ...COLS.map(c => String(r[c] ?? '-').padStart(cw(c)))].join(''));
  const b = base[id];
  if (!b || b.error) continue;
  const diff = [];
  for (const c of COLS) { if (c === 'ms' || b[c] === r[c]) continue; const bad = WORSE[c] && Math.sign(r[c] - b[c]) === WORSE[c]; if (bad) worse++; diff.push(`${c} ${b[c]} → ${r[c]}${bad ? ' ✗' : ''}`); }
  if (diff.length) console.log(`${''.padEnd(22)}  기준 대비: ${diff.join(' · ')}`);
}
// 전체 실행에서 기준에 있는 도면이 이번에 없으면(목록·캐시에서 빠졌다) 나빠진 것이다 — 조용히 덜 채점하지 않게(2026-10-06 최종 리뷰).
if (!hasOnly) for (const id of Object.keys(base)) if (id !== 'Σ' && !(id in now)) { worse++; console.log(`${id}  기준에 있는데 이번 실행에 없음 ✗`); }
const pct = (a, b) => (b ? Math.round(100 * a / b) : 0);
console.log(`\nΣ 방 ${sum.roomHit}/${sum.gtRooms} (${pct(sum.roomHit, sum.gtRooms)} %) · 정답 없는 방 ${sum.falseRooms} · 과분할 정답 방 ${sum.splitRooms} · 문 ${sum.doorHit}/${sum.gtDoors} (${pct(sum.doorHit, sum.gtDoors)} %) · 오류 ${sum.errors}/${names.length}`);
if (flag('--update')) {
  // 기준 줄은 지우지 않는다: 옛 기준에 이번 줄을 덮어 병합하고 Σ는 병합한 줄들로 다시 센다(2026-10-06 최종 리뷰 — 예전에는 이번에
  // 돈 도면만 남아, 일부만 돈 실행이 나머지 기준을 지웠다).
  const { 'Σ': _oldSum, ...rows } = base;
  const merged = { ...rows, ...now }, total = zeroSum();
  for (const r of Object.values(merged)) {
    if (r.error) { total.errors++; continue; }
    for (const c of SUMS) total[c] += r[c] ?? 0;
  }
  writeFileSync(BASE, JSON.stringify({ ...merged, 'Σ': total }, null, 1) + '\n'); console.log('기준을 새로 썼습니다');
}
else if (worse) { console.log(`✗ 나빠진 지표 ${worse}개`); process.exit(1); }
