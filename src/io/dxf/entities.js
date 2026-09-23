// DXF 엔티티 한 개를 (code, value) 쌍 목록에서 만든다(§18.1). 프로토타입 `dxf-parse.mjs`의
// buildEntity를 옮긴 것이고 **함정도 그대로 옮긴다**: VERTEX의 코드 42(bulge)는 INSERT의 y 배율과
// 같은 코드라 여기서는 `yscale` 슬롯에 들어간다 — 읽는 쪽(parse.js)이 그 자리에서 꺼낸다.
// 쌍 목록을 쓰는 이유: DXF는 같은 코드가 여러 번 반복되는 형식이라(LWPOLYLINE의 10/20)
// 코드 → 값 맵으로 먼저 접으면 정점이 사라진다.

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
      case 11: e.x2 = +v; break;
      case 21: e.y2 = +v; break;
      case 40: e.r = +v; break;            // ARC/CIRCLE 반지름 · TEXT/MTEXT 글자 높이
      case 41: e.xscale = +v; break;
      case 42: if (type === 'LWPOLYLINE') { bulges[last] = +v; } else e.yscale = +v; break;
      case 43: e.zscale = +v; break;
      case 50: e.a0 = +v; break;           // ARC 시작각 · INSERT 회전 · TEXT 회전
      case 51: e.a1 = +v; break;
      case 62: e.color = +v; break;
      case 67: e.paper = +v === 1; break;  // 페이퍼스페이스(실파일은 0개)
      case 70: e.flags = +v; break;
      case 90: e.n = +v; break;
      default: break;
    }
  }
  if (type === 'LWPOLYLINE') { e.pts = pts; e.bulges = bulges; e.closed = !!(e.flags & 1); }
  if (type === 'MTEXT') e.text = mtextPlain(chunks.join('') + (e.text ?? ''));
  return e;
}
