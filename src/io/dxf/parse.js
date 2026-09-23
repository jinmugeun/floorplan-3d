// DXF 섹션 스캐너(§18.1). 프로토타입 `dxf-parse.mjs`의 parseDxf를 옮기면서 **두 패스**를 더했다.
//
// 왜 두 패스인가: 실파일은 블록 정의 1,009개에 엔티티 116,821개가 들어 있는데 모델스페이스가
// (전이적으로) 부르는 정의는 174개뿐이다. 1패스에서 엔티티 객체를 만들면 95,630개(81.9 %)를
// 만들자마자 버리게 된다 — 가장 큰 미참조 블록 `급식기구-6`이 혼자 16,370개다. 그래서 1패스는
// 블록마다 **줄 범위와 자식 INSERT 이름만** 적고, ENTITIES를 읽은 뒤 도달한 정의의 줄 구간만
// 다시 파싱한다. 줄 배열은 한 번만 만든다(실파일 498만 줄).
import { buildEntity, pairsToRecord } from './entities.js';

const PROGRESS_LINES = 200000;   // 이 줄 수마다 진행률을 한 번 알린다(워커가 막대를 움직인다)

// 헤더 변수 하나를 숫자로. 없으면 기본값 — $INSUNITS는 코드 70, $EXTMIN/$EXTMAX는 10/20이다.
export function headerNum(header, name, code, dflt = 0) {
  const v = Number(header?.[name]?.[code]);
  return Number.isFinite(v) ? v : dflt;
}

export function parseDxf(txt, { onProgress = () => {} } = {}) {
  const lines = txt.split('\n');
  const N = lines.length;
  // 줄 끝 CR 하나만 떼어 낸다(파일이 CRLF든 LF든 같은 결과). 코드 줄만 trim한다 —
  // 값 줄(레이어 이름·블록 이름·문자)은 앞뒤 공백까지가 데이터다.
  const at = i => { const s = lines[i] ?? ''; return s.charCodeAt(s.length - 1) === 13 ? s.slice(0, -1) : s; };
  const code = i => at(i).trim();

  // 다음 0 코드 전까지 (code, value) 평면 배열을 모은다 → [pairs, 다음 0의 줄 번호].
  // HEADER는 변수 하나가 코드 9로 시작하고 **0이 아니라 다음 9에서 끝난다** — `stopAt9`를 켜지 않으면
  // 첫 변수($ACADVER)의 readPairs가 ENDSEC까지 전부 삼켜 헤더 변수가 1개만 남는다(사전 검토 C-1:
  // 실파일에서 `$INSUNITS`가 0으로 읽혀 `unitsGuessed`가 거짓으로 켜졌다).
  const readPairs = (start, stopAt9 = false) => {
    const out = [];
    let j = start;
    while (j + 1 < N) {
      const c = code(j);
      if (c === '0' || (stopAt9 && c === '9')) break;
      const n = +c;
      out.push(Number.isNaN(n) ? -1 : n, at(j + 1));
      j += 2;
    }
    return [out, j];
  };
  // 값을 모으지 않고 다음 0까지 건너뛴다(미참조 후보의 블록 엔티티에 쓴다 — 배열도 만들지 않는다)
  const skipPairs = start => { let j = start; while (j + 1 < N && code(j) !== '0') j += 2; return j; };

  // [from, to) 줄 구간의 엔티티를 만든다. POLYLINE은 뒤따르는 VERTEX를 SEQEND까지 모은다.
  const parseEntities = (from, to) => {
    const out = [];
    let i = from, poly = null;
    while (i + 1 < to) {
      if (code(i) !== '0') { i += 2; continue; }
      const t = at(i + 1).trim();
      const [pairs, j] = readPairs(i + 2);
      if (t === 'SEQEND') poly = null;
      else if (t === 'VERTEX' && poly) {
        const v = buildEntity('VERTEX', pairs);
        poly.pts.push([v.x ?? 0, v.y ?? 0]);
        poly.bulges.push(v.yscale ?? 0);   // VERTEX의 코드 42(bulge)는 buildEntity에서 yscale 슬롯이다
      } else if (t === 'POLYLINE') {
        poly = buildEntity('POLYLINE', pairs);
        poly.pts = []; poly.bulges = []; poly.closed = !!(poly.flags & 1);
        out.push(poly);
      } else if (t) {
        poly = null;
        out.push(buildEntity(t, pairs));
      }
      i = j;
    }
    return out;
  };

  const header = {}, layers = new Map(), blocks = new Map();
  let section = null, sub = null, block = null;
  let entFrom = -1, entTo = -1, tick = PROGRESS_LINES, i = 0;
  onProgress(0);
  while (i + 1 < N) {
    if (i >= tick) { tick = i + PROGRESS_LINES; onProgress(i / N); }
    const c = code(i);
    if (c !== '0') {
      if (section === 'HEADER' && c === '9') {
        const [p, j] = readPairs(i + 2, true);          // 다음 코드 9(또는 0 ENDSEC)에서 멈춘다
        header[at(i + 1).trim()] = pairsToRecord(p);
        i = j; continue;
      }
      i += 2; continue;
    }
    const t = at(i + 1).trim();
    if (t === 'SECTION') { section = at(i + 3).trim(); sub = null; if (section === 'ENTITIES') entFrom = i + 4; i += 4; continue; }
    if (t === 'ENDSEC') { if (section === 'ENTITIES') entTo = i; section = null; block = null; i += 2; continue; }
    if (t === 'EOF') break;
    if (section === 'TABLES') {
      if (t === 'TABLE') { sub = at(i + 3).trim(); i += 4; continue; }
      if (t === 'ENDTAB') { sub = null; i += 2; continue; }
      const [p, j] = readPairs(i + 2);
      if (t === 'LAYER' && sub === 'LAYER') {
        const r = pairsToRecord(p);
        // color < 0 = 꺼짐 · flags & 1 = 동결. 둘 다 §18.2의 기본 체크에서 빠지는 근거다.
        layers.set(r[2], { name: r[2], color: +(r[62] ?? 7), ltype: r[6] ?? '', flags: +(r[70] ?? 0), lw: +(r[370] ?? -3) });
      }
      i = j; continue;
    }
    if (section === 'BLOCKS') {
      if (t === 'BLOCK') {
        const [p, j] = readPairs(i + 2);
        const r = pairsToRecord(p);
        block = { name: r[2] ?? '', layer: r[8] ?? '0', flags: +(r[70] ?? 0), base: [+(r[10] ?? 0), +(r[20] ?? 0)], start: j, end: j, inserts: new Set(), entities: [] };
        blocks.set(block.name, block);
        i = j; continue;
      }
      if (t === 'ENDBLK') { if (block) { block.end = i; block = null; } i = skipPairs(i + 2); continue; }
      // 1패스: 엔티티 객체를 만들지 않는다. 자식 INSERT의 이름(코드 2)만 모아 폐포를 닫는다.
      if (t === 'INSERT' && block) {
        const [p, j] = readPairs(i + 2);
        for (let k = 0; k < p.length; k += 2) if (p[k] === 2) { block.inserts.add(p[k + 1]); break; }
        i = j; continue;
      }
      i = skipPairs(i + 2); continue;
    }
    i = skipPairs(i + 2);
  }

  // 2패스: 모델스페이스 INSERT에서 시작해 블록 참조의 전이 폐포를 닫고, 도달한 정의만 파싱한다.
  const entities = entFrom >= 0 && entTo > entFrom ? parseEntities(entFrom, entTo) : [];
  const reached = new Set();
  const stack = entities.filter(e => e.type === 'INSERT' && e.name).map(e => e.name);
  while (stack.length) {
    const n = stack.pop();
    if (reached.has(n) || !blocks.has(n)) continue;
    reached.add(n);
    for (const m of blocks.get(n).inserts) if (!reached.has(m)) stack.push(m);
  }
  let blockEntities = 0;
  for (const name of reached) {
    const b = blocks.get(name);
    b.entities = parseEntities(b.start, b.end);
    blockEntities += b.entities.length;
  }
  onProgress(1);
  return { header, layers, blocks, entities, counts: { blocks: blocks.size, blocksUsed: reached.size, entities: entities.length, blockEntities } };
}
