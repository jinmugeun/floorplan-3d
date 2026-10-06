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
async function worker() {
  if (!onmessage) {
    globalThis.self = { postMessage: m => posts.push(m), onmessage: null };
    await import('../../src/io/dxf/worker.js');
    onmessage = globalThis.self.onmessage;
  }
  return data => { posts.length = 0; onmessage({ data }); return posts.filter(m => m.type !== 'progress').at(-1); };
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

// 창·문 블록 정답(2026-10-06): 종류·호칭 폭·전개 도형 bbox 중심(DXF 좌표). 3차 수정의 scratch 채점기(사동중 44개)가 저장소 도구로 왔다.
export async function blockTruth(ex) {
  const { blockBoxes } = await import('../../src/io/dxf/blockOpenings.js');
  return blockBoxes(ex).map(b => ({ name: b.name, kind: b.kind, width: b.width, c: [(b.box[0] + b.box[2]) / 2, (b.box[1] + b.box[3]) / 2] }));
}

// 한 도면을 앱과 같은 순서로 돌린다 → { summary, project, stats, metrics }.
export async function runDrawing(entry) {
  const path = fileOf(entry);
  if (!path) return null;
  const handle = await worker();
  const raw = readFileSync(path);
  const t0 = performance.now();
  const parsed = handle({ type: 'parse', buf: raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), fileName: path.split(/[\\/]/).pop() });
  if (parsed.type !== 'parsed') return { error: parsed.code ?? 'parse', path };
  const { summary } = parsed;
  const ex = handle({ type: 'extract', opts: { layers: summary.checked, region: entry.region ?? 0, trace: false } });
  if (ex.type !== 'extracted') return { error: ex.code ?? 'extract', path, summary };
  const ms = Math.round(performance.now() - t0);
  const { project, stats } = ex, fl = project.floors[0];
  // 치수 적합: 측정점(앱 좌표로 옮김)이 벽 면·중심선이나 기둥 면·중심에서 5 mm 안에 드는 비율. 도면 상자 안의 치수만.
  // DXF 원 좌표 → 앱 좌표: 워커가 전개를 unitScale배로 mm로 만든 뒤(2026-10-06) origin을 뺀다. 실파일 넷은 전부 mm(배율 1)다.
  const k = summary.unitScale ?? 1;
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
  // 개구부 적합: 정답 블록 자리(중심 거리 ≤ max(300, 폭/2 + 50) — 포켓은 블록의 절반이 주머니라 중심이 폭/2 비껴 있다)에 우리
  // 개구부(문·창·개구부 아이템)가 있는가, 있으면 폭이 50 mm 안인가.
  const opens = fl.items.filter(i => /^(door-|window-|opening-pass)/.test(i.productId));
  const truth = (await blockTruth(exRaw)).filter(t => near(toApp(t.c)));
  let opnHit = 0, opnWidth = 0;
  for (const t of truth) {
    const c = toApp(t.c), tol = Math.max(300, t.width / 2 + 50);
    const it = opens.filter(i => Math.hypot(i.pos[0] - c[0], i.pos[1] - c[1]) <= tol).sort((a, b) => Math.hypot(a.pos[0] - c[0], a.pos[1] - c[1]) - Math.hypot(b.pos[0] - c[0], b.pos[1] - c[1]))[0];
    if (!it) continue;
    opnHit++;
    if (!t.width || Math.abs(it.size[0] - t.width) <= 50) opnWidth++;
  }
  const count = re => fl.items.filter(i => re.test(i.productId)).length;
  const metrics = {
    regions: summary.regions.length,
    walls: stats.walls, rooms: stats.rooms, areaM2: stats.areaM2,
    named: fl.rooms.filter(r => r.name).length, unmatched: stats.unmatchedNames.length,
    openEnds: stats.openEnds.length, tiny: fl.rooms.filter(r => r.area < 1.5).length,
    dimFit: ends ? Math.round(100 * hit / ends) : null, dimEnds: ends,
    areaOk, areaAll: labels.length,
    opnAll: truth.length, opnHit, opnWidth,
    doors: count(/^door-/), windows: count(/^window-/), passes: count(/^opening-pass/), columns: cols.length,
    guessed: !!stats.guessed, ms,
  };
  return { path, summary, project, stats, metrics, areaRows };
}

// 방향이 있는 지표: 값이 이쪽으로 가면 나빠진 것이다(벽·방 수 같은 나머지는 바뀌면 알리기만 한다).
export const WORSE = { named: -1, unmatched: +1, openEnds: +1, tiny: +1, dimFit: -1, areaOk: -1, opnHit: -1, opnWidth: -1 };
