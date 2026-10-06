// 공개 정답 코퍼스: node tools/dxf-corpus/public.mjs [--fetch] [--update] [--only N]
// WeiyaChen/CAD_rule_checker(MIT)의 아파트 평면 41쌍 — 원본 DXF와 사람이 단 정답 DXF(GT_<공간> 레이어의 닫힌 폴리선 = 방, GT_门 = 문).
// 우리 파이프라인(worker.js와 같은 순서)을 원본에 돌리고 정답과 견준다. 다른 사무소·다른 나라 관례에서 벽·방·문이 얼마나 서는지의 **측정**이다.
// 파일은 저장소 밖 ../dxf-public(DXF_PUBLIC_DIR)에 캐시한다. --fetch가 없는 파일만 받는다(약 100 MB).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { APP, OPN_TOL } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = process.env.DXF_PUBLIC_DIR ?? resolve(APP, '../dxf-public');
const BASE = resolve(HERE, 'public-baseline.json');
const REPO = 'WeiyaChen/CAD_rule_checker';
const RAW = `https://raw.githubusercontent.com/${REPO}/main/input_data`;
const argv = process.argv.slice(2);
const flag = f => argv.includes(f);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;   // 파일 이름 전체(확장자 없이)
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

// 정답: GT_ 레이어의 닫힌 LWPOLYLINE(DXF 좌표). 문은 GT_门.
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
  const raw = readFileSync(path);
  const t0 = performance.now();
  const parsed = handle({ type: 'parse', buf: raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), fileName: name });
  if (parsed.type !== 'parsed') return { name, error: parsed.code ?? 'parse' };
  const ex = handle({ type: 'extract', opts: { layers: parsed.summary.checked, region: 0, trace: false } });
  if (ex.type !== 'extracted') return { name, error: ex.code ?? 'extract', summary: parsed.summary };
  const ms = Math.round(performance.now() - t0);
  const { stats, project } = ex, fl = project.floors[0];
  const k = parsed.summary.unitScale ?? 1;
  const toApp = p => [(p[0] * k - stats.origin[0]) * stats.scale, -(p[1] * k - stats.origin[1]) * stats.scale];
  const { pointInPolygon } = await import('../../src/geom/rooms.js');
  const gt = await groundTruth(gtPath);
  const gtRooms = gt.rooms.map(r => r.pts.map(toApp)), gtDoors = gt.doors.map(d => d.pts.map(toApp));
  const roomHit = gtRooms.filter(g => fl.rooms.some(r => iou(g, r.points, pointInPolygon) >= 0.5)).length;
  const opens = fl.items.filter(i => /^(door-|window-|opening-pass)/.test(i.productId));
  // 문 적합은 로컬 점수판의 opnHit와 같은 규칙이다: 우리 개구부 중심에서 정답 문 **상자**까지(상자 안이면 0) OPN_TOL 안.
  // 상자 **중심**까지 재면 안 된다 — GT_门 상자는 대개 여닫이 궤적까지 그린 정사각형(900×900 · 800×800)이라 중심이 개구부
  // 중심에서 ≈ 폭/2 비껴 있다(2026-10-06: 중심 400 mm 규칙 712/1505 · 앉힌 문 489개를 못 셌다).
  // 상자는 앱 좌표로 옮긴 꼭짓점의 min·max다(toApp가 y를 뒤집는다). 가장 가까운 것: 상자 거리, 같으면 상자 중심 거리.
  const doorHit = gtDoors.filter(d => {
    const [x0, y0, x1, y1] = bbox(d), c = [(x0 + x1) / 2, (y0 + y1) / 2];
    const dBox = i => Math.hypot(Math.max(x0 - i.pos[0], 0, i.pos[0] - x1), Math.max(y0 - i.pos[1], 0, i.pos[1] - y1));
    const dMid = i => Math.hypot(i.pos[0] - c[0], i.pos[1] - c[1]);
    return !!opens.filter(i => dBox(i) <= OPN_TOL).sort((a, b) => dBox(a) - dBox(b) || dMid(a) - dMid(b))[0];
  }).length;
  return { name, walls: stats.walls, rooms: stats.rooms, openEnds: stats.openEnds.length, gtRooms: gtRooms.length, roomHit, gtDoors: gtDoors.length, doorHit, guessed: !!stats.guessed, ms };
}

const names = (await list()).filter(n => !only || n.replace(/\.dxf$/i, '') === only);
// 한 쌍이 실패해도(404 · 네트워크) 나머지는 받는다 — 실패는 표의 "파일 없음"으로 드러난다.
if (flag('--fetch')) for (const n of names) { try { await fetchPair(n); } catch (e) { console.log(`받기 실패 ${n}: ${e.message}`); } }
const COLS = ['walls', 'rooms', 'openEnds', 'gtRooms', 'roomHit', 'gtDoors', 'doorHit', 'ms'];
const WORSE = { roomHit: -1, doorHit: -1 };
const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : {};
const now = {}, sum = { gtRooms: 0, roomHit: 0, gtDoors: 0, doorHit: 0, errors: 0 };
let worse = 0;
console.log(['도면'.padEnd(22), ...COLS.map(c => c.padStart(9))].join(''));
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
  for (const c of ['gtRooms', 'roomHit', 'gtDoors', 'doorHit']) sum[c] += r[c];
  console.log([id.padEnd(22), ...COLS.map(c => String(r[c] ?? '-').padStart(9))].join(''));
  const b = base[id];
  if (!b || b.error) continue;
  const diff = [];
  for (const c of COLS) { if (c === 'ms' || b[c] === r[c]) continue; const bad = WORSE[c] && Math.sign(r[c] - b[c]) === WORSE[c]; if (bad) worse++; diff.push(`${c} ${b[c]} → ${r[c]}${bad ? ' ✗' : ''}`); }
  if (diff.length) console.log(`${''.padEnd(22)}  기준 대비: ${diff.join(' · ')}`);
}
const pct = (a, b) => (b ? Math.round(100 * a / b) : 0);
console.log(`\nΣ 방 ${sum.roomHit}/${sum.gtRooms} (${pct(sum.roomHit, sum.gtRooms)} %) · 문 ${sum.doorHit}/${sum.gtDoors} (${pct(sum.doorHit, sum.gtDoors)} %) · 오류 ${sum.errors}/${names.length}`);
if (flag('--update')) { writeFileSync(BASE, JSON.stringify({ ...now, 'Σ': sum }, null, 1) + '\n'); console.log('기준을 새로 썼습니다'); }
else if (worse) { console.log(`✗ 나빠진 지표 ${worse}개`); process.exit(1); }
