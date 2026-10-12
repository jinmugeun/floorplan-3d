// 역할 판정용 특징 덤프(2026-10-12 · 계획 12 Task 9 ⓐ): node tools/dxf-corpus/roles-dump.mjs [--public] [--only <id>]… [--out <dir>]
// 도면마다 `<out>/<id>.dump.json` 하나 — 레이어·블록·문자 표본의 **이름과 통계**만 담는다(좌표·도형은 없다). 이 파일을 사람(드라이런)이나
// 언어 모델(llm-roles.mjs)이 읽고 역할표(`<id>.json` · 형식은 src/io/dxf/roles.js · README "역할표")를 쓴다.
// 왜 덤프가 따로인가: 모델에게 DXF를 통째로 줄 수 없고(수십 MB), 판정에 필요한 것은 이름 + 그 이름이 실은 도형의 모양(선 수·길이 분포·색·
// 블록 크기)뿐이다 — 신상중 `WID`가 창이라는 근거는 이름이 아니라 "청록 · 평행 짝"이었다.
//  - 기본: 실파일 넷(corpus.json — sadong · sinsang-B · sinsang-A · naegok, ../dxf · DXF_DIR). `--public`: 공개 39쌍의 원본(../dxf-public ·
//    DXF_PUBLIC_DIR · 캐시만 — 받지 않는다). `--only`는 id(실파일) 또는 파일 이름 전체(공개, 예 "2suite (1)")이고 여러 번 줄 수 있다.
//  - 기본 출력 폴더는 저장소 밖 ../dxf-roles/dumps다(도면 내용이 든 파일을 저장소에 넣지 않는다).
// 레이어 행과 현재 역할은 **앱과 같은 워커**(역할표 없이)로 낸다 — 덤프의 currentRole이 앱이 지금 고르는 역할이다.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { APP, corpus, fileOf, worker, explodeRaw } from './lib.mjs';
import { blockKindByName } from '../../src/io/dxf/blockOpenings.js';

const TEXT_MAX = 150;       // 문자 표본 상한(서로 다른 글자)
const NEAR = 3000;          // 도면 상자 바깥 여유(mm) — lib.runDrawing의 치수·면적 "도면 안" 판정과 같다
const TEXT_LIKE = new Set(['text', 'other', 'wall', 'rail']);   // 실명이 놓이는 레이어 역할(toProject.NAME_TIER와 같다)

const argv = process.argv.slice(2);
const values = f => argv.flatMap((a, i) => (a === f && argv[i + 1] != null && !argv[i + 1].startsWith('--') ? [argv[i + 1]] : []));
const pub = argv.includes('--public');
const only = values('--only');
if (argv.includes('--only') && !only.length) { console.log('--only에 값이 없다'); process.exit(2); }
const outDir = resolve(values('--out')[0] ?? resolve(APP, '../dxf-roles/dumps'));
const PUBLIC_DIR = process.env.DXF_PUBLIC_DIR ?? resolve(APP, '../dxf-public');

// 할 일: [{ id, path, region }].
function jobs() {
  if (pub) {
    if (!existsSync(PUBLIC_DIR)) return [];
    return readdirSync(PUBLIC_DIR).filter(n => /^\d+suite \(\d+\)\.dxf$/i.test(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      .map(n => ({ id: n.replace(/\.dxf$/i, ''), path: resolve(PUBLIC_DIR, n), region: 0 }));
  }
  return corpus().map(e => ({ id: e.id, path: fileOf(e), region: e.region ?? 0 }));
}

const r1 = v => Math.round(v * 10) / 10;
const quant = (xs, q) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return r1(s[Math.min(s.length - 1, Math.floor(q * s.length))]); };

async function dump(job) {
  const handle = await worker();
  const raw = readFileSync(job.path);
  const fileName = job.path.split(/[\\/]/).pop();
  const parsed = handle({ type: 'parse', buf: raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), fileName });
  if (parsed.type !== 'parsed') return { error: parsed.code ?? 'parse' };
  const { summary } = parsed;
  const k = summary.unitScale ?? 1;
  // 도면 상자(앱과 같은 도면 후보 — region): 추출이 낸 벽 상자(mm). 추출이 실패하면 상자 없이(모든 문자가 "도면 밖") 간다.
  const exd = handle({ type: 'extract', opts: { layers: summary.checked, region: job.region, trace: false } });
  const plan = exd.type === 'extracted'
    ? { x0: exd.stats.origin[0] - exd.stats.size[0] / 2 - NEAR, x1: exd.stats.origin[0] + exd.stats.size[0] / 2 + NEAR, y0: exd.stats.origin[1] - exd.stats.size[1] / 2 - NEAR, y1: exd.stats.origin[1] + exd.stats.size[1] / 2 + NEAR }
    : null;
  const inPlan = p => !!plan && p[0] * k >= plan.x0 && p[0] * k <= plan.x1 && p[1] * k >= plan.y0 && p[1] * k <= plan.y1;
  const ex = await explodeRaw(raw);

  // ── 레이어: 워커의 행(역할표 없이 — 지금 규칙의 역할) + 선 길이 분포(mm)
  const lens = new Map();
  for (const s of ex.segs) (lens.get(s.layer) ?? lens.set(s.layer, []).get(s.layer)).push(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) * k);
  const layers = summary.layers.map(r => ({
    name: r.name, color: Math.abs(r.color), on: !r.off, segs: r.segs, arcs: r.arcs, texts: r.texts, dims: r.dims, inserts: r.inserts,
    medianLen: quant(lens.get(r.name) ?? [], 0.5), p90Len: quant(lens.get(r.name) ?? [], 0.9),
    currentRole: r.role, guessed: !!r.guessed, ...(r.byColor ? { byColor: true } : {}),
  }));

  // ── 블록: 이름마다 INSERT 수, 첫 INSERT 하나가 거느린 도형(자손 INSERT 포함)의 선·호 수와 그 INSERT 로컬 축의 상자 크기(mm).
  const ins = ex.inserts ?? [];
  const first = new Map();
  ins.forEach((it, i) => { if (!first.has(it.name)) first.set(it.name, i); });
  const stat = new Map([...first.keys()].map(n => [n, { segs: 0, arcs: 0, lo: [Infinity, Infinity], hi: [-Infinity, -Infinity] }]));
  const owners = i => { const out = []; for (let c = i, n = 0; c != null && c >= 0 && n < 32; c = ins[c]?.parent, n++) if (ins[c] && first.get(ins[c].name) === c) out.push(c); return out; };
  const add = (c, p, what) => {
    const it = ins[c], st = stat.get(it.name), r = (it.rot ?? 0) * Math.PI / 180;
    const u = [Math.cos(r), Math.sin(r)], v = [-Math.sin(r), Math.cos(r)];
    const lx = p[0] * u[0] + p[1] * u[1], ly = p[0] * v[0] + p[1] * v[1];
    st.lo = [Math.min(st.lo[0], lx), Math.min(st.lo[1], ly)]; st.hi = [Math.max(st.hi[0], lx), Math.max(st.hi[1], ly)];
    if (what) st[what]++;
  };
  for (const s of ex.segs) if (s.ins != null) for (const c of owners(s.ins)) { add(c, s.a, 'segs'); add(c, s.b, null); }
  for (const a of [...(ex.arcs ?? []), ...(ex.polyArcs ?? [])]) if (a.ins != null) for (const c of owners(a.ins)) add(c, a.c, 'arcs');
  const count = new Map();
  for (const it of ins) count.set(it.name, (count.get(it.name) ?? 0) + 1);
  const blocks = [...first.keys()].map(name => {
    const st = stat.get(name), has = st.hi[0] >= st.lo[0];
    return { name, inserts: count.get(name), segs: st.segs, arcs: st.arcs, bboxW: has ? Math.round((st.hi[0] - st.lo[0]) * k) : 0, bboxH: has ? Math.round((st.hi[1] - st.lo[1]) * k) : 0, currentKind: blockKindByName(name) };
  }).sort((a, b) => b.inserts - a.inserts || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  // ── 문자 표본: 서로 다른 글자 ≤ TEXT_MAX. 앞 계급이 먼저 — ① 도면 안 · 블록 밖 · 실명 레이어(문자·기타·벽·난간) · 20자 이하 · 숫자뿐이 아님
  // ② 도면 안의 나머지(숫자뿐 제외) ③ 도면 밖 · 블록 밖 · 실명 레이어 ④ 나머지. 계급 안은 높이 큰 순 → 글자 순.
  const role = new Map(summary.layers.map(r => [r.name, r.role]));
  const byText = new Map();
  for (const t of ex.texts) {
    const text = String(t.text ?? '').trim();
    if (!text) continue;
    const g = byText.get(text) ?? byText.set(text, { text, count: 0, heights: [], layers: new Map(), inBlock: true, inPlan: false }).get(text);
    g.count++; g.heights.push(t.h * k);
    g.layers.set(t.layer, (g.layers.get(t.layer) ?? 0) + 1);
    if (t.ins == null) g.inBlock = false;
    if (inPlan(t.p)) g.inPlan = true;
  }
  const numeric = s => /^[\d.,\s+\-×xX()]*$/.test(s);
  const tier = g => {
    const layer = [...g.layers].sort((a, b) => b[1] - a[1])[0][0];
    g.layer = layer;
    const named = !g.inBlock && TEXT_LIKE.has(role.get(layer)) && g.text.length <= 20 && !numeric(g.text);
    if (g.inPlan) return named ? 0 : numeric(g.text) ? 3 : 1;
    return named ? 2 : 3;
  };
  const texts = [...byText.values()].map(g => ({ g, t: tier(g), h: quant(g.heights, 0.5) }))
    .sort((a, b) => a.t - b.t || b.h - a.h || (a.g.text < b.g.text ? -1 : a.g.text > b.g.text ? 1 : 0))
    .slice(0, TEXT_MAX)
    .map(({ g, h }) => ({ text: g.text, height: h, layer: g.layer, inBlock: g.inBlock, count: g.count }));

  return {
    meta: { id: job.id, file: fileName, region: job.region, insunits: summary.insunits, unitScale: k, totalSegs: ex.segs.length,
      layers: layers.length, blocks: blocks.length, distinctTexts: byText.size, textSample: texts.length, planBox: !!plan },
    layers, blocks, texts,
  };
}

const list = jobs().filter(j => !only.length || only.includes(j.id));
if (!list.length) { console.log(`해당 도면 없음${only.length ? `: ${only.join(', ')}` : ''}`); process.exit(2); }
mkdirSync(outDir, { recursive: true });
let failed = 0;
for (const j of list) {
  if (!j.path) { console.log(`${j.id}  (파일 없음)`); continue; }
  const d = await dump(j);
  if (d.error) { failed++; console.log(`${j.id}  오류 ${d.error}`); continue; }
  const out = resolve(outDir, `${j.id}.dump.json`);
  writeFileSync(out, JSON.stringify(d, null, 1) + '\n');
  console.log(`${j.id}  레이어 ${d.layers.length} · 블록 ${d.blocks.length} · 문자 ${d.texts.length}/${d.meta.distinctTexts} → ${out}`);
}
process.exit(failed ? 1 : 0);
