// DXF 파이프라인 전체가 도는 워커(§18.1 · §18.9). 메인 스레드는 40 MB를 2~4 s 동안 막을 수 없다.
// **전개 결과는 여기 남는다**: 레이어 체크가 바뀌면 extract만 다시 돈다(재파싱 없음 · 실측 ≈ 0.4 s).
// 취소는 메인의 terminate() 한 줄이므로 여기에 취소 플래그를 두지 않는다.
// 이 파일과 그 import 사슬은 DOM·ui를 건드리지 않는다(문구는 코드로만 보내고 ui/messages.js가 옮긴다).
import { decodeDxf, DxfError } from './decode.js';
import { parseDxf, headerNum } from './parse.js';
import { explode } from './explode.js';
import { layerStats, defaultChecked, roleLayers } from './classify.js';
import { largestCluster } from './faces.js';
import { extractWalls } from './walls.js';
import { buildProject, unitScale, drawingTitle } from './toProject.js';
import { buildOpenings } from './openings.js';
import { DXF_PARAMS } from './params.js';

const HUGE_EXTENTS = 10_000_000;   // 10 km — 여러 장이 한 파일에 흩어져 있다는 신호(§18.5)
let doc = null, ex = null, rows = null, meta = null;
const post = (msg, transfer = []) => self.postMessage(msg, transfer);
// blocks를 함께 보낸다: 진행 막대 2단계가 "도면 해석 중 (블록 N개)"이라 파싱이 끝나기 전에도 N이 필요하다.
const progress = (phase, pct) => post({ type: 'progress', phase, pct, blocks: doc?.counts?.blocks ?? 0 });
const inBox = (p, b) => !b || (p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1);

function doParse(buf, fileName) {
  progress('decode', 0);
  const t0 = performance.now();
  const { txt, ver, codepage, encoding } = decodeDxf(buf);
  const tDecode = performance.now() - t0;
  const t1 = performance.now();
  doc = parseDxf(txt, { onProgress: p => progress('parse', p) });
  const tParse = performance.now() - t1;
  const t2 = performance.now();
  ex = explode(doc, { arcSteps: 12, onProgress: p => progress('explode', p) });
  const tExplode = performance.now() - t2;
  rows = layerStats(doc, ex);
  const live = new Set(rows.filter(r => !r.off).map(r => r.name));
  const roi = largestCluster(ex.segs.filter(s => live.has(s.layer)));   // 연결성 기반(C-7)
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const s of ex.segs) for (const p of [s.a, s.b]) {
    bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]);
    by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]);
  }
  const insunits = headerNum(doc.header, '$INSUNITS', 70, 0);
  const u = unitScale(insunits, roi ? Math.max(roi.x1 - roi.x0, roi.y1 - roi.y0) : 0);
  // 제목·방 이름은 **꺼진 레이어의 문자도 쓴다**: 이 도면의 실명은 꺼진 TEXT2에 들어 있다.
  const texts = ex.texts.filter(t => inBox(t.p, roi));
  // 제목 후보는 역할이 text·other인 레이어뿐이다(사전 검토 I-6 — 높이만 보면 급식기구의
  // 지시선 라벨 '퇴식동선'(h 1,725)이 제목 '경산 사동중'(레이어 T · h 980)을 이긴다).
  const titleLayers = new Set(rows.filter(r => r.role === 'text' || r.role === 'other').map(r => r.name));
  meta = { fileName, scale: u.scale, roi, live, titleLayers };
  post({ type: 'parsed', summary: {
    ver, codepage, encoding, insunits, unitScale: u.scale, unitsGuessed: u.guessed,
    layers: rows, checked: [...defaultChecked(rows)],
    blocks: doc.counts.blocks, blocksUsed: doc.counts.blocksUsed, entities: doc.counts.entities,
    segs: ex.segs.length, arcs: ex.arcs.length, texts: ex.texts.length,
    others: [...ex.others], skipped: [...ex.skipped],
    title: drawingTitle(texts, fileName, titleLayers),
    size: roi ? [Math.round((roi.x1 - roi.x0) * u.scale), Math.round((roi.y1 - roi.y0) * u.scale)] : [0, 0],
    manySheets: Math.max(bx1 - bx0, by1 - by0) * u.scale > HUGE_EXTENTS,
    ms: { decode: Math.round(tDecode), parse: Math.round(tParse), explode: Math.round(tExplode) },
  } });
}

function doExtract(opts = {}) {
  if (!ex) throw new DxfError('not-dxf');
  const t0 = performance.now();
  progress('walls', 0);
  const openRole = roleLayers(rows, 'opening');
  const r = extractWalls(ex, {
    wallLayers: new Set(opts.layers ?? []),
    openFaceLayers: opts.useOpeningFaces === false ? new Set() : openRole,
    liveLayers: meta.live,
    thickness: opts.thickness ?? DXF_PARAMS.thickness,
  });
  const tWalls = performance.now() - t0;
  if (!r.walls.length) throw new DxfError('no-walls');
  progress('rooms', 0);
  const t1 = performance.now();
  const texts = ex.texts.filter(t => inBox(t.p, r.roi));
  // 단위는 **사람이 이긴다**(§18.5): 대화상자의 셀렉트가 보낸 배율이 $INSUNITS 추정을 덮는다.
  const scale = Number(opts.scale) > 0 ? Number(opts.scale) : meta.scale;
  const built = buildProject(r.walls, {
    height: opts.height ?? DXF_PARAMS.height,
    scale, texts, fileName: meta.fileName, titleLayers: meta.titleLayers,
    autoNames: opts.autoNames !== false,
    // 개구부는 두 재료를 함께 쓴다: 스윙 호(ex.arcs)와 **벽 틈**(r.gaps · 사전 검토 C-2).
    openings: opts.openings === false ? () => [] : ({ walls, toApp }) =>
      buildOpenings({ ex, walls, toApp, scale, openingLayers: openRole, gaps: r.gaps }),
  });
  const tRooms = performance.now() - t1;
  // 트레이스는 **ROI 안 · 꺼지지 않은 레이어를 전부** 그린다(체크 여부와 무관): 사람이 이어야 할
  // 경계(식당·조리실의 배식대)가 체크 해제된 급식기구 레이어에 있기 때문이다(§18.6).
  let trace = null, tTrace = 0;
  if (opts.trace !== false) {
    progress('trace', 0);
    const t2 = performance.now();
    const keep = ex.segs.filter(s => meta.live.has(s.layer) && inBox(s.a, r.roi) && inBox(s.b, r.roi));
    const arr = new Float32Array(keep.length * 4);
    let i = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of keep) {
      const a = built.toApp(s.a), b = built.toApp(s.b);
      arr[i++] = a[0]; arr[i++] = a[1]; arr[i++] = b[0]; arr[i++] = b[1];
      x0 = Math.min(x0, a[0], b[0]); x1 = Math.max(x1, a[0], b[0]);
      y0 = Math.min(y0, a[1], b[1]); y1 = Math.max(y1, a[1], b[1]);
    }
    trace = { segs: arr, box: [x0, y0, x1, y1] };
    tTrace = performance.now() - t2;
  }
  const stats = {
    ...built.stats, guessed: r.guessed, guessedLayers: [...r.guessedLayers],
    hist: r.hist.slice(0, 10).map(([mm, len]) => [mm, Math.round(len)]),
    ms: { walls: Math.round(tWalls), rooms: Math.round(tRooms), trace: Math.round(tTrace) },
  };
  post({ type: 'extracted', project: built.project, stats, trace }, trace ? [trace.segs.buffer] : []);
}

// 메시지는 둘뿐이다. **취소 메시지는 없다**(사전 검토 M-3): client.cancel()이 terminate()만 부르고
// `{ type: 'cancel' }`을 보내는 호출자가 없어 그 분기는 죽은 코드였다(§18.9의 "취소 플래그를 두지
// 않는다"가 곧 이 뜻이다).
self.onmessage = ev => {
  const m = ev.data ?? {};
  try {
    if (m.type === 'parse') doParse(m.buf, m.fileName ?? '');
    else if (m.type === 'extract') doExtract(m.opts);
  } catch (e) {
    // 문구는 보내지 않는다(ui/messages.js의 DXF_ERRORS[code]가 정본이다 — 워커는 ui/를 모른다).
    post({ type: 'error', code: e instanceof DxfError ? e.code : 'oom', message: String(e?.message ?? e) });
  }
};
