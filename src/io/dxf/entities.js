// DXF 엔티티 한 개를 (code, value) 쌍 목록에서 만든다(§18.1). 프로토타입 `dxf-parse.mjs`의
// buildEntity를 옮긴 것이고 **함정도 그대로 옮긴다**: VERTEX의 코드 42(bulge)는 INSERT의 y 배율과
// 같은 코드라 여기서는 `yscale` 슬롯에 들어간다 — 읽는 쪽(parse.js)이 그 자리에서 꺼낸다.
// 쌍 목록을 쓰는 이유: DXF는 같은 코드가 여러 번 반복되는 형식이라(LWPOLYLINE의 10/20)
// 코드 → 값 맵으로 먼저 접으면 정점이 사라진다.
// MLINE(이중선 · 2026-10-06)도 같다: 정점(11/21)마다 방향(12/22)·마이터(13/23)·요소별 파라미터(74 개수 → 41 값들)가 반복된다.

// 테이블 레코드·헤더 변수처럼 반복이 없는 자리는 맵으로 접는다(같은 코드의 **첫** 값만 남긴다).
export function pairsToRecord(pairs) {
  const r = {};
  for (let k = 0; k < pairs.length; k += 2) if (r[pairs[k]] === undefined) r[pairs[k]] = pairs[k + 1];
  return r;
}

// MTEXT 서식 코드를 지운다: 줄바꿈 `\P`, 글꼴·문단 지시자 `\fArial|b0;`·`\pxi-3;`, 묶음 `{}`.
// 방 이름 매칭(§18.4)과 도면 제목이 이 문자열을 그대로 쓰므로 한 곳에서만 씻는다.
export const mtextPlain = s => String(s ?? '')
  .replace(/\\P/g, ' ')
  .replace(/\\[A-Za-z][^;\\]*;/g, '')
  .replace(/[{}]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

export function buildEntity(type, pairs) {
  const e = { type };
  const pts = [], bulges = [], chunks = [];
  let last = -1;
  // MLINE만 11/21·13/23·41·70의 뜻이 바뀐다(정점·마이터·요소 파라미터·정렬). 다른 타입은 아래 else 갈래 그대로다.
  const ml = type === 'MLINE' ? { verts: [], dirs: [], miters: [], params: [] } : null;
  for (let k = 0; k < pairs.length; k += 2) {
    const c = pairs[k], v = pairs[k + 1];
    switch (c) {
      case 1: e.text = v; break;
      case 2: e.name = v; break;
      case 3: if (type === 'MTEXT') chunks.push(v); else e.style = v; break;
      case 5: e.handle = v; break;
      case 6: e.ltype = v; break;
      case 8: e.layer = v; break;
      // LWPOLYLINE만 10/20이 반복된다. 나머지 타입에서는 하나뿐인 기준점이다.
      case 10: if (type === 'LWPOLYLINE') { pts.push([+v, 0]); last = pts.length - 1; } else e.x = +v; break;
      case 20: if (type === 'LWPOLYLINE') { if (last >= 0) pts[last][1] = +v; } else e.y = +v; break;
      case 30: e.z = +v; break;
      case 11: if (ml) { ml.verts.push([+v, 0]); ml.dirs.push([0, 0]); ml.miters.push([0, 0]); ml.params.push([]); } else e.x2 = +v; break;
      case 21: if (ml) { if (ml.verts.length) ml.verts[ml.verts.length - 1][1] = +v; } else e.y2 = +v; break;
      case 12: if (ml && ml.dirs.length) ml.dirs[ml.dirs.length - 1][0] = +v; break;
      case 22: if (ml && ml.dirs.length) ml.dirs[ml.dirs.length - 1][1] = +v; break;
      // DIMENSION의 두 측정점(연장선이 시작하는 자리) — 설계자가 실제로 재는 선을 가리킨다(면적 기준선의 근거).
      case 13: if (ml) { if (ml.miters.length) ml.miters[ml.miters.length - 1][0] = +v; } else e.x3 = +v; break;
      case 23: if (ml) { if (ml.miters.length) ml.miters[ml.miters.length - 1][1] = +v; } else e.y3 = +v; break;
      case 14: e.x4 = +v; break;
      case 24: e.y4 = +v; break;
      case 40: e.r = +v; break;            // ARC/CIRCLE 반지름 · TEXT/MTEXT 글자 높이
      case 41: if (ml) { const el = ml.params[ml.params.length - 1]?.at(-1); if (el) el.push(+v); } else e.xscale = +v; break;
      case 42: if (type === 'LWPOLYLINE') { bulges[last] = +v; } else e.yscale = +v; break;
      case 43: e.zscale = +v; break;
      case 50: e.a0 = +v; break;           // ARC 시작각 · INSERT 회전 · TEXT 회전
      case 51: e.a1 = +v; break;
      case 62: e.color = +v; break;
      case 67: e.paper = +v === 1; break;  // 페이퍼스페이스(실파일은 0개)
      case 70: if (ml) e.just = +v; else e.flags = +v; break;            // MLINE: 70 정렬 · 71 플래그(2 = 닫힘)
      case 71: if (ml) e.flags = +v; break;
      case 72: if (ml) e.nVerts = +v; break;
      case 73: if (ml) e.nElems = +v; break;
      case 74: if (ml && ml.params.length) ml.params[ml.params.length - 1].push([]); break;   // 요소 하나를 연다(뒤따르는 41이 그 값들)
      case 90: e.n = +v; break;
      default: break;
    }
  }
  if (type === 'LWPOLYLINE') { e.pts = pts; e.bulges = bulges; e.closed = !!(e.flags & 1); }
  if (ml) Object.assign(e, { verts: ml.verts, dirs: ml.dirs, miters: ml.miters, params: ml.params, closed: !!((e.flags ?? 0) & 2) });
  if (type === 'MTEXT') e.text = mtextPlain(chunks.join('') + (e.text ?? ''));
  return e;
}
